import { readJson, writeJson } from './route-utils.mjs';

const inventory = readJson('route-inventory.json', { routes: [] });
const routeByPath = new Map(inventory.routes.map((r) => [r.canonicalPath, r]));

const CRITICAL_ROUTES = [
  '/',
  '/golf',
  '/golf/login',
  '/golf/signup',
  '/golf/coach',
  '/golf/player',
  '/golf/dashboard',
  '/golf/dashboard/stats',
  '/golf/dashboard/rounds',
  '/golf/dashboard/rounds/create',
  '/golf/dashboard/coachhelm',
  '/golf/dashboard/coachhelm/chat',
  '/golf/dashboard/roster',
  '/golf/dashboard/messages',
  '/baseball',
  '/baseball/login',
  '/baseball/signup',
  '/baseball/coach-onboarding',
  '/baseball/player',
  '/baseball/dashboard',
  '/baseball/player/timeline',
  '/baseball/packet/:token',
];

const findings = [];

for (const route of CRITICAL_ROUTES) {
  const row = routeByPath.get(route);
  if (!row) {
    findings.push({
      id: `ROUTE-CRITICAL-MISSING-${route.replace(/[^a-zA-Z0-9]+/g, '-')}`,
      type: 'coverage-gap',
      severity: 'P1',
      confidence: 'high',
      canonicalPath: route,
      detectedBy: 'routes:check:coverage',
      evidence: 'Critical route missing from App Router inventory.',
    });
    continue;
  }

  const covered =
    row.testCoverage.playwrightSmoke ||
    row.testCoverage.playwrightCritical ||
    row.testCoverage.routeCrawler ||
    row.testCoverage.businessContract ||
    row.notes.some((n) => n.includes('needs-decision'));

  if (!covered && row.authExpectation !== 'public') {
    findings.push({
      id: `ROUTE-CRITICAL-NO-TEST-${route.replace(/[^a-zA-Z0-9]+/g, '-')}`,
      type: 'coverage-gap',
      severity: 'P2',
      confidence: 'medium',
      canonicalPath: route,
      detectedBy: 'routes:check:coverage',
      evidence: 'Critical protected route has no smoke/critical/crawler coverage.',
    });
  }

  if (row.dynamic && !row.testCoverage.routeCrawler && !row.testCoverage.playwrightSmoke) {
    findings.push({
      id: `ROUTE-DYNAMIC-NO-SAMPLE-${route.replace(/[^a-zA-Z0-9]+/g, '-')}`,
      type: 'dynamic-needs-sample',
      severity: 'P2',
      confidence: 'medium',
      canonicalPath: route,
      detectedBy: 'routes:check:coverage',
      evidence: 'Dynamic critical route needs a Playwright sample ID.',
    });
  }
}

for (const row of inventory.routes) {
  if (row.navSources.length > 0) {
    const covered =
      row.testCoverage.playwrightSmoke ||
      row.testCoverage.playwrightCritical ||
      row.testCoverage.routeCrawler;
    if (!covered && row.authExpectation === 'protected') {
      findings.push({
        id: `ROUTE-NAV-NO-TEST-${row.canonicalPath.replace(/[^a-zA-Z0-9]+/g, '-')}`,
        type: 'nav-coverage-gap',
        severity: 'P2',
        confidence: 'low',
        canonicalPath: row.canonicalPath,
        navSources: row.navSources,
        detectedBy: 'routes:check:coverage',
        evidence: 'Primary nav route lacks smoke/critical/crawler coverage.',
      });
    }
  }
}

writeJson('route-coverage-report.json', { generated_at: new Date().toISOString(), findings });

const blockers = findings.filter((f) => f.severity === 'P0' || f.severity === 'P1');
if (blockers.length > 0) {
  console.error(`Critical route coverage blockers: ${blockers.length}`);
  process.exit(1);
}
console.log(`Route coverage scan complete: ${findings.length} findings (${blockers.length} blockers).`);
