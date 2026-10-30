import { useEffect, useRef, useState } from 'react';
import { ModeBadge, initials } from '@/components/atendimento/ConversationList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ActionError } from '@/components/states';
import { replyToConversation, setConversationMode, type BasedOn, type ConversationDetail, type ThreadMessage } from '@/lib/api.ts';
import { actorLabel, formatClock, queueLabel } from '@/lib/format.ts';
import { useAction } from '@/lib/hooks.ts';
import { cn } from '@/lib/utils';

const basedOnText = (b: BasedOn) => `${b.tool === 'get_course_offer' ? 'consultado no ERP' : `consultado em ${b.tool}`} às ${formatClock(b.readAt)}`;

function Bubble({ m, contact }: { m: ThreadMessage; contact: string }) {
  const out = m.direction === 'out';
  const ai = m.actor.startsWith('ai:');
  const who = !out ? contact : actorLabel(m.actor);
  return (
    <li className={cn('flex flex-col gap-1', out ? 'items-end' : 'items-start')}>
      <div className="text-meta text-muted-foreground">
        <strong className="font-semibold text-foreground">{who}</strong> · <time dateTime={m.at}>{formatClock(m.at)}</time>
      </div>
      <p className={cn('max-w-[34rem] rounded-lg border px-3.5 py-2.5 text-sm break-words whitespace-pre-wrap', !out && 'rounded-tl-xs bg-card', ai && 'rounded-tr-xs bg-muted', out && !ai && 'rounded-tr-xs border-primary bg-primary text-primary-foreground')}>
        {m.text ?? 'Mensagem sem texto.'}
      </p>
      {m.basedOn.map((b) => <span key={`${b.tool}-${b.readAt}`} className="text-meta text-muted-foreground">{basedOnText(b)}</span>)}
    </li>
  );
}

export function Thread({ detail, onChanged }: { detail: ConversationDetail; onChanged: () => Promise<void> }) {
  const [text, setText] = useState('');
  const mode = useAction();
  const send = useAction();
  const endRef = useRef<HTMLDivElement>(null);
  const { conversation, person } = detail;
  const human = conversation.mode === 'human';
  const contact = person.name ?? 'Cliente';

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [detail.messages.length]);

  const changeMode = (next: 'ai' | 'human') =>
    mode.run(async () => {
      await setConversationMode(conversation.personId, conversation.businessNumber, next, next === 'human' ? 'Atendente assumiu a conversa' : 'Atendente devolveu a conversa à IA');
      await onChanged();
    });
  const reply = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    const ok = await send.run(async () => { await replyToConversation(conversation.personId, conversation.businessNumber, value); await onChanged(); });
    if (ok) setText('');
  };

  return (
    <div className="flex min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b bg-card px-5 py-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-md border bg-muted text-sm font-semibold text-muted-foreground">{initials(person.name)}</span>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight" title={person.name ?? undefined}>{contact}</h2>
          <div className="flex flex-wrap items-center gap-2 text-meta text-muted-foreground">
            <span>{conversation.queue ? queueLabel(conversation.queue) : 'Sem fila'}</span><ModeBadge mode={conversation.mode} />
          </div>
        </div>
        <div className="ml-auto flex shrink-0 flex-col items-end">
          {human
            ? <Button size="lg" variant="outline" disabled={mode.busy} onClick={() => void changeMode('ai')}>Devolver à IA</Button>
            : <Button size="lg" disabled={mode.busy} onClick={() => void changeMode('human')}>Assumir</Button>}
        </div>
      </header>
      <ActionError message={mode.error} />
      <div role="log" tabIndex={0} aria-label="Mensagens da conversa" className="min-h-0 flex-1 overflow-y-auto bg-background px-6 py-5">
        {detail.messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma mensagem nesta conversa.</p>
        ) : (
          <ol className="space-y-4">{detail.messages.map((m) => <Bubble key={m.seq} m={m} contact={contact} />)}</ol>
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => void reply(e)} className="shrink-0 border-t bg-card px-5 py-3">
        <div className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} disabled={!human || send.busy} aria-label="Mensagem para o cliente" name="message" autoComplete="off" placeholder={human ? 'Escreva a resposta' : 'Assuma a conversa para responder'} className="h-9" />
          <Button type="submit" size="lg" disabled={!human || send.busy || text.trim() === ''}>Responder</Button>
        </div>
        {!human && <p className="mt-1.5 text-meta text-muted-foreground">A IA está respondendo. Clique em Assumir para falar com o cliente.</p>}
        <ActionError message={send.error} />
      </form>
    </div>
  );
}
