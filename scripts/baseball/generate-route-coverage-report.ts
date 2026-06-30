// =============================================================================
// scripts/baseball/generate-route-coverage-report.ts
//
// Standalone generator for docs/operations/generated/route-coverage-report.json
// — the canonical, regenerable snapshot of the BaseballHelm route/shell
// contract (#374). Imports the SAME analysis core
// (src/lib/baseball/route-contract.ts) the advisory Vitest contract test
// (src/app/baseball/actions/__tests__/route-shell-contract.test.ts) consumes,
// so the report and the test can never disagree about what counts as a gap.
//
// Run with: npm run baseball:route-coverage
//
// Gap semantics + the advisory -> hard-gate promotion criteria:
//   docs/operations/baseball-route-contract-runbook.md
// =============================================================================

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeRouteContract,
  collectDeclaredHrefs,
} from '@/lib/baseball/route-contract';
import {
  buildBaseballRouteInventory,
  buildGuardedRoutes,
  DYNAMIC_ROUTE_SAMPLES,
  REDIRECT_ALIAS_MANIFEST,
} from '@/test/helpers/baseball-route-inventory';

// import.meta.url (not __dirname) — the repo's package.json sets
// "type": "module", so plain CJS `__dirname` is unavailable under `tsx`.
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(CURRENT_DIR, '..', '..');
const OUT_DIR = join(REPO_ROOT, 'docs', 'operations', 'generated');
const OUT_FILE = join(OUT_DIR, 'route-coverage-report.json');

function main(): void {
  const declared = collectDeclaredHrefs();
  const disk = buildBaseballRouteInventory();
  const guardedRoutes = buildGuardedRoutes();

  const result = analyzeRouteContract({
    declared,
    disk,
    aliases: REDIRECT_ALIAS_MANIFEST,
    dynamicSamples: DYNAMIC_ROUTE_SAMPLES,
    guardedRoutes,
  });

  const totalGaps = Object.values(result.counts).reduce((sum, n) => sum + n, 0);

  const report = {
    generatedAt: new Date().toISOString(),
    runbook: 'docs/operations/baseball-route-contract-runbook.md',
    counts: result.counts,
    totalGapCount: totalGaps,
    gaps: {
      staleLinks: result.staleLinks,
      orphanRoutes: result.orphanRoutes,
      staticHubTabs: result.staticHubTabs,
      missingDynamicSamples: result.missingDynamicSamples,
      guardWithoutNavGating: result.guardWithoutNavGating,
    },
    aliasManifest: REDIRECT_ALIAS_MANIFEST,
    dynamicRouteSamples: DYNAMIC_ROUTE_SAMPLES,
    meta: result.meta,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(
    `[generate-route-coverage-report] wrote docs/operations/generated/route-coverage-report.json ` +
      `(${disk.length} disk routes, ${declared.length} declared hrefs, ${totalGaps} total gap(s) across 5 buckets)`,
  );
}

main();
