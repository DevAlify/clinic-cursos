import type { Db } from '../src/core/db.ts';
import { hashIdentifier } from '../src/core/pii.ts';
import { previewRules, rebuild } from '../src/core/replay.ts';
import { getState, type State } from '../src/core/state.ts';
import type { Rules } from '../src/core/types.ts';
import { CAMPAIGNS, CARLA_FIRST_MESSAGE_ID, PEOPLE, QR_CODE, SECRETS_IN_FIXTURES } from './fixtures.ts';

export interface CheckContext { db: Db; state: State; rules: Rules }
export interface Check { afterStep: string; scenario: string; expected: string; run(ctx: CheckContext): { ok: boolean; actual: string } }

const S1 = '1. Origem preservada até a venda';
const S2 = '2. QR de unidade × WhatsApp sem origem';
const S3 = '3. Pessoa existente volta por outra campanha';
const S4 = '4. O mesmo evento chega duas vezes';
const S5 = '5. Venda confirmada pelo ERP';
const S6 = '6. Falha: a LP de Campinas perde as UTMs';
const X1 = 'Extra: retorno direto';
const X2 = 'Extra: privacidade e log';
const X3 = 'Extra: reprocessamento';

const person = (s: State, name: string) => s.people.find((p) => p.name === name);
const touchesOf = (s: State, name: string) => s.touches.filter((t) => t.personId === person(s, name)?.id);
const opp = (s: State, name: string, product: string, unit: string) =>
  s.opportunities.find((o) => o.personId === person(s, name)?.id && o.product === product && o.unit === unit);
const touch = (s: State, seq: number | null | undefined) => s.touches.find((t) => t.seq === seq);
const routes = (s: State, name: string) => s.queue.filter((q) => q.kind === 'routing' && q.personId === person(s, name)?.id).map((q) => q.queue);
const ok = (pass: boolean, actual: string) => ({ ok: pass, actual });
const describeChannel = (s: State, seq: number | null | undefined) => {
  const f = touch(s, seq)?.fields;
  return f ? `${f.channel.value ?? '—'} (${f.channel.level}) · campanha ${f.campaign.value ?? '—'} (${f.campaign.level})` : 'sem toque';
};
const noUtmPeople = [PEOPLE.felipe.name, PEOPLE.gabriela.name, PEOPLE.helena.name];

export const checks: Check[] = [
  { afterStep: 'carla-whatsapp-code', scenario: S2, expected: 'Carla entra pelo banner do Rio, lida pelo código K7P2', run: ({ state }) => {
    const f = touchesOf(state, PEOPLE.carla.name)[0]?.fields;
    return ok(f?.entryPoint.value === 'rj-banner-recepcao-01' && f.entryPoint.reader === `code:${QR_CODE}` && f.channel.value === 'qr' && f.channel.level === 'observed',
      f ? `${f.entryPoint.value} · ${f.entryPoint.reader} · canal ${f.channel.value} (${f.channel.level})` : 'sem toque');
  } },
  { afterStep: 'carla-whatsapp-code', scenario: S2, expected: 'O QR foi lido uma vez', run: ({ state }) => {
    const n = state.scans.find((s) => s.code === QR_CODE)?.count ?? 0;
    return ok(n === 1, `${n} leitura(s)`);
  } },
  { afterStep: 'carla-whatsapp-code', scenario: S2, expected: 'Carla vai para a fila de vendas do Rio', run: ({ state }) => ok(routes(state, PEOPLE.carla.name).join() === 'sales-rj', routes(state, PEOPLE.carla.name).join() || 'sem fila') },
  { afterStep: 'carla-whatsapp-duplicate', scenario: S4, expected: 'A mensagem repetida não cria outro toque', run: ({ state }) => ok(touchesOf(state, PEOPLE.carla.name).length === 1, `${touchesOf(state, PEOPLE.carla.name).length} toque(s)`) },
  { afterStep: 'carla-whatsapp-duplicate', scenario: S4, expected: 'A repetição fica contada', run: ({ state }) => {
    const d = state.duplicates.find((x) => x.source === 'whatsapp' && x.externalId === hashIdentifier('wa_message', CARLA_FIRST_MESSAGE_ID))?.count ?? 0;
    return ok(d === 1, `${d} repetição(ões)`);
  } },
  { afterStep: 'carla-whatsapp-duplicate', scenario: S4, expected: 'A conversa não é encaminhada duas vezes', run: ({ state }) => ok(routes(state, PEOPLE.carla.name).length === 1, `${routes(state, PEOPLE.carla.name).length} encaminhamento(s)`) },
  { afterStep: 'bruna-google-form', scenario: S3, expected: 'Bruna continua uma ficha só: paciente e lead em Campinas', run: ({ state }) => {
    const matches = state.people.filter((p) => p.name === PEOPLE.bruna.name);
    const roles = matches[0]?.roles.map((r) => `${r.role}@${r.unit}`).sort().join(', ') ?? '';
    return ok(matches.length === 1 && roles === 'lead@cps, patient@cps', `${matches.length} ficha(s) · ${roles}`);
  } },
  { afterStep: 'bruna-google-form', scenario: S3, expected: 'Novo interesse (hof · cps) com google_ads e campanha observados', run: ({ state }) => {
    const o = opp(state, PEOPLE.bruna.name, 'hof', 'cps');
    const f = touch(state, o?.firstTouchSeq)?.fields;
    return ok(f?.channel.value === 'google_ads' && f.channel.level === 'observed' && f.campaign.value === CAMPAIGNS.cpsHof, describeChannel(state, o?.firstTouchSeq));
  } },
  { afterStep: 'bruna-google-form', scenario: S3, expected: 'O histórico de paciente continua desconhecido, com o lote', run: ({ state }) => {
    const imported = touchesOf(state, PEOPLE.bruna.name).find((t) => t.fields.channel.reader === 'import:erp-pacientes-2026-09');
    return ok(imported?.fields.channel.level === 'unknown', imported ? `${imported.fields.channel.level} · ${imported.fields.channel.reader}` : 'sem importação');
  } },
  { afterStep: 'ana-whatsapp', scenario: S1, expected: 'Formulário e WhatsApp da Ana na mesma ficha (nono dígito corrigido)', run: ({ state }) => {
    const n = state.people.filter((p) => p.name === PEOPLE.ana.name).length;
    return ok(n === 1 && touchesOf(state, PEOPLE.ana.name).length === 2, `${n} ficha(s) · ${touchesOf(state, PEOPLE.ana.name).length} toque(s)`);
  } },
  { afterStep: 'ana-whatsapp', scenario: S1, expected: 'A conversa da Ana vai para vendas de SP', run: ({ state }) => ok(routes(state, PEOPLE.ana.name).includes('sales-sp'), routes(state, PEOPLE.ana.name).join() || 'sem fila') },
  { afterStep: 'helena-form-no-utm', scenario: S6, expected: 'Felipe, Gabriela e Helena: canal observado e campanha desconhecida', run: ({ state }) => {
    const rows = noUtmPeople.map((n) => touchesOf(state, n)[0]?.fields);
    return ok(rows.every((f) => f?.channel.value === 'google_ads' && f.channel.level === 'observed' && f.campaign.level === 'unknown'),
      rows.map((f) => (f ? `${f.channel.value}/${f.campaign.level}` : '—')).join(' · '));
  } },
  { afterStep: 'helena-form-no-utm', scenario: S6, expected: 'Um alerta para cps-lp-hof-01, com ação e responsável', run: ({ state }) => {
    const a = state.alerts.filter((x) => x.entryPoint === 'cps-lp-hof-01' && x.kind === 'campaign_coverage_drop');
    return ok(a.length === 1 && a[0].owner === 'marketing' && a[0].message.includes('3 leads'), a[0] ? `${a[0].message} ${a[0].action}` : 'sem alerta');
  } },
  { afterStep: 'helena-form-no-utm', scenario: S6, expected: 'O ponto vai para "em auditoria"', run: ({ state }) => {
    const s = state.entryPoints.find((e) => e.code === 'cps-lp-hof-01')?.status;
    return ok(s === 'auditing', s ?? '—');
  } },
  { afterStep: 'daniel-whatsapp-1', scenario: S2, expected: 'Daniel: canal e campanha desconhecidos, sem chute', run: ({ state }) => {
    const f = touchesOf(state, PEOPLE.daniel.name)[0]?.fields;
    return ok(f?.channel.level === 'unknown' && f.campaign.level === 'unknown', f ? `canal ${f.channel.level} · campanha ${f.campaign.level}` : 'sem toque');
  } },
  { afterStep: 'daniel-whatsapp-1', scenario: S2, expected: 'Daniel vai para vendas de Campinas, com a unidade inferida pelo número', run: ({ state }) => {
    const f = touchesOf(state, PEOPLE.daniel.name)[0]?.fields;
    return ok(routes(state, PEOPLE.daniel.name).join() === 'sales-cps' && f?.unit.level === 'inferred', `${routes(state, PEOPLE.daniel.name).join() || 'sem fila'} · unidade ${f?.unit.level ?? '—'}`);
  } },
  { afterStep: 'daniel-whatsapp-2', scenario: S2, expected: 'Daniel declara o Instagram: canal declarado, lido pela IA', run: ({ state }) => {
    const c = touchesOf(state, PEOPLE.daniel.name)[0]?.fields.channel;
    return ok(c?.value === 'instagram' && c.level === 'declared' && c.reader === 'ai:simulated-v1', c ? `${c.value} · ${c.level} · ${c.reader} · "${c.evidence}"` : 'sem toque');
  } },
  { afterStep: 'daniel-whatsapp-2', scenario: S2, expected: 'A oportunidade do Daniel aponta para o toque declarado', run: ({ state }) => {
    const o = opp(state, PEOPLE.daniel.name, 'hof', 'cps');
    return ok(o?.firstTouchSeq === touchesOf(state, PEOPLE.daniel.name)[0]?.seq, describeChannel(state, o?.firstTouchSeq));
  } },
  { afterStep: 'carla-whatsapp-return', scenario: X1, expected: 'Carla volta direto e a oportunidade (hof · rj) fica com o QR de 10/10', run: ({ state }) => {
    const o = opp(state, PEOPLE.carla.name, 'hof', 'rj');
    const t = touch(state, o?.firstTouchSeq);
    return ok(t?.code === QR_CODE, t ? `${t.code} · ${t.occurredAt.slice(0, 10)} · ${describeChannel(state, t.seq)}` : 'sem atribuição');
  } },
  { afterStep: 'cps-owner-release', scenario: S6, expected: 'Com o lead de teste aprovado, o dono libera o ponto', run: ({ state }) => {
    const s = state.entryPoints.find((e) => e.code === 'cps-lp-hof-01')?.status;
    return ok(s === 'released', s ?? '—');
  } },
  { afterStep: 'cps-owner-release', scenario: S6, expected: 'Os três leads continuam com a campanha desconhecida', run: ({ state }) => {
    const levels = noUtmPeople.map((n) => touchesOf(state, n)[0]?.fields.campaign.level);
    return ok(levels.every((l) => l === 'unknown'), levels.join(' · '));
  } },
  { afterStep: 'eduardo-erp-sale', scenario: S5, expected: 'A venda do Eduardo vai para a fila de conciliação', run: ({ state }) => {
    const id = person(state, PEOPLE.eduardo.name)?.id;
    const item = state.queue.find((q) => q.kind === 'reconciliation' && q.personId === id);
    const won = state.opportunities.some((o) => o.personId === id && o.status === 'won');
    return ok(item?.details.saleId === 'ERP-SALE-0999' && !won, item ? `${item.queue} · ${String(item.details.saleId)}` : 'sem conciliação');
  } },
  { afterStep: 'ana-erp-sale', scenario: S5, expected: 'A oportunidade da Ana fica ganha e ligada ao anúncio da Meta', run: ({ state }) => {
    const o = opp(state, PEOPLE.ana.name, 'hof', 'sp');
    const f = touch(state, o?.firstTouchSeq)?.fields;
    return ok(o?.status === 'won' && o.erpSaleId === 'ERP-SALE-1001' && f?.channel.value === 'meta_ads' && f.campaign.value === CAMPAIGNS.spHof,
      o ? `${o.status} · ${o.erpSaleId} · ${describeChannel(state, o.firstTouchSeq)}` : 'sem oportunidade');
  } },
  { afterStep: 'end', scenario: X2, expected: 'O log não guarda telefone, e-mail nem nome em claro', run: ({ db }) => {
    const log = (db.prepare("SELECT external_id || ' ' || payload AS t FROM events").all() as { t: string }[]).map((r) => r.t).join('\n');
    const leaks = SECRETS_IN_FIXTURES.filter((s) => log.includes(s));
    return ok(leaks.length === 0, leaks.length ? `vazou: ${leaks.join(', ')}` : 'nenhum dado pessoal no log');
  } },
  { afterStep: 'end', scenario: X2, expected: 'O log recusa alteração', run: ({ db }) => {
    try {
      db.prepare("UPDATE events SET actor = 'x' WHERE seq = 1").run();
      return ok(false, 'aceitou alteração');
    } catch (err) {
      return ok(String(err).includes('append-only'), String(err));
    }
  } },
  { afterStep: 'end', scenario: X3, expected: 'Refazer as projeções a partir do log dá o mesmo estado', run: ({ db, rules }) => {
    const before = JSON.stringify(getState(db, rules));
    rebuild(db, rules);
    return ok(JSON.stringify(getState(db, rules)) === before, 'estado comparado antes e depois');
  } },
  { afterStep: 'end', scenario: X3, expected: 'Com janela de 14 dias, só a atribuição da Carla muda', run: ({ db, rules }) => {
    const changes = previewRules(db, { ...rules, attributionWindowDays: 14 });
    return ok(changes.length === 1 && changes[0].personName === PEOPLE.carla.name && changes[0].after === null,
      changes.map((c) => `${c.personName}: ${c.before?.channel ?? '—'} → ${c.after?.channel ?? 'desconhecida'}`).join('; ') || 'nenhuma mudança');
  } },
];
