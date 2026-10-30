import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ActionError } from '@/components/states';
import { getCatalog, openOpportunity, type CatalogItem, type ConversationDetail } from '@/lib/api.ts';
import { queueLabel, shortDate, unitFullLabel } from '@/lib/format.ts';
import { useAction, usePoll } from '@/lib/hooks.ts';

const itemKey = (c: CatalogItem) => `${c.product}/${c.unit}`;
const courseName = (c: CatalogItem) => c.name.replace(/\s*\(online\)$/, '');
const seatsText = (n: number) => `${n} ${n === 1 ? 'vaga' : 'vagas'}`;
const detailLine = (c: CatalogItem) => [unitFullLabel(c.unit), shortDate(c.nextClass), c.unit === 'online' ? null : seatsText(c.seatsLeft)].filter(Boolean).join(' · ');
// The sales queue ("sales-rj") says which unit the person is talking to.
const queueUnit = (queue: string | null) => (queue?.startsWith('sales-') ? queue.slice('sales-'.length) : null);

function CourseForm({ detail, onDone, onCancel }: { detail: ConversationDetail; onDone: () => Promise<void>; onCancel: () => void }) {
  const catalog = usePoll(getCatalog, 'catalog');
  const action = useAction();
  const [picked, setPicked] = useState<string | null>(null);
  const items = catalog.data ?? [];
  const { conversation, person, messages } = detail;
  const preselected = items.find((c) => c.unit === queueUnit(conversation.queue));
  const chosen = items.find((c) => itemKey(c) === picked) ?? preselected;
  const legend = useId();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    // The tool is idempotent per trigger: the last message of the conversation is what triggered this action.
    const triggerSeq = messages.reduce((max, m) => Math.max(max, m.seq), 0);
    const ok = await action.run(async () => {
      const id = await openOpportunity(person.id, chosen.product, chosen.unit, triggerSeq);
      if (id === null) throw new Error('Não consegui abrir a oportunidade. Confira o curso e a unidade e tente de novo.');
      await onDone();
    });
    if (ok) onCancel();
  };

  return (
    <form onSubmit={(e) => void submit(e)} aria-labelledby={legend} className="mt-3 rounded-md border bg-background p-3">
      <fieldset className="m-0 min-w-0 border-0 p-0" disabled={action.busy}>
        <legend id={legend} className="mb-2 text-sm font-medium">Curso e unidade</legend>
        {catalog.data === null && catalog.error === null && <div aria-busy="true" aria-label="Carregando as turmas" className="space-y-2"><Skeleton className="h-9" /><Skeleton className="h-9" /><Skeleton className="h-9" /></div>}
        {catalog.data === null && catalog.error !== null && (
          <div role="alert" className="text-meta">
            <p className="font-medium text-destructive">{catalog.unavailable ? 'As turmas ainda não estão disponíveis neste sistema.' : catalog.error}</p>
            <Button type="button" size="lg" variant="outline" className="mt-2" onClick={() => void catalog.reload()}>Tentar de novo</Button>
          </div>
        )}
        {catalog.data !== null && items.length === 0 && <p className="text-meta text-muted-foreground">Nenhuma turma aberta no ERP agora.</p>}
        {items.map((c, i) => (
          <label key={itemKey(c)} className={`flex cursor-pointer items-start gap-2 py-2 text-sm font-normal ${i > 0 ? 'border-t' : ''}`}>
            <input type="radio" name="course-unit" value={itemKey(c)} checked={chosen !== undefined && itemKey(chosen) === itemKey(c)} onChange={() => setPicked(itemKey(c))} required className="mt-1 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
            <span className="min-w-0">
              <span className="block truncate" title={courseName(c)}>{courseName(c)}</span>
              <span className="block text-meta text-muted-foreground">{detailLine(c)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {preselected && picked === null && conversation.queue && (
        <p className="mt-2 text-xs leading-normal text-muted-foreground">{unitFullLabel(preselected.unit)} pré-selecionado pela fila {queueLabel(conversation.queue)}. Você pode escolher outra turma.</p>
      )}
      <div className="mt-3 flex gap-2">
        <Button type="submit" size="lg" disabled={!chosen || action.busy}>{action.busy ? 'Abrindo…' : 'Abrir'}</Button>
        <Button type="button" size="lg" variant="outline" disabled={action.busy} onClick={onCancel}>Cancelar</Button>
      </div>
      <ActionError message={action.error} />
    </form>
  );
}

// For a person with no open opportunity: the attendant picks the course and unit from the ERP catalog and opens it by hand.
export function OpenOpportunity({ detail, onChanged }: { detail: ConversationDetail; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const formId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); };
  return (
    <div className="mt-3">
      <Button ref={trigger} size="lg" variant="outline" aria-expanded={open} aria-controls={formId} onClick={() => setOpen((o) => !o)}>Abrir oportunidade</Button>
      <p className="mt-2 text-xs leading-normal text-muted-foreground">Usa a mesma ferramenta da IA (open_opportunity), registrada no log como ação da atendente.</p>
      <div id={formId}>{open && <CourseForm detail={detail} onDone={onChanged} onCancel={close} />}</div>
    </div>
  );
}
