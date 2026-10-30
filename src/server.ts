import { randomUUID } from 'node:crypto';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { CAMPAIGN_SPEND } from '../scenarios/fixtures.ts';
import { seed } from '../scenarios/seed.ts';
import { steps } from '../scenarios/steps.ts';
import { DEFAULT_RULES, ERP_URL, SECRETS, WAHA_URL } from './config.ts';
import type { Db } from './core/db.ts';
import type { ApplyResult } from './core/apply.ts';
import { ingest } from './core/ingest.ts';
import { InvalidEventError } from './core/log.ts';
import { getGuide } from './core/guide.ts';
import { getLink } from './core/queries.ts';
import { previewRules, rebuild } from './core/replay.ts';
import { getCampaigns, getConversationDetail, getPipeline, getState, listConversations } from './core/state.ts';
import type { Fetch, ProviderName, Rules } from './core/types.ts';
import { getCatalog } from './erp/client.ts';
import { erpBodySchema, parseErp } from './gateway/erp.ts';
import { formBodySchema, parseForm } from './gateway/form.ts';
import { generateLink, linkRequestSchema } from './gateway/links.ts';
import { safeEqual } from './gateway/signature.ts';
import { getProvider } from './providers/whatsapp/index.ts';
import { callTool } from './tools/registry.ts';

// fetch reaches the ERP and the WhatsApp provider; inject one to run the circuit in process.
// erpUrl overrides ERP_URL for the catalog route (tests); empty means offline.
export interface AppOptions { openFresh: () => Db; rules?: Rules; fetch?: Fetch; erpUrl?: string }

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

  // An event the log refuses (time or payload) is the caller's input: 400, not 500. Anything else stays a 500.
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    if (err instanceof InvalidEventError) return c.json({ error: err.message.slice(0, 200) }, 400);
    console.error(err);
    return c.json({ error: 'erro interno' }, 500);
  });

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
  app.get('/api/pipeline', (c) => c.json(getPipeline(db)));
  app.get('/api/campaigns', async (c) => c.json(await getCampaigns(db, CAMPAIGN_SPEND, io)));
  app.get('/api/conversations/:personId/:businessNumber', (c) => {
    const detail = getConversationDetail(db, c.req.param('personId'), c.req.param('businessNumber'));
    return detail ? c.json(detail) : c.json({ error: 'conversa não encontrada' }, 404);
  });
  // Same shape as the ERP's own catalog, read through the ERP client (the local catalog when offline).
  app.get('/api/catalog', async (c) => {
    try {
      return c.json(await getCatalog({ fetch: io, ...(opts.erpUrl !== undefined ? { url: opts.erpUrl } : {}) }));
    } catch (err) {
      console.error(`core: catálogo indisponível: ${err instanceof Error ? err.message : String(err)}`);
      return c.json({ error: err instanceof Error ? err.message : 'catálogo indisponível' }, 502);
    }
  });
  app.get('/api/guide', (c) => c.json(getGuide(db)));
  app.get('/api/steps', (c) => c.json(steps.map((s) => ({ id: s.id, who: s.who, label: s.label, ran: ran.has(s.id) }))));

  app.post('/api/simulate/:stepId', async (c) => {
    const step = steps.find((s) => s.id === c.req.param('stepId'));
    if (!step) return c.json({ error: 'passo desconhecido' }, 404);
    const req = step.build({ db });
    const res = await app.request(req.path, { method: req.method, headers: req.headers, body: req.body });
    ran.add(step.id);
    const result = await res.json().catch(() => null) as { duplicate?: boolean; duplicates?: number } | null;
    const duplicate = result?.duplicate === true || (result?.duplicates ?? 0) > 0;
    return c.json({ ok: res.status < 400, status: res.status, ...(duplicate ? { duplicate: true } : {}) });
  });

  app.post('/api/reset', async (c) => {
    const failedServices: string[] = [];
    // Reset is idempotent. One attempt per service, bounded to five seconds; the next click may retry.
    // Drain downstream work before reseeding the core so old sale notifications cannot reach the new seed.
    const services: { name: string; url: string; headers: Record<string, string> }[] = [
      { name: 'erp', url: ERP_URL, headers: { 'x-erp-token': SECRETS.erpToken } },
      { name: 'waha', url: WAHA_URL, headers: { 'X-Api-Key': SECRETS.wahaApiKey } },
    ];
    for (const service of services) {
      if (!service.url) continue;
      try {
        const res = await io(`${service.url.replace(/\/$/, '')}/api/reset`, {
          method: 'POST', headers: service.headers, signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        failedServices.push(service.name);
        console.error(`core: reset de ${service.name} falhou; confira o serviço e tente recomeçar novamente`);
      }
    }
    db.close();
    db = opts.openFresh();
    rules = initialRules();
    seed(db, rules);
    ran.clear();
    return c.json({ ok: true, ...(failedServices.length ? { failedServices } : {}) });
  });

  app.post('/api/replay', async (c) => {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { windowDays?: unknown; apply?: unknown };
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
