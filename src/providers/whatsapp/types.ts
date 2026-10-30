import type { Db } from '../../core/db.ts';
import type { EventInput, ProviderName } from '../../core/types.ts';

export type WebhookHeaders = Record<string, string | undefined>;

// The text stays in memory for the AI; the event keeps only the vault reference.
export interface ParsedMessage { input: EventInput<'whatsapp_message_received'>; text: string }

export interface WhatsAppProvider {
  name: ProviderName;
  verify(rawBody: string, headers: WebhookHeaders): boolean;
  parse(db: Db, body: unknown, headers: WebhookHeaders): ParsedMessage[];
  // Returns the provider's own message id; callers hash it before it reaches the log.
  sendText(to: string, text: string, businessNumber: string): Promise<{ externalId: string | null }>;
}
