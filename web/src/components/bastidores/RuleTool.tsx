import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Code, LevelBadge } from '@/components/origin';
import { ActionError } from '@/components/states';
import { replay, type AttributionChange, type ReplayResult } from '@/lib/api.ts';
import { channelLabel, productLabel, unitLabel } from '@/lib/format.ts';
import { useAction } from '@/lib/hooks.ts';

const WINDOWS = [30, 14];

function Side({ side }: { side: AttributionChange['before'] }) {
  if (!side) return <span>sem origem</span>;
  return <span className="inline-flex items-center gap-1.5">{channelLabel(side.channel)} <LevelBadge level={side.level} /></span>;
}

export function RuleTool({ windowDays, onApplied }: { windowDays: number; onApplied: () => Promise<void> }) {
  const [next, setNext] = useState(String(windowDays));
  const [preview, setPreview] = useState<ReplayResult | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const action = useAction();
  const changed = Number(next) !== windowDays;

  useEffect(() => { setNext(String(windowDays)); }, [windowDays]);
  useEffect(() => {
    setPreview(null);
    if (!changed) return;
    let alive = true;
    replay(Number(next), false).then((r) => { if (alive) setPreview(r); }, () => { if (alive) setPreview(null); });
    return () => { alive = false; };
  }, [next, windowDays]);

  const apply = async () => {
    const ok = await action.run(async () => {
      const r = await replay(Number(next), true);
      setApplied(`Janela de ${r.rules.attributionWindowDays} dias aplicada. ${r.changes.length === 0 ? 'Nenhuma oportunidade mudou.' : `${r.changes.length} oportunidade${r.changes.length === 1 ? ' mudou' : 's mudaram'}.`}`);
      await onApplied();
    });
    if (!ok) setApplied(null);
  };

  return (
    <details className="border-t" open>
      <summary className="cursor-pointer p-4 text-[0.9375rem] font-semibold">
        Regra de atribuição <span className="text-meta font-normal text-muted-foreground">· {windowDays} dias em uso</span>
      </summary>
      <div className="px-4 pb-4">
        <p className="text-sm text-muted-foreground">Por quantos dias um contato antigo ainda conta</p>
        <div className="mt-3 flex items-end gap-2.5">
          <label className="flex flex-1 flex-col gap-1.5 text-sm">
            Janela
            <Select value={next} onValueChange={(v) => { setNext(v); setApplied(null); }}>
              <SelectTrigger className="w-full" aria-label="Janela de atribuição"><SelectValue /></SelectTrigger>
              <SelectContent>{WINDOWS.map((d) => <SelectItem key={d} value={String(d)}>{d} dias</SelectItem>)}</SelectContent>
            </Select>
          </label>
          <Button size="lg" disabled={!changed || action.busy} onClick={() => void apply()}>Aplicar</Button>
        </div>
        <div className="mt-3 rounded-md border bg-background p-3 text-sm" aria-live="polite">
          {applied ? applied : !changed ? `Janela atual: ${windowDays} dias. Troque a janela para ver o efeito antes de aplicar.`
            : !preview ? 'Calculando a prévia…'
            : preview.changes.length === 0 ? 'Prévia · nenhuma oportunidade muda neste momento. A nova janela valerá para os próximos acontecimentos.'
            : (
              <>
                <strong>Prévia · {preview.changes.length} oportunidade{preview.changes.length === 1 ? '' : 's'} muda{preview.changes.length === 1 ? '' : 'm'}</strong>
                {preview.changes.map((c) => (
                  <div key={c.opportunityId} className="mt-2">
                    <div>{c.personName ?? 'Pessoa sem nome'} · {productLabel(c.product)} · {unitLabel(c.unit)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5"><Side side={c.before} /><span aria-hidden="true">→</span><Side side={c.after} /></div>
                    <Code>{c.opportunityId}</Code>
                  </div>
                ))}
              </>
            )}
        </div>
        <ActionError message={action.error} />
      </div>
    </details>
  );
}
