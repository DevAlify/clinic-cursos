import { parseArgs } from 'node:util';
import { runScenario } from '../scenarios/run.ts';
import { previewRules } from '../src/core/replay.ts';

const { values } = parseArgs({ options: { window: { type: 'string', default: '14' } } });
const windowDays = Number(values.window);
if (!Number.isInteger(windowDays) || windowDays < 1) throw new Error('use --window com um número inteiro de dias');

const run = await runScenario();
const changes = previewRules(run.db, { ...run.rules, attributionWindowDays: windowDays });
console.log(`Regra atual: janela de ${run.rules.attributionWindowDays} dias. Regra nova: janela de ${windowDays} dias.`);
if (changes.length === 0) console.log('Nenhuma atribuição muda.');
for (const c of changes) {
  const show = (t: typeof c.before) => (t ? `${t.channel ?? 'desconhecido'} (${t.level}, ${t.occurredAt.slice(0, 10)})` : 'desconhecida');
  console.log(`- ${c.personName ?? c.opportunityId} · ${c.product} · ${c.unit}: ${show(c.before)} → ${show(c.after)}`);
}
