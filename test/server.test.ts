import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECRETS } from '../src/config.ts';
import { openDb } from '../src/core/db.ts';
import { signMeta } from '../src/gateway/signature.ts';
import { createApp } from '../src/server.ts';

const fresh = () => createApp({ openFresh: () => openDb() });
const waBody = (wamid: string, text: string, referral?: { source_id: string; source_type: string; ctwa_clid: string }) => JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp', metadata: { display_phone_number: '551930000003', phone_number_id: 'P' },
    contacts: [{ profile: { name: 'Daniel Rocha' }, wa_id: '5519977770003', user_id: 'BR.DANIEL0003' }],
    messages: [{ from: '5519977770003', from_user_id: 'BR.DANIEL0003', id: wamid, timestamp: '1761750000', type: 'text', text: { body: text }, referral }],
  } }] }],
});
const post = (app: ReturnType<typeof fresh>['app'], path: string, body: string, headers: Record<string, string> = {}) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });

test('Meta webhooks need the sha256 signature over the raw body and keep the ad referral', async () => {
  const { app, getDb } = fresh();
  const body = waBody('wamid.T1', 'Oi, quanto custa o curso de harmonização?', { source_id: 'AD-120', source_type: 'ad', ctwa_clid: 'CLID-1' });
  assert.equal((await post(app, '/webhooks/whatsapp/meta', body, { 'x-hub-signature-256': 'sha256=bad' })).status, 401);
  const ok = await post(app, '/webhooks/whatsapp/meta', body, { 'x-hub-signature-256': signMeta(body, SECRETS.whatsappAppSecret) });
  assert.deepEqual(await ok.json(), { received: 1, duplicates: 0 });
  // /webhooks/whatsapp stays as the short form of the Meta webhook.
  const again = await post(app, '/webhooks/whatsapp', body, { 'x-hub-signature-256': signMeta(body, SECRETS.whatsappAppSecret) });
  assert.deepEqual(await again.json(), { received: 1, duplicates: 1 });
  assert.equal((getDb().prepare("SELECT COUNT(*) AS n FROM queue_items WHERE kind = 'routing'").get() as { n: number }).n, 1);
  const fields = JSON.parse((getDb().prepare("SELECT fields FROM touches WHERE source = 'whatsapp'").get() as { fields: string }).fields);
  assert.deepEqual(fields.channel, { value: 'meta_ads', level: 'observed', reader: 'referral', evidence: 'ad:AD-120' });
});

test('the log never stores the message text, the phone or the name', async () => {
  const { app, getDb } = fresh();
  const body = waBody('wamid.T2', 'Meu nome é segredo, vi no insta');
  await post(app, '/webhooks/whatsapp', body, { 'x-hub-signature-256': signMeta(body, SECRETS.whatsappAppSecret) });
  const log = (getDb().prepare("SELECT external_id || ' ' || payload AS t FROM events").all() as { t: string }[]).map((r) => r.t).join('\n');
  for (const secret of ['segredo', '977770003', 'Daniel Rocha']) assert.equal(log.includes(secret), false, secret);
});

test('forms and ERP events are validated at the door', async () => {
  const { app } = fresh();
  assert.equal((await post(app, '/webhooks/forms', '{"entryPoint":1}')).status, 400);
  assert.equal((await post(app, '/webhooks/erp', '{}')).status, 401);
  assert.equal((await post(app, '/webhooks/erp', '{}', { 'x-erp-token': SECRETS.erpToken })).status, 400);
});

test('a time without timezone is a 400 at the door, never a 500', async () => {
  const { app } = fresh();
  const form = (submittedAt: string) => JSON.stringify({ submissionId: 'form-time-0001', entryPoint: 'cps-lp-hof-01', submittedAt, phone: '(19) 91111-0001' });
  assert.equal((await post(app, '/webhooks/forms', form('2026-10-29T14:00'))).status, 400);
  assert.equal((await post(app, '/webhooks/forms', form('2026-10-29T14:00:00-03:00'))).status, 200);
  const sale = (confirmedAt: string) => JSON.stringify({ type: 'sale_confirmed', saleId: 'ERP-TIME-1', confirmedAt, opportunityId: null, phone: '(19) 91111-0002', product: 'hof', unit: 'sp' });
  const imported = (importedAt: string) => JSON.stringify({ type: 'person_imported', batch: 'b1', erpId: 'PAC-1', role: 'patient', unit: 'cps', importedAt, phone: '(19) 91111-0003' });
  const erp = { 'x-erp-token': SECRETS.erpToken };
  assert.equal((await post(app, '/webhooks/erp', sale('2026-10-29 16:30'), erp)).status, 400);
  assert.equal((await post(app, '/webhooks/erp', imported('2026-09-15T10:00'), erp)).status, 400);
  assert.equal((await post(app, '/webhooks/erp', sale('2026-10-29T16:30:00Z'), erp)).status, 200);
});

test('a malformed x-occurred-at is a 400 and nothing is recorded', async () => {
  const { app, getDb } = fresh();
  const before = (getDb().prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n;
  const bad = { 'x-occurred-at': 'ontem' };
  assert.equal((await post(app, '/tools/origin_coverage', '{}', { 'x-actor': 'attendant:joana', ...bad })).status, 400);
  assert.deepEqual(await (await app.request('/r/K7P2', { headers: bad })).json(), { error: 'x-occurred-at inválido' });
  const link = JSON.stringify({ entryPoint: 'sp-banner-recepcao-01', label: 'banner da recepção de SP', owner: 'recepcao-sp', channel: 'qr', campaign: 'sp_hof_captacao_202610', unit: 'sp', product: 'hof', linkType: 'qr' });
  const res = await post(app, '/api/links', link, bad);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'x-occurred-at inválido' });
  assert.equal((getDb().prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n, before);
});

test('the redirector only follows registered codes and counts the scan', async () => {
  const { app, getDb } = fresh();
  const res = await app.request('/r/K7P2');
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location') ?? '', /^https:\/\/wa\.me\/552130000002\?text=/);
  assert.equal((await app.request('/r/ZZZZ')).status, 404);
  assert.equal((getDb().prepare("SELECT count FROM scans WHERE code = 'K7P2'").get() as { count: number }).count, 1);
});

test('tools over HTTP need an actor with permission', async () => {
  const { app } = fresh();
  assert.equal((await post(app, '/tools/origin_coverage', '{}')).status, 400);
  assert.equal((await post(app, '/tools/origin_coverage', '{}', { 'x-actor': 'attendant:joana' })).status, 200);
});

test('the link generator refuses names outside the pattern and registers new points as auditing', async () => {
  const { app, getDb } = fresh();
  const bad = await post(app, '/api/links', JSON.stringify({ entryPoint: 'banner sp', label: 'x', owner: 'marketing', channel: 'qr', campaign: 'hof', unit: 'sp', product: 'hof', linkType: 'qr' }));
  assert.equal(bad.status, 400);
  const good = await post(app, '/api/links', JSON.stringify({ entryPoint: 'sp-banner-recepcao-01', label: 'banner da recepção de SP', owner: 'recepcao-sp', channel: 'qr', campaign: 'sp_hof_captacao_202610', unit: 'sp', product: 'hof', linkType: 'qr' }));
  const link = (await good.json()) as { code: string; publish: string };
  assert.match(link.code, /^[A-HJKMNP-Z2-9]{4}$/);
  assert.equal((getDb().prepare("SELECT status FROM entry_points WHERE code = 'sp-banner-recepcao-01'").get() as { status: string }).status, 'auditing');
});

test('the simulator API lists steps, runs one and resets', async () => {
  const { app } = fresh();
  const steps = (await (await app.request('/api/steps')).json()) as { id: string; ran: boolean }[];
  assert.equal(steps[0].id, 'carla-qr-scan');
  assert.equal((await (await post(app, '/api/simulate/carla-qr-scan', '{}')).json() as { ok: boolean }).ok, true);
  assert.equal(((await (await app.request('/api/steps')).json()) as { ran: boolean }[])[0].ran, true);
  await post(app, '/api/reset', '{}');
  assert.equal(((await (await app.request('/api/steps')).json()) as { ran: boolean }[])[0].ran, false);
});
