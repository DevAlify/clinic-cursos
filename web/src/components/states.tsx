import { Button } from '@/components/ui/button';
import type { Poll } from '@/lib/hooks.ts';

export function EmptyState({ title, detail, className = '' }: { title: string; detail?: string; className?: string }) {
  return (
    <div className={`px-5 py-12 text-center text-muted-foreground ${className}`}>
      <h3 className="mb-1.5 text-lg font-semibold text-foreground">{title}</h3>
      {detail && <p className="text-sm">{detail}</p>}
    </div>
  );
}

// The route answers 404: the v2 core is not integrated yet. Calm, never a crash.
export function Unavailable({ what }: { what: string }) {
  return <EmptyState title="Disponível quando o núcleo v2 estiver integrado" detail={`${what} aparece aqui assim que o sistema central responder.`} />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-5 py-12 text-center">
      <p className="text-sm font-medium text-destructive">{message}</p>
      <Button variant="outline" onClick={onRetry}>Tentar de novo</Button>
    </div>
  );
}

// Decides what to show for a polled resource: skeleton, unavailable, error or the content.
export function Resource<T>({ poll, what, skeleton, children }: {
  poll: Poll<T>; what: string; skeleton: React.ReactNode; children: (data: T) => React.ReactNode;
}) {
  if (poll.data !== null) return <>{children(poll.data)}</>;
  if (poll.unavailable) return <Unavailable what={what} />;
  if (poll.error !== null) return <ErrorState message={poll.error} onRetry={() => void poll.reload()} />;
  return <>{skeleton}</>;
}

// Inline message under a button, in the attention color, with text (never color alone).
export function ActionError({ message }: { message: string | null }) {
  return message ? <p role="alert" className="mt-2 text-meta font-medium text-destructive">{message}</p> : null;
}
