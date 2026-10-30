import { z } from 'zod';
import type { Db } from '../core/db.ts';
import { storePii, toIdentifier } from '../core/pii.ts';
import type { EventInput, Identifier } from '../core/types.ts';

// Every text is bounded at the door: nothing unbounded reaches the normalizers, the vault or the log.
const text = (max = 200) => z.string().max(max).optional();

export const formBodySchema = z.object({
  submissionId: z.string().min(8).max(200),
  entryPoint: z.string().max(200),
  submittedAt: z.iso.datetime({ offset: true }).max(64),
  name: text(),
  phone: text(40),
  email: text(254),
  utm: z.object({ source: text(), medium: text(), campaign: text(), content: text(), term: text() }).default({}),
  clickIds: z.object({ gclid: text(), fbclid: text() }).default({}),
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
