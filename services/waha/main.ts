import { serve } from '@hono/node-server';
import { wahaEnv } from '../shared/env.ts';
import { createWahaSimApp } from './app.ts';

const { port, coreUrl } = wahaEnv();

// Throws on any answer that is not 2xx: the core refused the signature or the body, or is down.
async function deliverWebhook(rawBody: string, headers: Record<string, string>): Promise<void> {
  const res = await fetch(`${coreUrl}/webhooks/whatsapp/waha`, { method: 'POST', headers, body: rawBody, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`o core respondeu ${res.status} em ${coreUrl}/webhooks/whatsapp/waha`);
}

// The QR link answers with a redirect to wa.me; the simulator only needs the Location, so it does not follow it.
async function scanQr(code: string): Promise<string | null> {
  const res = await fetch(`${coreUrl}/r/${code}`, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
  if (res.status === 404) return null;
  const location = res.headers.get('location');
  if (!location) throw new Error(`o core respondeu ${res.status} sem destino em ${coreUrl}/r/${code}`);
  return location;
}

const app = createWahaSimApp({ deliverWebhook, scanQr });
// Localhost by default: the demo has no auth on /api/reset and friends. Containers set HOST=0.0.0.0 (compose publishes on 127.0.0.1).
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '127.0.0.1' }, (info) => console.log(`Simulador do WAHA em http://localhost:${info.port}`));
