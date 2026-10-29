import { randomUUID } from 'node:crypto';
import { Hono, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { seed } from '../scenarios/seed.ts';
import { steps } from '../scenarios/steps.ts';
import { DEFAULT_RULES, SECRETS } from './config.ts';
import type { Db } from './core/db.ts';
import { ingest } from './core/ingest.ts';
import { getLink } from './core/queries.ts';
import { previewRules, rebuild } from './core/replay.ts';
import { getState } from './core/state.ts';
import type { Rules } from './core/types.ts';
import { erpBodySchema, parseErp } from './gateway/erp.ts';
import { formBodySchema, parseForm } from './gateway/form.ts';
import { generateLink, linkRequestSchema } from './gateway/links.ts';
import { safeEqual, verifyMetaSignature } from './gateway/signature.ts';
import { parseWhatsAppWebhook } from './gateway/whatsapp.ts';
import { callTool } from './tools/registry.ts';

export interface AppOptions { openFresh: () => Db; rules?: Rules }

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
  const app = new Hono();

  const checkOccurredAt: MiddlewareHandler = async (c, next) => {
    const header = c.req.header('x-occurred-at');
    if (header !== undefined && !isoTime.safeParse(header).success) return c.json({ error: 'x-occurred-at inválido' }, 400);
    await next();
  };
  for (const path of ['/r/*', '/tools/*', '/api/links']) app.use(path, checkOccurredAt);

  app.use('/webhooks/*', bodyLimit({ maxSize: 100 * 1024, onError: (c) => c.json({ error: 'corpo grande demais' }, 413) }));

  app.post('/webhooks/whatsapp', async (c) => {
    const raw = await c.req.text();
    if (!verifyMetaSignature(raw, c.req.header('x-hub-signature-256'), SECRETS.whatsappAppSecret)) return c.json({ error: 'assinatura inválida' }, 401);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return c.json({ error: 'json inválido' }, 400);
    }
    const results = parseWhatsAppWebhook(db, body).map((m) => ingest(db, m.input, rules, { text: m.text }));
    return c.json({ received: results.length, duplicates: results.filter((r) => r.duplicate).length });
  });

  app.post('/webhooks/forms', async (c) => {
    const parsed = formBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'formulário inválido' }, 400);
    const input = parseForm(db, parsed.data);
    if (!input) return c.json({ error: 'informe telefone ou e-mail' }, 400);
    const r = ingest(db, input, rules);
    return c.json({ ok: r.error === null, duplicate: r.duplicate });
  });

  app.post('/webhooks/erp', async (c) => {
    if (!safeEqual(c.req.header('x-erp-token') ?? '', SECRETS.erpToken)) return c.json({ error: 'token inválido' }, 401);
    const parsed = erpBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'evento do ERP inválido' }, 400);
    const input = parseErp(db, parsed.data);
    if (!input) return c.json({ error: 'informe telefone ou e-mail' }, 400);
    const r = ingest(db, input, rules);
    return c.json({ ok: r.error === null, duplicate: r.duplicate });
  });

  app.get('/r/:code', (c) => {
    const link = getLink(db, c.req.param('code').toUpperCase());
    if (!link) return c.text('código desconhecido', 404);
    ingest(db, { source: 'qr', externalId: randomUUID(), type: 'qr_scanned', occurredAt: when(c.req.header('x-occurred-at')), actor: 'system', payload: { code: link.code } }, rules);
    return c.redirect(link.destination, 302);
  });

  app.post('/tools/:name', async (c) => {
    const r = callTool(db, c.req.param('name'), await c.req.json().catch(() => ({})), c.req.header('x-actor') ?? '', rules, when(c.req.header('x-occurred-at')));
    return c.json(r, r.ok ? 200 : 400);
  });

  app.get('/api/state', (c) => c.json(getState(db, rules)));
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
