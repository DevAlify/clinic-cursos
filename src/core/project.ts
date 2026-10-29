import { isCatalogProduct } from '../erp/catalog.ts';
import { attributionRule, computeAttribution } from './attribution.ts';
import type { Db } from './db.ts';
import { resolvePerson } from './identity.ts';
import { originFromForm, originFromWhatsApp, unknownFields, withDeclaredChannel } from './origin.ts';
import {
  conversationTouch, findOpenOpportunity, getEntryPoint, getEntryPointByNumber, getLink, getOpportunity, getTouch, touchesOfPerson,
} from './queries.ts';
import type { AnyEvent, Fields, Identifier, Rules } from './types.ts';

// Deterministic: no clock, no network, no AI. Same log + same rules = same projections.
export function project(db: Db, e: AnyEvent, rules: Rules): void {
  switch (e.type) {
    case 'entry_point_registered': {
      const p = e.payload;
      db.prepare('INSERT OR REPLACE INTO entry_points (code, unit, kind, label, owner, status, product, business_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(p.code, p.unit, p.kind, p.label, p.owner, p.status, p.product, p.businessNumber);
      return;
    }
    case 'entry_point_status_changed':
      db.prepare('UPDATE entry_points SET status = ? WHERE code = ?').run(e.payload.status, e.payload.code);
      return;
    case 'link_generated': {
      const p = e.payload;
      db.prepare('INSERT OR REPLACE INTO links (code, entry_point, channel, campaign, unit, product, destination, link_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(p.code, p.entryPoint, p.channel, p.campaign, p.unit, p.product, p.destination, p.linkType);
      return;
    }
    case 'qr_scanned':
      db.prepare('INSERT INTO scans (code, count) VALUES (?, 1) ON CONFLICT (code) DO UPDATE SET count = count + 1').run(e.payload.code);
      return;
    case 'form_submitted': {
      const p = e.payload;
      const personId = person(db, e, p.identifiers, p.displayRef);
      const ep = getEntryPoint(db, p.entryPoint);
      insertTouch(db, e, personId, 'form', originFromForm(p, ep), null, p.test);
      if (!p.test && ep?.product && isCatalogProduct(ep.product)) ensureOpportunity(db, e, personId, ep.product, ep.unit, rules);
      recomputeAttributions(db, personId, rules);
      return;
    }
    case 'whatsapp_message_received': {
      const p = e.payload;
      const personId = person(db, e, p.identifiers, p.displayRef);
      const link = p.code ? getLink(db, p.code) : null;
      if (link || p.referral || !conversationTouch(db, personId, e.occurredAt)) {
        insertTouch(db, e, personId, 'whatsapp', originFromWhatsApp(p, getEntryPointByNumber(db, p.businessNumber), link), p.code, false);
        if (link && isCatalogProduct(link.product)) ensureOpportunity(db, e, personId, link.product, link.unit, rules);
      }
      recomputeAttributions(db, personId, rules);
      return;
    }
    case 'erp_person_imported': {
      const p = e.payload;
      const personId = person(db, e, p.identifiers, p.displayRef);
      ensureRole(db, personId, p.role, p.unit, e.seq);
      insertTouch(db, e, personId, 'erp', unknownFields(`import:${p.batch}`), null, false);
      return;
    }
    case 'erp_sale_confirmed': {
      const p = e.payload;
      const personId = person(db, e, p.identifiers, p.displayRef);
      ensureRole(db, personId, 'student', p.unit, e.seq);
      const opp = p.opportunityId ? getOpportunity(db, p.opportunityId) : null;
      if (opp) {
        db.prepare("UPDATE opportunities SET status = 'won', erp_sale_id = ? WHERE id = ?").run(p.saleId, opp.id);
      } else {
        const suggestion = findOpenOpportunity(db, personId, p.product, p.unit)?.id ?? null;
        enqueue(db, e, 'reconciliation', 'reconciliation', personId, 'Venda do ERP sem oportunidade ligada', { saleId: p.saleId, product: p.product, unit: p.unit, suggestion });
      }
      return;
    }
    case 'conversation_routed': {
      const p = e.payload;
      enqueue(db, e, 'routing', p.queue, p.personId, p.reason, { intent: p.intent, confidence: p.confidence, model: p.model, summary: p.summary, messageSeq: p.messageSeq });
      return;
    }
    case 'origin_declared': {
      const p = e.payload;
      const touch = getTouch(db, p.touchSeq);
      if (!touch) throw new Error(`toque ${p.touchSeq} não existe`);
      if (accepted(e.actor, p.confidence, rules)) {
        db.prepare('UPDATE touches SET fields = ? WHERE seq = ?').run(JSON.stringify(withDeclaredChannel(touch.fields, p.value, e.actor, p.quote)), touch.seq);
        recomputeAttributions(db, touch.personId, rules);
      } else {
        enqueue(db, e, 'origin_review', 'triage', p.personId, `Origem declarada com confiança baixa (${p.confidence})`, { touchSeq: p.touchSeq, value: p.value, quote: p.quote });
      }
      return;
    }
    case 'interest_declared': {
      const p = e.payload;
      if (accepted(e.actor, p.confidence, rules) && isCatalogProduct(p.product)) {
        ensureOpportunity(db, e, p.personId, p.product, p.unit, rules);
        recomputeAttributions(db, p.personId, rules);
      } else {
        enqueue(db, e, 'interest_review', 'triage', p.personId, `Interesse a confirmar: ${p.product} · ${p.unit}`, { product: p.product, unit: p.unit, confidence: p.confidence });
      }
      return;
    }
    case 'merge_proposed':
      enqueue(db, e, 'merge_review', 'identity-review', e.payload.personIds[0], e.payload.reason, { personIds: e.payload.personIds });
      return;
    case 'alert_raised': {
      const p = e.payload;
      db.prepare('INSERT INTO alerts (entry_point, kind, message, action, owner, created_seq) VALUES (?, ?, ?, ?, ?, ?)')
        .run(p.entryPoint, p.kind, p.message, p.action, p.owner, e.seq);
      return;
    }
  }
}

const accepted = (actor: string, confidence: number | null, rules: Rules) =>
  !actor.startsWith('ai:') || (confidence ?? 0) >= rules.aiConfidenceThreshold;

function person(db: Db, e: AnyEvent, identifiers: Identifier[], displayRef: string | null): string {
  const r = resolvePerson(db, identifiers, e.seq, displayRef);
  for (const other of r.conflictWith) {
    enqueue(db, e, 'merge_review', 'identity-review', r.personId, 'Identificadores apontam para fichas diferentes', { personIds: [r.personId, other] });
  }
  return r.personId;
}

function insertTouch(db: Db, e: AnyEvent, personId: string, source: string, fields: Fields, code: string | null, isTest: boolean): void {
  db.prepare('INSERT INTO touches (seq, person_id, occurred_at, source, fields, code, is_test) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(e.seq, personId, e.occurredAt, source, JSON.stringify(fields), code, isTest ? 1 : 0);
}

function ensureRole(db: Db, personId: string, role: string, unit: string, seq: number): void {
  db.prepare('INSERT OR IGNORE INTO roles (person_id, role, unit, source_seq) VALUES (?, ?, ?, ?)').run(personId, role, unit, seq);
}

function ensureOpportunity(db: Db, e: AnyEvent, personId: string, product: string, unit: string, rules: Rules): string {
  const open = findOpenOpportunity(db, personId, product, unit);
  if (open) return open.id;
  const id = `O${e.seq}`;
  db.prepare("INSERT INTO opportunities (id, person_id, product, unit, status, opened_seq, opened_at, attribution_rule) VALUES (?, ?, ?, ?, 'open', ?, ?, ?)")
    .run(id, personId, product, unit, e.seq, e.occurredAt, attributionRule(rules.attributionWindowDays));
  ensureRole(db, personId, 'lead', unit, e.seq);
  const pending = db.prepare("SELECT id, details FROM queue_items WHERE kind = 'reconciliation' AND status = 'open' AND person_id = ?").all(personId) as { id: number; details: string }[];
  for (const item of pending) {
    const d = JSON.parse(item.details) as { product: string; unit: string; suggestion: string | null };
    if (d.product === product && d.unit === unit && !d.suggestion) {
      db.prepare('UPDATE queue_items SET details = ? WHERE id = ?').run(JSON.stringify({ ...d, suggestion: id }), item.id);
    }
  }
  return id;
}

function recomputeAttributions(db: Db, personId: string, rules: Rules): void {
  const touches = touchesOfPerson(db, personId).map((t) => ({ seq: t.seq, occurredAt: t.occurredAt, channelLevel: t.fields.channel.level, isTest: t.isTest }));
  const opps = db.prepare('SELECT id, opened_at FROM opportunities WHERE person_id = ?').all(personId) as { id: string; opened_at: string }[];
  for (const o of opps) {
    const a = computeAttribution(touches, o.opened_at, rules.attributionWindowDays);
    db.prepare('UPDATE opportunities SET first_touch_seq = ?, last_touch_seq = ?, attribution_rule = ? WHERE id = ?').run(a.firstSeq, a.lastSeq, a.rule, o.id);
  }
}

function enqueue(db: Db, e: AnyEvent, kind: string, queue: string, personId: string | null, reason: string, details: object): void {
  db.prepare('INSERT INTO queue_items (kind, queue, person_id, reason, details, created_seq) VALUES (?, ?, ?, ?, ?, ?)')
    .run(kind, queue, personId, reason, JSON.stringify(details), e.seq);
}
