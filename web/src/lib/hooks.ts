import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, isUnavailable } from './api.ts';

export interface Poll<T> {
  data: T | null;
  error: string | null;
  unavailable: boolean; // the route answers 404: the v2 core is not integrated yet
  loading: boolean;
  reload: () => Promise<void>;
}

const POLL_MS = 2000;
const initial = { data: null, error: null, unavailable: false, loading: true };

// Loads now, then every 2 s while the tab is visible. A new `key` starts over (skeleton, no stale data).
export function usePoll<T>(load: () => Promise<T>, key: string): Poll<T> {
  const [snap, setSnap] = useState<{ data: T | null; error: string | null; unavailable: boolean; loading: boolean }>(initial);
  const loadRef = useRef(load);
  loadRef.current = load;
  const tickRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const data = await loadRef.current();
        if (alive) setSnap({ data, error: null, unavailable: false, loading: false });
      } catch (e) {
        if (alive) setSnap((prev) => ({ data: prev.data, error: errorMessage(e), unavailable: isUnavailable(e), loading: false }));
      }
    };
    tickRef.current = tick;
    setSnap(initial);
    void tick();
    const timer = setInterval(() => { if (!document.hidden) void tick(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) void tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key]);

  const reload = useCallback(() => tickRef.current(), []);
  return { ...snap, reload };
}

// Runs a button action; exposes busy and the Portuguese error message to show next to the button.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, clearError: () => setError(null) };
}

// Tab routing by hash (#atendimento, #crm, ...), so each screen can be opened directly.
export function useHashTab<T extends string>(ids: readonly T[], fallback: T): [T, (id: T) => void] {
  const read = useCallback((): T => ids.find((id) => id === window.location.hash.slice(1)) ?? fallback, [ids, fallback]);
  const [tab, setTab] = useState<T>(read);
  useEffect(() => {
    const onHash = () => setTab(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [read]);
  return [tab, (id) => { window.location.hash = id; }];
}
