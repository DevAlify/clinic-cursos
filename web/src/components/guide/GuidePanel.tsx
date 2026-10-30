import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { LevelBadge } from '@/components/origin';
import { ResetControl } from '@/components/ResetControl';
import { ActionError, Resource } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { reset, runUntil, type Guide, type GuideStep } from '@/lib/api.ts';
import { useAction, type Poll } from '@/lib/hooks.ts';
import { ERP_URL, WAHA_URL } from '@/lib/services.ts';
import { cn } from '@/lib/utils';

const COURSE_MESSAGE = 'Quero saber da turma de Harmonização Facial em São Paulo';
const STATE_LABEL = { done: 'feito', current: 'agora', todo: 'a fazer' } as const;
const LINK = 'inline-block rounded-sm text-sm underline underline-offset-4 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none';
const P = 'my-1.5 text-meta';

function CopyMessage() {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const box = useRef<HTMLDivElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(COURSE_MESSAGE);
      setState('copied');
    } catch {
      const selection = window.getSelection();
      if (box.current && selection) { const range = document.createRange(); range.selectNodeContents(box.current); selection.removeAllRanges(); selection.addRange(range); }
      setState('manual');
    }
  };
  return (
    <>
      <div ref={box} className="my-2 rounded-md border bg-background p-2 text-meta">{COURSE_MESSAGE}</div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => void copy()}>{state === 'copied' ? 'Mensagem copiada' : state === 'manual' ? 'Selecione e copie' : 'Copiar mensagem'}</Button>
        <a className={LINK} href={WAHA_URL} target="_blank" rel="noreferrer">Abrir celular ↗<span className="sr-only"> (abre em outra aba)</span></a>
      </div>
    </>
  );
}

function RunUntil({ reload }: { reload: () => Promise<void> }) {
  const action = useAction();
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" disabled={action.busy} onClick={() => void action.run(async () => { await runUntil('ana-meta-form'); await reload(); })}>
          {action.busy ? 'Rodando…' : 'Rodar até aqui'}
        </Button>
        <a className={LINK} href="#bastidores">Abrir Bastidores</a>
      </div>
      <ActionError message={action.error} />
    </>
  );
}

// What to do in each step; the text of the attendance step depends on whether Ana already has an opportunity.
function stepBody(step: GuideStep, reload: () => Promise<void>) {
  switch (step.id) {
    case 'origin':
      return { title: 'Bastidores', body: (<><p className={P}>Cria a lead Ana com origem Meta (anúncio e formulário da LP de SP)</p><RunUntil reload={reload} /></>) };
    case 'message':
      return { title: 'Celular', body: (<><p className={P}>Como <strong>Ana Lima</strong>, no número <strong>Clinic São Paulo</strong>, envie:</p><CopyMessage /></>) };
    case 'attendance':
      return {
        title: 'Atendimento',
        body: (
          <>
            <p className={P}>Assumir e responder.</p>
            {!step.hasOpportunity && <p className={P}>Sem oportunidade? Use Abrir oportunidade no painel da pessoa.</p>}
            <p className={P}>Com a oportunidade aberta, use Avançar etapa e registre a pré-matrícula.</p>
            <a className={LINK} href="#atendimento">Ir para Atendimento</a>
          </>
        ),
      };
    case 'erp':
      return { title: 'ERP', body: (<><p className={P}>Na pré-matrícula de Ana, clique em <strong>Confirmar pagamento</strong>.</p><a className={LINK} href={ERP_URL} target="_blank" rel="noreferrer">Abrir ERP ↗<span className="sr-only"> (abre em outra aba)</span></a></>) };
    case 'crm':
      return { title: 'CRM', body: (<><p className={P}>A oportunidade aparece em <strong>Ganha</strong>, com origem Meta <LevelBadge level="observed" /></p><a className={LINK} href="#crm">Ir para CRM</a></>) };
  }
}

function StepItem({ step, index, reload }: { step: GuideStep; index: number; reload: () => Promise<void> }) {
  const { title, body } = stepBody(step, reload);
  const done = step.status === 'done';
  return (
    <li aria-current={step.status === 'current' ? 'step' : undefined} className={cn('grid grid-cols-[1.5rem_1fr] gap-2.5 border-b py-3 first:pt-0', step.status === 'current' && '-mx-2 bg-background px-2')}>
      <span aria-hidden="true" className={cn('grid size-[1.4375rem] place-items-center rounded-full border text-xs', step.status !== 'todo' ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>
        {done ? <Check className="size-3.5" /> : index + 1}
      </span>
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <strong className="text-sm">{title}</strong>
          <span className="text-xs text-muted-foreground">{STATE_LABEL[step.status]}</span>
        </div>
        {body}
      </div>
    </li>
  );
}

function GuideSkeleton() {
  return (
    <div className="mt-6 space-y-5" aria-busy="true" aria-label="Carregando o guia">
      {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-20" />)}
    </div>
  );
}

function GuideBody({ guide, reload }: { guide: Guide; reload: () => Promise<void> }) {
  return (
    <>
      <div className="mt-2 flex items-center justify-between gap-2 text-sm">
        <span>Da entrada à venda</span>
        <strong aria-live="polite">{guide.done} de {guide.total} feitos</strong>
      </div>
      <progress className="mt-3 mb-1.5 block h-1.5 w-full" max={guide.total} value={guide.done} aria-label="Etapas concluídas" />
      <p className="text-xs text-muted-foreground">Avança sozinho conforme o estado do sistema.</p>
      <ol aria-label="Caminho da demo" className="my-4">
        {guide.steps.map((s, i) => <StepItem key={s.id} step={s} index={i} reload={reload} />)}
      </ol>
      <h3 className="text-sm font-semibold">Outros testes</h3>
      <ul className="mt-3 list-disc space-y-2 pl-[1.125rem] text-meta">
        <li>Dúvida clínica: “estou com inchaço” vai para a equipe clínica.</li>
        <li>
          <p>Recomeçar limpa os três serviços: sistema central, ERP e celular.</p>
          <div className="mt-1.5 flex flex-wrap">
            <ResetControl message="Limpar os dados dos três serviços e reiniciar a demo?" onReset={async () => { await reset(); await reload(); }} />
          </div>
        </li>
      </ul>
    </>
  );
}

export function GuidePanel({ guide, onClose }: { guide: Poll<Guide>; onClose: () => void }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); }, []);
  return (
    <aside id="demo-guide" aria-labelledby="guide-title" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} className="w-[24.375rem] shrink-0 overflow-y-auto border-l bg-card px-5 py-[1.125rem]">
      <div className="flex items-center justify-between">
        <h2 id="guide-title" ref={title} tabIndex={-1} className="text-lg font-semibold outline-none">Guia da demo</h2>
        <Button size="lg" variant="outline" onClick={onClose}>Fechar</Button>
      </div>
      <Resource poll={guide} what="O guia" skeleton={<GuideSkeleton />}>
        {(g) => <GuideBody guide={g} reload={guide.reload} />}
      </Resource>
    </aside>
  );
}
