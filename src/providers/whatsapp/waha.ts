import { z } from 'zod';
import { extractCode } from '../../core/codes.ts';
import { fetchJson } from '../../core/http.ts';
import { hashIdentifier, storePii, toIdentifier } from '../../core/pii.ts';
import type { Fetch } from '../../core/types.ts';
import { safeEqual, signWaha } from '../../gateway/signature.ts';
import type { WhatsAppProvider } from './types.ts';

const wahaSchema = z.object({
  event: z.string(),
  session: z.string(),
  payload: z.object({
    id: z.string(), timestamp: z.number(), from: z.string(), fromMe: z.boolean().optional(), to: z.string().optional(),
    body: z.string().nullable().optional(),
    // Engine-specific extras; WEBJS sends notifyName and NOWEB pushName.
    _data: z.object({ notifyName: z.string().optional(), pushName: z.string().optional() }).optional(),
  }),
});
const sentSchema = z.object({ id: z.union([z.string(), z.object({ _serialized: z.string() })]) });

// "sp:551130000001,rj:552130000002" -> session -> business number.
export const parseSessions = (spec: string): Map<string, string> =>
  new Map(spec.split(',').map((pair) => pair.trim().split(':')).filter((p) => p.length === 2 && p[0] && p[1]).map(([s, n]) => [s, n]));

// Only one-to-one chats: groups (@g.us), channels and status updates are not leads.
const chatDigits = (chatId: string | undefined): string | null => /^(\d+)@c\.us$/.exec(chatId ?? '')?.[1] ?? null;

export interface WahaOptions { url: string; apiKey: string; hmacKey: string; sessions: string; fetch: Fetch }

// WAHA: self-hosted WhatsApp Web automation (unofficial: risk of a banned number and no ad data).
// One session per business number.
export function createWahaProvider(o: WahaOptions): WhatsAppProvider {
  const sessions = parseSessions(o.sessions);
  return {
    name: 'waha',
    // The HMAC is optional in WAHA: with an empty key every body is accepted, so production must set one.
    verify: (rawBody, headers) => !o.hmacKey || safeEqual(headers['x-webhook-hmac'] ?? '', signWaha(rawBody, o.hmacKey)),
    parse(db, body) {
      const parsed = wahaSchema.safeParse(body);
      if (!parsed.success) return [];
      const { event, session, payload: m } = parsed.data;
      if (event !== 'message' || m.fromMe === true) return [];
      const from = chatDigits(m.from);
      const businessNumber = chatDigits(m.to) ?? sessions.get(session) ?? null;
      // WAHA sends epoch seconds; some engines and simulators send milliseconds.
      const sentAt = new Date(m.timestamp < 1e12 ? m.timestamp * 1000 : m.timestamp);
      if (!from || !businessNumber || Number.isNaN(sentAt.getTime())) return [];
      const phone = toIdentifier(db, 'phone', from, true);
      if (!phone) return [];
      const text = m.body ?? '';
      const name = m._data?.notifyName ?? m._data?.pushName;
      return [{
        text,
        input: {
          // WAHA ids embed the sender's number ("false_5511...@c.us_..."): the log keeps a keyed hash.
          source: 'whatsapp', externalId: hashIdentifier('wa_message', m.id), type: 'whatsapp_message_received',
          occurredAt: sentAt.toISOString(), actor: 'system',
          payload: {
            businessNumber, identifiers: [phone], displayRef: name ? storePii(db, 'name', name) : null,
            code: extractCode(text), referral: null, textRef: text ? storePii(db, 'message', text) : null, provider: 'waha',
          },
        },
      }];
    },
    async sendText(to, text, businessNumber) {
      const session = [...sessions].find(([, n]) => n === businessNumber)?.[0];
      if (!session) throw new Error(`nenhuma sessão do WAHA para o número ${businessNumber}`);
      // Without WAHA_URL the core runs offline: the reply is recorded, not delivered.
      if (!o.url) return { externalId: null };
      const body = await fetchJson(o.fetch, `${o.url}/api/sendText`, {
        method: 'POST',
        headers: { 'x-api-key': o.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ session, chatId: `${to}@c.us`, text }),
      }, 'WAHA', `ao enviar pela sessão ${session}`);
      const sent = sentSchema.safeParse(body);
      return { externalId: !sent.success ? null : typeof sent.data.id === 'string' ? sent.data.id : sent.data.id._serialized };
    },
  };
}
