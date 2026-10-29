// Small env reader for the standalone services. Defaults are demo values (see .env.example); no real secret lives here.
const read = (name: string, fallback: string): string => process.env[name] ?? fallback;

export interface Session { name: string; number: string }

// "sp:551130000001,rj:552130000002" -> [{ name: 'sp', number: '551130000001' }, ...]
export function parseSessions(raw: string): Session[] {
  return raw.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [name = '', number = ''] = s.split(':');
    if (!name || !/^\d+$/.test(number)) throw new Error(`WAHA_SESSIONS inválido: "${s}" (use nome:número, separados por vírgula)`);
    return { name, number };
  });
}

export const erpEnv = () => ({
  port: Number(read('ERP_PORT', '3100')),
  token: read('ERP_TOKEN', 'demo-erp-token'),
  coreUrl: read('CORE_URL', 'http://localhost:3000'),
});

export const wahaEnv = () => ({
  port: Number(read('WAHA_PORT', '3200')),
  apiKey: read('WAHA_API_KEY', 'demo-waha-key'),
  hmacKey: read('WAHA_WEBHOOK_HMAC_KEY', 'demo-waha-hmac'),
  sessions: parseSessions(read('WAHA_SESSIONS', 'sp:551130000001,rj:552130000002,cps:551930000003')),
  coreUrl: read('CORE_URL', 'http://localhost:3000'),
});
