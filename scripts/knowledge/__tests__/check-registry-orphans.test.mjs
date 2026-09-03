// node:test fixtures for scripts/knowledge/check-registry-orphans.mjs's pure
// core (findRegistryOrphans). Run directly:
//   node --test scripts/knowledge/__tests__/check-registry-orphans.test.mjs
//
// findRegistryOrphans takes an already-loaded registry object and an
// INJECTED listTrackedFiles(root) — no real git ls-files, no real
// memory/registry.yml — so a failure here means the orphan-detection LOGIC
// is wrong, not that a real file drifted (running the CLI against the real
// tree proves that, separately, and is what CI does).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findRegistryOrphans, FULLY_COVERED_ROOTS } from '../check-registry-orphans.mjs';

/**
 * A registry shaped enough for `mapFilesToFeatures` (from lib/registry.mjs)
 * to route against: two features partitioning `src/app/admin/**` the same
 * way the real admin_platform split does — one narrow carve-out, one
 * catch-all shell.
 */
function fixtureRegistry() {
  return {
    features: {
      admin_incidents: {
        code: {
          routes: ['src/app/admin/errors/**'],
        },
      },
      admin_platform: {
        code: {
          routes: ['src/app/admin/golf/**', 'src/app/admin/*.tsx'],
          tests: ['src/app/admin/__tests__/**'],
        },
      },
    },
  };
}

function listFilesFrom(map) {
  return (root) => map[root] ?? [];
}

test('a file matched by exactly one feature glob is not an orphan', () => {
  const registry = fixtureRegistry();
  const files = listFilesFrom({
    'src/app/admin': ['src/app/admin/errors/page.tsx'],
  });
  const orphans = findRegistryOrphans(registry, ['src/app/admin'], files);
  assert.deepEqual(orphans, []);
});

test('a file matched by two overlapping globs (shell + sub-capability) is not an orphan', () => {
  const registry = {
    features: {
      admin_platform: { code: { services: ['src/lib/admin/**'] } },
      admin_incidents: { code: { services: ['src/lib/admin/incidents/**'] } },
    },
  };
  const files = listFilesFrom({
    'src/lib/admin': ['src/lib/admin/incidents/classify.ts'],
  });
  const orphans = findRegistryOrphans(registry, ['src/lib/admin'], files);
  assert.deepEqual(orphans, []);
});

test('a file matched by zero feature globs is reported as an orphan', () => {
  const registry = fixtureRegistry();
  const files = listFilesFrom({
    'src/app/admin': [
      'src/app/admin/errors/page.tsx', // covered
      'src/app/admin/reliability/page.tsx', // NOT covered by this fixture registry
    ],
  });
  const orphans = findRegistryOrphans(registry, ['src/app/admin'], files);
  assert.deepEqual(orphans, ['src/app/admin/reliability/page.tsx']);
});

// This is the exact real-world regression this checker exists to catch:
// admin-gate-coverage.test.ts fell through every named routes/tests glob
// after the admin_platform split until memory/registry.yml's
// admin_platform.code.tests block added `src/app/admin/__tests__/**`.
test('the admin-gate-coverage regression: a file under __tests__/ is covered once the glob is added, orphaned when it is not', () => {
  const withoutTestsGlob = {
    features: {
      admin_platform: { code: { routes: ['src/app/admin/golf/**'] } },
    },
  };
  const withTestsGlob = fixtureRegistry();
  const files = listFilesFrom({
    'src/app/admin': ['src/app/admin/__tests__/admin-gate-coverage.test.ts'],
  });

  assert.deepEqual(
    findRegistryOrphans(withoutTestsGlob, ['src/app/admin'], files),
    ['src/app/admin/__tests__/admin-gate-coverage.test.ts'],
  );
  assert.deepEqual(findRegistryOrphans(withTestsGlob, ['src/app/admin'], files), []);
});

test('orphan results are sorted and de-duplicated across multiple roots', () => {
  const registry = { features: {} }; // matches nothing — every file is an orphan
  const files = listFilesFrom({
    'src/lib/admin': ['src/lib/admin/z.ts', 'src/lib/admin/a.ts'],
    'src/app/admin': ['src/app/admin/m.tsx'],
  });
  const orphans = findRegistryOrphans(registry, ['src/lib/admin', 'src/app/admin'], files);
  assert.deepEqual(orphans, ['src/app/admin/m.tsx', 'src/lib/admin/a.ts', 'src/lib/admin/z.ts']);
});

test('no roots to check means no orphans, regardless of registry', () => {
  const orphans = findRegistryOrphans({ features: {} }, [], () => {
    throw new Error('listTrackedFiles must not be called with an empty roots list');
  });
  assert.deepEqual(orphans, []);
});

// FULLY_COVERED_ROOTS is the live config this checker's CLI actually runs
// against — a regression test on its CONTENTS (not just the algorithm)
// catches someone silently emptying the list to make CI green rather than
// fixing a real orphan (the exact anti-pattern the module doc-comment warns
// against for `--update`).
test('FULLY_COVERED_ROOTS names the two directories the admin_platform split claims to fully partition', () => {
  assert.deepEqual([...FULLY_COVERED_ROOTS].sort(), ['src/app/admin', 'src/lib/admin']);
});
