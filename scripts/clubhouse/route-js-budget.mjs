#!/usr/bin/env node
/**
 * route-js-budget: gzipped first-load JavaScript per Clubhouse route, read from a finished `next build`.
 *
 * MAC-11 (production audit, 15 Nov 2026) set the budget: 300 KB of gzipped JavaScript per route. The numbers come only
 * from build output, never a browser: the build manifest's `rootMainFiles` (the runtime every page loads) plus, for each
 * page, the `entryJSFiles` of every server-component entry its client reference manifest lists (the root and nested
 * layouts, templates, loading, error and not-found files, and the page). App Router writes those entries' chunks into
 * the first response as scripts, whether or not the component they hold renders, so a client screen a route imports
 * but does not draw still counts here. Chunks a page loads later (`next/dynamic`, `import()`) are not first load.
 *
 * Read only: it never builds, writes or fetches. Works on Turbopack and webpack App Router output.
 *
 * Usage: node scripts/clubhouse/route-js-budget.mjs [options]
 *   --next <dir>        the .next directory to read (default: ./.next)
 *   --budget-kb <n>     gzipped KB per route (default: 300; 1 KB = 1,000 bytes)
 *   --prefix <path>     only routes whose address starts with this (default: /golf/dashboard, the Clubhouse app)
 *   --all               every App Router page, not only the prefix
 *   --route <address>   one route; with --chunks, its chunks
 *   --chunks            per chunk: gzipped size and the client modules that pull it in (largest first)
 *   --top <n>           with --chunks, how many chunks to list (default: 15)
 *   --json              machine-readable output (per route: gzip, raw, and `own`, the gzipped JS beyond what every
 *                       route measured shares)
 *   --report-only       always exit 0 (print what is over budget, fail nothing)
 *   --help              this text
 * Exit 0 when every route is within budget (or --report-only), 1 when one is over, 2 on bad input.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import vm from 'node:vm';

export const DEFAULT_BUDGET_KB = 300;
export const DEFAULT_PREFIX = '/golf/dashboard';
const MANIFEST_SUFFIX = '_client-reference-manifest.js';

/** `/golf/(dashboard)/dashboard/qualifiers/[id]/page` → `/golf/dashboard/qualifiers/[id]`: route groups and slots drop out. */
export function routeAddress(entry) {
  const parts = entry.split('/').filter(Boolean);
  if (parts.at(-1) === 'page') parts.pop();
  const kept = parts.filter((p) => !(p.startsWith('(') && p.endsWith(')')) && !p.startsWith('@'));
  return `/${kept.join('/')}`;
}

/** Every `page_client-reference-manifest.js` under `server/app`, as absolute paths. */
export function findPageManifests(nextDir) {
  const root = join(nextDir, 'server', 'app');
  const out = [];
  if (!existsSync(root)) return out;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name === `page${MANIFEST_SUFFIX}`) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

/** Evaluates a client reference manifest in an empty sandbox (it only assigns `globalThis.__RSC_MANIFEST[...]`). */
export function readClientManifest(file) {
  const sandbox = { __RSC_MANIFEST: {} };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.runInNewContext(readFileSync(file, 'utf8'), sandbox, { filename: file, timeout: 5000 });
  const entries = Object.entries(sandbox.__RSC_MANIFEST);
  if (entries.length !== 1) throw new Error(`${file}: expected one manifest entry, found ${entries.length}`);
  const [entry, manifest] = entries[0];
  return { entry, manifest };
}

const normalizeChunk = (chunk) => chunk.replace(/^\/?_next\//, '').replace(/^\//, '');

/** The gzipped and raw byte size of one chunk, memoised per build. */
export function chunkSizer(nextDir) {
  const cache = new Map();
  return (chunk) => {
    const key = normalizeChunk(chunk);
    if (!cache.has(key)) {
      const file = join(nextDir, key);
      if (!existsSync(file)) {
        cache.set(key, { raw: 0, gzip: 0, missing: true });
      } else {
        const buf = readFileSync(file);
        cache.set(key, { raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length, missing: false });
      }
    }
    return cache.get(key);
  };
}

/** The JS chunks a page's first response loads: the runtime plus every server-component entry's chunks. */
export function firstLoadChunks(rootMainFiles, manifest) {
  const set = new Set(rootMainFiles.map(normalizeChunk));
  for (const files of Object.values(manifest.entryJSFiles ?? {})) for (const f of files) if (f.endsWith('.js')) set.add(normalizeChunk(f));
  return [...set];
}

/** Which client modules (by source path) need each chunk, for `--chunks`: the way to find the import that pulls a chunk in. */
export function chunkOwners(manifest) {
  const owners = new Map();
  for (const [mod, ref] of Object.entries(manifest.clientModules ?? {})) {
    const name = mod.split('#')[0].replace(/^\[project\]\//, '').replace(/ <[^>]*>$/, '');
    for (const c of ref.chunks ?? []) {
      if (typeof c !== 'string' || !c.endsWith('.js')) continue;
      const key = normalizeChunk(c);
      if (!owners.has(key)) owners.set(key, new Set());
      owners.get(key).add(name);
    }
  }
  return owners;
}

/**
 * Measures every page of a build. Returns rows sorted largest first: { route, entry, gzip, raw, chunks, over, missing }.
 * `prefix` null keeps every route.
 */
export function measureBuild(nextDir, { budgetKb = DEFAULT_BUDGET_KB, prefix = DEFAULT_PREFIX } = {}) {
  const buildManifestFile = join(nextDir, 'build-manifest.json');
  if (!existsSync(buildManifestFile)) throw new Error(`${nextDir} has no build-manifest.json: is it a finished next build?`);
  const buildManifest = JSON.parse(readFileSync(buildManifestFile, 'utf8'));
  const rootMainFiles = buildManifest.rootMainFiles ?? [];
  const size = chunkSizer(nextDir);
  const budget = budgetKb * 1000;
  const rows = [];
  for (const file of findPageManifests(nextDir)) {
    const { entry, manifest } = readClientManifest(file);
    const route = routeAddress(entry);
    if (prefix && !(route === prefix || route.startsWith(`${prefix}/`))) continue;
    const chunks = firstLoadChunks(rootMainFiles, manifest);
    let gzip = 0;
    let raw = 0;
    const missing = [];
    for (const c of chunks) {
      const s = size(c);
      gzip += s.gzip;
      raw += s.raw;
      if (s.missing) missing.push(c);
    }
    rows.push({ route, entry, manifestFile: file, gzip, raw, chunks: chunks.length, chunkList: chunks, over: gzip > budget, missing });
  }
  rows.sort((a, b) => b.gzip - a.gzip || a.route.localeCompare(b.route));
  // What every measured route loads (the runtime and the shared layouts), and each route's JS beyond it.
  const shared = rows.length ? new Set(rows[0].chunkList.filter((c) => rows.every((r) => r.chunkList.includes(c)))) : new Set();
  for (const r of rows) r.ownGzip = r.chunkList.filter((c) => !shared.has(c)).reduce((acc, c) => acc + size(c).gzip, 0);
  const sharedGzip = [...shared].reduce((acc, c) => acc + size(c).gzip, 0);
  const runtime = rootMainFiles.reduce((acc, c) => acc + size(c).gzip, 0);
  return { rows, runtimeGzip: runtime, sharedGzip, budget, buildId: readBuildId(nextDir) };
}

function readBuildId(nextDir) {
  try {
    return readFileSync(join(nextDir, 'BUILD_ID'), 'utf8').trim();
  } catch {
    return null;
  }
}

/** One route's chunks, largest first, each with the client modules that list it. */
export function routeChunks(nextDir, row) {
  const buildManifest = JSON.parse(readFileSync(join(nextDir, 'build-manifest.json'), 'utf8'));
  const { manifest } = readClientManifest(row.manifestFile);
  const size = chunkSizer(nextDir);
  const owners = chunkOwners(manifest);
  const runtime = new Set((buildManifest.rootMainFiles ?? []).map(normalizeChunk));
  return firstLoadChunks(buildManifest.rootMainFiles ?? [], manifest)
    .map((c) => ({ chunk: c, ...size(c), runtime: runtime.has(c), owners: [...(owners.get(c) ?? [])].sort() }))
    .sort((a, b) => b.gzip - a.gzip);
}

const kb = (bytes) => (bytes / 1000).toFixed(1);

export function parseArgs(argv) {
  const opts = { next: '.next', budgetKb: DEFAULT_BUDGET_KB, prefix: DEFAULT_PREFIX, route: null, chunks: false, top: 15, json: false, reportOnly: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--next') opts.next = value();
    else if (a === '--budget-kb') opts.budgetKb = Number(value());
    else if (a === '--prefix') opts.prefix = value();
    else if (a === '--all') opts.prefix = null;
    else if (a === '--route') opts.route = value();
    else if (a === '--chunks') opts.chunks = true;
    else if (a === '--top') opts.top = Number(value());
    else if (a === '--json') opts.json = true;
    else if (a === '--report-only') opts.reportOnly = true;
    else throw new Error(`unknown option ${a}`);
  }
  if (!Number.isFinite(opts.budgetKb) || opts.budgetKb <= 0) throw new Error('--budget-kb must be a positive number');
  if (!Number.isInteger(opts.top) || opts.top <= 0) throw new Error('--top must be a positive whole number');
  return opts;
}

function usage() {
  const text = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const block = text.slice(text.indexOf('/**') + 3, text.indexOf('*/'));
  return block.split('\n').map((l) => l.replace(/^ \* ?/, '')).join('\n').trim();
}

export function main(argv = process.argv.slice(2), log = console.log) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    log(`route-js-budget: ${error.message}\n\n${usage()}`);
    return 2;
  }
  if (opts.help) {
    log(usage());
    return 0;
  }
  const nextDir = resolve(opts.next);
  let result;
  try {
    result = measureBuild(nextDir, { budgetKb: opts.budgetKb, prefix: opts.route ? null : opts.prefix });
  } catch (error) {
    log(`route-js-budget: ${error.message}`);
    return 2;
  }
  let rows = result.rows;
  if (opts.route) rows = rows.filter((r) => r.route === opts.route);
  if (opts.route && rows.length === 0) {
    log(`route-js-budget: no page at ${opts.route} in ${relative(process.cwd(), nextDir) || nextDir}`);
    return 2;
  }
  const over = rows.filter((r) => r.over);
  if (opts.json) {
    const payload = {
      buildId: result.buildId,
      budgetBytes: result.budget,
      runtimeGzipBytes: result.runtimeGzip,
      sharedGzipBytes: result.sharedGzip,
      routes: rows.map(({ route, gzip, raw, ownGzip, chunks, over: o, missing }) => ({ route, gzipBytes: gzip, rawBytes: raw, ownGzipBytes: ownGzip, chunks, over: o, missing })),
    };
    if (opts.chunks) payload.chunks = Object.fromEntries(rows.map((r) => [r.route, routeChunks(nextDir, r).slice(0, opts.top)]));
    log(JSON.stringify(payload, null, 2));
  } else {
    log(`First-load JS per route, gzipped (build ${result.buildId ?? 'unknown'}; budget ${kb(result.budget)} KB; runtime every page loads ${kb(result.runtimeGzip)} KB; shared by every route listed ${kb(result.sharedGzip)} KB)`);
    const width = Math.max(5, ...rows.map((r) => r.route.length));
    log(`${'route'.padEnd(width)}  ${'gzip KB'.padStart(8)}  ${'own KB'.padStart(7)}  ${'raw KB'.padStart(8)}  chunks`);
    for (const r of rows) {
      log(`${r.route.padEnd(width)}  ${kb(r.gzip).padStart(8)}  ${kb(r.ownGzip).padStart(7)}  ${kb(r.raw).padStart(8)}  ${String(r.chunks).padStart(6)}${r.over ? '  OVER' : ''}${r.missing.length ? `  (${r.missing.length} chunk files missing)` : ''}`);
    }
    log('(own KB: gzipped JS beyond what every route listed shares, i.e. what this route adds to the shell)');
    if (opts.chunks) {
      for (const r of rows) {
        log(`\n${r.route}: largest ${opts.top} chunks`);
        for (const c of routeChunks(nextDir, r).slice(0, opts.top)) {
          const who = c.runtime ? 'runtime (rootMainFiles)' : c.owners.filter((o) => o.startsWith('src/')).slice(0, 6).join(', ') || c.owners.slice(0, 3).join(', ') || '(no client module lists it)';
          log(`  ${kb(c.gzip).padStart(7)} KB gz  ${kb(c.raw).padStart(8)} KB  ${c.chunk}  ${who}`);
        }
      }
    }
    log(over.length ? `\n${over.length} of ${rows.length} routes over ${kb(result.budget)} KB gzipped.` : `\nAll ${rows.length} routes within ${kb(result.budget)} KB gzipped.`);
  }
  return over.length && !opts.reportOnly ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
