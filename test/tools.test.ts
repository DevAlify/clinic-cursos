import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES } from '../src/config.ts';
import { classifyMessage, routeFor } from '../src/ai/classify.ts';
import { openDb } from '../src/core/db.ts';
import { appendAndProject } from '../src/core/apply.ts';
import { toIdentifier } from '../src/core/pii.ts';
import { maxSeq } from '../src/core/log.ts';
import { getTouch } from '../src/core/queries.ts';
import { getState } from '../src/core/state.ts';
import { callTool, tools } from '../src/tools/registry.ts';

const R = DEFAULT_RULES;
const NOW = '2026-10-29T18:00:00Z';
function setup() {
  const db = openDb();
  appendAndProject(db, { source: 'seed', externalId: 'ep', type: 'entry_point_registered', occurredAt: '2026-09-01T12:00:00Z', actor: 'seed', payload: { code: 'cps-lp-hof-01', unit: 'cps', kind: 'lp', label: 'LP de harmonização de Campinas', owner: 'marketing', status: 'released', product: 'hof', businessNumber: null } }, R);
  return db;
}

test('the simulated AI reads intent, declared channel and product', () => {
  const c = classifyMessage('Oi, vi no insta. Quanto custa o curso de harmonização?');
  assert.deepEqual([c.intent, c.confidence, c.declaredChannel?.value, c.product?.value, c.model], ['course_purchase', 0.91, 'instagram', 'hof', 'simulated-v1']);
  assert.equal(classifyMessage('Estou com um hematoma depois do procedimento').intent, 'clinical_question');
  assert.equal(classifyMessage('Bom dia').intent, 'other');
});

test('routing sends sensitive subjects to people and sales to the right unit', () => {
  assert.deepEqual(routeFor('course_purchase', 'cps', 0.91, 0.85).queue, 'sales-cps');
  assert.deepEqual(routeFor('clinical_question', 'cps', 0.91, 0.85).queue, 'clinical-team');
  assert.deepEqual(routeFor('complaint', 'sp', 0.91, 0.85).queue, 'human-priority');
  assert.deepEqual(routeFor('course_purchase', null, 0.91, 0.85).queue, 'triage');
  assert.deepEqual(routeFor('course_purchase', 'sp', 0.5, 0.85).queue, 'triage');
});

test('there are exactly eight tools', () => {
  assert.deepEqual(Object.keys(tools).sort(), [
    'explain_origin', 'get_course_offer', 'open_opportunity', 'origin_coverage',
    'propose_merge', 'record_declared_origin', 'route_conversation', 'set_entry_point_status',
  ]);
});

test('tools refuse unknown names, wrong roles and invalid input', async () => {
  const db = setup();
  assert.equal((await callTool(db, 'nope', {}, 'attendant:joana')).ok, false);
  assert.match(String((await callTool(db, 'route_conversation', {}, 'marketing:ana') as { error: string }).error), /permissão negada/);
  assert.match(String((await callTool(db, 'route_conversation', { queue: 1 }, 'ai:simulated-v1') as { error: string }).error), /entrada inválida/);
});

test('the same routing action twice creates one queue item', async () => {
  const db = setup();
  const input = { messageSeq: 42, personId: 'P1', queue: 'sales-cps', reason: 'interesse em curso', summary: 'Quer comprar um curso', intent: 'course_purchase', confidence: 0.91, model: 'simulated-v1' };
  await callTool(db, 'route_conversation', input, 'ai:simulated-v1', R, NOW);
  await callTool(db, 'route_conversation', input, 'ai:simulated-v1', R, NOW);
  assert.equal(getState(db, R).queue.filter((q) => q.kind === 'routing').length, 1);
});

test('the monitor can only pause, and release needs a passing test lead after the alert', async () => {
  const db = setup();
  assert.equal((await callTool(db, 'set_entry_point_status', { code: 'cps-lp-hof-01', status: 'released', reason: 'x' }, 'monitor', R, NOW)).ok, false);
  appendAndProject(db, { source: 'monitor', externalId: 'a1', type: 'alert_raised', occurredAt: NOW, actor: 'monitor', payload: { entryPoint: 'cps-lp-hof-01', kind: 'campaign_coverage_drop', message: 'm', action: 'a', owner: 'marketing' } }, R);
  assert.equal((await callTool(db, 'set_entry_point_status', { code: 'cps-lp-hof-01', status: 'auditing', reason: 'queda' }, 'monitor', R, NOW)).ok, true);
  const blocked = await callTool(db, 'set_entry_point_status', { code: 'cps-lp-hof-01', status: 'released', reason: 'ok' }, 'owner:marketing', R, NOW);
  assert.match(String((blocked as { error: string }).error), /lead de teste/);
  appendAndProject(db, { source: 'form', externalId: 'test-1', type: 'form_submitted', occurredAt: NOW, actor: 'system', payload: { entryPoint: 'cps-lp-hof-01', identifiers: [toIdentifier(db, 'email', 'teste@example.com')!], displayRef: null, utm: { campaign: 'cps_hof_captacao_202610' }, clickIds: {}, test: true } }, R);
  assert.equal((await callTool(db, 'set_entry_point_status', { code: 'cps-lp-hof-01', status: 'released', reason: 'ok' }, 'owner:marketing', R, NOW)).ok, true);
});

test('course offers come from the ERP with source and time', async () => {
  const r = await callTool(setup(), 'get_course_offer', { product: 'hof', unit: 'cps' }, 'ai:simulated-v1', R, NOW);
  assert.equal(r.ok, true);
  const offer = (r as { result: { source: string; readAt: string; seatsLeft: number } }).result;
  assert.deepEqual([offer.source, offer.readAt, offer.seatsLeft], ['erp-simulado', NOW, 2]);
});

test('an action whose projection fails is reported as failed, and the event stays in the log', async () => {
  const db = setup();
  db.exec('DROP TABLE queue_items');
  const before = maxSeq(db);
  const r = await callTool(db, 'route_conversation', { messageSeq: 7, personId: 'P1', queue: 'sales-cps', reason: 'r', summary: 's', intent: 'course_purchase', confidence: 0.91, model: 'simulated-v1' }, 'ai:simulated-v1', R, NOW);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /queue_items/);
  assert.equal(maxSeq(db), before + 1);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM quarantine').get() as { n: number }).n, 1);
});

test('declaring an origin on a touch that is not the person\'s is rejected before any event is written', async () => {
  const db = setup();
  const lead = (id: string, phone: string) => appendAndProject(db, { source: 'form', externalId: id, type: 'form_submitted', occurredAt: NOW, actor: 'system', payload: { entryPoint: 'cps-lp-hof-01', identifiers: [toIdentifier(db, 'phone', phone)!], displayRef: null, utm: {}, clickIds: {}, test: false } }, R).event!;
  const a = lead('fa', '(19) 93333-0001');
  const b = lead('fb', '(19) 93333-0002');
  const personA = getTouch(db, a.seq)!.personId;
  const declare = (touchSeq: number) => callTool(db, 'record_declared_origin', { personId: personA, touchSeq, value: 'instagram', quote: 'Vi no insta', confidence: 0.93, triggerSeq: 99 }, 'ai:simulated-v1', R, NOW);
  const before = maxSeq(db);
  for (const seq of [b.seq, 999]) {
    const r = await declare(seq);
    assert.equal(r.ok, false);
    assert.equal((r as { error: string }).error, `o contato ${seq} não pertence à pessoa ${personA}`);
  }
  assert.equal(maxSeq(db), before);
  assert.equal((await declare(a.seq)).ok, true);
  assert.equal(getTouch(db, a.seq)?.fields.channel.level, 'declared');
});
