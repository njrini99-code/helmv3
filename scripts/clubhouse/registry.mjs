#!/usr/bin/env node
/**
 * The Clubhouse page registry (Foundation V2, D-60, D-68, D-69).
 *
 * Sources of truth, all committed:
 *   config/clubhouse/pages/P###-<slug>.json   one manifest per page
 *   config/clubhouse/bridge-contracts.json    every Bridge ID ever minted
 *   config/clubhouse/bridge-tombstones.json   retired Bridge IDs, never reused
 *   config/clubhouse/category-map.json        catalog kind -> V2 category, with named exceptions
 *   docs/clubhouse/catalog/*.md               the CH- state catalog (unchanged, still the row source)
 *
 * A Bridge ID is <page namespace><category, 2 digits><item, 2 digits> as one
 * integer (D-68): Messages' twelfth server-error contract is 70612. IDs are
 * minted append-only by `sync`: an existing record keeps its ID, category
 * and name forever; only its meaning (the catalog's "When") and status
 * follow the catalog. A catalog row that disappears is a violation until
 * its ID is tombstoned.
 *
 * Usage:
 *   node scripts/clubhouse/registry.mjs sync    mint IDs for new rows, refresh status, write generated docs
 *   node scripts/clubhouse/registry.mjs check   the checks alone (also run by check.mjs)
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAudits, renderAudits, renderRelated } from './docs-index.mjs';
import { buildBridgeGraph, renderGraph, GRAPH_PATH, actionCallNames } from './bridge-graph.mjs';

export const CATEGORY_COUNT = 25;
/** Categories a page may never mark N/A (D-69): loading, empty, server error, offline, permission, accessibility. */
export const REQUIRED_CATEGORIES = [2, 4, 6, 7, 8, 18];
const DESIGN = ['not_started', 'draft', 'review', 'approved', 'superseded'];
const IMPLEMENTATION = ['not_started', 'ready', 'in_progress', 'blocked', 'verifying', 'complete'];
const CONTRACT = ['not_started', 'partial', 'complete'];
const BRIDGE = ['not_required', 'reserved', 'partial', 'complete'];
const DATA = ['not_required', 'existing', 'plan_required', 'held', 'ready'];
const VERIFICATION = ['not_started', 'partial', 'passing', 'failing'];
const DOCS = ['missing', 'stale', 'current'];
export const DOC_FILES = ['PAGE', 'DESIGN', 'CONTRACT', 'WIRING', 'VERIFY', 'CHANGELOG'];
export const HOLD_HEADER = '-- STATUS: WRITTEN — HOLD — NOT APPLIED';
const GATES = ['spec', 'desktop', 'wired', 'states', 'error-tracking', 'phone-spec', 'phone', 'motion', 'accessibility', 'performance', 'verified'];

export const pad2 = (n) => String(n).padStart(2, '0');
const s0 = (m) => m.status ?? {};
export const bridgeId = (ns, category, item) => Number(`${ns}${pad2(category)}${pad2(item)}`);
/** Decodes from the right, so any namespace width works. */
export function decodeBridgeId(id) {
  const s = String(id);
  return { ns: Number(s.slice(0, -4)), category: Number(s.slice(-4, -2)), item: Number(s.slice(-2)) };
}

// ── Catalog rows ──

/** The kind digit follows the page prefix: one digit for 4-digit codes, two for 5-digit. */
export const kindOf = (num) => num[num.length - 3];

/**
 * The file paths a contract's free-text `where` names (`a.tsx#Sym; b.ts (x)`), in order. Each must be a full path
 * from the repo root, so the Bridge can open it and the check can prove it still exists.
 */
const WHERE_PATH = /(?<![\w./(-])((?:(?:\([\w-]+\)|[\w.[\]-]+)\/)*[\w.[\]-]+\.(?:tsx|ts|mjs|cjs|js|json|css|md|sql))(?![\w])/g;
const WHERE_ROOT = /^(?:(?:src|scripts|config|docs|supabase|e2e|tests|design|design-refresh)\/|[\w.-]+\.config\.m?[jt]s$)/;
export const wherePaths = (where) => [...String(where ?? '').matchAll(WHERE_PATH)].map((m) => m[1]);
export const isFullWherePath = (path) => WHERE_ROOT.test(path);

export function parseCatalogRows(catalogs) {
  const rows = [];
  for (const [file, md] of Object.entries(catalogs)) {
    const slug = file.replace(/^.*\//, '').replace(/\.md$/, '');
    for (const line of md.split('\n')) {
      const m = /^\|\s*CH-(\d{4,5})\s*\|([^|]*)\|/.exec(line);
      if (!m) continue;
      rows.push({ code: `CH-${m[1]}`, num: m[1], slug, file, kind: kindOf(m[1]), when: m[2].trim(), retired: /retired/i.test(line) });
    }
  }
  return rows;
}

export function categoryFor(row, map) {
  const o = map.overrides?.[row.code];
  if (o) return o.category;
  const d = map.kindDefaults?.[row.kind];
  return d ? d.category : null;
}

/** A readable constant from the row's meaning: SENDING_A_MESSAGE_THROWS. */
export function nameFrom(when) {
  const words = when
    .replace(/\(.*?\)/g, ' ')
    .replace(/[’']/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 7);
  return words.join('_') || 'UNNAMED';
}

// ── Category 25: what the Bridge does with each page (plan §6, owner decision D4) ──

export const BRIDGE_ACTION_CATEGORY = 25;
const CATEGORY_25_TEST = 'src/app/admin/clubhouse/__tests__/category-25.test.ts';

/**
 * Three rows per page, minted by `sync` like catalog rows but from this table rather than a catalog: P###-25-01
 * "Open in Bridge", -02 "Signal the Bridge reads", -03 "Context pack". Their meaning, status, where and tests follow
 * this table; their ID and name never change. A tombstoned one is never minted again.
 *
 * -02 stays reserved until signals reach the Bridge (the held migration and the clubhouse_signals switch); -01 and
 * -03 are implemented, proved by CATEGORY_25_TEST, which names every one of their IDs.
 */
export const BRIDGE_ACTION_ROWS = [
  {
    item: 1,
    name: 'OPEN_IN_BRIDGE',
    meaning: (m) => `The Bridge opens ${m.id} ${m.name} as a dossier (B02): its contract, states, controls, actions and docs, read from the graph this deploy shipped with.`,
    status: 'implemented',
    where: 'src/app/admin/clubhouse/[page]/page.tsx#ClubhousePageDossier',
    tests: [CATEGORY_25_TEST],
  },
  {
    item: 2,
    name: 'SIGNAL_THE_BRIDGE_READS',
    meaning: (m) => `${m.id} ${m.name}'s signals (views, actions, outcomes, failures) reach the Bridge through POST /api/ch/signal and are read against the graph (plan §4).`,
    status: 'reserved',
    where: 'src/app/api/ch/signal/route.ts#POST',
  },
  {
    item: 3,
    name: 'CONTEXT_PACK',
    meaning: (m) => `The Duet desk (B13) builds ${m.id} ${m.name}'s context pack: the contract, the code, what to read, how to reproduce and what done means (plan §9.1).`,
    status: 'implemented',
    where: 'src/lib/admin/clubhouse/pack.ts#buildPack',
    tests: [CATEGORY_25_TEST],
  },
];

/** The category 25 records every page should have, with the key order bridge-contracts.json uses. */
export function bridgeActionRecords(manifests) {
  const out = [];
  for (const m of [...manifests].sort((a, b) => a.bridgeNamespace - b.bridgeNamespace)) {
    if (!Number.isInteger(m.bridgeNamespace)) continue;
    for (const row of BRIDGE_ACTION_ROWS) {
      const rec = { id: bridgeId(m.bridgeNamespace, BRIDGE_ACTION_CATEGORY, row.item), page: m.id, category: BRIDGE_ACTION_CATEGORY, item: row.item, name: row.name, meaning: row.meaning(m), status: row.status, where: row.where };
      if (row.tests) rec.tests = [...row.tests];
      out.push(rec);
    }
  }
  return out;
}

/** Adds the missing category 25 records and refreshes the existing ones' meaning, status, where and tests. */
export function syncBridgeActions(records, manifests, tombstones) {
  const tomb = new Set(tombstones.map((t) => t.id));
  const byId = new Map(records.map((r) => [r.id, r]));
  const out = records.map((r) => ({ ...r }));
  const outById = new Map(out.map((r) => [r.id, r]));
  for (const want of bridgeActionRecords(manifests)) {
    if (tomb.has(want.id)) continue;
    const cur = outById.get(want.id);
    if (!cur) {
      out.push(want);
      continue;
    }
    if (byId.get(want.id)?.chCode) continue; // a catalog row already owns this ID; checkRegistry reports it
    cur.meaning = want.meaning;
    cur.status = want.status;
    cur.where = want.where;
    if (want.tests) cur.tests = want.tests;
    else delete cur.tests;
  }
  return out.sort((a, b) => a.id - b.id);
}

// ── Sync (append-only) ──

/**
 * Returns the new contract list. Existing records keep id, page, category,
 * item and name; meaning, status and catalog location follow the catalog.
 * New rows get the next free item in their page and category, counting
 * tombstoned IDs as taken.
 */
export function syncBridge({ existing, rows, manifests, map, tombstones, used }) {
  const byCode = new Map(existing.map((r) => [r.chCode, r]));
  const pageBySlug = new Map(manifests.filter((m) => m.catalog).map((m) => [m.slug, m]));
  const taken = new Set([...existing.map((r) => r.id), ...tombstones.map((t) => t.id)]);
  const out = existing.map((r) => ({ ...r }));
  const outByCode = new Map(out.map((r) => [r.chCode, r]));
  const sorted = [...rows].sort((a, b) => (a.slug === b.slug ? Number(a.num) - Number(b.num) : a.slug.localeCompare(b.slug)));
  const names = new Set(existing.map((r) => `${r.page}:${r.name}`));
  for (const row of sorted) {
    const status = row.retired ? 'deprecated' : used.has(row.code) ? 'implemented' : 'reserved';
    const cur = outByCode.get(row.code);
    if (cur) {
      cur.meaning = row.when;
      cur.status = status;
      cur.catalog = row.file;
      continue;
    }
    if (byCode.has(row.code)) continue;
    const page = pageBySlug.get(row.slug);
    const category = categoryFor(row, map);
    if (!page || !category) continue; // reported by checkRegistry
    let item = 1;
    while (taken.has(bridgeId(page.bridgeNamespace, category, item))) item += 1;
    const id = bridgeId(page.bridgeNamespace, category, item);
    taken.add(id);
    let name = nameFrom(row.when);
    for (let n = 2; names.has(`${page.id}:${name}`); n += 1) name = `${nameFrom(row.when)}_${n}`;
    names.add(`${page.id}:${name}`);
    const rec = { id, page: page.id, category, item, name, chCode: row.code, meaning: row.when, status, catalog: row.file };
    out.push(rec);
    outByCode.set(row.code, rec);
  }
  return out.sort((a, b) => a.id - b.id);
}

/** The full sync `sync` writes and `check` compares: catalog rows, then the Bridge's category 25 rows. */
export function syncAll(ctx) {
  const catalog = syncBridge({ existing: ctx.bridge, rows: ctx.rows, manifests: ctx.manifests, map: ctx.map, tombstones: ctx.tombstones, used: ctx.used });
  return syncBridgeActions(catalog, ctx.manifests, ctx.tombstones);
}

// ── Checks ──

function enumIs(v, list) {
  return list.includes(v);
}

/** Parses "## 06 — Server / system error" sections: status line and the Bridge IDs named in each. */
export function parseContract(md) {
  const sections = new Map();
  let cur = null;
  for (const line of md.split('\n')) {
    const h = /^##\s+(\d{2})\s+—/.exec(line);
    if (h) {
      cur = { status: null, reason: '', ids: new Set(), text: '' };
      sections.set(Number(h[1]), cur);
      continue;
    }
    if (/^##\s/.test(line)) cur = null;
    if (!cur) continue;
    const s = /^Status:\s*(DEFINED|N\/A)\s*(?:—\s*(.*))?$/.exec(line.trim());
    if (s) {
      cur.status = s[1];
      cur.reason = (s[2] ?? '').trim();
    }
    for (const m of line.matchAll(/(?<![\d-])(\d{5,6})(?!\d)/g)) cur.ids.add(Number(m[1]));
    cur.text += line + '\n';
  }
  return sections;
}

export function progressRows(md) {
  const block = md.split('<!-- clubhouse:screens:start -->')[1]?.split('<!-- clubhouse:screens:end -->')[0] ?? '';
  const out = new Map();
  for (const row of block.trim().split('\n').slice(2)) {
    const cells = row.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 2 + GATES.length) continue;
    out.set(cells[0], Object.fromEntries(GATES.map((g, i) => [g, cells[2 + i]])));
  }
  return out;
}

/** Top-level feature ids in memory/registry.yml (two-space keys under `features:`). */
export function registryFeatureIds(yml) {
  const ids = new Set();
  let inFeatures = false;
  for (const line of yml.split('\n')) {
    if (/^features:\s*$/.test(line)) inFeatures = true;
    else if (/^\S/.test(line)) inFeatures = false;
    const m = /^ {2}([a-z0-9_]+):\s*$/.exec(line);
    if (m && inFeatures) ids.add(m[1]);
  }
  return ids;
}

function routeToPage(route) {
  const rest = route.replace(/^\/golf\/dashboard/, '').replace(/\?.*$/, '');
  return join('src/app/golf/(dashboard)/dashboard', rest, 'page.tsx');
}

/**
 * The pages that sit outside the dashboard (sign in, welcome, sign up, onboarding) are drawn for a visitor with no
 * role: a manifest marks them `"area": "auth"`. Their routes live under /golf/ in the (auth) or (onboarding) route
 * groups, and they have no roles.
 */
const AUTH_GROUPS = ['(auth)', '(onboarding)'];
export function authRouteToPages(route) {
  const rest = route.replace(/^\/golf/, '').replace(/\?.*$/, '');
  return AUTH_GROUPS.map((group) => join('src/app/golf', group, rest, 'page.tsx'));
}

// ── Who each screen is for (routing) ──

/**
 * Every screen is labelled for routing: `coach` (only a coach gets it), `player` (only a player), `shared` (both roles
 * get a screen at that address, the same component or one each) or `signed-out` (drawn before anyone has a role; the
 * auth pages and the join links only). A manifest's `screens` holds one entry per route (no `view`) and one per
 * query view that is its own screen (`view`, such as CoachHelm's `?view=player`). The component a role gets is
 * `file#Export`; a role with no screen there has no key.
 */
export const AUDIENCES = ['coach', 'player', 'shared', 'signed-out'];
const ROLE_KEYS = { coach: ['coach'], player: ['player'], shared: ['coach', 'player'], 'signed-out': ['visitor'] };
const OTHER_KINDS = ['screen', 'redirect', 'not-found'];

/** The address a page.tsx serves: route groups `(x)` drop out. */
export function pageToRoute(file) {
  const parts = file.replace(/^src\/app/, '').replace(/\/page\.tsx$/, '').split('/').filter((p) => p && !/^\(.+\)$/.test(p));
  return `/${parts.join('/')}`;
}

function componentProblem(ref, exists, read) {
  const [file, name] = String(ref).split('#');
  if (!name) return `${ref} is not file#Export`;
  if (!exists(file)) return `${file} does not exist`;
  const src = read(file);
  const re = new RegExp(`export\\s+(?:default\\s+)?(?:async\\s+)?(?:function|const|class)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`);
  return re.test(src) ? null : `${file} does not export ${name}`;
}

/**
 * The routing labels. `golfPages` is every page.tsx under src/app/golf outside admin/; each must be a manifest route or a
 * row of config/clubhouse/other-routes.json (old addresses, the join links, the 404), so no Clubhouse address goes
 * unlabelled.
 */
export function checkScreenLabels({ manifests, otherRoutes = [], golfPages = [], exists, read }) {
  const v = [];
  const owned = new Map();
  for (const m of manifests) {
    const at = `config/clubhouse/pages/${m.id}-${m.slug}.json`;
    const routes = [...(m.routes ?? []), ...(m.plannedRoutes ?? [])];
    const screens = m.screens ?? [];
    const keys = new Set();
    const reached = new Set();
    for (const s of screens) {
      const where = `${at}: screen ${s.route}${s.view ?? ''}`;
      if (!routes.includes(s.route)) v.push(`${where}: route is not one of this page's routes`);
      if (!AUDIENCES.includes(s.audience)) v.push(`${where}: audience "${s.audience}" is not ${AUDIENCES.join(', ')}`);
      if (!s.name) v.push(`${where}: no name`);
      const key = `${s.route}${s.view ?? ''}`;
      if (keys.has(key)) v.push(`${where}: listed twice`);
      keys.add(key);
      if (s.audience === 'signed-out' && m.area !== 'auth') v.push(`${where}: only an auth page has signed-out screens`);
      const want = ROLE_KEYS[s.audience] ?? [];
      for (const k of ['coach', 'player', 'visitor']) {
        if (want.includes(k) && !s[k]) v.push(`${where}: ${s.audience} needs the ${k} screen (file#Export)`);
        if (!want.includes(k) && s[k]) v.push(`${where}: a ${s.audience} screen has no ${k} screen; drop "${k}" or change the audience`);
        if (want.includes(k) && s[k]) {
          const p = componentProblem(s[k], exists, read);
          if (p) v.push(`${where}: ${k} ${p}`);
        }
      }
      if (m.area !== 'auth') {
        for (const r of want) if (r !== 'visitor') {
          reached.add(r);
          if (!(m.roles ?? []).includes(r)) v.push(`${where}: a ${s.audience} screen, but the page's roles don't include ${r}`);
        }
      }
    }
    for (const r of routes) if (!screens.some((s) => s.route === r && !s.view)) v.push(`${at}: route ${r} has no screen; label it in "screens" (${AUDIENCES.join(', ')})`);
    // The shell frames every page for both roles, so its own routes need not reach both.
    if (m.id !== 'P001' && m.area !== 'auth') for (const r of m.roles ?? []) if (!reached.has(r)) v.push(`${at}: roles include ${r}, but no screen is for ${r}`);
    for (const r of routes) owned.set(r, [...(owned.get(r) ?? []), m.id]);
  }
  const others = new Set();
  for (const o of otherRoutes) {
    const at = `config/clubhouse/other-routes.json ${o.route}`;
    if (others.has(o.route)) v.push(`${at}: listed twice`);
    others.add(o.route);
    if (owned.has(o.route)) v.push(`${at}: also a route of ${owned.get(o.route).join(', ')}; keep it in one place`);
    if (!OTHER_KINDS.includes(o.kind)) v.push(`${at}: kind "${o.kind}" is not ${OTHER_KINDS.join(', ')}`);
    if (!AUDIENCES.includes(o.audience)) v.push(`${at}: audience "${o.audience}" is not ${AUDIENCES.join(', ')}`);
    if (!o.source || !exists(o.source)) v.push(`${at}: source ${o.source ?? '(none)'} does not exist`);
    if (o.kind !== 'redirect') {
      for (const k of ['coach', 'player', 'visitor']) {
        if (o[k] && o[k].startsWith('src/')) {
          const p = componentProblem(o[k], exists, read);
          if (p) v.push(`${at}: ${k} ${p}`);
        }
      }
    }
  }
  const served = new Set();
  for (const file of golfPages) {
    const route = pageToRoute(file);
    served.add(route);
    if (!owned.has(route) && !others.has(route)) v.push(`${file}: ${route} has no page manifest route and no row in config/clubhouse/other-routes.json; label it coach, player, shared or signed-out`);
  }
  if (golfPages.length) for (const o of otherRoutes) if (!served.has(o.route)) v.push(`config/clubhouse/other-routes.json ${o.route}: no page.tsx serves it any more; remove the row`);
  return v;
}

/**
 * Every rule the Foundation V2 plan asks the registry to hold. `ctx` carries
 * the parsed sources and two file accessors so tests can run it in memory.
 */
export function checkRegistry(ctx) {
  const { manifests, bridge, tombstones, rows, map, features, progressMd, heldMd, exists, read, migrations } = ctx;
  const v = [];
  if (ctx.golfPages) v.push(...checkScreenLabels(ctx));
  if (ctx.audits) v.push(...checkAudits({ audits: ctx.audits, manifests, exists, docs: ctx.docs ?? [], readmeMd: ctx.readmeMd ?? '', progressMd }));
  const ids = new Set();
  const namespaces = new Map();
  const slugs = new Set();
  const useActionOwners = new Map();
  for (const m of manifests) {
    const at = `config/clubhouse/pages/${m.id}-${m.slug}.json`;
    if (!/^P\d{3}$/.test(m.id ?? '')) v.push(`${at}: id "${m.id}" is not P###`);
    if (ids.has(m.id)) v.push(`${at}: page id ${m.id} is used twice`);
    ids.add(m.id);
    if (slugs.has(m.slug)) v.push(`${at}: slug ${m.slug} is used twice`);
    slugs.add(m.slug);
    if (!Number.isInteger(m.bridgeNamespace) || m.bridgeNamespace < 1) v.push(`${at}: bridgeNamespace must be a positive integer`);
    else if (namespaces.has(m.bridgeNamespace)) v.push(`${at}: Bridge namespace ${m.bridgeNamespace} is also ${namespaces.get(m.bridgeNamespace)}'s`);
    else namespaces.set(m.bridgeNamespace, m.id);
    if (Number(m.id?.slice(1)) !== m.bridgeNamespace) v.push(`${at}: ${m.id} must use namespace ${Number(m.id?.slice(1))} (D-60)`);
    for (const r of m.routes ?? []) {
      if (m.area === 'auth') {
        if (!/^\/golf\/[a-z]/.test(r) || /^\/golf\/dashboard(\/|$)/.test(r)) v.push(`${at}: route ${r} is an auth route, so it must be a /golf page outside /golf/dashboard`);
        else if (!authRouteToPages(r).some((p) => exists(p))) v.push(`${at}: route ${r} has none of ${authRouteToPages(r).join(', ')}`);
        continue;
      }
      if (!/^\/golf\/dashboard(\/|$)/.test(r)) v.push(`${at}: route ${r} is not under /golf/dashboard`);
      else if (!exists(routeToPage(r))) v.push(`${at}: route ${r} has no ${routeToPage(r)}`);
    }
    // A page built in the preview before its routes are wired (P016) lists the routes it will own as plannedRoutes:
    // under /golf/dashboard, with no page.tsx yet (once one exists the route moves to routes), and never on a page that
    // claims its implementation complete.
    for (const r of m.plannedRoutes ?? []) {
      if (!/^\/golf\/dashboard(\/|$)/.test(r)) v.push(`${at}: planned route ${r} is not under /golf/dashboard`);
      else if (exists(routeToPage(r))) v.push(`${at}: planned route ${r} has ${routeToPage(r)}; move it to routes`);
      if ((m.routes ?? []).includes(r)) v.push(`${at}: ${r} is in both routes and plannedRoutes`);
    }
    if ((m.plannedRoutes ?? []).length && s0(m).implementation === 'complete') v.push(`${at}: implementation complete with planned routes still unwired`);
    if (m.area !== undefined && m.area !== 'auth') v.push(`${at}: area "${m.area}" is not auth`);
    if (m.area === 'auth' && (m.roles ?? []).length) v.push(`${at}: an auth page is drawn for a visitor with no role, so roles must be empty`);
    if (!(m.routes ?? []).length && !(m.plannedRoutes ?? []).length && m.id !== 'P001') v.push(`${at}: no routes`);
    for (const r of m.roles ?? []) if (!['coach', 'player'].includes(r)) v.push(`${at}: role ${r} is not coach or player`);
    for (const f of m.semanticFeatures ?? []) if (!features.has(f)) v.push(`${at}: semantic feature ${f} is not in memory/registry.yml`);
    if (!(m.semanticFeatures ?? []).length) v.push(`${at}: no semantic features`);
    const s = m.status ?? {};
    const enums = { design: DESIGN, implementation: IMPLEMENTATION, contract: CONTRACT, bridge: BRIDGE, data: DATA, verification: VERIFICATION, docs: DOCS };
    for (const [k, list] of Object.entries(enums)) if (!enumIs(s[k], list)) v.push(`${at}: status.${k} "${s[k]}" is not one of ${list.join(', ')}`);
    const impl = m.implementation ?? {};
    if (s.implementation !== 'not_started') {
      for (const p of [impl.root, impl.loader, impl.styles, ...(impl.also ?? []), ...(impl.tests ?? [])].filter(Boolean)) if (!exists(p)) v.push(`${at}: implementation path ${p} does not exist`);
      if (!impl.root) v.push(`${at}: implementation.root is missing`);
    }
    for (const p of [...(m.design?.desktop ?? []), ...(m.design?.phone ?? [])]) if (!exists(p)) v.push(`${at}: design file ${p} does not exist`);
    for (const p of [m.catalog, m.checklist, m.phoneSpec].filter(Boolean)) if (!exists(p)) v.push(`${at}: ${p} does not exist`);

    // Docs (D-69: all six once started; "missing" only before the page claims completion).
    const docsDir = `docs/clubhouse/pages/${m.id}-${m.slug}`;
    if (s.docs === 'missing') {
      if (s.implementation === 'complete' || s.verification === 'passing' || s.contract === 'complete') v.push(`${at}: status.docs is missing, but the page claims implementation complete, verification passing or contract complete`);
    } else {
      for (const d of DOC_FILES) if (!exists(`${docsDir}/${d}.md`)) v.push(`${at}: ${docsDir}/${d}.md is missing`);
      if (exists(`${docsDir}/PAGE.md`)) {
        const head = read(`${docsDir}/PAGE.md`).split('\n').find((l) => l.startsWith('# ')) ?? '';
        if (!head.includes(m.id) || !head.includes(m.name)) v.push(`${docsDir}/PAGE.md: the title must name ${m.id} and ${m.name}`);
      }
      if (exists(`${docsDir}/CONTRACT.md`)) v.push(...checkContract({ m, md: read(`${docsDir}/CONTRACT.md`), bridge, file: `${docsDir}/CONTRACT.md` }));
    }
    if (s.contract === 'complete' && s.docs === 'missing') v.push(`${at}: contract complete needs CONTRACT.md`);

    // Progress compatibility.
    const prog = progressRows(progressMd).get(m.progressRow);
    if (!prog) v.push(`${at}: progressRow "${m.progressRow}" is not a row in PROGRESS.md`);
    else {
      if (s.verification === 'passing' && prog.verified !== 'done') v.push(`${at}: verification passing, but PROGRESS.md ${m.progressRow} verified is ${prog.verified}`);
      if (prog.verified === 'done' && s.verification !== 'passing') v.push(`${at}: PROGRESS.md says ${m.progressRow} is verified, but status.verification is ${s.verification}`);
      if (s.implementation === 'complete' && GATES.some((g) => prog[g] !== 'done')) v.push(`${at}: implementation complete, but not every PROGRESS.md gate is done for ${m.progressRow}`);
      if (s.design === 'approved' && !(m.design?.desktop ?? []).length) v.push(`${at}: design approved without a desktop design file`);
    }

    // Actions reference real Bridge IDs on this page.
    const actionIds = new Set();
    for (const a of m.actions ?? []) {
      if (!new RegExp(`^ACT-${m.id}-[A-Z0-9-]+$`).test(a.id ?? '')) v.push(`${at}: action id "${a.id}" is not ACT-${m.id}-NAME`);
      if (actionIds.has(a.id)) v.push(`${at}: action ${a.id} is listed twice`);
      actionIds.add(a.id);
      for (const [k, id] of Object.entries(a.bridge ?? {})) {
        if (id == null) continue;
        const rec = bridge.find((r) => r.id === id);
        if (!rec) v.push(`${at}: ${a.id} bridge.${k} ${id} is not in bridge-contracts.json`);
        else if (rec.page !== m.id && rec.page !== 'P001') v.push(`${at}: ${a.id} bridge.${k} ${id} belongs to ${rec.page}`);
        else if (rec.status === 'deprecated') v.push(`${at}: ${a.id} bridge.${k} ${id} is retired; point it at the outcome that replaced it`);
      }
      for (const p of [a.component, a.service].filter(Boolean)) if (!exists(p.split('#')[0])) v.push(`${at}: ${a.id} path ${p} does not exist`);
      // The names its useAction calls send: each one names this action and no other (Bridge reads `act` back to it).
      if (a.useAction != null && !(typeof a.useAction === 'string' || (Array.isArray(a.useAction) && a.useAction.length))) v.push(`${at}: ${a.id} useAction is not a name or a list of names`);
      for (const name of actionCallNames(a)) {
        if (typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/.test(name)) v.push(`${at}: ${a.id} useAction "${name}" is not a useAction name`);
        else if (useActionOwners.has(name)) v.push(`${at}: useAction "${name}" names both ${useActionOwners.get(name)} and ${a.id}`);
        else useActionOwners.set(name, a.id);
      }
    }

    // B11 drift list 8: a page needs a contract of its own; the Bridge's category 25 rows don't count (plan §13).
    // Asked once sync has given the page its category 25 rows (a page with none at all is "out of date" first).
    const pageRows = bridge.filter((r) => r.page === m.id);
    if (pageRows.length && !pageRows.some((r) => r.category !== BRIDGE_ACTION_CATEGORY && r.status !== 'deprecated')) {
      v.push(`${at}: ${m.id} has no Bridge ID of its own (category 25 is the Bridge's; give the page a catalog block)`);
    }

    // Held plans.
    for (const plan of m.held ?? []) v.push(...checkHeldPlan({ plan, at, exists, read, heldMd }));
    if (s.data === 'held' && !(m.held ?? []).length) v.push(`${at}: status.data is held but no held plan is listed`);
  }

  // Every prepared hold migration is claimed by a held plan some page lists.
  const claimed = new Set(manifests.flatMap((m) => m.held ?? []).filter(exists).map((p) => /Migration:\s*(\S+\.sql)/.exec(read(p))?.[1]).filter(Boolean));
  for (const [file, sql] of Object.entries(migrations)) {
    if (sql.split('\n')[0].trim() === HOLD_HEADER && !claimed.has(file)) v.push(`${file}: carries the HOLD header but no page's held plan names it`);
  }

  // Bridge contracts.
  const seen = new Map();
  const byCode = new Map();
  const pageNs = new Map(manifests.map((m) => [m.id, m.bridgeNamespace]));
  const tomb = new Set(tombstones.map((t) => t.id));
  for (const r of bridge) {
    const at = `config/clubhouse/bridge-contracts.json ${r.id}`;
    if (seen.has(r.id)) v.push(`${at}: Bridge ID used twice`);
    seen.set(r.id, r);
    if (tomb.has(r.id)) v.push(`${at}: reuses a tombstoned ID`);
    const d = decodeBridgeId(r.id);
    if (pageNs.get(r.page) !== d.ns) v.push(`${at}: namespace ${d.ns} is not ${r.page}'s (${pageNs.get(r.page)})`);
    if (d.category !== r.category || d.item !== r.item) v.push(`${at}: category ${r.category} and item ${r.item} don't match the ID`);
    if (r.category < 1 || r.category > CATEGORY_COUNT) v.push(`${at}: category ${r.category} is outside 01–25`);
    if (r.item < 1 || r.item > 99) v.push(`${at}: item ${r.item} is outside 01–99`);
    if (!/^[A-Z0-9_]+$/.test(r.name ?? '')) v.push(`${at}: name "${r.name}" is not a CONSTANT_NAME`);
    if (!['reserved', 'implemented', 'deprecated'].includes(r.status)) v.push(`${at}: status "${r.status}" is not reserved, implemented or deprecated`);
    if (!r.meaning) v.push(`${at}: no meaning`);
    for (const p of wherePaths(r.where)) {
      if (!isFullWherePath(p)) v.push(`${at}: where names ${p}; write the full path from the repo root`);
      else if (!exists(p)) v.push(`${at}: where names ${p}, which does not exist`);
    }
    // A contract with no catalog code proves itself through a named test: implemented means a test file
    // that exists and names the Bridge ID. Without one it stays reserved.
    if (!r.chCode && r.status === 'implemented') {
      if (!(r.tests ?? []).length) v.push(`${at}: implemented, but names no test (add tests, or mark it reserved)`);
      for (const t of r.tests ?? []) {
        if (!exists(t)) v.push(`${at}: test ${t} does not exist`);
        else if (!read(t).includes(String(r.id))) v.push(`${at}: test ${t} does not name ${r.id}`);
      }
    }
    if (r.chCode) {
      if (byCode.has(r.chCode)) v.push(`${at}: ${r.chCode} already has Bridge ID ${byCode.get(r.chCode)}`);
      byCode.set(r.chCode, r.id);
    }
  }
  const names = new Map();
  for (const r of bridge) {
    const k = `${r.page}:${r.name}`;
    if (names.has(k)) v.push(`config/clubhouse/bridge-contracts.json ${r.id}: name ${r.name} is also ${names.get(k)} on ${r.page}`);
    names.set(k, r.id);
  }
  for (const t of tombstones) {
    if (!t.id || !t.removedAt || !t.reason) v.push(`config/clubhouse/bridge-tombstones.json: ${JSON.stringify(t)} needs id, removedAt and reason`);
  }

  // Catalog rows and Bridge records match one to one.
  const pageBySlug = new Map(manifests.filter((m) => m.catalog).map((m) => [m.slug, m]));
  const rowCodes = new Set();
  for (const row of rows) {
    rowCodes.add(row.code);
    const page = pageBySlug.get(row.slug);
    if (!page) {
      v.push(`${row.file}: no page manifest has catalog ${row.file}`);
      continue;
    }
    if (!categoryFor(row, map)) v.push(`${row.file}: ${row.code} has no category (kind ${row.kind})`);
    const id = byCode.get(row.code);
    if (id == null) v.push(`${row.file}: ${row.code} has no Bridge ID; run node scripts/clubhouse/registry.mjs sync`);
    else {
      const rec = seen.get(id);
      if (rec.page !== page.id) v.push(`${row.file}: ${row.code} is ${page.id}'s, but its Bridge ID ${id} is ${rec.page}'s`);
      const want = categoryFor(row, map);
      if (want && rec.category !== want) v.push(`${row.file}: ${row.code} maps to category ${pad2(want)} but its Bridge ID ${id} is minted in ${pad2(rec.category)}; IDs are permanent, so change the category map back or tombstone ${id}`);
    }
  }
  for (const r of bridge) if (r.chCode && !rowCodes.has(r.chCode) && r.status !== 'deprecated') v.push(`config/clubhouse/bridge-contracts.json ${r.id}: ${r.chCode} is no longer in the catalog; mark it retired there, or tombstone the ID`);
  for (const code of Object.keys(map.overrides ?? {})) if (!rowCodes.has(code)) v.push(`config/clubhouse/category-map.json: override ${code} is not a catalog row`);
  // Plan §4.6: a code the source writes must be a catalog row, or the Bridge can't resolve it.
  for (const [code, files] of ctx.codeIndex ?? []) {
    if (!rowCodes.has(code)) v.push(`${[...files][0]}: writes ${code}, which is in no catalog (add the row, or use a code that is)`);
  }
  return v;
}

export function checkContract({ m, md, bridge, file }) {
  const v = [];
  const sections = parseContract(md);
  const mine = bridge.filter((r) => r.page === m.id && r.status !== 'deprecated');
  for (let c = 1; c <= CATEGORY_COUNT; c += 1) {
    const sec = sections.get(c);
    if (!sec) {
      v.push(`${file}: category ${pad2(c)} is missing (every category is answered, D-69)`);
      continue;
    }
    if (!sec.status) v.push(`${file}: category ${pad2(c)} has no "Status: DEFINED" or "Status: N/A — reason" line`);
    if (sec.status === 'N/A' && !sec.reason) v.push(`${file}: category ${pad2(c)} is N/A without a reason`);
    if (sec.status === 'N/A' && REQUIRED_CATEGORIES.includes(c)) v.push(`${file}: category ${pad2(c)} can't be N/A on any page (D-69)`);
    const here = mine.filter((r) => r.category === c);
    if (sec.status === 'N/A' && here.length) v.push(`${file}: category ${pad2(c)} is N/A but ${here.length} contract(s) exist in it`);
    if (sec.status === 'DEFINED' && !sec.ids.size) v.push(`${file}: category ${pad2(c)} is DEFINED but names no Bridge ID`);
    for (const r of here) if (!sec.ids.has(r.id)) v.push(`${file}: ${r.id} (${r.chCode ?? r.name}) is not listed under category ${pad2(c)}`);
    for (const id of sec.ids) if (!bridge.some((r) => r.id === id)) v.push(`${file}: category ${pad2(c)} names ${id}, which is not in bridge-contracts.json`);
  }
  return v;
}

export function checkHeldPlan({ plan, at, exists, read, heldMd }) {
  const v = [];
  if (!exists(plan)) return [`${at}: held plan ${plan} does not exist`];
  const md = read(plan);
  const status = /^Status:\s*(\S+)/m.exec(md)?.[1];
  if (!['HELD', 'RELEASED'].includes(status)) v.push(`${plan}: Status must be HELD or RELEASED, not ${status}`);
  const mig = /^Migration:\s*(\S+\.sql)/m.exec(md)?.[1];
  if (!mig) return v;
  if (!exists(mig)) return [...v, `${plan}: migration ${mig} does not exist`];
  const name = mig.replace(/^.*\//, '');
  const row = heldMd.split('\n').find((l) => l.startsWith(`| \`${name}\``));
  if (status === 'HELD') {
    if (read(mig).split('\n')[0].trim() !== HOLD_HEADER) v.push(`${mig}: first line must be "${HOLD_HEADER}"`);
    if (!row) v.push(`supabase/migrations/HELD.md: no row for ${name}`);
    else {
      if (!/\*\*HOLD/.test(row)) v.push(`supabase/migrations/HELD.md: ${name} is not marked HOLD`);
      if (!row.includes(plan)) v.push(`supabase/migrations/HELD.md: the ${name} row doesn't link ${plan}`);
    }
    if (!/WRITTEN — HOLD — NOT APPLIED/.test(md)) v.push(`${plan}: SQL preparation status must say WRITTEN — HOLD — NOT APPLIED`);
  }
  return v;
}

// ── A page's CONTRACT.md: the tables are generated, the written notes are kept ──

/** "From the shell (P001): …" broken at the commas so no line passes 78 columns (markdownlint MD013). */
function wrapShellLine(items) {
  const lines = [];
  let line = 'From the shell (P001):';
  items.forEach((item, i) => {
    const piece = `${item}${i === items.length - 1 ? '.' : ','}`;
    if (line.length + 1 + piece.length > 78 && line !== 'From the shell (P001):') {
      lines.push(line);
      line = piece;
    } else {
      line += ` ${piece}`;
    }
  });
  lines.push(line);
  return lines.join('\n');
}

/**
 * Rebuilds CONTRACT.md's contract tables from the registry and keeps what a
 * person wrote: the preamble, each category's Status line and its notes. A
 * section that named the shell's contracts ("From the shell (P001): …") gets
 * that line regenerated too. A new page starts from the template's headings.
 */
export function renderContract({ m, bridge, cats, existing }) {
  const pad = (n) => pad2(n);
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
  const pre = existing ? existing.split(/^## 01 — /m)[0] : `# ${m.id} — ${m.name}: page contract\n\n`;
  const sections = new Map();
  if (existing) {
    const parts = existing.split(/^## (\d{2}) — .*$/m);
    for (let i = 1; i < parts.length; i += 2) {
      const body = parts[i + 1] ?? '';
      const lines = body.split('\n');
      const status = lines.find((l) => /^Status:/.test(l.trim()))?.trim() ?? 'Status:';
      // The shell line may be wrapped over several lines: drop it up to the blank line that ends it.
      let inShell = false;
      const prose = lines
        .filter((l) => {
          if (l.startsWith('From the shell (P001):')) inShell = true;
          else if (inShell && l.trim() === '') inShell = false;
          return !inShell && !/^Status:/.test(l.trim()) && !l.startsWith('|');
        })
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      sections.set(Number(parts[i]), { status, prose, shell: lines.some((l) => l.startsWith('From the shell (P001):')) });
    }
  }
  let out = pre.replace(/\s*$/, '\n\n');
  for (let c = 1; c <= CATEGORY_COUNT; c += 1) {
    const sec = sections.get(c) ?? { status: 'Status:', prose: '', shell: false };
    out += `## ${pad(c)} — ${cats[c]}\n\n${sec.status}\n\n`;
    if (sec.prose) out += `${sec.prose}\n\n`;
    const mine = bridge.filter((r) => r.page === m.id && r.category === c && r.status !== 'deprecated');
    if (mine.length) {
      out += '| Bridge ID | Code | Name | Meaning |\n| --- | --- | --- | --- |\n';
      for (const r of mine) out += `| ${r.id} | ${r.chCode ?? '—'} | \`${r.name}\` | ${esc(r.meaning)} |\n`;
      out += '\n';
    }
    const shell = bridge.filter((r) => r.page === 'P001' && r.category === c && r.status !== 'deprecated');
    if (sec.shell && shell.length) out += `${wrapShellLine(shell.map((r) => `${r.id} ${r.chCode ?? r.name}`))}\n\n`;
  }
  return out.replace(/\n+$/, '\n');
}

// ── Generated docs ──

const GEN_HEAD = (title, what) => `# ${title}\n\n<!-- Generated by node scripts/clubhouse/registry.mjs sync. Do not edit; edit the sources under config/clubhouse/ and docs/clubhouse/catalog/. -->\n\n${what}\n`;
const cell = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** One route's label from every page that lists it (Stats is P004's team view for a coach and P005's for a player). */
export function mergeRouteLabel(entries) {
  const roles = new Set(entries.flatMap((s) => ROLE_KEYS[s.audience] ?? []));
  const audience = roles.has('visitor') && roles.size === 1 ? 'signed-out' : roles.has('coach') && roles.has('player') ? 'shared' : roles.has('coach') ? 'coach' : roles.has('player') ? 'player' : '?';
  const pick = (k) => entries.find((s) => s[k])?.[k];
  return { audience, coach: pick('coach'), player: pick('player'), visitor: pick('visitor') };
}

/** Prose wrapped at 80 columns for markdownlint (MD013); an inline code span is never split. */
function wrap80(text) {
  const words = text.match(/`[^`]*`[^\s`]*|\S+/g) ?? [];
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line && line.length + 1 + w.length > 80) {
      lines.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

function renderRouteMap({ pages, otherRoutes = [] }) {
  const code = (x) => (x ? `\`${cell(x)}\`` : '—');
  const rows = new Map();
  for (const m of pages) for (const s of m.screens ?? []) {
    const key = `${s.route}${s.view ?? ''}`;
    const row = rows.get(key) ?? { route: s.route, view: s.view, pages: [], entries: [], names: [] };
    row.pages.push(m.id);
    row.entries.push(s);
    row.names.push(s.name);
    rows.set(key, row);
  }
  const sorted = [...rows.values()].sort((a, b) => a.route.localeCompare(b.route) || (a.view ?? '').localeCompare(b.view ?? ''));
  const count = { coach: 0, player: 0, shared: 0, 'signed-out': 0 };
  let body = '\n| Route | View | Audience | Screen | Coach gets | Player gets | Signed out gets | Page |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n';
  for (const r of sorted) {
    const l = mergeRouteLabel(r.entries);
    if (!r.view) count[l.audience] = (count[l.audience] ?? 0) + 1;
    body += `| \`${r.route}\` | ${r.view ? `\`${cell(r.view)}\`` : '—'} | **${l.audience}** | ${cell([...new Set(r.names)].join('; '))} | ${code(l.coach)} | ${code(l.player)} | ${code(l.visitor)} | ${[...new Set(r.pages)].join(', ')} |\n`;
  }
  let md = GEN_HEAD('Clubhouse route map', 'Who each Clubhouse address is for, for routing.');
  md += `\n${wrap80('**coach**: only a coach gets a screen there. **player**: only a player. **shared**: both roles get a screen there, the same component or one each, as the columns show. **signed-out**: drawn before sign-in. Sources: each page manifest\'s `screens` (`config/clubhouse/pages/*.json`) and `config/clubhouse/other-routes.json`. `clubhouse:check` fails if a `page.tsx` under `src/app/golf` (outside `admin/`) has no label, if a named component does not exist, or if a label disagrees with `CH_REBUILT_ROUTES`.')}\n`;
  md += `\n${wrap80(`${sorted.filter((r) => !r.view).length} page addresses: ${count.coach} coach, ${count.player} player, ${count.shared} shared, ${count['signed-out']} signed out; ${sorted.filter((r) => r.view).length} query views that are screens of their own; ${otherRoutes.length} other addresses below.`)}\n`;
  md += `\n${wrap80('A role that has no screen at an address gets the frame\'s state instead: Clubhouse\'s coach-only state (CH-1301, or the page\'s own, such as Qualifiers\' CH-09311 and Tournaments\' coach-only notice), a coach on a player\'s round flow gets CH-11390, or the page sends that role elsewhere. Practice\'s coach-only pages send a player to `/golf/dashboard/practice`.')}\n`;
  md += `\n## Screens\n${body}`;
  md += `\n## Other addresses\n\n${wrap80('Old addresses, the join links that sit outside the `(auth)` group, and the dashboard\'s not-found page. A redirect row says where each role lands.')}\n\n| Route | Kind | Audience | Coach | Player | Signed out | Source | Note |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n`;
  for (const o of [...otherRoutes].sort((a, b) => a.route.localeCompare(b.route))) {
    md += `| \`${o.route}\` | ${o.kind} | **${o.audience}** | ${code(o.coach)} | ${code(o.player)} | ${code(o.visitor)} | \`${o.source}\` | ${o.note ? cell(o.note) : '—'} |\n`;
  }
  return md;
}

export function generateDocs({ manifests, bridge, map, tombstones, read, exists, audits = [], otherRoutes = [], catalogs = {}, codeIndex = new Map(), surfaceIndex = new Map(), auditFiles = {}, ledgers = {} }) {
  const pages = [...manifests].sort((a, b) => a.id.localeCompare(b.id));
  const cats = map.categories;
  const out = {};

  let pm = GEN_HEAD('Clubhouse page map', 'Every registered page: identity, routes, roles, semantic features and status. The overview gates stay in `docs/clubhouse/PROGRESS.md`.');
  pm += '\n| Page | Name | Routes | Roles | Features | Design | Implementation | Contract | Bridge | Data | Verification | Docs |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n';
  for (const m of pages) {
    const s = m.status;
    const routes = [...(m.routes ?? []).map((r) => `\`${r}\``), ...(m.plannedRoutes ?? []).map((r) => `\`${r}\` (planned)`)];
    pm += `| ${m.id} | ${cell(m.name)} | ${routes.join('<br>') || '(shell)'} | ${(m.roles ?? []).join(', ') || 'signed out'} | ${m.semanticFeatures.join(', ')} | ${s.design} | ${s.implementation} | ${s.contract} | ${s.bridge} | ${s.data} | ${s.verification} | ${s.docs} |\n`;
  }
  pm += '\nA page gets its ID when its build starts (D-60, D-67); a page not designed yet has none. Every v2 page (`design/handoff/VERSIONS.md`) is registered: Team Hub P010, Rounds P011, Classes P012, CoachHelm P013, with player Home under P002. Current state and what is left: `docs/clubhouse/STATUS.md`.\n';
  out['docs/clubhouse/generated/CLUBHOUSE_PAGE_MAP.md'] = pm;
  out['docs/clubhouse/generated/CLUBHOUSE_ROUTE_MAP.md'] = renderRouteMap({ pages, otherRoutes });

  let bm = GEN_HEAD('Clubhouse Bridge map', 'Every Bridge ID (D-68: namespace, two-digit category, two-digit item), its catalog code and its meaning. IDs are permanent; retired ones move to `config/clubhouse/bridge-tombstones.json`.');
  bm += '\n## How catalog kinds become categories\n\n`config/clubhouse/category-map.json`. A row takes its kind\'s default unless it is listed as an exception.\n\n| Catalog kind | Default category |\n| --- | --- |\n';
  for (const [k, d] of Object.entries(map.kindDefaults)) bm += `| ${k} ${d.kind} | ${pad2(d.category)} ${cats[d.category]} |\n`;
  bm += '\n| Exception | Category | Why |\n| --- | --- | --- |\n';
  for (const [code, o] of Object.entries(map.overrides)) bm += `| ${code} | ${pad2(o.category)} ${cats[o.category]} | ${cell(o.why)} |\n`;
  bm += '\n## Count by page and category\n\n| Page | ' + Array.from({ length: CATEGORY_COUNT }, (_, i) => pad2(i + 1)).join(' | ') + ' | Total |\n| --- |' + ' --- |'.repeat(CATEGORY_COUNT + 1) + '\n';
  for (const m of pages) {
    const mine = bridge.filter((r) => r.page === m.id);
    bm += `| ${m.id} | ` + Array.from({ length: CATEGORY_COUNT }, (_, i) => mine.filter((r) => r.category === i + 1).length || '—').join(' | ') + ` | ${mine.length} |\n`;
  }
  for (const m of pages) {
    const mine = bridge.filter((r) => r.page === m.id);
    if (!mine.length) continue;
    bm += `\n## ${m.id} ${m.name}\n\n| Bridge ID | Code | Category | Name | Status | Meaning |\n| --- | --- | --- | --- | --- | --- |\n`;
    for (const r of mine) bm += `| ${r.id} | ${r.chCode ?? '—'} | ${pad2(r.category)} ${cats[r.category]} | \`${r.name}\` | ${r.status} | ${cell(r.meaning)} |\n`;
  }
  // A table, as every other list on this map: a reason runs as long as it needs (a table row is not held to the prose
  // line length), and the columns read the same way as the pages' tables above.
  bm += `\n## Tombstones\n\n${
    tombstones.length
      ? `| Bridge ID | Removed | Replaced by | Reason |\n| --- | --- | --- | --- |\n${tombstones.map((t) => `| ${t.id} | ${t.removedAt} | ${t.replacement ?? '—'} | ${cell(t.reason)} |`).join('\n')}`
      : 'None yet.'
  }\n`;
  out['docs/clubhouse/generated/CLUBHOUSE_BRIDGE_MAP.md'] = bm;

  let am = GEN_HEAD('Clubhouse action map', 'Every registered action: page, component, handler, service, data, Bridge outcomes and tests. Actions are registered when a page\'s WIRING.md is written.');
  const actions = pages.flatMap((m) => (m.actions ?? []).map((a) => ({ ...a, page: m.id })));
  am += actions.length ? '\n| Action | Page | Label | Component | Handler | useAction | Service | Data | Bridge | Tests |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n' : '\nNo actions registered yet.\n';
  for (const a of actions) am += `| ${a.id} | ${a.page} | ${cell(a.label)} | \`${a.component ?? ''}\` | ${cell(a.handler)} | ${cell(actionCallNames(a).join(', '))} | \`${a.service ?? ''}\` | ${cell((a.data ?? []).join(', '))} | ${cell(Object.entries(a.bridge ?? {}).filter(([, id]) => id != null).map(([k, id]) => `${k} ${id}`).join(', '))} | ${cell((a.tests ?? []).join(', '))} |\n`;
  out['docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md'] = am;

  let hm = GEN_HEAD('Clubhouse held map', 'Held features and data plans (D-61), by page. Nothing here is applied or active until the owner releases it.');
  hm += '\n| Page | Plan | Status | Migration |\n| --- | --- | --- | --- |\n';
  for (const m of pages) {
    for (const plan of m.held ?? []) {
      const md = exists(plan) ? read(plan) : '';
      hm += `| ${m.id} ${m.name} | \`${plan}\` | ${/^Status:\s*(\S+)/m.exec(md)?.[1] ?? '?'} | ${/^Migration:\s*(.+)$/m.exec(md)?.[1] ?? '—'} |\n`;
    }
  }
  out['docs/clubhouse/generated/CLUBHOUSE_HELD_MAP.md'] = hm;

  let st = GEN_HEAD('Clubhouse status', 'Facts per page, from the manifests and the Bridge registry. Gate evidence lives in `docs/clubhouse/PROGRESS.md`.');
  for (const m of pages) {
    const mine = bridge.filter((r) => r.page === m.id);
    const s = m.status;
    const cats = new Set(mine.map((r) => r.category));
    st += `\n## ${m.id} ${m.name}\n\n- Design: ${s.design}\n- Implementation: ${s.implementation}\n- Contract: ${s.contract}; ${cats.size} of 25 categories have catalog contracts\n- Bridge: ${s.bridge}; ${mine.length} IDs, ${mine.filter((r) => r.status === 'implemented').length} on an element or in code, ${mine.filter((r) => r.status === 'reserved').length} reserved\n- Data: ${s.data}; ${(m.held ?? []).length} held plan(s)\n- Verification: ${s.verification}\n- Docs: ${s.docs}\n`;
  }
  out['docs/clubhouse/generated/CLUBHOUSE_STATUS.md'] = st;

  out['docs/clubhouse/AUDITS.md'] = renderAudits({ audits, manifests: pages, head: GEN_HEAD });

  // The Bridge graph (plan §3): the one file the Bridge screens and the signal route read.
  out[GRAPH_PATH] = renderGraph(buildBridgeGraph({ manifests: pages, bridge, tombstones, catalogs, codeIndex, surfaceIndex, auditFiles, ledgers, read, exists }));

  // Each page's PAGE.md carries a generated Related block (links to its docs, code, audits and tracker row).
  for (const m of pages) {
    const path = `docs/clubhouse/pages/${m.id}-${m.slug}/PAGE.md`;
    if (m.status.docs !== 'missing' && exists(path)) out[path] = renderRelated({ m, audits, exists, existing: read(path) });
  }

  // Each started page's CONTRACT.md tables follow the registry; its notes are kept.
  for (const m of pages) {
    const path = `docs/clubhouse/pages/${m.id}-${m.slug}/CONTRACT.md`;
    if (m.status.docs === 'missing' || !exists(path)) continue;
    out[path] = renderContract({ m, bridge, cats, existing: read(path) });
  }
  return out;
}

// ── Loading from disk ──

export function load(root) {
  const r = (p) => readFileSync(join(root, p), 'utf8');
  const ex = (p) => existsSync(join(root, p));
  const pagesDir = 'config/clubhouse/pages';
  const manifests = ex(pagesDir)
    ? readdirSync(join(root, pagesDir))
        .filter((n) => /^P\d{3}-.+\.json$/.test(n))
        .map((n) => ({ ...JSON.parse(r(`${pagesDir}/${n}`)), _file: `${pagesDir}/${n}` }))
    : [];
  const catalogDir = 'docs/clubhouse/catalog';
  const catalogs = Object.fromEntries(
    readdirSync(join(root, catalogDir))
      .filter((n) => n.endsWith('.md') && n !== 'README.md')
      .map((n) => [`${catalogDir}/${n}`, r(`${catalogDir}/${n}`)]),
  );
  const json = (p, d) => (ex(p) ? JSON.parse(r(p)) : d);
  const migrationsDir = 'supabase/migrations';
  const migrations = Object.fromEntries(
    readdirSync(join(root, migrationsDir))
      .filter((n) => n.endsWith('.sql'))
      .map((n) => [`${migrationsDir}/${n}`, r(`${migrationsDir}/${n}`)]),
  );
  // The code index (plan §4.6): every CH- code written anywhere in src, and the files that write it. Tests and
  // generated files (the flag registry quotes codes in prose) don't count as writing one.
  const codeIndex = new Map();
  // The surfaces the code reports under (chReport, SectionBoundary, chLogServer): `surface: 'home.leaderboard'`.
  const surfaceIndex = new Map();
  const walk = (dir) => {
    for (const n of readdirSync(join(root, dir), { withFileTypes: true })) {
      const p = `${dir}/${n.name}`;
      if (n.isDirectory()) {
        if (n.name !== '__tests__' && n.name !== 'node_modules') walk(p);
      } else if (/\.tsx?$/.test(n.name) && !/\.(generated|test|spec)\.tsx?$/.test(n.name)) {
        const text = r(p);
        for (const m of text.matchAll(/CH-(\d{4,5})(?!\d)/g)) {
          const code = `CH-${m[1]}`;
          if (!codeIndex.has(code)) codeIndex.set(code, new Set());
          codeIndex.get(code).add(p);
        }
        for (const m of text.matchAll(/surface[=:]\s*\{?['"`]([a-z][\w-]*\.[\w.-]+)['"`]/g)) {
          if (!surfaceIndex.has(m[1])) surfaceIndex.set(m[1], new Set());
          surfaceIndex.get(m[1]).add(p);
        }
      }
    }
  };
  walk('src');
  const used = new Set(codeIndex.keys());
  const golfPages = [];
  const pagesUnder = (dir) => {
    for (const n of readdirSync(join(root, dir), { withFileTypes: true })) {
      const p = `${dir}/${n.name}`;
      if (n.isDirectory()) {
        if (p !== 'src/app/golf/admin') pagesUnder(p);
      } else if (n.name === 'page.tsx') golfPages.push(p);
    }
  };
  if (ex('src/app/golf')) pagesUnder('src/app/golf');
  // Each audit's findings and number checks feed the graph (plan §3: findings, numberChecks).
  const auditDir = 'docs/clubhouse/audit';
  const auditFiles = {};
  if (ex(auditDir)) {
    for (const d of readdirSync(join(root, auditDir), { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const base = `${auditDir}/${d.name}`;
      if (ex(`${base}/findings.jsonl`)) auditFiles[`${base}/findings.jsonl`] = r(`${base}/findings.jsonl`);
      if (ex(`${base}/numbers`)) {
        for (const n of readdirSync(join(root, `${base}/numbers`))) if (/^P\d{3}-.+\.md$/.test(n)) auditFiles[`${base}/numbers/${n}`] = r(`${base}/numbers/${n}`);
      }
    }
  }
  // The control ledgers (plan §4.7), kept by clickable-map.mjs --assign; the graph carries them as `controls`.
  const ledgerDir = 'config/clubhouse/controls';
  const ledgers = {};
  if (ex(ledgerDir)) for (const n of readdirSync(join(root, ledgerDir)).sort()) if (/^P\d{3}\.json$/.test(n)) ledgers[n.slice(0, 4)] = JSON.parse(r(`${ledgerDir}/${n}`));
  return {
    manifests,
    ledgers,
    golfPages: golfPages.sort(),
    otherRoutes: json('config/clubhouse/other-routes.json', []),
    rows: parseCatalogRows(catalogs),
    bridge: json('config/clubhouse/bridge-contracts.json', []),
    tombstones: json('config/clubhouse/bridge-tombstones.json', []),
    map: json('config/clubhouse/category-map.json', { kindDefaults: {}, overrides: {}, categories: {} }),
    features: registryFeatureIds(r('memory/registry.yml')),
    progressMd: r('docs/clubhouse/PROGRESS.md'),
    readmeMd: r('docs/clubhouse/README.md'),
    audits: json('config/clubhouse/audits.json', []),
    docs: readdirSync(join(root, 'docs/clubhouse')).filter((n) => n.endsWith('.md')),
    heldMd: r('supabase/migrations/HELD.md'),
    migrations,
    used,
    codeIndex,
    surfaceIndex,
    catalogs,
    auditFiles,
    exists: ex,
    read: r,
  };
}

/** The full registry check, including drift in the bridge file and the generated docs. */
export function runRegistryCheck(root) {
  const ctx = load(root);
  const v = checkRegistry(ctx);
  const synced = syncAll(ctx);
  if (JSON.stringify(synced) !== JSON.stringify(ctx.bridge)) v.push('config/clubhouse/bridge-contracts.json is out of date with the catalog; run node scripts/clubhouse/registry.mjs sync');
  for (const [p, content] of Object.entries(generateDocs({ ...ctx, bridge: synced }))) {
    if (!ctx.exists(p) || ctx.read(p) !== content) v.push(`${p} is stale; run node scripts/clubhouse/registry.mjs sync`);
  }
  return { violations: v, pages: ctx.manifests.length, ids: synced.length };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const cmd = process.argv[2] ?? 'check';
  if (cmd === 'sync') {
    const ctx = load(root);
    const bridge = syncAll(ctx);
    writeFileSync(join(root, 'config/clubhouse/bridge-contracts.json'), JSON.stringify(bridge, null, 2) + '\n');
    if (!ctx.exists('config/clubhouse/bridge-tombstones.json')) writeFileSync(join(root, 'config/clubhouse/bridge-tombstones.json'), '[]\n');
    for (const [p, content] of Object.entries(generateDocs({ ...ctx, bridge }))) {
      mkdirSync(dirname(join(root, p)), { recursive: true });
      writeFileSync(join(root, p), content);
    }
    console.log(`registry sync: ${bridge.length} Bridge IDs (${bridge.length - ctx.bridge.length} new), ${ctx.manifests.length} pages.`);
  }
  const { violations, pages, ids } = runRegistryCheck(root);
  if (violations.length) {
    console.error(`clubhouse registry: ${violations.length} violation(s):`);
    for (const x of violations) console.error('  ' + x);
    process.exit(1);
  }
  console.log(`clubhouse registry clean: ${pages} pages, ${ids} Bridge IDs.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
