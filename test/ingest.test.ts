import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES } from '../src/config.ts';
import { appendAndProject } from '../src/core/apply.ts';
import { openDb, type Db } from '../src/core/db.ts';
import { ingest } from '../src/core/ingest.ts';
import { listEvents } from '../src/core/log.ts';
import { toIdentifier } from '../src/core/pii.ts';
import { rebuild } from '../src/core/replay.ts';
import { getState } from '../src/core/state.ts';
import type { AnyEventInput } from '../src/core/types.ts';

const R = DEFAULT_RULES;
function setup(): Db {
  const db = openDb();
  const reg = (code: string, unit: 'cps', kind: string, product: string | null, n: string | null) =>
    appendAndProject(db, { source: 'seed', externalId: `ep:${code}`, type: 'entry_point_registered', occurredAt: '2026-09-01T12:00:00Z', actor: 'seed', payload: { code, unit, kind, label: kind === 'lp' ? 'LP de harmonização de Campinas' : 'WhatsApp de Campinas', owner: 'marketing', status: 'released', product, businessNumber: n } }, R);
  reg('cps-lp-hof-01', 'cps', 'lp', 'hof', null);
  reg('cps-whatsapp-principal-01', 'cps', 'whatsapp', null, '551930000003');
  return db;
}
const wa = (db: Db, id: string, when: string): AnyEventInput => ({
  source: 'whatsapp', externalId: id, type: 'whatsapp_message_received', occurredAt: when, actor: 'system',
  payload: { businessNumber: '551930000003', identifiers: [toIdentifier(db, 'phone', '5519977770003', true)!], displayRef: null, code: null, referral: null },
});
const lead = (db: Db, n: number, day: string, campaign: string | null): AnyEventInput => ({
  source: 'form', externalId: `f${n}`, type: 'form_submitted', occurredAt: day, actor: 'system',
  payload: { entryPoint: 'cps-lp-hof-01', identifiers: [toIdentifier(db, 'phone', `(19) 93333-${String(n).padStart(4, '0')}`)!], displayRef: null, utm: campaign ? { source: 'google', medium: 'cpc', campaign } : {}, clickIds: { gclid: `G${n}` }, test: false },
});

test('a new WhatsApp conversation is routed by the AI and the declared channel is recorded', () => {
  const db = setup();
  ingest(db, wa(db, 'w1', '2026-10-29T18:00:00Z'), R, { text: 'Oi, quanto custa o curso de harmonização?' });
  ingest(db, wa(db, 'w2', '2026-10-29T18:05:00Z'), R, { text: 'Vi no insta' });
  const s = getState(db, R);
  assert.deepEqual(s.queue.filter((q) => q.kind === 'routing').map((q) => q.queue), ['sales-cps']);
  assert.equal(s.touches.find((t) => t.source === 'whatsapp')?.fields.channel.level, 'declared');
  assert.equal(s.opportunities.length, 1);
});

test('a repeated webhook does not trigger the AI twice', () => {
  const db = setup();
  ingest(db, wa(db, 'w1', '2026-10-29T18:00:00Z'), R, { text: 'Quero saber do curso' });
  assert.equal(ingest(db, wa(db, 'w1', '2026-10-29T18:00:00Z'), R, { text: 'Quero saber do curso' }).duplicate, true);
  assert.equal(getState(db, R).queue.filter((q) => q.kind === 'routing').length, 1);
});

test('three leads without campaign after a healthy month raise one alert and pause the point', () => {
  const db = setup();
  for (let i = 1; i <= 12; i++) ingest(db, lead(db, i, `2026-10-${String(i + 5).padStart(2, '0')}T14:00:00Z`, 'cps_hof_captacao_202610'), R);
  for (let i = 13; i <= 16; i++) ingest(db, lead(db, i, `2026-10-29T17:${String(i).padStart(2, '0')}:00Z`, null), R);
  const s = getState(db, R);
  assert.equal(s.alerts.filter((a) => a.kind === 'campaign_coverage_drop').length, 1);
  assert.equal(s.entryPoints.find((e) => e.code === 'cps-lp-hof-01')?.status, 'auditing');
});

test('a campaign outside the naming pattern enters and raises a naming alert', () => {
  const db = setup();
  ingest(db, lead(db, 1, '2026-10-29T14:00:00Z', 'Campanha HOF'), R);
  assert.equal(getState(db, R).alerts[0]?.kind, 'naming_nonconforming');
});

test('replaying the log never calls the AI again and rebuilds the same state', () => {
  const db = setup();
  ingest(db, wa(db, 'w1', '2026-10-29T18:00:00Z'), R, { text: 'Oi, vi no insta o curso de harmonização' });
  const before = JSON.stringify(getState(db, R));
  const events = listEvents(db).length;
  rebuild(db, R);
  assert.equal(listEvents(db).length, events);
  assert.equal(JSON.stringify(getState(db, R)), before);
});
