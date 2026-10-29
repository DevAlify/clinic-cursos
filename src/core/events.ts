import { z } from 'zod';

export const LEVELS = ['observed', 'declared', 'inferred', 'unknown'] as const;
export const UNITS = ['sp', 'rj', 'cps', 'online'] as const;
export const ENTRY_POINT_STATUSES = ['auditing', 'released', 'blocked'] as const;
export const IDENTIFIER_KINDS = ['bsuid', 'phone', 'email', 'erp_student', 'erp_patient'] as const;

const unit = z.enum(UNITS);
const identifiers = z
  .array(z.object({ kind: z.enum(IDENTIFIER_KINDS), hash: z.string().min(16), piiRef: z.string().nullable() }))
  .min(1);

export const payloadSchemas = {
  entry_point_registered: z.object({
    code: z.string(), unit, kind: z.string(), label: z.string(), owner: z.string(),
    status: z.enum(ENTRY_POINT_STATUSES), product: z.string().nullable(), businessNumber: z.string().nullable(),
  }),
  entry_point_status_changed: z.object({ code: z.string(), status: z.enum(ENTRY_POINT_STATUSES), reason: z.string() }),
  link_generated: z.object({
    code: z.string(), entryPoint: z.string(), channel: z.string(), campaign: z.string(), unit,
    product: z.string(), destination: z.string(), linkType: z.enum(['url', 'whatsapp', 'qr', 'hotmart']),
  }),
  form_submitted: z.object({
    entryPoint: z.string(), identifiers, displayRef: z.string().nullable(),
    utm: z.object({
      source: z.string().optional(), medium: z.string().optional(), campaign: z.string().optional(),
      content: z.string().optional(), term: z.string().optional(),
    }),
    clickIds: z.object({ gclid: z.string().optional(), fbclid: z.string().optional() }),
    test: z.boolean(),
  }),
  whatsapp_message_received: z.object({
    businessNumber: z.string(), identifiers, displayRef: z.string().nullable(), code: z.string().nullable(),
    referral: z.object({ sourceId: z.string(), sourceType: z.string(), ctwaClid: z.string().nullable() }).nullable(),
  }),
  qr_scanned: z.object({ code: z.string() }),
  erp_person_imported: z.object({
    batch: z.string(), role: z.enum(['patient', 'student']), unit, identifiers, displayRef: z.string().nullable(),
  }),
  erp_sale_confirmed: z.object({
    saleId: z.string(), opportunityId: z.string().nullable(), identifiers, displayRef: z.string().nullable(),
    product: z.string(), unit,
  }),
  conversation_routed: z.object({
    messageSeq: z.number().int(), personId: z.string(), queue: z.string(), reason: z.string(), summary: z.string(),
    intent: z.string(), confidence: z.number().min(0).max(1), model: z.string(),
  }),
  origin_declared: z.object({
    personId: z.string(), touchSeq: z.number().int(), value: z.string().min(1), quote: z.string(),
    confidence: z.number().min(0).max(1).nullable(),
  }),
  interest_declared: z.object({
    personId: z.string(), product: z.string(), unit, confidence: z.number().min(0).max(1).nullable(),
  }),
  merge_proposed: z.object({ personIds: z.tuple([z.string(), z.string()]), reason: z.string() }),
  alert_raised: z.object({
    entryPoint: z.string(), kind: z.enum(['campaign_coverage_drop', 'naming_nonconforming']),
    message: z.string(), action: z.string(), owner: z.string(),
  }),
};

export type EventType = keyof typeof payloadSchemas;
export type Payload<T extends EventType> = z.infer<(typeof payloadSchemas)[T]>;
