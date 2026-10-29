import { Bot, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { OriginSummaryView } from '@/components/origin';
import { Resource } from '@/components/states';
import type { ConversationItem, Mode } from '@/lib/api.ts';
import type { Poll } from '@/lib/hooks.ts';
import { actorLabel, formatBrt, formatClock, queueLabel } from '@/lib/format.ts';
import { cn } from '@/lib/utils';

export const initials = (name: string | null) => (name ?? '?').split(' ').map((n) => n[0]).slice(0, 2).join('');

// The list has no message text; say who spoke last and when.
function lastLine({ lastMessage: m }: ConversationItem): string {
  if (!m) return 'Sem mensagens';
  const who = m.direction === 'in' ? 'Cliente escreveu' : `${actorLabel(m.actor).replace(' (atendente)', '')} respondeu`;
  return `${who} às ${formatClock(m.at)}`;
}

export function ModeBadge({ mode }: { mode: Mode }) {
  const Icon = mode === 'ai' ? Bot : UserRound;
  return (
    <Badge variant="outline" className="h-auto rounded-sm py-0.5 text-meta font-semibold">
      <Icon aria-hidden="true" />
      {mode === 'ai' ? 'IA atendendo' : 'Atendimento humano'}
    </Badge>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando conversas">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex gap-3 border-b px-4 py-3">
          <Skeleton className="size-10 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-5 w-1/2" /></div>
        </div>
      ))}
    </div>
  );
}

interface Props {
  poll: Poll<ConversationItem[]>;
  items: ConversationItem[];
  selected: { personId: string; businessNumber: string } | null;
  onSelect: (s: { personId: string; businessNumber: string }) => void;
}

export function ConversationList({ poll, items, selected, onSelect }: Props) {
  return (
    <Resource poll={poll} what="A lista de conversas" skeleton={<ListSkeleton />}>
      {() => items.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma conversa ainda.</p>
      ) : (
        <ul>
          {items.map((c) => {
            const active = selected?.personId === c.personId && selected.businessNumber === c.businessNumber;
            const last = lastLine(c);
            return (
              <li key={`${c.personId}/${c.businessNumber}`}>
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onSelect({ personId: c.personId, businessNumber: c.businessNumber })}
                  className={cn('flex w-full gap-3 border-b border-l-[3px] px-4 py-3 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50', active ? 'border-l-foreground bg-secondary' : 'border-l-transparent')}
                >
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-md border bg-muted text-sm font-semibold text-muted-foreground">{initials(c.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold" title={c.name ?? undefined}>{c.name ?? 'Pessoa sem nome'}</span>
                      <time dateTime={c.lastAt} className="shrink-0 text-meta text-muted-foreground">{formatBrt(c.lastAt)}</time>
                    </span>
                    <span className="block truncate text-sm text-muted-foreground" title={last}>{last}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="h-auto rounded-sm py-0.5 text-meta">{c.queue ? queueLabel(c.queue) : 'Sem fila'}</Badge>
                      <ModeBadge mode={c.mode} />
                    </span>
                    <span className="mt-1.5 block"><OriginSummaryView origin={c.origin} /></span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Resource>
  );
}
