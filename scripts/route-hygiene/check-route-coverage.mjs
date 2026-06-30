import { readJson, writeJson } from './route-utils.mjs';

const inventory = readJson('route-inventory.json', { routes: [] });
const critical = [
  '/',
  '/golf',
  '/golf/dashboard',
  '/golf/dashboard/stats',
  '/golf/dashboard/rounds/new',
  '/golf/dashboard/coachhelm',
  '/baseball',
  '/baseball/dashboard',
];
const existing = new Set(inventory.routes.map((row) => row.route));
const findings = critical
  .filter((route) => !existing.has(route))
  .map((route) => ({ id: 'ROUTE-CRITICAL-MISSING', severity: 'P1', route }));

writeJson('route-coverage-findings.json', { findings });
if (findings.length > 0) {
  console.error(`Critical routes missing from inventory: ${findings.length}`);
  process.exit(1);
}
console.log('Critical route inventory coverage is present.');
