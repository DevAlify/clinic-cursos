import { useState } from 'react';
import { ConversationList } from '@/components/atendimento/ConversationList';
import { ConversationPane } from '@/components/atendimento/ConversationPane';
import { EmptyState, Resource } from '@/components/states';
import { getConversations, type ConversationItem } from '@/lib/api.ts';
import { usePoll } from '@/lib/hooks.ts';

interface Selection { personId: string; businessNumber: string }

export function AtendimentoView() {
  const list = usePoll(getConversations, 'conversations');
  const [picked, setPicked] = useState<Selection | null>(null);
  const items: ConversationItem[] = [...(list.data ?? [])].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  const first = items[0];
  // A conversation that no longer exists (after a reset) falls back to the first one.
  const stillThere = picked !== null && items.some((c) => c.personId === picked.personId && c.businessNumber === picked.businessNumber);
  const current = stillThere ? picked : first ? { personId: first.personId, businessNumber: first.businessNumber } : null;

  // Route missing (core v2 not integrated) or core down: one calm message for the whole screen.
  if (!list.data && (list.unavailable || list.error !== null)) {
    return <div className="pt-24"><Resource poll={list} what="O atendimento" skeleton={null}>{() => null}</Resource></div>;
  }

  return (
    <div className="grid h-full grid-cols-[22.5rem_minmax(0,1fr)]">
      <aside aria-label="Conversas" className="flex min-h-0 flex-col border-r bg-card">
        <div className="shrink-0 border-b px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight">Conversas</h1>
          <p className="text-meta text-muted-foreground">WhatsApp · {items.length} em andamento</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ConversationList poll={list} items={items} selected={current} onSelect={setPicked} />
        </div>
      </aside>
      <section aria-label="Conversa selecionada" className="min-h-0 min-w-0">
        {current ? (
          <ConversationPane key={`${current.personId}/${current.businessNumber}`} personId={current.personId} businessNumber={current.businessNumber} onChanged={list.reload} />
        ) : list.data ? (
          <EmptyState className="pt-24" title="Nenhuma conversa ainda." detail="Quando alguém escrever no WhatsApp, a conversa aparece aqui." />
        ) : null}
      </section>
    </div>
  );
}
