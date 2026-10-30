import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Code, LevelBadge } from '@/components/origin';
import { EmptyState } from '@/components/states';
import type { AppState } from '@/lib/api.ts';
import { FIELD_LABEL, actorLabel, formatBrt, plainLabel } from '@/lib/format.ts';
import { cn } from '@/lib/utils';

const FIELDS = ['entryPoint', 'channel', 'campaign', 'unit', 'product'] as const;

export function EventsTab({ state }: { state: AppState }) {
  const [showHistory, setShowHistory] = useState(false);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const lastSeq = useRef<number | null>(null);
  const entryLabels = Object.fromEntries(state.entryPoints.map((p) => [p.code, p.label]));
  const touchBySeq = new Map(state.touches.map((t) => [t.seq, t]));
  const history = state.events.filter((e) => e.actor === 'seed');
  const events = showHistory ? state.events : state.events.filter((e) => e.actor !== 'seed');

  // The events that arrived since the previous poll are marked "novo" and scrolled into view.
  const maxSeq = state.events.reduce((m, e) => Math.max(m, e.seq), 0);
  useEffect(() => {
    const before = lastSeq.current;
    lastSeq.current = maxSeq;
    if (before === null) return;
    if (maxSeq <= before) { if (maxSeq < before) setFresh(new Set()); return; }
    setFresh(new Set(state.events.filter((e) => e.seq > before).map((e) => e.seq)));
    document.getElementById(`event-${maxSeq}`)?.scrollIntoView({ block: 'nearest' });
  }, [maxSeq]);

  if (state.events.length === 0) return <EmptyState title="Nada aconteceu ainda." detail="Clique em Próximo passo." />;
  return (
    <>
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <h3 className="text-[1.0625rem] font-semibold">Acontecimento → registro</h3>
        <div className="flex items-center gap-3">
          <span className="text-meta text-muted-foreground">{events.length} eventos</span>
          {history.length > 0 && (
            <Button variant="outline" size="sm" aria-pressed={showHistory} onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? 'Ocultar histórico' : `Mostrar histórico (${history.length})`}
            </Button>
          )}
        </div>
      </div>
      {events.length === 0 && <EmptyState title="Nada aconteceu ainda." detail="Clique em Próximo passo." />}
      <ol>
        {events.map((e) => {
          const touch = touchBySeq.get(e.seq);
          const isNew = fresh.has(e.seq);
          return (
            <li key={e.seq} id={`event-${e.seq}`} className={cn('ml-1 scroll-my-3 border-b border-l-2 px-3 py-3.5', isNew ? 'border-l-foreground bg-muted' : 'border-l-border')}>
              <div className="mb-1 flex items-center justify-between gap-2.5 text-meta text-muted-foreground">
                <span>Evento {String(e.seq).padStart(2, '0')} · <time dateTime={e.occurredAt}>{formatBrt(e.occurredAt)}</time> · {actorLabel(e.actor)}</span>
                {isNew && <Badge variant="outline" className="h-auto rounded-sm px-[0.4375rem] py-0.5 text-meta font-semibold">novo</Badge>}
              </div>
              <p className="font-medium">{plainLabel(e.label, entryLabels)}</p>
              {touch && (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-meta">
                  {touch.isTest && <Badge variant="outline" className="h-auto rounded-sm py-0.5 text-meta">teste</Badge>}
                  {FIELDS.map((name) => (
                    <span key={name} className="inline-flex items-center gap-1.5">{FIELD_LABEL[name].toLowerCase()}: <LevelBadge level={touch.fields[name].level} /></span>
                  ))}
                </div>
              )}
              <Code className="mt-1.5">{e.type} · {e.source}</Code>
            </li>
          );
        })}
      </ol>
    </>
  );
}
