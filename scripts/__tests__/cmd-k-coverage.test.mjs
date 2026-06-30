import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';

/**
 * Regression guard for Wave W4-surface (W4B) — complete Cmd+K route coverage.
 *
 * The ultra-audit master synthesis (docs/operations/…-ultra-audit-MASTER-synthesis.md)
 * flagged that the global ⌘K / Ctrl+K command palette — which since the
 * 2026-05-28 IA trim is the ONLY non-URL way to reach the routes that were
 * pulled out of the sidebar rail (Miller's 7±2 discipline) — had drifted out
 * of sync with the actual dashboard route tree. Routes that exist as real
 * pages (alerts, insights, intelligence, analytics/coachhelm, coachhelm/chat,
 * coachhelm/genome, coachhelm/qualifying selection, settings/notifications,
 * settings/coaching-intelligence, stats/team, whats-new, …) had no palette
 * entry, leaving them keyboard-unreachable.
 *
 * This test walks every dashboard `page.tsx`, derives its route URL, and
 * asserts each route is EITHER:
 *   (a) present in the CommandPalette manifest (a literal `href: '…'` in
 *       src/components/golf/CommandPalette.tsx — covers both the coach and
 *       player quick-action arrays), OR
 *   (b) explicitly listed in ALLOWLIST below, with a documented reason it
 *       cannot/should not be a top-level palette command (dynamic-param
 *       detail routes that need an entity id and are surfaced via the
 *       palette's dynamic Players/Insights/Rounds groups instead;
 *       redirect-only aliases; the home roots owned by the logo / Dashboard
 *       nav; and sub-action / utility pages reached from a parent that IS in
 *       the manifest).
 *
 * It FAILS on regression — i.e. if a new addressable dashboard page ships
 * without a palette entry, or if one of the W4B entries is deleted (the
 * offender must then consciously move that route into ALLOWLIST, which is the
 * documented, reviewable escape hatch).
 *
 * Audit reference:
 *   docs/operations/2026-05-28-ultra-audit-MASTER-synthesis.md — Cmd+K route
 *   coverage (the command palette is the canonical fallback surface for every
 *   route trimmed from the sidebar rail).
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

const DASHBOARD_DIR = join(REPO_ROOT, 'src', 'app', 'golf', '(dashboard)');

const COMMAND_PALETTE = join(
  REPO_ROOT,
  'src',
  'components',
  'golf',
  'CommandPalette.tsx',
);

/**
 * Routes that legitimately do NOT get a top-level Cmd+K command. Each entry
 * MUST carry a reason so removing a palette entry is a conscious, reviewable
 * act (move the route here with justification) rather than a silent drop.
 */
const ALLOWLIST = new Map([
  // Home roots — owned by the sidebar logo + "Dashboard" primary nav item.
  ['/golf/dashboard', 'home root — owned by the sidebar logo + Dashboard nav'],
  ['/golf/dashboard/hub', 'player home root — owned by the Dashboard nav'],

  // Redirect-only legacy aliases (render no UI; just redirect()).
  [
    '/golf/dashboard/my-insights',
    'redirect-only legacy alias → /golf/dashboard/coachhelm',
  ],

  // Phone-specific player mirror surfaces — reached from their CoachHelm /
  // standing parents, not a top-level jump.
  [
    '/golf/dashboard/my-game-profile',
    'phone-only mirror of the genome view; reached from CoachHelm AI',
  ],
  [
    '/golf/dashboard/my-standing',
    'phone-first standing matrix; reached from CoachHelm AI / stats',
  ],

  // Sub-action / utility pages reached from a parent that IS in the manifest.
  [
    '/golf/dashboard/qualifiers/create',
    'create-qualifier sub-action; reached from the Qualifiers list',
  ],
  [
    '/golf/dashboard/rounds/recover-draft-draft',
    'round-recovery utility; reached from My Rounds',
  ],

  // Dynamic-param detail routes — need an entity id and are surfaced via the
  // palette's dynamic Players / Recent insights / Recent rounds groups, not a
  // static href. (The qualifying selection workspace + genome view are reached
  // from the Qualifiers list and Genome Compare static entries respectively.)
  [
    '/golf/dashboard/coachhelm/genome/[playerId]',
    'dynamic — needs playerId; static landing is genome/compare-players-players (in manifest)',
  ],
  [
    '/golf/dashboard/coachhelm/qualifying/[id]',
    'dynamic — needs qualifier id; reached from the Qualifiers list (in manifest)',
  ],
  [
    '/golf/dashboard/players/[playerId]',
    'dynamic — needs playerId; surfaced via the palette Players group',
  ],
  [
    '/golf/dashboard/players/[playerId]/game',
    'dynamic — needs playerId; reached from the player profile',
  ],
  [
    '/golf/dashboard/players/[playerId]/game/print',
    'dynamic print view — needs playerId; reached from the game profile',
  ],
  [
    '/golf/dashboard/qualifiers/[id]',
    'dynamic — needs qualifier id; reached from the Qualifiers list',
  ],
  [
    '/golf/dashboard/roster/[id]',
    'dynamic — needs roster member id; surfaced via the palette Players group',
  ],
  [
    '/golf/dashboard/rounds/[id]',
    'dynamic — needs round id; surfaced via the palette Recent rounds group',
  ],
  [
    '/golf/dashboard/rounds/[id]/review',
    'dynamic — needs round id; reached from a round detail',
  ],
  [
    '/golf/dashboard/rounds/continue/[id]',
    'dynamic — needs round id; reached from an in-progress round',
  ],
]);

/** Recursively collect every `page.tsx` under a directory. */
async function collectPages(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectPages(full)));
    } else if (entry.isFile() && entry.name === 'page.tsx') {
      out.push(full);
    }
  }
  return out;
}

/**
 * Convert a `page.tsx` absolute path to its route URL:
 *   …/src/app/golf/(dashboard)/dashboard/alerts/page.tsx
 *     → /golf/dashboard/alerts
 * Route groups `(group)` are stripped (they don't appear in the URL).
 */
function pageToRoute(absPath) {
  const rel = relative(join(REPO_ROOT, 'src', 'app'), absPath)
    .replace(/\/page\.tsx$/, '')
    .replace(/\\/g, '/');
  const segments = rel
    .split('/')
    .filter((s) => s.length > 0 && !(s.startsWith('(') && s.endsWith(')')));
  return '/' + segments.join('/');
}

/** Extract every literal `href: '…'` value from the CommandPalette source. */
function extractManifestHrefs(source) {
  const hrefs = new Set();
  const re = /href:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    // Strip any query string — the palette can target ?id= variants but the
    // route identity is the pathname.
    hrefs.add(m[1].split('?')[0]);
  }
  return hrefs;
}

test('every dashboard page route is in the Cmd+K manifest or the allowlist', async () => {
  const pages = await collectPages(DASHBOARD_DIR);

  // Sanity: the walk must find the dashboard page set. If this drops to zero
  // the walk is broken and the guard would silently pass.
  assert.ok(
    pages.length >= 30,
    `Expected the full dashboard page set under ${relative(REPO_ROOT, DASHBOARD_DIR)} ` +
      `but found only ${pages.length}. Did the route group move?`,
  );

  const source = await readFile(COMMAND_PALETTE, 'utf8');
  const manifest = extractManifestHrefs(source);

  // Sanity: the manifest must be non-trivial. A near-empty manifest means the
  // extraction regex broke (e.g. the file switched to double-quoted hrefs).
  assert.ok(
    manifest.size >= 20,
    `Extracted only ${manifest.size} hrefs from CommandPalette.tsx — the manifest ` +
      `extraction likely broke. Expected >= 20 quick-action entries.`,
  );

  const routes = [...new Set(pages.map(pageToRoute))].sort();

  const missing = [];
  for (const route of routes) {
    if (manifest.has(route)) continue;
    if (ALLOWLIST.has(route)) continue;
    missing.push(route);
  }

  if (missing.length > 0) {
    assert.fail(
      `Found ${missing.length} dashboard route(s) unreachable from the Cmd+K ` +
        `command palette and not allowlisted.\n` +
        `Wave W4B requires every addressable dashboard page to have a ` +
        `CommandPalette entry (it's the canonical fallback for routes trimmed ` +
        `from the sidebar). Add an entry to src/components/golf/CommandPalette.tsx, ` +
        `or — if the route genuinely cannot be a top-level command (dynamic ` +
        `detail page, redirect alias, sub-action) — add it to ALLOWLIST with a ` +
        `reason.\n\n` +
        missing.map((r) => `  - ${r}`).join('\n'),
    );
  }
});

test('Cmd+K allowlist contains no stale (non-existent) routes', async () => {
  // Keep the allowlist honest: every allowlisted route must still correspond to
  // a real page (static) or a real dynamic page route. A stale allowlist entry
  // could mask a future genuinely-missing route.
  const pages = await collectPages(DASHBOARD_DIR);
  const routes = new Set(pages.map(pageToRoute));

  const stale = [];
  for (const route of ALLOWLIST.keys()) {
    if (!routes.has(route)) stale.push(route);
  }

  if (stale.length > 0) {
    assert.fail(
      `Found ${stale.length} stale Cmd+K allowlist entr(y/ies) that no longer ` +
        `map to a real dashboard page route. Remove them from ALLOWLIST:\n\n` +
        stale.map((r) => `  - ${r}`).join('\n'),
    );
  }
});

test('every W4B route the audit called out is in the Cmd+K manifest', async () => {
  // Explicit, named assertions for the routes the W4B task enumerated, so the
  // intent is legible and a regression names the exact missing entry.
  const source = await readFile(COMMAND_PALETTE, 'utf8');
  const manifest = extractManifestHrefs(source);

  const required = [
    '/golf/dashboard/alerts',
    '/golf/dashboard/insights',
    '/golf/dashboard/intelligence',
    '/golf/dashboard/analytics/coachhelm',
    '/golf/dashboard/coachhelm/chat',
    '/golf/dashboard/coachhelm/genome/compare-players-players-players',
    '/golf/dashboard/settings/notifications',
    '/golf/dashboard/settings/coaching-intelligence',
    '/golf/dashboard/stats/team',
    '/golf/dashboard/whats-new',
    '/golf/dashboard/travel',
  ];

  const missing = required.filter((r) => !manifest.has(r));
  assert.deepEqual(
    missing,
    [],
    `These W4B routes must each have a CommandPalette entry but are missing: ` +
      `${missing.join(', ')}`,
  );
});
