import { Check } from 'lucide-react';
import { SideCard } from '@/components/atendimento/SideCard';
import { Thread } from '@/components/atendimento/Thread';
import { Skeleton } from '@/components/ui/skeleton';
import { Resource } from '@/components/states';
import { getConversation, type ConversationDetail } from '@/lib/api.ts';
import { usePoll } from '@/lib/hooks.ts';
import { JOURNEY, journeyReached } from '@/lib/journey.ts';
import { cn } from '@/lib/utils';

function StepBar({ reached }: { reached: number }) {
  return (
    <ol aria-label="Etapas da jornada" className="flex shrink-0 items-start border-b bg-card px-6 py-3">
      {JOURNEY.map((label, i) => {
        const done = i <= reached;
        const current = i === reached;
        return (
          <li key={label} aria-current={current ? 'step' : undefined} className="relative flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
            {i > 0 && <span aria-hidden="true" className={cn('absolute top-3 right-1/2 h-0.5 w-full -translate-y-1/2', i <= reached ? 'bg-foreground' : 'bg-border')} />}
            <span className={cn('relative z-10 grid size-6 place-items-center rounded-full border-2 text-xs font-semibold', done ? 'border-foreground bg-foreground text-primary-foreground' : 'border-input bg-card text-muted-foreground', current && 'ring-3 ring-ring/30')}>
              {done ? <Check aria-hidden="true" className="size-3.5" /> : i + 1}
            </span>
            <span className={cn('text-sm', current ? 'font-semibold' : done ? 'font-medium' : 'text-muted-foreground')}>{label}</span>
            <span className="text-xs text-muted-foreground">{current ? 'etapa atual' : done ? 'feita' : 'a fazer'}</span>
          </li>
        );
      })}
    </ol>
  );
}

function PaneSkeleton() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_22.5rem] group-data-[guide=open]/guide:grid-cols-[minmax(0,1fr)_18.75rem]" aria-busy="true" aria-label="Carregando a conversa">
      <div className="space-y-4 p-6"><Skeleton className="h-12 w-3/5" /><Skeleton className="ml-auto h-16 w-3/5" /><Skeleton className="h-12 w-2/5" /><Skeleton className="ml-auto h-20 w-3/5" /></div>
      <div className="space-y-4 border-l p-4"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-48" /><Skeleton className="h-32" /></div>
    </div>
  );
}

export function ConversationPane({ personId, businessNumber, onChanged }: { personId: string; businessNumber: string; onChanged: () => Promise<void> }) {
  const detail = usePoll(() => getConversation(personId, businessNumber), `${personId}/${businessNumber}`);
  const changed = async () => { await Promise.all([detail.reload(), onChanged()]); };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Resource poll={detail} what="A conversa" skeleton={<><StepBar reached={0} /><PaneSkeleton /></>}>
        {(d: ConversationDetail) => (
          <>
            <StepBar reached={journeyReached(d)} />
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_22.5rem] group-data-[guide=open]/guide:grid-cols-[minmax(0,1fr)_18.75rem]">
              <Thread detail={d} onChanged={changed} />
              <SideCard detail={d} onChanged={changed} />
            </div>
          </>
        )}
      </Resource>
    </div>
  );
}
