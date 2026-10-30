import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ResetControl } from '@/components/ResetControl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ActionError, Resource } from '@/components/states';
import { RuleTool } from '@/components/bastidores/RuleTool';
import { reset, simulate, type AppState, type StepView } from '@/lib/api.ts';
import { useAction, type Poll } from '@/lib/hooks.ts';
import { cn } from '@/lib/utils';

const PLAY_DELAY_MS = 1500;
const ALL = 'all';

function StepsSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Carregando o roteiro">
      {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12" />)}
    </div>
  );
}

export function ScriptPanel({ steps, state, refresh }: { steps: Poll<StepView[]>; state: Poll<AppState>; refresh: () => Promise<void> }) {
  const [playing, setPlaying] = useState(false);
  const [who, setWho] = useState(ALL);
  const action = useAction();
  const list = steps.data ?? [];
  const done = list.filter((s) => s.ran).length;
  const next = list.find((s) => !s.ran);
  const lastDone = list.reduce((acc, s, i) => (s.ran ? i : acc), -1);
  const people = [...new Set(list.map((s) => s.who))];

  const runStep = (id: string) =>
    action.run(async () => {
      const r = await simulate(id);
      await refresh();
      if (!r.ok) throw new Error(`O passo foi enviado, mas o sistema recusou (código ${r.status}).`);
    });

  // "Passar tudo": one step every 1.5 s so the audience sees each record appear on the right.
  useEffect(() => {
    if (!playing) return;
    if (!next) { setPlaying(false); return; }
    const timer = setTimeout(() => { void runStep(next.id).then((ok) => { if (!ok) setPlaying(false); }); }, PLAY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [playing, next?.id]);

  const restart = async () => {
    setPlaying(false);
    setWho(ALL);
    await reset();
    await refresh();
  };

  return (
    <section aria-labelledby="outside-title" className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="shrink-0 border-b px-[1.125rem] py-4">
        <h2 id="outside-title" className="text-xl font-semibold tracking-tight">O mundo lá fora</h2>
        <p className="mt-0.5 text-meta text-muted-foreground">10 e 29 de outubro de 2026 · {list.length} acontecimentos</p>
      </div>
      <div className="shrink-0 border-b bg-surface-soft px-3.5 pt-3 pb-2">
        <div className="flex flex-wrap gap-1.5">
          <Button size="lg" className="h-9 px-3" disabled={!next || playing || action.busy} onClick={() => { if (next) void runStep(next.id); }}>Próximo passo</Button>
          <Button size="lg" variant="outline" className="h-9 px-3" disabled={!next && !playing} aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>
            {playing ? 'Pausar' : 'Passar tudo'}
          </Button>
          <ResetControl className="h-9 px-3" onReset={restart} />
        </div>
        <div className="mt-2.5 flex items-center justify-between text-meta text-muted-foreground">
          <span>{done}/{list.length} passos feitos</span>
          <progress className="h-1.5 w-24 accent-primary" max={Math.max(list.length, 1)} value={done} aria-label="Passos feitos" />
        </div>
        <ActionError message={action.error} />
        <p role="status" className="sr-only">{lastDone >= 0 ? `Passo ${lastDone + 1} de ${list.length}: ${list[lastDone]?.who}, ${list[lastDone]?.label}` : 'Nenhum passo feito.'}</p>
      </div>
      <div role="region" tabIndex={0} aria-label="Acontecimentos e controles da demonstração" className="min-h-0 flex-1 overflow-auto overscroll-contain">
        <Resource poll={steps} what="O roteiro" skeleton={<StepsSkeleton />}>
          {(all) => (
            <>
              <label className="flex items-center gap-2.5 px-3.5 pt-3 pb-2 text-meta">
                Filtrar pessoa
                <Select value={who} onValueChange={setWho}>
                  <SelectTrigger size="sm" className="w-40" aria-label="Filtrar pessoa"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todas</SelectItem>
                    {people.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              <ol className="px-2.5 pb-3" aria-label="Passos em ordem cronológica">
                {all.map((s, i) => (
                  who === ALL || s.who === who ? (
                    <li
                      key={s.id}
                      aria-current={i === lastDone ? 'step' : undefined}
                      className={cn('flex min-h-14 gap-2.5 rounded-sm border border-transparent px-2 py-2.5 text-sm', i === lastDone && 'border-input bg-secondary', s.ran && 'text-foreground')}
                    >
                      <span className="w-5 shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block"><strong>{s.who}</strong> · {s.label}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{s.ran ? '✓ feito' : 'a fazer'}</span>
                      </span>
                    </li>
                  ) : null
                ))}
              </ol>
            </>
          )}
        </Resource>
        {state.data && <RuleTool windowDays={state.data.rules.attributionWindowDays} onApplied={refresh} />}
      </div>
    </section>
  );
}
