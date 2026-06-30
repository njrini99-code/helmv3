import { readJson, writeJson } from './route-utils.mjs';

const inventory = readJson('route-inventory.json', { routes: [] });

const COACHHELM_SURFACES = [
  '/golf/dashboard/coachhelm',
  '/golf/dashboard/coachhelm/chat',
  '/golf/dashboard/alerts',
  '/golf/dashboard/patterns',
  '/golf/dashboard/insights',
  '/golf/dashboard/intelligence',
  '/golf/dashboard/development',
  '/golf/dashboard/my-insights',
];

const byCanonical = new Map();
for (const row of inventory.routes) {
  const list = byCanonical.get(row.canonicalPath) ?? [];
  list.push(row);
  byCanonical.set(row.canonicalPath, list);
}

const findings = [];

for (const [canonicalPath, rows] of byCanonical.entries()) {
  if (rows.length > 1) {
    findings.push({
      id: `ROUTE-DUP-${canonicalPath.replace(/[^a-zA-Z0-9]+/g, '-')}`,
      type: 'duplicate-canonical',
      severity: 'P1',
      confidence: 'high',
      canonicalPath,
      sourcePaths: rows.map((r) => r.sourcePath),
      detectedBy: 'routes:check:duplicates',
      evidence: `${rows.length} files normalize to the same URL.`,
    });
  }
}

const staticPages = inventory.routes.filter((r) => r.fileType === 'page' && !r.dynamic);
const dynamicPages = inventory.routes.filter((r) => r.fileType === 'page' && r.dynamic);

for (const staticRow of staticPages) {
  const lastSegment = staticRow.canonicalPath.split('/').pop() ?? '';
  for (const dynamicRow of dynamicPages) {
    const parent = dynamicRow.canonicalPath.replace(/\/:[^/]+(\?|\*)?$/, '');
    if (
      parent &&
      staticRow.canonicalPath.startsWith(`${parent}/`) &&
      staticRow.canonicalPath !== dynamicRow.canonicalPath
    ) {
      const staticSuffix = staticRow.canonicalPath.slice(parent.length + 1);
      if (!staticSuffix.includes('/')) {
        findings.push({
          id: `ROUTE-STATIC-DYNAMIC-${staticRow.canonicalPath.replace(/[^a-zA-Z0-9]+/g, '-')}`,
          type: 'static-dynamic-overlap',
          severity: 'P2',
          confidence: 'medium',
          canonicalPath: staticRow.canonicalPath,
          dynamicPath: dynamicRow.canonicalPath,
          detectedBy: 'routes:check:duplicates',
          evidence: `Static segment "${staticSuffix}" sits under dynamic parent ${parent}.`,
        });
      }
    }
  }
}

for (const surface of COACHHELM_SURFACES) {
  const matches = inventory.routes.filter((r) => r.canonicalPath === surface);
  if (matches.length === 1) {
    findings.push({
      id: `ROUTE-COACHHELM-SURFACE-${surface.replace(/[^a-zA-Z0-9]+/g, '-')}`,
      type: 'coachhelm-surface',
      severity: 'P3',
      confidence: 'medium',
      canonicalPath: surface,
      detectedBy: 'routes:check:duplicates',
      evidence: 'CoachHelm surface present — classify as canonical, alias, tab, or needs-decision.',
      classification: 'needs-decision',
    });
  }
}

writeJson('route-duplicate-findings.json', { generated_at: new Date().toISOString(), findings });

const blockers = findings.filter((f) => f.severity === 'P0' || f.severity === 'P1');
if (blockers.length > 0) {
  console.error(`Duplicate canonical route blockers: ${blockers.length}`);
  process.exit(1);
}
console.log(`Duplicate route scan complete: ${findings.length} findings (${blockers.length} blockers).`);
