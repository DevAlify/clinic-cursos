import { createHmac } from 'node:crypto';
import { SECRETS } from '../config.ts';
import type { Db } from './db.ts';
import type { Identifier, IdentifierKind } from './types.ts';

// Brazilian mobiles: an 8-digit local number starting with 6-9 is the old format and gets the leading 9.
export function normalizePhone(raw: string, hasCountryCode: boolean): string | null {
  let digits = raw.replace(/\D/g, '');
  if (!hasCountryCode && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
  if (!digits.startsWith('55')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  const rest = digits.slice(2);
  if (rest.length !== 10 && rest.length !== 11) return null;
  const ddd = rest.slice(0, 2);
  let local = rest.slice(2);
  if (local.length === 8 && /^[6-9]/.test(local)) local = `9${local}`;
  return `+55${ddd}${local}`;
}

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

export function hashIdentifier(kind: string, value: string): string {
  return createHmac('sha256', SECRETS.piiHashKey).update(`${kind}:${value}`).digest('hex');
}

export function storePii(db: Db, kind: string, value: string): string {
  const ref = `pii_${hashIdentifier(kind, value).slice(0, 16)}`;
  db.prepare('INSERT OR IGNORE INTO pii (ref, kind, value) VALUES (?, ?, ?)').run(ref, kind, value);
  return ref;
}

export function readPii(db: Db, ref: string | null): string | null {
  if (!ref) return null;
  const row = db.prepare('SELECT value FROM pii WHERE ref = ?').get(ref) as { value: string } | undefined;
  return row?.value ?? null;
}

export function toIdentifier(db: Db, kind: IdentifierKind, raw: string, hasCountryCode = false): Identifier | null {
  const value = kind === 'phone' ? normalizePhone(raw, hasCountryCode) : kind === 'email' ? normalizeEmail(raw) : raw.trim();
  if (!value) return null;
  return { kind, hash: hashIdentifier(kind, value), piiRef: storePii(db, kind, value) };
}
