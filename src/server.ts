import { randomUUID } from 'node:crypto';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { seed } from '../scenarios/seed.ts';
import { steps } from '../scenarios/steps.ts';
import { DEFAULT_RULES, SECRETS } from './config.ts';
import type { Db } from './core/db.ts';
import type { ApplyResult } from './core/apply.ts';
import { ingest } from './core/ingest.ts';
import { getLink } from './core/queries.ts';
import { previewRules, rebuild } from './core/replay.ts';
import { getConversationDetail, getState, listConversations } from './core/state.ts';
import type { Fetch, ProviderName, Rules } from './core/types.ts';
import { erpBodySchema, parseErp } from './gateway/erp.ts';
import { formBodySchema, parseForm } from './gateway/form.ts';
import { generateLink, linkRequestSchema } from './gateway/links.ts';
import { safeEqual } from './gateway/signature.ts';
import { getProvider } from './providers/whatsapp/index.ts';
import { callTool } from './tools/registry.ts';

// fetch reaches the ERP and the WhatsApp provider; inject one to run the circuit in process.
export interface AppOptions { openFresh: () => Db; rules?: Rules; fetch?: Fetch }

const isoTime = z.iso.datetime({ offset: true });

export function createApp(opts: AppOptions) {
  const initialRules = (): Rules => ({ ...(opts.rules ?? DEFAULT_RULES) });
  let rules = initialRules();
  let db = opts.openFresh();
  seed(db, rules);
  const ran = new Set<string>();
  // x-occurred-at exists only for the simulation: it lets fictitious scenarios keep their own clock.
  // The middleware below guarantees that, when present, it is an ISO 8601 time with timezone.
  const when = (header: string | undefined) => header ?? new Date().toISOString();
  const io = opts.fetch ?? fetch;
  const app = new Hono();

  const checkOccurredAt: MiddlewareHandler = async (c, next) => {
    const header = c.req.header('x-occurred-at');
    if (header !== undefined && !isoTime.safeParse(header).success) return c.json({ error: 'x-occurred-at inválido' }, 400);
    await next();
  };
  for (const path of ['/r/*', '/tools/*', '/api/links']) app.use(path, checkOccurredAt);

  app.use('/webhooks/*', bodyLimit({ maxSize: 100 * 1024, onError: (c) => c.json({ error: 'corpo grande demais' }, 413) }));

  // The signature is checked on the raw body, before any JSON parsing.
  const whatsappWebhook = (name: ProviderName) => async (c: Context) => {
    const provider = getProvider(name, io);
    const raw = await c.req.text();
    const headers = c.req.header();
    if (!provider.verify(raw, headers)) return c.json({ error: 'assinatura inválida' }, 401);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return c.json({ error: 'json inválido' }, 400);
    }
    const results: ApplyResult[] = [];
    // One at a time and in order: each reply must see the messages before it.
    for (const m of provider.parse(db, body, headers)) results.push(await ingest(db, m.input, rules, { text: m.text }, io));
    return c.json({ received: results.length, duplicates: results.filter((r) => r.duplicate).length });
  };
  app.post('/webhooks/whatsapp/meta', whatsappWebhook('meta'));
  app.post('/webhooks/whatsapp/waha', whatsappWebhook('waha'));
  app.post('/webhooks/whatsapp', whatsappWebhook('meta'));

  app.post('/webhooks/forms', async (c) => {
    const parsed = formBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'formulário inválido' }, 400);
    const input = parseForm(db, parsed.data);
    if (!input) return c.json({ error: 'informe telefone ou e-mail' }, 400);
    const r = await ingest(db, input, rules, {}, io);
    return c.json({ ok: r.error === null, duplicate: r.duplicate });
  });

  app.post('/webhooks/erp', async (c) => {
    if (!safeEqual(c.req.header('x-erp-token') ?? '', SECRETS.erpToken)) return c.json({ error: 'token inválido' }, 401);
    const parsed = erpBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'evento do ERP inválido' }, 400);
    const input = parseErp(db, parsed.data);
    if (!input) return c.json({ error: 'informe telefone ou e-mail' }, 400);
    const r = await ingest(db, input, rules, {}, io);
    return c.json({ ok: r.error === null, duplicate: r.duplicate });
  });

  app.get('/r/:code', async (c) => {
    const link = getLink(db, c.req.param('code').toUpperCase());
    if (!link) return c.text('código desconhecido', 404);
    await ingest(db, { source: 'qr', externalId: randomUUID(), type: 'qr_scanned', occurredAt: when(c.req.header('x-occurred-at')), actor: 'system', payload: { code: link.code } }, rules);
    return c.redirect(link.destination, 302);
  });

  app.post('/tools/:name', async (c) => {
    const r = await callTool(db, c.req.param('name'), await c.req.json().catch(() => ({})), c.req.header('x-actor') ?? '', rules, when(c.req.header('x-occurred-at')), io);
    return c.json(r, r.ok ? 200 : 400);
  });

  app.get('/api/state', (c) => c.json(getState(db, rules)));
  app.get('/api/conversations', (c) => c.json(listConversations(db)));
  app.get('/api/conversations/:personId/:businessNumber', (c) => {
    const detail = getConversationDetail(db, c.req.param('personId'), c.req.param('businessNumber'));
    return detail ? c.json(detail) : c.json({ error: 'conversa não encontrada' }, 404);
  });
  app.get('/api/steps', (c) => c.json(steps.map((s) => ({ id: s.id, who: s.who, label: s.label, ran: ran.has(s.id) }))));

  app.post('/api/simulate/:stepId', async (c) => {
    const step = steps.find((s) => s.id === c.req.param('stepId'));
    if (!step) return c.json({ error: 'passo desconhecido' }, 404);
    const req = step.build({ db });
    const res = await app.request(req.path, { method: req.method, headers: req.headers, body: req.body });
    ran.add(step.id);
    return c.json({ ok: res.status < 400, status: res.status });
  });

  app.post('/api/reset', (c) => {
    db.close();
    db = opts.openFresh();
    rules = initialRules();
    seed(db, rules);
    ran.clear();
    return c.json({ ok: true });
  });

  app.post('/api/replay', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { windowDays?: unknown; apply?: unknown };
    const windowDays = Number(body.windowDays);
    if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 365) return c.json({ error: 'janela inválida' }, 400);
    const next = { ...rules, attributionWindowDays: windowDays };
    const changes = previewRules(db, next);
    if (body.apply === true) {
      rules = next;
      rebuild(db, rules);
    }
    return c.json({ changes, applied: body.apply === true, rules });
  });

  app.post('/api/links', async (c) => {
    const parsed = linkRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues.map((i) => i.message).join('; ') }, 400);
    try {
      return c.json(generateLink(db, parsed.data, rules, when(c.req.header('x-occurred-at'))));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  return { app, getDb: () => db };
}
