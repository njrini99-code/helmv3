#!/usr/bin/env node
/**
 * clubhouse:check — mechanical enforcement for the Clubhouse rebuild.
 *
 * Two jobs:
 *   1. Keep src/clubhouse/ a fresh tree: no Fairway imports, tokens, scope
 *      classes or haptics module; CSS scoped to .ch-* / [data-ui]; only
 *      --ch-* custom properties; each page stylesheet anchors only its
 *      own classes (css-owners.mjs).
 *   2. Hold the design doctrine the compiler can't: red only for under par,
 *      no emoji, no exclamation marks in copy, no tracked uppercase, no
 *      count-ups, no staggers but the first-paint reveal (.ch-reveal in
 *      base.css), durations only from the v2 tokens (D-64).
 * It also validates docs/clubhouse/PROGRESS.md so the tracker can't drift
 * into a state its own gates forbid.
 *
 * Usage: node scripts/clubhouse/check.mjs [--root <dir>]
 * Exit 0 clean, 1 on any violation.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRegistryCheck } from './registry.mjs';
import { checkClassOwners } from './css-owners.mjs';

const RED_TOKENS = /var\(--ch-(score-under|chart-flag|danger-600)\)/;
const RED_ALLOWED_CONTEXT = /under|birdie|eagle|flag|danger|error|invalid/i;
/** v2 motion (D-64): press, quick, base, release, reveal, in seconds. */
const ALLOWED_DURATIONS_S = new Set(['0', '0.11', '.11', '0.18', '.18', '0.26', '.26', '0.28', '.28', '0.52', '.52']);
const STATUSES = /^(todo|doing|done|blocked \(.+\))$/;
const GATES = ['spec', 'desktop', 'wired', 'states', 'error-tracking', 'phone-spec', 'phone', 'motion', 'accessibility', 'performance', 'verified'];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '__tests__') continue;
      walk(p, out);
    } else out.push(p);
  }
  return out;
}

/** Strip comments so doctrine words inside explanations don't trip the scan. */
function stripComments(src, ext) {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  if (ext !== '.css') s = s.replace(/(^|[^:'"`])\/\/.*$/gm, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  return s;
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

export function checkSource(file, raw) {
  const ext = extname(file);
  const v = [];
  const src = stripComments(raw, ext);
  const add = (i, msg) => v.push(`${file}:${lineOf(src, i)} ${msg}`);
  const scan = (re, msg) => {
    for (const m of src.matchAll(re)) add(m.index, msg);
  };

  // 1. Isolation
  scan(/@\/components\/fairway|@\/lib\/fairway|@\/lib\/redesign|fairwayScope|FAIRWAY_SCOPE|fairway-ds/g, 'imports or references the Fairway UI');
  // `--keyboard-height` is the iOS shell's keyboard contract (CapacitorProvider,
  // memory/features/ios-native-shell.md): MOBILE.md requires a phone composer or
  // sheet footer to lift by it, so it is the one foreign property allowed.
  scan(/var\(--(?!ch-|keyboard-height\b)[a-z]/g, 'reads a non-Clubhouse custom property (use --ch-*)');
  scan(/--fw-/g, 'references a Fairway token');

  // 2. Doctrine
  scan(/\p{Extended_Pictographic}/gu, 'contains an emoji');
  scan(/text-transform:\s*uppercase|\buppercase\b|tracking-(wide|wider|widest)/g, 'tracked or uppercase text is banned');
  scan(/staggerChildren|delayChildren|staggerDirection|\bstagger\(/g, 'staggers are banned (the first-paint reveal is .ch-reveal)');
  scan(/--ch-dur-(instant|slow)\b|--ch-press-scale|CH_PRESS_SCALE/g, 'retired motion token (D-64): use press, quick, base, release or reveal');
  scan(/count-?up|CountUp|useCountUp|animateNumber|useMotionValue\(.*\)\s*.*toFixed/gi, 'count-up animation is banned');

  if (ext === '.css') {
    if (!file.endsWith('tokens.css')) {
      scan(/\b(?!1ms\b)\d+ms\b/g, 'literal duration: use var(--ch-dur-*)');
      scan(/cubic-bezier\(/g, 'literal easing: use var(--ch-ease)');
    }
    // Selector scoping + red-token context, per rule block.
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    for (const m of src.matchAll(ruleRe)) {
      const selector = m[1].trim();
      const body = m[2];
      if (selector.startsWith('@') || /^(from|to|\d+%)/.test(selector)) continue;
      const parts = selector.split(',').map((s) => s.trim()).filter(Boolean);
      for (const part of parts) {
        if (!/\.ch-|\[data-ui=/.test(part)) add(m.index, `unscoped selector "${part}"`);
      }
      if (RED_TOKENS.test(body) && !RED_ALLOWED_CONTEXT.test(selector)) {
        add(m.index, `red token outside an under-par/flag/danger context in "${selector}"`);
      }
    }
  } else {
    // TS/TSX: exclamation marks in user-facing strings or JSX text.
    scan(/[A-Za-z.)]!(?=['"`<]|\s+[A-Z'"`])/g, 'exclamation mark in copy');
    if (!file.endsWith('lib/motion.ts')) {
      for (const m of src.matchAll(/duration:\s*([\d.]+)/g)) {
        if (!ALLOWED_DURATIONS_S.has(m[1])) add(m.index, `duration ${m[1]} is off the scale (use CH_DUR)`);
      }
    }
    for (const m of src.matchAll(/(?:className|class)=["'{][^>]*?\b(fw-[a-z]|dp-[a-z])/g)) {
      add(m.index, 'uses a prototype or Fairway class name; port it as .ch-*');
    }
    if (RED_TOKENS.test(src)) {
      for (const m of src.matchAll(new RegExp(RED_TOKENS.source, 'g'))) {
        const line = src.split('\n')[lineOf(src, m.index) - 1] ?? '';
        if (!RED_ALLOWED_CONTEXT.test(line)) add(m.index, 'red token used outside an under-par/flag/danger context');
      }
    }
  }
  return v;
}

export function parseChecklist(md) {
  const sections = new Map();
  let cur = null;
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+([a-z-]+)\s*$/);
    if (h) {
      cur = { open: 0, closed: 0 };
      sections.set(h[1], cur);
      continue;
    }
    if (!cur) continue;
    if (/^\s*- \[ \]/.test(line)) cur.open += 1;
    else if (/^\s*- \[x\]/i.test(line)) cur.closed += 1;
  }
  return sections;
}

export function checkProgress(md, exists = existsSync, root = '.', read = (p) => readFileSync(p, 'utf8')) {
  const v = [];
  const block = md.split('<!-- clubhouse:screens:start -->')[1]?.split('<!-- clubhouse:screens:end -->')[0];
  if (!block) return ['PROGRESS.md: screens table markers missing'];
  const rows = block.trim().split('\n').slice(2);
  for (const row of rows) {
    const cells = row.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 2 + GATES.length) {
      v.push(`PROGRESS.md: row "${cells[0]}" has ${cells.length} cells, expected ${2 + GATES.length}`);
      continue;
    }
    const [screen, , ...states] = cells;
    const st = Object.fromEntries(GATES.map((g, i) => [g, states[i]]));
    for (const g of GATES) {
      if (!STATUSES.test(st[g])) v.push(`PROGRESS.md: ${screen} ${g} has invalid status "${st[g]}"`);
    }
    if (st.verified === 'done' && GATES.some((g) => st[g] !== 'done')) {
      v.push(`PROGRESS.md: ${screen} is verified but not every gate is done`);
    }
    if (st.phone === 'done' && st['phone-spec'] !== 'done') {
      v.push(`PROGRESS.md: ${screen} phone is done without an approved phone-spec`);
    }
    if (st.wired === 'done' && st.spec !== 'done') v.push(`PROGRESS.md: ${screen} is wired before its spec is done`);
    const slug = screen.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const started = GATES.slice(1).some((g) => st[g] === 'doing' || st[g] === 'done');
    const checklist = join(root, 'docs/clubhouse/screens', `${slug}.md`);
    if (started && !exists(checklist)) {
      v.push(`PROGRESS.md: ${screen} is past spec but ${checklist} is missing (copy CHECKLIST_TEMPLATE.md)`);
    } else if (started) {
      const sections = parseChecklist(read(checklist));
      for (const g of GATES) {
        if (st[g] !== 'done') continue;
        const sec = sections.get(g);
        if (!sec) v.push(`${checklist}: gate ${g} is done but the checklist has no "## ${g}" section`);
        else if (sec.open > 0) v.push(`${checklist}: gate ${g} is done but ${sec.open} item(s) are unchecked`);
      }
    }
    if (st['phone-spec'] === 'done') {
      const doc = join(root, 'docs/clubhouse/phone', `${slug}.md`);
      if (!exists(doc)) v.push(`PROGRESS.md: ${screen} phone-spec is done but ${doc} is missing`);
      else if (!/Status:\s*approved/i.test(read(doc))) {
        v.push(`PROGRESS.md: ${screen} phone-spec is done but ${doc} is not marked "Status: approved"`);
      }
    }
  }
  return v;
}

// ── State catalog (docs/clubhouse/catalog) ──

/**
 * Page prefixes. The first eight pages have one digit (CH-8001); every page
 * after them has two (CH-09001), so no existing number ever changes. A page
 * gets the next free prefix when its catalog is started, here and in
 * docs/clubhouse/catalog/README.md together.
 */
const CATALOG_PAGE = {
  shell: '1',
  home: '2',
  roster: '3',
  'stats-team': '4',
  'stats-player': '5',
  calendar: '6',
  messages: '7',
  settings: '8',
  qualifiers: '09',
  hub: '10',
  rounds: '11',
  classes: '12',
  coachhelm: '13',
};
/** Kinds whose rows must exist in code and in a test: toasts, validation, didn't load, empty, loading, confirm. */
const ENFORCED_KINDS = new Set(['0', '1', '2', '3', '4', '5']);
const CODE_RE = /CH-(\d{4,5})(?!\d)/g;
/** The kind digit follows the page prefix: one digit for 4-digit numbers, two for 5-digit. */
const kindOf = (num) => num[num.length - 3];

/**
 * Every number used in src/clubhouse is catalogued exactly once, in its
 * page's block; every enforced row (kinds 0-5) is used in code and named by a
 * test unless the row says `preview`; rows marked retired may not be used.
 * A catalog file for a page without a prefix is itself a violation.
 */
export function checkCatalog({ catalogs, sources, tests, pages = CATALOG_PAGE }) {
  const v = [];
  const rows = new Map();
  for (const [file, md] of Object.entries(catalogs)) {
    const page = file.replace(/^.*\//, '').replace(/\.md$/, '');
    const prefix = pages[page];
    if (!prefix) {
      v.push(`${file}: no page number for "${page}"; add it to CATALOG_PAGE in scripts/clubhouse/check.mjs and to the catalog README`);
      continue;
    }
    for (const line of md.split('\n')) {
      const m = /^\|\s*CH-(\d{4,5})\s*\|/.exec(line);
      if (!m) continue;
      const num = m[1];
      if (rows.has(num)) v.push(`${file}: CH-${num} is catalogued twice`);
      if (!num.startsWith(prefix) || num.length !== prefix.length + 3) v.push(`${file}: CH-${num} is outside the ${page} block (${prefix}xxx)`);
      rows.set(num, { file, retired: /retired/i.test(line), previewOnly: /\|\s*preview\s*\|\s*$/.test(line.trim()) || /\|\s*existing\s*\|\s*$/.test(line.trim()) });
    }
  }
  const used = new Map();
  for (const [file, src] of Object.entries(sources)) {
    for (const m of src.matchAll(CODE_RE)) if (!used.has(m[1])) used.set(m[1], file);
  }
  const tested = new Set();
  for (const src of Object.values(tests)) for (const m of src.matchAll(CODE_RE)) tested.add(m[1]);
  for (const [num, file] of used) {
    const row = rows.get(num);
    if (!row) v.push(`${file}: CH-${num} is not in docs/clubhouse/catalog`);
    else if (row.retired) v.push(`${file}: CH-${num} is retired and may not be used`);
  }
  for (const [num, row] of rows) {
    if (row.retired || row.previewOnly || !ENFORCED_KINDS.has(kindOf(num))) continue;
    if (!used.has(num)) v.push(`${row.file}: CH-${num} is catalogued but not used in src/clubhouse`);
    if (!tested.has(num)) v.push(`${row.file}: CH-${num} has no test that names it`);
  }
  return v;
}

// ── Screens list (docs/clubhouse/SCREENS.md) ──

/** The rebuilt routes per role, read from CH_REBUILT_ROUTES in src/clubhouse/shell/nav.ts. */
export function readRebuiltRoutes(navTs) {
  const strings = (body) => [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const settings = strings(/const SETTINGS_ROUTES = \[([^\]]*)\]/.exec(navTs)?.[1] ?? '');
  const block = /CH_REBUILT_ROUTES[^=]*=\s*\{([\s\S]*?)\n\};/.exec(navTs)?.[1] ?? '';
  const role = (name) => {
    const body = new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`).exec(block)?.[1] ?? '';
    return new Set([...strings(body), ...(body.includes('...SETTINGS_ROUTES') ? settings : [])]);
  };
  return { coach: role('coach'), player: role('player') };
}

/**
 * Each line `- [x] **Name** `/route` — purpose` under "## Coaches" or
 * "## Players" is ticked exactly when its route is rebuilt for that role, and
 * every rebuilt route has a line.
 */
export function checkScreens(md, rebuilt) {
  const v = [];
  const listed = { coach: new Set(), player: new Set() };
  let role = null;
  for (const line of md.split('\n')) {
    if (/^## Coaches/.test(line)) role = 'coach';
    else if (/^## Players/.test(line)) role = 'player';
    else if (/^## /.test(line)) role = null;
    const m = /^- \[( |x)\] \*\*(.+?)\*\* `(\/[^`]*)`/.exec(line);
    if (!m || !role) continue;
    const route = m[3] === '/' ? '/golf/dashboard' : `/golf/dashboard${m[3]}`;
    listed[role].add(route);
    const ticked = m[1] === 'x';
    if (ticked && !rebuilt[role].has(route)) v.push(`SCREENS.md: ${m[2]} (${role}) is ticked but ${route} is not in CH_REBUILT_ROUTES`);
    if (!ticked && rebuilt[role].has(route)) v.push(`SCREENS.md: ${m[2]} (${role}) is rebuilt; tick it`);
  }
  for (const r of ['coach', 'player']) for (const route of rebuilt[r]) if (!listed[r].has(route)) v.push(`SCREENS.md: ${route} is rebuilt for the ${r} role but not listed`);
  return v;
}

/**
 * A 'use client' file may import only types from a server-only module (`import 'server-only'`): a value
 * import makes `next build` fail, and typecheck can't see it (the Stats phone shipped one once).
 * `sources` maps repo-relative paths under src/clubhouse to their text.
 */
export function checkServerOnlyImports(sources) {
  const v = [];
  const serverOnly = new Set(Object.entries(sources).filter(([, src]) => /^import 'server-only';/m.test(src)).map(([f]) => f));
  const resolve = (from, spec) => {
    const base = join(dirname(from), spec);
    return [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find((c) => serverOnly.has(c));
  };
  for (const [file, src] of Object.entries(sources)) {
    if (!/^\s*['"]use client['"]/.test(src)) continue;
    for (const m of src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+'(\.[^']+)'/g)) {
      if (m[1]) continue;
      const target = resolve(file, m[3]);
      if (!target) continue;
      const values = m[2].split(',').map((x) => x.trim()).filter((x) => x && !x.startsWith('type '));
      if (values.length) v.push(`${file}: imports ${values.join(', ')} from server-only ${target}; a client file may import only types from it`);
    }
  }
  return v;
}

function main() {
  const argRoot = process.argv.indexOf('--root');
  const root = argRoot > -1 ? process.argv[argRoot + 1] : join(fileURLToPath(new URL('.', import.meta.url)), '../..');
  const files = walk(join(root, 'src/clubhouse')).filter((f) => /\.(tsx?|css)$/.test(f));
  const violations = [];
  for (const f of files) violations.push(...checkSource(relative(root, f), readFileSync(f, 'utf8')));
  const styles = join(root, 'src/clubhouse/styles');
  if (existsSync(styles))
    violations.push(...checkClassOwners(Object.fromEntries(readdirSync(styles).filter((n) => n.endsWith('.css')).map((n) => [n, readFileSync(join(styles, n), 'utf8')]))));
  const progress = join(root, 'docs/clubhouse/PROGRESS.md');
  if (!existsSync(progress)) violations.push('docs/clubhouse/PROGRESS.md is missing');
  else violations.push(...checkProgress(readFileSync(progress, 'utf8'), existsSync, root));

  const catalogDir = join(root, 'docs/clubhouse/catalog');
  if (existsSync(catalogDir)) {
    const catalogs = Object.fromEntries(
      readdirSync(catalogDir)
        .filter((n) => n.endsWith('.md') && n !== 'README.md')
        .map((n) => [relative(root, join(catalogDir, n)), readFileSync(join(catalogDir, n), 'utf8')]),
    );
    const sources = Object.fromEntries(files.filter((f) => /\.tsx?$/.test(f)).map((f) => [relative(root, f), readFileSync(f, 'utf8')]));
    const testDir = join(root, 'src/clubhouse/__tests__');
    const tests = existsSync(testDir)
      ? Object.fromEntries(readdirSync(testDir).map((n) => [n, readFileSync(join(testDir, n), 'utf8')]))
      : {};
    violations.push(...checkCatalog({ catalogs, sources, tests }));
    violations.push(...checkServerOnlyImports(Object.fromEntries(Object.entries(sources).filter(([f]) => !f.includes('/__tests__/')))));
  }

  const screens = join(root, 'docs/clubhouse/SCREENS.md');
  if (!existsSync(screens)) violations.push('docs/clubhouse/SCREENS.md is missing');
  else violations.push(...checkScreens(readFileSync(screens, 'utf8'), readRebuiltRoutes(readFileSync(join(root, 'src/clubhouse/shell/nav.ts'), 'utf8'))));

  // Foundation V2 registry: page manifests, Bridge IDs, contracts, held plans, generated docs.
  const registry = runRegistryCheck(root);
  violations.push(...registry.violations);

  if (violations.length) {
    console.error(`clubhouse:check found ${violations.length} violation(s):`);
    for (const x of violations) console.error('  ' + x);
    process.exit(1);
  }
  console.log(`clubhouse:check clean: ${files.length} file(s), tracker valid, ${registry.pages} pages and ${registry.ids} Bridge IDs registered.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
