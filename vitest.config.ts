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
            // The icon-only-button accessible-name guard. Promoted because it was
            // not merely unrun — it was RIGHT, and silent. While it executed under
            // nothing, an unlabeled icon-only dismiss button shipped in
            // lifting/dashboard/import/import-client.tsx; a screen-reader user
            // heard "button" with no indication of what it did. Fixed in the same
            // change, and this line is what stops it coming back.
            //
            // Its own four self-checks (detection of labels vs placeholders,
            // icon-only vs icon+text, and an end-to-end flag-one/pass-one) mean a
            // green run here is evidence the detector works, not just that it
            // found nothing.
            'scripts/__tests__/icon-only-button-aria-label.test.mjs',
            // Guards the accessible-name derivation inside ui-audit-golf.mjs's
            // PROBE. It has to fail in BOTH directions: too permissive loses the
            // real /documents dead end, too strict resurrects the 18 phantom
            // findings that a collapsed <details> produced on 2026-08-15.
            'scripts/__tests__/ui-audit-accname.test.mjs',
            // Promoted 2026-08 (issue #1194) — the second wave of
            // previously-dead `node --test` guards, all verified passing
            // before promotion. Named individually rather than swept in by
            // a glob for the same reason as their neighbours above: the
            // other 20 files still in scripts/__tests__/ FAIL today and
            // need per-file triage before they can be trusted in CI.
            //
            // Merge-artifact guard for baseball server actions: duplicated
            // top-level return keys, dead consecutive duplicate returns,
            // stale "types will be regenerated" comments.
            'scripts/__tests__/baseball-action-integrity.test.mjs',
            // Blocks reintroduction of the retired
            // /baseball/dashboard/stats/games/new href now that middleware
            // redirects it to /stats/games/create.
            'scripts/__tests__/baseball-stale-route-links.test.mjs',
            // Wave W7A nav primitives: <Breadcrumb>/<SecondaryNav> stay the
            // canonical deep-route wayfinding surfaces.
            'scripts/__tests__/breadcrumb-nav.test.mjs',
            // Tier-1 motion-vocabulary files stay bound to the canonical
            // v3 motion library (no locally re-declared eases/durations).
            'scripts/__tests__/canonical-motion-tokens.test.mjs',
            // Wave W5A chart primitives (<ChartShell>/<ChartTooltip>/
            // <ChartLegend>/CHART_PALETTE) keep existing and exporting.
            'scripts/__tests__/chartshell-exists.test.mjs',
            // Migration-ledger reconciliation: every file on disk has a
            // ledger entry and vice versa.
            'scripts/__tests__/check-migration-ledger.test.mjs',
            // Migration filename version prefixes are unique and
            // well-formed (the #220 duplicate-version hazard class).
            'scripts/__tests__/check-migration-versions.test.mjs',
            // Required-env guard: canonical Supabase vars present and the
            // URL isn't a placeholder, scoped per Vercel environment.
            'scripts/__tests__/check-required-env.test.mjs',
            // Every route-level error.tsx in golf/baseball routes Sentry
            // errors through the canonical error-boundary wrapper instead
            // of rendering {error.message} (and leaking Supabase errors).
            'scripts/__tests__/error-boundary-coverage.test.mjs',
            // Form-primitive a11y: Select-family labels are associated to
            // their trigger via useId()/htmlFor, and every interactive form
            // control carries a focus-visible ring.
            'scripts/__tests__/form-a11y.test.mjs',
            // Every golf page.tsx route has a sibling loading.tsx AND
            // error.tsx (directly or via a covering parent segment) — the
            // "no blank page during navigation" gate.
            'scripts/__tests__/loading-error-pair-coverage.test.mjs',
            // CoachHelm card-level empty states must route through the
            // shared <EmptyState /> primitive, not bare <p>No X</p> markup.
            'scripts/__tests__/no-bare-empty-text.test.mjs',
            // Wave W2B card consolidation: GlassCard/GlassStatCard/
            // PremiumGlassCard stay deleted and unimported.
            'scripts/__tests__/no-glasscard-imports.test.mjs',
            // The golf /stats surface stays bound to the canonical v3
            // motion library — no legacy IOS_EASE or ad-hoc springs.
            'scripts/__tests__/no-ios-ease-stats.test.mjs',
            // Wave W2C skeleton consolidation: the three legacy skeleton
            // modules stay deleted and unimported.
            'scripts/__tests__/no-legacy-skeleton-imports.test.mjs',
            // The 2026-05-28 `s/translate/tranwarm/g` typo-squat class
            // never reappears (it silently killed 203 Tailwind utilities).
            'scripts/__tests__/no-tranwarm-typo.test.mjs',
            // Wave W2F: hand-rolled Dropdown/Toast primitives stay retired
            // in favor of Radix DropdownMenu + Sonner.
            'scripts/__tests__/radix-dropdown-sonner.test.mjs',
            // Smoke test for the Review Gate ast-grep rule pack (bare table
            // names, process.env in edge functions, service-role leaks)
            // against real src/ plus the synthetic positive fixture.
            'scripts/__tests__/review-gate-rules.test.mjs',
            // Wave W2E header consolidation: canonical PageHeader still
            // ships its four variants, and the six sibling header modules
            // stay deleted or thinned to shims.
            'scripts/__tests__/single-pageheader.test.mjs',
            // tokens.css and globals.css never redeclare the same CSS
            // custom property inside :root (the W0 silent-override class).
            'scripts/__tests__/token-files-no-conflict.test.mjs',
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
