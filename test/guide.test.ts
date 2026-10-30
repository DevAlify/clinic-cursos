import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECRETS } from '../src/config.ts';
import { openDb, type Db } from '../src/core/db.ts';
import { readPii } from '../src/core/pii.ts';
import { allOpportunities } from '../src/core/queries.ts';
import { signWaha } from '../src/gateway/signature.ts';
import { CATALOG } from '../src/erp/catalog.ts';
import { getCatalog } from '../src/erp/client.ts';
import { createApp } from '../src/server.ts';
import { createErpApp } from '../services/erp/app.ts';
import { createWahaSimApp } from '../services/waha/app.ts';
import { NUMBERS, PEOPLE } from '../scenarios/fixtures.ts';
import { steps } from '../scenarios/steps.ts';

type App = ReturnType<typeof createApp>['app'];
const GUIDE_STEPS = ['origin', 'message', 'attendance', 'erp', 'crm'];
const get = async (app: App, path: string) => (await app.request(path)).json() as Promise<any>;
const done = new WeakMap<App, number>();
const runSteps = async (app: App, upTo: string) => {
  const end = steps.findIndex((s) => s.id === upTo) + 1;
  for (const s of steps.slice(done.get(app) ?? 0, end)) assert.equal((await app.request(`/api/simulate/${s.id}`, { method: 'POST' })).status, 200);
  done.set(app, end);
};

// A lead typing on a phone: the WAHA envelope, signed like the simulator does.
let counter = 0;
function typer(app: App, db: () => Db, who: { waId: string; name: string }, to: string, session: string, startsAt: string) {
  return async (text: string): Promise<string | null> => {
    const id = `false_${who.waId}@c.us_GUIDE${++counter}`;
    const ts = Date.parse(startsAt) + counter * 60_000;
    const raw = JSON.stringify({
      id: `evt_${id}`, timestamp: ts, event: 'message', session,
      payload: { id, timestamp: ts / 1000, from: `${who.waId}@c.us`, fromMe: false, to: `${to}@c.us`, body: text, _data: { notifyName: who.name } },
    });
    const res = await app.request('/webhooks/whatsapp/waha', {
      method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'x-webhook-hmac': signWaha(raw, SECRETS.wahaWebhookHmacKey), 'x-webhook-hmac-algorithm': 'sha512' },
    });
    assert.equal(res.status, 200);
    return lastReply(db());
  };
}
const outbound = (db: Db) => db.prepare("SELECT seq, text_ref FROM messages WHERE direction = 'out' ORDER BY seq").all() as { seq: number; text_ref: string }[];
const lastReply = (db: Db) => { const r = outbound(db).at(-1); return r ? readPii(db, r.text_ref) : null; };
// The seed already holds opportunities: count only what a test adds.
const opps = (db: Db) => allOpportunities(db).length;
const routes = (db: Db) => (db.prepare("SELECT queue FROM queue_items WHERE kind = 'routing' ORDER BY id").all() as { queue: string }[]).map((r) => r.queue);

test('A1, A2, A3: a generic Rio QR lead gets the open classes, then the unit class, then the opportunity on "sim"', async () => {
  const { app, getDb } = createApp({ openFresh: () => openDb() });
  await app.request('/api/simulate/carla-qr-scan', { method: 'POST' });
  await app.request('/api/simulate/carla-whatsapp-code', { method: 'POST' });
  const first = lastReply(getDb());
  const base = opps(getDb());
  assert.equal(first, 'Olá, Carla! Temos turmas abertas de Harmonização Facial em São Paulo (14/11), no Rio (21/11) e em Campinas (28/11), e o curso online de Intercorrências (01/11). Qual te interessa?');
  assert.equal(opps(getDb()), base);

  const say = typer(app, getDb, PEOPLE.carla, NUMBERS.rj, 'rj', '2026-10-10T10:00:00-03:00');
  assert.equal(await say('São Paulo'), 'Em São Paulo, a próxima turma é de Harmonização Facial em 14/11, R$ 7.900, 3 vagas. É essa que você procura?');
  assert.equal(opps(getDb()), base, 'an offer alone opens nothing');

  const reply = await say('sim');
  assert.match(reply!, /^Ótimo! A turma de Harmonização Facial em São Paulo começa em 14\/11, custa R\$ 7\.900 e tem 3 vagas \(consultado no ERP às /);
  assert.deepEqual(allOpportunities(getDb()).slice(base).map((o) => [o.product, o.unit, o.status]), [['hof', 'sp', 'open']]);
  assert.equal(routes(getDb()).at(-1), 'sales-sp');

  await say('sim');
  assert.equal(opps(getDb()), base + 1, 'a second "sim" opens nothing new');
});

test('A2 accepts the other units and abbreviations; A3 needs the offer to be the last thing the clinic said', async () => {
  const { app, getDb } = createApp({ openFresh: () => openDb() });
  const say = typer(app, getDb, PEOPLE.daniel, NUMBERS.cps, 'cps', '2026-10-29T15:00:00-03:00');
  await say('Quero saber de cursos');
  const base = opps(getDb());
  assert.match((await say('Rio de Janeiro'))!, /^No Rio, a próxima turma é de Harmonização Facial em 21\/11, R\$ 7\.900, 6 vagas\./);
  assert.match((await say('Campinas'))!, /^Em Campinas, a próxima turma é de Harmonização Facial em 28\/11, R\$ 7\.600, 2 vagas\./);
  assert.match((await say('SP'))!, /^Em São Paulo, a próxima turma é de Harmonização Facial em 14\/11/);
  await say('Bom dia');
  await say('sim');
  assert.equal(opps(getDb()), base, '"sim" after another reply confirms nothing');
});

test('A1 also answers "Vi no Instagram" after the origin question, and still records the origin', async () => {
  const { app, getDb } = createApp({ openFresh: () => openDb() });
  const say = typer(app, getDb, PEOPLE.daniel, NUMBERS.cps, 'cps', '2026-10-29T15:00:00-03:00');
  const first = await say('Quero saber de cursos');
  assert.match(first!, /Temos turmas abertas de Harmonização Facial.*Qual te interessa\? Antes, como você conheceu a Clinic\?/);
  const second = await say('Vi no Instagram');
  assert.match(second!, /^Obrigada por contar, Daniel! Anotei aqui\. Temos turmas abertas de Harmonização Facial em São Paulo \(14\/11\)/);
  const channel = (getDb().prepare("SELECT json_extract(fields, '$.channel.value') AS v, json_extract(fields, '$.channel.level') AS l FROM touches WHERE source = 'whatsapp' ORDER BY seq DESC").get()) as { v: string; l: string };
  assert.deepEqual([channel.v, channel.l], ['instagram', 'declared']);
});

test('in human mode the agent stays silent for A1, A2 and A3 messages and opens nothing', async () => {
  const { app, getDb } = createApp({ openFresh: () => openDb() });
  const say = typer(app, getDb, PEOPLE.daniel, NUMBERS.cps, 'cps', '2026-10-29T15:00:00-03:00');
  await say('Quero saber de cursos');
  const base = opps(getDb());
  await say('São Paulo'); // leaves an offer in the log
  const conversation = (await get(app, '/api/conversations'))[0] as { personId: string };
  const mode = await app.request('/tools/set_conversation_mode', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-actor': 'attendant:joana' },
    body: JSON.stringify({ personId: conversation.personId, businessNumber: NUMBERS.cps, mode: 'human', reason: 'teste' }),
  });
  assert.equal(mode.status, 200);
  const before = outbound(getDb()).length;
  for (const text of ['Quero saber de cursos', 'Saber de Cursos', 'Campinas', 'sim']) await say(text);
  assert.equal(outbound(getDb()).length, before);
  assert.equal(opps(getDb()), base);
});

test('GET /api/guide: fresh core, then each step follows the log', async () => {
  const { app, getDb } = createApp({ openFresh: () => openDb() });
  assert.deepEqual(await get(app, '/api/guide'), {
    total: 5, done: 0,
    steps: [
      { id: 'origin', status: 'current' }, { id: 'message', status: 'todo' }, { id: 'attendance', status: 'todo', hasOpportunity: false },
      { id: 'erp', status: 'todo' }, { id: 'crm', status: 'todo' },
    ],
  });

  const status = async () => { const g = await get(app, '/api/guide'); return { done: g.done, statuses: g.steps.map((s: any) => s.status).join(), has: g.steps[2].hasOpportunity, ids: g.steps.map((s: any) => s.id) }; };
  await runSteps(app, 'ana-meta-form');
  let g = await status();
  assert.deepEqual([g.done, g.statuses, g.has], [1, 'done,current,todo,todo,todo', true]);
  assert.deepEqual(g.ids, GUIDE_STEPS);

  await runSteps(app, 'ana-whatsapp');
  g = await status();
  assert.deepEqual([g.done, g.statuses, g.has], [2, 'done,done,current,todo,todo', true]);

  await runSteps(app, 'atendente-pre-matricula-ana');
  g = await status();
  assert.deepEqual([g.done, g.statuses], [3, 'done,done,done,current,todo']);

  await runSteps(app, 'ana-erp-sale');
  g = await status();
  assert.deepEqual([g.done, g.statuses], [4, 'done,done,done,done,current']);
  assert.ok(getDb().open);
});

test('GET /api/guide: attendance is not done before pre-enrollment, and hasOpportunity follows an opened opportunity', async () => {
  const { app, getDb } = createApp({ openFresh: () => openDb() });
  // Ana writes to the SP number with no form and no course: a message, but no opportunity.
  const say = typer(app, getDb, { waId: PEOPLE.ana.waId, name: PEOPLE.ana.name }, NUMBERS.sp, 'sp', '2026-10-29T14:00:00-03:00');
  await say('Oi');
  let g = await get(app, '/api/guide');
  assert.deepEqual(g.steps.map((s: any) => s.status), ['current', 'done', 'todo', 'todo', 'todo']);
  assert.equal(g.steps[2].hasOpportunity, false);

  const conversation = (await get(app, '/api/conversations'))[0] as { personId: string };
  const open = await app.request('/tools/open_opportunity', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-actor': 'attendant:joana' },
    body: JSON.stringify({ personId: conversation.personId, product: 'hof', unit: 'sp', confidence: null, triggerSeq: 1 }),
  });
  assert.equal(open.status, 200);
  g = await get(app, '/api/guide');
  assert.equal(g.steps[2].hasOpportunity, true);
  assert.equal(g.steps[2].status, 'todo', 'still no pre-enrollment');
  assert.equal(g.steps[0].status, 'current');
});

test('GET /api/catalog: offline it is the local catalog; online it is what the ERP says, with its seats', async () => {
  const { app } = createApp({ openFresh: () => openDb() });
  assert.deepEqual(await get(app, '/api/catalog'), CATALOG);

  const erp = createErpApp({ notifyCore: async () => {} });
  const viaErp = ((url: string | URL | Request, init?: RequestInit) => erp.request(String(url).replace('http://erp.test', ''), init)) as typeof fetch;
  const online = createApp({ openFresh: () => openDb(), fetch: viaErp, erpUrl: 'http://erp.test' });
  const body = await get(online.app, '/api/catalog');
  assert.deepEqual(body, await (await erp.request('/api/catalog')).json());
  assert.deepEqual(await getCatalog({ url: 'http://erp.test', fetch: viaErp }), body);

  const down = createApp({ openFresh: () => openDb(), fetch: (async () => { throw new Error('refused'); }) as typeof fetch, erpUrl: 'http://erp.test' });
  const res = await down.app.request('/api/catalog');
  assert.equal(res.status, 502);
  assert.match(((await res.json()) as { error: string }).error, /ERP não respondeu/);
});

test('WAHA simulator: /api/catalog and /api/guide proxy the ERP and the core, and fall back to [] and null', async () => {
  const noWebhook = async () => {};
  const asked: string[] = [];
  const reachable = (async (url: string | URL | Request) => {
    asked.push(String(url));
    return Response.json(String(url).endsWith('/api/guide') ? { total: 5, done: 0, steps: [] } : CATALOG);
  }) as typeof fetch;
  const up = createWahaSimApp({ deliverWebhook: noWebhook, fetch: reachable });
  assert.deepEqual(await get(up as unknown as App, '/api/catalog'), CATALOG);
  assert.deepEqual(await get(up as unknown as App, '/api/guide'), { total: 5, done: 0, steps: [] });
  assert.ok(asked.some((u) => u.endsWith('/api/catalog')) && asked.some((u) => u.endsWith('/api/guide')));

  const refused = (async () => { throw new Error('refused'); }) as typeof fetch;
  const broken = (async () => new Response('boom', { status: 500 })) as typeof fetch;
  for (const fetchImpl of [refused, broken]) {
    const down = createWahaSimApp({ deliverWebhook: noWebhook, fetch: fetchImpl });
    assert.deepEqual(await get(down as unknown as App, '/api/catalog'), []);
    assert.equal(await get(down as unknown as App, '/api/guide'), null);
  }
  const notAnArray = createWahaSimApp({ deliverWebhook: noWebhook, fetch: (async () => Response.json({ error: 'x' })) as typeof fetch });
  assert.deepEqual(await get(notAnArray as unknown as App, '/api/catalog'), []);
});
