import { appendAndProject } from '../src/core/apply.ts';
import type { Db } from '../src/core/db.ts';
import { storePii, toIdentifier } from '../src/core/pii.ts';
import type { Identifier, IdentifierKind, Rules, Unit } from '../src/core/types.ts';
import { brt, CAMPAIGNS, NUMBERS, PEOPLE, QR_CODE, QR_TEXT } from './fixtures.ts';

const ids = (db: Db, pairs: [IdentifierKind, string][]): Identifier[] => pairs.map(([kind, raw]) => toIdentifier(db, kind, raw)!);

// Facts that already existed before the story starts. Seeded with appendAndProject: no AI, no monitor.
export function seed(db: Db, rules: Rules): void {
  const at = brt('2026-09-01T09:00');
  const point = (code: string, unit: Unit, kind: string, label: string, owner: string, product: string | null, businessNumber: string | null) =>
    appendAndProject(db, { source: 'seed', externalId: `ep:${code}`, type: 'entry_point_registered', occurredAt: at, actor: 'seed', payload: { code, unit, kind, label, owner, status: 'released', product, businessNumber } }, rules);
  point('sp-lp-hof-01', 'sp', 'lp', 'LP de harmonização de SP', 'marketing', 'hof', null);
  point('cps-lp-hof-01', 'cps', 'lp', 'LP de harmonização de Campinas', 'marketing', 'hof', null);
  point('rj-banner-recepcao-01', 'rj', 'banner', 'banner da recepção do Rio', 'recepcao-rj', null, null);
  point('sp-whatsapp-principal-01', 'sp', 'whatsapp', 'WhatsApp de SP', 'atendimento-sp', null, NUMBERS.sp);
  point('rj-whatsapp-principal-01', 'rj', 'whatsapp', 'WhatsApp do Rio', 'atendimento-rj', null, NUMBERS.rj);
  point('cps-whatsapp-principal-01', 'cps', 'whatsapp', 'WhatsApp de Campinas', 'atendimento-cps', null, NUMBERS.cps);
  appendAndProject(db, {
    source: 'seed', externalId: `link:${QR_CODE}`, type: 'link_generated', occurredAt: at, actor: 'seed',
    payload: { code: QR_CODE, entryPoint: 'rj-banner-recepcao-01', channel: 'qr', campaign: CAMPAIGNS.rjCursos, unit: 'rj', product: 'cursos', destination: `https://wa.me/${NUMBERS.rj}?text=${encodeURIComponent(QR_TEXT)}`, linkType: 'qr' },
  }, rules);
  appendAndProject(db, {
    source: 'erp', externalId: `import:erp-pacientes-2026-09:${PEOPLE.bruna.erpPatientId}`, type: 'erp_person_imported', occurredAt: brt('2026-09-15T10:00'), actor: 'seed',
    payload: { batch: 'erp-pacientes-2026-09', role: 'patient', unit: 'cps', identifiers: ids(db, [['phone', PEOPLE.bruna.phone], ['email', PEOPLE.bruna.email], ['erp_patient', PEOPLE.bruna.erpPatientId]]), displayRef: storePii(db, 'name', PEOPLE.bruna.name) },
  }, rules);
  // 25 earlier leads on the Campinas page; lead 07 already arrived without campaign (96% coverage).
  for (let i = 1; i <= 25; i++) {
    const n = String(i).padStart(2, '0');
    appendAndProject(db, {
      source: 'form', externalId: `hist-${n}`, type: 'form_submitted', occurredAt: brt(`2026-10-${String(i + 2).padStart(2, '0')}T11:00`), actor: 'seed',
      payload: { entryPoint: 'cps-lp-hof-01', identifiers: ids(db, [['phone', `(19) 93333-00${n}`]]), displayRef: storePii(db, 'name', `Lead histórico ${n}`), utm: i === 7 ? {} : { source: 'google', medium: 'cpc', campaign: CAMPAIGNS.cpsHof }, clickIds: { gclid: `GCLID-HIST-${n}` }, test: false },
    }, rules);
  }
}
