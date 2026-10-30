import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import Database from 'better-sqlite3';
import { createErpApp, type SaleConfirmed } from '../services/erp/app.ts';
import { erpEnv } from '../services/shared/env.ts';
import { DEFAULT_RULES, SECRETS } from '../src/config.ts';
import { appendAndProject } from '../src/core/apply.ts';
import { openDb } from '../src/core/db.ts';
import { toIdentifier } from '../src/core/pii.ts';
import { allOpportunities } from '../src/core/queries.ts';
import { createApp } from '../src/server.ts';

test('ERP retries a pending sale automatically after the core recovers, with one sale and one seat', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const coreDb = openDb();
  const erpDb = new Database(':memory:');
  t.after(() => { coreDb.close(); erpDb.close(); });
  const { app: core } = createApp({ openFresh: () => coreDb });
  const lead = appendAndProject(coreDb, {
    source: 'form', externalId: 'retry-lead', type: 'form_submitted', occurredAt: '2026-10-29T12:00:00Z', actor: 'system',
    payload: {
      entryPoint: 'sp-lp-hof-01', identifiers: [toIdentifier(coreDb, 'phone', '5511987650001')!],
      displayRef: null, utm: {}, clickIds: {}, test: false,
    },
  }, DEFAULT_RULES);
  assert.equal(lead.error, null);
  const opportunityId = `O${lead.event!.seq}`;
  const opportunity = () => allOpportunities(coreDb).find((o) => o.id === opportunityId)!;
  let available = false;
  let loseAcknowledgement = true;
  const attempts: SaleConfirmed[] = [];
  const erp = createErpApp({ db: erpDb, notifyCore: async (sale) => {
    attempts.push(sale);
    if (!available) throw new Error('core unavailable');
    const response = await core.request('/webhooks/erp', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-erp-token': SECRETS.erpToken }, body: JSON.stringify(sale),
    });
    assert.equal(response.status, 200);
    if (loseAcknowledgement) { loseAcknowledgement = false; throw new Error('acknowledgement lost'); }
  } });
  const created = await erp.request('/api/orders', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-erp-token': erpEnv().token },
    body: JSON.stringify({ opportunityId, product: 'hof', unit: 'sp', contact: { phone: '5511987650001' } }),
  });
  assert.equal(created.status, 201);
  const { orderId } = await created.json() as { orderId: string };
  const before = erpDb.prepare("SELECT seats_left FROM seats WHERE product = 'hof' AND unit = 'sp'").get() as { seats_left: number };
  assert.equal((await erp.request(`/api/orders/${orderId}/pay`, { method: 'POST' })).status, 502);
  assert.equal(opportunity().status, 'open');
  assert.deepEqual(erpDb.prepare('SELECT status, notified FROM orders').get(), { status: 'paid', notified: 0 });

  available = true;
  t.mock.timers.tick(1000);
  await setImmediate();
  assert.equal(opportunity().status, 'won', 'the timer delivers the paid sale without another confirm click');
  assert.deepEqual(erpDb.prepare('SELECT notified FROM orders').get(), { notified: 0 }, 'a lost acknowledgement keeps the notice pending');
  t.mock.timers.tick(1000);
  await setImmediate();
  assert.deepEqual(erpDb.prepare('SELECT notified FROM orders').get(), { notified: 1 });
  t.mock.timers.tick(1000);
  await setImmediate();
  assert.equal(attempts.length, 3, 'a confirmed notification is no longer retried');
  assert.equal(new Set(attempts.map((s) => s.saleId)).size, 1);
  assert.equal(new Set(attempts.map((s) => s.confirmedAt)).size, 1);
  assert.deepEqual(coreDb.prepare("SELECT COUNT(*) AS n FROM events WHERE source = 'erp' AND type = 'erp_sale_confirmed'").get(), { n: 1 });
  assert.equal(allOpportunities(coreDb).filter((o) => o.status === 'won').length, 1);
  assert.deepEqual(erpDb.prepare("SELECT seats_left FROM seats WHERE product = 'hof' AND unit = 'sp'").get(), { seats_left: before.seats_left - 1 });
});
