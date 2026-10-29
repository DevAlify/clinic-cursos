import type { Db } from './db.ts';
import type { Identifier, IdentifierKind } from './types.ts';

export const IDENTITY_PRIORITY: IdentifierKind[] = ['bsuid', 'phone', 'email', 'erp_student', 'erp_patient'];

export interface Resolution {
  personId: string;
  created: boolean;
  conflictWith: string[];
}

const rank = (kind: string) => IDENTITY_PRIORITY.indexOf(kind as IdentifierKind);

function ownerOf(db: Db, kind: string, hash: string): string | null {
  const row = db.prepare('SELECT person_id FROM identifiers WHERE kind = ? AND hash = ?').get(kind, hash) as
    | { person_id: string }
    | undefined;
  return row?.person_id ?? null;
}

export function findPerson(db: Db, identifiers: { kind: string; hash: string }[]): string | null {
  for (const i of [...identifiers].sort((a, b) => rank(a.kind) - rank(b.kind))) {
    const owner = ownerOf(db, i.kind, i.hash);
    if (owner) return owner;
  }
  return null;
}

// Exact matches only. On conflict, the strongest identifier wins and the other person is reported for review.
export function resolvePerson(db: Db, identifiers: Identifier[], seq: number, displayRef: string | null): Resolution {
  const unique = new Map(identifiers.map((identifier) => [`${identifier.kind}:${identifier.hash}`, identifier]));
  const found = [...unique.values()]
    .sort((a, b) => rank(a.kind) - rank(b.kind))
    .map((identifier) => ({ identifier, owner: ownerOf(db, identifier.kind, identifier.hash) }));
  const owners = [...new Set(found.flatMap((f) => (f.owner ? [f.owner] : [])))];
  const created = owners.length === 0;
  const personId = created ? `P${seq}` : owners[0];
  if (created) {
    db.prepare('INSERT INTO people (id, created_seq, display_ref) VALUES (?, ?, ?)').run(personId, seq, displayRef);
  } else if (displayRef) {
    db.prepare('UPDATE people SET display_ref = COALESCE(display_ref, ?) WHERE id = ?').run(displayRef, personId);
  }
  for (const f of found) {
    if (!f.owner) {
      db.prepare('INSERT INTO identifiers (kind, hash, person_id, pii_ref) VALUES (?, ?, ?, ?)')
        .run(f.identifier.kind, f.identifier.hash, personId, f.identifier.piiRef);
    }
  }
  return { personId, created, conflictWith: owners.filter((o) => o !== personId) };
}
