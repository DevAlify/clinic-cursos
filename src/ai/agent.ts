import { classifyMessage, INTENT_LABEL, MODEL, routeFor, type Classification } from './classify.ts';
import type { Db } from '../core/db.ts';
import { findPerson } from '../core/identity.ts';
import { LEVEL_LABEL } from '../core/origin.ts';
import { conversationTouch } from '../core/queries.ts';
import type { EventRow, Fields, Rules } from '../core/types.ts';
import { callTool } from '../tools/registry.ts';

const reasonFor = (f: Fields, why: string) =>
  `${why} · ${f.entryPoint.value ? `entrou por ${f.entryPoint.value}` : 'entrada desconhecida'} · ${
    f.channel.value ? `canal ${f.channel.value} (${LEVEL_LABEL[f.channel.level]})` : 'canal desconhecido'}`;

const summaryFor = (c: Classification) =>
  `${INTENT_LABEL[c.intent]}${c.product ? ` · produto ${c.product.value}` : ''}${c.declaredChannel ? ` · conheceu por ${c.declaredChannel.value}` : ''}`;

// Live only. Its answers become events through the tools, so replay never calls it.
export function aiReaction(db: Db, e: EventRow<'whatsapp_message_received'>, text: string, rules: Rules): void {
  const actor = `ai:${MODEL}`;
  const personId = findPerson(db, e.payload.identifiers);
  const conversation = personId ? conversationTouch(db, personId, e.occurredAt) : null;
  if (!personId || !conversation) return;
  const c = classifyMessage(text);
  const unit = conversation.fields.unit.value;
  if (conversation.seq === e.seq) {
    const route = routeFor(c.intent, unit, c.confidence, rules.aiConfidenceThreshold);
    callTool(db, 'route_conversation', {
      messageSeq: e.seq, personId, queue: route.queue, reason: reasonFor(conversation.fields, route.why),
      summary: summaryFor(c), intent: c.intent, confidence: c.confidence, model: c.model,
    }, actor, rules, e.occurredAt);
  }
  if (c.declaredChannel && conversation.fields.channel.level === 'unknown') {
    callTool(db, 'record_declared_origin', {
      personId, touchSeq: conversation.seq, value: c.declaredChannel.value, quote: c.declaredChannel.quote,
      confidence: c.declaredChannel.confidence, triggerSeq: e.seq,
    }, actor, rules, e.occurredAt);
  }
  if (c.product && unit) {
    callTool(db, 'open_opportunity', { personId, product: c.product.value, unit, confidence: c.product.confidence, triggerSeq: e.seq }, actor, rules, e.occurredAt);
  }
}
