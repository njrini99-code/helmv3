import { extractHrefLikeStrings, readSource, sourceFiles, writeJson } from './route-utils.mjs';

const GOLF_SCAN_PREFIXES = [
  'src/app/golf/',
  'src/components/golf/',
  'src/lib/golf/',
  'src/lib/coachhelm/',
];

const BASEBALL_SCAN_PREFIXES = [
  'src/app/baseball/',
  'src/components/baseball/',
  'src/lib/baseball/',
];

const GOLF_HREF_BLOCKERS = ['/baseball/login', '/baseball/dashboard', '/baseball/signup'];
const GOLF_IMPORT_BLOCKERS = ['src/app/baseball', 'src/lib/baseball', '@/app/baseball', '@/lib/baseball'];

const BASEBALL_HREF_BLOCKERS = ['/golf/login', '/golf/dashboard', '/golf/signup'];
const BASEBALL_IMPORT_BLOCKERS = ['src/app/golf', 'src/lib/golf', '@/app/golf', '@/lib/golf'];

const findings = [];

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function hasImportReference(source, pattern) {
  const code = stripComments(source);
  const importRe = new RegExp(`(?:import|from)\\s+['"\`][^'"\`]*${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
  return importRe.test(code) || code.includes(`@${pattern.replace('src/', '')}`);
}

function scanFile(file, hrefBlockers, importBlockers, idPrefix, product) {
  const source = readSource(file);
  const hrefs = extractHrefLikeStrings(source);

  for (const pattern of hrefBlockers) {
    for (const href of hrefs.filter((h) => h.startsWith(pattern))) {
      findings.push({
        id: `${idPrefix}-HREF`,
        type: 'product-boundary',
        severity: 'P1',
        confidence: 'high',
        file,
        href,
        product,
        detectedBy: 'routes:check:boundaries',
        evidence: `${product} file links to wrong-sport route ${href}.`,
      });
    }
  }

  for (const pattern of importBlockers) {
    if (hasImportReference(source, pattern)) {
      findings.push({
        id: `${idPrefix}-IMPORT`,
        type: 'product-boundary',
        severity: 'P1',
        confidence: 'high',
        file,
        pattern,
        product,
        detectedBy: 'routes:check:boundaries',
        evidence: `${product} file imports from ${pattern}.`,
      });
    }
  }
}

for (const file of sourceFiles()) {
  if (GOLF_SCAN_PREFIXES.some((p) => file.startsWith(p))) {
    scanFile(file, GOLF_HREF_BLOCKERS, GOLF_IMPORT_BLOCKERS, 'ROUTE-GOLF-TO-BASEBALL', 'golf');
  }
  if (BASEBALL_SCAN_PREFIXES.some((p) => file.startsWith(p))) {
    scanFile(file, BASEBALL_HREF_BLOCKERS, BASEBALL_IMPORT_BLOCKERS, 'ROUTE-BASEBALL-TO-GOLF', 'baseball');
  }
}

writeJson('route-boundary-findings.json', { generated_at: new Date().toISOString(), findings });

const blockers = findings.filter((f) => f.severity === 'P0' || f.severity === 'P1');
if (blockers.length > 0) {
  console.error(`Route product-boundary blockers: ${blockers.length}`);
  process.exit(1);
}
console.log('No Golf/Baseball route-boundary blockers found.');
