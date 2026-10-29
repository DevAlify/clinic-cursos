import Database from 'better-sqlite3';
import { resetProjections, type Db } from './db.ts';
import { listEvents } from './log.ts';
import { project } from './project.ts';
import { allOpportunities, getOpportunity, getTouch, personName } from './queries.ts';
import type { Level, Rules } from './types.ts';

export function rebuild(db: Db, rules: Rules): void {
  resetProjections(db);
  for (const e of listEvents(db)) {
    try {
      db.transaction(() => project(db, e, rules))();
    } catch (err) {
      db.prepare('INSERT OR REPLACE INTO quarantine (seq, error) VALUES (?, ?)').run(e.seq, err instanceof Error ? err.message : String(err));
    }
  }
}

export interface TouchSummary { seq: number; occurredAt: string; channel: string | null; level: Level }
export interface AttributionChange {
  opportunityId: string; personName: string | null; product: string; unit: string; before: TouchSummary | null; after: TouchSummary | null;
}

function summary(db: Db, seq: number | null): TouchSummary | null {
  const t = seq === null ? null : getTouch(db, seq);
  return t ? { seq: t.seq, occurredAt: t.occurredAt, channel: t.fields.channel.value, level: t.fields.channel.level } : null;
}

// Rebuilds an in-memory copy with the new rules and lists what changes. The live database is untouched.
export function previewRules(db: Db, next: Rules): AttributionChange[] {
  const copy = new Database(db.serialize());
  try {
    rebuild(copy, next);
    return allOpportunities(db).flatMap((before) => {
      const after = getOpportunity(copy, before.id);
      if (after?.firstTouchSeq === before.firstTouchSeq) return [];
      return [{
        opportunityId: before.id, personName: personName(db, before.personId), product: before.product, unit: before.unit,
        before: summary(db, before.firstTouchSeq), after: after ? summary(copy, after.firstTouchSeq) : null,
      }];
    });
  } finally {
    copy.close();
  }
}
