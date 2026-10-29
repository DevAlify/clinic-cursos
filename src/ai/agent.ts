import { classifyMessage, INTENT_LABEL, MODEL, routeFor, type Classification } from './classify.ts';
import type { Db } from '../core/db.ts';
import { findPerson } from '../core/identity.ts';
import { LEVEL_LABEL } from '../core/origin.ts';
import { conversationTouch } from '../core/queries.ts';
import type { EventRow, Fetch, Fields, Rules } from '../core/types.ts';
import { callTool } from '../tools/registry.ts';

const reasonFor = (f: Fields, why: string) =>
  `${why} · ${f.entryPoint.value ? `entrou por ${f.entryPoint.value}` : 'entrada desconhecida'} · ${
    f.channel.value ? `canal ${f.channel.value} (${LEVEL_LABEL[f.channel.level]})` : 'canal desconhecido'}`;

const summaryFor = (c: Classification) =>
  `${INTENT_LABEL[c.intent]}${c.product ? ` · produto ${c.product.value}` : ''}${c.declaredChannel ? ` · conheceu por ${c.declaredChannel.value}` : ''}`;

// Live only. Its answers become events through the tools, so replay never calls it.
export async function aiReaction(db: Db, e: EventRow<'whatsapp_message_received'>, text: string, rules: Rules, fetchImpl: Fetch = fetch): Promise<void> {
  const actor = `ai:${MODEL}`;
  const tool = (name: string, input: unknown) => callTool(db, name, input, actor, rules, e.occurredAt, fetchImpl);
  const personId = findPerson(db, e.payload.identifiers);
  const conversation = personId ? conversationTouch(db, personId, e.occurredAt) : null;
  if (!personId || !conversation) return;
  const c = classifyMessage(text);
  const unit = conversation.fields.unit.value;
  if (conversation.seq === e.seq) {
    const route = routeFor(c.intent, unit, c.confidence, rules.aiConfidenceThreshold);
    await tool('route_conversation', {
      messageSeq: e.seq, personId, queue: route.queue, reason: reasonFor(conversation.fields, route.why),
      summary: summaryFor(c), intent: c.intent, confidence: c.confidence, model: c.model,
    });
  }
  if (c.declaredChannel && conversation.fields.channel.level === 'unknown') {
    await tool('record_declared_origin', {
      personId, touchSeq: conversation.seq, value: c.declaredChannel.value, quote: c.declaredChannel.quote,
      confidence: c.declaredChannel.confidence, triggerSeq: e.seq,
    });
  }
  if (c.product && unit) {
    await tool('open_opportunity', { personId, product: c.product.value, unit, confidence: c.product.confidence, triggerSeq: e.seq });
  }
}
