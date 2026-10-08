import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { globSync, readFileSync } from 'node:fs';

/**
 * Vitest config — root settings + project split.
 *
 * Projects split tests by SPEED CONVENTION (file naming), not directory.
 * Existing tests stay where they are — devs opt into a slower lane by
 * renaming the file.
 *
 *   unit         — default for `npm test`. Excludes the slow lanes.
 *   integration — *.integration.test.{ts,tsx}, longer timeout
 *   rls         — *.rls.test.{ts,tsx}, longer timeout
 *   business    — *.contract.test.{ts,tsx} and *-contract.test.{ts,tsx}
 *
 * Scripts:
 *   npm test                 → unit only (fast)
 *   npm run test:all         → every project (CI)
 *   npm run test:integration → just integration
 *   npm run test:rls         → just RLS
 *   npm run test:business    → just business contracts
 */
/**
 * REPO-WIDE STATIC GUARDS: they walk thousands of files, so they run in their
 * own `guards` project (see below) with a long timeout and are subtracted from
 * `unit`. Listed by hand on purpose: membership is a decision, not a pattern.
 * Do not add ordinary unit tests here.
 */
const GUARD_TESTS = [
  'scripts/__tests__/scripts-no-committed-secrets.test.mjs',
  'scripts/__tests__/seed-recruiting-invariant.test.mjs',
  'scripts/__tests__/baseball-demo-seed-contract.test.mjs',
  'scripts/__tests__/icon-only-button-aria-label.test.mjs',
  'scripts/__tests__/baseball-action-integrity.test.mjs',
  'scripts/__tests__/baseball-stale-route-links.test.mjs',
  'scripts/__tests__/no-glasscard-imports.test.mjs',
  'scripts/__tests__/no-ios-ease-stats.test.mjs',
  'scripts/__tests__/no-legacy-skeleton-imports.test.mjs',
  'scripts/__tests__/no-tranwarm-typo.test.mjs',
  'scripts/__tests__/radix-dropdown-sonner.test.mjs',
  'scripts/__tests__/admin-tables-mobile.test.mjs',
  'scripts/__tests__/no-arbitrary-text-px-fairway-pages.test.mjs',
  'scripts/__tests__/check-migration-headers.test.mjs',
  // Promoted 2026-10-07: a bare script that no runner executed. Walks src/ with
  // `git grep`, so it belongs with the other repo sweeps.
  'scripts/__tests__/no-stale-cream-hardcodes.test.mjs',
];

/**
 * Every vitest-style test under scripts/, found by glob so a new test file runs
 * the day it is added. Until 2026-10-07 this was a hand-maintained list, and a
 * file missing from it executed never, silently.
 *
 * `node --test` files are the one thing a glob cannot tell apart by name, and
 * they import `node:test`, which vitest cannot run. Detect them by content:
 * `flags:check`, `clubhouse:check`, `test:janitor`, `test:mutation-gate` and
 * `knowledge:*:test` run those. A test file whose source mentions neither
 * runner is treated as vitest, so a new one is picked up here.
 */
function isNodeTestFile(file: string): boolean {
  try {
    return /from\s+['"]node:test['"]|require\(\s*['"]node:test['"]\s*\)/.test(readFileSync(file, 'utf8'));
  } catch {
    return false;
  }
}
const SCRIPT_UNIT_TESTS: string[] = globSync('scripts/**/*.{test,spec}.{mjs,ts}', {
  cwd: __dirname,
  exclude: (name: string) => name === 'node_modules',
})
  .map((f) => f.split(path.sep).join('/'))
  .filter((f) => !GUARD_TESTS.includes(f) && !isNodeTestFile(path.join(__dirname, f)))
  .sort();

const sharedTestConfig = {
  environment: 'jsdom' as const,
  globals: true,
  // Vitest 5 flipped this default to `true` (vi.clearAllMocks() before every
  // test). Pinned to the Vitest 4 behaviour so the upgrade does not change
  // what any existing test observes: suites that record mock calls in
  // beforeAll/module scope, or count calls across tests, keep that history.
  // Turning it on is a separate, deliberate change, not a dependency bump.
  clearMocks: false,
  setupFiles: ['./src/test/setup.tsx'],
  coverage: {
    provider: 'v8' as const,
    reporter: ['text', 'json', 'html'],
    exclude: [
      'node_modules/',
      'src/test/',
      '**/*.d.ts',
      '**/*.config.*',
      '**/types/**',
    ],
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` is a Next.js build-time guard with no runtime behaviour.
      // Vitest cannot resolve the bare specifier (Next owns the package), so we
      // alias it to an empty stub for all test projects so server-scoped modules
      // (e.g. coachhelm/scheduled-evaluator, player-access, ai-policy-server)
      // can be exercised in unit and RLS tests without pulling Next's bundler.
      'server-only': path.resolve(__dirname, './src/test/stubs/server-only.ts'),
    },
  },
  test: {
    ...sharedTestConfig,
    // Worker cap for a shared machine. Five agent shells each forking ten
    // vitest workers was most of the RAM (measured 2026-09-05); three per run,
    // with scripts/serialize.mjs letting two runs through at once, is at most
    // six forks machine-wide. docs/operations/GATES.md has the numbers.
    pool: 'forks',
    maxWorkers: 3,
    // NO root-level `include`. Every project below defines its own, and
    // `extends: true` MERGES array options rather than replacing them — so a
    // root-level include is unioned into every project, not overridden by it.
    //
    // This was previously commented "the per-project blocks below override
    // these for named runs", which is the opposite of what happens, and it had
    // consequences: `--project integration`, `--project rls` and
    // `--project business` each matched ~870 files instead of their own 5, 0
    // and 7, because they set `include` but not `exclude` and so inherited the
    // broad root pattern with nothing to narrow it. `unit` looked correct only
    // because it also overrides `exclude` and explicitly subtracts the other
    // three categories.
    //
    // The visible symptom was in CI: the "Business contracts" job runs
    // `vitest run --project business`, so it re-ran the ENTIRE unit suite
    // under a name that claims to check seven contract files — roughly
    // doubling test wall-clock on every PR while reporting something untrue.
    //
    // `exclude` stays at the root deliberately: merging excludes is additive
    // in the safe direction (each project subtracts at least these), which is
    // exactly what it is for.
    exclude: ['node_modules', '.next', 'archive'],

    projects: [
      {
        extends: true,
        test: {
          ...sharedTestConfig,
          // Plain-.ts tests run in a node environment: jsdom startup was
          // ~0.4s per file across 800+ files that never touch the DOM.
          // Anything DOM-flavored belongs in .test.tsx (the unit-dom
          // project below) or carries a per-file
          // `// @vitest-environment jsdom` pragma. A misclassified file
          // fails loudly ("document is not defined") — never silently.
          environment: 'node' as const,
          name: 'unit',
          include: ['src/**/*.test.ts', 'src/**/*.spec.ts', ...SCRIPT_UNIT_TESTS],
          exclude: [
            'node_modules',
            '.next',
            'archive',
            'src/**/*.integration.test.{ts,tsx}',
            'src/**/*.rls.test.{ts,tsx}',
            'src/**/*.contract.test.{ts,tsx}',
            'src/**/*-contract.test.{ts,tsx}',
          ],
          // Vitest's default is 5_000ms, and that default is wrong for what
          // this project actually contains. Alongside ordinary unit tests, the
          // `scripts/__tests__/*.test.mjs` guards listed above are repo
          // sweeps: eleven of them each walk every .ts/.tsx file under src/
          // — 4,066 files on 2026-08-29 — reading each one sequentially and
          // running regexes over it. That is roughly 45,000 sequential reads
          // per shard. They are lint passes wearing a unit test's costume, and
          // 5s bounds MACHINE LOAD, not the property they assert.
          //
          // It has already fired twice in two days, both on GitHub's 2-core
          // runners, and once on main:
          //
          //   2026-08-28  main, run 33189072611  icon-only-button-aria-label
          //   2026-08-29  PR #1670,  run 33260843017   no-glasscard-imports
          //
          // Proven non-deterministic rather than assumed: #1670's shard was
          // re-run at the IDENTICAL sha and went green. Locally the same
          // `test:run --shard=1/3` finishes 424 files in 71s against CI's
          // 264s, so this machine cannot reproduce it — the bound is the
          // runner's, and a local green is not evidence either way.
          //
          // 30_000 matches integration/rls/business, which already carry it.
          // The cost accepted: a genuinely hung unit test now reports after
          // 30s instead of 5s, inside a shard that already runs 264s.
          //
          // WHAT THIS DOES NOT FIX. A timeout is UNKNOWN, and vitest reports
          // it as a failed assertion — CI prints red against "no imports of
          // GlassCard … remain in src" when the guard never finished asking,
          // so a reader concludes a banned import exists. Raising the bound
          // makes that rarer. It does not make it distinguishable. Reading
          // the 45,000 files concurrently is the actual fix; moving these
          // guards out of vitest, so a non-completion can report "guard did
          // not run", is the only thing that would separate the two states.
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          ...sharedTestConfig,
          // REPO-WIDE STATIC GUARDS, split out of `unit` on 2026-08-29.
          //
          // These walk thousands of files. Inside `unit` a slow runner turned a
          // sweep into a TIMEOUT, and vitest reports a timeout exactly the way
          // it reports a failed assertion — so CI printed red against
          // "no imports of GlassCard ... remain in src" when the guard had never
          // finished asking. #1672 widened the bound, and its own PR said that
          // makes the lie RARER, not distinguishable.
          //
          // They live here so `scripts/repo-guards.mjs` can run them alone and
          // interpret WHY each one failed. Do not add ordinary unit tests here.
          environment: 'node' as const,
          name: 'guards',
          include: GUARD_TESTS,
          exclude: ['node_modules', '.next', 'archive'],
          // Generous on purpose: this project is I/O bound by design. The runner
          // no longer depends on the bound being right, only on it being rare.
          testTimeout: 120_000,
        },
      },
      {
        extends: true,
        test: {
          // The component half of the unit suite: .tsx tests get the real
          // jsdom environment. Split from `unit` so the 800+ DOM-free .ts
          // files stop paying jsdom startup per file. Keep include/exclude
          // in lockstep with `unit` above.
          ...sharedTestConfig,
          name: 'unit-dom',
          include: [
            'src/**/*.test.tsx',
            'src/**/*.spec.tsx',
          ],
          exclude: [
            'node_modules',
            '.next',
            'archive',
            'src/**/*.integration.test.{ts,tsx}',
            'src/**/*.rls.test.{ts,tsx}',
            'src/**/*.contract.test.{ts,tsx}',
            'src/**/*-contract.test.{ts,tsx}',
          ],
          // Same bound as `unit`: vitest's 5s default bounds machine load
          // on the 2-core hosted runners, not what a component test asserts.
          // `unit-dom` had no timeout of its own, so a slow runner turned a
          // jsdom render into a failure indistinguishable from a real one.
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          ...sharedTestConfig,
          name: 'integration',
          include: ['src/**/*.integration.test.{ts,tsx}'],
          exclude: ['node_modules', '.next'],
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          ...sharedTestConfig,
          name: 'rls',
          // Selects ZERO files today — no `src/**/*.rls.test.*` exists. That
          // is not a gap: RLS is tested for real by the pgTAP suites in
          // supabase/tests/rls/*.sql, which run against a fresh Postgres in
          // CI's "Supabase lint + RLS tests" job, and `npm run test:rls` runs
          // THOSE (`bash scripts/test-pgtap.sh`), not this project — this
          // comment said `test:rls` "does nothing" long after the script was
          // repointed. Kept as a defined project so the naming convention
          // stays available; `vitest run --project rls` on its own is still
          // evidence of nothing. (The assertion count that used to sit here
          // is gone: it was a number in a comment, and it rotted.)
          include: ['src/**/*.rls.test.{ts,tsx}'],
          exclude: ['node_modules', '.next'],
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          ...sharedTestConfig,
          name: 'business',
          include: [
            'src/**/*.contract.test.{ts,tsx}',
            'src/**/*-contract.test.{ts,tsx}',
          ],
          exclude: ['node_modules', '.next'],
          testTimeout: 30_000,
        },
      },
    ],
  },
});
