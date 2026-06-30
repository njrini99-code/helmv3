import { readJson, writeJson } from './route-utils.mjs';

const inventory = readJson('route-inventory.json', { routes: [] });

const POLICY_EXEMPT_PREFIXES = [
  '/api/',
  '/privacy',
  '/terms',
  '/about',
  '/help',
  '/support',
  '/products',
  '/splash',
  '/golf/admin',
  '/admin',
];

const findings = [];

for (const row of inventory.routes) {
  if (row.fileType !== 'page') continue;
  if (row.dynamic) {
    if (row.status !== 'dynamic-needs-sample') continue;
    findings.push({
      id: `ROUTE-DYNAMIC-SAMPLE-${row.canonicalPath.replace(/[^a-zA-Z0-9]+/g, '-')}`,
      type: 'dynamic-needs-sample',
      severity: 'P2',
      confidence: 'medium',
      canonicalPath: row.canonicalPath,
      sourcePath: row.sourcePath,
      detectedBy: 'routes:check:dead',
      evidence: 'Dynamic page route needs a crawler/smoke sample.',
    });
    continue;
  }

  const exempt = POLICY_EXEMPT_PREFIXES.some((p) => row.canonicalPath.startsWith(p));
  if (exempt) continue;

  const hasInbound = row.inboundLinks.length > 0;
  const hasNav = row.navSources.length > 0;
  const hasTests =
    row.testCoverage.playwrightSmoke ||
    row.testCoverage.playwrightCritical ||
    row.testCoverage.routeCrawler;

  if (!hasInbound && !hasNav && !hasTests) {
    findings.push({
      id: `ROUTE-DEAD-CANDIDATE-${row.canonicalPath.replace(/[^a-zA-Z0-9]+/g, '-')}`,
      type: 'candidate-dead',
      severity: 'P3',
      confidence: 'medium',
      canonicalPath: row.canonicalPath,
      sourcePath: row.sourcePath,
      detectedBy: 'routes:check:dead',
      evidence: 'Page has no inbound links, nav references, or Playwright coverage.',
      suggestedResolution: 'needs-decision',
    });
  }

  if (/\/(old|legacy|deprecated|backup|copy)(\/|$)/i.test(row.canonicalPath)) {
    findings.push({
      id: `ROUTE-LEGACY-${row.canonicalPath.replace(/[^a-zA-Z0-9]+/g, '-')}`,
      type: 'legacy-alias',
      severity: 'P3',
      confidence: 'high',
      canonicalPath: row.canonicalPath,
      sourcePath: row.sourcePath,
      detectedBy: 'routes:check:dead',
      evidence: 'Path segment suggests legacy/deprecated route.',
    });
  }
}

writeJson('route-dead-candidate-findings.json', { generated_at: new Date().toISOString(), findings });
console.log(`Dead-route candidate scan complete: ${findings.length} advisory findings.`);
