import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES, SECRETS } from '../src/config.ts';
import { appendAndProject } from '../src/core/apply.ts';
import { openDb, type Db } from '../src/core/db.ts';
import { ingest } from '../src/core/ingest.ts';
import { readPii, toIdentifier } from '../src/core/pii.ts';
import { allOpportunities } from '../src/core/queries.ts';
import { rebuild } from '../src/core/replay.ts';
import { getState } from '../src/core/state.ts';
import { signWaha } from '../src/gateway/signature.ts';
import { getProvider } from '../src/providers/whatsapp/index.ts';
import { createApp } from '../src/server.ts';

const R = DEFAULT_RULES;
const TEXT = 'Estou com uma dúvida particular sobre o curso';
function setup(): Db {
  const db = openDb();
  appendAndProject(db, { source: 'seed', externalId: 'ep:cps-wa', type: 'entry_point_registered', occurredAt: '2026-09-01T12:00:00Z', actor: 'seed', payload: { code: 'cps-whatsapp-principal-01', unit: 'cps', kind: 'whatsapp', label: 'WhatsApp de Campinas', owner: 'atendimento-cps', status: 'released', product: null, businessNumber: '551930000003' } }, R);
  appendAndProject(db, { source: 'seed', externalId: 'ep:sp-lp', type: 'entry_point_registered', occurredAt: '2026-09-01T12:00:00Z', actor: 'seed', payload: { code: 'sp-lp-hof-01', unit: 'sp', kind: 'lp', label: 'LP de SP', owner: 'marketing', status: 'released', product: 'hof', businessNumber: null } }, R);
  return db;
}
const envelope = (id: string, text: string) => ({
  id: `evt_${id}`, timestamp: 1761750000000, event: 'message', session: 'cps',
  payload: { id, timestamp: 1761750000, from: '5519977770003@c.us', fromMe: false, to: '551930000003@c.us', body: text, _data: { notifyName: 'Daniel Rocha' } },
});
const count = (db: Db, sql: string) => (db.prepare(sql).get() as { n: number }).n;

test('a received message opens the conversation and a message row; the text lives only in the vault', async () => {
  const db = setup();
  const [m] = getProvider('waha').parse(db, envelope('false_5519977770003@c.us_M1', TEXT), {});
  await ingest(db, m.input, R, { text: m.text });
  const s = getState(db, R);
  assert.equal(s.conversations.length, 1);
  assert.deepEqual([s.conversations[0].businessNumber, s.conversations[0].mode, s.conversations[0].lastAt], ['551930000003', 'ai', m.input.occurredAt]);
  const inbound = s.messages.filter((x) => x.direction === 'in');
  assert.deepEqual(inbound.map((x) => [x.personId, x.businessNumber, x.actor]), [[s.conversations[0].personId, '551930000003', 'person']]);
  const ref = (db.prepare("SELECT text_ref FROM messages WHERE direction = 'in'").get() as { text_ref: string }).text_ref;
  assert.equal(readPii(db, ref), TEXT);
  const log = (db.prepare('SELECT external_id || payload AS t FROM events').all() as { t: string }[]).map((r) => r.t).join('\n');
  assert.equal(log.includes('dúvida particular'), false);
  assert.equal(JSON.stringify(s).includes('dúvida particular'), false);
});

test('sent messages, mode changes, ERP orders and sales project deterministically', () => {
  const db = setup();
  const form = appendAndProject(db, { source: 'form', externalId: 'f1', type: 'form_submitted', occurredAt: '2026-10-29T17:00:00Z', actor: 'system', payload: { entryPoint: 'sp-lp-hof-01', identifiers: [toIdentifier(db, 'phone', '(11) 98765-0001')!], displayRef: null, utm: {}, clickIds: { fbclid: 'F' }, test: false } }, R).event!;
  const personId = `P${form.seq}`;
  const opportunityId = `O${form.seq}`;
  assert.deepEqual([allOpportunities(db)[0].stage, allOpportunities(db)[0].erpOrderId], ['new', null]);
  const ev = (externalId: string, type: string, actor: string, payload: object) =>
    appendAndProject(db, { source: 'tool', externalId, type, occurredAt: '2026-10-29T17:10:00Z', actor, payload } as never, R);
  ev('sent1', 'whatsapp_message_sent', 'attendant:joana', { personId, businessNumber: '551130000001', textRef: 'pii_0000000000000001', provider: 'waha', externalId: null, basedOn: [{ tool: 'get_course_offer', readAt: '2026-10-29T17:09:00Z' }] });
  ev('mode1', 'conversation_mode_changed', 'attendant:joana', { personId, businessNumber: '551130000001', mode: 'human', reason: 'atendente assumiu' });
  ev('stage1', 'opportunity_stage_changed', 'attendant:joana', { opportunityId, stage: 'proposal', reason: 'proposta enviada' });
  let s = getState(db, R);
  assert.deepEqual(s.conversations.map((c) => [c.personId, c.mode, c.lastAt]), [[personId, 'human', '2026-10-29T17:10:00.000Z']]);
  assert.deepEqual(s.messages.map((m) => [m.direction, m.actor, m.basedOn.map((b) => b.tool)]), [['out', 'attendant:joana', ['get_course_offer']]]);
  assert.equal(s.opportunities[0].stage, 'proposal');
  ev('order1', 'erp_order_created', 'attendant:joana', { opportunityId, orderId: 'LOCAL-1', product: 'hof', unit: 'sp' });
  assert.deepEqual([allOpportunities(db)[0].stage, allOpportunities(db)[0].erpOrderId], ['pre_enrollment', 'LOCAL-1']);
  appendAndProject(db, { source: 'erp', externalId: 'sale:S1', type: 'erp_sale_confirmed', occurredAt: '2026-10-29T18:00:00Z', actor: 'system', payload: { saleId: 'S1', opportunityId, identifiers: [toIdentifier(db, 'phone', '(11) 98765-0001')!], displayRef: null, product: 'hof', unit: 'sp' } }, R);
  s = getState(db, R);
  assert.deepEqual([s.opportunities[0].status, s.opportunities[0].stage, s.opportunities[0].erpSaleId], ['won', 'won', 'S1']);
  const before = JSON.stringify(s);
  rebuild(db, R);
  assert.equal(JSON.stringify(getState(db, R)), before);
  assert.equal(count(db, 'SELECT COUNT(*) AS n FROM quarantine'), 0);
});

test('only the conversation route returns the text; the WAHA webhook checks the HMAC first', async () => {
  const { app } = createApp({ openFresh: () => openDb() });
  const raw = JSON.stringify(envelope('false_5519977770003@c.us_M2', TEXT));
  const post = (headers: Record<string, string>) => app.request('/webhooks/whatsapp/waha', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: raw });
  assert.equal((await post({ 'x-webhook-hmac': signWaha(raw, 'wrong') })).status, 401);
  const ok = await post({ 'x-webhook-hmac': signWaha(raw, SECRETS.wahaWebhookHmacKey) });
  assert.deepEqual(await ok.json(), { received: 1, duplicates: 0 });
  assert.equal((await (await app.request('/api/state')).text()).includes('dúvida particular'), false);
  const list = (await (await app.request('/api/conversations')).json()) as { personId: string; businessNumber: string; name: string | null; mode: string }[];
  assert.deepEqual(list.map((c) => [c.businessNumber, c.name, c.mode]), [['551930000003', 'Daniel Rocha', 'ai']]);
  assert.equal(JSON.stringify(list).includes('dúvida particular'), false);
  const detail = (await (await app.request(`/api/conversations/${list[0].personId}/551930000003`)).json()) as { messages: { direction: string; text: string | null }[] };
  assert.equal(detail.messages.find((x) => x.direction === 'in')?.text, TEXT);
  assert.equal((await app.request(`/api/conversations/${list[0].personId}/551199999999`)).status, 404);
});
