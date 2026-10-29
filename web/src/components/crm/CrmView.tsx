import { useRef, useState } from 'react';
import { OpportunityPanel } from '@/components/crm/OpportunityPanel';
import { Skeleton } from '@/components/ui/skeleton';
import { Code, OriginSummaryView } from '@/components/origin';
import { Resource } from '@/components/states';
import { getPipeline, type Pipeline, type PipelineCard } from '@/lib/api.ts';
import { STAGES, productLabel, stageLabel, unitLabel } from '@/lib/format.ts';
import { usePoll } from '@/lib/hooks.ts';
import { cn } from '@/lib/utils';

function BoardSkeleton() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-6 gap-3 pb-4" aria-busy="true" aria-label="Carregando o funil">
      {STAGES.map((s) => (
        <div key={s} className="space-y-2.5 rounded-lg border bg-muted p-2.5">
          <Skeleton className="h-6 w-2/3" /><Skeleton className="h-24 bg-card" /><Skeleton className="h-24 bg-card" />
        </div>
      ))}
    </div>
  );
}

function Card({ card, active, onOpen }: { card: PipelineCard; active: boolean; onOpen: (el: HTMLElement) => void }) {
  const name = card.name ?? 'Pessoa sem nome';
  const what = `${productLabel(card.product)} · ${unitLabel(card.unit)}`;
  return (
    <li>
      <button
        type="button"
        aria-expanded={active}
        aria-label={`${name}, ${what}. Abrir ficha`}
        onClick={(e) => onOpen(e.currentTarget)}
        className={cn('w-full rounded-md border bg-card p-3 text-left text-sm outline-none transition-colors hover:bg-background focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50', active && 'border-foreground')}
      >
        <span className="block truncate font-semibold" title={name}>{name}</span>
        <span className="mt-0.5 block text-meta text-muted-foreground">{what}</span>
        <span className="mt-2 block"><OriginSummaryView origin={card.origin} /></span>
        {card.erpOrderId && <Code className="mt-2">Pedido · {card.erpOrderId}</Code>}
        {card.erpSaleId && <Code>Venda · {card.erpSaleId}</Code>}
      </button>
    </li>
  );
}

function Board({ pipeline }: { pipeline: Pipeline }) {
  const [open, setOpen] = useState<PipelineCard | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const selected = open ? Object.values(pipeline).flat().find((c) => c.id === open.id) ?? open : null;
  const close = () => { setOpen(null); trigger.current?.focus(); };
  return (
    <div className="relative min-h-0 flex-1 pb-4">
      <div className="grid h-full grid-cols-6 gap-3">
        {STAGES.map((stage) => (
          <section key={stage} aria-labelledby={`stage-${stage}`} className="flex min-h-0 flex-col rounded-lg border bg-muted">
            <h2 id={`stage-${stage}`} className="flex shrink-0 items-center justify-between px-3 pt-2.5 pb-2 text-sm font-semibold">
              {stageLabel(stage)}
              <span className="rounded-sm border bg-card px-1.5 text-meta font-semibold tabular-nums">{pipeline[stage].length}</span>
            </h2>
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2.5 pb-2.5">
              {pipeline[stage].map((c) => (
                <Card key={c.id} card={c} active={selected?.id === c.id} onOpen={(el) => { trigger.current = el; setOpen(c); }} />
              ))}
              {pipeline[stage].length === 0 && <li className="px-1 py-4 text-center text-meta text-muted-foreground">Nenhuma oportunidade</li>}
            </ul>
          </section>
        ))}
      </div>
      {selected && <OpportunityPanel card={selected} onClose={close} />}
    </div>
  );
}

export function CrmView() {
  const pipeline = usePoll(getPipeline, 'pipeline');
  return (
    <div className="mx-auto flex h-full max-w-[105rem] flex-col px-7 pt-4">
      <div className="mb-3">
        <h1 className="text-2xl font-semibold tracking-tight">CRM</h1>
        <p className="mt-1 text-sm text-muted-foreground">Cada oportunidade na sua etapa, da primeira conversa à venda confirmada no ERP.</p>
      </div>
      <Resource poll={pipeline} what="O funil de oportunidades" skeleton={<BoardSkeleton />}>
        {(data) => <Board pipeline={data} />}
      </Resource>
    </div>
  );
}
