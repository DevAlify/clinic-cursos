export const JOURNEY = ['Entrada', 'Contato/oportunidade', 'Atendimento', 'Pré-matrícula', 'Venda confirmada'] as const;

interface JourneyInput {
  messages: { direction: string }[];
  opportunities: { stage: string; erpOrderId: string | null; erpSaleId: string | null }[];
}

// Index (in JOURNEY) of the furthest step this conversation has reached; every step before it is done.
export function journeyReached({ messages, opportunities }: JourneyInput): number {
  if (opportunities.some((o) => o.stage === 'won' || o.erpSaleId !== null)) return 4;
  if (opportunities.some((o) => o.stage === 'pre_enrollment' || o.erpOrderId !== null)) return 3;
  if (messages.some((m) => m.direction === 'out')) return 2;
  return opportunities.length > 0 ? 1 : 0;
}

// "Abrir oportunidade" is offered while the person has no open one; won and lost ones stay in the history.
export const hasOpenOpportunity = (opportunities: { status: string }[]): boolean => opportunities.some((o) => o.status === 'open');
