import type { Db } from './db.ts';
import { appendEvent } from './log.ts';
import { project } from './project.ts';
import type { AnyEvent, AnyEventInput, Rules } from './types.ts';

export interface ApplyResult { event: AnyEvent | null; duplicate: boolean; error: string | null }

// Store first, then project. A projection error never loses the event: it goes to quarantine.
export function appendAndProject(db: Db, input: AnyEventInput, rules: Rules): ApplyResult {
  const appended = appendEvent(db, input);
  if (appended.duplicate) return { event: null, duplicate: true, error: null };
  const event = appended.event as AnyEvent;
  try {
    db.transaction(() => project(db, event, rules))();
    return { event, duplicate: false, error: null };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    db.prepare('INSERT OR REPLACE INTO quarantine (seq, error) VALUES (?, ?)').run(event.seq, error);
    return { event, duplicate: false, error };
  }
}
