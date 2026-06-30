import { extractHrefLikeStrings, readSource, sourceFiles, writeJson } from './route-utils.mjs';

const findings = [];

for (const file of sourceFiles()) {
  const source = readSource(file);
  const hrefs = extractHrefLikeStrings(source);
  if (file.startsWith('src/app/golf/') || file.startsWith('src/components/golf/') || file.startsWith('src/lib/golf/')) {
    for (const href of hrefs.filter((href) => href.startsWith('/baseball/login') || href.startsWith('/baseball/dashboard'))) {
      findings.push({ id: 'ROUTE-GOLF-TO-BASEBALL', severity: 'P1', file, href });
    }
  }
  if (file.startsWith('src/app/baseball/') || file.startsWith('src/components/baseball/') || file.startsWith('src/lib/baseball/')) {
    for (const href of hrefs.filter((href) => href.startsWith('/golf/login') || href.startsWith('/golf/dashboard'))) {
      findings.push({ id: 'ROUTE-BASEBALL-TO-GOLF', severity: 'P1', file, href });
    }
  }
}

writeJson('route-boundary-findings.json', { findings });
if (findings.length > 0) {
  console.error(`Route product-boundary blockers found: ${findings.length}`);
  process.exit(1);
}
console.log('No Golf/Baseball route-boundary blockers found.');
