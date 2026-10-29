import { SECRETS, WAHA_SESSIONS } from '../src/config.ts';
import type { Db } from '../src/core/db.ts';
import { hashIdentifier, normalizePhone } from '../src/core/pii.ts';
import { signWaha } from '../src/gateway/signature.ts';
import { parseSessions } from '../src/providers/whatsapp/waha.ts';
import { brt, CAMPAIGNS, CARLA_FIRST_MESSAGE_ID, NUMBERS, PEOPLE, QR_CODE, QR_TEXT } from './fixtures.ts';

export interface StepRequest { method: 'GET' | 'POST'; path: string; headers: Record<string, string>; body?: string }
export interface Step { id: string; who: string; label: string; build(ctx: { db: Db }): StepRequest }

const json = (path: string, payload: unknown, headers: Record<string, string> = {}): StepRequest =>
  ({ method: 'POST', path, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) });

// Messages arrive as the WAHA webhook (one session per business number), signed like WAHA does.
interface Message { id: string; waId: string; name: string; to: string; text: string; at: string }
const sessionOf = (n: string) => [...parseSessions(WAHA_SESSIONS)].find(([, number]) => number === n)?.[0] ?? 'default';
function whatsapp(m: Message): StepRequest {
  const sentAt = Date.parse(m.at);
  const body = JSON.stringify({
    id: `evt_${m.id.slice(-8)}`, timestamp: sentAt, event: 'message', session: sessionOf(m.to),
    payload: {
      id: m.id, timestamp: sentAt / 1000, from: `${m.waId}@c.us`, fromMe: false, to: `${m.to}@c.us`, body: m.text, hasMedia: false,
      _data: { notifyName: m.name },
    },
  });
  const key = SECRETS.wahaWebhookHmacKey;
  const signature: Record<string, string> = key ? { 'x-webhook-hmac': signWaha(body, key), 'x-webhook-hmac-algorithm': 'sha512' } : {};
  return { method: 'POST', path: '/webhooks/whatsapp/waha', headers: { 'content-type': 'application/json', ...signature }, body };
}

type Lead = { name: string; phone?: string; email: string };
const form = (id: string, entryPoint: string, at: string, who: Lead, utm: Record<string, string>, clickIds: Record<string, string>, test = false) =>
  json('/webhooks/forms', { submissionId: id, entryPoint, submittedAt: at, name: who.name, phone: who.phone, email: who.email, utm, clickIds, test });
const erp = (payload: unknown) => json('/webhooks/erp', payload, { 'x-erp-token': SECRETS.erpToken });

const messageId = (who: { waId: string }, key: string) => `false_${who.waId}@c.us_3EB0${key}`;
const carla1: Message = { id: CARLA_FIRST_MESSAGE_ID, waId: PEOPLE.carla.waId, name: PEOPLE.carla.name, to: NUMBERS.rj, text: QR_TEXT, at: brt('2026-10-10T10:00') };
const daniel = (key: string, text: string, at: string): Message => ({ id: messageId(PEOPLE.daniel, key), waId: PEOPLE.daniel.waId, name: PEOPLE.daniel.name, to: NUMBERS.cps, text, at });
const noUtm = (key: 'felipe' | 'gabriela' | 'helena', time: string) =>
  form(`form-${key}-0001`, 'cps-lp-hof-01', brt(`2026-10-29T${time}`), PEOPLE[key], {}, { gclid: `GCLID-${key.toUpperCase()}` });

function anaPersonId(db: Db): string | null {
  const hash = hashIdentifier('phone', normalizePhone(PEOPLE.ana.phone, false)!);
  return (db.prepare("SELECT person_id FROM identifiers WHERE kind = 'phone' AND hash = ?").get(hash) as { person_id: string } | undefined)?.person_id ?? null;
}
const attendant = (tool: string, at: string, payload: unknown) =>
  json(`/tools/${tool}`, payload, { 'x-actor': 'attendant:joana', 'x-occurred-at': brt(`2026-10-29T${at}`) });

function anaOpportunityId(db: Db): string | null {
  const hash = hashIdentifier('phone', normalizePhone(PEOPLE.ana.phone, false)!);
  const row = db.prepare("SELECT o.id FROM opportunities o JOIN identifiers i ON i.person_id = o.person_id WHERE i.kind = 'phone' AND i.hash = ? AND o.product = 'hof' AND o.unit = 'sp' AND o.status = 'open'").get(hash) as { id: string } | undefined;
  return row?.id ?? null;
}

export const steps: Step[] = [
  { id: 'carla-qr-scan', who: 'Carla', label: 'Lê o QR do banner da recepção do Rio', build: () => ({ method: 'GET', path: `/r/${QR_CODE}`, headers: { 'x-occurred-at': brt('2026-10-10T09:58') } }) },
  { id: 'carla-whatsapp-code', who: 'Carla', label: 'Manda a mensagem pronta, com o código', build: () => whatsapp(carla1) },
  { id: 'carla-whatsapp-duplicate', who: 'Carla', label: 'O WAHA reenvia a mesma mensagem', build: () => whatsapp(carla1) },
  { id: 'bruna-google-form', who: 'Bruna', label: 'Volta por um anúncio do Google e preenche a LP de Campinas', build: () => form('form-bruna-0001', 'cps-lp-hof-01', brt('2026-10-29T10:30'), { name: PEOPLE.bruna.name, phone: '19966660004', email: PEOPLE.bruna.email }, { source: 'google', medium: 'cpc', campaign: CAMPAIGNS.cpsHof }, { gclid: 'GCLID-BRUNA' }) },
  { id: 'ana-meta-form', who: 'Ana', label: 'Clica no anúncio da Meta e preenche a LP de SP', build: () => form('form-ana-0001', 'sp-lp-hof-01', brt('2026-10-29T14:02'), PEOPLE.ana, { source: 'instagram', medium: 'paid_social', campaign: CAMPAIGNS.spHof }, { fbclid: 'FBCLID-ANA' }) },
  { id: 'felipe-form-no-utm', who: 'Felipe', label: 'Preenche a LP de Campinas, que perdeu as UTMs', build: () => noUtm('felipe', '14:05') },
  { id: 'ana-whatsapp', who: 'Ana', label: 'Chama no WhatsApp pelo botão da página de obrigado', build: () => whatsapp({ id: messageId(PEOPLE.ana, 'ANA1'), waId: PEOPLE.ana.waId, name: PEOPLE.ana.name, to: NUMBERS.sp, text: 'Oi! Quero saber da turma de novembro de harmonização', at: brt('2026-10-29T14:10') }) },
  { id: 'gabriela-form-no-utm', who: 'Gabriela', label: 'Preenche a LP de Campinas, ainda sem UTMs', build: () => noUtm('gabriela', '14:20') },
  { id: 'helena-form-no-utm', who: 'Helena', label: 'Preenche a LP de Campinas: terceiro lead sem campanha', build: () => noUtm('helena', '14:40') },
  { id: 'daniel-whatsapp-1', who: 'Daniel', label: 'Chama no WhatsApp de Campinas, sem código', build: () => whatsapp(daniel('DANIEL1', 'Oi, quanto custa o curso de harmonização?', brt('2026-10-29T15:00'))) },
  { id: 'daniel-whatsapp-2', who: 'Daniel', label: 'Responde como conheceu a Clinic', build: () => whatsapp(daniel('DANIEL2', 'Vi no insta', brt('2026-10-29T15:05'))) },
  { id: 'paciente-inchaco', who: 'Helena', label: 'Escreve no WhatsApp de Campinas sobre um inchaço depois do procedimento', build: () => whatsapp({ id: messageId(PEOPLE.helena, 'HELENA1'), waId: PEOPLE.helena.waId, name: PEOPLE.helena.name, to: NUMBERS.cps, text: 'Estou com inchaço depois do procedimento', at: brt('2026-10-29T15:10') }) },
  { id: 'carla-whatsapp-return', who: 'Carla', label: 'Volta 19 dias depois, direto no WhatsApp', build: () => whatsapp({ ...carla1, id: messageId(PEOPLE.carla, 'CARLA2'), text: 'Oi! Quero me inscrever na turma de harmonização', at: brt('2026-10-29T15:30') }) },
  { id: 'cps-test-lead', who: 'Marketing', label: 'Corrige a LP de Campinas e envia um lead de teste', build: () => form('form-teste-cps-0001', 'cps-lp-hof-01', brt('2026-10-29T16:00'), { name: 'Teste Marketing', email: 'teste.marketing@example.com' }, { source: 'google', medium: 'cpc', campaign: CAMPAIGNS.cpsHof }, { gclid: 'GCLID-TESTE' }, true) },
  { id: 'cps-owner-release', who: 'Marketing', label: 'Libera o ponto depois do teste', build: () => json('/tools/set_entry_point_status', { code: 'cps-lp-hof-01', status: 'released', reason: 'página corrigida e lead de teste aprovado' }, { 'x-actor': 'owner:marketing', 'x-occurred-at': brt('2026-10-29T16:05') }) },
  { id: 'eduardo-erp-sale', who: 'ERP', label: 'Confirma uma venda sem oportunidade ligada', build: () => erp({ type: 'sale_confirmed', saleId: 'ERP-SALE-0999', confirmedAt: brt('2026-10-29T16:30'), opportunityId: null, name: PEOPLE.eduardo.name, phone: PEOPLE.eduardo.phone, email: PEOPLE.eduardo.email, product: 'hof', unit: 'sp' }) },
  { id: 'atendente-assume-ana', who: 'Atendente', label: 'Assume a conversa da Ana', build: ({ db }) => attendant('set_conversation_mode', '16:40', { personId: anaPersonId(db), businessNumber: NUMBERS.sp, mode: 'human', reason: 'atendente assume a venda' }) },
  { id: 'atendente-responde-ana', who: 'Atendente', label: 'Responde a Ana pelo WhatsApp', build: ({ db }) => attendant('reply_to_conversation', '16:42', { personId: anaPersonId(db), businessNumber: NUMBERS.sp, text: 'Oi, Ana! Aqui é a Joana, da Clinic SP. Separei uma vaga para você na turma de 14/11. Posso fazer sua pré-matrícula?' }) },
  { id: 'atendente-proposta-ana', who: 'Atendente', label: 'Avança a oportunidade da Ana para proposta', build: ({ db }) => attendant('advance_opportunity', '16:45', { opportunityId: anaOpportunityId(db), stage: 'proposal', reason: 'proposta enviada no WhatsApp' }) },
  { id: 'atendente-pre-matricula-ana', who: 'Atendente', label: 'Registra a pré-matrícula: o pedido vai para o ERP', build: ({ db }) => attendant('request_enrollment', '16:50', { opportunityId: anaOpportunityId(db) }) },
  { id: 'ana-erp-sale', who: 'ERP', label: 'O ERP confirma o pagamento do pedido da Ana, com o id da oportunidade', build: ({ db }) => erp({ type: 'sale_confirmed', saleId: 'ERP-SALE-1001', confirmedAt: brt('2026-10-29T17:00'), opportunityId: anaOpportunityId(db), name: PEOPLE.ana.name, phone: PEOPLE.ana.phone, email: PEOPLE.ana.email, product: 'hof', unit: 'sp' }) },
];
