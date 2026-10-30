import { LEVELS, LevelBadge, LEVEL_HELP } from '@/components/origin';
import { CorePanel } from '@/components/bastidores/CorePanel';
import { ScriptPanel } from '@/components/bastidores/ScriptPanel';
import { getState, getSteps } from '@/lib/api.ts';
import { usePoll } from '@/lib/hooks.ts';

function LevelLegend() {
  return (
    <div className="mb-4 grid grid-cols-4 gap-5" role="list" aria-label="O que cada nível de certeza significa">
      {LEVELS.map((level) => (
        <div key={level} role="listitem">
          <LevelBadge level={level} />
          <p className="mt-1.5 text-meta leading-snug text-muted-foreground">{LEVEL_HELP[level]}</p>
        </div>
      ))}
    </div>
  );
}

export function BastidoresView() {
  const state = usePoll(getState, 'state');
  const steps = usePoll(getSteps, 'steps');
  const refresh = async () => { await Promise.all([state.reload(), steps.reload()]); };
  return (
    <div className="mx-auto flex h-full min-h-[40rem] max-w-[105rem] flex-col px-7 pt-4">
      <div className="mb-3 flex items-center justify-between gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bastidores</h1>
          <p className="mt-1 text-sm text-muted-foreground">Acontece à esquerda. O núcleo registra à direita, com a certeza de cada campo.</p>
        </div>
        <span className="text-meta whitespace-nowrap text-muted-foreground">Modo apresentação · horário de Brasília</span>
      </div>
      <LevelLegend />
      <div className="grid min-h-0 flex-1 grid-cols-[24.375rem_minmax(0,1fr)] gap-4 pb-4">
        <ScriptPanel steps={steps} state={state} refresh={refresh} />
        <CorePanel state={state} refresh={refresh} />
      </div>
    </div>
  );
}
