// npm run demo: starts the three services (core, erp, waha) as three processes, like three machines.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

// Minimal KEY=VALUE reader for .env (no dependency). Variables already in the environment win.
function loadEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith('#')) continue;
    out[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

const env = { ...loadEnvFile('.env'), ...process.env };
const port = (name: string, fallback: number) => Number(env[name] ?? fallback);
const services = [
  { name: 'core', file: 'src/main.ts', url: `http://localhost:${port('CORE_PORT', 3000)}`, what: 'o sistema central (atendimento, CRM, campanhas, bastidores)' },
  { name: 'erp', file: 'services/erp/main.ts', url: `http://localhost:${port('ERP_PORT', 3100)}`, what: 'o ERP simulado (pedidos e pagamentos)' },
  { name: 'waha', file: 'services/waha/main.ts', url: `http://localhost:${port('WAHA_PORT', 3200)}`, what: 'o celular do lead (simulador do WAHA)' },
];

const children: ChildProcess[] = [];
let stopping = false;
function stop(code: number) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill();
  process.exitCode = code;
}

for (const s of services) {
  const child = spawn(process.execPath, [s.file], { env: env as NodeJS.ProcessEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  for (const stream of [child.stdout, child.stderr]) createInterface({ input: stream }).on('line', (l) => console.log(`[${s.name}] ${l}`));
  child.on('error', (e) => { console.error(`[${s.name}] não subiu: ${e.message}`); stop(1); });
  child.on('exit', (code) => {
    if (stopping) return;
    console.error(`[${s.name}] encerrou (código ${code}); parando os outros serviços. Se a porta estava ocupada, mude a variável de ambiente (ver .env.example).`);
    stop(1);
  });
}

console.log('\nServiços da demo:');
for (const s of services) console.log(`  ${s.name.padEnd(5)} ${s.url}  ${s.what}`);
console.log('\nCtrl+C encerra os três.\n');

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
