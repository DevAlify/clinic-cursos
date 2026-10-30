import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EntryPointsTab } from '@/components/bastidores/SmallTabs';
import { UnitCoverage } from '@/components/bastidores/CoverageTab';
import { Code, LevelBar } from '@/components/origin';
import { Resource } from '@/components/states';
import { getCampaigns, getState, type AppState, type CampaignRow } from '@/lib/api.ts';
import { alertAction, alertTitle, campaignLabel, formatMoney, ownerLabel, productLabel, unitLabel } from '@/lib/format.ts';
import { usePoll } from '@/lib/hooks.ts';

const money = (v: number | null) => (v === null ? '—' : formatMoney(v));

function CampaignTable({ rows }: { rows: CampaignRow[] }) {
  if (rows.length === 0) return <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhuma campanha com leads até agora.</p>;
  const num = 'text-right align-top tabular-nums';
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-background hover:bg-background">
          <TableHead>Campanha</TableHead>
          <TableHead>Unidade</TableHead>
          <TableHead>Produto</TableHead>
          <TableHead className="text-right">Leads</TableHead>
          <TableHead className="text-right">Oportunidades</TableHead>
          <TableHead className="text-right">Ganhas</TableHead>
          <TableHead className="min-w-44">Origem dos leads</TableHead>
          <TableHead className="text-right">Vagas restantes</TableHead>
          <TableHead className="text-right">Investimento</TableHead>
          <TableHead className="text-right">Custo por lead</TableHead>
          <TableHead className="text-right">Custo por venda</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => (
          <TableRow key={c.campaign}>
            <TableCell className="max-w-64 align-top whitespace-normal"><strong>{campaignLabel(c.campaign)}</strong><Code>{c.campaign}</Code></TableCell>
            <TableCell className="align-top">{c.unit ? unitLabel(c.unit) : '—'}</TableCell>
            <TableCell className="align-top">{c.product ? productLabel(c.product) : '—'}</TableCell>
            <TableCell className={num}>{c.leads}</TableCell>
            <TableCell className={num}>{c.opportunities}</TableCell>
            <TableCell className={num}>{c.won}</TableCell>
            <TableCell className="align-top"><LevelBar counts={c.levels} label={campaignLabel(c.campaign)} /></TableCell>
            <TableCell className={num}>{c.seatsLeft ?? '—'}</TableCell>
            <TableCell className={num}>{money(c.spend)}</TableCell>
            <TableCell className={num}>{money(c.costPerLead)}</TableCell>
            <TableCell className={num}>{money(c.costPerSale)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Alerts({ state }: { state: AppState }) {
  if (state.alerts.length === 0) return null;
  return (
    <section aria-label="Alertas" className="space-y-3">
      {state.alerts.map((a) => {
        const ep = state.entryPoints.find((e) => e.code === a.entryPoint);
        return (
          <Alert key={a.id} className="border-input bg-card p-4 has-[>svg]:grid-cols-[auto_1fr]">
            <TriangleAlert aria-hidden="true" className="size-5" />
            <AlertTitle className="text-base font-semibold">{ep ? alertTitle(ep.label, ep.status) : 'Alerta'}</AlertTitle>
            <AlertDescription className="text-foreground">
              <p>{a.message}</p>
              <p className="mt-1.5 text-muted-foreground"><strong className="text-foreground">Ação:</strong> {alertAction(a.action)} · <strong className="text-foreground">Responsável:</strong> {ownerLabel(a.owner)}</p>
              <Code>{a.entryPoint}</Code>
            </AlertDescription>
          </Alert>
        );
      })}
    </section>
  );
}

const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section aria-label={title} className="overflow-hidden rounded-lg border bg-card">
    <h2 className="border-b px-5 py-3.5 text-lg font-semibold tracking-tight">{title}</h2>
    {children}
  </section>
);

export function CampanhasView() {
  const state = usePoll(getState, 'state-campaigns');
  const campaigns = usePoll(getCampaigns, 'campaigns');
  return (
    <div className="mx-auto max-w-[105rem] space-y-5 px-7 py-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campanhas</h1>
        <p className="mt-1 text-sm text-muted-foreground">Quanto cada campanha trouxe, o que já virou venda e onde a origem se perdeu. Valores de investimento fictícios.</p>
      </div>
      {state.data && <Alerts state={state.data} />}
      <Panel title="Resultado por campanha">
        <Resource poll={campaigns} what="O resultado por campanha" skeleton={<div className="space-y-3 p-5" aria-busy="true" aria-label="Carregando campanhas">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>}>
          {(rows) => <CampaignTable rows={rows} />}
        </Resource>
      </Panel>
      <Resource poll={state} what="Os pontos de entrada e a cobertura" skeleton={<Skeleton className="h-64" />}>
        {(s) => (
          <div className="grid grid-cols-2 gap-5">
            <Panel title="Pontos de entrada"><div className="p-5"><EntryPointsTab state={s} heading={false} /></div></Panel>
            <Panel title="Cobertura de origem por unidade"><div className="p-5"><UnitCoverage state={s} /></div></Panel>
          </div>
        )}
      </Resource>
    </div>
  );
}
