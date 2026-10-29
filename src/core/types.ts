import type { ENTRY_POINT_STATUSES, EventType, IDENTIFIER_KINDS, LEVELS, Payload, UNITS } from './events.ts';

export type Level = (typeof LEVELS)[number];
export type Unit = (typeof UNITS)[number];
export type EntryPointStatus = (typeof ENTRY_POINT_STATUSES)[number];
export type IdentifierKind = (typeof IDENTIFIER_KINDS)[number];

export type FieldName = 'entryPoint' | 'channel' | 'campaign' | 'unit' | 'product';
export interface Field {
  value: string | null;
  level: Level;
  reader: string;
  evidence?: string;
}
export type Fields = Record<FieldName, Field>;

export interface Identifier {
  kind: IdentifierKind;
  hash: string;
  piiRef: string | null;
}

export interface Rules {
  attributionWindowDays: number;
  aiConfidenceThreshold: number;
}

export interface EventRow<T extends EventType = EventType> {
  seq: number;
  id: string;
  source: string;
  externalId: string;
  type: T;
  schemaVersion: number;
  occurredAt: string;
  receivedAt: string;
  actor: string;
  payload: Payload<T>;
}
export type AnyEvent = { [T in EventType]: EventRow<T> }[EventType];

export interface EventInput<T extends EventType = EventType> {
  source: string;
  externalId: string;
  type: T;
  occurredAt: string;
  actor: string;
  payload: Payload<T>;
}
export type AnyEventInput = { [T in EventType]: EventInput<T> }[EventType];
