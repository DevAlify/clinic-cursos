import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Code } from '@/components/origin';
import { EmptyState } from '@/components/states';
import type { AppState } from '@/lib/api.ts';
import { alertAction, alertTitle, ownerLabel, plainLabel, queueLabel, statusLabel } from '@/lib/format.ts';

function Section({ title, aside }: { title: string; aside?: string }) {
  return (
    <div className="mt-6 mb-3.5 flex items-center justify-between gap-3 first:mt-0">
      <h3 className="text-[1.0625rem] font-semibold">{title}</h3>
      {aside && <span className="text-meta text-muted-foreground">{aside}</span>}
    </div>
  );
}

export function QueuesTab({ state }: { state: AppState }) {
  const entryLabels = Object.fromEntries(state.entryPoints.map((e) => [e.code, e.label]));
  const name = (id: string | null) => state.people.find((p) => p.id === id)?.name ?? 'Pessoa sem nome';
  const nothing = state.queue.length === 0 && state.duplicates.length === 0 && state.quarantine.length === 0;
  if (nothing) return <EmptyState title="Nenhum registro nesta aba." detail="Clique em Próximo passo." />;
  return (
    <>
      <Section title="Encaminhamentos registrados" aside={`${state.queue.length} decisões`} />
      {state.queue.length === 0 && <p className="text-sm text-muted-foreground">Nenhum encaminhamento até este passo.</p>}
      {state.queue.map((q) => {
        const summary = typeof q.details.summary === 'string' ? q.details.summary : null;
        return (
          <article key={q.id} className="space-y-1.5 border-b py-4 text-sm first:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>{name(q.personId)}</strong>
              <span className="text-meta text-muted-foreground">Evento {q.createdSeq}{q.status !== 'open' && ` · ${q.status}`}</span>
            </div>
            <p><strong>Fila</strong> · {queueLabel(q.queue)}</p>
            <p><strong>Motivo</strong> · {plainLabel(q.reason, entryLabels)}</p>
            {summary && <p><strong>Resumo</strong> · {plainLabel(summary, entryLabels)}</p>}
          </article>
        );
      })}
      <p className="mt-3 text-meta text-muted-foreground">O motivo registra o que se sabia naquele momento. Formulários não geram encaminhamento pela IA.</p>

      <Section title="Repetições ignoradas" aside={`${state.duplicates.length}`} />
      {state.duplicates.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma mensagem repetida até este passo.</p> : (
        <ul className="space-y-2 text-sm">
          {state.duplicates.map((d) => (
            <li key={`${d.source}:${d.externalId}`}>Recebida {d.count} vezes, registrada uma só.<Code>{d.source} · {d.externalId}</Code></li>
          ))}
        </ul>
      )}

      <Section title="Quarentena" aside={`${state.quarantine.length}`} />
      {state.quarantine.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum evento em quarentena.</p> : (
        <ul className="space-y-2 text-sm">
          {state.quarantine.map((q) => <li key={q.seq}>O evento {q.seq} ficou no log, mas não virou registro.<Code>{q.error}</Code></li>)}
        </ul>
      )}
    </>
  );
}

export function AlertsTab({ state }: { state: AppState }) {
  if (state.alerts.length === 0) return <EmptyState title="Nenhum registro nesta aba." detail="Nenhum alerta até este passo." />;
  const entry = (code: string) => state.entryPoints.find((e) => e.code === code);
  return (
    <>
      {state.alerts.map((a) => {
        const ep = entry(a.entryPoint);
        return (
          <article key={a.id} className="mb-4 rounded-lg border border-input bg-surface-soft p-[1.125rem]">
            <h3 className="mb-2.5 text-[1.0625rem] font-semibold">{ep ? alertTitle(ep.label, ep.status) : 'Alerta'}</h3>
            <p>{a.message}</p>
            <dl className="mt-5 grid grid-cols-2 gap-4">
              <div><dt className="text-meta text-muted-foreground">Ação</dt><dd className="mt-1">{alertAction(a.action)}</dd></div>
              <div><dt className="text-meta text-muted-foreground">Responsável</dt><dd className="mt-1">{ownerLabel(a.owner)}</dd></div>
              <div><dt className="text-meta text-muted-foreground">Ponto de entrada</dt><dd className="mt-1">{ep?.label ?? a.entryPoint}<Code>{a.entryPoint}</Code></dd></div>
              <div><dt className="text-meta text-muted-foreground">Status do ponto</dt><dd className="mt-1">{ep ? statusLabel(ep.status) : '—'}</dd></div>
            </dl>
          </article>
        );
      })}
      <p className="text-meta text-muted-foreground">Os registros anteriores ao alerta continuam com a campanha desconhecida; a correção protege as próximas entradas.</p>
    </>
  );
}

export function EntryPointsTab({ state, heading = true }: { state: AppState; heading?: boolean }) {
  if (state.entryPoints.length === 0) return <EmptyState title="Nenhum registro nesta aba." />;
  return (
    <>
      {heading && <Section title="Pontos de entrada" aside={`${state.entryPoints.length} pontos`} />}
      <div className="rounded-md border">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-background hover:bg-background">
              <TableHead className="w-[49%]">Ponto de entrada</TableHead>
              <TableHead className="w-[23%]">Status</TableHead>
              <TableHead>Responsável</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.entryPoints.map((e) => (
              <TableRow key={e.code}>
                <TableCell className="align-top whitespace-normal"><strong>{e.label}</strong><Code>{e.code}</Code></TableCell>
                <TableCell className="align-top"><Badge variant="outline" className="h-auto rounded-sm py-0.5 text-meta">{statusLabel(e.status)}</Badge></TableCell>
                <TableCell className="align-top whitespace-normal">{ownerLabel(e.owner)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-meta text-muted-foreground">Em auditoria: investigar a entrada. Liberado: operação autorizada. Bloqueado: entrada impedida.</p>
    </>
  );
}
