import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

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
const sharedTestConfig = {
  environment: 'jsdom' as const,
  globals: true,
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
    exclude: ['node_modules', '.next', 'archive', 'helm-website-ui', 'helm-intelligence'],

    projects: [
      {
        extends: true,
        test: {
          ...sharedTestConfig,
          name: 'unit',
          include: [
            'src/**/*.test.{ts,tsx}',
            'src/**/*.spec.{ts,tsx}',
            // Named explicitly (not a `scripts/**/*.test.mjs` glob): the other
            // 46 files in scripts/__tests__/ are written for `node --test`
            // (see their own "Run:" header comments) and are NOT wired into
            // any CI job or npm script today — a separate, larger dead-test
            // finding tracked in the stabilization report, out of scope for
            // this P0 fix. Only the #516 secrets guard is promoted to vitest
            // here, since it previously never ran under any mechanism at all.
            'scripts/__tests__/scripts-no-committed-secrets.test.mjs',
            // Named explicitly for the same reason as the line above (no
            // `scripts/**` glob — the legacy `node --test` files must not be
            // swept in). This one guards the transient-retry wrapper that sits
            // in front of `Seed BaseballHelm CI accounts`, the step whose
            // unretried Supabase call took main and every open PR red on
            // 2026-07-29. A regression here is a repo-wide merge freeze.
            'scripts/lib/__tests__/retrying-fetch.test.ts',
            // The shared "did you mean to write HERE?" guard for the baseball
            // seeds. Named here rather than swept in by a glob for the same
            // reason as its neighbours. Unlike the source-text contract test
            // below, this one EXECUTES the rules — the two typo-squat classes it
            // covers (a look-alike domain resolving to the prod ref, `.local`
            // accepted as a loopback suffix) both passed a grep happily.
            'scripts/lib/__tests__/seed-target-guard.test.ts',
            // The demo-seed guards. Same rationale as the secrets guard above:
            // they were written for `node --test` and so ran under nothing, and
            // what they protect — a script that creates auth users and deletes
            // rows against a live project — is exactly the kind of thing that
            // must not be guarded by a test nobody executes.
            'scripts/__tests__/baseball-demo-seed-contract.test.mjs',
            'scripts/__tests__/verify-baseball-demo-coverage-honesty.test.ts',
            // The mobile touch-target / safe-area guard. Promoted for the same
            // reason as its neighbours, with a sharper illustration of the cost:
            // while it ran under nothing, it drifted twice without a murmur. It
            // asserted 44pt putt-picker targets against
            // `golf/ShotTrackingComprehensive.tsx`, which no longer renders
            // anywhere — both round clients render `FairwayShotTracking` — so it
            // was guarding dead code while the surface users actually touch went
            // unguarded. And it read a `RoundStripGrid.tsx` that does not exist in
            // main, so it would have failed on a missing file the instant anything
            // executed it. Both are fixed; it now points at the live components.
            'scripts/__tests__/drawers-mobile.test.mjs',
          ],
          exclude: [
            'node_modules',
            '.next',
            'archive',
            'helm-website-ui',
            'helm-intelligence',
            'src/**/*.integration.test.{ts,tsx}',
            'src/**/*.rls.test.{ts,tsx}',
            'src/**/*.contract.test.{ts,tsx}',
            'src/**/*-contract.test.{ts,tsx}',
          ],
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
          // Selects ZERO files today — no `src/**/*.rls.test.*` exists, and
          // `npm run test:rls` consequently does nothing. That is not a gap:
          // RLS is tested for real by the pgTAP suites in
          // supabase/tests/rls/*.sql, which run against a fresh Postgres in
          // CI's "Supabase lint + RLS tests" job and currently carry 93
          // assertions. Kept as a defined project so the naming convention
          // stays available, but do not read a green `test:rls` as evidence
          // of anything.
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
