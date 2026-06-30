import { appFiles, routeFromFile, writeJson, writeMarkdown } from './route-utils.mjs';

const routes = appFiles()
  .map((file) => ({ file, route: routeFromFile(file) }))
  .filter((row) => row.route);

writeJson('route-inventory.json', { generated_at: new Date().toISOString(), routes });
writeMarkdown(
  'route-hygiene-report.md',
  `# Route Hygiene Report\n\nGenerated: ${new Date().toISOString()}\n\nRoutes inventoried: ${routes.length}\n`,
);

console.log(`Route inventory written for ${routes.length} routes.`);
