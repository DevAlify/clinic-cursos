import { NUMBERS } from '../../scenarios/fixtures.ts';
import { anaPersonId } from '../../scenarios/steps.ts';
import type { Db } from './db.ts';
import { allOpportunities, messagesOf, touchesOfPerson } from './queries.ts';

type Status = 'done' | 'current' | 'todo';
export interface GuideStep { id: 'origin' | 'message' | 'attendance' | 'erp' | 'crm'; status: Status; hasOpportunity?: boolean }
export interface Guide { total: number; done: number; steps: GuideStep[] }

// Where the demo script stands, read from the log's projections and always about the fixture person Ana Lima
// (the SP landing page, the SP number and her SP opportunity). The first step not done is the current one.
// The CRM step is never done here: it becomes current once the sale is confirmed, and the page marks it done
// after the evaluator opens the CRM tab.
export function getGuide(db: Db): Guide {
  const ana = anaPersonId(db);
  const opportunities = ana ? allOpportunities(db).filter((o) => o.personId === ana) : [];
  const sp = opportunities.find((o) => o.unit === 'sp' && o.product === 'hof');
  const done = {
    origin: ana !== null && touchesOfPerson(db, ana).some((t) => t.source === 'form' && !t.isTest && t.fields.entryPoint.value === 'sp-lp-hof-01' && t.fields.channel.level === 'observed'),
    message: ana !== null && messagesOf(db, ana, NUMBERS.sp).some((m) => m.direction === 'in'),
    attendance: sp !== undefined && (sp.erpOrderId !== null || sp.stage === 'pre_enrollment' || sp.stage === 'won'),
    erp: sp?.status === 'won',
    crm: false,
  };
  const ids = ['origin', 'message', 'attendance', 'erp', 'crm'] as const;
  const current = ids.find((id) => !done[id]);
  const steps = ids.map((id): GuideStep => {
    const status: Status = done[id] ? 'done' : id === current ? 'current' : 'todo';
    return id === 'attendance' ? { id, status, hasOpportunity: opportunities.some((o) => o.status === 'open') } : { id, status };
  });
  return { total: ids.length, done: steps.filter((s) => s.status === 'done').length, steps };
}
