import { readJson, writeJson } from './route-utils.mjs';

const inventory = readJson('route-inventory.json', { routes: [] });
const byRoute = new Map();
for (const row of inventory.routes) {
  const list = byRoute.get(row.route) ?? [];
  list.push(row.file);
  byRoute.set(row.route, list);
}

const findings = [...byRoute.entries()]
  .filter(([, files]) => files.length > 1)
  .map(([route, files]) => ({ id: `ROUTE-DUP-${route}`, severity: 'P1', route, files }));

writeJson('route-duplicate-findings.json', { findings });
if (findings.length > 0) {
  console.error(`Duplicate canonical routes found: ${findings.length}`);
  process.exit(1);
}
console.log('No duplicate canonical routes found.');
