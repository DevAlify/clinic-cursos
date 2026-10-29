import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Code, FieldList } from '@/components/origin';
import { ActionError } from '@/components/states';
import { advanceOpportunity, requestEnrollment, type ConversationDetail, type Stage, type V2Opportunity } from '@/lib/api.ts';
import { productLabel, roleLabel, stageLabel, unitLabel } from '@/lib/format.ts';
import { useAction } from '@/lib/hooks.ts';

// "Avançar etapa" walks new, qualifying and proposal; from proposal on, the ERP order is the next move.
const NEXT: Partial<Record<Stage, Stage>> = { new: 'qualifying', qualifying: 'proposal' };
const CLOSED: Stage[] = ['pre_enrollment', 'won', 'lost'];

function Opportunity({ o, onChanged }: { o: V2Opportunity; onChanged: () => Promise<void> }) {
  const action = useAction();
  const next = NEXT[o.stage];
  const canEnroll = !CLOSED.includes(o.stage) && o.erpOrderId === null;
  const advance = () => action.run(async () => {
    if (!next) return;
    await advanceOpportunity(o.id, next, 'Etapa avançada pelo atendente na conversa');
    await onChanged();
  });
  const enroll = () => action.run(async () => { await requestEnrollment(o.id); await onChanged(); });
  return (
    <article className="rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>{productLabel(o.product)} · {unitLabel(o.unit)}</strong>
        <Badge variant="outline" className="h-auto rounded-sm py-0.5 text-meta font-semibold">{stageLabel(o.stage)}</Badge>
      </div>
      {(o.erpOrderId || o.erpSaleId) && (
        <div className="mt-2">
          {o.erpOrderId && <Code>Pedido no ERP · {o.erpOrderId}</Code>}
          {o.erpSaleId && <Code>Venda confirmada · {o.erpSaleId}</Code>}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="lg" disabled={!next || action.busy} aria-label={next ? `Avançar etapa: de ${stageLabel(o.stage)} para ${stageLabel(next)}` : undefined} title={next ? `Vai para ${stageLabel(next)}` : undefined} onClick={() => void advance()}>
          Avançar etapa
        </Button>
        <Button size="lg" disabled={!canEnroll || action.busy} onClick={() => void enroll()}>Pré-matrícula → ERP</Button>
      </div>
      <ActionError message={action.error} />
    </article>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-sm font-semibold">{children}</h3>;
}

export function SideCard({ detail, onChanged }: { detail: ConversationDetail; onChanged: () => Promise<void> }) {
  return (
    <aside aria-label="Ficha da pessoa" tabIndex={0} className="min-h-0 space-y-5 overflow-y-auto border-l bg-card p-4">
      <section>
        <Heading>Pessoa</Heading>
        <p className="font-medium">{detail.person.name ?? 'Pessoa sem nome'}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {detail.person.roles.length === 0 && <span className="text-meta text-muted-foreground">Sem papel registrado</span>}
          {detail.person.roles.map((r) => <Badge key={`${r.role}-${r.unit}`} variant="outline" className="h-auto rounded-sm py-0.5 text-meta">{roleLabel(r.role)} · {unitLabel(r.unit)}</Badge>)}
        </div>
      </section>
      <section>
        <Heading>Oportunidades</Heading>
        {detail.opportunities.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma oportunidade aberta para esta pessoa.</p>
        ) : (
          <div className="space-y-3">{detail.opportunities.map((o) => <Opportunity key={o.id} o={o} onChanged={onChanged} />)}</div>
        )}
      </section>
      <section>
        <Heading>Origem, campo a campo</Heading>
        {detail.person.origin ? <FieldList fields={detail.person.origin} /> : <p className="text-sm text-muted-foreground">Ainda sem origem registrada para esta conversa.</p>}
      </section>
    </aside>
  );
}
