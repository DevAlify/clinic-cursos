import { z } from 'zod';
import { DEFAULT_RULES } from '../config.ts';
import { appendAndProject } from '../core/apply.ts';
import type { Db } from '../core/db.ts';
import { ENTRY_POINT_STATUSES, UNITS, type EventType, type Payload } from '../core/events.ts';
import { maxSeq } from '../core/log.ts';
import { findOpenOpportunity, getEntryPoint, getOpportunity, getTouch } from '../core/queries.ts';
import { getCoverage } from '../core/state.ts';
import type { AnyEventInput, Fetch, Rules } from '../core/types.ts';
import { getOffer } from '../erp/client.ts';

export type Role = 'attendant' | 'ai' | 'marketing' | 'owner' | 'monitor' | 'manager';
const ROLES: Role[] = ['attendant', 'ai', 'marketing', 'owner', 'monitor', 'manager'];

export function roleOf(actor: string): Role | null {
  const role = actor.split(':')[0] as Role;
  return ROLES.includes(role) ? role : null;
}

export interface ToolContext { db: Db; actor: string; rules: Rules; now: string; fetch: Fetch }
interface ToolDef {
  description: string;
  kind: 'read' | 'action';
  roles: Role[];
  approval: 'none' | 'auto' | 'auto_above_confidence' | 'human';
  input: z.ZodType;
  run(ctx: ToolContext, input: never): unknown;
}
export type ToolResult = { ok: true; result: unknown } | { ok: false; error: string };
export const OFFER_NOT_FOUND = 'oferta não encontrada no ERP';

// Every action is an event in the log, keyed by what triggered it: repeating it changes nothing.
// If the projection fails the event stays in the log (quarantined), but the caller must learn the action failed.
export function act<T extends EventType>(ctx: ToolContext, type: T, key: string, payload: Payload<T>) {
  const r = appendAndProject(ctx.db, { source: 'tool', externalId: key, type, occurredAt: ctx.now, actor: ctx.actor, payload } as AnyEventInput, ctx.rules);
  if (r.error !== null) throw new Error(`a ação ${type} foi gravada no log, mas a projeção falhou: ${r.error}`);
  return { recorded: !r.duplicate, seq: r.event?.seq ?? null };
}

const unit = z.enum(UNITS);
const confidence = z.number().min(0).max(1).nullable();
const ALL: Role[] = ROLES;

export const tools: Record<string, ToolDef> = {
  explain_origin: {
    description: 'Mostra as provas por trás da origem de uma oportunidade.',
    kind: 'read', roles: ALL, approval: 'none',
    input: z.object({ opportunityId: z.string() }),
    run: ({ db }, { opportunityId }: { opportunityId: string }) => {
      const o = getOpportunity(db, opportunityId);
      if (!o) throw new Error(`oportunidade ${opportunityId} não existe`);
      return { opportunity: o, rule: o.attributionRule, first: o.firstTouchSeq === null ? null : getTouch(db, o.firstTouchSeq), last: o.lastTouchSeq === null ? null : getTouch(db, o.lastTouchSeq) };
    },
  },
  origin_coverage: {
    description: 'Cobertura de origem por unidade, canal e ponto de entrada.',
    kind: 'read', roles: ALL, approval: 'none',
    input: z.object({}),
    run: ({ db }) => getCoverage(db),
  },
  get_course_offer: {
    description: 'Curso, preço e vagas lidos do ERP, com data e hora da leitura.',
    kind: 'read', roles: ['attendant', 'ai', 'manager'], approval: 'none',
    input: z.object({ product: z.string(), unit }),
    run: async ({ now, fetch }, { product, unit: u }: { product: string; unit: string }) => {
      const offer = await getOffer(product, u, { fetch });
      if (!offer) throw new Error(OFFER_NOT_FOUND);
      return { ...offer, source: 'erp-simulado', readAt: now };
    },
  },
  route_conversation: {
    description: 'Manda a conversa para a fila certa, com motivo e resumo.',
    kind: 'action', roles: ['ai', 'attendant'], approval: 'auto',
    input: z.object({ messageSeq: z.number().int(), personId: z.string(), queue: z.string(), reason: z.string(), summary: z.string(), intent: z.string(), confidence: z.number().min(0).max(1), model: z.string() }),
    run: (ctx, input: Payload<'conversation_routed'>) => act(ctx, 'conversation_routed', `route:${input.messageSeq}`, input),
  },
  open_opportunity: {
    description: 'Abre a oportunidade quando o interesse fica claro.',
    kind: 'action', roles: ['ai', 'attendant'], approval: 'auto_above_confidence',
    input: z.object({ personId: z.string(), product: z.string(), unit, confidence, triggerSeq: z.number().int() }),
    run: (ctx, i: { personId: string; product: string; unit: 'sp' | 'rj' | 'cps' | 'online'; confidence: number | null; triggerSeq: number }) => {
      const r = act(ctx, 'interest_declared', `interest:${i.triggerSeq}:${roleOf(ctx.actor)}`, { personId: i.personId, product: i.product, unit: i.unit, confidence: i.confidence });
      return { ...r, opportunityId: findOpenOpportunity(ctx.db, i.personId, i.product, i.unit)?.id ?? null };
    },
  },
  record_declared_origin: {
    description: 'Grava a origem que a pessoa declarou.',
    kind: 'action', roles: ['ai', 'attendant'], approval: 'auto_above_confidence',
    input: z.object({ personId: z.string(), touchSeq: z.number().int(), value: z.string().min(1), quote: z.string(), confidence, triggerSeq: z.number().int() }),
    run: (ctx, i: { personId: string; touchSeq: number; value: string; quote: string; confidence: number | null; triggerSeq: number }) => {
      // Checked before the event is written: a touch of another person (or none) must never reach the log.
      if (getTouch(ctx.db, i.touchSeq)?.personId !== i.personId) throw new Error(`o contato ${i.touchSeq} não pertence à pessoa ${i.personId}`);
      return act(ctx, 'origin_declared', `origin:${i.triggerSeq}:${roleOf(ctx.actor)}`, { personId: i.personId, touchSeq: i.touchSeq, value: i.value, quote: i.quote, confidence: i.confidence });
    },
  },
  propose_merge: {
    description: 'Sugere unir duas fichas; a união é sempre aprovada por uma pessoa.',
    kind: 'action', roles: ['ai', 'attendant'], approval: 'human',
    input: z.object({ personIds: z.tuple([z.string(), z.string()]), reason: z.string() }),
    run: (ctx, i: Payload<'merge_proposed'>) => act(ctx, 'merge_proposed', `merge:${[...i.personIds].sort().join('+')}`, i),
  },
  set_entry_point_status: {
    description: 'Pausa (em auditoria) ou libera um ponto de entrada.',
    kind: 'action', roles: ['monitor', 'owner', 'manager'], approval: 'auto',
    input: z.object({ code: z.string(), status: z.enum(ENTRY_POINT_STATUSES), reason: z.string() }),
    run: (ctx, i: Payload<'entry_point_status_changed'>) => {
      const ep = getEntryPoint(ctx.db, i.code);
      if (!ep) throw new Error(`ponto de entrada desconhecido: ${i.code}`);
      if (roleOf(ctx.actor) === 'monitor' && i.status !== 'auditing') throw new Error('o monitor só pode pausar o ponto');
      if (ep.status === i.status) return { changed: false, status: ep.status };
      if (i.status === 'released') {
        const lastAlert = (ctx.db.prepare('SELECT MAX(created_seq) AS seq FROM alerts WHERE entry_point = ?').get(i.code) as { seq: number | null }).seq;
        const passed = lastAlert === null || ctx.db.prepare(
          "SELECT 1 FROM touches WHERE is_test = 1 AND seq > ? AND json_extract(fields, '$.entryPoint.value') = ? AND json_extract(fields, '$.campaign.level') = 'observed'",
        ).get(lastAlert, i.code) !== undefined;
        if (!passed) throw new Error('liberar exige um lead de teste com campanha observada depois do último alerta');
      }
      return { changed: true, ...act(ctx, 'entry_point_status_changed', `status:${i.code}:${i.status}:${maxSeq(ctx.db)}`, i) };
    },
  },
};

export async function callTool(
  db: Db, name: string, rawInput: unknown, actor: string, rules: Rules = DEFAULT_RULES, now = new Date().toISOString(), fetchImpl: Fetch = fetch,
): Promise<ToolResult> {
  const tool = Object.hasOwn(tools, name) ? tools[name] : undefined;
  if (!tool) return { ok: false, error: `ferramenta desconhecida: ${name}` };
  const role = roleOf(actor);
  if (!role || !tool.roles.includes(role)) return { ok: false, error: `permissão negada: ${actor || 'sem ator'} não pode usar ${name}` };
  const parsed = tool.input.safeParse(rawInput ?? {});
  if (!parsed.success) return { ok: false, error: `entrada inválida: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}` };
  try {
    return { ok: true, result: await tool.run({ db, actor, rules, now, fetch: fetchImpl }, parsed.data as never) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
