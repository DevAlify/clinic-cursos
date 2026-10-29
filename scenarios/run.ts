import { DEFAULT_RULES } from '../src/config.ts';
import { openDb, type Db } from '../src/core/db.ts';
import { getState } from '../src/core/state.ts';
import type { Rules } from '../src/core/types.ts';
import { createApp } from '../src/server.ts';
import { checks, type Check } from './checks.ts';
import { steps, type Step } from './steps.ts';

export interface ScenarioRun {
  db: Db; rules: Rules;
  outcomes: { step: Step; status: number }[];
  results: { check: Check; ok: boolean; actual: string }[];
}

// Same path as the simulator: every step goes through the HTTP door of the real app.
export async function runScenario(rules: Rules = DEFAULT_RULES): Promise<ScenarioRun> {
  const { app, getDb } = createApp({ openFresh: () => openDb(), rules });
  const run: ScenarioRun = { db: getDb(), rules, outcomes: [], results: [] };
  const verify = (stepId: string) => {
    const db = getDb();
    const state = getState(db, rules);
    for (const check of checks.filter((c) => c.afterStep === stepId)) {
      try {
        run.results.push({ check, ...check.run({ db, state, rules }) });
      } catch (err) {
        run.results.push({ check, ok: false, actual: `erro: ${err instanceof Error ? err.message : String(err)}` });
      }
    }
  };
  for (const step of steps) {
    const req = step.build({ db: getDb() });
    const res = await app.request(req.path, { method: req.method, headers: req.headers, body: req.body });
    run.outcomes.push({ step, status: res.status });
    verify(step.id);
  }
  verify('end');
  run.db = getDb();
  return run;
}
