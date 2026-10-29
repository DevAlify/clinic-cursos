import { randomInt } from 'node:crypto';

// No 0, O, 1, I or L: nobody confuses them when typing or reading aloud.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newCode(exists: (code: string) => boolean): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!exists(code)) return code;
  }
}

export function extractCode(text: string): string | null {
  const match = text.match(/\(c[oó]d\.\s*([A-HJKMNP-Z2-9]{4})\)/i);
  return match ? match[1].toUpperCase() : null;
}
