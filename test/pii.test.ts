import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/core/db.ts';
import { hashIdentifier, normalizeEmail, normalizePhone, readPii, storePii, toIdentifier } from '../src/core/pii.ts';

test('phones become E.164 and old mobile numbers get the ninth digit', () => {
  assert.equal(normalizePhone('(11) 98765-0001', false), '+5511987650001');
  assert.equal(normalizePhone('551187650001', true), '+5511987650001');
  assert.equal(normalizePhone('5521988880002', true), '+5521988880002');
  assert.equal(normalizePhone('+55 11 95555-0005', false), '+5511955550005');
  assert.equal(normalizePhone('(19) 3333-4444', false), '+551933334444');
  assert.equal(normalizePhone('16505551234', true), '+16505551234');
  assert.equal(normalizePhone('123', false), null);
});

test('emails are trimmed and lower-cased', () => {
  assert.equal(normalizeEmail('  Ana.Lima@Example.com '), 'ana.lima@example.com');
  assert.equal(normalizeEmail('not-an-email'), null);
});

test('the same phone in different formats has the same hash', () => {
  const db = openDb();
  assert.equal(toIdentifier(db, 'phone', '(11) 98765-0001')?.hash, toIdentifier(db, 'phone', '551187650001', true)?.hash);
  assert.notEqual(hashIdentifier('phone', '+5511987650001'), hashIdentifier('email', '+5511987650001'));
});

test('the vault keeps one row per value behind an opaque ref', () => {
  const db = openDb();
  const ref = storePii(db, 'name', 'Ana Lima');
  assert.equal(storePii(db, 'name', 'Ana Lima'), ref);
  assert.match(ref, /^pii_[0-9a-f]{16}$/);
  assert.equal(readPii(db, ref), 'Ana Lima');
  assert.equal(readPii(db, null), null);
});
