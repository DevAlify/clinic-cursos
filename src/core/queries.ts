import { CONVERSATION_WINDOW_HOURS } from '../config.ts';
import type { Db } from './db.ts';
import type { EntryPointInfo, LinkInfo } from './origin.ts';
import { readPii } from './pii.ts';
import type { ConversationMode, Fields } from './types.ts';

export interface EntryPointRow extends EntryPointInfo { kind: string; label: string; owner: string; status: string }
export interface LinkRow extends LinkInfo { destination: string; linkType: string }
export interface TouchRow { seq: number; personId: string; occurredAt: string; source: string; fields: Fields; code: string | null; isTest: boolean }
export interface OpportunityRow {
  id: string; personId: string; product: string; unit: string; status: string; openedSeq: number; openedAt: string;
  firstTouchSeq: number | null; lastTouchSeq: number | null; attributionRule: string; erpSaleId: string | null;
  stage: string; erpOrderId: string | null;
}
export interface ConversationRow { personId: string; businessNumber: string; mode: ConversationMode; queue: string | null; originAsked: boolean; lastAt: string }
export interface BasedOn { tool: string; readAt: string }
export interface MessageRow {
  seq: number; personId: string; businessNumber: string; direction: 'in' | 'out'; actor: string; textRef: string | null; at: string; basedOn: BasedOn[];
}

// SQL row mappers: rows come back untyped from better-sqlite3.
const toEntryPoint = (r: any): EntryPointRow => ({
  code: r.code, unit: r.unit, kind: r.kind, label: r.label, owner: r.owner, status: r.status, product: r.product, businessNumber: r.business_number,
});
const toLink = (r: any): LinkRow => ({
  code: r.code, entryPoint: r.entry_point, channel: r.channel, campaign: r.campaign, unit: r.unit, product: r.product, destination: r.destination, linkType: r.link_type,
});
const toTouch = (r: any): TouchRow => ({
  seq: r.seq, personId: r.person_id, occurredAt: r.occurred_at, source: r.source, fields: JSON.parse(r.fields), code: r.code, isTest: r.is_test === 1,
});
const toOpportunity = (r: any): OpportunityRow => ({
  id: r.id, personId: r.person_id, product: r.product, unit: r.unit, status: r.status, openedSeq: r.opened_seq, openedAt: r.opened_at,
  firstTouchSeq: r.first_touch_seq, lastTouchSeq: r.last_touch_seq, attributionRule: r.attribution_rule, erpSaleId: r.erp_sale_id,
  stage: r.stage, erpOrderId: r.erp_order_id,
});
const toConversation = (r: any): ConversationRow => ({
  personId: r.person_id, businessNumber: r.business_number, mode: r.mode, queue: r.queue, originAsked: r.origin_asked === 1, lastAt: r.last_at,
});
const toMessage = (r: any): MessageRow => ({
  seq: r.seq, personId: r.person_id, businessNumber: r.business_number, direction: r.direction, actor: r.actor, textRef: r.text_ref, at: r.at,
  basedOn: r.based_on ? JSON.parse(r.based_on) : [],
});
const one = <T>(row: unknown, map: (r: any) => T): T | null => (row ? map(row) : null);

export const getEntryPoint = (db: Db, code: string) => one(db.prepare('SELECT * FROM entry_points WHERE code = ?').get(code), toEntryPoint);
export const getEntryPointByNumber = (db: Db, n: string) => one(db.prepare('SELECT * FROM entry_points WHERE business_number = ?').get(n), toEntryPoint);
export const allEntryPoints = (db: Db) => db.prepare('SELECT * FROM entry_points ORDER BY code').all().map(toEntryPoint);
export const getLink = (db: Db, code: string) => one(db.prepare('SELECT * FROM links WHERE code = ?').get(code), toLink);
export const allLinks = (db: Db) => db.prepare('SELECT * FROM links ORDER BY code').all().map(toLink);
export const getOpportunity = (db: Db, id: string) => one(db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id), toOpportunity);
export const allOpportunities = (db: Db) => db.prepare('SELECT * FROM opportunities ORDER BY opened_seq').all().map(toOpportunity);
export const findOpenOpportunity = (db: Db, personId: string, product: string, unit: string) =>
  one(db.prepare("SELECT * FROM opportunities WHERE person_id = ? AND product = ? AND unit = ? AND status = 'open'").get(personId, product, unit), toOpportunity);
export const getTouch = (db: Db, seq: number) => one(db.prepare('SELECT * FROM touches WHERE seq = ?').get(seq), toTouch);
export const allTouches = (db: Db) => db.prepare('SELECT * FROM touches ORDER BY occurred_at, seq').all().map(toTouch);
export const touchesOfPerson = (db: Db, personId: string) =>
  db.prepare('SELECT * FROM touches WHERE person_id = ? ORDER BY occurred_at, seq').all(personId).map(toTouch);
export const getConversation = (db: Db, personId: string, businessNumber: string) =>
  one(db.prepare('SELECT * FROM conversations WHERE person_id = ? AND business_number = ?').get(personId, businessNumber), toConversation);
export const allConversations = (db: Db) =>
  db.prepare('SELECT * FROM conversations ORDER BY last_at DESC, person_id, business_number').all().map(toConversation);
export const allMessages = (db: Db) => db.prepare('SELECT * FROM messages ORDER BY seq').all().map(toMessage);
export const messagesOf = (db: Db, personId: string, businessNumber: string) =>
  db.prepare('SELECT * FROM messages WHERE person_id = ? AND business_number = ? ORDER BY at, seq').all(personId, businessNumber).map(toMessage);
export const touchesOfEntryPoint = (db: Db, code: string) =>
  db.prepare("SELECT * FROM touches WHERE json_extract(fields, '$.entryPoint.value') = ? ORDER BY occurred_at, seq").all(code).map(toTouch);

// Latest WhatsApp touch for this person and business number in the last 24 hours.
export function conversationTouch(db: Db, personId: string, businessNumber: string, at: string, hours = CONVERSATION_WINDOW_HOURS): TouchRow | null {
  const end = Date.parse(at);
  const start = end - hours * 3_600_000;
  const touches = db.prepare(`SELECT t.* FROM touches t JOIN events e ON e.seq = t.seq
    WHERE t.person_id = ? AND t.source = 'whatsapp' AND json_extract(e.payload, '$.businessNumber') = ?
    ORDER BY t.occurred_at, t.seq`).all(personId, businessNumber).map(toTouch);
  return touches.reverse().find((t) => Date.parse(t.occurredAt) <= end && Date.parse(t.occurredAt) >= start) ?? null;
}

export function personName(db: Db, personId: string): string | null {
  const row = db.prepare('SELECT display_ref FROM people WHERE id = ?').get(personId) as { display_ref: string | null } | undefined;
  return readPii(db, row?.display_ref ?? null);
}

// Best evidence of how the person found the Clinic: the latest touch with a known channel, else the latest touch.
export function originOf(db: Db, personId: string): Fields | null {
  const touches = touchesOfPerson(db, personId).filter((t) => !t.isTest);
  return (touches.findLast((t) => t.fields.channel.level !== 'unknown') ?? touches.at(-1))?.fields ?? null;
}

// Replies go out through the provider the person last wrote from.
export function lastInboundProvider(db: Db, personId: string, businessNumber: string): string | null {
  const row = db.prepare(`SELECT json_extract(e.payload, '$.provider') AS provider FROM messages m JOIN events e ON e.seq = m.seq
    WHERE m.person_id = ? AND m.business_number = ? AND m.direction = 'in' ORDER BY m.seq DESC LIMIT 1`).get(personId, businessNumber) as { provider: string } | undefined;
  return row?.provider ?? null;
}

// The class the clinic's latest message in this conversation asked the person to confirm, read from the log.
export function lastOfferOf(db: Db, personId: string, businessNumber: string): { product: string; unit: string } | null {
  const row = db.prepare(`SELECT json_extract(e.payload, '$.offer') AS offer FROM messages m JOIN events e ON e.seq = m.seq
    WHERE m.person_id = ? AND m.business_number = ? AND m.direction = 'out' ORDER BY m.seq DESC LIMIT 1`).get(personId, businessNumber) as { offer: string | null } | undefined;
  return row?.offer ? JSON.parse(row.offer) : null;
}

export const hasOpenOpportunity = (db: Db, personId: string): boolean =>
  db.prepare("SELECT 1 FROM opportunities WHERE person_id = ? AND status = 'open'").get(personId) !== undefined;

// Contact read from the vault, only for an action that needs it (sending a message, creating an ERP order).
export function contactOf(db: Db, personId: string): { name: string | null; phone: string | null; email: string | null } {
  const ref = (kind: string) => (db.prepare('SELECT pii_ref FROM identifiers WHERE person_id = ? AND kind = ? ORDER BY rowid LIMIT 1').get(personId, kind) as { pii_ref: string | null } | undefined)?.pii_ref ?? null;
  return { name: personName(db, personId), phone: readPii(db, ref('phone')), email: readPii(db, ref('email')) };
}
