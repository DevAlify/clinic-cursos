import { z } from 'zod';
import type { Db } from '../core/db.ts';
import { UNITS } from '../core/events.ts';
import { storePii, toIdentifier } from '../core/pii.ts';
import type { AnyEventInput, Identifier } from '../core/types.ts';

// Every text is bounded at the door: nothing unbounded reaches the normalizers, the vault or the log.
const id = z.string().max(200);
const contact = { name: z.string().max(200).optional(), phone: z.string().max(40).optional(), email: z.string().max(254).optional() };
const isoTime = z.iso.datetime({ offset: true }).max(64);

export const erpBodySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sale_confirmed'), saleId: id, confirmedAt: isoTime, opportunityId: id.nullable(), product: id, unit: z.enum(UNITS), ...contact }),
  z.object({ type: z.literal('person_imported'), batch: id, erpId: id, role: z.enum(['patient', 'student']), unit: z.enum(UNITS), importedAt: isoTime, ...contact }),
]);
export type ErpBody = z.infer<typeof erpBodySchema>;

const isIdentifier = (i: Identifier | null): i is Identifier => i !== null;

export function parseErp(db: Db, b: ErpBody): AnyEventInput | null {
  const base = [b.phone ? toIdentifier(db, 'phone', b.phone) : null, b.email ? toIdentifier(db, 'email', b.email) : null];
  const displayRef = b.name ? storePii(db, 'name', b.name) : null;
  if (b.type === 'sale_confirmed') {
    const identifiers = base.filter(isIdentifier);
    if (identifiers.length === 0) return null;
    return {
      source: 'erp', externalId: `sale:${b.saleId}`, type: 'erp_sale_confirmed', occurredAt: b.confirmedAt, actor: 'system',
      payload: { saleId: b.saleId, opportunityId: b.opportunityId, identifiers, displayRef, product: b.product, unit: b.unit },
    };
  }
  const identifiers = [...base, toIdentifier(db, b.role === 'patient' ? 'erp_patient' : 'erp_student', b.erpId)].filter(isIdentifier);
  return {
    source: 'erp', externalId: `import:${b.batch}:${b.erpId}`, type: 'erp_person_imported', occurredAt: b.importedAt, actor: 'system',
    payload: { batch: b.batch, role: b.role, unit: b.unit, identifiers, displayRef },
  };
}
