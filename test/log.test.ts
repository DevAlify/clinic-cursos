import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, resetProjections } from '../src/core/db.ts';
import { appendEvent, listEvents } from '../src/core/log.ts';

const scan = (externalId: string) => ({
  source: 'qr', externalId, type: 'qr_scanned' as const, occurredAt: '2026-10-29T14:00:00-03:00',
  actor: 'system', payload: { code: 'K7P2' },
});

test('appendEvent stores the event in UTC with a sequence number', () => {
  const db = openDb();
  const r = appendEvent(db, scan('s1'));
  assert.equal(r.duplicate, false);
  assert.equal(r.event?.seq, 1);
  assert.equal(listEvents(db)[0].occurredAt, '2026-10-29T17:00:00.000Z');
});

test('the same source key is stored once and the repeat is counted', () => {
  const db = openDb();
  appendEvent(db, scan('s1'));
  assert.equal(appendEvent(db, scan('s1')).duplicate, true);
  assert.equal(listEvents(db).length, 1);
  assert.deepEqual(db.prepare('SELECT count FROM inbound_duplicates WHERE external_id = ?').get('s1'), { count: 1 });
});

test('the log rejects update and delete', () => {
  const db = openDb();
  appendEvent(db, scan('s1'));
  assert.throws(() => db.prepare("UPDATE events SET actor = 'x'").run(), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM events').run(), /append-only/);
});

test('invalid payloads are refused before storage', () => {
  const db = openDb();
  assert.throws(() => appendEvent(db, { ...scan('s1'), payload: {} as never }));
  assert.equal(listEvents(db).length, 0);
});

test('resetProjections keeps the log and the vault', () => {
  const db = openDb();
  appendEvent(db, scan('s1'));
  db.prepare("INSERT INTO pii (ref, kind, value) VALUES ('pii_x', 'name', 'Ana')").run();
  db.prepare("INSERT INTO scans (code, count) VALUES ('K7P2', 1)").run();
  resetProjections(db);
  assert.equal(listEvents(db).length, 1);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM pii').get() as { n: number }).n, 1);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM scans').get() as { n: number }).n, 0);
});
