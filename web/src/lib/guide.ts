import { useEffect, useState } from 'react';
import { getGuide, type Guide } from './api.ts';
import { usePoll, type Poll } from './hooks.ts';

// The server never marks the CRM step as done: it is the user opening the CRM tab once the sale is confirmed.
const CRM_KEY = 'clinic-guide-crm-done';
const readCrm = (): boolean => { try { return localStorage.getItem(CRM_KEY) === '1'; } catch { return false; } };
const writeCrm = (done: boolean) => { try { if (done) localStorage.setItem(CRM_KEY, '1'); else localStorage.removeItem(CRM_KEY); } catch { /* storage blocked: the flag lives only in memory */ } };

function withCrm(guide: Guide, crmDone: boolean): Guide {
  const crm = guide.steps.find((s) => s.id === 'crm');
  if (!crmDone || !crm || crm.status === 'done') return guide;
  return { ...guide, done: guide.done + 1, steps: guide.steps.map((s) => (s.id === 'crm' ? { ...s, status: 'done' } : s)) };
}

export function useGuide(tab: string): Poll<Guide> {
  const poll = usePoll(getGuide, 'guide');
  const [crmDone, setCrmDone] = useState(readCrm);
  const erpDone = poll.data?.steps.find((s) => s.id === 'erp')?.status === 'done';
  const loaded = poll.data !== null;

  useEffect(() => {
    if (!loaded) return;
    const next = crmDone ? erpDone : erpDone && tab === 'crm'; // a reset (erp no longer done) clears the flag
    if (next !== crmDone) { writeCrm(next); setCrmDone(next); }
  }, [loaded, erpDone, tab, crmDone]);

  return { ...poll, data: poll.data ? withCrm(poll.data, crmDone && erpDone) : null };
}
