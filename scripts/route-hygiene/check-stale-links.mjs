import { routeExistsInInventory } from './route-normalizer.mjs';
import {
  canonicalRouteHref,
  extractHrefLikeStrings,
  publicAssetExists,
  readJson,
  readSource,
  sourceFiles,
  writeJson,
} from './route-utils.mjs';

const inventory = readJson('route-inventory.json', { routes: [] });
const staticRoutes = new Set(inventory.routes.filter((r) => !r.dynamic).map((r) => r.canonicalPath));
const dynamicRoutes = inventory.routes.filter((r) => r.dynamic);
const findings = [];

const ONBOARDING_PAIRS = [
  ['/golf/coach', '/golf/coach-onboarding'],
  ['/baseball/coach', '/baseball/coach-onboarding'],
  ['/golf/player', '/golf/player-onboarding'],
  ['/baseball/player', '/baseball/player-onboarding'],
];

for (const file of sourceFiles()) {
  const source = readSource(file);
  for (const href of extractHrefLikeStrings(source)) {
    if (href.includes('/(')) {
      findings.push({
        id: 'ROUTE-GROUP-IN-HREF',
        type: 'route-group-leak',
        severity: 'P1',
        confidence: 'high',
        file,
        href,
        detectedBy: 'routes:check:links',
        evidence: 'Route group folder name appears in customer-facing href.',
      });
      continue;
    }

    const routeHref = canonicalRouteHref(href);
    if (/^\/(api|_next|assets|images)/.test(href)) continue;
    if (publicAssetExists(href)) continue;
    if (href.includes('${') || href.includes('`')) continue;
    if (href.includes('[')) continue;

    if (!routeExistsInInventory(routeHref, staticRoutes, dynamicRoutes)) {
      const isOnboardingDrift = ONBOARDING_PAIRS.some(
        ([a, b]) => routeHref === a || routeHref === b,
      );
      findings.push({
        id: `ROUTE-STALE-LINK-${routeHref.replace(/[^a-zA-Z0-9]+/g, '-')}`,
        type: isOnboardingDrift ? 'onboarding-drift' : 'stale-link',
        severity: isOnboardingDrift ? 'P2' : 'P2',
        confidence: 'medium',
        file,
        href,
        canonicalPath: routeHref,
        detectedBy: 'routes:check:links',
        evidence: `Link target ${routeHref} not found in route inventory.`,
      });
    }
  }
}

writeJson('route-link-report.json', {
  generated_at: new Date().toISOString(),
  findings,
});
writeJson('route-stale-link-findings.json', { findings });

const blockers = findings.filter((f) => f.severity === 'P0' || f.severity === 'P1');
if (blockers.length > 0) {
  console.error(`P0/P1 stale route findings: ${blockers.length}`);
  process.exit(1);
}
console.log(`Route stale-link scan complete: ${findings.length} findings (${blockers.length} blockers).`);
