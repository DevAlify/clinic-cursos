import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { payloadSchemas } from '../src/core/events.ts';

test('better-sqlite3 loads its native binary', () => {
  const db = new Database(':memory:');
  assert.equal((db.prepare('SELECT 1 + 1 AS two').get() as { two: number }).two, 2);
});

test('event schemas validate a QR scan', () => {
  assert.equal(payloadSchemas.qr_scanned.parse({ code: 'K7P2' }).code, 'K7P2');
});
