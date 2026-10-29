import type { Level } from './types.ts';

export interface TouchLite { seq: number; occurredAt: string; channelLevel: Level; isTest: boolean }
export interface Attribution { firstSeq: number | null; lastSeq: number | null; rule: string }

const DAY_MS = 86_400_000;

export const attributionRule = (windowDays: number): string => `known-channel-touch-${windowDays}d@v1`;

// Linking a sale to a touch is a conclusion: named rule, version and window, by event time.
export function computeAttribution(touches: TouchLite[], openedAt: string, windowDays: number): Attribution {
  const end = Date.parse(openedAt);
  const start = end - windowDays * DAY_MS;
  const candidates = touches
    .filter((t) => !t.isTest && t.channelLevel !== 'unknown')
    .filter((t) => {
      const at = Date.parse(t.occurredAt);
      return at >= start && at <= end;
    })
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.seq - b.seq);
  return { firstSeq: candidates[0]?.seq ?? null, lastSeq: candidates.at(-1)?.seq ?? null, rule: attributionRule(windowDays) };
}
