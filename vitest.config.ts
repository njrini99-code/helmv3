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
 *   integration  — *.integration.test.{ts,tsx}, longer timeout
 *   rls          — *.rls.test.{ts,tsx}, longer timeout
 *   business     — *.contract.test.{ts,tsx}, advisory product-truth contracts
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
    // Root-level include/exclude is the fallback when no project filter
    // is given (e.g. `vitest --list-all`). The per-project blocks below
    // override these.
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
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
        plugins: [react()],
        resolve: {
          alias: {
            '@': path.resolve(__dirname, './src'),
            'server-only': path.resolve(__dirname, './src/test/stubs/server-only.ts'),
          },
        },
        test: {
          ...sharedTestConfig,
          name: 'business',
          include: ['src/**/*.contract.test.{ts,tsx}'],
          exclude: ['node_modules', '.next'],
          testTimeout: 30_000,
        },
      },
    ],
  },
});
