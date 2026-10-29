import { SECRETS } from '../src/config.ts';
import type { Db } from '../src/core/db.ts';
import { hashIdentifier, normalizePhone } from '../src/core/pii.ts';
import { signMeta } from '../src/gateway/signature.ts';
import { brt, CAMPAIGNS, NUMBERS, PEOPLE, QR_CODE, QR_TEXT } from './fixtures.ts';

export interface StepRequest { method: 'GET' | 'POST'; path: string; headers: Record<string, string>; body?: string }
export interface Step { id: string; who: string; label: string; build(ctx: { db: Db }): StepRequest }

const json = (path: string, payload: unknown, headers: Record<string, string> = {}): StepRequest =>
  ({ method: 'POST', path, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) });

interface Message { wamid: string; waId: string; bsuid: string; name: string; to: string; text: string; at: string }
function whatsapp(m: Message): StepRequest {
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'WABA_DEMO', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: m.to, phone_number_id: `PNID_${m.to}` },
      contacts: [{ profile: { name: m.name }, wa_id: m.waId, user_id: m.bsuid }],
      messages: [{ from: m.waId, from_user_id: m.bsuid, id: m.wamid, timestamp: String(Date.parse(m.at) / 1000), type: 'text', text: { body: m.text } }],
    } }] }],
  });
  return { method: 'POST', path: '/webhooks/whatsapp', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signMeta(body, SECRETS.whatsappAppSecret) }, body };
}

type Lead = { name: string; phone?: string; email: string };
const form = (id: string, entryPoint: string, at: string, who: Lead, utm: Record<string, string>, clickIds: Record<string, string>, test = false) =>
  json('/webhooks/forms', { submissionId: id, entryPoint, submittedAt: at, name: who.name, phone: who.phone, email: who.email, utm, clickIds, test });
const erp = (payload: unknown) => json('/webhooks/erp', payload, { 'x-erp-token': SECRETS.erpToken });

const carla1: Message = { wamid: 'wamid.CARLA-1', waId: PEOPLE.carla.waId, bsuid: PEOPLE.carla.bsuid, name: PEOPLE.carla.name, to: NUMBERS.rj, text: QR_TEXT, at: brt('2026-10-10T10:00') };
const daniel = (wamid: string, text: string, at: string): Message => ({ wamid, waId: PEOPLE.daniel.waId, bsuid: PEOPLE.daniel.bsuid, name: PEOPLE.daniel.name, to: NUMBERS.cps, text, at });
const noUtm = (key: 'felipe' | 'gabriela' | 'helena', time: string) =>
  form(`form-${key}-0001`, 'cps-lp-hof-01', brt(`2026-10-29T${time}`), PEOPLE[key], {}, { gclid: `GCLID-${key.toUpperCase()}` });

function anaOpportunityId(db: Db): string | null {
  const hash = hashIdentifier('phone', normalizePhone(PEOPLE.ana.phone, false)!);
  const row = db.prepare("SELECT o.id FROM opportunities o JOIN identifiers i ON i.person_id = o.person_id WHERE i.kind = 'phone' AND i.hash = ? AND o.product = 'hof' AND o.unit = 'sp' AND o.status = 'open'").get(hash) as { id: string } | undefined;
  return row?.id ?? null;
}

export const steps: Step[] = [
  { id: 'carla-qr-scan', who: 'Carla', label: 'Lê o QR do banner da recepção do Rio', build: () => ({ method: 'GET', path: `/r/${QR_CODE}`, headers: { 'x-occurred-at': brt('2026-10-10T09:58') } }) },
  { id: 'carla-whatsapp-code', who: 'Carla', label: 'Manda a mensagem pronta, com o código', build: () => whatsapp(carla1) },
  { id: 'carla-whatsapp-duplicate', who: 'Carla', label: 'A Meta reenvia a mesma mensagem', build: () => whatsapp(carla1) },
  { id: 'bruna-google-form', who: 'Bruna', label: 'Volta por um anúncio do Google e preenche a LP de Campinas', build: () => form('form-bruna-0001', 'cps-lp-hof-01', brt('2026-10-29T10:30'), { name: PEOPLE.bruna.name, phone: '19966660004', email: PEOPLE.bruna.email }, { source: 'google', medium: 'cpc', campaign: CAMPAIGNS.cpsHof }, { gclid: 'GCLID-BRUNA' }) },
  { id: 'ana-meta-form', who: 'Ana', label: 'Clica no anúncio da Meta e preenche a LP de SP', build: () => form('form-ana-0001', 'sp-lp-hof-01', brt('2026-10-29T14:02'), PEOPLE.ana, { source: 'instagram', medium: 'paid_social', campaign: CAMPAIGNS.spHof }, { fbclid: 'FBCLID-ANA' }) },
  { id: 'felipe-form-no-utm', who: 'Felipe', label: 'Preenche a LP de Campinas, que perdeu as UTMs', build: () => noUtm('felipe', '14:05') },
  { id: 'ana-whatsapp', who: 'Ana', label: 'Chama no WhatsApp pelo botão da página de obrigado', build: () => whatsapp({ wamid: 'wamid.ANA-1', waId: PEOPLE.ana.waId, bsuid: PEOPLE.ana.bsuid, name: PEOPLE.ana.name, to: NUMBERS.sp, text: 'Oi! Quero saber da turma de novembro de harmonização', at: brt('2026-10-29T14:10') }) },
  { id: 'gabriela-form-no-utm', who: 'Gabriela', label: 'Preenche a LP de Campinas, ainda sem UTMs', build: () => noUtm('gabriela', '14:20') },
  { id: 'helena-form-no-utm', who: 'Helena', label: 'Preenche a LP de Campinas: terceiro lead sem campanha', build: () => noUtm('helena', '14:40') },
  { id: 'daniel-whatsapp-1', who: 'Daniel', label: 'Chama no WhatsApp de Campinas, sem código', build: () => whatsapp(daniel('wamid.DANIEL-1', 'Oi, quanto custa o curso de harmonização?', brt('2026-10-29T15:00'))) },
  { id: 'daniel-whatsapp-2', who: 'Daniel', label: 'Responde como conheceu a Clinic', build: () => whatsapp(daniel('wamid.DANIEL-2', 'Vi no insta', brt('2026-10-29T15:05'))) },
  { id: 'carla-whatsapp-return', who: 'Carla', label: 'Volta 19 dias depois, direto no WhatsApp', build: () => whatsapp({ ...carla1, wamid: 'wamid.CARLA-2', text: 'Oi! Quero me inscrever na turma de harmonização', at: brt('2026-10-29T15:30') }) },
  { id: 'cps-test-lead', who: 'Marketing', label: 'Corrige a LP de Campinas e envia um lead de teste', build: () => form('form-teste-cps-0001', 'cps-lp-hof-01', brt('2026-10-29T16:00'), { name: 'Teste Marketing', email: 'teste.marketing@example.com' }, { source: 'google', medium: 'cpc', campaign: CAMPAIGNS.cpsHof }, { gclid: 'GCLID-TESTE' }, true) },
  { id: 'cps-owner-release', who: 'Marketing', label: 'Libera o ponto depois do teste', build: () => json('/tools/set_entry_point_status', { code: 'cps-lp-hof-01', status: 'released', reason: 'página corrigida e lead de teste aprovado' }, { 'x-actor': 'owner:marketing', 'x-occurred-at': brt('2026-10-29T16:05') }) },
  { id: 'eduardo-erp-sale', who: 'ERP', label: 'Confirma uma venda sem oportunidade ligada', build: () => erp({ type: 'sale_confirmed', saleId: 'ERP-SALE-0999', confirmedAt: brt('2026-10-29T16:30'), opportunityId: null, name: PEOPLE.eduardo.name, phone: PEOPLE.eduardo.phone, email: PEOPLE.eduardo.email, product: 'hof', unit: 'sp' }) },
  { id: 'ana-erp-sale', who: 'ERP', label: 'Confirma a matrícula da Ana, com o id da oportunidade', build: ({ db }) => erp({ type: 'sale_confirmed', saleId: 'ERP-SALE-1001', confirmedAt: brt('2026-10-29T17:00'), opportunityId: anaOpportunityId(db), name: PEOPLE.ana.name, phone: PEOPLE.ana.phone, email: PEOPLE.ana.email, product: 'hof', unit: 'sp' }) },
];
