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
}
export interface Reply { text: string; basedOn: { tool: string; readAt: string }[]; setMode?: 'human'; askOrigin?: true }

// With the preposition each place takes in Portuguese; online courses already say so in the name.
const UNIT_PLACE: Record<string, string> = { sp: ' em São Paulo', rj: ' no Rio de Janeiro', cps: ' em Campinas', online: '' };
const ORIGIN_QUESTION = 'Antes, como você conheceu a Clinic? Instagram, Google, indicação ou outro?';
const MENU = 'Oi! Sou a assistente da Clinic. Você quer saber de cursos, ser paciente modelo ou tirar uma dúvida?';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const ddmm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

function offerText(hello: string, o: CourseOffer, now: string): string {
  const where = `A turma de ${o.name}${UNIT_PLACE[o.unit] ?? ` em ${o.unit}`}`;
  const source = `(consultado no ERP às ${hhmm(now)})`;
  if (o.seatsLeft <= 0) return `${hello} ${where} de ${ddmm(o.nextClass)} está sem vagas ${source}. Quer que eu avise quando abrir a próxima?`;
  const seats = o.seatsLeft === 1 ? '1 vaga' : `${o.seatsLeft} vagas`;
  return `${hello} ${where} começa em ${ddmm(o.nextClass)}, custa R$ ${o.price.toLocaleString('pt-BR')} e tem ${seats} ${source}. Quer garantir a sua?`;
}

// Pure: the same context always gives the same reply. Numbers only come from the offer read in the ERP.
export function composeReply(ctx: ReplyContext): Reply | null {
  if (ctx.conversation.mode === 'human') return null;
  const c = ctx.classification;
  const first = ctx.person.name?.split(' ')[0] ?? null;
  const hello = `Olá${first ? `, ${first}` : ''}!`;
  const unsure = c.intent === 'other' || c.confidence < (ctx.threshold ?? DEFAULT_RULES.aiConfidenceThreshold);

  // Sensitive subjects: welcome, never answer the merits, hand the conversation to people.
  if (!unsure && c.intent === 'clinical_question') {
    return { text: `${hello} Sinto muito pelo incômodo. Não posso orientar sobre isso por aqui, então já passei sua mensagem para a nossa equipe clínica, que vai falar com você neste número.`, basedOn: [], setMode: 'human' };
  }
  if (!unsure && c.intent === 'complaint') {
    return { text: `${hello} Sinto muito pelo que aconteceu. Já passei sua mensagem para o atendimento prioritário, e uma pessoa da equipe vai falar com você por aqui.`, basedOn: [], setMode: 'human' };
  }
  if (!unsure && c.intent === 'course_purchase' && ctx.erpUnavailable) {
    return { text: `${hello} Não consegui consultar as turmas no sistema agora. Já passei sua conversa para a equipe de vendas, que responde por aqui.`, basedOn: [], setMode: 'human' };
  }

  let reply: Reply;
  if (unsure) {
    // The answer to our origin question ("vi no insta") is not a new subject: thank instead of showing the menu.
    if (c.declaredChannel && ctx.conversation.originAsked) {
      return { text: `Obrigada por contar${first ? `, ${first}` : ''}! Anotei aqui. Posso ajudar com mais alguma coisa?`, basedOn: [] };
    }
    reply = { text: MENU, basedOn: [] };
  } else if (c.intent === 'course_purchase') {
    reply = ctx.offer
      ? { text: offerText(hello, ctx.offer, ctx.now), basedOn: [{ tool: 'get_course_offer', readAt: ctx.now }] }
      : { text: `${hello} Qual curso você procura e em qual unidade: São Paulo, Rio de Janeiro ou Campinas?`, basedOn: [] };
  } else if (c.intent === 'patient_booking') {
    reply = { text: `${hello} Que bom que você quer ser paciente modelo. Vou passar sua conversa para a agenda da unidade, que combina o horário com você por aqui.`, basedOn: [] };
  } else {
    reply = { text: `${hello} Vou passar sua dúvida para o suporte ao aluno, que responde por aqui.`, basedOn: [] };
  }
  // One question, once, and only when nobody has told us yet.
  if (ctx.fields.channel.level === 'unknown' && !ctx.conversation.originAsked && !c.declaredChannel) {
    return { ...reply, text: `${reply.text} ${ORIGIN_QUESTION}`, askOrigin: true };
  }
  return reply;
}
