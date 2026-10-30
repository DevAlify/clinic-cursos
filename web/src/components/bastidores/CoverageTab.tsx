import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Code, LEVELS, LevelBar } from '@/components/origin';
import { EmptyState } from '@/components/states';
import type { AppState } from '@/lib/api.ts';
import { channelLabel, levelLabel, percent, unitLabel } from '@/lib/format.ts';

// Coverage numbers shared with the Campanhas tab: by unit, with the mix of levels.
export function UnitCoverage({ state }: { state: AppState }) {
  const rows = Object.entries(state.coverage.byUnit);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma oportunidade aberta até este passo.</p>;
  const total = rows.reduce((sum, [, mix]) => sum + mix.total, 0);
  return (
    <>
      <div className="rounded-md border">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-background hover:bg-background">
              <TableHead className="w-[28%]">Unidade</TableHead>
              {LEVELS.map((l) => <TableHead key={l} className="text-right">{levelLabel(l)}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(([unit, mix]) => (
              <TableRow key={unit}>
                <TableCell className="align-top whitespace-normal"><strong>{unitLabel(unit)}</strong><LevelBar counts={mix} label={unitLabel(unit)} /></TableCell>
                {LEVELS.map((l) => <TableCell key={l} className="text-right align-top tabular-nums">{mix[l]}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-meta text-muted-foreground">{total} oportunidades · janela de {state.rules.attributionWindowDays} dias. Canal conhecido pode ser observado, declarado ou inferido.</p>
    </>
  );
}

export function CoverageTab({ state }: { state: AppState }) {
  const points = state.coverage.byEntryPoint.filter((p) => p.total > 0 || p.status !== 'released');
  if (points.length === 0 && Object.keys(state.coverage.byUnit).length === 0) return <EmptyState title="Nenhum registro nesta aba." detail="Clique em Próximo passo." />;
  const channels = Object.entries(state.coverage.byChannel);
  return (
    <>
      <h3 className="mb-3.5 text-[1.0625rem] font-semibold">O que sabemos em cada entrada</h3>
      {points.map((p) => (
        <article key={p.code} className="border-b py-4 first:pt-0">
          <h4 className="font-semibold">{p.label}</h4>
          <Code>{p.code}</Code>
          <div className="mt-2.5 text-sm">
            campanha observada<br />
            <strong className="text-[1.1875rem] font-semibold tracking-tight">{p.campaignObserved}/{p.total}</strong>{' '}
            <span className="text-muted-foreground">{percent(p.campaignObserved, p.total)}</span>
            <LevelBar counts={{ observed: p.campaignObserved, declared: 0, inferred: 0, unknown: p.total - p.campaignObserved }} label={`Campanha em ${p.label}`} />
          </div>
        </article>
      ))}
      <h3 className="mt-6 mb-3.5 text-[1.0625rem] font-semibold">Origem das oportunidades por unidade</h3>
      <UnitCoverage state={state} />
      {channels.length > 0 && (
        <>
          <h3 className="mt-6 mb-2.5 text-[1.0625rem] font-semibold">Oportunidades por canal</h3>
          <ul className="space-y-1 text-sm">
            {channels.map(([c, n]) => <li key={c} className="flex justify-between border-b py-1.5"><span>{c === 'desconhecido' ? 'Não identificado' : channelLabel(c)}</span><span className="tabular-nums">{n}</span></li>)}
          </ul>
        </>
      )}
    </>
  );
}
