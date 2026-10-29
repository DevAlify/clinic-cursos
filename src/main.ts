import { mkdirSync, rmSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { PORT } from './config.ts';
import { openDb } from './core/db.ts';
import { createApp } from './server.ts';

const DB_PATH = 'data/demo.db';

// Every start and every reset begins from the fictitious seed.
function openFresh() {
  mkdirSync('data', { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${DB_PATH}${suffix}`, { force: true });
  return openDb(DB_PATH);
}

const { app } = createApp({ openFresh });
app.use('/*', serveStatic({ root: './web/dist' }));
serve({ fetch: app.fetch, port: PORT }, (info) => console.log(`Simulador em http://localhost:${info.port}`));
