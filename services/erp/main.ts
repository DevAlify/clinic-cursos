import { mkdirSync, rmSync } from 'node:fs';
import { serve } from '@hono/node-server';
import Database from 'better-sqlite3';
import { erpEnv } from '../shared/env.ts';
import { createErpApp, type SaleConfirmed } from './app.ts';

const DB_PATH = 'data/erp.db';
const { port, token, coreUrl } = erpEnv();

// Every start begins from the seeded catalog, like the core: orders and seats are demo data.
mkdirSync('data', { recursive: true });
for (const suffix of ['', '-wal', '-shm']) rmSync(`${DB_PATH}${suffix}`, { force: true });

// Throws on any answer that is not 2xx, so the order stays "not notified" and the payment can be confirmed again.
async function notifyCore(sale: SaleConfirmed): Promise<void> {
  const res = await fetch(`${coreUrl}/webhooks/erp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-erp-token': token },
    body: JSON.stringify(sale),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`o core respondeu ${res.status} em ${coreUrl}/webhooks/erp`);
}

const app = createErpApp({ notifyCore, db: new Database(DB_PATH) });
// Localhost by default: the demo has no auth on /api/reset and friends. Containers set HOST=0.0.0.0 (compose publishes on 127.0.0.1).
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '127.0.0.1' }, (info) => console.log(`ERP simulado em http://localhost:${info.port}`));
