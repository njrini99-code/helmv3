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
const routes = new Set(inventory.routes.map((row) => row.route));
const findings = [];

for (const file of sourceFiles()) {
  const source = readSource(file);
  for (const href of extractHrefLikeStrings(source)) {
    if (href.includes('/(')) {
      findings.push({ id: 'ROUTE-GROUP-IN-HREF', severity: 'P1', file, href });
      continue;
    }
    const routeHref = canonicalRouteHref(href);
    if (/^\/(api|_next|assets|images)/.test(href)) continue;
    if (publicAssetExists(href)) continue;
    if (href.includes('[') || href.includes('${') || href.includes(':')) continue;
    if (!routes.has(routeHref) && !routes.has(routeHref.replace(/\/$/, ''))) {
      findings.push({ id: 'ROUTE-STALE-LINK', severity: 'P2', file, href });
    }
  }
}

writeJson('route-stale-link-findings.json', { findings });
const blockers = findings.filter((finding) => finding.severity === 'P1');
if (blockers.length > 0) {
  console.error(`P1 stale route findings found: ${blockers.length}`);
  process.exit(1);
}
console.log(`Route stale-link scan complete: ${findings.length} advisory findings.`);
