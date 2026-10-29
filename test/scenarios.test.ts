import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runScenario } from '../scenarios/run.ts';

test('every scenario step succeeds and every expected result holds', async () => {
  const run = await runScenario();
  assert.deepEqual(run.outcomes.filter((o) => o.status >= 400).map((o) => o.step.id), []);
  assert.deepEqual(run.results.filter((r) => !r.ok).map((r) => `${r.check.expected} → ${r.actual}`), []);
  assert.equal(run.results.length, 27);
});
