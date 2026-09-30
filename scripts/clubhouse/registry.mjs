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
export const bridgeId = (ns, category, item) => Number(`${ns}${pad2(category)}${pad2(item)}`);
/** Decodes from the right, so any namespace width works. */
export function decodeBridgeId(id) {
  const s = String(id);
  return { ns: Number(s.slice(0, -4)), category: Number(s.slice(-4, -2)), item: Number(s.slice(-2)) };
}

// ── Catalog rows ──

/** The kind digit follows the page prefix: one digit for 4-digit codes, two for 5-digit. */
export const kindOf = (num) => num[num.length - 3];

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
 * Every rule the Foundation V2 plan asks the registry to hold. `ctx` carries
 * the parsed sources and two file accessors so tests can run it in memory.
 */
export function checkRegistry(ctx) {
  const { manifests, bridge, tombstones, rows, map, features, progressMd, heldMd, exists, read, migrations } = ctx;
  const v = [];
  const ids = new Set();
  const namespaces = new Map();
  const slugs = new Set();
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
      if (!/^\/golf\/dashboard(\/|$)/.test(r)) v.push(`${at}: route ${r} is not under /golf/dashboard`);
      else if (!exists(routeToPage(r))) v.push(`${at}: route ${r} has no ${routeToPage(r)}`);
    }
    if (!(m.routes ?? []).length && m.id !== 'P001') v.push(`${at}: no routes`);
    for (const r of m.roles ?? []) if (!['coach', 'player'].includes(r)) v.push(`${at}: role ${r} is not coach or player`);
    for (const f of m.semanticFeatures ?? []) if (!features.has(f)) v.push(`${at}: semantic feature ${f} is not in memory/registry.yml`);
    if (!(m.semanticFeatures ?? []).length) v.push(`${at}: no semantic features`);
    const s = m.status ?? {};
    const enums = { design: DESIGN, implementation: IMPLEMENTATION, contract: CONTRACT, bridge: BRIDGE, data: DATA, verification: VERIFICATION, docs: DOCS };
    for (const [k, list] of Object.entries(enums)) if (!enumIs(s[k], list)) v.push(`${at}: status.${k} "${s[k]}" is not one of ${list.join(', ')}`);
    const impl = m.implementation ?? {};
    if (s.implementation !== 'not_started') {
      for (const p of [impl.root, impl.loader, impl.styles, ...(impl.tests ?? [])].filter(Boolean)) if (!exists(p)) v.push(`${at}: implementation path ${p} does not exist`);
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
      }
      for (const p of [a.component, a.service].filter(Boolean)) if (!exists(p.split('#')[0])) v.push(`${at}: ${a.id} path ${p} does not exist`);
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

/**
 * Rebuilds CONTRACT.md's contract tables from the registry and keeps what a
 * person wrote: the preamble, each category's Status line and its notes. A
 * section that named the shell's contracts ("From the shell (P001): …") gets
 * that line regenerated too. A new page starts from the template's headings.
 */
export function renderContract({ m, bridge, cats, existing }) {
  const pad = (n) => pad2(n);
  const esc = (s) => String(s).replace(/\|/g, '\\|');
  const pre = existing ? existing.split(/^## 01 — /m)[0] : `# ${m.id} — ${m.name}: page contract\n\n`;
  const sections = new Map();
  if (existing) {
    const parts = existing.split(/^## (\d{2}) — .*$/m);
    for (let i = 1; i < parts.length; i += 2) {
      const body = parts[i + 1] ?? '';
      const lines = body.split('\n');
      const status = lines.find((l) => /^Status:/.test(l.trim()))?.trim() ?? 'Status:';
      const prose = lines
        .filter((l) => !/^Status:/.test(l.trim()) && !l.startsWith('|') && !l.startsWith('From the shell (P001):'))
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
    if (sec.shell && shell.length) out += `From the shell (P001): ${shell.map((r) => `${r.id} ${r.chCode ?? r.name}`).join(', ')}.\n\n`;
  }
  return out.replace(/\n+$/, '\n');
}

// ── Generated docs ──

const GEN_HEAD = (title, what) => `# ${title}\n\n<!-- Generated by node scripts/clubhouse/registry.mjs sync. Do not edit; edit the sources under config/clubhouse/ and docs/clubhouse/catalog/. -->\n\n${what}\n`;
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function generateDocs({ manifests, bridge, map, tombstones, read, exists }) {
  const pages = [...manifests].sort((a, b) => a.id.localeCompare(b.id));
  const cats = map.categories;
  const out = {};

  let pm = GEN_HEAD('Clubhouse page map', 'Every registered page: identity, routes, roles, semantic features and status. The overview gates stay in `docs/clubhouse/PROGRESS.md`.');
  pm += '\n| Page | Name | Routes | Roles | Features | Design | Implementation | Contract | Bridge | Data | Verification | Docs |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n';
  for (const m of pages) {
    const s = m.status;
    pm += `| ${m.id} | ${cell(m.name)} | ${(m.routes ?? []).map((r) => `\`${r}\``).join('<br>') || '(shell)'} | ${m.roles.join(', ')} | ${m.semanticFeatures.join(', ')} | ${s.design} | ${s.implementation} | ${s.contract} | ${s.bridge} | ${s.data} | ${s.verification} | ${s.docs} |\n`;
  }
  pm += '\nPages not designed yet have no ID (D-60). The v2 design (`design/handoff/VERSIONS.md`) adds CoachHelm, Team Hub, player Home, Rounds and Classes; they are registered when their build starts (D-67).\n';
  out['docs/clubhouse/generated/CLUBHOUSE_PAGE_MAP.md'] = pm;

  let bm = GEN_HEAD('Clubhouse Bridge map', 'Every Bridge ID (D-68: namespace, two-digit category, two-digit item), its catalog code and its meaning. IDs are permanent; retired ones move to `config/clubhouse/bridge-tombstones.json`.');
  bm += '\n## How catalog kinds become categories\n\n`config/clubhouse/category-map.json`. A row takes its kind\'s default unless it is listed as an exception.\n\n| Catalog kind | Default category |\n| --- | --- |\n';
  for (const [k, d] of Object.entries(map.kindDefaults)) bm += `| ${k} ${d.kind} | ${pad2(d.category)} ${cats[d.category]} |\n`;
  bm += '\n| Exception | Category | Why |\n| --- | --- | --- |\n';
  for (const [code, o] of Object.entries(map.overrides)) bm += `| ${code} | ${pad2(o.category)} ${cats[o.category]} | ${cell(o.why)} |\n`;
  bm += '\n## Count by page and category\n\n| Page | ' + Array.from({ length: CATEGORY_COUNT }, (_, i) => pad2(i + 1)).join(' | ') + ' | Total |\n| --- |' + ' --- |'.repeat(CATEGORY_COUNT + 1) + '\n';
  for (const m of pages) {
    const mine = bridge.filter((r) => r.page === m.id);
    bm += `| ${m.id} | ` + Array.from({ length: CATEGORY_COUNT }, (_, i) => mine.filter((r) => r.category === i + 1).length || '').join(' | ') + ` | ${mine.length} |\n`;
  }
  for (const m of pages) {
    const mine = bridge.filter((r) => r.page === m.id);
    if (!mine.length) continue;
    bm += `\n## ${m.id} ${m.name}\n\n| Bridge ID | Code | Category | Name | Status | Meaning |\n| --- | --- | --- | --- | --- | --- |\n`;
    for (const r of mine) bm += `| ${r.id} | ${r.chCode ?? ''} | ${pad2(r.category)} ${cats[r.category]} | \`${r.name}\` | ${r.status} | ${cell(r.meaning)} |\n`;
  }
  bm += `\n## Tombstones\n\n${tombstones.length ? tombstones.map((t) => `- ${t.id}: ${t.reason} (${t.removedAt}${t.replacement ? `, replaced by ${t.replacement}` : ''})`).join('\n') : 'None yet.'}\n`;
  out['docs/clubhouse/generated/CLUBHOUSE_BRIDGE_MAP.md'] = bm;

  let am = GEN_HEAD('Clubhouse action map', 'Every registered action: page, component, handler, service, data, Bridge outcomes and tests. Actions are registered when a page\'s WIRING.md is written.');
  const actions = pages.flatMap((m) => (m.actions ?? []).map((a) => ({ ...a, page: m.id })));
  am += actions.length ? '\n| Action | Page | Label | Component | Handler | Service | Data | Bridge | Tests |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n' : '\nNo actions registered yet.\n';
  for (const a of actions) am += `| ${a.id} | ${a.page} | ${cell(a.label)} | \`${a.component ?? ''}\` | ${cell(a.handler)} | \`${a.service ?? ''}\` | ${cell((a.data ?? []).join(', '))} | ${cell(Object.entries(a.bridge ?? {}).filter(([, id]) => id != null).map(([k, id]) => `${k} ${id}`).join(', '))} | ${cell((a.tests ?? []).join(', '))} |\n`;
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
  const used = new Set();
  const walk = (dir) => {
    for (const n of readdirSync(join(root, dir), { withFileTypes: true })) {
      const p = `${dir}/${n.name}`;
      if (n.isDirectory()) {
        if (n.name !== '__tests__') walk(p);
      } else if (/\.tsx?$/.test(n.name)) for (const m of r(p).matchAll(/CH-(\d{4,5})(?!\d)/g)) used.add(`CH-${m[1]}`);
    }
  };
  walk('src/clubhouse');
  return {
    manifests,
    rows: parseCatalogRows(catalogs),
    bridge: json('config/clubhouse/bridge-contracts.json', []),
    tombstones: json('config/clubhouse/bridge-tombstones.json', []),
    map: json('config/clubhouse/category-map.json', { kindDefaults: {}, overrides: {}, categories: {} }),
    features: registryFeatureIds(r('memory/registry.yml')),
    progressMd: r('docs/clubhouse/PROGRESS.md'),
    heldMd: r('supabase/migrations/HELD.md'),
    migrations,
    used,
    exists: ex,
    read: r,
  };
}

/** The full registry check, including drift in the bridge file and the generated docs. */
export function runRegistryCheck(root) {
  const ctx = load(root);
  const v = checkRegistry(ctx);
  const synced = syncBridge({ existing: ctx.bridge, rows: ctx.rows, manifests: ctx.manifests, map: ctx.map, tombstones: ctx.tombstones, used: ctx.used });
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
    const bridge = syncBridge({ existing: ctx.bridge, rows: ctx.rows, manifests: ctx.manifests, map: ctx.map, tombstones: ctx.tombstones, used: ctx.used });
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
