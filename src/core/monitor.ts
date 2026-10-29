import { MONITOR } from '../config.ts';
import type { Level } from './types.ts';

export interface PointTouch { seq: number; occurredAt: string; campaignLevel: Level; isTest: boolean }

const DAY_MS = 86_400_000;
const byTime = (a: PointTouch, b: PointTouch) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.seq - b.seq;

// Returns the affected leads when the last N arrived without campaign after a healthy baseline.
export function findCoverageDrop(points: PointTouch[], cfg = MONITOR): PointTouch[] | null {
  const real = points.filter((p) => !p.isTest).sort(byTime);
  if (real.length <= cfg.lastLeads) return null;
  const last = real.slice(-cfg.lastLeads);
  if (last.some((p) => p.campaignLevel !== 'unknown')) return null;
  const from = Date.parse(last[0].occurredAt) - cfg.baselineDays * DAY_MS;
  const base = real.slice(0, -cfg.lastLeads).filter((p) => Date.parse(p.occurredAt) >= from);
  if (base.length < cfg.minBaselineLeads) return null;
  const coverage = base.filter((p) => p.campaignLevel !== 'unknown').length / base.length;
  return coverage >= cfg.minBaselineCoverage ? last : null;
}

export function alertText(label: string, firstAffectedAt: string, affected: number, owner: string): { message: string; action: string } {
  const time = new Date(firstAffectedAt)
    .toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
    .replace(':', 'h');
  const subject = label.charAt(0).toUpperCase() + label.slice(1);
  return {
    message: `${subject} parou de enviar a campanha desde as ${time}. ${affected} leads afetados.`,
    action: `Conferir a página publicada. Responsável: ${owner}.`,
  };
}
