import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The browser UI check (e2e/clubhouse-ui-check.spec.ts, dsx-09) covers every screen that is live in production, for each
// role: every address in CH_REBUILT_ROUTES has a row in e2e/clubhouse-ui-check/screens.ts, or a reason here.
const NOT_A_SCREEN = new Map([
  ['/golf/dashboard/settings/notifications', 'a section of Settings, opened from the Settings row'],
  ['/golf/dashboard/settings/coaching-intelligence', 'a section of Settings, opened from the Settings row'],
  ['/golf/dashboard/rounds/recover', 'the unfinished-round recovery step of logging a round; no standalone fixture'],
]);

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

function rebuiltRoutes() {
  const src = read('src/clubhouse/shell/nav.ts');
  const settings = [...src.match(/const SETTINGS_ROUTES = \[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const block = src.slice(src.indexOf('export const CH_REBUILT_ROUTES'));
  const body = block.slice(0, block.indexOf('};'));
  const role = (name) => {
    const at = body.indexOf(`${name}: [`);
    const list = body.slice(at, body.indexOf(']', at) + 1);
    return [...[...list.matchAll(/'([^']+)'/g)].map((m) => m[1]), ...(list.includes('...SETTINGS_ROUTES') ? settings : [])];
  };
  return { coach: role('coach'), player: role('player') };
}

function uiCheckRows() {
  const src = read('e2e/clubhouse-ui-check/screens.ts');
  return [...src.matchAll(/s\('(coach|player)', '[\w-]+', '([^']+)', '[^']+'\)/g)].map((m) => ({ role: m[1], route: m[2] }));
}

test('every live coach and player screen has a UI check row', () => {
  const rows = uiCheckRows();
  assert.ok(rows.length >= 20, `read ${rows.length} rows; the screens.ts shape changed`);
  const routes = rebuiltRoutes();
  assert.ok(routes.coach.length > 10 && routes.player.length > 10, 'CH_REBUILT_ROUTES shape changed');
  const missing = [];
  for (const role of ['coach', 'player']) {
    for (const route of routes[role]) {
      if (NOT_A_SCREEN.has(route)) continue;
      if (!rows.some((r) => r.role === role && r.route === route)) missing.push(`${role} ${route}`);
    }
  }
  assert.deepEqual(missing, [], 'add a row to e2e/clubhouse-ui-check/screens.ts for each');
});

test('every UI check row is a live address for its role', () => {
  const routes = rebuiltRoutes();
  const stray = uiCheckRows().filter((r) => !routes[r.role].includes(r.route)).map((r) => `${r.role} ${r.route}`);
  assert.deepEqual(stray, []);
});
