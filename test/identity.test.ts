import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, type Db } from '../src/core/db.ts';
import { findPerson, resolvePerson } from '../src/core/identity.ts';
import { toIdentifier } from '../src/core/pii.ts';
import type { Identifier, IdentifierKind } from '../src/core/types.ts';

const ids = (db: Db, pairs: [IdentifierKind, string, boolean?][]): Identifier[] =>
  pairs.map(([kind, raw, cc]) => toIdentifier(db, kind, raw, cc ?? false)!);

test('a new identifier creates a person named after the event sequence', () => {
  const db = openDb();
  assert.deepEqual(resolvePerson(db, ids(db, [['phone', '(11) 98765-0001']]), 7, null),
    { personId: 'P7', created: true, conflictWith: [] });
});

test('WhatsApp without the ninth digit finds the person from the form', () => {
  const db = openDb();
  resolvePerson(db, ids(db, [['phone', '(11) 98765-0001'], ['email', 'ana.lima@example.com']]), 1, null);
  const r = resolvePerson(db, ids(db, [['bsuid', 'BR.ANA0001'], ['phone', '551187650001', true]]), 2, null);
  assert.deepEqual(r, { personId: 'P1', created: false, conflictWith: [] });
  assert.equal(findPerson(db, ids(db, [['bsuid', 'BR.ANA0001']])), 'P1');
});

test('conflicting identifiers keep the strongest match and report the other person', () => {
  const db = openDb();
  resolvePerson(db, ids(db, [['phone', '(19) 94444-0006']]), 1, null);
  resolvePerson(db, ids(db, [['email', 'outra@example.com']]), 2, null);
  const r = resolvePerson(db, ids(db, [['phone', '(19) 94444-0006'], ['email', 'outra@example.com']]), 3, null);
  assert.equal(r.personId, 'P1');
  assert.deepEqual(r.conflictWith, ['P2']);
  assert.equal(findPerson(db, ids(db, [['email', 'outra@example.com']])), 'P2');
});

test('equal names never join different people', () => {
  const db = openDb();
  const a = resolvePerson(db, ids(db, [['phone', '(11) 90000-1111']]), 1, 'pii_same_name');
  const b = resolvePerson(db, ids(db, [['phone', '(11) 90000-2222']]), 2, 'pii_same_name');
  assert.notEqual(a.personId, b.personId);
});
