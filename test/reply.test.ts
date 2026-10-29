import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyMessage } from '../src/ai/classify.ts';
import { composeReply, type ReplyContext } from '../src/ai/reply.ts';
import { originFromWhatsApp, withDeclaredChannel } from '../src/core/origin.ts';
import { findOffer } from '../src/erp/catalog.ts';

const NOW = '2026-10-29T17:10:00.000Z'; // 14:10 in Brazil
const cps = { code: 'cps-whatsapp-principal-01', unit: 'cps', product: null, businessNumber: '551930000003' };
const unknownChannel = originFromWhatsApp({ businessNumber: '551930000003', code: null, referral: null }, cps, null);
const knownChannel = withDeclaredChannel(unknownChannel, 'instagram', 'ai:simulated-v1', 'vi no insta');
const ctx = (text: string, over: Partial<ReplyContext> = {}): ReplyContext => ({
  classification: classifyMessage(text), conversation: { mode: 'ai', originAsked: false }, person: { name: 'Ana Lima' },
  fields: knownChannel, offer: null, now: NOW, ...over,
});

test('in human mode the agent stays silent', () => {
  assert.equal(composeReply(ctx('Quanto custa o curso de harmonização?', { conversation: { mode: 'human', originAsked: false } })), null);
});

test('a course question with an ERP offer answers price, seats and date, citing the ERP and the time', () => {
  const r = composeReply(ctx('Oi! Quero saber da turma de novembro de harmonização', { offer: findOffer('hof', 'sp') }));
  assert.deepEqual(r, {
    text: 'Olá, Ana! A turma de Harmonização Facial em São Paulo começa em 14/11, custa R$ 7.900 e tem 3 vagas (consultado no ERP às 14:10). Quer garantir a sua?',
    basedOn: [{ tool: 'get_course_offer', readAt: NOW }],
  });
});

test('one seat is singular and a full class offers the next one', () => {
  const one = composeReply(ctx('Quanto custa o curso?', { offer: { ...findOffer('hof', 'cps')!, seatsLeft: 1 } }));
  assert.match(one!.text, /tem 1 vaga \(consultado/);
  const full = composeReply(ctx('Quanto custa o curso?', { offer: { ...findOffer('hof', 'cps')!, seatsLeft: 0 } }));
  assert.match(full!.text, /está sem vagas \(consultado no ERP às 14:10\)/);
  assert.equal(full!.basedOn[0].tool, 'get_course_offer');
  assert.match(composeReply(ctx('Quanto custa o curso?', { offer: findOffer('hof', 'rj') }))!.text, /turma de Harmonização Facial no Rio de Janeiro começa/);
});

test('an unknown channel gets the origin question once, with options', () => {
  const first = composeReply(ctx('Oi, quanto custa o curso de harmonização?', { fields: unknownChannel, offer: findOffer('hof', 'cps'), person: { name: 'Daniel Rocha' } }));
  assert.equal(first?.askOrigin, true);
  assert.match(first!.text, /^Olá, Daniel! A turma de Harmonização Facial em Campinas começa em 28\/11, custa R\$ 7\.600 e tem 2 vagas/);
  assert.match(first!.text, /Antes, como você conheceu a Clinic\? Instagram, Google, indicação ou outro\?$/);
  const again = composeReply(ctx('E tem turma em dezembro?', { fields: unknownChannel, conversation: { mode: 'ai', originAsked: true } }));
  assert.equal(again?.askOrigin, undefined);
  assert.doesNotMatch(again!.text, /como você conheceu/);
  const toldAlready = composeReply(ctx('Vi no insta, quanto custa o curso?', { fields: unknownChannel }));
  assert.doesNotMatch(toldAlready!.text, /como você conheceu/);
});

test('clinical questions and complaints are welcomed and handed to people, never answered on the merits', () => {
  const clinical = composeReply(ctx('Estou com inchaço depois do procedimento', { fields: unknownChannel, offer: findOffer('hof', 'cps') }));
  assert.equal(clinical?.setMode, 'human');
  assert.match(clinical!.text, /equipe clínica/);
  assert.doesNotMatch(clinical!.text, /R\$|vaga|como você conheceu/);
  assert.deepEqual(clinical!.basedOn, []);
  const complaint = composeReply(ctx('Quero fazer uma reclamação'));
  assert.equal(complaint?.setMode, 'human');
  assert.match(complaint!.text, /atendimento prioritário/);
});

test('without product or unit the agent asks which course; when the ERP is down it hands over', () => {
  assert.match(composeReply(ctx('Quero saber dos cursos'))!.text, /Qual curso você procura e em qual unidade/);
  const down = composeReply(ctx('Quanto custa o curso de harmonização?', { erpUnavailable: true }));
  assert.equal(down?.setMode, 'human');
  assert.match(down!.text, /Não consegui consultar as turmas/);
});

test('patients go to the unit schedule; anything else gets the menu, and an origin answer gets a thank you', () => {
  assert.match(composeReply(ctx('Quero ser paciente modelo'))!.text, /agenda da unidade/);
  assert.equal(composeReply(ctx('Bom dia', { person: { name: null } }))!.text,
    'Oi! Sou a assistente da Clinic. Você quer saber de cursos, ser paciente modelo ou tirar uma dúvida?');
  const thanks = composeReply(ctx('Vi no insta', { person: { name: 'Daniel Rocha' }, conversation: { mode: 'ai', originAsked: true } }));
  assert.equal(thanks!.text, 'Obrigada por contar, Daniel! Anotei aqui. Posso ajudar com mais alguma coisa?');
});
