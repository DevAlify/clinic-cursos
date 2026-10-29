import type { Rules } from './core/types.ts';

export const DEFAULT_RULES: Rules = { attributionWindowDays: 30, aiConfidenceThreshold: 0.85 };

export const MONITOR = { lastLeads: 3, minBaselineLeads: 10, minBaselineCoverage: 0.9, baselineDays: 30 };

export const CONVERSATION_WINDOW_HOURS = 24;

// Demo-only defaults (see .env.example); production reads these from a secret manager.
export const SECRETS = {
  whatsappAppSecret: process.env.META_APP_SECRET ?? 'demo-meta-secret',
  metaAccessToken: process.env.META_ACCESS_TOKEN ?? '',
  erpToken: process.env.ERP_TOKEN ?? 'demo-erp-token',
  wahaApiKey: process.env.WAHA_API_KEY ?? 'demo-waha-key',
  wahaWebhookHmacKey: process.env.WAHA_WEBHOOK_HMAC_KEY ?? 'demo-waha-hmac',
  piiHashKey: process.env.PII_HASH_KEY ?? 'demo-pii-hash-key',
};

export const WHATSAPP_PROVIDER = process.env.WHATSAPP_PROVIDER ?? 'waha';
export const WAHA_SESSIONS = process.env.WAHA_SESSIONS ?? 'sp:551130000001,rj:552130000002,cps:551930000003';
export const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID ?? '';

export const PORT = Number(process.env.CORE_PORT ?? process.env.PORT ?? 3000);
export const BASE_URL = process.env.CORE_URL ?? `http://localhost:${PORT}`;
export const ERP_PORT = Number(process.env.ERP_PORT ?? 3100);
export const WAHA_PORT = Number(process.env.WAHA_PORT ?? 3200);
// Empty by default on purpose: without them the core runs offline (local ERP catalog, replies recorded
// but not delivered), which is how tests, verify and replay run. `npm run demo` and compose set them.
export const ERP_URL = process.env.ERP_URL ?? '';
export const WAHA_URL = process.env.WAHA_URL ?? '';
