import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFixtureRepo } from './helpers.mjs';
import * as staleTodos from '../classifiers/stale-todos.mjs';
import { FINDINGS, ZERO_FINDINGS_VERIFIED } from '../lib/verdicts.mjs';

test('stale-todos: ZERO_FINDINGS_VERIFIED with no TODO/FIXME/XXX markers', async () => {
  await withFixtureRepo({ 'src/lib/x.ts': 'export const x = 1;\n' }, (repoRoot) => {
    const result = staleTodos.run({ repoRoot });
    assert.equal(result.verdict, ZERO_FINDINGS_VERIFIED);
  });
});

test('stale-todos: ZERO_FINDINGS_VERIFIED when the marker is in a recently-touched file', async () => {
  await withFixtureRepo({ 'src/lib/x.ts': '// TODO: fix this\nexport const x = 1;\n' }, (repoRoot) => {
    const result = staleTodos.run({ repoRoot });
    assert.equal(result.verdict, ZERO_FINDINGS_VERIFIED);
    assert.match(result.note ?? '', /touched within/);
  });
});

test('stale-todos: FINDINGS when the containing file was last committed 180+ days ago', async () => {
  const OLD_DATE = '2024-01-01T00:00:00';
  await withFixtureRepo(
    { 'src/lib/old.ts': '// FIXME: this has been stale for a long time\nexport const x = 1;\n' },
    { commitDates: { 'src/lib/old.ts': OLD_DATE } },
    (repoRoot) => {
      const result = staleTodos.run({ repoRoot });
      assert.equal(result.verdict, FINDINGS);
      assert.equal(result.findings.length, 1);
      assert.ok(result.findings[0].summary.includes('days ago'));
    },
  );
});

test('stale-todos: a file with BOTH a fresh and a stale TODO is ranked by its own commit age, not mixed', async () => {
  const OLD_DATE = '2023-06-15T00:00:00';
  await withFixtureRepo(
    {
      'src/lib/old.ts': '// TODO: old one\nexport const a = 1;\n',
      'src/lib/new.ts': '// TODO: new one\nexport const b = 1;\n',
    },
    { commitDates: { 'src/lib/old.ts': OLD_DATE } }, // new.ts gets the default "recent" commit
    (repoRoot) => {
      const result = staleTodos.run({ repoRoot });
      assert.equal(result.verdict, FINDINGS);
      assert.equal(result.findings.length, 1); // only old.ts crosses the staleness threshold
      assert.match(result.findings[0].scope, /old\.ts/);
    },
  );
});
