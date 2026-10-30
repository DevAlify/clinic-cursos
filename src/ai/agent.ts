import { classifyMessage, INTENT_LABEL, isConfirmation, MODEL, routeFor, unitMention, type Classification } from './classify.ts';
import { composeReply } from './reply.ts';
import type { Db } from '../core/db.ts';
import { findPerson } from '../core/identity.ts';
import { LEVEL_LABEL } from '../core/origin.ts';
import { conversationTouch, getConversation, hasOpenOpportunity, lastOfferOf, originOf, personName } from '../core/queries.ts';
import type { EventRow, Fetch, Fields, Rules, Unit } from '../core/types.ts';
import { isCatalogProduct, type CourseOffer } from '../erp/catalog.ts';
import { getCatalog } from '../erp/client.ts';
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
  const businessNumber = e.payload.businessNumber;
  const state = getConversation(db, personId, businessNumber);
  let c = classifyMessage(text);
  let unit = conversation.fields.unit.value;
  // A "sim" right after the class the clinic offered (read from the log) is interest in that class and unit.
  const offered = state?.mode === 'ai' && isConfirmation(text) ? lastOfferOf(db, personId, businessNumber) : null;
  if (offered) {
    c = { ...c, intent: 'course_purchase', confidence: 0.91, product: { value: offered.product, confidence: 0.9 } };
    unit = offered.unit;
  }
  const route = routeFor(c.intent, unit, c.confidence, rules.aiConfidenceThreshold);
  const sensitive = c.confidence >= rules.aiConfidenceThreshold && (c.intent === 'clinical_question' || c.intent === 'complaint');
  const purchaseFromTriage = state?.queue === 'triage' && c.intent === 'course_purchase' && route.queue !== 'triage';
  // Route new conversations, recognized purchases leaving triage, and sensitive subjects needing a hand-off.
  if (conversation.seq === e.seq || sensitive || purchaseFromTriage || offered) {
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
  // Without a course in the picture the agent reads the whole catalog: it lists the open classes (generic interest,
  // or the answer to the origin question) or offers the class of the unit the person named.
  let catalog: CourseOffer[] | undefined;
  let unitOffer: CourseOffer | undefined;
  const confident = c.confidence >= rules.aiConfidenceThreshold;
  const namedUnit = unitMention(text);
  const unitOnly = namedUnit !== null && ((c.intent === 'course_purchase' && confident) || (c.intent === 'other' && text.trim().split(/\s+/).length <= 4));
  const unsure = c.intent === 'other' || !confident;
  const originAnswer = unsure && c.declaredChannel !== null && state.originAsked && !hasOpenOpportunity(db, personId);
  if (!product && (unitOnly || (c.intent === 'course_purchase' && confident) || originAnswer)) {
    try {
      const all = await getCatalog({ fetch: fetchImpl });
      if (unitOnly) unitOffer = all.find((o) => o.unit === namedUnit);
      const open = all.filter((o) => o.seatsLeft > 0);
      if (open.length) catalog = open;
    } catch (err) {
      erpUnavailable = true;
      console.error(`IA sem dado do ERP na mensagem ${e.seq} (catálogo): ${errText(err)}`);
    }
  }
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
    fields: originOf(db, personId) ?? conversation.fields, offer, erpUnavailable, catalog, unitOffer, threshold: rules.aiConfidenceThreshold, now: e.occurredAt,
  });
  if (!reply) return;
  const ctx: ToolContext = { db, actor, rules, now: e.occurredAt, fetch: fetchImpl };
  try {
    await sendMessage(ctx, { personId, businessNumber, text: reply.text, basedOn: reply.basedOn, askOrigin: reply.askOrigin === true, key: `reply:${e.seq}`, ...(reply.offer ? { offer: { ...reply.offer, unit: reply.offer.unit as Unit } } : {}) });
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
