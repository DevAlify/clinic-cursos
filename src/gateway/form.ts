import { z } from 'zod';
import type { Db } from '../core/db.ts';
import { storePii, toIdentifier } from '../core/pii.ts';
import type { EventInput, Identifier } from '../core/types.ts';

export const formBodySchema = z.object({
  submissionId: z.string().min(8),
  entryPoint: z.string(),
  submittedAt: z.iso.datetime({ offset: true }),
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  utm: z.object({ source: z.string().optional(), medium: z.string().optional(), campaign: z.string().optional(), content: z.string().optional(), term: z.string().optional() }).default({}),
  clickIds: z.object({ gclid: z.string().optional(), fbclid: z.string().optional() }).default({}),
  test: z.boolean().default(false),
});
export type FormBody = z.infer<typeof formBodySchema>;

const isIdentifier = (i: Identifier | null): i is Identifier => i !== null;

export function parseForm(db: Db, b: FormBody): EventInput<'form_submitted'> | null {
  const identifiers = [b.phone ? toIdentifier(db, 'phone', b.phone) : null, b.email ? toIdentifier(db, 'email', b.email) : null].filter(isIdentifier);
  if (identifiers.length === 0) return null;
  return {
    source: 'form', externalId: b.submissionId, type: 'form_submitted', occurredAt: b.submittedAt, actor: 'system',
    payload: { entryPoint: b.entryPoint, identifiers, displayRef: b.name ? storePii(db, 'name', b.name) : null, utm: b.utm, clickIds: b.clickIds, test: b.test },
  };
}
