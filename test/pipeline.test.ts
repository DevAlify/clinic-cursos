import { test } from 'node:test';
import assert from 'node:assert/strict';

// Config is read once at import: point WAHA at a fake address before loading the core, so the live
// send path runs end to end against a fake fetch (never the network). ERP_URL stays empty (local catalog).
process.env.WAHA_URL = 'http://waha.test';
const { DEFAULT_RULES } = await import('../src/config.ts');
const { appendAndProject } = await import('../src/core/apply.ts');
const { openDb } = await import('../src/core/db.ts');
const { ingest } = await import('../src/core/ingest.ts');
const { maxSeq } = await import('../src/core/log.ts');
const { hashIdentifier, readPii, toIdentifier } = await import('../src/core/pii.ts');
const { getProvider } = await import('../src/providers/whatsapp/index.ts');
const { getState } = await import('../src/core/state.ts');
const { createApp } = await import('../src/server.ts');
const { callTool } = await import('../src/tools/registry.ts');

type Db = ReturnType<typeof openDb>;
const R = DEFAULT_RULES;
const NOW = '2026-10-29T19:00:00Z';
const SP = '551130000001';

interface Call { url: string; body: Record<string, unknown>; apiKey: string | null }
function fakeWaha() {
  const calls: Call[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)), apiKey: new Headers(init?.headers).get('x-api-key') });
    return new Response(JSON.stringify({ id: `true_5511987650001@c.us_OUT${calls.length}` }), { status: 201 });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

function setup(): Db {
  const db = openDb();
  const point = (code: string, unit: 'sp', kind: string, product: string | null, businessNumber: string | null) =>
    appendAndProject(db, { source: 'seed', externalId: `ep:${code}`, type: 'entry_point_registered', occurredAt: '2026-09-01T12:00:00Z', actor: 'seed', payload: { code, unit, kind, label: code, owner: 'marketing', status: 'released', product, businessNumber } }, R);
  point('sp-lp-hof-01', 'sp', 'lp', 'hof', null);
  point('sp-whatsapp-principal-01', 'sp', 'whatsapp', null, SP);
  return db;
}
// Ana fills the Meta ad form, then writes on WhatsApp from her old-format number.
async function anaConversation(db: Db, waha: ReturnType<typeof fakeWaha>) {
  appendAndProject(db, { source: 'form', externalId: 'f-ana', type: 'form_submitted', occurredAt: '2026-10-29T17:02:00Z', actor: 'system', payload: { entryPoint: 'sp-lp-hof-01', identifiers: [toIdentifier(db, 'phone', '(11) 98765-0001')!], displayRef: null, utm: { source: 'instagram', medium: 'paid_social', campaign: 'sp_hof_captacao_202610' }, clickIds: { fbclid: 'F' }, test: false } }, R);
  const say = async (id: string, text: string, at: string) => {
    const [m] = getProvider('waha', waha.fetch).parse(db, { id: `evt_${id}`, timestamp: Date.parse(at), event: 'message', session: 'sp', payload: { id, timestamp: Date.parse(at) / 1000, from: '551187650001@c.us', fromMe: false, to: `${SP}@c.us`, body: text, hasMedia: false } }, {});
    return ingest(db, m.input, R, { text: m.text }, waha.fetch);
  };
  await say('false_551187650001@c.us_A1', 'Oi! Quero saber da turma de harmonização', '2026-10-29T17:10:00Z');
  const personId = getState(db, R).conversations[0].personId;
  return { personId, opportunityId: getState(db, R).opportunities[0].id, say };
}
const outbound = (db: Db) => getState(db, R).messages.filter((m) => m.direction === 'out');
const textOf = (db: Db, seq: number) => readPii(db, (db.prepare('SELECT text_ref FROM messages WHERE seq = ?').get(seq) as { text_ref: string }).text_ref);

test('the AI answers through the provider with ERP data, and goes silent once a person takes over', async () => {
  const db = setup();
  const waha = fakeWaha();
  const { personId, say } = await anaConversation(db, waha);
  assert.equal(waha.calls.length, 1);
  assert.equal(waha.calls[0].url, 'http://waha.test/api/sendText');
  assert.equal(waha.calls[0].apiKey, 'demo-waha-key');
  assert.deepEqual([waha.calls[0].body.session, waha.calls[0].body.chatId], ['sp', '5511987650001@c.us']);
  const [reply] = outbound(db);
  assert.deepEqual([reply.actor, reply.basedOn.map((b) => b.tool)], ['ai:simulated-v1', ['get_course_offer']]);
  assert.match(textOf(db, reply.seq) ?? '', /tem 3 vagas \(consultado no ERP às 14:10\)/);
  const sent = db.prepare("SELECT payload FROM events WHERE type = 'whatsapp_message_sent'").get() as { payload: string };
  assert.equal(JSON.parse(sent.payload).externalId, hashIdentifier('wa_message', 'true_5511987650001@c.us_OUT1'));
  assert.equal(sent.payload.includes('consultado'), false);

  assert.equal((await callTool(db, 'set_conversation_mode', { personId, businessNumber: SP, mode: 'human', reason: 'atendente assume' }, 'attendant:joana', R, NOW, waha.fetch)).ok, true);
  await say('false_551187650001@c.us_A2', 'E qual o horário das aulas?', '2026-10-29T19:05:00Z');
  assert.equal(outbound(db).length, 1);
  assert.equal(waha.calls.length, 1);
});

test('attendants reply and change the mode; the AI cannot use these tools', async () => {
  const db = setup();
  const waha = fakeWaha();
  const { personId } = await anaConversation(db, waha);
  const input = { personId, businessNumber: SP, text: 'Oi, Ana! Separei uma vaga para você.' };
  assert.match(String((await callTool(db, 'reply_to_conversation', input, 'ai:simulated-v1', R, NOW, waha.fetch) as { error: string }).error), /permissão negada/);
  assert.match(String((await callTool(db, 'set_conversation_mode', { personId, businessNumber: SP, mode: 'human', reason: 'x' }, 'ai:simulated-v1', R, NOW, waha.fetch) as { error: string }).error), /permissão negada/);
  assert.equal((await callTool(db, 'reply_to_conversation', input, 'attendant:joana', R, NOW, waha.fetch)).ok, true);
  const last = outbound(db).at(-1)!;
  assert.deepEqual([last.actor, textOf(db, last.seq)], ['attendant:joana', input.text]);
  assert.equal(waha.calls.at(-1)?.body.text, input.text);
  const missing = await callTool(db, 'reply_to_conversation', { ...input, businessNumber: '552130000002' }, 'attendant:joana', R, NOW, waha.fetch);
  assert.match(String((missing as { error: string }).error), /conversa .* não encontrada/);
  const mode = { personId, businessNumber: SP, mode: 'human', reason: 'atendente assume' };
  assert.deepEqual((await callTool(db, 'set_conversation_mode', mode, 'attendant:joana', R, NOW, waha.fetch) as { result: { changed: boolean } }).result.changed, true);
  assert.deepEqual((await callTool(db, 'set_conversation_mode', mode, 'attendant:joana', R, NOW, waha.fetch) as { result: { changed: boolean } }).result.changed, false);
});

test('opportunities only move forward, won comes only from the ERP, and lost is final', async () => {
  const db = setup();
  const { opportunityId } = await anaConversation(db, fakeWaha());
  const advance = (stage: string) => callTool(db, 'advance_opportunity', { opportunityId, stage, reason: 'teste' }, 'attendant:joana', R, NOW);
  const error = async (stage: string) => String(((await advance(stage)) as { error?: string }).error);
  assert.equal((await advance('proposal')).ok, true);
  assert.equal(getState(db, R).opportunities[0].stage, 'proposal');
  assert.deepEqual(((await advance('proposal')) as { result: { changed: boolean } }).result.changed, false);
  assert.match(await error('qualifying'), /a etapa só avança/);
  assert.match(await error('won'), /só vem do ERP/);
  assert.equal((await advance('lost')).ok, true);
  assert.equal(getState(db, R).opportunities[0].status, 'lost');
  assert.match(await error('pre_enrollment'), /já está lost/);
  assert.match(String(((await callTool(db, 'advance_opportunity', { opportunityId, stage: 'proposal', reason: 'x' }, 'ai:simulated-v1', R, NOW)) as { error: string }).error), /permissão negada/);
});

test('pre-enrollment creates the ERP order once, with the contact from the vault', async () => {
  const db = setup();
  const { opportunityId } = await anaConversation(db, fakeWaha());
  const enroll = () => callTool(db, 'request_enrollment', { opportunityId }, 'attendant:joana', R, NOW);
  const first = (await enroll()) as { ok: true; result: { orderId: string; recorded: boolean } };
  assert.equal(first.ok, true);
  assert.match(first.result.orderId, /^LOCAL-\d+$/);
  const o = getState(db, R).opportunities[0];
  assert.deepEqual([o.stage, o.erpOrderId], ['pre_enrollment', first.result.orderId]);
  const before = maxSeq(db);
  const again = (await enroll()) as { ok: true; result: { orderId: string; recorded: boolean } };
  assert.deepEqual([again.result.orderId, again.result.recorded, maxSeq(db)], [first.result.orderId, false, before]);
  assert.match(String(((await callTool(db, 'request_enrollment', { opportunityId: 'O404' }, 'attendant:joana', R, NOW)) as { error: string }).error), /O404 não existe/);
});

test('pipeline and campaigns summarize the whole scenario', async () => {
  const waha = fakeWaha();
  const { app } = createApp({ openFresh: () => openDb(), fetch: waha.fetch });
  const steps = (await (await app.request('/api/steps')).json()) as { id: string }[];
  for (const s of steps) assert.equal(((await (await app.request(`/api/simulate/${s.id}`, { method: 'POST' })).json()) as { ok: boolean }).ok, true, s.id);
  const pipeline = (await (await app.request('/api/pipeline')).json()) as Record<string, { name: string | null; erpOrderId: string | null; erpSaleId: string | null; origin: { channel: { value: string } } | null }[]>;
  assert.deepEqual(Object.keys(pipeline), ['new', 'qualifying', 'proposal', 'pre_enrollment', 'won', 'lost']);
  const ana = pipeline.won.find((c) => c.name === 'Ana Lima');
  assert.match(ana?.erpOrderId ?? '', /^LOCAL-\d+$/);
  assert.deepEqual([ana?.erpSaleId, ana?.origin?.channel.value], ['ERP-SALE-1001', 'meta_ads']);
  const campaigns = (await (await app.request('/api/campaigns')).json()) as { campaign: string; unit: string | null; leads: number; won: number; seatsLeft: number | null; spend: number | null; costPerLead: number | null; costPerSale: number | null }[];
  const sp = campaigns.find((c) => c.campaign === 'sp_hof_captacao_202610');
  assert.deepEqual([sp?.unit, sp?.leads, sp?.won, sp?.seatsLeft], ['sp', 1, 1, 3]);
  assert.equal(sp?.costPerSale, sp?.spend);
  const cps = campaigns.find((c) => c.campaign === 'cps_hof_captacao_202610');
  assert.equal(cps?.costPerSale, null);
  assert.equal(cps?.costPerLead, Math.round(((cps?.spend ?? 0) / (cps?.leads ?? 1)) * 100) / 100);
});
