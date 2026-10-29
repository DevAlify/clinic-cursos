import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Code, FieldList } from '@/components/origin';
import { Resource } from '@/components/states';
import { getState, type PipelineCard } from '@/lib/api.ts';
import { productLabel, roleLabel, stageLabel, unitLabel } from '@/lib/format.ts';
import { usePoll } from '@/lib/hooks.ts';

// Ficha of the opportunity: person, roles and the origin of the first contact, field by field.
export function OpportunityPanel({ card, onClose }: { card: PipelineCard; onClose: () => void }) {
  const state = usePoll(getState, 'state-crm');
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, [card.id]);

  return (
    <aside
      aria-label={`Ficha de ${card.name ?? 'pessoa sem nome'}`}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      className="absolute inset-y-0 right-0 z-10 flex w-[25rem] flex-col rounded-lg border bg-card shadow-lg"
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b p-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight" title={card.name ?? undefined}>{card.name ?? 'Pessoa sem nome'}</h2>
          <p className="text-sm text-muted-foreground">{productLabel(card.product)} · {unitLabel(card.unit)}</p>
        </div>
        <Button ref={closeRef} variant="ghost" size="icon" aria-label="Fechar a ficha" onClick={onClose}><X aria-hidden="true" /></Button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          Etapa <Badge variant="outline" className="h-auto rounded-sm py-0.5 text-meta font-semibold">{stageLabel(card.stage)}</Badge>
        </div>
        {(card.erpOrderId || card.erpSaleId) && (
          <div>
            {card.erpOrderId && <Code>Pedido no ERP · {card.erpOrderId}</Code>}
            {card.erpSaleId && <Code>Venda confirmada · {card.erpSaleId}</Code>}
          </div>
        )}
        <Resource poll={state} what="A ficha" skeleton={<Skeleton className="h-64" />}>
          {(s) => {
            const person = s.people.find((p) => p.id === card.personId);
            const opportunity = s.opportunities.find((o) => o.id === card.id);
            const fields = card.origin ?? s.touches.find((t) => t.seq === opportunity?.firstTouchSeq)?.fields ?? null;
            const labels = Object.fromEntries(s.entryPoints.map((e) => [e.code, e.label]));
            return (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {person?.roles.map((r) => <Badge key={`${r.role}-${r.unit}`} variant="outline" className="h-auto rounded-sm py-0.5 text-meta">{roleLabel(r.role)} · {unitLabel(r.unit)}</Badge>)}
                </div>
                <h3 className="text-sm font-semibold">Origem, campo a campo</h3>
                {fields ? <FieldList fields={fields} entryLabels={labels} /> : <p className="text-sm text-muted-foreground">Ainda sem contato de origem registrado para esta oportunidade.</p>}
                {opportunity && <Code>Regra de atribuição · {opportunity.attributionRule}</Code>}
              </>
            );
          }}
        </Resource>
      </div>
    </aside>
  );
}
