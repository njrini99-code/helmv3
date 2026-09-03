import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withFixtureRepo } from './helpers.mjs';
import * as oversizedModules from '../classifiers/oversized-modules.mjs';
import * as unusedTests from '../classifiers/unused-tests.mjs';
import * as missingFeatureMappings from '../classifiers/missing-feature-mappings.mjs';
import * as orphanRoutes from '../classifiers/orphan-routes.mjs';
import { FINDINGS, ZERO_FINDINGS_VERIFIED, NO_SIGNAL } from '../lib/verdicts.mjs';

// --- oversized-modules.mjs ---

test('oversized-modules: ZERO_FINDINGS_VERIFIED under the line threshold', async () => {
  await withFixtureRepo({ 'src/lib/small.ts': 'export const x = 1;\n' }, (repoRoot) => {
    const result = oversizedModules.run({ repoRoot });
    assert.equal(result.verdict, ZERO_FINDINGS_VERIFIED);
  });
});

test('oversized-modules: FINDINGS for a file at/over the 600-line threshold', async () => {
  const big = Array.from({ length: 650 }, (_, i) => `// line ${i}`).join('\n') + '\n';
  await withFixtureRepo({ 'src/lib/big.ts': big }, (repoRoot) => {
    const result = oversizedModules.run({ repoRoot });
    assert.equal(result.verdict, FINDINGS);
    assert.equal(result.findings.length, 1);
    assert.match(result.findings[0].summary, /src\/lib\/big\.ts/);
  });
});

// --- unused-tests.mjs ---

test('unused-tests: NO_SIGNAL when no knip-report.txt exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'janitor-unused-tests-'));
  try {
    const result = unusedTests.run({ repoRoot: dir });
    assert.equal(result.verdict, NO_SIGNAL);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unused-tests: ZERO_FINDINGS_VERIFIED when the report names no test files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'janitor-unused-tests-'));
  try {
    writeFileSync(join(dir, 'knip-report.txt'), 'Unused exports\nsrc/lib/helper.ts:12:5  helperFn\n');
    const result = unusedTests.run({ repoRoot: dir });
    assert.equal(result.verdict, ZERO_FINDINGS_VERIFIED);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unused-tests: FINDINGS when the report names a test file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'janitor-unused-tests-'));
  try {
    writeFileSync(join(dir, 'knip-report.txt'), 'Unused files\nsrc/lib/helper.test.ts\n');
    const result = unusedTests.run({ repoRoot: dir });
    assert.equal(result.verdict, FINDINGS);
    assert.ok(result.findings.length >= 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- missing-feature-mappings.mjs ---

const REGISTRY_YAML = `version: 1

features:
  test_feature:
    name: Test Feature
    status: active
    owner: platform
    criticality: medium
    code:
      routes:
        - src/app/mapped/**
`;

test('missing-feature-mappings: ZERO_FINDINGS_VERIFIED when every route matches a feature', async () => {
  await withFixtureRepo(
    {
      'memory/registry.yml': REGISTRY_YAML,
      'src/app/mapped/page.tsx': 'export default function Page() { return null; }\n',
    },
    async (repoRoot) => {
      const result = await missingFeatureMappings.run({ repoRoot });
      assert.equal(result.verdict, ZERO_FINDINGS_VERIFIED);
    },
  );
});

test('missing-feature-mappings: FINDINGS for a route matching no feature', async () => {
  await withFixtureRepo(
    {
      'memory/registry.yml': REGISTRY_YAML,
      'src/app/mapped/page.tsx': 'export default function Page() { return null; }\n',
      'src/app/unmapped/page.tsx': 'export default function Page2() { return null; }\n',
    },
    async (repoRoot) => {
      const result = await missingFeatureMappings.run({ repoRoot });
      assert.equal(result.verdict, FINDINGS);
      assert.equal(result.findings.length, 1);
      assert.match(result.findings[0].scope, /unmapped/);
    },
  );
});

test('missing-feature-mappings: NO_SIGNAL when registry.yml is absent', async () => {
  await withFixtureRepo(
    { 'src/app/x/page.tsx': 'export default function Page() { return null; }\n' },
    async (repoRoot) => {
      const result = await missingFeatureMappings.run({ repoRoot });
      assert.equal(result.verdict, NO_SIGNAL);
    },
  );
});

// --- orphan-routes.mjs (stubs the underlying script; does not re-test its render-graph logic) ---

function withStubbedOrphanScript(scriptBody, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'janitor-orphan-'));
  try {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    const scriptPath = join(dir, 'scripts', 'find-orphan-mounts.mjs');
    writeFileSync(scriptPath, scriptBody);
    chmodSync(scriptPath, 0o755);
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('orphan-routes: ZERO_FINDINGS_VERIFIED when the underlying script reports 0 orphans', () => {
  withStubbedOrphanScript(
    "console.log('route roots walked          : 10');\nconsole.log('files reachable from a root : 20');\nconsole.log('UNREACHABLE component files : 0');\n",
    (repoRoot) => {
      const result = orphanRoutes.run({ repoRoot });
      assert.equal(result.verdict, ZERO_FINDINGS_VERIFIED);
    },
  );
});

test('orphan-routes: FINDINGS parses the file list from stdout', () => {
  withStubbedOrphanScript(
    "console.log('UNREACHABLE component files : 2\\n');\nconsole.log('  src/components/a/A.tsx');\nconsole.log('  src/components/b/B.tsx');\n",
    (repoRoot) => {
      const result = orphanRoutes.run({ repoRoot });
      assert.equal(result.verdict, FINDINGS);
      assert.equal(result.findings.length, 2);
      assert.match(result.findings[0].scope, /src\/components\/a\/A\.tsx/);
    },
  );
});

test('orphan-routes: NO_SIGNAL when the underlying script crashes', () => {
  withStubbedOrphanScript("process.exit(1);\n", (repoRoot) => {
    const result = orphanRoutes.run({ repoRoot });
    assert.equal(result.verdict, NO_SIGNAL);
  });
});
