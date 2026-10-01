#!/usr/bin/env node
/**
 * Clubhouse perf harness (swap audit, 2026-10-01): a production build served against the LOCAL Supabase stack, a seeded team, and a
 * Playwright pass that records what a coach and a player feel on each route. Local only: every command reads `supabase status`,
 * refuses a URL that is not 127.0.0.1 or localhost, and the build is checked for the production project before the server starts.
 *
 *   node scripts/clubhouse/perf-measure.mjs seed [--players 8] [--rounds 12]   seed the team (state in .helm/runtime/clubhouse-perf/seed.json)
 *   node scripts/clubhouse/perf-measure.mjs build [--ref HEAD] [--cache]       export a committed ref, `npm run build` it against the local stack (~12 minutes;
 *                                                                               no webpack cache is kept unless --cache: it is 5 to 8 GB).
 *                                                                               HELM_PERF_SNAPSHOT=<dir> builds (and serves) from another directory, so a server keeps running meanwhile.
 *                                                                               --overlay <ref>:<path>[,...] lays files of another commit into the snapshot (never the checkout).
 *   node scripts/clubhouse/perf-measure.mjs serve [--port 3200]                 `next start`, detached, with the read tracer preloaded
 *   node scripts/clubhouse/perf-measure.mjs measure [--label before] [--runs 3] [--only home,stats] [--role coach,player] [--viewport 1280,390]
 *   node scripts/clubhouse/perf-measure.mjs report --before before --after after [--only home] [--before-geometry <label> --after-geometry <label>]
 *                                                                               two saved runs side by side, as markdown (geometry runs are their own `measure --only geometry`)
 *   node scripts/clubhouse/perf-measure.mjs stop                               stop the server
 *   node scripts/clubhouse/perf-measure.mjs remove                             delete the seeded team and its users (checked)
 *   node scripts/clubhouse/perf-measure.mjs status
 *
 * See e2e/README.md ("Clubhouse perf harness") for what is measured and how to read it.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, fstatSync, closeSync, rmSync, readdirSync, symlinkSync, realpathSync, lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure, report } from './perf-measure-run.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STATE_DIR = join(ROOT, '.helm', 'runtime', 'clubhouse-perf');
const SEED_FILE = join(STATE_DIR, 'seed.json');
const PID_FILE = join(STATE_DIR, 'server.pid');
const LOG_FILE = join(STATE_DIR, 'server.log');
const READS_FILE = join(STATE_DIR, 'reads.ndjson');
/**
 * The build and the server run from a snapshot of a committed ref, not from this checkout: other sessions edit files here while a
 * ten-minute build reads them (a half-written file failed the first build), and a measurement should name the commit it measured.
 * It lives outside the repo, so nothing in it is scanned by typecheck or lint; its `.next` (and webpack cache) stays between builds.
 */
const SNAPSHOT = process.env.HELM_PERF_SNAPSHOT ? resolve(process.env.HELM_PERF_SNAPSHOT) : join(homedir(), '.helm-perf', 'clubhouse-snapshot');
const BUILD_STAMP = join(SNAPSHOT, '.next', 'helm-perf-build.json');
const PRODUCTION_REF = 'qmnssrrolpinvwjjnufo';

/** Credentials and endpoints of outside services: blanked so a local build or run never talks to them (Sentry release upload, KV, mail, queues). */
const BLANKED = [
  'SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT', 'SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN', 'SENTRY_READ_TOKEN',
  'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'KV_REST_API_READ_ONLY_TOKEN', 'KV_URL', 'REDIS_URL',
  'RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET', 'OPS_DIGEST_RESEND_API_KEY', 'INNGEST_EVENT_KEY', 'INNGEST_SIGNING_KEY',
  'ANTHROPIC_API_KEY', 'GMAIL_SA_PRIVATE_KEY', 'GMAIL_SA_CLIENT_EMAIL', 'GITHUB_ISSUES_TOKEN', 'VERCEL_OIDC_TOKEN', 'VERCEL_API_TOKEN',
  'VAPID_PRIVATE_KEY', 'GOOGLE_CLIENT_SECRET', 'SUPABASE_ACCESS_TOKEN',
];

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
      else {
        out[a.slice(2)] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

/** The local stack's endpoints and keys, from `supabase status`; throws on anything that is not the local machine. */
export function localStack() {
  const raw = execFileSync(join(ROOT, 'node_modules', '.bin', 'supabase'), ['status', '-o', 'json'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const status = JSON.parse(raw.slice(raw.indexOf('{')));
  const host = new URL(status.API_URL).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error(`refusing: API_URL host ${host} is not local`);
  const dbUrl = status.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const dbHost = new URL(dbUrl).hostname;
  if (dbHost !== '127.0.0.1' && dbHost !== 'localhost') throw new Error(`refusing: DB_URL host ${dbHost} is not local`);
  return { status, dbUrl };
}

/**
 * Env for build and run. Supabase points at the local stack; outside-service credentials are blanked (a blank beats a missing value:
 * Next's .env loading never overrides a variable that is already set, and the app reads blanks as "not configured"). VERCEL_ENV is
 * `development` because the Clubhouse flag is off for `production` and NODE_ENV is `production` under `next start`.
 */
export function localEnv(extra = {}) {
  const { status, dbUrl } = localStack();
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SECRET_KEY: status.SECRET_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_DB_URL: dbUrl,
    VERCEL_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    ...extra,
  };
  for (const k of BLANKED) env[k] = '';
  delete env.HELM_CLUBHOUSE_TEAMS;
  return env;
}

function ensureDir() {
  mkdirSync(STATE_DIR, { recursive: true });
}

function readSeed() {
  if (!existsSync(SEED_FILE)) throw new Error('no seed: run `seed` first');
  return JSON.parse(readFileSync(SEED_FILE, 'utf8'));
}

async function loadSeedModule() {
  const { tsImport } = await import('tsx/esm/api');
  return tsImport('../../e2e/helpers/clubhouse-local-seed.ts', import.meta.url);
}

function serverPid() {
  if (!existsSync(PID_FILE)) return null;
  const pid = Number(readFileSync(PID_FILE, 'utf8'));
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

async function cmdSeed(a) {
  ensureDir();
  // The seed file is claimed before anything is seeded, by an exclusive create: a second run fails here, with nothing to undo, and
  // there is no gap between a check and the write (CodeQL js/file-system-race).
  let fd;
  try {
    fd = openSync(SEED_FILE, 'wx', 0o600);
  } catch (err) {
    if (err?.code === 'EEXIST') throw new Error(`a seed already exists (${SEED_FILE}); \`remove\` it first`);
    throw err;
  }
  let team;
  try {
    Object.assign(process.env, localEnv());
    const mod = await loadSeedModule();
    team = await mod.seedClubhouseTeam({ players: a.players ? Number(a.players) : undefined, roundsPerPlayer: a.rounds ? Number(a.rounds) : undefined });
    writeFileSync(fd, JSON.stringify(team, null, 2));
  } catch (err) {
    closeSync(fd);
    rmSync(SEED_FILE, { force: true });
    throw err;
  }
  closeSync(fd);
  console.log(`seeded team ${team.teamName} (${team.teamId}): ${JSON.stringify(team.counts)}`);
  console.log(`coach ${team.coach.email}; player ${team.players[0].email}`);
}

async function cmdRemove() {
  if (!existsSync(SEED_FILE)) {
    console.log('no seed to remove');
    return;
  }
  Object.assign(process.env, localEnv());
  const mod = await loadSeedModule();
  await mod.removeTeamSeed(readSeed());
  rmSync(SEED_FILE);
  rmSync(join(STATE_DIR, 'state-coach.json'), { force: true });
  rmSync(join(STATE_DIR, 'state-player.json'), { force: true });
  console.log('seed removed; nothing refers to it any more');
}

/** Every built file that carries the production project's id, i.e. a bundle that would talk to production from the browser or the server. */
function productionRefsIn(dir) {
  const hits = [];
  const walk = (d) => {
    // The directory listing says what each entry is, so no path is stat'ed and then opened (CodeQL js/file-system-race).
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const name = entry.name;
      const p = join(d, name);
      if (entry.isDirectory()) {
        walk(p);
        continue;
      }
      if (!entry.isFile() || !/\.(js|json|html|rsc|txt|map)$/.test(name)) continue;
      // Size and contents come from one open file, so the file checked is the file read (CodeQL js/file-system-race).
      const fd = openSync(p, 'r');
      try {
        if (fstatSync(fd).size < 20_000_000 && readFileSync(fd, 'utf8').includes(PRODUCTION_REF)) hits.push(p);
      } finally {
        closeSync(fd);
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  return hits;
}

function run(cmd, argv, opts = {}) {
  return new Promise((res, rej) => spawn(cmd, argv, { stdio: 'inherit', ...opts }).on('exit', (c) => (c === 0 ? res() : rej(new Error(`${cmd} ${argv.join(' ')} exited ${c}`)))));
}

/** Exports `ref` of this repo to SNAPSHOT (keeping its `.next`) and links the checkout's node_modules. Returns the commit. */
async function snapshotOf(ref) {
  const sha = execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: ROOT, encoding: 'utf8' }).trim();
  const tmp = join(homedir(), '.helm-perf', 'extract');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  mkdirSync(SNAPSHOT, { recursive: true });
  await new Promise((res, rej) => {
    const exporter = spawn('git', ['archive', sha], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
    const tar = spawn('tar', ['-x', '-C', tmp], { stdio: ['pipe', 'inherit', 'inherit'] });
    exporter.stdout.pipe(tar.stdin);
    tar.on('exit', (c) => (c === 0 ? res() : rej(new Error(`tar exited ${c}`))));
    exporter.on('error', rej);
  });
  await run('rsync', ['-a', '--delete', '--exclude=node_modules', '--exclude=.next', `${tmp}/`, `${SNAPSHOT}/`]);
  rmSync(tmp, { recursive: true, force: true });
  const link = join(SNAPSHOT, 'node_modules');
  let linked = false;
  try {
    linked = lstatSync(link).isSymbolicLink();
  } catch {
    /* not there yet */
  }
  if (!linked) symlinkSync(realpathSync(join(ROOT, 'node_modules')), link);
  return sha;
}

async function cmdBuild(a) {
  ensureDir();
  // A build into the default snapshot replaces what the running server serves, so it waits for `stop`. With HELM_PERF_SNAPSHOT=<other dir> the
  // server keeps serving the old build while the new one is built, and `stop` then `serve` (same variable) swaps them in seconds.
  if (serverPid() && !process.env.HELM_PERF_SNAPSHOT) throw new Error('the perf server is running from the current build: `stop` it first, or build into another directory (HELM_PERF_SNAPSHOT)');
  const ref = typeof a.ref === 'string' ? a.ref : 'HEAD';
  const sha = await snapshotOf(ref);
  console.log(`snapshot of ${ref} (${sha.slice(0, 9)}) in ${SNAPSHOT}`);
  // `--overlay <ref>:<path>[,...]`: files of another commit laid into the snapshot (never into the checkout), for when the ref being measured is
  // missing a file that another session's half-finished commit left behind.
  if (typeof a.overlay === 'string') {
    for (const spec of a.overlay.split(',')) {
      const [from, path] = spec.split(':');
      if (!from || !path || path.includes('..')) throw new Error(`--overlay wants <ref>:<path>, got ${spec}`);
      const target = join(SNAPSHOT, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, execFileSync('git', ['show', `${from}:${path}`], { cwd: ROOT, maxBuffer: 50_000_000 }));
      console.log(`overlay ${path} from ${from}`);
    }
  }
  if (!a.cache) {
    // The webpack cache of one build is 5 to 8 GB, which a shared laptop does not have twice (a second build on top of the first filled the
    // disk). A snapshot's build starts clean and writes none; `--cache` keeps it between builds, for a disk with room.
    rmSync(join(SNAPSHOT, '.next'), { recursive: true, force: true });
    const configPath = join(SNAPSHOT, 'next.config.mjs');
    const config = readFileSync(configPath, 'utf8');
    if (!config.includes('  webpack(config) {\n')) throw new Error('next.config.mjs has no webpack(config) hook to switch the cache off in; build with --cache');
    writeFileSync(configPath, config.replace('  webpack(config) {\n', '  webpack(config) {\n    config.cache = false; // perf harness snapshot: no persistent cache\n'));
  }
  const env = localEnv({ NODE_OPTIONS: '--max-old-space-size=12288' });
  const log = openSync(join(STATE_DIR, 'build.log'), 'w');
  console.log('building against the local stack (log: .helm/runtime/clubhouse-perf/build.log) ...');
  const t0 = Date.now();
  rmSync(BUILD_STAMP, { force: true });
  const code = await new Promise((res) => spawn('npm', ['run', 'build'], { cwd: SNAPSHOT, env, stdio: ['ignore', log, log] }).on('exit', res));
  if (code !== 0) throw new Error(`npm run build exited ${code}; see build.log`);
  const hits = [...productionRefsIn(join(SNAPSHOT, '.next', 'static')), ...productionRefsIn(join(SNAPSHOT, '.next', 'server'))];
  if (hits.length) throw new Error(`the build carries the production project (${hits.slice(0, 3).join(', ')}); not serving it`);
  writeFileSync(BUILD_STAMP, JSON.stringify({ builtAt: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), ref, commit: sha }));
  console.log(`built ${sha.slice(0, 9)} in ${Math.round((Date.now() - t0) / 1000)}s; no production project in the bundles`);
}

async function cmdServe(a) {
  ensureDir();
  const port = Number(a.port ?? 3200);
  if (serverPid()) {
    console.log(`already serving (pid ${serverPid()}) on :${port}`);
    return;
  }
  if (!existsSync(BUILD_STAMP)) throw new Error('no local build: run `build` first');
  rmSync(READS_FILE, { force: true });
  const env = localEnv({
    NODE_OPTIONS: `--require ${join(ROOT, 'scripts', 'clubhouse', 'perf-fetch-trace.cjs')} --max-old-space-size=4096`,
    HELM_PERF_TRACE_FILE: READS_FILE,
    PORT: String(port),
  });
  const log = openSync(LOG_FILE, 'a');
  const child = spawn(join(SNAPSHOT, 'node_modules', '.bin', 'next'), ['start', '-p', String(port)], { cwd: SNAPSHOT, env, detached: true, stdio: ['ignore', log, log] });
  child.unref();
  writeFileSync(PID_FILE, String(child.pid));
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`http://localhost:${port}/golf/login`, { redirect: 'manual' });
      if (res.status < 500) {
        console.log(`serving the local build on http://localhost:${port} (pid ${child.pid}); reads are traced to ${READS_FILE}`);
        return;
      }
    } catch {
      /* not up yet */
    }
  }
  throw new Error('the server did not come up; see server.log');
}

function cmdStop() {
  const pid = serverPid();
  if (!pid) {
    console.log('not running');
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    process.kill(pid, 'SIGTERM');
  }
  rmSync(PID_FILE, { force: true });
  console.log(`stopped ${pid}`);
}

function cmdStatus() {
  const stamp = existsSync(BUILD_STAMP) ? JSON.parse(readFileSync(BUILD_STAMP, 'utf8')) : null;
  console.log(JSON.stringify({ seed: existsSync(SEED_FILE) ? readSeed().teamName : null, build: stamp, serverPid: serverPid() }, null, 2));
}

const [cmd, ...rest] = process.argv.slice(2);
const a = args(rest);
try {
  if (cmd === 'seed') await cmdSeed(a);
  else if (cmd === 'remove') await cmdRemove();
  else if (cmd === 'build') await cmdBuild(a);
  else if (cmd === 'serve') await cmdServe(a);
  else if (cmd === 'stop') cmdStop();
  else if (cmd === 'status') cmdStatus();
  else if (cmd === 'report')
    report({
      stateDir: STATE_DIR,
      before: String(a.before ?? 'before'),
      after: String(a.after ?? 'after'),
      only: typeof a.only === 'string' ? a.only : undefined,
      beforeGeometry: typeof a['before-geometry'] === 'string' ? a['before-geometry'] : undefined,
      afterGeometry: typeof a['after-geometry'] === 'string' ? a['after-geometry'] : undefined,
    });
  else if (cmd === 'measure') {
    localStack();
    await measure({ ...a, stateDir: STATE_DIR, readsFile: READS_FILE, seed: readSeed(), port: Number(a.port ?? 3200), root: ROOT });
  } else {
    console.log('usage: perf-measure.mjs seed | build | serve | measure | stop | remove | status (see the header of this file)');
    process.exitCode = cmd ? 1 : 0;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
