import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES } from '../src/config.ts';
import { openDb, type Db } from '../src/core/db.ts';
import { appendAndProject } from '../src/core/apply.ts';
import { toIdentifier } from '../src/core/pii.ts';
import { allOpportunities, getTouch, touchesOfPerson } from '../src/core/queries.ts';
import { previewRules, rebuild } from '../src/core/replay.ts';
import { getState } from '../src/core/state.ts';
import type { AnyEventInput } from '../src/core/types.ts';

const R = DEFAULT_RULES;
const at = (iso: string) => iso;
function setup(): Db {
  const db = openDb();
  const reg = (code: string, unit: 'sp' | 'cps' | 'rj', kind: string, product: string | null, businessNumber: string | null) =>
    appendAndProject(db, { source: 'seed', externalId: `ep:${code}`, type: 'entry_point_registered', occurredAt: at('2026-09-01T12:00:00Z'), actor: 'seed', payload: { code, unit, kind, label: code, owner: 'marketing', status: 'released', product, businessNumber } }, R);
  reg('sp-lp-hof-01', 'sp', 'lp', 'hof', null);
  reg('cps-whatsapp-principal-01', 'cps', 'whatsapp', null, '551930000003');
  return db;
}
const form = (db: Db, id: string, phone: string, when: string, utm: Record<string, string> = { campaign: 'sp_hof_captacao_202610' }): AnyEventInput => ({
  source: 'form', externalId: id, type: 'form_submitted', occurredAt: when, actor: 'system',
  payload: { entryPoint: 'sp-lp-hof-01', identifiers: [toIdentifier(db, 'phone', phone)!], displayRef: null, utm, clickIds: { fbclid: 'F' }, test: false },
});
const wa = (db: Db, id: string, phone: string, when: string): AnyEventInput => ({
  source: 'whatsapp', externalId: id, type: 'whatsapp_message_received', occurredAt: when, actor: 'system',
  payload: { businessNumber: '551930000003', identifiers: [toIdentifier(db, 'phone', phone, true)!], displayRef: null, code: null, referral: null, textRef: null, provider: 'waha' },
});

test('a form on a product page opens one opportunity attributed to its own touch', () => {
  const db = setup();
  const e = appendAndProject(db, form(db, 'f1', '(11) 98765-0001', '2026-10-29T17:02:00Z'), R).event!;
  appendAndProject(db, form(db, 'f2', '(11) 98765-0001', '2026-10-29T18:00:00Z'), R);
  const opps = allOpportunities(db);
  assert.equal(opps.length, 1);
  assert.deepEqual([opps[0].id, opps[0].status, opps[0].firstTouchSeq, opps[0].lastTouchSeq], [`O${e.seq}`, 'open', e.seq, e.seq]);
});

test('WhatsApp messages within 24 hours share one touch; a later one opens a new touch', () => {
  const db = setup();
  appendAndProject(db, wa(db, 'w1', '5519977770003', '2026-10-29T18:00:00Z'), R);
  const second = appendAndProject(db, wa(db, 'w2', '5519977770003', '2026-10-29T18:05:00Z'), R).event!;
  const third = appendAndProject(db, wa(db, 'w3', '5519977770003', '2026-10-31T18:00:00Z'), R).event!;
  assert.equal(getTouch(db, second.seq), null);
  assert.notEqual(getTouch(db, third.seq), null);
});

test('a low-confidence AI declaration goes to review; a confident one becomes declared', () => {
  const db = setup();
  const msg = appendAndProject(db, wa(db, 'w1', '5519977770003', '2026-10-29T18:00:00Z'), R).event!;
  const personId = touchesOfPerson(db, 'P' + msg.seq)[0].personId;
  appendAndProject(db, { source: 'tool', externalId: 'o1', type: 'origin_declared', occurredAt: '2026-10-29T18:01:00Z', actor: 'ai:simulated-v1', payload: { personId, touchSeq: msg.seq, value: 'instagram', quote: 'insta?', confidence: 0.6 } }, R);
  assert.equal(getTouch(db, msg.seq)?.fields.channel.level, 'unknown');
  assert.equal(getState(db, R).queue.at(-1)?.kind, 'origin_review');
  appendAndProject(db, { source: 'tool', externalId: 'o2', type: 'origin_declared', occurredAt: '2026-10-29T18:02:00Z', actor: 'ai:simulated-v1', payload: { personId, touchSeq: msg.seq, value: 'instagram', quote: 'Vi no insta', confidence: 0.93 } }, R);
  assert.deepEqual(getTouch(db, msg.seq)?.fields.channel, { value: 'instagram', level: 'declared', reader: 'ai:simulated-v1', evidence: 'Vi no insta' });
});

test('an ERP sale with the opportunity id wins it; without the id it waits for reconciliation', () => {
  const db = setup();
  const lead = appendAndProject(db, form(db, 'f1', '(11) 98765-0001', '2026-10-29T17:02:00Z'), R).event!;
  const sale = (id: string, opportunityId: string | null, phone: string): AnyEventInput => ({
    source: 'erp', externalId: id, type: 'erp_sale_confirmed', occurredAt: '2026-10-29T20:00:00Z', actor: 'system',
    payload: { saleId: id, opportunityId, identifiers: [toIdentifier(db, 'phone', phone)!], displayRef: null, product: 'hof', unit: 'sp' },
  });
  appendAndProject(db, sale('S1', `O${lead.seq}`, '(11) 98765-0001'), R);
  assert.equal(allOpportunities(db)[0].status, 'won');
  appendAndProject(db, sale('S2', null, '(11) 95555-0005'), R);
  const item = getState(db, R).queue.find((q) => q.kind === 'reconciliation');
  assert.equal(item?.details.saleId, 'S2');
});

test('a sale that arrives before the lead gets the opportunity as a suggestion later', () => {
  const db = setup();
  appendAndProject(db, { source: 'erp', externalId: 'S3', type: 'erp_sale_confirmed', occurredAt: '2026-10-29T16:00:00Z', actor: 'system', payload: { saleId: 'S3', opportunityId: null, identifiers: [toIdentifier(db, 'phone', '(11) 98765-0001')!], displayRef: null, product: 'hof', unit: 'sp' } }, R);
  const lead = appendAndProject(db, form(db, 'f1', '(11) 98765-0001', '2026-10-29T15:00:00Z'), R).event!;
  assert.equal(getState(db, R).queue.find((q) => q.kind === 'reconciliation')?.details.suggestion, `O${lead.seq}`);
});

for (const mismatch of ['person', 'product', 'unit'] as const) {
  test(`an ERP sale with a mismatched ${mismatch} stays open and records both sides for reconciliation`, (t) => {
    const db = setup();
    t.after(() => db.close());
    const lead = appendAndProject(db, form(db, 'lead', '(11) 98765-0001', '2026-10-29T17:00:00Z'), R).event!;
    const product = mismatch === 'product' ? 'other-course' : 'hof';
    const unit = mismatch === 'unit' ? 'rj' : 'sp';
    const phone = mismatch === 'person' ? '(11) 95555-0005' : '(11) 98765-0001';
    const sale = appendAndProject(db, { source: 'erp', externalId: 'sale:mismatch', type: 'erp_sale_confirmed', occurredAt: '2026-10-29T18:00:00Z', actor: 'system', payload: {
      saleId: 'S-mismatch', opportunityId: `O${lead.seq}`, identifiers: [toIdentifier(db, 'phone', phone)!], displayRef: null, product, unit,
    } }, R);
    assert.equal(sale.error, null);
    const opp = allOpportunities(db)[0];
    assert.deepEqual([opp.status, opp.stage, opp.erpSaleId], ['open', 'new', null]);
    const items = getState(db, R).queue.filter((q) => q.kind === 'reconciliation');
    assert.equal(items.length, 1);
    assert.match(items[0].reason, new RegExp(mismatch));
    assert.deepEqual(items[0].details.sale, {
      personId: mismatch === 'person' ? `P${sale.event!.seq}` : `P${lead.seq}`, product, unit,
    });
    assert.deepEqual(items[0].details.opportunity, { id: opp.id, personId: opp.personId, product: 'hof', unit: 'sp' });
  });
}

test('identifiers pointing to two people open a merge review', () => {
  const db = setup();
  appendAndProject(db, form(db, 'f1', '(11) 98765-0001', '2026-10-29T17:00:00Z'), R);
  appendAndProject(db, { source: 'form', externalId: 'f2', type: 'form_submitted', occurredAt: '2026-10-29T17:10:00Z', actor: 'system', payload: { entryPoint: 'sp-lp-hof-01', identifiers: [toIdentifier(db, 'email', 'x@example.com')!], displayRef: null, utm: {}, clickIds: {}, test: false } }, R);
  appendAndProject(db, { source: 'form', externalId: 'f3', type: 'form_submitted', occurredAt: '2026-10-29T17:20:00Z', actor: 'system', payload: { entryPoint: 'sp-lp-hof-01', identifiers: [toIdentifier(db, 'phone', '(11) 98765-0001')!, toIdentifier(db, 'email', 'x@example.com')!], displayRef: null, utm: {}, clickIds: {}, test: false } }, R);
  assert.equal(getState(db, R).queue.filter((q) => q.kind === 'merge_review').length, 1);
});

test('a failing projection is quarantined and the event stays in the log', () => {
  const db = setup();
  const r = appendAndProject(db, { source: 'tool', externalId: 'bad', type: 'origin_declared', occurredAt: '2026-10-29T18:00:00Z', actor: 'attendant:joana', payload: { personId: 'P404', touchSeq: 999, value: 'instagram', quote: '-', confidence: null } }, R);
  assert.match(r.error ?? '', /999/);
  assert.equal(getState(db, R).quarantine.length, 1);
});

test('rebuild reproduces the same state; a shorter window changes nothing when the touch opened the opportunity', () => {
  const db = setup();
  appendAndProject(db, form(db, 'f1', '(11) 98765-0001', '2026-10-10T13:00:00Z'), R);
  const before = JSON.stringify(getState(db, R));
  rebuild(db, R);
  assert.equal(JSON.stringify(getState(db, R)), before);
  assert.deepEqual(previewRules(db, { ...R, attributionWindowDays: 14 }), []);
});
