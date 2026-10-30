import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channelLabel, fieldValueLabel, formatBrt, formatClock, howWeKnew, levelLabel, percent, plainLabel, queueLabel, stageLabel } from '../web/src/lib/format.ts';
import { hasOpenOpportunity, journeyReached } from '../web/src/lib/journey.ts';

test('labels and numbers read in Portuguese', () => {
  assert.equal(levelLabel('declared'), 'declarada');
  assert.equal(queueLabel('sales-cps'), 'Vendas · Campinas');
  assert.equal(queueLabel('anything-else'), 'anything-else');
  assert.equal(percent(25, 26), '96%');
  assert.equal(percent(0, 0), '—');
  assert.equal(formatBrt('2026-10-29T17:05:00.000Z'), '29/10 14:05');
});

test('pipeline stages, clock and unknown values read in Portuguese', () => {
  assert.equal(stageLabel('qualifying'), 'Em qualificação');
  assert.equal(stageLabel('pre_enrollment'), 'Pré-matrícula');
  assert.equal(stageLabel('won'), 'Ganha');
  assert.equal(stageLabel('something-new'), 'something-new');
  assert.equal(channelLabel(null), 'Não identificado');
  assert.equal(channelLabel('meta_ads'), 'Meta Ads');
  assert.equal(formatClock('2026-10-29T17:05:00.000Z'), '14:05');
});

test('the step bar follows what the conversation has reached', () => {
  const opp = (stage: string, erpOrderId: string | null = null, erpSaleId: string | null = null) => ({ stage, erpOrderId, erpSaleId });
  const inbound = [{ direction: 'in' }];
  assert.equal(journeyReached({ messages: inbound, opportunities: [] }), 0);
  assert.equal(journeyReached({ messages: inbound, opportunities: [opp('new')] }), 1);
  assert.equal(journeyReached({ messages: [...inbound, { direction: 'out' }], opportunities: [opp('proposal')] }), 2);
  assert.equal(journeyReached({ messages: inbound, opportunities: [opp('pre_enrollment', 'ERP-ORD-0001')] }), 3);
  assert.equal(journeyReached({ messages: inbound, opportunities: [opp('won', 'ERP-ORD-0001', 'ERP-SALE-1001')] }), 4);
});

test('Abrir oportunidade is offered unless an opportunity is open', () => {
  assert.equal(hasOpenOpportunity([]), false);
  assert.equal(hasOpenOpportunity([{ status: 'won' }, { status: 'lost' }]), false);
  assert.equal(hasOpenOpportunity([{ status: 'lost' }, { status: 'open' }]), true);
});

test('"como soubemos" explains who read the field in plain words', () => {
  assert.equal(howWeKnew('code:K7P2'), 'Código curto K7P2');
  assert.equal(howWeKnew('system', 'gclid'), 'Formulário com identificador do Google');
  assert.equal(howWeKnew('rule:unit-from-number@v1'), 'Regra: número de destino');
  assert.equal(fieldValueLabel('unit', 'cps'), 'Campinas');
  assert.equal(fieldValueLabel('campaign', null), 'Não identificado');
});

test('event texts swap technical ids for words', () => {
  assert.equal(plainLabel('Conversa encaminhada para sales-rj'), 'Conversa encaminhada para Vendas · Rio');
  assert.equal(plainLabel('Ponto cps-lp-hof-01: auditing', { 'cps-lp-hof-01': 'Página de harmonização · Campinas' }), 'Ponto Página de harmonização · Campinas: em auditoria');
  assert.equal(plainLabel('Formulário em sp-lp-hof-01'), 'Formulário em sp-lp-hof-01');
});
