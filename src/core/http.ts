import type { Fetch } from './types.ts';

export const TIMEOUT_MS = 5000;

// One attempt with a timeout and no automatic retry: sending a message or creating an order is not
// idempotent on the other side, so a failure goes back to the caller with context instead.
export async function fetchJson(fetchImpl: Fetch, url: string, init: RequestInit, system: string, action: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new Error(`${system} não respondeu ${action}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  if (!res.ok) throw new Error(`${system} respondeu ${res.status} ${action}`);
  try {
    return await res.json();
  } catch (err) {
    throw new Error(`${system} devolveu uma resposta que não é JSON ${action}`, { cause: err });
  }
}
