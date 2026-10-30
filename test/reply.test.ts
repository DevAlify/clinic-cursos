import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyMessage, isConfirmation, unitMention } from '../src/ai/classify.ts';
import { composeReply, type ReplyContext } from '../src/ai/reply.ts';
import { originFromWhatsApp, withDeclaredChannel } from '../src/core/origin.ts';
import { CATALOG, findOffer } from '../src/erp/catalog.ts';

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
    basedOn: [{ tool: 'get_course_offer', readAt: NOW }], offer: { product: 'hof', unit: 'sp' },
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

test('A1: generic course interest lists the open classes from the catalog, never fixed text', () => {
  const list = 'Temos turmas abertas de Harmonização Facial em São Paulo (14/11), no Rio (21/11) e em Campinas (28/11), e o curso online de Intercorrências (01/11). Qual te interessa?';
  const r = composeReply(ctx('Quero saber de cursos', { catalog: CATALOG }));
  assert.deepEqual(r, { text: `Olá, Ana! ${list}`, basedOn: [{ tool: 'get_course_offer', readAt: NOW }] });
  // The text follows the catalog it was given: one class fewer, one class fewer in the sentence.
  assert.doesNotMatch(composeReply(ctx('Saber de Cursos', { catalog: CATALOG.filter((c) => c.unit !== 'rj') }))!.text, /Rio/);
  const thanks = composeReply(ctx('Vi no Instagram', { catalog: CATALOG, conversation: { mode: 'ai', originAsked: true } }));
  assert.equal(thanks!.text, `Obrigada por contar, Ana! Anotei aqui. ${list}`);
});

test('A2: a unit alone gets that unit class with date, price and seats, no greeting, and an offer to confirm', () => {
  const r = composeReply(ctx('São Paulo', { unitOffer: findOffer('hof', 'sp')! }));
  assert.deepEqual(r, {
    text: 'Em São Paulo, a próxima turma é de Harmonização Facial em 14/11, R$ 7.900, 3 vagas. É essa que você procura?',
    basedOn: [{ tool: 'get_course_offer', readAt: NOW }], offer: { product: 'hof', unit: 'sp' },
  });
  assert.match(composeReply(ctx('Rio', { unitOffer: { ...findOffer('hof', 'rj')!, seatsLeft: 1 } }))!.text, /^No Rio, .*, 1 vaga\. É essa/);
  const full = composeReply(ctx('Campinas', { unitOffer: { ...findOffer('hof', 'cps')!, seatsLeft: 0 } }));
  assert.match(full!.text, /^Em Campinas, a turma de Harmonização Facial de 28\/11 está sem vagas\./);
  assert.equal(full!.offer, undefined, 'a full class is not offered for confirmation');
});

test('A1 to A3 in human mode: the reply is always silent', () => {
  const human = { mode: 'human' as const, originAsked: true };
  for (const text of ['Quero saber de cursos', 'Vi no Instagram', 'São Paulo', 'sim']) {
    assert.equal(composeReply(ctx(text, { conversation: human, catalog: CATALOG, unitOffer: findOffer('hof', 'sp')! })), null);
  }
});

test('no second greeting once the clinic has already written in the conversation; a confirmed offer opens with "Ótimo!"', () => {
  const offer = findOffer('hof', 'sp')!;
  assert.match(composeReply(ctx('Quanto custa o curso?', { offer }))!.text, /^Olá, Ana! A turma/);
  assert.match(composeReply(ctx('Quanto custa o curso?', { offer, greeted: true }))!.text, /^A turma de Harmonização Facial em São Paulo começa/);
  assert.equal(composeReply(ctx('Quanto custa o curso?', { offer, greeted: true, confirmed: true }))!.text, 'Ótimo! A turma de Harmonização Facial em São Paulo começa em 14/11, custa R$ 7.900 e tem 3 vagas (consultado no ERP às 14:10). Vou passar você para a equipe de vendas de São Paulo.');
  // The confirmed reply ends with the hand-off, never with a question (not even the origin one).
  assert.match(composeReply(ctx('Quanto custa o curso?', { offer: findOffer('hof', 'rj')!, greeted: true, confirmed: true, fields: unknownChannel }))!.text, /equipe de vendas do Rio de Janeiro\.$/);
  assert.match(composeReply(ctx('Quanto custa o curso?', { offer: findOffer('hof', 'cps')!, greeted: true, confirmed: true }))!.text, /equipe de vendas de Campinas\.$/);
  assert.equal(composeReply(ctx('Quanto custa o curso?', { offer: findOffer('intercorrencias', 'online')!, greeted: true, confirmed: true }))!.text,
    'Ótimo! A turma de Intercorrências (online) começa em 01/11 e custa R$ 997 (consultado no ERP às 14:10). Vou passar você para a equipe de vendas.');
  assert.match(composeReply(ctx('Quero saber de cursos', { catalog: CATALOG, greeted: true }))!.text, /^Temos turmas abertas/);
  assert.match(composeReply(ctx('Quero fazer uma reclamação', { greeted: true }))!.text, /^Sinto muito pelo que aconteceu/);
});

test('the fallback menu introduces the assistant only in the first message of the conversation', () => {
  assert.equal(composeReply(ctx('Bom dia', { greeted: true }))!.text, 'Não entendi bem. Você quer saber de cursos, ser paciente modelo ou tirar uma dúvida?');
  assert.match(composeReply(ctx('Bom dia'))!.text, /^Oi! Sou a assistente da Clinic\./);
});

test('A2 for the online course: date, price and seats from the ERP, and an offer to confirm', () => {
  const r = composeReply(ctx('Intercorrências', { unitOffer: findOffer('intercorrencias', 'online')! }));
  assert.deepEqual(r, {
    text: 'O curso online de Intercorrências começa em 01/11, R$ 997. É esse que você procura?',
    basedOn: [{ tool: 'get_course_offer', readAt: NOW }], offer: { product: 'intercorrencias', unit: 'online' },
  });
});

test('isConfirmation accepts short messages made only of yes-words, and nothing else', () => {
  for (const yes of ['sim', 'Sim, quero', 'Quero sim', 'sim quero', 'Sim, essa', 'Sim por favor', 'ok', 'OK!', 'pode ser', 'Claro, com certeza!', 'É isso mesmo', 'essa mesma', 'sím']) assert.equal(isConfirmation(yes), true, yes);
  for (const no of ['', 'Bom dia', 'Quero saber de cursos', 'Sim, mas quanto custa?', 'sim sim sim sim sim sim', 'não', 'Rio']) assert.equal(isConfirmation(no), false, no);
});

test('the online course is named by its name or by "online"', () => {
  for (const text of ['Intercorrências', 'o curso online', 'Intercorrencia']) assert.equal(unitMention(text), 'online', text);
});

test('an unconfirmed ERP offer carries the offer to confirm, unless the class is full', () => {
  assert.deepEqual(composeReply(ctx('Quanto custa o curso?', { offer: findOffer('hof', 'rj')! }))!.offer, { product: 'hof', unit: 'rj' });
  assert.equal(composeReply(ctx('Quanto custa o curso?', { offer: { ...findOffer('hof', 'rj')!, seatsLeft: 0 } }))!.offer, undefined);
  assert.equal(composeReply(ctx('Quanto custa o curso?', { offer: findOffer('hof', 'rj')!, confirmed: true }))!.offer, undefined);
});

test('"intercorrência" in the singular is a clinical complaint, the plural names the online course', () => {
  for (const text of ['Tive uma intercorrência', 'Estou com uma intercorrencia']) {
    const r = composeReply(ctx(text, { unitOffer: undefined }));
    assert.equal(classifyMessage(text).intent, 'clinical_question', text);
    assert.equal(r?.setMode, 'human', text);
    assert.match(r!.text, /^Olá, Ana! Sinto muito pelo incômodo\./, text);
    assert.equal(r!.offer, undefined, text);
  }
  assert.equal(classifyMessage('Quero o curso de Intercorrências').intent, 'course_purchase');
  assert.equal(classifyMessage('Intercorrências').intent, 'other');
});
