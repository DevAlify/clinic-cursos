import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

for (const code of ['EPERM', 'EBUSY']) {
  test(`core exits clearly when resetting its database fails with ${code}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'clinic-core-lock-'));
    try {
      const hook = join(dir, 'locked-db.mjs');
      // Reproduce Windows file locking without depending on platform-specific locks.
      writeFileSync(hook, `
        import fs from 'node:fs';
        import { syncBuiltinESMExports } from 'node:module';
        fs.rmSync = () => { throw Object.assign(new Error('locked database'), { code: '${code}' }); };
        syncBuiltinESMExports();
      `);
      const result = spawnSync(process.execPath, ['--import', pathToFileURL(hook).href, fileURLToPath(new URL('../src/main.ts', import.meta.url))], {
        cwd: dir, encoding: 'utf8', timeout: 15_000,
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Outro sistema central.*data\/demo\.db/);
      assert.match(result.stderr, /PID/);
      assert.doesNotMatch(result.stderr, /\bat (?:openFresh|fs\.rmSync)\b/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
