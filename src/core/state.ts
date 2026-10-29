import type { Db } from './db.ts';
import { listEvents } from './log.ts';
import { readPii } from './pii.ts';
import {
  allConversations, allEntryPoints, allLinks, allMessages, allOpportunities, allTouches, getConversation, getTouch, messagesOf,
  originOf, touchesOfEntryPoint,
  type ConversationRow, type EntryPointRow, type LinkRow, type MessageRow, type OpportunityRow, type TouchRow,
} from './queries.ts';
import type { AnyEvent, Fields, Level, Rules } from './types.ts';

export interface PersonView { id: string; name: string | null; roles: { role: string; unit: string }[]; identifierKinds: string[] }
export interface QueueView {
  id: number; kind: string; queue: string; personId: string | null; reason: string; details: Record<string, unknown>; status: string; createdSeq: number;
}
// Messages without the text: the text only leaves the vault through the conversation route.
export type MessageView = Omit<MessageRow, 'textRef'>;
export interface EventView { seq: number; type: string; occurredAt: string; actor: string; source: string; label: string }
export interface AlertView { id: number; entryPoint: string; kind: string; message: string; action: string; owner: string; createdSeq: number }
export type LevelMix = { total: number } & Record<Level, number>;
export interface Coverage {
  byUnit: Record<string, LevelMix>;
  byChannel: Record<string, number>;
  byCampaign: Record<string, number>;
  byEntryPoint: { code: string; label: string; status: string; total: number; campaignObserved: number }[];
}
export interface State {
  rules: Rules; events: EventView[]; people: PersonView[]; touches: TouchRow[]; opportunities: OpportunityRow[];
  queue: QueueView[]; alerts: AlertView[]; entryPoints: EntryPointRow[]; links: LinkRow[];
  scans: { code: string; count: number }[]; duplicates: { source: string; externalId: string; count: number }[];
  quarantine: { seq: number; error: string }[]; coverage: Coverage;
  conversations: ConversationRow[]; messages: MessageView[];
}

export function describeEvent(e: AnyEvent): string {
  switch (e.type) {
    case 'entry_point_registered': return `Ponto de entrada cadastrado: ${e.payload.code}`;
    case 'entry_point_status_changed': return `Ponto ${e.payload.code}: ${e.payload.status}`;
    case 'link_generated': return `Link gerado: ${e.payload.code} para ${e.payload.entryPoint}`;
    case 'form_submitted': return `Formulário em ${e.payload.entryPoint}${e.payload.test ? ' (teste)' : ''}`;
    case 'whatsapp_message_received': return `WhatsApp recebido em ${e.payload.businessNumber}${e.payload.code ? ` com o código ${e.payload.code}` : ''}`;
    case 'qr_scanned': return `QR lido: ${e.payload.code}`;
    case 'erp_person_imported': return `Importação do ERP (${e.payload.batch})`;
    case 'erp_sale_confirmed': return `Venda confirmada no ERP: ${e.payload.saleId}`;
    case 'conversation_routed': return `Conversa encaminhada para ${e.payload.queue}`;
    case 'origin_declared': return `Origem declarada: ${e.payload.value}`;
    case 'interest_declared': return `Interesse: ${e.payload.product} · ${e.payload.unit}`;
    case 'merge_proposed': return 'Fusão de fichas proposta';
    case 'alert_raised': return `Alerta em ${e.payload.entryPoint}`;
    case 'whatsapp_message_sent': return `WhatsApp enviado por ${e.payload.businessNumber}${e.payload.basedOn.length ? ` com dado de ${e.payload.basedOn.map((b) => b.tool).join(', ')}` : ''}`;
    case 'conversation_mode_changed': return `Conversa em modo ${e.payload.mode === 'human' ? 'humano' : 'IA'}: ${e.payload.reason}`;
    case 'opportunity_stage_changed': return `Oportunidade ${e.payload.opportunityId}: etapa ${e.payload.stage}`;
    case 'erp_order_created': return `Pedido ${e.payload.orderId} criado no ERP para ${e.payload.opportunityId}`;
  }
}

export function getCoverage(db: Db): Coverage {
  const byUnit: Record<string, LevelMix> = {};
  const byChannel: Record<string, number> = {};
  const byCampaign: Record<string, number> = {};
  const released = new Set(allEntryPoints(db).filter((ep) => ep.status === 'released').map((ep) => ep.code));
  for (const o of allOpportunities(db)) {
    const t = o.firstTouchSeq === null ? null : getTouch(db, o.firstTouchSeq);
    const level: Level = t?.fields.channel.level ?? 'unknown';
    const mix = (byUnit[o.unit] ??= { total: 0, observed: 0, declared: 0, inferred: 0, unknown: 0 });
    mix.total += 1;
    mix[level] += 1;
    const channel = t?.fields.channel.value ?? 'desconhecido';
    byChannel[channel] = (byChannel[channel] ?? 0) + 1;
    // Campaign numbers count only leads from released entry points.
    const campaign = t?.fields.campaign.value;
    const point = t?.fields.entryPoint.value;
    if (campaign && point && released.has(point)) byCampaign[campaign] = (byCampaign[campaign] ?? 0) + 1;
  }
  const byEntryPoint = allEntryPoints(db).map((ep) => {
    const touches = touchesOfEntryPoint(db, ep.code).filter((t) => !t.isTest);
    return { code: ep.code, label: ep.label, status: ep.status, total: touches.length, campaignObserved: touches.filter((t) => t.fields.campaign.level === 'observed').length };
  });
  return { byUnit, byChannel, byCampaign, byEntryPoint };
}

const personView = (db: Db, p: { id: string; display_ref: string | null }): PersonView => ({
  id: p.id,
  name: readPii(db, p.display_ref),
  roles: db.prepare('SELECT role, unit FROM roles WHERE person_id = ? ORDER BY source_seq, role').all(p.id) as { role: string; unit: string }[],
  identifierKinds: (db.prepare('SELECT kind FROM identifiers WHERE person_id = ? ORDER BY kind').all(p.id) as { kind: string }[]).map((r) => r.kind),
});
const withoutText = ({ textRef: _, ...m }: MessageRow): MessageView => m;

export function getState(db: Db, rules: Rules): State {
  const people = (db.prepare('SELECT id, display_ref FROM people ORDER BY created_seq').all() as { id: string; display_ref: string | null }[]).map((p) => personView(db, p));
  const queue = (db.prepare('SELECT * FROM queue_items ORDER BY id').all() as {
    id: number; kind: string; queue: string; person_id: string | null; reason: string; details: string; status: string; created_seq: number;
  }[]).map((q) => ({ id: q.id, kind: q.kind, queue: q.queue, personId: q.person_id, reason: q.reason, details: JSON.parse(q.details), status: q.status, createdSeq: q.created_seq }));
  return {
    rules,
    events: listEvents(db).map((e) => ({ seq: e.seq, type: e.type, occurredAt: e.occurredAt, actor: e.actor, source: e.source, label: describeEvent(e) })),
    people,
    touches: allTouches(db),
    opportunities: allOpportunities(db),
    queue,
    alerts: db.prepare('SELECT id, entry_point AS entryPoint, kind, message, action, owner, created_seq AS createdSeq FROM alerts ORDER BY id').all() as AlertView[],
    entryPoints: allEntryPoints(db),
    links: allLinks(db),
    scans: db.prepare('SELECT code, count FROM scans ORDER BY code').all() as { code: string; count: number }[],
    duplicates: db.prepare('SELECT source, external_id AS externalId, count FROM inbound_duplicates ORDER BY source, external_id').all() as { source: string; externalId: string; count: number }[],
    quarantine: db.prepare('SELECT seq, error FROM quarantine ORDER BY seq').all() as { seq: number; error: string }[],
    coverage: getCoverage(db),
    conversations: allConversations(db),
    messages: allMessages(db).map(withoutText),
  };
}

const personRow = (db: Db, id: string) => db.prepare('SELECT id, display_ref FROM people WHERE id = ?').get(id) as { id: string; display_ref: string | null } | undefined;

export interface ConversationSummary extends ConversationRow {
  name: string | null; origin: Fields | null; lastMessage: Omit<MessageView, 'personId' | 'businessNumber'> | null;
}

// Inbox list: no message text here either.
export function listConversations(db: Db): ConversationSummary[] {
  return allConversations(db).map((c) => {
    const last = messagesOf(db, c.personId, c.businessNumber).at(-1);
    const p = personRow(db, c.personId);
    return {
      ...c, name: p ? readPii(db, p.display_ref) : null, origin: originOf(db, c.personId),
      lastMessage: last ? { seq: last.seq, direction: last.direction, actor: last.actor, at: last.at, basedOn: last.basedOn } : null,
    };
  });
}

// The only place where message text leaves the vault: one conversation, opened by the attendant.
export function getConversationDetail(db: Db, personId: string, businessNumber: string) {
  const conversation = getConversation(db, personId, businessNumber);
  const p = personRow(db, personId);
  if (!conversation || !p) return null;
  return {
    conversation,
    person: { ...personView(db, p), origin: originOf(db, personId) },
    messages: messagesOf(db, personId, businessNumber).map(({ textRef, ...m }) => ({ ...m, text: readPii(db, textRef) })),
    opportunities: allOpportunities(db).filter((o) => o.personId === personId),
  };
}
