import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.ERP_URL = 'http://erp.test';
process.env.WAHA_URL = 'http://waha.test';
const { createApp } = await import('../src/server.ts');
const { openDb } = await import('../src/core/db.ts');
const { SECRETS } = await import('../src/config.ts');
const { createErpApp } = await import('../services/erp/app.ts');
const { createWahaSimApp } = await import('../services/waha/app.ts');
const { CATALOG } = await import('../src/erp/catalog.ts');
const { default: Database } = await import('better-sqlite3');

const post = (body?: unknown, headers = {}): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

function circuit() {
  const erp = createErpApp({ notifyCore: async (sale) => {
    const res = await core.app.request('/webhooks/erp', post(sale, { 'x-erp-token': SECRETS.erpToken }));
    assert.equal(res.status, 200);
  } });
  const waha = createWahaSimApp({ deliverWebhook: async (raw, headers) => {
    assert.equal((await core.app.request('/webhooks/whatsapp/waha', { method: 'POST', headers, body: raw })).status, 200);
  } });
  const core = createApp({ openFresh: () => openDb(), fetch: (async (url, init) => {
    const target = new URL(String(url));
    return (target.hostname === 'erp.test' ? erp : waha).request(target.pathname, init);
  }) as typeof fetch });
  return { core, erp, waha };
}

test('core reset restores ERP and WAHA so the same live sale can win twice', async () => {
  const { core, erp, waha } = circuit();
  try {
    for (let run = 0; run < 2; run++) {
      assert.equal((await waha.request('/api/phones/551187650001/send', post({ session: 'sp', text: 'Quero a turma de harmonização' }))).status, 200);
      const opp = core.getDb().prepare("SELECT id FROM opportunities WHERE product = 'hof' AND unit = 'sp'").get() as { id: string };
      assert.ok(opp);
      const enrolled = await core.app.request('/tools/request_enrollment', post({ opportunityId: opp.id }, { 'x-actor': 'attendant:joana' }));
      assert.equal(enrolled.status, 200);
      assert.equal((await erp.request('/api/orders/ERP-ORD-0001/pay', post())).status, 200);
      assert.equal((core.getDb().prepare('SELECT stage FROM opportunities WHERE id = ?').get(opp.id) as { stage: string }).stage, 'won');
      assert.deepEqual(await (await core.app.request('/api/reset', post())).json(), { ok: true });
      assert.deepEqual(await (await erp.request('/api/orders')).json(), []);
      assert.deepEqual(await (await erp.request('/api/catalog')).json(), CATALOG);
      assert.deepEqual(await (await waha.request('/api/phones/551187650001')).json(), []);
    }
  } finally { core.getDb().close(); }
});

test('service resets require their existing credentials', async () => {
  const { core, erp, waha } = circuit();
  try {
    for (const app of [erp, waha]) {
      assert.equal((await app.request('/api/reset', post())).status, 401);
      assert.equal((await app.request('/api/reset', post(undefined, { 'x-erp-token': 'wrong', 'X-Api-Key': 'wrong' }))).status, 401);
    }
  } finally { core.getDb().close(); }
});

test('ERP reset discards pending notifications before the retry timer runs', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const db = new Database(':memory:');
  t.after(() => db.close());
  let attempts = 0;
  const erp = createErpApp({ db, notifyCore: async () => { attempts++; throw new Error('unavailable'); } });
  await erp.request('/api/orders', post({ opportunityId: 'pending-sale', product: 'hof', unit: 'sp', contact: { phone: '551187650001' } }, { 'x-erp-token': SECRETS.erpToken }));
  assert.equal((await erp.request('/api/orders/ERP-ORD-0001/pay', post())).status, 502);
  assert.equal((await erp.request('/api/reset', post(undefined, { 'x-erp-token': SECRETS.erpToken }))).status, 200);
  t.mock.timers.tick(2000);
  assert.equal(attempts, 1);
  assert.deepEqual(await (await erp.request('/api/orders')).json(), []);
  assert.deepEqual(await (await erp.request('/api/catalog')).json(), CATALOG);
});

test('core reset reports downstream failures while still clearing its own state', async () => {
  for (const failure of ['http', 'network']) {
    const core = createApp({ openFresh: () => openDb(), fetch: (async (url) => {
      if (String(url).startsWith('http://erp.test')) {
        if (failure === 'network') throw new Error('unavailable');
        return new Response('', { status: 503 });
      }
      return Response.json({ ok: true });
    }) as typeof fetch });
    try {
      const before = (core.getDb().prepare('SELECT count(*) AS n FROM opportunities').get() as { n: number }).n;
      await core.app.request('/api/simulate/ana-meta-form', post());
      const reset = await core.app.request('/api/reset', post());
      assert.equal(reset.status, 200);
      assert.deepEqual(await reset.json(), { ok: true, failedServices: ['erp'] });
      assert.equal((core.getDb().prepare('SELECT count(*) AS n FROM opportunities').get() as { n: number }).n, before);
    } finally { core.getDb().close(); }
  }
});

test('scripted Ana sale follows her ERP order after a different live sale', async () => {
  const { core, erp } = circuit();
  try {
    await erp.request('/api/orders', post({ opportunityId: 'other-live-sale', product: 'hof', unit: 'rj', contact: { phone: '5521988880002' } }, { 'x-erp-token': SECRETS.erpToken }));
    await erp.request('/api/orders/ERP-ORD-0001/pay', post());
    for (const id of ['ana-meta-form', 'ana-whatsapp', 'atendente-pre-matricula-ana', 'ana-erp-sale']) {
      assert.equal((await core.app.request(`/api/simulate/${id}`, post())).status, 200);
    }
    const ana = core.getDb().prepare("SELECT stage, erp_order_id FROM opportunities WHERE unit = 'sp' AND product = 'hof'").get() as { stage: string; erp_order_id: string };
    assert.equal(ana.erp_order_id, 'ERP-ORD-0002');
    assert.equal(ana.stage, 'won');
  } finally { core.getDb().close(); }
});

test('scenario response identifies a duplicate event without changing HTTP status', async () => {
  const { core } = circuit();
  try {
    await core.app.request('/api/simulate/ana-meta-form', post());
    const repeated = await core.app.request('/api/simulate/ana-meta-form', post());
    assert.equal(repeated.status, 200);
    assert.deepEqual(await repeated.json(), { ok: true, status: 200, duplicate: true });
    await core.app.request('/api/simulate/carla-whatsapp-code', post());
    const whatsapp = await core.app.request('/api/simulate/carla-whatsapp-duplicate', post());
    assert.equal(whatsapp.status, 200);
    assert.deepEqual(await whatsapp.json(), { ok: true, status: 200, duplicate: true });
  } finally { core.getDb().close(); }
});
