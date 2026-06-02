#!/usr/bin/env node
/**
 * ============================================================================
 * refresh-landed — "once a page lands, replace its screenshot with the new one"
 * ----------------------------------------------------------------------------
 * As each route's redesign LANDS, re-capture it against the REDESIGN-ON app and
 * swap its screenshot in the inventory the atlas reads from — so the visual
 * inventory tracks the rollout instead of going stale on the legacy shots.
 *
 *   node scripts/ui-intelligence/refresh-landed.mjs <route-or-folder> [...more]
 *   # examples:
 *   #   node scripts/ui-intelligence/refresh-landed.mjs /golf/dashboard/analytics/coachhelm
 *   #   node scripts/ui-intelligence/refresh-landed.mjs coach/analytics/coachhelm coach/intelligence
 *   #   node scripts/ui-intelligence/refresh-landed.mjs --redesigned   # re-shoot every already-tagged route
 *
 * What it does, per matched route:
 *   1. ensures a NEXT_PUBLIC_REDESIGN=1 dev server is up (boots one if needed),
 *   2. refreshes the player/coach auth states (npm run ui:auth),
 *   3. re-captures ONLY the matched routes (UI_ROUTE_FILTER → ui:screenshots:capture),
 *      overwriting ui-intelligence/screenshots/desktop/<folder>/full-page.png,
 *   4. tags those catalog.json entries `redesigned:true` + `redesignedAt`,
 *   5. regenerates the atlas (npm run ui:atlas) so it shows the new shots.
 *
 * Pure tooling — never touches src/ or app behavior.
 * ========================================================================== */

import { execSync, spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CATALOG = path.join(ROOT, 'ui-intelligence', 'catalog.json');
const BASE = process.env.GOLFHELM_BASE_URL || 'http://localhost:3000';
const READY_URL = `${BASE}/golf/login`;

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/ui-intelligence/refresh-landed.mjs <route-or-folder>... | --redesigned | --all');
  process.exit(1);
}

function readCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
}

/** Resolve CLI args → the catalog entries they match (by route path or folder substring). */
function matchEntries(catalog) {
  if (args.includes('--all')) return catalog.filter((e) => e.enabled !== false);
  if (args.includes('--redesigned')) return catalog.filter((e) => e.redesigned === true);
  const needles = args.filter((a) => !a.startsWith('--')).map((a) => a.replace(/\/+$/, ''));
  return catalog.filter((e) =>
    needles.some(
      (n) =>
        e.route === n ||
        e.route === `/${n}` ||
        (e.folder && e.folder.includes(n)) ||
        (e.route && e.route.includes(n)),
    ),
  );
}

function httpOk(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(4000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureServer() {
  if (await httpOk(READY_URL)) {
    console.log('• dev server already up (assuming NEXT_PUBLIC_REDESIGN=1)');
    return null;
  }
  console.log('• no server on :3000 — booting NEXT_PUBLIC_REDESIGN=1 dev …');
  const child = spawn('npm', ['run', 'dev'], {
    cwd: ROOT,
    env: { ...process.env, NEXT_PUBLIC_REDESIGN: '1' },
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  for (let i = 0; i < 60; i++) {
    if (await httpOk(READY_URL)) {
      console.log(`• dev server ready (~${i * 3}s)`);
      return child;
    }
    await sleep(3000);
  }
  throw new Error('dev server did not become ready in 180s');
}

function run(cmd, env = {}) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
}

async function main() {
  const catalog = readCatalog();
  const matched = matchEntries(catalog);
  if (matched.length === 0) {
    console.error(`No catalog routes matched: ${args.join(' ')}`);
    process.exit(1);
  }
  console.log(`Refreshing ${matched.length} landed route(s):`);
  for (const e of matched) console.log(`   ${e.route}  [${e.role}]  → ${e.screenshotPath}`);

  const booted = await ensureServer();

  // Refresh auth so coach/player captures aren't redirected to login.
  run('npm run ui:auth');

  // Re-capture ONLY the matched routes (folder substrings → UI_ROUTE_FILTER).
  const filter = [...new Set(matched.map((e) => e.folder))].join(',');
  run('npm run ui:screenshots:capture', { UI_ROUTE_FILTER: filter });

  // Tag the refreshed entries as redesigned (the capture step already rewrote
  // capturedAt/height/screenshotPath; we add the redesign provenance on top).
  const after = readCatalog();
  const stampedAt = new Date().toISOString();
  const matchedRoutes = new Set(matched.map((e) => e.route));
  for (const e of after) {
    if (matchedRoutes.has(e.route)) {
      e.redesigned = true;
      e.redesignedAt = stampedAt;
    }
  }
  fs.writeFileSync(CATALOG, JSON.stringify(after, null, 2) + '\n');
  console.log(`• tagged ${matchedRoutes.size} catalog entr${matchedRoutes.size === 1 ? 'y' : 'ies'} redesigned:true`);

  // Rebuild the atlas so it shows the new shots.
  run('npm run ui:atlas');

  if (booted) {
    console.log('• (left the auto-booted dev server running for reuse)');
  }
  console.log('\n✓ Landed routes refreshed:');
  for (const e of after.filter((x) => matchedRoutes.has(x.route))) {
    console.log(`   ${e.route}  → ${e.screenshotPath}  (${e.height ?? '?'}px, ${e.status})`);
  }
}

main().catch((err) => {
  console.error('refresh-landed failed:', err.message);
  process.exit(1);
});
