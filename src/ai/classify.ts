export type Intent = 'course_purchase' | 'patient_booking' | 'student_question' | 'complaint' | 'clinical_question' | 'other';

export interface Classification {
  intent: Intent;
  confidence: number;
  declaredChannel: { value: string; quote: string; confidence: number } | null;
  product: { value: string; confidence: number } | null;
  model: string;
}

export const MODEL = 'simulated-v1';

export const INTENT_LABEL: Record<Intent, string> = {
  course_purchase: 'Quer comprar um curso', patient_booking: 'Quer ser paciente modelo', student_question: 'Dúvida de aluno',
  complaint: 'Reclamação', clinical_question: 'Dúvida clínica', other: 'Outro assunto',
};

// Order matters: sensitive subjects win over sales words in the same message.
const INTENT_RULES: [Intent, RegExp][] = [
  ['clinical_question', /\b(dor|inchad\w*|incha[çc]o|hematoma|rea[çc][ãa]o|alergia|febre)\b/i],
  ['complaint', /\b(reclama\w*|insatisfeit\w*|p[ée]ssim\w*|absurd\w*|procon)\b/i],
  ['patient_booking', /\b(paciente|modelo|agendar)\b/i],
  ['student_question', /\b(aluno|aluna|certificado|apostila)\b/i],
  ['course_purchase', /\b(cursos?|turma|matr[ií]cula|inscrever|inscri[çc][ãa]o|valor|pre[çc]o|quanto custa)\b/i],
];
// The quote keeps only the phrase that proves the channel ("vi no insta"), never the rest of the message.
const said = (words: string) => new RegExp(String.raw`\b(?:(?:vi|conheci|achei)\s+(?:no|na|pelo|pela)\s+)?(?:${words})\b`, 'i');
const CHANNEL_RULES: [string, RegExp][] = [
  ['instagram', said('insta|instagram')], ['google', said('google')], ['referral', said('indica[çc][ãa]o|indicou')],
  ['tiktok', said('tiktok')], ['youtube', said('youtube')],
];
const PRODUCT_RULES: [string, RegExp][] = [['hof', /\bharmoniza[çc][ãa]o\b/i]];
const UNIT_RULES: [string, RegExp][] = [
  ['sp', /\b(?:sp|s[ãa]o paulo)\b/i], ['rj', /\b(?:rj|rio(?: de janeiro)?)\b/i], ['cps', /\b(?:cps|campinas)\b/i],
];
const CONFIRMATION = /^\s*(?:sim|isso(?: mesmo)?|(?:[ée] )?essa(?: mesmo| mesma)?|[ée] isso|quero|pode ser|claro|com certeza)\s*[.!]*\s*$/i;

// The unit a person names ("São Paulo", "rio"), or null.
export const unitMention = (text: string): string | null => UNIT_RULES.find(([, re]) => re.test(text))?.[0] ?? null;
// A short yes to what the clinic just offered.
export const isConfirmation = (text: string): boolean => CONFIRMATION.test(text);

// Stand-in for a real model: same input and output contract, so swapping the provider changes only this file.
export function classifyMessage(text: string): Classification {
  const intent = INTENT_RULES.find(([, re]) => re.test(text));
  const channel = CHANNEL_RULES.find(([, re]) => re.test(text));
  const product = PRODUCT_RULES.find(([, re]) => re.test(text));
  return {
    intent: intent?.[0] ?? 'other',
    confidence: intent ? 0.91 : 0.5,
    declaredChannel: channel ? { value: channel[0], quote: text.match(channel[1])![0], confidence: 0.93 } : null,
    product: product ? { value: product[0], confidence: 0.9 } : null,
    model: MODEL,
  };
}

export function routeFor(intent: Intent, unit: string | null, confidence: number, threshold: number): { queue: string; why: string } {
  if (confidence < threshold || intent === 'other') return { queue: 'triage', why: 'a IA não tem certeza do assunto' };
  if (intent === 'complaint') return { queue: 'human-priority', why: 'reclamação' };
  if (intent === 'clinical_question') return { queue: 'clinical-team', why: 'dúvida clínica, que a IA não responde' };
  if (intent === 'student_question') return { queue: 'student-support', why: 'dúvida de aluno' };
  if (!unit) return { queue: 'triage', why: 'unidade desconhecida' };
  return intent === 'course_purchase' ? { queue: `sales-${unit}`, why: 'interesse em curso' } : { queue: `patients-${unit}`, why: 'paciente modelo' };
}
