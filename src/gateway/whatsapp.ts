import { z } from 'zod';
import { extractCode } from '../core/codes.ts';
import type { Db } from '../core/db.ts';
import { storePii, toIdentifier } from '../core/pii.ts';
import type { EventInput, Identifier } from '../core/types.ts';

const metaSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(z.object({
    changes: z.array(z.object({
      field: z.string(),
      value: z.object({
        metadata: z.object({ display_phone_number: z.string() }),
        contacts: z.array(z.object({ profile: z.object({ name: z.string() }).optional(), wa_id: z.string().optional(), user_id: z.string().optional() })).optional(),
        messages: z.array(z.object({
          from: z.string().optional(), from_user_id: z.string().optional(), id: z.string(), timestamp: z.string(), type: z.string(),
          text: z.object({ body: z.string() }).optional(),
          referral: z.object({ source_id: z.string(), source_type: z.string(), ctwa_clid: z.string().optional() }).optional(),
        })).optional(),
      }),
    })),
  })),
});

export interface ParsedMessage { input: EventInput<'whatsapp_message_received'>; text: string }

const isIdentifier = (i: Identifier | null): i is Identifier => i !== null;

// The text stays in memory for the AI; the log keeps only the code and the identifiers.
export function parseWhatsAppWebhook(db: Db, body: unknown): ParsedMessage[] {
  const parsed = metaSchema.safeParse(body);
  if (!parsed.success) return [];
  const out: ParsedMessage[] = [];
  for (const change of parsed.data.entry.flatMap((e) => e.changes)) {
    if (change.field !== 'messages') continue;
    const v = change.value;
    for (const m of v.messages ?? []) {
      if (m.type !== 'text' || !m.text) continue;
      // Meta sends epoch seconds as a string; anything else is not a date we can trust.
      const sentAt = new Date(Number(m.timestamp) * 1000);
      if (Number.isNaN(sentAt.getTime())) continue;
      const contact = v.contacts?.find((c) => (m.from_user_id && c.user_id === m.from_user_id) || (m.from && c.wa_id === m.from));
      const identifiers = [
        m.from_user_id ? toIdentifier(db, 'bsuid', m.from_user_id) : null,
        m.from ? toIdentifier(db, 'phone', m.from, true) : null,
      ].filter(isIdentifier);
      if (identifiers.length === 0) continue;
      out.push({
        text: m.text.body,
        input: {
          source: 'whatsapp', externalId: m.id, type: 'whatsapp_message_received',
          occurredAt: sentAt.toISOString(), actor: 'system',
          payload: {
            businessNumber: v.metadata.display_phone_number, identifiers,
            displayRef: contact?.profile?.name ? storePii(db, 'name', contact.profile.name) : null,
            code: extractCode(m.text.body),
            referral: m.referral ? { sourceId: m.referral.source_id, sourceType: m.referral.source_type, ctwaClid: m.referral.ctwa_clid ?? null } : null,
          },
        },
      });
    }
  }
  return out;
}
