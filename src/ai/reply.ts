import { DEFAULT_RULES } from '../config.ts';
import type { ConversationMode, Fields } from '../core/types.ts';
import type { CourseOffer } from '../erp/catalog.ts';
import type { Classification } from './classify.ts';

export interface ReplyContext {
  classification: Classification;
  conversation: { mode: ConversationMode; originAsked: boolean };
  person: { name: string | null };
  fields: Fields;
  offer: CourseOffer | null;
  now: string;
  // Beyond the plan's contract: the ERP did not answer (spec 4.2: the agent says so and hands over),
  // and the confidence floor, which follows the rules in force.
  erpUnavailable?: boolean;
  threshold?: number;
  // Read from the ERP by the agent: the classes with seats (generic interest, A1) and the class of the unit the
  // person named while no course was identified (A2).
  catalog?: CourseOffer[];
  unitOffer?: CourseOffer;
  // The clinic already wrote in this conversation (read from the log): no second greeting.
  greeted?: boolean;
  // The person said yes to an offer: the reply opens with "Ótimo!" instead of a greeting.
  confirmed?: boolean;
}
export interface Reply {
  text: string; basedOn: { tool: string; readAt: string }[]; setMode?: 'human'; askOrigin?: true;
  // The class this reply asks the person to confirm; the agent opens the opportunity on the next "sim".
  offer?: { product: string; unit: CourseOffer['unit'] };
}

// With the preposition each place takes in Portuguese; online courses already say so in the name.
const UNIT_PLACE: Record<string, string> = { sp: ' em São Paulo', rj: ' no Rio de Janeiro', cps: ' em Campinas', online: '' };
// Short places for the list of classes, and the same capitalised to open a sentence.
const UNIT_SHORT: Record<string, string> = { sp: 'em São Paulo', rj: 'no Rio', cps: 'em Campinas' };
const ORIGIN_QUESTION = 'Antes, como você conheceu a Clinic? Instagram, Google, indicação ou outro?';
const SUBJECTS = 'Você quer saber de cursos, ser paciente modelo ou tirar uma dúvida?';
// Only the first message introduces the assistant; later on, the same question without the introduction.
const menu = (greeted: boolean | undefined) => (greeted ? `Não entendi bem. ${SUBJECTS}` : `Oi! Sou a assistente da Clinic. ${SUBJECTS}`);
// "equipe de vendas de São Paulo": the place with the preposition the sales team takes; the online course has no unit team.
const SALES_OF: Record<string, string> = { sp: ' de São Paulo', rj: ' do Rio de Janeiro', cps: ' de Campinas', online: '' };

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const ddmm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

function offerText(hello: string, o: CourseOffer, now: string, confirmed: boolean | undefined): string {
  const where = `A turma de ${o.name}${UNIT_PLACE[o.unit] ?? ` em ${o.unit}`}`;
  const source = `(consultado no ERP às ${hhmm(now)})`;
  if (o.seatsLeft <= 0) return `${hello}${where} de ${ddmm(o.nextClass)} está sem vagas ${source}. Quer que eu avise quando abrir a próxima?`;
  const seats = o.seatsLeft === 1 ? '1 vaga' : `${o.seatsLeft} vagas`;
  const facts = `${hello}${where} começa em ${ddmm(o.nextClass)}, custa R$ ${o.price.toLocaleString('pt-BR')} e tem ${seats} ${source}.`;
  // After a "sim" the reply ends with the hand-off, not with a question a second "sim" would answer.
  return confirmed ? `${facts} Vou passar você para a equipe de vendas${SALES_OF[o.unit] ?? ` de ${o.unit}`}.` : `${facts} Quer garantir a sua?`;
}

const joinE = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs.at(-1)}`);

// "Temos turmas abertas de Harmonização Facial em São Paulo (14/11), no Rio (21/11) ..., e o curso online de X (01/11)."
function openClassesText(catalog: CourseOffer[]): string {
  const onsite = new Map<string, CourseOffer[]>();
  const online: CourseOffer[] = [];
  for (const o of catalog) {
    if (o.unit === 'online') online.push(o);
    else onsite.set(o.name, [...(onsite.get(o.name) ?? []), o]);
  }
  const places = [...onsite].map(([name, list]) => `${name} ${joinE(list.map((o) => `${UNIT_SHORT[o.unit] ?? `em ${o.unit}`} (${ddmm(o.nextClass)})`))}`);
  const courses = online.map((o) => `o curso online de ${o.name.replace(/\s*\(online\)$/i, '')} (${ddmm(o.nextClass)})`);
  const head = places.length ? `Temos turmas abertas de ${places.join(' e de ')}${courses.length ? `, e ${joinE(courses)}` : ''}` : `Temos ${joinE(courses)}`;
  return `${head}. Qual te interessa?`;
}

// The unit alone ("São Paulo"): offer that unit's class with date, price and seats. No greeting: the talk is under way.
function unitOfferReply(o: CourseOffer, now: string): Reply {
  const basedOn = [{ tool: 'get_course_offer', readAt: now }];
  const seats = o.seatsLeft === 1 ? '1 vaga' : `${o.seatsLeft} vagas`;
  if (o.unit === 'online') {
    const course = `O curso online de ${o.name.replace(/\s*\(online\)$/i, '')}`;
    if (o.seatsLeft <= 0) return { text: `${course} de ${ddmm(o.nextClass)} está sem vagas. Quer que eu avise quando abrir a próxima?`, basedOn };
    return { text: `${course} começa em ${ddmm(o.nextClass)}, R$ ${o.price.toLocaleString('pt-BR')}, ${seats}. É esse que você procura?`, basedOn, offer: { product: o.product, unit: o.unit } };
  }
  const place = UNIT_SHORT[o.unit] ?? `em ${o.unit}`;
  const where = place.charAt(0).toUpperCase() + place.slice(1);
  if (o.seatsLeft <= 0) return { text: `${where}, a turma de ${o.name} de ${ddmm(o.nextClass)} está sem vagas. Quer que eu avise quando abrir a próxima?`, basedOn };
  return {
    text: `${where}, a próxima turma é de ${o.name} em ${ddmm(o.nextClass)}, R$ ${o.price.toLocaleString('pt-BR')}, ${seats}. É essa que você procura?`,
    basedOn, offer: { product: o.product, unit: o.unit },
  };
}

// Pure: the same context always gives the same reply. Numbers only come from the offer read in the ERP.
export function composeReply(ctx: ReplyContext): Reply | null {
  if (ctx.conversation.mode === 'human') return null;
  const c = ctx.classification;
  const first = ctx.person.name?.split(' ')[0] ?? null;
  const hello = ctx.confirmed ? 'Ótimo! ' : ctx.greeted ? '' : `Olá${first ? `, ${first}` : ''}! `;
  const unsure = c.intent === 'other' || c.confidence < (ctx.threshold ?? DEFAULT_RULES.aiConfidenceThreshold);

  // Sensitive subjects: welcome, never answer the merits, hand the conversation to people.
  if (!unsure && c.intent === 'clinical_question') {
    return { text: `${hello}Sinto muito pelo incômodo. Não posso orientar sobre isso por aqui, então já passei sua mensagem para a nossa equipe clínica, que vai falar com você neste número.`, basedOn: [], setMode: 'human' };
  }
  if (!unsure && c.intent === 'complaint') {
    return { text: `${hello}Sinto muito pelo que aconteceu. Já passei sua mensagem para o atendimento prioritário, e uma pessoa da equipe vai falar com você por aqui.`, basedOn: [], setMode: 'human' };
  }
  if (ctx.erpUnavailable) {
    return { text: `${hello}Não consegui consultar as turmas no sistema agora. Já passei sua conversa para a equipe de vendas, que responde por aqui.`, basedOn: [], setMode: 'human' };
  }

  let reply: Reply;
  if (ctx.unitOffer) {
    reply = unitOfferReply(ctx.unitOffer, ctx.now);
  } else if (unsure) {
    // The answer to our origin question ("vi no insta") is not a new subject: thank instead of showing the menu.
    if (c.declaredChannel && ctx.conversation.originAsked) {
      if (ctx.catalog) return { text: `Obrigada por contar${first ? `, ${first}` : ''}! Anotei aqui. ${openClassesText(ctx.catalog)}`, basedOn: [{ tool: 'get_course_offer', readAt: ctx.now }] };
      return { text: `Obrigada por contar${first ? `, ${first}` : ''}! Anotei aqui. Posso ajudar com mais alguma coisa?`, basedOn: [] };
    }
    reply = { text: menu(ctx.greeted), basedOn: [] };
  } else if (c.intent === 'course_purchase') {
    reply = ctx.offer
      ? { text: offerText(hello, ctx.offer, ctx.now, ctx.confirmed), basedOn: [{ tool: 'get_course_offer', readAt: ctx.now }] }
      : ctx.catalog
        ? { text: `${hello}${openClassesText(ctx.catalog)}`, basedOn: [{ tool: 'get_course_offer', readAt: ctx.now }] }
        : { text: `${hello}Qual curso você procura e em qual unidade: São Paulo, Rio de Janeiro ou Campinas?`, basedOn: [] };
  } else if (c.intent === 'patient_booking') {
    reply = { text: `${hello}Que bom que você quer ser paciente modelo. Vou passar sua conversa para a agenda da unidade, que combina o horário com você por aqui.`, basedOn: [] };
  } else {
    reply = { text: `${hello}Vou passar sua dúvida para o suporte ao aluno, que responde por aqui.`, basedOn: [] };
  }
  // One question, once, and only when nobody has told us yet.
  if (ctx.fields.channel.level === 'unknown' && !ctx.conversation.originAsked && !c.declaredChannel && !ctx.confirmed) {
    return { ...reply, text: `${reply.text} ${ORIGIN_QUESTION}`, askOrigin: true };
  }
  return reply;
}
