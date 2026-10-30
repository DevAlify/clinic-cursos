import { runScenario } from '../scenarios/run.ts';

const run = await runScenario();
const failedSteps = run.outcomes.filter((o) => o.status >= 400);
const width = Math.max(...run.results.map((r) => r.check.expected.length));
// Scenario labels start with 1. to 6., then "Extra": sorting groups them in reading order.
for (const scenario of [...new Set(run.results.map((r) => r.check.scenario))].sort()) {
  console.log(`\n${scenario}`);
  for (const r of run.results.filter((x) => x.check.scenario === scenario)) {
    console.log(`  ${r.ok ? 'OK   ' : 'FALHA'}  ${r.check.expected.padEnd(width)}  obtido: ${r.actual}`);
  }
}
for (const o of failedSteps) console.log(`\nPasso com erro: ${o.step.id} (HTTP ${o.status})`);
const passed = run.results.filter((r) => r.ok).length;
console.log(`\n${passed} de ${run.results.length} verificações passaram.`);
process.exitCode = passed === run.results.length && failedSteps.length === 0 ? 0 : 1;
