import { classifyMessage, INTENT_LABEL, MODEL, routeFor, type Classification } from './classify.ts';
import { composeReply } from './reply.ts';
import type { Db } from '../core/db.ts';
import { findPerson } from '../core/identity.ts';
import { LEVEL_LABEL } from '../core/origin.ts';
import { conversationTouch, getConversation, originOf, personName } from '../core/queries.ts';
import type { EventRow, Fetch, Fields, Rules } from '../core/types.ts';
import { isCatalogProduct, type CourseOffer } from '../erp/catalog.ts';
import { act, callTool, OFFER_NOT_FOUND, sendMessage, type ToolContext } from '../tools/registry.ts';

const reasonFor = (f: Fields, why: string) =>
  `${why} · ${f.entryPoint.value ? `entrou por ${f.entryPoint.value}` : 'entrada desconhecida'} · ${
    f.channel.value ? `canal ${f.channel.value} (${LEVEL_LABEL[f.channel.level]})` : 'canal desconhecido'}`;

const summaryFor = (c: Classification) =>
  `${INTENT_LABEL[c.intent]}${c.product ? ` · produto ${c.product.value}` : ''}${c.declaredChannel ? ` · conheceu por ${c.declaredChannel.value}` : ''}`;

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Live only. Its answers become events through the tools, so replay never calls it (nor the provider).
export async function aiReaction(db: Db, e: EventRow<'whatsapp_message_received'>, text: string, rules: Rules, fetchImpl: Fetch = fetch): Promise<void> {
  const actor = `ai:${MODEL}`;
  const tool = (name: string, input: unknown) => callTool(db, name, input, actor, rules, e.occurredAt, fetchImpl);
  const personId = findPerson(db, e.payload.identifiers);
  const conversation = personId ? conversationTouch(db, personId, e.payload.businessNumber, e.occurredAt) : null;
  if (!personId || !conversation) return;
  const c = classifyMessage(text);
  const unit = conversation.fields.unit.value;
  const route = routeFor(c.intent, unit, c.confidence, rules.aiConfidenceThreshold);
  const sensitive = c.confidence >= rules.aiConfidenceThreshold && (c.intent === 'clinical_question' || c.intent === 'complaint');
  const businessNumber = e.payload.businessNumber;
  const state = getConversation(db, personId, businessNumber);
  const purchaseFromTriage = state?.queue === 'triage' && c.intent === 'course_purchase' && route.queue !== 'triage';
  // Route new conversations, recognized purchases leaving triage, and sensitive subjects needing a hand-off.
  if (conversation.seq === e.seq || sensitive || purchaseFromTriage) {
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

  if (!state || state.mode === 'human') return;
  const touchProduct = conversation.fields.product.value;
  const product = c.product?.value ?? (touchProduct && isCatalogProduct(touchProduct) ? touchProduct : null);
  let offer: CourseOffer | null = null;
  let erpUnavailable = false;
  if (c.intent === 'course_purchase' && c.confidence >= rules.aiConfidenceThreshold && product && unit) {
    const r = await tool('get_course_offer', { product, unit });
    if (r.ok) offer = r.result as CourseOffer;
    else if (r.error !== OFFER_NOT_FOUND) {
      erpUnavailable = true;
      console.error(`IA sem dado do ERP na mensagem ${e.seq} (${product} · ${unit}): ${r.error}`);
    }
  }
  const reply = composeReply({
    classification: c, conversation: state, person: { name: personName(db, personId) },
    fields: originOf(db, personId) ?? conversation.fields, offer, erpUnavailable, threshold: rules.aiConfidenceThreshold, now: e.occurredAt,
  });
  if (!reply) return;
  const ctx: ToolContext = { db, actor, rules, now: e.occurredAt, fetch: fetchImpl };
  try {
    await sendMessage(ctx, { personId, businessNumber, text: reply.text, basedOn: reply.basedOn, askOrigin: reply.askOrigin === true, key: `reply:${e.seq}` });
  } catch (err) {
    // The message stays in the inbox, routed and visible; a person answers it.
    console.error(`resposta da IA não enviada (mensagem ${e.seq}, pessoa ${personId}): ${errText(err)}`);
  }
  if (reply.setMode) {
    act(ctx, 'conversation_mode_changed', `mode:${e.seq}`, {
      personId, businessNumber, mode: 'human', reason: erpUnavailable ? 'o ERP não respondeu' : route.why,
    });
  }
}
