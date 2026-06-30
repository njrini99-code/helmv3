import { readJson, writeJson } from './route-utils.mjs';

const inventory = readJson('route-inventory.json', { routes: [] });
const findings = inventory.routes
  .filter((row) => /\/(old|legacy|deprecated|backup|copy)(\/|$)/i.test(row.route))
  .map((row) => ({ id: 'ROUTE-DEAD-CANDIDATE', severity: 'P3', route: row.route, file: row.file }));

writeJson('route-dead-candidate-findings.json', { findings });
console.log(`Dead-route candidate scan complete: ${findings.length} advisory findings.`);
