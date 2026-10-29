import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { CATALOG } from '../src/erp/catalog.ts';
import { createErpApp, type SaleConfirmed } from '../services/erp/app.ts';
import { createWahaSimApp } from '../services/waha/app.ts';
import { erpEnv, wahaEnv } from '../services/shared/env.ts';

const json = (body: unknown, headers: Record<string, string> = {}): RequestInit =>
  ({ method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const order = { opportunityId: 'opp-1', product: 'hof', unit: 'sp', contact: { name: 'Ana Lima', phone: '(11) 98765-0001', email: 'ana.lima@example.com' } };
const seatsOf = async (app: { request: (p: string) => Response | Promise<Response> }, product: string, unit: string) =>
  ((await (await app.request('/api/catalog')).json()) as { product: string; unit: string; seatsLeft: number }[]).find((c) => c.product === product && c.unit === unit)?.seatsLeft;

test('ERP: an order is paid, takes a seat and tells the core about the sale', async () => {
  const sent: SaleConfirmed[] = [];
  const app = createErpApp({ notifyCore: async (sale) => { sent.push(sale); } });
  const before = CATALOG.find((c) => c.product === 'hof' && c.unit === 'sp')!.seatsLeft;
  assert.equal(await seatsOf(app, 'hof', 'sp'), before);

  assert.equal((await app.request('/api/orders', json(order))).status, 401, 'no token');
  const created = await app.request('/api/orders', json(order, { 'x-erp-token': erpEnv().token }));
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { orderId: 'ERP-ORD-0001', status: 'pending_payment' });
  assert.equal(await seatsOf(app, 'hof', 'sp'), before, 'seat is only taken on payment');

  const paid = await app.request('/api/orders/ERP-ORD-0001/pay', { method: 'POST' });
  assert.equal(paid.status, 200);
  const body = (await paid.json()) as { status: string; saleId: string };
  assert.equal(body.status, 'paid');
  assert.equal(await seatsOf(app, 'hof', 'sp'), before - 1);

  assert.equal(sent.length, 1);
  assert.deepEqual({ ...sent[0], confirmedAt: 'x' }, {
    type: 'sale_confirmed', saleId: body.saleId, confirmedAt: 'x', opportunityId: 'opp-1', product: 'hof', unit: 'sp',
    name: 'Ana Lima', phone: '(11) 98765-0001', email: 'ana.lima@example.com',
  });
  assert.ok(!Number.isNaN(Date.parse(sent[0]!.confirmedAt)));

  const again = await app.request('/api/orders/ERP-ORD-0001/pay', { method: 'POST' });
  assert.equal(again.status, 409, 'paying twice is refused');
  assert.equal(await seatsOf(app, 'hof', 'sp'), before - 1);
  assert.equal(sent.length, 1);
  assert.equal(((await (await app.request('/api/orders')).json()) as unknown[]).length, 1);
});

test('ERP: rejects bad orders and a paid order whose notice failed is retried without taking another seat', async () => {
  let fail = true;
  const sent: SaleConfirmed[] = [];
  const app = createErpApp({ notifyCore: async (sale) => { if (fail) throw new Error('core fora do ar'); sent.push(sale); } });
  const headers = { 'x-erp-token': erpEnv().token };
  assert.equal((await app.request('/api/orders', json({ ...order, unit: 'rj', product: 'nada' }, headers))).status, 400, 'unknown offer');
  assert.equal((await app.request('/api/orders', json({ ...order, contact: { name: 'Sem contato' } }, headers))).status, 400, 'needs phone or email');
  assert.equal((await app.request('/api/orders/ERP-ORD-0099/pay', { method: 'POST' })).status, 404);

  await app.request('/api/orders', json(order, headers));
  const before = await seatsOf(app, 'hof', 'sp');
  const failed = await app.request('/api/orders/ERP-ORD-0001/pay', { method: 'POST' });
  assert.equal(failed.status, 502);
  assert.equal(await seatsOf(app, 'hof', 'sp'), (before ?? 0) - 1, 'the payment is real even if the notice failed');
  fail = false;
  assert.equal((await app.request('/api/orders/ERP-ORD-0001/pay', { method: 'POST' })).status, 200);
  assert.equal(await seatsOf(app, 'hof', 'sp'), (before ?? 0) - 1);
  assert.equal(sent.length, 1);
});

const noWebhook = async () => {};
const sessions = wahaEnv().sessions;

test('WAHA simulator: sendText needs the API key and keeps the message on the lead phone', async () => {
  const app = createWahaSimApp({ deliverWebhook: noWebhook });
  const msg = { session: 'sp', chatId: '551187650001@c.us', text: 'Olá, Ana!' };
  assert.equal((await app.request('/api/sendText', json(msg))).status, 401, 'no key');
  assert.equal((await app.request('/api/sendText', json(msg, { 'X-Api-Key': 'wrong' }))).status, 401, 'wrong key');
  assert.equal((await app.request('/api/sendText', json({ ...msg, session: 'zz' }, { 'X-Api-Key': wahaEnv().apiKey }))).status, 404, 'unknown session');

  const ok = await app.request('/api/sendText', json(msg, { 'X-Api-Key': wahaEnv().apiKey }));
  assert.equal(ok.status, 201);
  const { id } = (await ok.json()) as { id: string };
  assert.ok(id);
  const phone = (await (await app.request('/api/phones/551187650001')).json()) as { id: string; direction: string; text: string; session: string }[];
  assert.deepEqual(phone.map((m) => [m.id, m.direction, m.session, m.text]), [[id, 'in', 'sp', 'Olá, Ana!']]);

  const nine = (await (await app.request('/api/phones/5511987650001')).json()) as unknown[];
  assert.equal(nine.length, 1, 'the 9-digit form is the same phone');

  const list = (await (await app.request('/api/sessions')).json()) as { name: string; status: string }[];
  assert.deepEqual(list.map((s) => [s.name, s.status]), sessions.map((s) => [s.name, 'WORKING']));
});

test('WAHA simulator: a message from the phone becomes a signed WAHA envelope', async () => {
  const delivered: { raw: string; headers: Record<string, string> }[] = [];
  const app = createWahaSimApp({ deliverWebhook: async (raw, headers) => { delivered.push({ raw, headers }); } });
  const res = await app.request('/api/phones/551187650001/send', json({ session: 'sp', text: 'Oi! Quero saber da turma' }));
  assert.equal(res.status, 200);
  assert.equal(delivered.length, 1);
  const { raw, headers } = delivered[0]!;

  const expected = createHmac('sha512', wahaEnv().hmacKey).update(raw, 'utf8').digest('hex');
  assert.equal(headers['X-Webhook-Hmac'], expected);
  assert.equal(headers['X-Webhook-Hmac-Algorithm'], 'sha512');

  const env = JSON.parse(raw) as { id: string; timestamp: number; event: string; session: string; payload: Record<string, unknown> };
  assert.equal(env.event, 'message');
  assert.equal(env.session, 'sp');
  assert.ok(env.id);
  assert.ok(env.timestamp > 1e12, 'envelope timestamp is in milliseconds');
  const business = sessions.find((s) => s.name === 'sp')!.number;
  assert.deepEqual({ ...env.payload, id: 'x', timestamp: 0 }, {
    id: 'x', timestamp: 0, from: '551187650001@c.us', fromMe: false, to: `${business}@c.us`, body: 'Oi! Quero saber da turma', hasMedia: false,
  });
  assert.ok((env.payload.timestamp as number) < 1e11, 'payload timestamp is in seconds');

  const phone = (await (await app.request('/api/phones/551187650001')).json()) as { direction: string; text: string }[];
  assert.deepEqual(phone.map((m) => [m.direction, m.text]), [['out', 'Oi! Quero saber da turma']]);
});

test('WAHA simulator: validates the phone send and reports a core that did not take the webhook', async () => {
  const app = createWahaSimApp({ deliverWebhook: async () => { throw new Error('core fora do ar'); } });
  assert.equal((await app.request('/api/phones/abc/send', json({ session: 'sp', text: 'oi' }))).status, 400, 'bad number');
  assert.equal((await app.request('/api/phones/551187650001/send', json({ session: 'zz', text: 'oi' }))).status, 404, 'unknown session');
  assert.equal((await app.request('/api/phones/551187650001/send', json({ session: 'sp', text: '' }))).status, 400, 'empty text');
  assert.equal((await app.request('/api/phones/551187650001/send', json({ session: 'sp', text: 'oi' }))).status, 502);
});

test('WAHA simulator: reading a QR returns the message and the business number from the core redirect', async () => {
  const rj = sessions.find((s) => s.name === 'rj')!.number;
  const location = `https://wa.me/${rj}?text=${encodeURIComponent('Olá! Vi o cartaz (cód. K7P2)')}`;
  const app = createWahaSimApp({ deliverWebhook: noWebhook, scanQr: async (code) => (code === 'K7P2' ? location : null) });
  assert.deepEqual(await (await app.request('/api/qr/K7P2')).json(), { code: 'K7P2', number: rj, session: 'rj', text: 'Olá! Vi o cartaz (cód. K7P2)' });
  assert.equal((await app.request('/api/qr/NOPE')).status, 404);
  assert.equal((await app.request('/api/qr/..%2Fx')).status, 400);
});
