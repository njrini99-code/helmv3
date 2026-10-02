#!/usr/bin/env node
/**
 * clubhouse:shots — one naming and filing convention for Clubhouse page screenshots.
 *
 * Screenshots are never committed (CONTRIBUTING.md). They live in a local,
 * gitignored store, `.helm/screenshots/clubhouse/` (CLUBHOUSE_SHOTS_DIR
 * overrides it), and travel in the PR description. Layout:
 *
 *   <P###-slug>/<YYYY-MM-DD>/<P###>__<surface>__<role>__<viewport>__<state>__<phase>__<sha7>.png
 *   <P###-slug>/<YYYY-MM-DD>/manifest.json     one entry per file (record)
 *
 * role is coach|player|none; viewport is a CSS width, optionally x<height>
 * (390, 1440, 390x844); phase is before|after|baseline|evidence; surface and
 * state are kebab-case; sha7 is the commit the shot was taken on.
 *
 * Usage:
 *   clubhouse:shots -- name --page P007 --surface list --role coach --viewport 390 --state unread-mixed --phase before
 *       prints the full path (creates the directory); save the screenshot there
 *   clubhouse:shots -- record <file> --route /golf/dashboard/messages [--fixture ..] [--browser ..] [--note ..]
 *       appends the file's manifest entry
 *   clubhouse:shots -- import <file> --page P007 --surface list --role coach --viewport 390 --state unread-mixed --phase before [--route ..]
 *       moves a loose capture into the store under its label and records it
 *   clubhouse:shots -- check     every file name and directory against the convention and the page manifests
 *                                (a no-op success when there is no store, as in CI); warns, never fails, about
 *                                Clubhouse captures left in the scratch dirs (SCRATCH_DIRS) instead of the store
 *   clubhouse:shots -- index     writes INDEX.md in the store, grouped by page
 *   clubhouse:shots -- gallery [--page P007] [--no-open]
 *       writes a local HTML gallery per page (<store>/<P###-slug>/GALLERY.html, before and after side by side, filters by role
 *       and viewport) and <store>/GALLERY.html; opens it from a terminal. record and import regenerate their page's gallery
 *   clubhouse:shots -- log --page P007 [--write]
 *       prints (or, with --write, appends to the page's VERIFY.md "Screenshots" table) one row per recorded file
 *       that the table does not list yet; each row is read from the manifest, nothing is made up
 */
import { constants as fsConstants, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadManifests } from './changelog-gate.mjs';
import { renderGallery, renderIndex, sortShots } from './gallery.mjs';

export const STORE = '.helm/screenshots/clubhouse';
export const ROLES = ['coach', 'player', 'none'];
export const PHASES = ['before', 'after', 'baseline', 'evidence'];
export const NAME_PATTERN = '<P###>__<surface>__<coach|player|none>__<viewport>__<state>__<before|after|baseline|evidence>__<sha7>.png';

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VIEWPORT = /^\d{3,4}(?:x\d{3,4})?$/;
const NAME_RE = /^(P\d{3})__([a-z0-9]+(?:-[a-z0-9]+)*)__(coach|player|none)__(\d{3,4}(?:x\d{3,4})?)__([a-z0-9]+(?:-[a-z0-9]+)*)__(before|after|baseline|evidence)__([0-9a-f]{7})\.png$/;

/** Problems with the fields of a screenshot name; empty when it is valid. */
export function validateFields(f) {
  const p = [];
  if (!/^P\d{3}$/.test(f.page ?? '')) p.push(`page "${f.page}" is not P###`);
  if (!KEBAB.test(f.surface ?? '')) p.push(`surface "${f.surface}" is not kebab-case`);
  if (!ROLES.includes(f.role)) p.push(`role "${f.role}" is not ${ROLES.join('|')}`);
  if (!VIEWPORT.test(f.viewport ?? '')) p.push(`viewport "${f.viewport}" is not a CSS width like 390 or 1440x900`);
  if (!KEBAB.test(f.state ?? '')) p.push(`state "${f.state}" is not kebab-case`);
  if (!PHASES.includes(f.phase)) p.push(`phase "${f.phase}" is not ${PHASES.join('|')}`);
  if (!/^[0-9a-f]{7}$/.test(f.sha7 ?? '')) p.push(`sha7 "${f.sha7}" is not 7 hex characters`);
  return p;
}

export function buildName(f) {
  const problems = validateFields(f);
  if (problems.length) throw new Error(problems.join('; '));
  return `${f.page}__${f.surface}__${f.role}__${f.viewport}__${f.state}__${f.phase}__${f.sha7}.png`;
}

/** The fields of a screenshot file name, or null when it does not follow the convention. */
export function parseName(name) {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  const [, page, surface, role, viewport, state, phase, sha7] = m;
  return { page, surface, role, viewport, state, phase, sha7 };
}

const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const pageDir = (pages, id) => `${id}-${pages.get(id)}`;

/** Page id to slug, from config/clubhouse/pages/P###-<slug>.json. */
export function loadPages(root) {
  const dir = join(root, 'config/clubhouse/pages');
  const pages = new Map();
  if (!existsSync(dir)) return pages;
  for (const n of readdirSync(dir).filter((x) => /^P\d{3}-.+\.json$/.test(x))) {
    const m = JSON.parse(readFileSync(join(dir, n), 'utf8'));
    pages.set(m.id, m.slug);
  }
  return pages;
}

/**
 * Checks a store listing. `files` are store-relative posix paths; `manifests`
 * maps a `<page dir>/<date>` to its parsed manifest.json (an array), or null
 * when it did not parse. Returns violations (exit 1) and warnings (exit 0:
 * a shot with no manifest entry, an entry with no shot).
 */
export function checkStore({ files, pages, manifests = {} }) {
  const violations = [];
  const warnings = [];
  const shots = new Set();
  for (const file of files) {
    const seg = file.split('/');
    // The generated files: INDEX.md and GALLERY.html at the store's root, GALLERY.html in a page directory.
    if (seg[0].startsWith('.') || seg[seg.length - 1].startsWith('.') || file === 'INDEX.md' || (seg[seg.length - 1] === 'GALLERY.html' && seg.length <= 2)) continue;
    if (seg.length !== 3) {
      violations.push(`${file}: misfiled; expected <P###-slug>/<YYYY-MM-DD>/<file>`);
      continue;
    }
    const [dir, date, name] = seg;
    const dm = /^(P\d{3})-(.+)$/.exec(dir);
    if (!dm || pages.get(dm[1]) !== dm[2]) violations.push(`${file}: "${dir}" is not a page directory (${[...pages].map(([id, s]) => `${id}-${s}`).join(', ') || 'no page manifests found'})`);
    if (!validDate(date)) violations.push(`${file}: "${date}" is not a YYYY-MM-DD date`);
    if (name === 'manifest.json') {
      if (manifests[`${dir}/${date}`] === null) violations.push(`${file}: is not valid JSON (an array of entries)`);
      continue;
    }
    const f = parseName(name);
    if (!f) {
      violations.push(`${file}: unlabeled; name it ${NAME_PATTERN} (npm run clubhouse:shots -- name ...)`);
      continue;
    }
    if (dm && f.page !== dm[1]) violations.push(`${file}: misfiled; the name says ${f.page} but the directory is ${dir}`);
    shots.add(`${dir}/${date}/${name}`);
  }
  for (const key of shots) {
    const dateDir = key.split('/').slice(0, 2).join('/');
    const entries = manifests[dateDir];
    if (!Array.isArray(entries) || !entries.some((e) => e.file === key.split('/')[2])) warnings.push(`${key}: no manifest entry; run clubhouse:shots -- record`);
  }
  for (const [dateDir, entries] of Object.entries(manifests)) {
    if (!Array.isArray(entries)) continue;
    for (const e of entries) if (!shots.has(`${dateDir}/${e.file}`)) warnings.push(`${dateDir}/manifest.json: entry ${e.file} has no file`);
  }
  return { violations, warnings };
}

/**
 * The `## Screenshots` evidence log in a page's VERIFY.md: the section must
 * exist, and every row's label must be a convention-named file of this page
 * whose phase matches the phase column, with a commit and a description.
 */
export function checkScreenshotLog(md, at, pageId) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^##\s+Screenshots\s*$/.test(l));
  if (start < 0) return [`${at}: no "## Screenshots" section (docs/clubhouse/README.md section 8)`];
  const v = [];
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  const rows = lines.slice(start + 1, end < 0 ? undefined : end).filter((l) => l.trim().startsWith('|'));
  for (const row of rows.slice(2)) {
    const [label, phase, commit, shows] = row.split('|').slice(1, -1).map((c) => c.trim());
    const name = (label ?? '').replace(/`/g, '');
    const f = parseName(name);
    if (!f) v.push(`${at}: Screenshots row "${name}" is not a convention file name (${NAME_PATTERN})`);
    else {
      if (f.page !== pageId) v.push(`${at}: Screenshots row ${name} is for ${f.page}, not ${pageId}`);
      if (phase !== f.phase) v.push(`${at}: Screenshots row ${name} says phase "${phase}" but the file name says ${f.phase}`);
    }
    if (!commit) v.push(`${at}: Screenshots row ${name} has no commit`);
    if (!shows) v.push(`${at}: Screenshots row ${name} does not say what it shows`);
  }
  return v;
}

/** The VERIFY.md table rows for these manifest entries (label, phase, commit, what it shows), skipping labels already listed. */
export function logRows(entries, existingMd = '') {
  const cell = (x) => String(x ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
  return entries
    .filter((e) => parseName(e.file) && !existingMd.includes(e.file))
    .sort((a, b) => a.file.localeCompare(b.file))
    .map((e) => {
      const f = parseName(e.file);
      const shows = `${f.surface} (${f.role}), ${f.viewport}px, ${f.state}${e.fixture ? `; ${String(e.fixture).replace(/ \(synthetic preview fixture\)/, ', synthetic preview fixture')}` : ''}`;
      return `| \`${e.file}\` | ${f.phase} | ${f.sha7} | ${cell(shows)} |`;
    });
}

/** `md` with `rows` appended to the end of its "## Screenshots" table; unchanged when there are none or no section. */
export function appendRows(md, rows) {
  if (!rows.length) return md;
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^##\s+Screenshots\s*$/.test(l));
  if (start < 0) return md;
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  let last = -1;
  for (let i = start + 1; i < (end < 0 ? lines.length : end); i += 1) if (lines[i].trim().startsWith('|')) last = i;
  if (last < 0) return md;
  lines.splice(last + 1, 0, ...rows);
  return lines.join('\n');
}

/** Scratch directories where captures pile up; a Clubhouse capture left there is unlabeled and unlogged. */
export const SCRATCH_DIRS = ['.dev-screenshots', 'e2e-screenshots', 'test-results', '.playwright-mcp', '.helm/runtime'];
const IMAGE = /\.(png|jpe?g|webp)$/i;

/** Whether a scratch image's path says it is a Clubhouse capture (clubhouse, ui-audit, ch-, a page id or a page slug). */
export function looksClubhouse(path, pages) {
  if (/clubhouse|ui-audit|(^|[/_.-])ch[-_]|(^|[^A-Za-z0-9])P\d{3}([^0-9]|$)/i.test(path)) return true;
  return [...pages.values()].filter((slug) => slug.length > 3).some((slug) => new RegExp(`(^|[^a-z0-9])${slug}([^a-z0-9]|$)`, 'i').test(path));
}

/** The scratch images (repo-relative) that look like Clubhouse captures and so belong in the store. */
export const looseCaptures = (images, pages) => images.filter((f) => IMAGE.test(f) && looksClubhouse(f, pages));

// ── CLI ──

const rootDir = () => resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const storeDir = (root) => resolve(process.env.CLUBHOUSE_SHOTS_DIR ?? join(root, STORE));
const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fail = (msg) => {
  console.error(`clubhouse:shots: ${msg}`);
  process.exit(1);
};

function scanStore(dir) {
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(relative(dir, p).split(sep).join('/'));
    }
  };
  walk(dir);
  const manifests = {};
  for (const f of files.filter((x) => x.split('/').length === 3 && x.endsWith('/manifest.json'))) {
    try {
      const parsed = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      manifests[dirname(f)] = Array.isArray(parsed) ? parsed : null;
    } catch {
      manifests[dirname(f)] = null;
    }
  }
  return { files, manifests };
}

/** The store path for a screenshot with these options (creates its directory). `date` is the default capture date. */
export function shotPath(opts, root, date) {
  const pages = loadPages(root);
  if (!pages.has(opts.page)) fail(`page "${opts.page}" is not in config/clubhouse/pages (${[...pages.keys()].join(', ')})`);
  let sha7 = opts.sha;
  if (!sha7) {
    try {
      sha7 = git(root, ['rev-parse', 'HEAD']).slice(0, 7);
    } catch {
      fail('cannot read the git HEAD; pass --sha <7 hex>');
    }
  }
  const day = opts.date ?? date;
  if (!validDate(day)) fail(`--date "${day}" is not YYYY-MM-DD`);
  let name;
  try {
    name = buildName({ page: opts.page, surface: opts.surface, role: opts.role, viewport: opts.viewport, state: opts.state, phase: opts.phase, sha7 });
  } catch (e) {
    fail(e.message);
  }
  const dir = join(storeDir(root), pageDir(pages, opts.page), day);
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

const cmdName = (opts, root) => console.log(shotPath(opts, root, today()));

function cmdImport(file, opts, root) {
  if (!file) fail('import needs the loose capture file');
  const src = resolve(file);
  if (!/\.png$/i.test(src)) fail(`${basename(src)} is not a PNG; the convention is .png, so capture it again as PNG`);
  const routes = loadManifests(root).find((m) => m.id === opts.page)?.routes ?? [];
  const route = opts.route ?? (routes.length === 1 ? routes[0] : undefined);
  if (!route) fail(`${opts.page} has ${routes.length} routes; pass --route`);
  let mtime;
  try {
    mtime = statSync(src).mtime;
  } catch {
    fail(`${file} does not exist`);
  }
  const dest = shotPath(opts, root, `${mtime.getFullYear()}-${String(mtime.getMonth() + 1).padStart(2, '0')}-${String(mtime.getDate()).padStart(2, '0')}`);
  // An exclusive copy, then the original goes: nothing is overwritten and no path is checked before it is used.
  try {
    copyFileSync(src, dest, fsConstants.COPYFILE_EXCL);
  } catch (e) {
    fail(e.code === 'EEXIST' ? `${dest} already exists; not overwriting` : `cannot copy ${file}: ${e.message}`);
  }
  unlinkSync(src);
  recordShot(dest, { ...opts, route }, root);
  console.log(`imported ${basename(src)} -> ${dest}`);
}

/** Appends a screenshot's manifest entry (`extra` fields are kept as given); exits 1 on a bad name, path or route. */
export function recordShot(file, opts, root, extra = {}, { gallery = true } = {}) {
  if (!file) fail('record needs the screenshot file');
  const abs = resolve(file);
  // One stat, read once: no exists-check before the stat that uses it (CodeQL js/file-system-race).
  let shotStat;
  try {
    shotStat = statSync(abs);
  } catch {
    fail(`${file} does not exist`);
  }
  const f = parseName(basename(abs));
  if (!f) fail(`${basename(abs)} does not follow ${NAME_PATTERN}`);
  if (!opts.route) fail('record needs --route');
  const pages = loadPages(root);
  const rel = relative(storeDir(root), abs).split(sep);
  if (rel.length !== 3 || rel[0] !== pageDir(pages, f.page) || !validDate(rel[1])) fail(`${file} must sit in ${storeDir(root)}/${pageDir(pages, f.page)}/<YYYY-MM-DD>/ (clubhouse:shots -- name gives the path)`);
  let commit = f.sha7;
  try {
    commit = git(root, ['rev-parse', '--verify', '--quiet', `${f.sha7}^{commit}`]) || commit;
  } catch {
    // keep sha7: the commit is not in this clone
  }
  const entry = {
    file: basename(abs),
    page: f.page,
    surface: f.surface,
    route: opts.route,
    role: f.role,
    viewport: f.viewport,
    state: f.state,
    phase: f.phase,
    commit,
    browser: opts.browser ?? null,
    fixture: opts.fixture ?? null,
    capturedAt: shotStat.mtime.toISOString(),
    note: opts.note ?? null,
    ...extra,
  };
  const manifest = join(dirname(abs), 'manifest.json');
  let entries = [];
  try {
    entries = JSON.parse(readFileSync(manifest, 'utf8'));
    if (!Array.isArray(entries)) fail(`${manifest} is not an array`);
  } catch (e) {
    if (e.code !== 'ENOENT') fail(`${manifest} is not valid JSON`);
  }
  writeFileSync(manifest, JSON.stringify([...entries.filter((e) => e.file !== entry.file), entry], null, 2) + '\n');
  if (gallery) regenerateGallery(root, f.page);
  console.log(`recorded ${entry.file}`);
}

function scanScratch(root, pages) {
  const images = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      if (e.isDirectory()) walk(join(d, e.name));
      else images.push(relative(root, join(d, e.name)).split(sep).join('/'));
    }
  };
  for (const d of SCRATCH_DIRS.filter((x) => existsSync(join(root, x)))) walk(join(root, d));
  return looseCaptures(images, pages);
}

function cmdCheck(root) {
  const pages = loadPages(root);
  const loose = scanScratch(root, pages);
  if (loose.length) {
    console.warn(`  warning: ${loose.length} Clubhouse capture(s) sit in scratch dirs, not the store (first: ${loose.slice(0, 5).join(', ')}${loose.length > 5 ? ', ...' : ''}); label each with clubhouse:shots -- import <file> --page P### ...`);
  }
  const dir = storeDir(root);
  if (!existsSync(dir)) {
    console.log(`clubhouse:shots check: no screenshot store at ${dir.startsWith(root) ? relative(root, dir) : dir}; nothing to check.`);
    return;
  }
  const { files, manifests } = scanStore(dir);
  const { violations, warnings } = checkStore({ files, pages, manifests });
  for (const w of warnings) console.warn(`  warning: ${w}`);
  if (violations.length) {
    console.error(`clubhouse:shots check found ${violations.length} problem(s):`);
    for (const x of violations) console.error('  ' + x);
    process.exit(1);
  }
  console.log(`clubhouse:shots check clean: ${files.filter((f) => f.endsWith('.png')).length} screenshot(s), ${warnings.length + (loose.length ? 1 : 0)} warning(s).`);
}

function cmdLog(opts, root) {
  const pages = loadPages(root);
  if (!pages.has(opts.page)) fail(`page "${opts.page}" is not in config/clubhouse/pages`);
  const dir = join(storeDir(root), pageDir(pages, opts.page));
  if (!existsSync(dir)) fail(`no screenshots for ${opts.page} in ${dir}`);
  const entries = [];
  for (const day of readdirSync(dir)) {
    const m = join(dir, day, 'manifest.json');
    if (existsSync(m)) entries.push(...JSON.parse(readFileSync(m, 'utf8')));
  }
  const verify = join(root, 'docs/clubhouse/pages', pageDir(pages, opts.page), 'VERIFY.md');
  const md = existsSync(verify) ? readFileSync(verify, 'utf8') : '';
  const rows = logRows(entries, md);
  if (!opts.write) return console.log(rows.join('\n') || '(every recorded file is already listed)');
  writeFileSync(verify, appendRows(md, rows));
  console.log(`${verify}: ${rows.length} row(s) added`);
}

/** A page's recorded shots (newest first), each with the `date` of its directory; entries whose file is gone are left out. */
export function pageShots(root, pageId) {
  const pages = loadPages(root);
  const dir = join(storeDir(root), pageDir(pages, pageId));
  const shots = [];
  let days = [];
  try {
    days = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && validDate(d.name)).map((d) => d.name);
  } catch {
    return shots;
  }
  for (const day of days) {
    let entries = [];
    let present = new Set();
    try {
      present = new Set(readdirSync(join(dir, day)));
      entries = JSON.parse(readFileSync(join(dir, day, 'manifest.json'), 'utf8'));
    } catch {
      continue;
    }
    if (Array.isArray(entries)) for (const e of entries) if (e.file && present.has(e.file)) shots.push({ ...e, date: day });
  }
  return sortShots(shots);
}

/** Writes the page's GALLERY.html and the store's top-level one; returns the page gallery's path. Never throws for a missing store. */
export function writeGallery(root, pageId) {
  const pages = loadPages(root);
  const store = storeDir(root);
  const slug = pages.get(pageId);
  if (!slug) return null;
  const shots = pageShots(root, pageId);
  mkdirSync(join(store, pageDir(pages, pageId)), { recursive: true });
  const file = join(store, pageDir(pages, pageId), 'GALLERY.html');
  writeFileSync(file, renderGallery({ page: pageId, slug, shots }));
  const index = [];
  for (const [id, sl] of [...pages].sort(([a], [b]) => a.localeCompare(b))) {
    const list = id === pageId ? shots : pageShots(root, id);
    if (list.length) index.push({ page: id, slug: sl, count: list.length, latest: list[0].date });
  }
  writeFileSync(join(store, 'GALLERY.html'), renderIndex(index));
  return file;
}

/** record and import keep the gallery current; a failure here must never fail a capture. */
function regenerateGallery(root, pageId) {
  try {
    writeGallery(root, pageId);
  } catch {
    // the gallery is a convenience; the manifest is the record
  }
}

function cmdGallery(opts, root) {
  const pages = loadPages(root);
  const store = storeDir(root);
  if (!existsSync(store)) fail(`no screenshot store at ${store}`);
  const ids = opts.page ? [opts.page] : readdirSync(store).map((n) => /^(P\d{3})-/.exec(n)?.[1]).filter((id) => id && pages.has(id));
  if (opts.page && !pages.has(opts.page)) fail(`page "${opts.page}" is not in config/clubhouse/pages`);
  const written = ids.map((id) => writeGallery(root, id)).filter(Boolean);
  const target = opts.page ? written[0] : join(store, 'GALLERY.html');
  if (!target) fail('no screenshots to show');
  console.log(`wrote ${written.length} gallery page(s); open ${target}`);
  if (!opts['no-open'] && process.stdout.isTTY && process.platform === 'darwin') execFileSync('open', [target]);
}

function cmdIndex(root) {
  const dir = storeDir(root);
  if (!existsSync(dir)) fail(`no screenshot store at ${dir}`);
  const { files, manifests } = scanStore(dir);
  const byPage = new Map();
  for (const f of files.filter((x) => x.endsWith('.png') && x.split('/').length === 3)) {
    const [page, date, name] = f.split('/');
    const entry = (manifests[`${page}/${date}`] ?? []).find((e) => e.file === name);
    byPage.set(page, [...(byPage.get(page) ?? []), { date, name, p: parseName(name), entry }]);
  }
  const out = ['# Clubhouse screenshots (local, gitignored)', '', `Generated ${new Date().toISOString()} by \`npm run clubhouse:shots -- index\`.`];
  for (const page of [...byPage.keys()].sort()) {
    out.push('', `## ${page}`, '', '| Date | Surface | Role | Viewport | State | Phase | Commit | Route | Note | File |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const { date, name, p, entry } of byPage.get(page).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))) {
      const cell = (x) => String(x ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
      out.push(`| ${date} | ${cell(p?.surface)} | ${cell(p?.role)} | ${cell(p?.viewport)} | ${cell(p?.state)} | ${cell(p?.phase)} | ${cell(p?.sha7)} | ${cell(entry?.route)} | ${cell(entry?.note)} | ${name} |`);
    }
  }
  writeFileSync(join(dir, 'INDEX.md'), out.join('\n') + '\n');
  console.log(`wrote ${join(dir, 'INDEX.md')} (${[...byPage.values()].reduce((n, x) => n + x.length, 0)} screenshot(s), ${byPage.size} page(s))`);
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: { ...Object.fromEntries(['page', 'surface', 'role', 'viewport', 'state', 'phase', 'sha', 'date', 'route', 'fixture', 'browser', 'note'].map((k) => [k, { type: 'string' }])), write: { type: 'boolean' }, 'no-open': { type: 'boolean' } },
  });
  const root = rootDir();
  if (cmd === 'name') cmdName(values, root);
  else if (cmd === 'record') recordShot(positionals[0], values, root);
  else if (cmd === 'import') cmdImport(positionals[0], values, root);
  else if (cmd === 'check') cmdCheck(root);
  else if (cmd === 'index') cmdIndex(root);
  else if (cmd === 'gallery') cmdGallery(values, root);
  else if (cmd === 'log') cmdLog(values, root);
  else fail('usage: clubhouse:shots -- <name|record|import|check|index|gallery|log> (see the header of scripts/clubhouse/shots.mjs)');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
