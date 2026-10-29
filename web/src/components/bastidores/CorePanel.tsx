import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertsTab, EntryPointsTab, QueuesTab } from '@/components/bastidores/SmallTabs';
import { CoverageTab } from '@/components/bastidores/CoverageTab';
import { EventsTab } from '@/components/bastidores/EventsTab';
import { PeopleTab } from '@/components/bastidores/PeopleTab';
import { Resource } from '@/components/states';
import type { AppState } from '@/lib/api.ts';
import type { Poll } from '@/lib/hooks.ts';

const PANEL = 'min-h-0 overflow-auto p-5';

function CoreSkeleton() {
  return (
    <div className="space-y-4 p-5" aria-busy="true" aria-label="Carregando os registros">
      {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16" />)}
    </div>
  );
}

export function CorePanel({ state, refresh }: { state: Poll<AppState>; refresh: () => Promise<void> }) {
  const s = state.data;
  const count = (n: number | undefined) => (n ? ` ${n}` : '');
  return (
    <section aria-labelledby="core-title" className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="shrink-0 border-b px-[1.125rem] py-4">
        <h2 id="core-title" className="text-xl font-semibold tracking-tight">O que o núcleo registra</h2>
        <p className="mt-0.5 text-meta text-muted-foreground">Cada acontecimento vira um registro, com a certeza de cada campo.</p>
      </div>
      <Tabs defaultValue="events" className="min-h-0 flex-1 gap-0">
        <TabsList variant="line" aria-label="Registros do núcleo" className="h-12 w-full shrink-0 justify-start gap-3.5 overflow-x-auto rounded-none border-b px-[1.125rem] py-0">
          {[
            ['events', `Eventos${count(s?.events.filter((e) => e.actor !== 'seed').length)}`], ['people', 'Pessoas'], ['queues', `Filas${count(s?.queue.length)}`],
            ['alerts', `Alertas${count(s?.alerts.length)}`], ['entries', 'Pontos de entrada'], ['coverage', 'Cobertura'],
          ].map(([value, label]) => (
            <TabsTrigger key={value} value={value} className="h-full flex-none px-0.5 text-sm text-muted-foreground group-data-horizontal/tabs:after:bottom-0 group-data-horizontal/tabs:after:h-[3px]">{label}</TabsTrigger>
          ))}
        </TabsList>
        <Resource poll={state} what="Os registros" skeleton={<CoreSkeleton />}>
          {(data) => (
            <>
              <TabsContent value="events" className={PANEL}><EventsTab state={data} /></TabsContent>
              <TabsContent value="people" className={PANEL}><PeopleTab state={data} onChanged={refresh} /></TabsContent>
              <TabsContent value="queues" className={PANEL}><QueuesTab state={data} /></TabsContent>
              <TabsContent value="alerts" className={PANEL}><AlertsTab state={data} /></TabsContent>
              <TabsContent value="entries" className={PANEL}><EntryPointsTab state={data} /></TabsContent>
              <TabsContent value="coverage" className={PANEL}><CoverageTab state={data} /></TabsContent>
            </>
          )}
        </Resource>
      </Tabs>
    </section>
  );
}
