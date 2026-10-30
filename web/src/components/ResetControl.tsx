import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ActionError } from '@/components/states';
import { useAction } from '@/lib/hooks.ts';

// "Recomeçar" with an inline confirmation. Renders the trigger and a full-width confirm line, so it fits in a wrapping button row.
export function ResetControl({ onReset, message = 'Limpar os dados dos três serviços?', className }: { onReset: () => Promise<void>; message?: string; className?: string }) {
  const [asking, setAsking] = useState(false);
  const action = useAction();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);

  const open = () => { setAsking(true); requestAnimationFrame(() => confirm.current?.focus()); };
  const close = () => { setAsking(false); action.clearError(); trigger.current?.focus(); };
  const run = async () => { if (await action.run(onReset)) close(); };

  return (
    <>
      <Button ref={trigger} size="lg" variant="outline" className={className} aria-expanded={asking} aria-controls={id} disabled={action.busy} onClick={open}>Recomeçar</Button>
      {(asking || action.error) && (
        <div id={id} className="w-full py-1.5 text-meta">
          {asking && (
            <>
              <p>{message}</p>
              <div className="mt-2 flex gap-2">
                <Button ref={confirm} size="lg" disabled={action.busy} onClick={() => void run()}>Confirmar</Button>
                <Button size="lg" variant="outline" disabled={action.busy} onClick={close}>Cancelar</Button>
              </div>
            </>
          )}
          <ActionError message={action.error} />
        </div>
      )}
    </>
  );
}
