import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  classifyArea,
  classifyAuthExpectation,
  classifyProduct,
  classifyRole,
  normalizeAppFile,
} from './route-normalizer.mjs';
import {
  REPO_ROOT,
  appFiles,
  canonicalRouteHref,
  dirHasFile,
  e2eFiles,
  extractHrefLikeStrings,
  layoutFiles,
  readSource,
  sourceFiles,
  writeJson,
  writeMarkdown,
} from './route-utils.mjs';

const NAV_SOURCE_FILES = [
  'src/components/golf/layout/GolfSidebar.tsx',
  'src/components/layout/sidebar.tsx',
  'src/app/golf/(dashboard)/FairwayDashboardShell.tsx',
];

const INTENTIONAL_HIDDEN_PREFIXES = [
  '/api/',
  '/golf/admin',
  '/admin',
];

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

function layoutFlagsFor(sourcePath) {
  return {
    hasLayout: dirHasFile(sourcePath, 'layout.tsx') || dirHasFile(sourcePath, 'layout.ts'),
    hasLoading: dirHasFile(sourcePath, 'loading.tsx') || dirHasFile(sourcePath, 'loading.ts'),
    hasErrorBoundary: dirHasFile(sourcePath, 'error.tsx') || dirHasFile(sourcePath, 'error.ts'),
    hasNotFound: dirHasFile(sourcePath, 'not-found.tsx') || dirHasFile(sourcePath, 'not-found.ts'),
  };
}

function collectNavHrefs() {
  const navMap = new Map();
  for (const file of NAV_SOURCE_FILES) {
    if (!existsSync(join(REPO_ROOT, file))) continue;
    const source = readSource(file);
    for (const href of extractHrefLikeStrings(source)) {
      const path = canonicalRouteHref(href);
      const list = navMap.get(path) ?? [];
      if (!list.includes(file)) list.push(file);
      navMap.set(path, list);
    }
  }
  return navMap;
}

function collectTestCoverage() {
  const coverage = new Map();
  for (const file of e2eFiles()) {
    const source = readSource(file);
    const isSmoke = file.includes('/smoke/');
    const isCritical = file.includes('/critical/');
    const isCrawler = file.includes('/route-crawler/');
    for (const match of source.matchAll(/["'`](\/[^"'`]+)["'`]/g)) {
      const path = canonicalRouteHref(match[1]);
      const row = coverage.get(path) ?? {
        playwrightSmoke: false,
        playwrightCritical: false,
        routeCrawler: false,
        businessContract: false,
      };
      if (isSmoke) row.playwrightSmoke = true;
      if (isCritical) row.playwrightCritical = true;
      if (isCrawler) row.routeCrawler = true;
      coverage.set(path, row);
    }
  }
  return coverage;
}

function collectLinkGraph() {
  const inbound = new Map();
  const outbound = new Map();

  for (const file of sourceFiles()) {
    const source = readSource(file);
    const hrefs = extractHrefLikeStrings(source);
    if (hrefs.length === 0) continue;
    outbound.set(file, hrefs.map(canonicalRouteHref));
    for (const href of hrefs) {
      const path = canonicalRouteHref(href);
      const list = inbound.get(path) ?? [];
      if (!list.includes(file)) list.push(file);
      inbound.set(path, list);
    }
  }
  return { inbound, outbound };
}

function initialStatus(entry, inboundLinks, navSources, testCoverage) {
  const notes = [];
  let status = 'active';
  let severity = 'none';

  if (entry.dynamic && !testCoverage.routeCrawler && !testCoverage.playwrightSmoke && !testCoverage.playwrightCritical) {
    status = 'dynamic-needs-sample';
    severity = 'P2';
    notes.push('Dynamic route has no Playwright sample in smoke/critical/crawler tests.');
  }

  if (
    inboundLinks.length === 0 &&
    navSources.length === 0 &&
    !entry.dynamic &&
    !INTENTIONAL_HIDDEN_PREFIXES.some((p) => entry.canonicalPath.startsWith(p))
  ) {
    status = 'candidate-dead';
    severity = 'P3';
    notes.push('No inbound links or nav references found.');
  }

  if (COACHHELM_SURFACES.includes(entry.canonicalPath)) {
    notes.push('CoachHelm surface — classify as canonical, alias, tab, or needs-decision.');
  }

  return { status, severity, notes };
}

const navMap = collectNavHrefs();
const testCoverageMap = collectTestCoverage();
const { inbound: inboundMap } = collectLinkGraph();

const routes = appFiles()
  .map((file) => {
    const normalized = normalizeAppFile(file);
    if (!normalized) return null;

    const product = classifyProduct(normalized.canonicalPath);
    const area = classifyArea(normalized.canonicalPath, normalized.routeGroupSegments);
    const role = classifyRole(normalized.canonicalPath, area);
    const authExpectation = classifyAuthExpectation(area, normalized.dynamic);
    const layoutFlags = layoutFlagsFor(normalized.sourcePath);
    const inboundLinks = inboundMap.get(normalized.canonicalPath) ?? [];
    const navSources = navMap.get(normalized.canonicalPath) ?? [];
    const testCoverage = testCoverageMap.get(normalized.canonicalPath) ?? {
      playwrightSmoke: false,
      playwrightCritical: false,
      routeCrawler: false,
      businessContract: false,
    };
    const { status, severity, notes } = initialStatus(
      normalized,
      inboundLinks,
      navSources,
      testCoverage,
    );

    return {
      canonicalPath: normalized.canonicalPath,
      sourcePath: normalized.sourcePath,
      fileType: normalized.fileType,
      product,
      area,
      role,
      authExpectation,
      dynamic: normalized.dynamic,
      dynamicParams: normalized.dynamicParams,
      routeGroupSegments: normalized.routeGroupSegments,
      privateSegments: normalized.privateSegments,
      ...layoutFlags,
      inboundLinks,
      outboundLinks: [],
      navSources,
      testCoverage,
      status,
      severity,
      notes,
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.canonicalPath.localeCompare(b.canonicalPath));

const inventory = {
  generated_at: new Date().toISOString(),
  route_count: routes.length,
  routes,
};

writeJson('route-inventory.json', inventory);

const mdLines = [
  '# Route Inventory',
  '',
  `Generated: ${inventory.generated_at}`,
  '',
  `Total routes: ${routes.length}`,
  '',
  '| Canonical path | Product | Area | Type | Dynamic | Status |',
  '| --- | --- | --- | --- | --- | --- |',
];

for (const row of routes) {
  mdLines.push(
    `| \`${row.canonicalPath}\` | ${row.product} | ${row.area} | ${row.fileType} | ${row.dynamic ? 'yes' : 'no'} | ${row.status} |`,
  );
}

writeMarkdown('route-inventory.md', mdLines.join('\n'));
console.log(`Route inventory written for ${routes.length} routes.`);
