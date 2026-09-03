import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFixtureRepo } from './helpers.mjs';
import * as deadFlags from '../classifiers/dead-flags.mjs';
import * as deprecatedApis from '../classifiers/deprecated-apis.mjs';
import * as mockInflation from '../classifiers/mock-inflation.mjs';
import * as duplicateTelemetry from '../classifiers/duplicate-telemetry.mjs';
import * as abandonedExperiments from '../classifiers/abandoned-experiments.mjs';
import { FINDINGS, ZERO_FINDINGS_VERIFIED, NO_SIGNAL } from '../lib/verdicts.mjs';

// --- dead-flags.mjs ---

test('dead-flags: NO_SIGNAL when no flag-module convention exists at all', async () => {
  await withFixtureRepo({ 'src/lib/x.ts': 'export const x = 1;\n' }, (repoRoot) => {
    const result = deadFlags.run({ repoRoot });
    assert.equal(result.verdict, NO_SIGNAL);
  });
});

test('dead-flags: FINDINGS for a single-reference flag identifier', async () => {
  await withFixtureRepo(
    { 'src/lib/x.ts': "export const on = isFlagEnabled('new_thing');\n" },
    (repoRoot) => {
      const result = deadFlags.run({ repoRoot });
      assert.equal(result.verdict, FINDINGS);
      assert.equal(result.findings.length, 1);
    },
  );
});

test('dead-flags: ZERO_FINDINGS_VERIFIED when every flag file has multiple references', async () => {
  await withFixtureRepo(
    {
      'src/lib/x.ts':
        "export const on = isFlagEnabled('new_thing');\nconsole.log(FEATURE_FLAG.new_thing);\n",
    },
    (repoRoot) => {
      const result = deadFlags.run({ repoRoot });
      assert.equal(result.verdict, ZERO_FINDINGS_VERIFIED);
    },
  );
});

// --- deprecated-apis.mjs ---

test('deprecated-apis: ZERO_FINDINGS_VERIFIED with no @deprecated markers', async () => {
  await withFixtureRepo({ 'src/lib/x.ts': 'export const x = 1;\n' }, (repoRoot) => {
    const result = deprecatedApis.run({ repoRoot });
    assert.equal(result.verdict, ZERO_FINDINGS_VERIFIED);
  });
});

test('deprecated-apis: FINDINGS when a @deprecated marker exists', async () => {
  await withFixtureRepo(
    { 'src/lib/x.ts': '/** @deprecated use y instead */\nexport function x() {}\n' },
    (repoRoot) => {
      const result = deprecatedApis.run({ repoRoot });
      assert.equal(result.verdict, FINDINGS);
      assert.equal(result.findings.length, 1);
      assert.match(result.findings[0].summary, /src\/lib\/x\.ts/);
    },
  );
});

// --- mock-inflation.mjs ---

test('mock-inflation: NO_SIGNAL when no mock() call exists anywhere', async () => {
  await withFixtureRepo({ 'src/lib/x.test.ts': "test('a', () => {});\n" }, (repoRoot) => {
    const result = mockInflation.run({ repoRoot });
    assert.equal(result.verdict, NO_SIGNAL);
  });
});

test('mock-inflation: ZERO_FINDINGS_VERIFIED below the mock-count threshold', async () => {
  await withFixtureRepo({ 'src/lib/x.test.ts': "vi.mock('./a');\nvi.mock('./b');\n" }, (repoRoot) => {
    const result = mockInflation.run({ repoRoot });
    assert.equal(result.verdict, ZERO_FINDINGS_VERIFIED);
  });
});

test('mock-inflation: FINDINGS when a file crosses the mock-count threshold', async () => {
  const mocks = Array.from({ length: 12 }, (_, i) => `vi.mock('./mod${i}');`).join('\n') + '\n';
  await withFixtureRepo({ 'src/lib/x.test.ts': mocks }, (repoRoot) => {
    const result = mockInflation.run({ repoRoot });
    assert.equal(result.verdict, FINDINGS);
    assert.equal(result.findings.length, 1);
    assert.match(result.findings[0].summary, /mocks 12 modules/);
  });
});

// --- duplicate-telemetry.mjs ---

test('duplicate-telemetry: NO_SIGNAL when no capture()/track() literal call exists', async () => {
  await withFixtureRepo({ 'src/lib/x.ts': 'export const x = 1;\n' }, (repoRoot) => {
    const result = duplicateTelemetry.run({ repoRoot });
    assert.equal(result.verdict, NO_SIGNAL);
  });
});

test('duplicate-telemetry: ZERO_FINDINGS_VERIFIED when event names are unique', async () => {
  await withFixtureRepo(
    { 'src/lib/x.ts': "posthog.capture('event_one');\n" },
    (repoRoot) => {
      const result = duplicateTelemetry.run({ repoRoot });
      assert.equal(result.verdict, ZERO_FINDINGS_VERIFIED);
    },
  );
});

test('duplicate-telemetry: FINDINGS when the same event name fires from two files', async () => {
  await withFixtureRepo(
    {
      'src/lib/a.ts': "posthog.capture('signup_started');\n",
      'src/lib/b.ts': "posthog.capture('signup_started');\n",
    },
    (repoRoot) => {
      const result = duplicateTelemetry.run({ repoRoot });
      assert.equal(result.verdict, FINDINGS);
      assert.equal(result.findings.length, 1);
      assert.match(result.findings[0].summary, /signup_started/);
    },
  );
});

test('duplicate-telemetry: evidenceCommand is shell-safe (no unescaped embedded quotes)', async () => {
  await withFixtureRepo({ 'src/lib/x.ts': 'export const x = 1;\n' }, (repoRoot) => {
    const result = duplicateTelemetry.run({ repoRoot });
    // A naive double-quoted shell command with an embedded `"` would close
    // early — assert the command contains no bare `"` other than the
    // matched pair that opens/closes the whole -E argument.
    const quoteCount = (result.evidenceCommand.match(/"/g) ?? []).length;
    assert.equal(quoteCount % 2, 0, `evidenceCommand has an unbalanced quote: ${result.evidenceCommand}`);
  });
});

// --- abandoned-experiments.mjs ---

test('abandoned-experiments: ZERO_FINDINGS_VERIFIED with no markers', async () => {
  await withFixtureRepo({ 'src/lib/x.ts': 'export const x = 1;\n' }, (repoRoot) => {
    const result = abandonedExperiments.run({ repoRoot });
    assert.equal(result.verdict, ZERO_FINDINGS_VERIFIED);
  });
});

test('abandoned-experiments: FINDINGS with high confidence for an expired removal date', async () => {
  await withFixtureRepo(
    { 'src/lib/x.ts': '// remove after 2020-01-01\nexport const x = 1;\n' },
    (repoRoot) => {
      const result = abandonedExperiments.run({ repoRoot });
      assert.equal(result.verdict, FINDINGS);
      assert.equal(result.findings[0].confidence, 'high');
      assert.match(result.findings[0].summary, /has PASSED/);
    },
  );
});

test('abandoned-experiments: FINDINGS with low confidence for a bare EXPERIMENTAL marker', async () => {
  await withFixtureRepo(
    { 'src/lib/x.ts': '// EXPERIMENTAL: new pricing logic\nexport const x = 1;\n' },
    (repoRoot) => {
      const result = abandonedExperiments.run({ repoRoot });
      assert.equal(result.verdict, FINDINGS);
      assert.equal(result.findings[0].confidence, 'low');
    },
  );
});

test('abandoned-experiments: the marker match is case-insensitive (lowercase "experimental")', async () => {
  await withFixtureRepo(
    { 'src/lib/x.ts': '// experimental: still evaluating\nexport const x = 1;\n' },
    (repoRoot) => {
      const result = abandonedExperiments.run({ repoRoot });
      assert.equal(result.verdict, FINDINGS);
    },
  );
});
