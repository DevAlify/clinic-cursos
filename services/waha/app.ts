import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { safeEqual } from '../../src/gateway/signature.ts';
import { wahaEnv } from '../shared/env.ts';

export interface WahaSimDeps {
  // Delivers the signed webhook to the core. Throws when the core does not accept it.
  deliverWebhook: (rawBody: string, headers: Record<string, string>) => Promise<void>;
  // Opens the core's QR redirect (/r/:code) without following it and returns the Location, or null if the code is unknown.
  scanQr?: (code: string) => Promise<string | null>;
}

// Seen from the lead's phone: 'out' = the lead sent it, 'in' = the clinic's reply arrived.
interface PhoneMessage { id: string; direction: 'in' | 'out'; session: string; text: string; at: string; failed?: true }

const MAX_PER_PHONE = 200; // ponytail: the simulator keeps the last 200 messages per phone in memory, nothing on disk
const text = z.string().min(1).max(4096);
const sendTextSchema = z.object({ session: z.string(), chatId: z.string().regex(/^\d{8,15}@c\.us$/, 'chatId deve ser número@c.us'), text });
const phoneSendSchema = z.object({ session: z.string(), text });
const digitsOf = (raw: string): string | null => (/^\d{8,15}$/.test(raw) ? raw : null);
// WhatsApp treats 55DDXXXXXXXX and 55DD9XXXXXXXX as one account, and the core stores the 9-digit form: the phone key does the same.
const phoneKey = (digits: string): string => (/^55\d{2}[6-9]\d{7}$/.test(digits) ? `${digits.slice(0, 4)}9${digits.slice(4)}` : digits);

// Fictitious people from the demo scenarios (same numbers), each with the clinic session they usually write to.
// The page lists them, and their name travels in the envelope like the WhatsApp profile name (_data.notifyName).
export const PERSONAS = [
  { name: 'Ana Lima', number: '551187650001', session: 'sp' },
  { name: 'Carla Mendes', number: '5521988880002', session: 'rj' },
  { name: 'Daniel Rocha', number: '5519977770003', session: 'cps' },
  { name: 'Bruna Souza', number: '5519966660004', session: 'cps' },
  { name: 'Eduardo Alves', number: '5511955550005', session: 'sp' },
  { name: 'Felipe Costa', number: '5519944440006', session: 'cps' },
  { name: 'Gabriela Nunes', number: '5519944440007', session: 'cps' },
  { name: 'Helena Prado', number: '5519944440008', session: 'cps' },
];
const personaName = (digits: string): string | undefined => PERSONAS.find((p) => phoneKey(p.number) === phoneKey(digits))?.name;

export function createWahaSimApp({ deliverWebhook, scanQr }: WahaSimDeps) {
  const { apiKey, hmacKey, sessions } = wahaEnv();
  const phones = new Map<string, PhoneMessage[]>();
  const page = readFileSync(join(import.meta.dirname, 'public', 'index.html'), 'utf8');

  const remember = (digits: string, m: Omit<PhoneMessage, 'at'>): PhoneMessage => {
    const msg: PhoneMessage = { ...m, at: new Date().toISOString() };
    phones.set(digits, [...(phones.get(digits) ?? []), msg].slice(-MAX_PER_PHONE));
    return msg;
  };

  const app = new Hono();
  app.use('/api/*', bodyLimit({ maxSize: 100 * 1024, onError: (c) => c.json({ error: 'corpo grande demais' }, 413) }));

  app.get('/', (c) => c.html(page));

  app.post('/api/reset', (c) => {
    if (!safeEqual(c.req.header('x-api-key') ?? '', apiKey)) return c.json({ error: 'X-Api-Key inválida' }, 401);
    phones.clear();
    console.log('waha: conversas da demo reiniciadas');
    return c.json({ ok: true });
  });

  app.get('/api/personas', (c) => c.json(PERSONAS));

  // Same shape as WAHA's GET /api/sessions (the part the core and the page use).
  app.get('/api/sessions', (c) => c.json(sessions.map((s) => ({ name: s.name, status: 'WORKING', me: { id: `${s.number}@c.us`, pushName: s.name } }))));

  // Same call the core makes to the real WAHA: POST /api/sendText with X-Api-Key.
  app.post('/api/sendText', async (c) => {
    if (!safeEqual(c.req.header('x-api-key') ?? '', apiKey)) return c.json({ error: 'X-Api-Key inválida' }, 401);
    const parsed = sendTextSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'corpo inválido', details: parsed.error.issues.map((i) => i.message) }, 400);
    const { session, chatId, text: body } = parsed.data;
    if (!sessions.some((s) => s.name === session)) return c.json({ error: `sessão desconhecida: ${session}` }, 404);
    const id = randomUUID();
    remember(phoneKey(chatId.slice(0, -'@c.us'.length)), { id, direction: 'in', session, text: body });
    console.log(`waha: mensagem ${id} enviada pela sessão ${session}`);
    return c.json({ id }, 201);
  });

  app.get('/api/phones/:number', (c) => {
    const digits = digitsOf(c.req.param('number'));
    if (!digits) return c.json({ error: 'número inválido' }, 400);
    return c.json(phones.get(phoneKey(digits)) ?? []);
  });

  // The lead types on the phone: build the WAHA "message" envelope, sign it with sha512 and hand it to the core.
  app.post('/api/phones/:number/send', async (c) => {
    const digits = digitsOf(c.req.param('number'));
    if (!digits) return c.json({ error: 'número inválido' }, 400);
    const parsed = phoneSendSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'corpo inválido', details: parsed.error.issues.map((i) => i.message) }, 400);
    const { session, text: body } = parsed.data;
    const business = sessions.find((s) => s.name === session);
    if (!business) return c.json({ error: `sessão desconhecida: ${session}` }, 404);

    const now = Date.now();
    const messageId = `false_${digits}@c.us_${randomBytes(10).toString('hex').toUpperCase()}`;
    const eventId = `evt_${randomUUID()}`;
    const notifyName = personaName(digits);
    const raw = JSON.stringify({
      id: eventId, timestamp: now, event: 'message', session,
      payload: { id: messageId, timestamp: Math.floor(now / 1000), from: `${digits}@c.us`, fromMe: false, to: `${business.number}@c.us`, body, hasMedia: false, ...(notifyName ? { _data: { notifyName } } : {}) },
    });
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (hmacKey) {
      headers['X-Webhook-Hmac'] = createHmac('sha512', hmacKey).update(raw, 'utf8').digest('hex');
      headers['X-Webhook-Hmac-Algorithm'] = 'sha512';
    }

    // Stored first: the core may answer inside the webhook call, and the reply must come after the question.
    const sent = remember(phoneKey(digits), { id: messageId, direction: 'out', session, text: body });
    try {
      await deliverWebhook(raw, headers);
    } catch (e) {
      sent.failed = true;
      console.error(`waha: webhook ${eventId} da sessão ${session} não foi aceito pelo core: ${e instanceof Error ? e.message : String(e)}`);
      return c.json({ error: 'o core não aceitou a mensagem; confira se ele está no ar' }, 502);
    }
    console.log(`waha: webhook ${eventId} entregue ao core (sessão ${session})`);
    return c.json({ id: messageId });
  });

  // Browser pages cannot read a cross-origin redirect, so the simulator opens the QR link for them.
  app.get('/api/qr/:code', async (c) => {
    const code = c.req.param('code');
    if (!/^[A-Za-z0-9]{2,16}$/.test(code)) return c.json({ error: 'código inválido' }, 400);
    if (!scanQr) return c.json({ error: 'leitura de QR não configurada' }, 501);
    let location: string | null;
    try {
      location = await scanQr(code);
    } catch (e) {
      console.error(`waha: leitura do QR ${code} falhou: ${e instanceof Error ? e.message : String(e)}`);
      return c.json({ error: 'não consegui falar com o core para ler o QR' }, 502);
    }
    if (!location) return c.json({ error: `código desconhecido: ${code}` }, 404);
    try {
      const url = new URL(location);
      const number = url.pathname.replace(/\D/g, '');
      return c.json({ code, number, session: sessions.find((s) => s.number === number)?.name ?? null, text: url.searchParams.get('text') ?? '' });
    } catch {
      return c.json({ error: 'o core devolveu um destino que não é um link do WhatsApp' }, 502);
    }
  });

  return app;
}
