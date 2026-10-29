import { createHmac, timingSafeEqual } from 'node:crypto';

export const signMeta = (rawBody: string, secret: string): string =>
  `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;

// WAHA sends the hex HMAC in X-Webhook-Hmac, with X-Webhook-Hmac-Algorithm: sha512.
export const signWaha = (rawBody: string, key: string): string =>
  createHmac('sha512', key).update(rawBody, 'utf8').digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Checked against the raw body, before any JSON parsing.
export const verifyMetaSignature = (rawBody: string, header: string | undefined, secret: string): boolean =>
  header !== undefined && safeEqual(header, signMeta(rawBody, secret));
