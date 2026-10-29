import type { Rules } from './core/types.ts';

export const DEFAULT_RULES: Rules = { attributionWindowDays: 30, aiConfidenceThreshold: 0.85 };

export const MONITOR = { lastLeads: 3, minBaselineLeads: 10, minBaselineCoverage: 0.9, baselineDays: 30 };

export const CONVERSATION_WINDOW_HOURS = 24;

// Demo-only defaults; production reads these from a secret manager.
export const SECRETS = {
  whatsappAppSecret: process.env.WHATSAPP_APP_SECRET ?? 'demo-whatsapp-secret',
  erpToken: process.env.ERP_TOKEN ?? 'demo-erp-token',
  piiHashKey: process.env.PII_HASH_KEY ?? 'demo-pii-hash-key',
};

export const PORT = Number(process.env.PORT ?? 3000);
export const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;
