import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Code, FieldTable, OriginSummaryView } from '@/components/origin';
import { ActionError, EmptyState } from '@/components/states';
import { declareOrigin, type AppState } from '@/lib/api.ts';
import { channelLabel, formatBrt, productLabel, roleLabel, stageLabel, unitLabel } from '@/lib/format.ts';
import { useAction } from '@/lib/hooks.ts';

// One click records what the person said; the value is the channel code the core understands.
const ORIGIN_OPTIONS = ['instagram', 'google', 'referral', 'other'];

const initials = (name: string | null) => (name ?? '?').split(' ').map((n) => n[0]).slice(0, 2).join('');

export function PeopleTab({ state, onChanged }: { state: AppState; onChanged: () => Promise<void> }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const action = useAction();
  // Test contacts stay out of the people list, as in the approved mockup. Default: whoever the core heard from last.
  const people = state.people.filter((p) => { const own = state.touches.filter((t) => t.personId === p.id); return own.length === 0 || own.some((t) => !t.isTest); });
  const latestId = state.touches.filter((t) => !t.isTest).at(-1)?.personId;
  const person = people.find((p) => p.id === (picked ?? latestId)) ?? people.at(-1);
  if (!person) return <EmptyState title="Nada aconteceu ainda." detail="Clique em Próximo passo." />;

  const entryLabels = Object.fromEntries(state.entryPoints.map((e) => [e.code, e.label]));
  const touches = state.touches.filter((t) => t.personId === person.id && !t.isTest);
  const last = touches.at(-1);
  const opportunities = state.opportunities.filter((o) => o.personId === person.id);
  const sale = opportunities.find((o) => o.erpSaleId)?.erpSaleId;

  const declare = async (value: string) => {
    if (!last) return;
    const ok = await action.run(async () => {
      await declareOrigin(person.id, last.seq, value, `Registrado pelo atendente: ${channelLabel(value)}`);
      await onChanged();
    });
    if (ok) setAsking(false);
  };

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <div aria-hidden="true" className="grid size-[2.625rem] shrink-0 place-items-center rounded-md border bg-muted text-[0.9375rem] font-semibold text-muted-foreground">{initials(person.name)}</div>
        <div className="min-w-0">
          <h3 className="truncate text-xl font-semibold tracking-tight" title={person.name ?? undefined}>{person.name ?? 'Pessoa sem nome'}</h3>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {person.roles.length ? person.roles.map((r) => `${roleLabel(r.role)} · ${unitLabel(r.unit)}`).join(' · ') : 'Sem papel registrado'}
          </div>
        </div>
        <label className="ml-auto flex w-48 flex-col gap-1 text-sm">
          Explorar pessoa
          <Select value={person.id} onValueChange={(v) => { setPicked(v); setAsking(false); action.clearError(); }}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name ?? p.id}</SelectItem>)}</SelectContent>
          </Select>
        </label>
      </div>
      {sale && <div className="mb-3 rounded-md border bg-background px-3.5 py-3 text-sm">Venda confirmada pelo ERP.<Code>{sale}</Code></div>}

      <div className="flex items-start justify-between gap-3 pb-2.5 text-sm">
        <strong>{last ? 'Último contato' : 'Nenhum contato de aquisição recebido'}</strong>
        {last && <span className="text-muted-foreground">{formatBrt(last.occurredAt)}</span>}
      </div>
      {last && <FieldTable fields={last.fields} entryLabels={entryLabels} />}

      {last && last.fields.channel.level === 'unknown' && (
        <div className="mt-3.5">
          <Button variant="outline" size="lg" aria-expanded={asking} aria-controls="origin-options" onClick={() => setAsking((v) => !v)}>Registrar origem declarada</Button>
          {asking && (
            <div id="origin-options" className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label="O que a pessoa contou">
              {ORIGIN_OPTIONS.map((o) => <Button key={o} variant="outline" size="lg" disabled={action.busy} onClick={() => void declare(o)}>{channelLabel(o)}</Button>)}
            </div>
          )}
          <ActionError message={action.error} />
        </div>
      )}

      <details className="mt-[1.125rem] border-t">
        <summary className="cursor-pointer py-[0.9375rem] text-[0.9375rem] font-semibold">
          Ver detalhes · {opportunities.length} oportunidade{opportunities.length === 1 ? '' : 's'} · {touches.length} contato{touches.length === 1 ? '' : 's'}
        </summary>
        <h3 className="mb-2 text-[1.0625rem] font-semibold">Oportunidades</h3>
        {opportunities.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma oportunidade aberta até este passo.</p>}
        {opportunities.map((o) => {
          const first = o.firstTouchSeq === null ? undefined : state.touches.find((t) => t.seq === o.firstTouchSeq);
          return (
            <article key={o.id} className="mt-2.5 rounded-md border p-3.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{productLabel(o.product)} · {unitLabel(o.unit)}</strong>
                <Badge variant="outline" className="h-auto rounded-sm py-0.5 text-meta">{o.stage ? stageLabel(o.stage) : o.status}</Badge>
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-1.5">Origem atribuída: <OriginSummaryView origin={first?.fields ?? null} /></p>
              <Code>{o.attributionRule}{o.erpOrderId ? ` · ${o.erpOrderId}` : ''}{o.erpSaleId ? ` · ${o.erpSaleId}` : ''}</Code>
            </article>
          );
        })}
        <h3 className="mt-5 mb-1 text-[1.0625rem] font-semibold">Histórico de contatos</h3>
        {touches.length === 0 && <p className="text-sm text-muted-foreground">Nenhum contato de aquisição recebido.</p>}
        {touches.map((t) => (
          <div key={t.seq}>
            <div className="flex justify-between gap-3 pt-3 pb-2 text-sm"><strong>Contato do evento {t.seq}</strong><span className="text-muted-foreground">{formatBrt(t.occurredAt)}</span></div>
            <FieldTable fields={t.fields} entryLabels={entryLabels} />
          </div>
        ))}
      </details>
    </>
  );
}
