import { LEVEL_LABEL } from '../../../src/core/origin.ts';
import type { FieldName, Level } from '../../../src/core/types.ts';

const QUEUE_LABEL: Record<string, string> = {
  'sales-sp': 'Vendas · SP', 'sales-rj': 'Vendas · Rio', 'sales-cps': 'Vendas · Campinas',
  'patients-sp': 'Pacientes · SP', 'patients-rj': 'Pacientes · Rio', 'patients-cps': 'Pacientes · Campinas',
  'student-support': 'Suporte ao aluno', 'human-priority': 'Atendimento humano · prioridade', 'clinical-team': 'Equipe clínica',
  triage: 'Triagem', reconciliation: 'Conciliação com o ERP', 'identity-review': 'Revisão de fichas',
};

export const STAGES = ['new', 'qualifying', 'proposal', 'pre_enrollment', 'won', 'lost'] as const;
export type Stage = (typeof STAGES)[number];
const STAGE_LABEL: Record<Stage, string> = {
  new: 'Novo', qualifying: 'Em qualificação', proposal: 'Proposta', pre_enrollment: 'Pré-matrícula', won: 'Ganha', lost: 'Perdida',
};

const UNIT_LABEL: Record<string, string> = { sp: 'SP', rj: 'Rio', cps: 'Campinas', online: 'Online' };
const PRODUCT_LABEL: Record<string, string> = { hof: 'Harmonização Facial', cursos: 'Cursos' };
const CHANNEL_LABEL: Record<string, string> = {
  qr: 'QR da recepção', google_ads: 'Google Ads', meta_ads: 'Meta Ads', instagram: 'Instagram', google: 'Google', referral: 'Indicação', other: 'Outro',
};
const CAMPAIGN_LABEL: Record<string, string> = {
  rj_cursos_divulgacao_202610: 'Divulgação de cursos · Rio',
  sp_hof_captacao_202610: 'Harmonização · SP',
  cps_hof_captacao_202610: 'Harmonização · Campinas',
};

export const levelLabel = (level: Level): string => LEVEL_LABEL[level];
export const queueLabel = (id: string): string => QUEUE_LABEL[id] ?? id;
export const stageLabel = (stage: string): string => STAGE_LABEL[stage as Stage] ?? stage;
export const unitLabel = (unit: string): string => UNIT_LABEL[unit] ?? unit;
export const productLabel = (product: string): string => PRODUCT_LABEL[product] ?? product;
export const channelLabel = (channel: string | null): string => (channel === null ? 'Não identificado' : (CHANNEL_LABEL[channel] ?? channel));
export const campaignLabel = (campaign: string | null): string => (campaign === null ? 'Não identificada' : (CAMPAIGN_LABEL[campaign] ?? campaign));
export const percent = (part: number, total: number): string => (total === 0 ? '—' : `${Math.round((part / total) * 100)}%`);
export const formatBrt = (iso: string): string =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
export const formatClock = (iso: string): string =>
  new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
export const formatMoney = (value: number): string => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const FIELD_LABEL: Record<FieldName, string> = {
  entryPoint: 'Ponto de entrada', channel: 'Canal', campaign: 'Campanha', unit: 'Unidade', product: 'Produto',
};

// What a field value means in plain Portuguese; the raw code stays available for the gray technical line.
export function fieldValueLabel(name: FieldName, value: string | null): string {
  if (value === null) return 'Não identificado';
  if (name === 'channel') return channelLabel(value);
  if (name === 'campaign') return campaignLabel(value);
  if (name === 'unit') return unitLabel(value);
  if (name === 'product') return productLabel(value);
  return value;
}

// "Como soubemos": who or what read this field, in words a non-developer understands.
export function howWeKnew(reader: string, evidence?: string): string {
  if (reader.startsWith('code:')) return `Código curto ${reader.slice(5)}`;
  if (reader.startsWith('rule:')) return reader.includes('unit-from-number') ? 'Regra: número de destino' : 'Regra do sistema';
  if (reader.startsWith('ai:')) return 'IA simulada';
  if (reader.startsWith('attendant:')) return 'Atendente';
  if (reader === 'registry') return 'Cadastro do ponto de entrada';
  if (reader === 'referral') return 'Anúncio da Meta (referral)';
  if (reader === 'system') {
    if (evidence === 'utm') return 'Formulário com UTM';
    if (evidence === 'gclid') return 'Formulário com identificador do Google';
    if (evidence === 'fbclid') return 'Formulário com identificador da Meta';
    return 'Registro do sistema';
  }
  return reader;
}

const ROLE_LABEL: Record<string, string> = { lead: 'lead', patient: 'paciente', student: 'aluno' };
export const roleLabel = (role: string): string => ROLE_LABEL[role] ?? role;

export function actorLabel(actor: string): string {
  if (actor.startsWith('ai:')) return 'IA';
  if (actor.startsWith('attendant:')) {
    const name = actor.slice('attendant:'.length);
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} (atendente)`;
  }
  if (actor === 'owner:marketing') return 'Marketing';
  if (actor === 'seed') return 'histórico';
  if (actor === 'system') return 'sistema';
  return actor;
}

const STATUS_LABEL: Record<string, string> = { released: 'Liberado', auditing: 'Em auditoria', blocked: 'Bloqueado' };
export const statusLabel = (status: string): string => STATUS_LABEL[status] ?? status;

// Event texts come from the core with technical ids (queues, entry points, statuses); show them in words.
export function plainLabel(text: string, entryLabels: Record<string, string> = {}): string {
  let out = text;
  for (const [code, label] of Object.entries(entryLabels)) out = out.split(code).join(label);
  for (const id of Object.keys(QUEUE_LABEL)) out = out.replace(new RegExp(`(?<![\w-])${id}(?![\w-])`, 'g'), QUEUE_LABEL[id] ?? id);
  return out.replace(/: (released|auditing|blocked)$/, (_, s: string) => `: ${statusLabel(s).toLowerCase()}`);
}

const OWNER_LABEL: Record<string, string> = {
  marketing: 'Equipe de Marketing', 'atendimento-sp': 'Atendimento de SP', 'atendimento-rj': 'Atendimento do Rio',
  'atendimento-cps': 'Atendimento de Campinas', 'recepcao-rj': 'Recepção do Rio',
};
export const ownerLabel = (owner: string): string => OWNER_LABEL[owner] ?? owner;

// Alert headline from the state of its entry point: paused while in audit, resolved once released again.
export function alertTitle(label: string, status: string): string {
  if (status === 'auditing') return `${label}: em auditoria, ponto pausado`;
  if (status === 'released') return `${label}: alerta resolvido, ponto liberado`;
  return `${label}: ${statusLabel(status).toLowerCase()}`;
}
// The core writes "Responsável: x." inside the action; the owner is shown on its own, so drop it here.
export const alertAction = (action: string): string => action.replace(/\s*Responsável:.*$/, '');
