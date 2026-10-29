import { randomUUID } from 'node:crypto';
import type { Db } from './db.ts';
import { payloadSchemas, type EventType, type Payload } from './events.ts';
import type { AnyEvent, EventInput, EventRow } from './types.ts';

export type AppendResult<T extends EventType> =
  | { event: EventRow<T>; duplicate: false }
  | { event: null; duplicate: true };

function toUtcIso(value: string): string {
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw new Error(`data inválida: ${value}`);
  return new Date(time).toISOString();
}

export function appendEvent<T extends EventType>(
  db: Db, input: EventInput<T>, receivedAt = new Date().toISOString(),
): AppendResult<T> {
  const payload = payloadSchemas[input.type].parse(input.payload) as Payload<T>;
  const occurredAt = toUtcIso(input.occurredAt);
  const id = randomUUID();
  const inserted = db
    .prepare(`INSERT INTO events (id, source, external_id, type, schema_version, occurred_at, received_at, actor, payload)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?) ON CONFLICT (source, external_id) DO NOTHING`)
    .run(id, input.source, input.externalId, input.type, occurredAt, receivedAt, input.actor, JSON.stringify(payload));
  if (inserted.changes === 0) {
    db.prepare(`INSERT INTO inbound_duplicates (source, external_id, count, last_seen_at) VALUES (?, ?, 1, ?)
      ON CONFLICT (source, external_id) DO UPDATE SET count = count + 1, last_seen_at = excluded.last_seen_at`)
      .run(input.source, input.externalId, receivedAt);
    return { event: null, duplicate: true };
  }
  const event: EventRow<T> = {
    seq: Number(inserted.lastInsertRowid), id, source: input.source, externalId: input.externalId,
    type: input.type, schemaVersion: 1, occurredAt, receivedAt, actor: input.actor, payload,
  };
  return { event, duplicate: false };
}

interface EventSqlRow {
  seq: number; id: string; source: string; external_id: string; type: string; schema_version: number;
  occurred_at: string; received_at: string; actor: string; payload: string;
}

export function listEvents(db: Db): AnyEvent[] {
  return (db.prepare('SELECT * FROM events ORDER BY seq').all() as EventSqlRow[]).map((r) => ({
    seq: r.seq, id: r.id, source: r.source, externalId: r.external_id, type: r.type,
    schemaVersion: r.schema_version, occurredAt: r.occurred_at, receivedAt: r.received_at, actor: r.actor,
    payload: JSON.parse(r.payload),
  }) as AnyEvent);
}

export function maxSeq(db: Db): number {
  return (db.prepare('SELECT COALESCE(MAX(seq), 0) AS n FROM events').get() as { n: number }).n;
}
