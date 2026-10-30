import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/core/db.ts';
import { hashIdentifier, readPii } from '../src/core/pii.ts';
import type { Fetch } from '../src/core/types.ts';
import { createOrder, getOffer } from '../src/erp/client.ts';
import { signMeta, signWaha } from '../src/gateway/signature.ts';
import { getProvider } from '../src/providers/whatsapp/index.ts';
import { createMetaProvider } from '../src/providers/whatsapp/meta.ts';
import { createWahaProvider } from '../src/providers/whatsapp/waha.ts';

interface Call { url: string; init: RequestInit }
function fakeFetch(response: unknown, status = 200): { fn: Fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(response), { status, headers: { 'content-type': 'application/json' } });
  }) as Fetch;
  return { fn, calls };
}
const header = (c: Call, name: string) => new Headers(c.init.headers).get(name);
const bodyOf = (c: Call) => JSON.parse(String(c.init.body)) as Record<string, unknown>;

const SESSIONS = 'sp:551130000001,rj:552130000002,cps:551930000003';
const waha = (fetch: Fetch = fakeFetch({}).fn, hmacKey = 'hmac-test') =>
  createWahaProvider({ url: 'http://waha.test', apiKey: 'waha-key-test', hmacKey, sessions: SESSIONS, fetch });
const wahaEnvelope = (payload: Record<string, unknown> = {}, top: Record<string, unknown> = {}) => ({
  id: 'evt_01', timestamp: 1761750000000, event: 'message', session: 'cps',
  payload: {
    id: 'false_5519977770003@c.us_AAA1', timestamp: 1761750000, from: '5519977770003@c.us', fromMe: false,
    to: '551930000003@c.us', body: 'Oi, quanto custa o curso? (cód. K7P2)', _data: { notifyName: 'Daniel Rocha' }, ...payload,
  },
  ...top,
});

test('WAHA webhooks need the sha512 HMAC of the raw body; an empty key accepts any body', () => {
  const raw = JSON.stringify(wahaEnvelope());
  assert.equal(waha().verify(raw, { 'x-webhook-hmac': signWaha(raw, 'hmac-test') }), true);
  assert.equal(waha().verify(raw, { 'x-webhook-hmac': signWaha(raw, 'other-key') }), false);
  assert.equal(waha().verify(`${raw} `, { 'x-webhook-hmac': signWaha(raw, 'hmac-test') }), false);
  assert.equal(waha().verify(raw, {}), false);
  assert.equal(waha(undefined, '').verify(raw, {}), true);
});

test('WAHA parse reads the phone, maps the session to the business number and keeps the text in the vault', () => {
  const db = openDb();
  const [m] = waha().parse(db, wahaEnvelope(), {});
  const p = m.input.payload;
  assert.equal(m.text, 'Oi, quanto custa o curso? (cód. K7P2)');
  assert.deepEqual([p.businessNumber, p.code, p.provider, p.referral], ['551930000003', 'K7P2', 'waha', null]);
  assert.deepEqual(p.identifiers.map((i) => [i.kind, readPii(db, i.piiRef)]), [['phone', '+5519977770003']]);
  assert.equal(readPii(db, p.textRef), m.text);
  assert.equal(readPii(db, p.displayRef), 'Daniel Rocha');
  assert.equal(m.input.occurredAt, new Date(1761750000 * 1000).toISOString());
  // Provider ids embed the phone number: the log keeps only a keyed hash of them.
  assert.equal(m.input.externalId, hashIdentifier('wa_message', 'false_5519977770003@c.us_AAA1'));
  assert.equal(JSON.stringify(m.input).includes('977770003'), false);
});

test('WAHA parse ignores own messages, other events and groups; reads ms timestamps; payload.to wins over the session', () => {
  const db = openDb();
  const p = waha();
  assert.deepEqual(p.parse(db, wahaEnvelope({ fromMe: true }), {}), []);
  assert.deepEqual(p.parse(db, wahaEnvelope({}, { event: 'message.ack' }), {}), []);
  assert.deepEqual(p.parse(db, wahaEnvelope({ from: '120363000000000000@g.us' }), {}), []);
  assert.deepEqual(p.parse(db, { nope: true }, {}), []);
  const [m] = p.parse(db, wahaEnvelope({ timestamp: 1761750000123, to: '552130000002@c.us', hasMedia: false }), {});
  assert.equal(m.input.occurredAt, new Date(1761750000123).toISOString());
  assert.equal(m.input.payload.businessNumber, '552130000002');
  // The simulator sends no _data: the person simply has no name yet.
  const [bySession] = p.parse(db, wahaEnvelope({ to: undefined, _data: undefined }), {});
  assert.deepEqual([bySession.input.payload.businessNumber, bySession.input.payload.displayRef], ['551930000003', null]);
  assert.deepEqual(p.parse(db, wahaEnvelope({ to: undefined }, { session: 'unknown-session' }), {}), []);
});

test('WAHA sendText posts session, chatId and text with the API key', async () => {
  const f = fakeFetch({ id: 'true_5519977770003@c.us_OUT1' }, 201);
  assert.deepEqual(await waha(f.fn).sendText('5519977770003', 'Olá!', '551930000003'), { externalId: 'true_5519977770003@c.us_OUT1' });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'http://waha.test/api/sendText');
  assert.equal(f.calls[0].init.method, 'POST');
  assert.equal(header(f.calls[0], 'x-api-key'), 'waha-key-test');
  assert.deepEqual(bodyOf(f.calls[0]), { session: 'cps', chatId: '5519977770003@c.us', text: 'Olá!' });
});

test('WAHA refuses a number without session, reports HTTP errors and sends nothing without a URL', async () => {
  await assert.rejects(waha().sendText('5519977770003', 'Olá!', '551199999999'), /nenhuma sessão do WAHA/);
  await assert.rejects(waha(fakeFetch({}, 500).fn).sendText('5519977770003', 'Olá!', '551930000003'), /WAHA respondeu 500/);
  const f = fakeFetch({});
  const offline = createWahaProvider({ url: '', apiKey: 'k', hmacKey: '', sessions: SESSIONS, fetch: f.fn });
  assert.deepEqual(await offline.sendText('5519977770003', 'Olá!', '551930000003'), { externalId: null });
  assert.equal(f.calls.length, 0);
});

const metaBody = (text: string) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp', metadata: { display_phone_number: '551130000001', phone_number_id: 'PNID' },
    contacts: [{ profile: { name: 'Ana Lima' }, wa_id: '551187650001', user_id: 'BR.ANA0001' }],
    messages: [{ from: '551187650001', from_user_id: 'BR.ANA0001', id: 'wamid.T1', timestamp: '1761750000', type: 'text', text: { body: text }, referral: { source_id: 'AD-77', source_type: 'ad', ctwa_clid: 'CLID' } }],
  } }] }],
});
const meta = (fetch: Fetch = fakeFetch({}).fn, accessToken = 'meta-token-test', phoneNumberId = 'PNID-1') =>
  createMetaProvider({ appSecret: 'meta-secret-test', accessToken, phoneNumberId, fetch });

test('Meta webhooks need the sha256 signature; parse keeps referral and BSUID and the text only in the vault', () => {
  const db = openDb();
  const raw = JSON.stringify(metaBody('Oi, vi o anúncio'));
  assert.equal(meta().verify(raw, { 'x-hub-signature-256': signMeta(raw, 'meta-secret-test') }), true);
  assert.equal(meta().verify(raw, { 'x-hub-signature-256': 'sha256=bad' }), false);
  const [m] = meta().parse(db, JSON.parse(raw), {});
  const p = m.input.payload;
  assert.deepEqual(p.referral, { sourceId: 'AD-77', sourceType: 'ad', ctwaClid: 'CLID' });
  assert.deepEqual(p.identifiers.map((i) => i.kind), ['bsuid', 'phone']);
  assert.deepEqual([p.provider, p.businessNumber, readPii(db, p.textRef)], ['meta', '551130000001', 'Oi, vi o anúncio']);
  assert.equal(m.input.externalId, hashIdentifier('wa_message', 'wamid.T1'));
});

test('Meta sendText posts to the Graph API with the bearer token; without credentials it sends nothing', async () => {
  const f = fakeFetch({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.OUT1' }] });
  assert.deepEqual(await meta(f.fn).sendText('5511987650001', 'Olá!', '551130000001'), { externalId: 'wamid.OUT1' });
  assert.equal(f.calls[0].url, 'https://graph.facebook.com/v26.0/PNID-1/messages');
  assert.equal(header(f.calls[0], 'authorization'), 'Bearer meta-token-test');
  assert.deepEqual(bodyOf(f.calls[0]), { messaging_product: 'whatsapp', recipient_type: 'individual', to: '5511987650001', type: 'text', text: { body: 'Olá!' } });
  await assert.rejects(meta(fakeFetch({ error: {} }, 401).fn).sendText('5511987650001', 'Olá!', '551130000001'), /Meta respondeu 401/);
  const off = fakeFetch({});
  assert.deepEqual(await meta(off.fn, '').sendText('5511987650001', 'Olá!', '551130000001'), { externalId: null });
  assert.equal(off.calls.length, 0);
});

test('getProvider picks the provider by name and refuses unknown names', () => {
  assert.equal(getProvider('meta').name, 'meta');
  assert.equal(getProvider('waha').name, 'waha');
  assert.throws(() => getProvider('telegram'), /provedor de WhatsApp desconhecido/);
});

test('the ERP client reads the local catalog without ERP_URL and calls the ERP with the token when set', async () => {
  const none = fakeFetch({});
  assert.equal((await getOffer('hof', 'sp', { url: '', fetch: none.fn }))?.seatsLeft, 3);
  assert.equal(await getOffer('hof', 'online', { url: '', fetch: none.fn }), null);
  const local = await createOrder({ opportunityId: 'O1', product: 'hof', unit: 'sp', contact: { name: null, phone: null, email: null } }, { url: '', fetch: none.fn });
  assert.match(local.orderId, /^LOCAL-\d+$/);
  assert.equal(none.calls.length, 0);

  const catalog = fakeFetch([{ product: 'hof', unit: 'sp', name: 'Harmonização Facial', price: 7900, seatsLeft: 1, nextClass: '2026-11-14' }]);
  assert.equal((await getOffer('hof', 'sp', { url: 'http://erp.test', token: 'erp-token-test', fetch: catalog.fn }))?.seatsLeft, 1);
  assert.equal(catalog.calls[0].url, 'http://erp.test/api/catalog');
  assert.equal(header(catalog.calls[0], 'x-erp-token'), 'erp-token-test');

  const order = fakeFetch({ orderId: 'ERP-ORD-0001', status: 'pending_payment' }, 201);
  const contact = { name: 'Ana Lima', phone: '+5511987650001', email: 'ana.lima@example.com' };
  assert.deepEqual(await createOrder({ opportunityId: 'O9', product: 'hof', unit: 'sp', contact }, { url: 'http://erp.test', token: 'erp-token-test', fetch: order.fn }), { orderId: 'ERP-ORD-0001' });
  assert.equal(order.calls[0].url, 'http://erp.test/api/orders');
  assert.equal(header(order.calls[0], 'x-erp-token'), 'erp-token-test');
  assert.deepEqual(bodyOf(order.calls[0]), { opportunityId: 'O9', product: 'hof', unit: 'sp', contact });
  await assert.rejects(getOffer('hof', 'sp', { url: 'http://erp.test', fetch: fakeFetch({}, 503).fn }), /ERP respondeu 503/);
});
