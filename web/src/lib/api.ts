// Single place that talks to the core. Types follow the Plano v2 contract (tarefas 16 e 17):
// when a route's real shape differs, adjust it here and nothing else.
import type { AttributionChange } from '../../../src/core/replay.ts';
import type { State } from '../../../src/core/state.ts';
import type { Fields, Level, Unit } from '../../../src/core/types.ts';
import { STAGES, type Stage } from './format.ts';

export type { AttributionChange, Fields, Level, Stage, Unit };

export const ATTENDANT = 'attendant:joana';

// ---- types -----------------------------------------------------------------

// The v2 projection adds stage and ERP order to opportunities; optional here so the screen also works on the v1 core.
export type OpportunityRow = State['opportunities'][number] & { stage?: Stage; erpOrderId?: string | null };
export type AppState = Omit<State, 'opportunities'> & { opportunities: OpportunityRow[] };

export interface StepView { id: string; who: string; label: string; ran: boolean }
export interface SimulateResult { ok: boolean; status: number }
export interface ReplayResult { changes: AttributionChange[]; applied: boolean; rules: State['rules'] }

export type Mode = 'ai' | 'human';
export type Direction = 'in' | 'out';
export type LevelMix = { total: number } & Record<Level, number>;
export interface BasedOn { tool: string; readAt: string }
export type V2Opportunity = OpportunityRow & { stage: Stage; erpOrderId: string | null };

interface ConversationRow { personId: string; businessNumber: string; mode: Mode; queue: string | null; originAsked: boolean; lastAt: string }
// The list carries no message text: it only leaves the vault through the conversation route.
export interface ConversationItem extends ConversationRow {
  name: string | null; origin: Fields | null;
  lastMessage: { seq: number; direction: Direction; actor: string; at: string; basedOn: BasedOn[] } | null;
}
export interface ThreadMessage { seq: number; personId: string; businessNumber: string; direction: Direction; actor: string; at: string; basedOn: BasedOn[]; text: string | null }
export interface ConversationDetail {
  conversation: ConversationRow;
  person: { id: string; name: string | null; roles: { role: string; unit: string }[]; identifierKinds: string[]; origin: Fields | null };
  messages: ThreadMessage[];
  opportunities: V2Opportunity[];
}
export interface PipelineCard {
  id: string; personId: string; name: string | null; product: string; unit: string; stage: Stage; status: string; openedAt: string;
  origin: Fields | null; erpOrderId: string | null; erpSaleId: string | null;
}
export type Pipeline = Record<Stage, PipelineCard[]>;
export interface CampaignRow {
  campaign: string; unit: string | null; product: string | null; leads: number; opportunities: number; won: number;
  levels: LevelMix; seatsLeft: number | null; spend: number | null; costPerLead: number | null; costPerSale: number | null;
}

export interface CatalogItem { product: string; unit: Unit; name: string; price: number; seatsLeft: number; nextClass: string }
export type GuideStatus = 'done' | 'current' | 'todo';
export interface GuideStep { id: 'origin' | 'message' | 'attendance' | 'erp' | 'crm'; status: GuideStatus; hasOpportunity?: boolean }
export interface Guide { total: number; done: number; steps: GuideStep[] }

// ---- transport -------------------------------------------------------------

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
// A 404 on a GET means the route does not exist yet (core v2 not integrated): the screen shows a calm empty state.
export const isUnavailable = (e: unknown): boolean => e instanceof ApiError && e.status === 404;
export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : 'Algo deu errado. Tente de novo.');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError('Sem conexão com o sistema central. Confira se ele está no ar e tente de novo.', 0);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : `Erro ${res.status} ao falar com o sistema central.`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

const post = <T>(path: string, body?: unknown, headers: Record<string, string> = {}) =>
  request<T>(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

// Routes may answer a bare array or an object that wraps it; accept both.
function list<T>(raw: unknown, key: string): T[] {
  if (Array.isArray(raw)) return raw as T[];
  const inner = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)[key] : undefined;
  return Array.isArray(inner) ? (inner as T[]) : [];
}

// ---- existing routes (Bastidores) ------------------------------------------

export const getState = () => request<AppState>('/api/state');
export const getSteps = () => request<StepView[]>('/api/steps');
export const simulate = (stepId: string) => post<SimulateResult>(`/api/simulate/${encodeURIComponent(stepId)}`);
export const reset = () => post<{ ok: boolean }>('/api/reset');
export const replay = (windowDays: number, apply: boolean) => post<ReplayResult>('/api/replay', { windowDays, apply });

// ---- v2 routes (Atendimento, CRM, Campanhas) -------------------------------

export const getConversations = async (): Promise<ConversationItem[]> =>
  list<ConversationItem>(await request<unknown>('/api/conversations'), 'conversations');
export const getConversation = (personId: string, businessNumber: string) =>
  request<ConversationDetail>(`/api/conversations/${encodeURIComponent(personId)}/${encodeURIComponent(businessNumber)}`);
export const getCampaigns = async (): Promise<CampaignRow[]> => list<CampaignRow>(await request<unknown>('/api/campaigns'), 'campaigns');

// Cards come grouped by stage; newest first, so what just happened in the demo is on top of its column.
export async function getPipeline(): Promise<Pipeline> {
  const raw = await request<unknown>('/api/pipeline');
  const out: Pipeline = { new: [], qualifying: [], proposal: [], pre_enrollment: [], won: [], lost: [] };
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && STAGES.some((s) => s in raw)) {
    for (const stage of STAGES) out[stage] = list<PipelineCard>((raw as Record<string, unknown>)[stage], '');
  } else {
    for (const card of list<PipelineCard>(raw, 'opportunities')) out[card.stage]?.push(card);
  }
  for (const stage of STAGES) out[stage].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
  return out;
}

// ---- demo guide and catalog -------------------------------------------------

export const getGuide = () => request<Guide>('/api/guide');
export const getCatalog = async (): Promise<CatalogItem[]> => list<CatalogItem>(await request<unknown>('/api/catalog'), 'catalog');

// "Rodar até aqui": plays the scripted steps, in order, up to and including `targetId`; steps already run are skipped.
export async function runUntil(targetId: string): Promise<void> {
  const all = await getSteps();
  const last = all.findIndex((s) => s.id === targetId);
  for (const s of all.slice(0, last + 1)) {
    if (s.ran) continue;
    const r = await simulate(s.id);
    if (!r.ok) throw new Error(`O passo foi enviado, mas o sistema recusou (código ${r.status}).`);
  }
}

// ---- tools (actor: the attendant) -------------------------------------------

const tool = (name: string, input: unknown) => post<{ ok: true; result: unknown }>(`/tools/${name}`, input, { 'x-actor': ATTENDANT });

export const replyToConversation = (personId: string, businessNumber: string, text: string) =>
  tool('reply_to_conversation', { personId, businessNumber, text });
export const setConversationMode = (personId: string, businessNumber: string, mode: Mode, reason: string) =>
  tool('set_conversation_mode', { personId, businessNumber, mode, reason });
export const advanceOpportunity = (opportunityId: string, stage: Stage, reason: string) =>
  tool('advance_opportunity', { opportunityId, stage, reason });
export const requestEnrollment = (opportunityId: string) => tool('request_enrollment', { opportunityId });
export const declareOrigin = (personId: string, touchSeq: number, value: string, quote: string) =>
  tool('record_declared_origin', { personId, touchSeq, value, quote, confidence: null, triggerSeq: touchSeq });

// Same tool the AI uses; the log records it as an action of the attendant. Returns the id of the opportunity it opened, if any.
export async function openOpportunity(personId: string, product: string, unit: Unit, triggerSeq: number): Promise<string | null> {
  const r = await tool('open_opportunity', { personId, product, unit, confidence: null, triggerSeq });
  const id = r.result && typeof r.result === 'object' && 'opportunityId' in r.result ? r.result.opportunityId : null;
  return typeof id === 'string' ? id : null;
}
