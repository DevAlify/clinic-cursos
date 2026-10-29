import { META_PHONE_NUMBER_ID, SECRETS, WAHA_SESSIONS, WAHA_URL, WHATSAPP_PROVIDER } from '../../config.ts';
import type { Fetch } from '../../core/types.ts';
import { createMetaProvider } from './meta.ts';
import type { WhatsAppProvider } from './types.ts';
import { createWahaProvider } from './waha.ts';

// The provider is chosen by WHATSAPP_PROVIDER; fetch is injectable so tests never touch the network.
export function getProvider(name: string = WHATSAPP_PROVIDER, fetchImpl: Fetch = fetch): WhatsAppProvider {
  if (name === 'meta') {
    return createMetaProvider({ appSecret: SECRETS.whatsappAppSecret, accessToken: SECRETS.metaAccessToken, phoneNumberId: META_PHONE_NUMBER_ID, fetch: fetchImpl });
  }
  if (name === 'waha') {
    return createWahaProvider({ url: WAHA_URL, apiKey: SECRETS.wahaApiKey, hmacKey: SECRETS.wahaWebhookHmacKey, sessions: WAHA_SESSIONS, fetch: fetchImpl });
  }
  throw new Error(`provedor de WhatsApp desconhecido: ${name}`);
}
