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
    // Root-level include/exclude is the shared fallback when no project filter
    // is given. The per-project blocks below override these for named runs.
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    ],
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
            // The demo-seed guards. Same rationale as the secrets guard above:
            // they were written for `node --test` and so ran under nothing, and
            // what they protect — a script that creates auth users and deletes
            // rows against a live project — is exactly the kind of thing that
            // must not be guarded by a test nobody executes.
            'scripts/__tests__/baseball-demo-seed-contract.test.mjs',
            'scripts/__tests__/verify-baseball-demo-coverage-honesty.test.ts',
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
