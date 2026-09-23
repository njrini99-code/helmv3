#!/usr/bin/env node
/**
 * preflight — the one local command that mirrors the required CI checks.
 *
 *   npm run preflight          fast (default): every static CI step, a cached
 *                              full ESLint scan feeding the same ratchets CI
 *                              runs, tsgo typecheck, tests related to the
 *                              changed files, next build only when a
 *                              'use server' file / next.config / dependency
 *                              changed, the Review Gate steps, and
 *                              block-historical-edits.
 *   npm run preflight:full     + cold ESLint scan, tsc, the whole unit and
 *                              integration suites, next build, and (when
 *                              supabase/** changed and Docker is up) squawk,
 *                              db lint, schema drift and the pgTAP suites.
 *
 * Exit 0 = the required checks CI can reproduce locally are green, and a
 * stamp is written to .helm/runtime/preflight.json for this exact tree (the
 * pre-push hook and the Claude push guard read it). Exit 1 = something CI
 * would fail on. Exit 2 = the environment cannot produce a trustworthy answer
 * (wrong Node major, not a git checkout).
 *
 * WHY IT CANNOT DRIFT FROM CI: the steps come from .github/workflows/ci.yml,
 * review-gate.yml and migration-lockdown.yml, parsed at runtime by
 * scripts/lib/workflow-steps.mjs. A new CI step runs here automatically; a
 * step preflight cannot model fails src/test/scripts/preflight-parity.test.ts.
 *
 * Other flags: --list (print how every CI step is handled, run nothing),
 * --only <substr,…> (run matching steps only; writes no stamp),
 * --base <ref> (default origin/main), --no-fetch.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(2, 31).map((l) => l.replace(/^ \*\/?\s?/, '')).join('\n'));
  process.exit(0);
}

const MODE = argv.includes('--full') ? 'full' : 'fast';
const LIST = argv.includes('--list');
const ONLY = flag('--only')?.split(',').filter(Boolean) ?? null;
const BASE_REF = flag('--base') ?? 'origin/main';

// --- 1. Node major must match CI (.nvmrc), or every answer below is suspect ---
const WANT_NODE = (readFileSync(join(ROOT, '.nvmrc'), 'utf8').match(/\d+/) ?? ['22'])[0];
const HAVE_NODE = process.versions.node.split('.')[0];
if (HAVE_NODE !== WANT_NODE && !LIST) {
  console.error(
    `preflight: running on Node ${process.versions.node}, but CI uses Node ${WANT_NODE} (.nvmrc).\n` +
      '  Results on another major do not predict CI. Fix the shell, then re-run:\n' +
      '    export PATH="$HOME/.local/share/fnm/aliases/default/bin:$PATH"   # or: fnm use ' + WANT_NODE,
  );
  process.exit(2);
}

const { classifyWorkflows, loadWorkflow, pinnedToolVersions, substitute, toolOverrideFor, CI_ONLY_WORKFLOWS } = await import('./lib/workflow-steps.mjs');
const { workingTreeHash, untrackedFiles, writeStamp } = await import('./lib/preflight-stamp.mjs');

const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
const tryGit = (args) => {
  try {
    return git(args);
  } catch {
    return '';
  }
};

// --- --list: show the plan and stop ------------------------------------------
const entries = classifyWorkflows(ROOT);
if (LIST) {
  const w = Math.max(...entries.map((e) => e.key.length));
  for (const e of entries) {
    const how = e.kind === 'check' ? `check:${e.handler}` : e.kind;
    console.log(`${e.key.padEnd(w)}  ${how.padEnd(24)} ${e.reason ?? ''}`);
  }
  for (const c of CI_ONLY_WORKFLOWS) console.log(`${c.name.padEnd(w)}  ${'ci-only'.padEnd(24)} ${c.reason}`);
  process.exit(0);
}

// --- 2. Git context: base, the tested tree, changed files ---------------------
if (!tryGit(['rev-parse', '--show-toplevel'])) {
  console.error('preflight: not inside a git checkout.');
  process.exit(2);
}
if (!argv.includes('--no-fetch')) {
  spawnSync('git', ['fetch', '--quiet', 'origin', 'main'], { cwd: ROOT, timeout: 20_000, stdio: 'ignore' });
}
const T0 = Date.now();
const HEAD = git(['rev-parse', 'HEAD']);
const HEAD_TREE = git(['rev-parse', 'HEAD^{tree}']);
const BASE_SHA = tryGit(['merge-base', BASE_REF, 'HEAD']) || tryGit(['rev-parse', 'HEAD^']) || HEAD;
const TREE = workingTreeHash(ROOT);
const IDENT = { GIT_AUTHOR_NAME: 'preflight', GIT_AUTHOR_EMAIL: 'preflight@localhost', GIT_COMMITTER_NAME: 'preflight', GIT_COMMITTER_EMAIL: 'preflight@localhost' };
// A dangling commit for the tested tree, so every `git diff $BASE_SHA $HEAD_SHA`
// in a workflow step also sees edits that are not committed yet.
const HEAD_SHA = TREE === HEAD_TREE ? HEAD : git(['commit-tree', TREE, '-p', HEAD, '-m', 'preflight: working tree'], { env: { ...process.env, ...IDENT } });
const CHANGED = tryGit(['diff', '--name-only', BASE_SHA, HEAD_SHA]).split('\n').filter(Boolean);
const UNTRACKED = untrackedFiles(ROOT);
const changedHas = (re) => CHANGED.some((f) => re.test(f));
const SUPABASE_CHANGED = changedHas(/^supabase\//);
const USE_SERVER = CHANGED.filter((f) => /^src\/.*\.(ts|tsx)$/.test(f) && existsSync(join(ROOT, f))
  && /^\s*(['"])use server\1/m.test(readFileSync(join(ROOT, f), 'utf8')));
// package-lock.json, not package.json: a scripts-only edit changes no dependency.
const BUILD_INPUTS = CHANGED.filter((f) => /^(next\.config\.[\w.]+|package-lock\.json|tsconfig\.json|middleware\.ts|src\/middleware\.ts)$/.test(f));

// --- 3. Environment the steps see ----------------------------------------------
function readEnvFiles() {
  const out = {};
  for (const f of ['.env', '.env.local']) {
    let text = '';
    try {
      text = readFileSync(join(ROOT, f), 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let v = m[2];
      if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
      else v = v.replace(/\s+#.*$/, '');
      out[m[1]] = v;
    }
  }
  return out;
}
const ENV_FILES = readEnvFiles();
// Only the secrets a workflow step names are passed to that step — the env
// files are never exported wholesale.
const secret = (name) => process.env[name] || ENV_FILES[name] || '';

const BASE_ENV = {
  ...process.env,
  PATH: `${dirname(process.execPath)}:${process.env.PATH}:${join(ROOT, 'node_modules/.bin')}`,
  BASE_SHA, HEAD_SHA, GITHUB_WORKSPACE: ROOT, CI: '', FORCE_COLOR: '0', HELM_PREFLIGHT: '1',
};
// CI never sets NODE_ENV. An inherited NODE_ENV=production (some agent shells
// export it) loads React's production build under vitest and fails hundreds
// of tests that pass in CI — so the checks run without it, as CI does.
const INHERITED_NODE_ENV = process.env.NODE_ENV;
delete BASE_ENV.NODE_ENV;
const has = (tool) => spawnSync('sh', ['-c', `command -v ${tool}`], { stdio: 'ignore', env: BASE_ENV }).status === 0;
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const LOG_DIR = join(ROOT, '.helm/runtime/preflight');
rmSync(LOG_DIR, { recursive: true, force: true });
mkdirSync(LOG_DIR, { recursive: true });

// --- 4. Process runner -------------------------------------------------------
const SLOTS = Number(process.env.HELM_PREFLIGHT_JOBS) || Math.max(2, Math.min(6, Math.floor(cpus().length / 2)));
let active = 0;
const waiters = [];
async function withSlot(fn) {
  while (active >= SLOTS) await new Promise((r) => waiters.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}
const children = new Set();
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const c of children) c.kill(sig);
    process.exit(130);
  });
}
const running = new Map();
/** Who holds the machine-wide heavy-gate slots (scripts/serialize.mjs), for the heartbeat. */
function gateHolders() {
  const dir = process.env.HELM_GATE_DIR ?? join(homedir(), '.helm-gates');
  try {
    const held = readdirSync(dir).filter((f) => f.endsWith('.lock')).map((f) => {
      // Lock format (serialize.mjs): pid, command (may span lines), cwd.
      const lines = readFileSync(join(dir, f), 'utf8').trimEnd().split('\n');
      const cwd = lines.length > 2 ? lines[lines.length - 1] : '';
      return `${cwd === ROOT ? 'this checkout' : cwd.replace(/^.*\//, '')} (${(lines[1] ?? '').slice(0, 30)})`;
    });
    return held.length ? ` · heavy-gate slots held by: ${held.join(', ')}` : '';
  } catch {
    return '';
  }
}
const heartbeat = setInterval(() => {
  if (!running.size) return;
  const now = Date.now();
  const list = [...running].map(([k, s]) => `${k} ${Math.round((now - s.t0) / 1000)}s${s.waiting ? ' (queued)' : ''}`);
  console.log(`  … ${Math.round((now - T0) / 1000)}s, still running: ${list.join('; ')}${gateHolders()}`);
}, 30_000);
heartbeat.unref();
const logName = (key) => join(LOG_DIR, `${key.replace(/[^\w.-]+/g, '__')}.log`);

function runBash(script, { env, heavy = false, shellFlags = ['-e'], key }) {
  return new Promise((res) => {
    const bash = [...shellFlags, '-c', script];
    const [cmd, args] = heavy ? [process.execPath, [join(ROOT, 'scripts/serialize.mjs'), '--', 'bash', ...bash]] : ['bash', bash];
    const t0 = Date.now();
    let out = '';
    const child = spawn(cmd, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child);
    const state = { t0, waiting: false };
    running.set(key, state);
    const onData = (d) => {
      out += d;
      state.waiting = /\[serialize\][^\n]*waiting[^\n]*\n?$/.test(out.trimEnd() + '\n') && !/\[serialize\] waited past/.test(out);
      if (out.length > 8e6) out = out.slice(-4e6);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (e) => {
      out += `\n${e.message}\n`;
    });
    child.on('close', (code, signal) => {
      children.delete(child);
      running.delete(key);
      writeFileSync(logName(key), out);
      res({ code: code ?? (signal ? 1 : 0), out, secs: (Date.now() - t0) / 1000 });
    });
  });
}

const results = [];
const ICON = { PASS: 'ok  ', FAIL: 'FAIL', SKIP: 'skip', UNKNOWN: '??  ', WARN: 'warn' };
function record(key, name, status, secs = 0, note = '', r = null) {
  const res = { key, name, status, secs, note, log: r ? logName(key) : null, out: r?.out ?? '' };
  results.push(res);
  const t = secs ? `${secs.toFixed(1)}s`.padStart(7) : '       ';
  console.log(`  ${ICON[status] ?? status} ${t}  ${key}${note ? `  — ${note}` : ''}`);
  return res;
}

// --- 5. Snapshots: did a generator (or a check) change the tree? --------------
function snapshot() {
  const raw = execFileSync('git', ['status', '--porcelain=v1', '-z', '-uall'], { cwd: ROOT, encoding: 'utf8' });
  const parts = raw.split('\0');
  const map = new Map();
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    const path = p.slice(3);
    if (p[0] === 'R' || p[0] === 'C') i++;
    let h = 'deleted';
    try {
      const st = lstatSync(join(ROOT, path));
      if (st.isSymbolicLink()) h = `link:${readlinkSync(join(ROOT, path))}`;
      else if (st.isFile()) h = createHash('sha1').update(readFileSync(join(ROOT, path))).digest('hex');
      else h = 'dir';
    } catch {
      /* deleted */
    }
    map.set(path, h);
  }
  return map;
}
function diffSnap(a, b) {
  const out = new Set();
  for (const [p, h] of b) if (a.get(p) !== h) out.add(p);
  for (const p of a.keys()) if (!b.has(p)) out.add(p);
  return [...out].sort();
}

// --- 6. Generated artifacts: regenerate first, fail if anything changed ------
const REGEN = [
  'docs:regen', 'knowledge:doc-inventory', 'knowledge:entry-points', 'flags:generate',
  'knowledge:golden-paths-generate', 'knowledge:feature-map', 'tool-authority:regen',
  'enforcement:regen', 'knowledge:world-model',
].filter((s) => pkg.scripts?.[s]);
const regenResults = {};
/** CI step `npm run <x>` whose script is exactly `<regen script> --check` is answered by that regen. */
function impliedRegen(run) {
  const m = String(run ?? '').trim().match(/^npm run ([\w:.-]+)$/);
  const body = m && pkg.scripts?.[m[1]];
  if (!body) return null;
  return REGEN.find((r) => `${pkg.scripts[r]} --check` === body.trim()) ?? null;
}
async function runRegen() {
  for (const s of REGEN) {
    if (ONLY && !ONLY.some((o) => `regen/${s}`.includes(o))) continue;
    const pre = snapshot();
    const r = await withSlot(() => runBash(`npm run --silent ${s}`, { env: BASE_ENV, key: `regen/${s}` }));
    const changed = diffSnap(pre, snapshot());
    regenResults[s] = { code: r.code, changed };
    const status = r.code !== 0 || changed.length ? 'FAIL' : 'PASS';
    const note = r.code !== 0 ? 'generator failed' : changed.length ? `regenerated ${changed.length} file(s)` : 'up to date';
    record(`regen/${s}`, `npm run ${s}`, status, r.secs, note, r);
  }
}

// --- 7. How each CI step runs here ---------------------------------------------
let dockerUp = null;
let startedStack = false;
const dockerRunning = () => (dockerUp ??= spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 15_000 }).status === 0);
const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

function stepEnv(e, env) {
  const ctx = { BASE_SHA, HEAD_SHA, RUNNER_TEMP: env.RUNNER_TEMP, root: ROOT, matrix: e.matrix, secret };
  const out = { ...env };
  for (const src of [e.wf.env, e.job.env, env.__githubEnv, e.step.env]) {
    for (const [k, v] of Object.entries(src ?? {})) {
      if (k === 'BASE_SHA' || k === 'HEAD_SHA') continue;
      out[k] = substitute(v, ctx).text;
    }
  }
  delete out.__githubEnv;
  return { env: out, ctx };
}

function shellFlagsFor(e) {
  const shell = e.step.shell ?? e.job.defaults?.run?.shell ?? e.wf.defaults?.run?.shell;
  return shell === 'bash' ? ['--noprofile', '--norc', '-eo', 'pipefail'] : ['-e'];
}

/** Returns { status, note } for no-run outcomes, or { script, env, heavy, post? }. */
function localPlan(e, groupEnv) {
  const { env, ctx } = stepEnv(e, groupEnv);
  const script = substitute(e.step.run ?? '', ctx).text;
  const run = { script, env, heavy: e.heavy };

  if (e.db === 'static' && !SUPABASE_CHANGED) return { status: 'SKIP', note: 'no supabase/** change' };
  if (e.db === 'stack') {
    if (!SUPABASE_CHANGED) return { status: 'SKIP', note: 'no supabase/** change' };
    if (MODE !== 'full') return { status: 'SKIP', note: 'supabase/** changed: run `npm run preflight:full` (needs Docker)' };
    if (!dockerRunning()) return { status: 'SKIP', note: 'Docker is not running — CI still runs this' };
    if (/supabase-start-with-retry|\bsupabase start\b/.test(script)) {
      if (spawnSync('npx', ['supabase', 'status'], { cwd: ROOT, stdio: 'ignore', env: BASE_ENV }).status === 0) {
        return { status: 'PASS', note: 'local stack already running; reused (left running)' };
      }
      startedStack = true;
    }
  }

  switch (e.handler) {
    case 'verbatim': {
      const regen = impliedRegen(e.step.run);
      if (regen && regenResults[regen]) {
        const r = regenResults[regen];
        return r.code === 0 && !r.changed.length
          ? { status: 'PASS', note: `answered by npm run ${regen} (output unchanged)` }
          : { status: 'FAIL', note: `npm run ${regen} ${r.code ? 'failed' : 'changed files'} — see regen/${regen}` };
      }
      if (/typecheck:functions/.test(script) && !has('deno')) return { status: 'SKIP', note: 'deno not installed (brew install deno) — CI still checks' };
      if (e.eslintCache && MODE === 'fast') run.env = { ...run.env, HELM_ESLINT_CACHE: join(ROOT, '.helm/runtime/eslint-cache') };
      return run;
    }
    case 'typecheck':
      return MODE === 'fast' && pkg.scripts?.['typecheck:fast']
        ? { ...run, script: 'npm run --silent typecheck:fast', note: 'tsgo (--full runs tsc)' }
        : run;
    case 'types-drift': {
      if (!secret('SUPABASE_ACCESS_TOKEN')) {
        return { status: 'UNKNOWN', note: 'SUPABASE_ACCESS_TOKEN not in env/.env/.env.local — types drift NOT verified locally; CI verifies it' };
      }
      return {
        ...run,
        post: (r) => {
          if (/SUPABASE_ACCESS_TOKEN is not configured/.test(r.out)) return { status: 'UNKNOWN', note: 'token not picked up — not verified' };
          if (r.code !== 0 && /gen types failed/.test(r.out)) return { status: 'UNKNOWN', note: 'could not reach Supabase — not verified' };
          return { status: r.code === 0 ? 'PASS' : 'FAIL', note: r.code === 0 ? 'matches production' : 'src/lib/types/database.ts drifted: npm run db:types' };
        },
      };
    }
    case 'unit-tests': {
      if (MODE === 'full') return { ...run, script: script.replace(/\s+--\s+--shard=\S+/, '').replace(/\s+--shard=\S+/, '') };
      const escalate = CHANGED.filter((f) => /^(package-lock\.json|vitest\.config\.\w+|tsconfig\.json|src\/test\/setup\.tsx?)$/.test(f));
      const files = CHANGED.filter((f) => /^(src|scripts)\/.*\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f) && existsSync(join(ROOT, f)));
      if (escalate.length || files.length > 200) {
        return { ...run, script: 'npm run --silent test:run', note: escalate.length ? `test config changed (${escalate[0]}): whole unit suite` : 'many files changed: whole unit suite' };
      }
      if (!files.length) return { status: 'SKIP', note: 'no changed source files' };
      return {
        ...run,
        script: `node scripts/serialize.mjs -- npx vitest related --run --passWithNoTests --project unit --project unit-dom --project integration ${files.map(q).join(' ')}`,
        note: `vitest related (${files.length} changed file(s))`,
      };
    }
    case 'integration-tests':
      return MODE === 'full' ? run : { status: 'SKIP', note: 'fast: related integration tests ran with the unit step; --full runs the whole project' };
    case 'build':
      if (MODE === 'full') return run;
      if (USE_SERVER.length || BUILD_INPUTS.length) return { ...run, note: `build input changed: ${[...USE_SERVER, ...BUILD_INPUTS][0]}` };
      return { status: 'SKIP', note: "no 'use server' / next.config / dependency change (--full builds)" };
    case 'squawk': {
      if (!SUPABASE_CHANGED) return { status: 'SKIP', note: 'no supabase/** change' };
      const v = script.match(/squawk-cli@([\d.]+)/)?.[1] ?? 'latest';
      // CI's `npm install --no-save` would rewrite this checkout's node_modules; npx keeps it untouched.
      const local = script
        .replace(/^\s*npm install --no-save squawk-cli@\S+\s*$/m, '')
        .replace(/npx squawk-cli/g, `npx --yes squawk-cli@${v}`)
        .replace(/\.\.\.HEAD\b/g, `...${HEAD_SHA}`);
      return { ...run, script: local };
    }
    case 'tool': {
      const o = toolOverrideFor(e.toolKey)(e.step, { has, BASE_SHA, HEAD_SHA });
      if (o.skip) return { status: 'SKIP', note: `${o.tool} not installed (${o.skip}) — CI still checks this` };
      return { ...run, script: substitute(o.script, ctx).text };
    }
    default:
      return { status: 'WARN', note: `no local handler for ${e.handler}` };
  }
}

function readGithubEnv(file) {
  const out = {};
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const heredoc = lines[i].match(/^([A-Za-z_]\w*)<<(.+)$/);
    if (heredoc) {
      const body = [];
      while (++i < lines.length && lines[i] !== heredoc[2]) body.push(lines[i]);
      out[heredoc[1]] = body.join('\n');
      continue;
    }
    const kv = lines[i].match(/^([A-Za-z_]\w*)=(.*)$/);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
}

async function runEntry(e, env, stopped) {
  if (stopped && e.db === 'stack') return record(e.key, e.name, 'SKIP', 0, `not run: ${stopped} failed (CI stops here too)`);
  const plan = localPlan(e, env);
  if (plan.status) return record(e.key, e.name, plan.status, 0, plan.note);
  const r = await withSlot(() => runBash(plan.script, { env: plan.env, heavy: plan.heavy, shellFlags: shellFlagsFor(e), key: e.key }));
  let status = r.code === 0 ? 'PASS' : 'FAIL';
  let note = plan.note ?? '';
  if (plan.post) ({ status, note } = plan.post(r));
  else if (status === 'FAIL' && e.handler === 'verbatim' && e.secrets?.some((s) => s !== 'GITHUB_TOKEN')) {
    // CI injects these from repository secrets; local .env values are often
    // placeholders, so a local failure is not proof CI will fail.
    status = 'UNKNOWN';
    note = `failed locally, but it reads CI secrets (${e.secrets.join(', ')}) whose local values may differ — CI verifies; log: ${logName(e.key).replace(`${ROOT}/`, '')}`;
  }
  return record(e.key, e.name, status, r.secs, note, r);
}

/** One CI job: steps between barriers run concurrently; $GITHUB_ENV carries forward. */
async function runGroup(group) {
  const tmp = mkdtempSync(join(tmpdir(), 'helm-preflight-'));
  const ghEnvFile = join(tmp, 'github_env');
  writeFileSync(ghEnvFile, '');
  const env = { ...BASE_ENV, RUNNER_TEMP: tmp, GITHUB_ENV: ghEnvFile, GITHUB_OUTPUT: join(tmp, 'output'), GITHUB_STEP_SUMMARY: join(tmp, 'summary') };
  let stopped = null;
  let wave = [];
  const flush = async () => {
    const w = wave;
    wave = [];
    const current = { ...env, __githubEnv: readGithubEnv(ghEnvFile) };
    const rs = await Promise.all(w.map((e) => runEntry(e, current, stopped)));
    rs.forEach((r, i) => {
      if (r.status === 'FAIL' && w[i].db === 'stack') stopped ??= w[i].name;
    });
  };
  try {
    for (const e of group) {
      if (e.barrier) {
        await flush();
        wave.push(e);
        await flush();
      } else wave.push(e);
    }
    await flush();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// --- 8. Tool-version drift (warn only) ------------------------------------------
function versionWarnings() {
  const warnings = [];
  const pins = { ...pinnedToolVersions(loadWorkflow(ROOT, '.github/workflows/review-gate.yml')) };
  const cmd = { sg: ['sg', '--version'], actionlint: ['actionlint', '-version'], 'markdownlint-cli2': ['markdownlint-cli2', '--version'], semgrep: ['semgrep', '--version'], sqlfluff: ['sqlfluff', '--version'] };
  for (const [tool, pin] of Object.entries(pins)) {
    if (!cmd[tool] || !has(tool)) continue;
    const r = spawnSync(cmd[tool][0], cmd[tool].slice(1), { encoding: 'utf8', timeout: 15_000, env: BASE_ENV });
    const local = `${r.stdout ?? ''}${r.stderr ?? ''}`.match(/\d+\.\d+\.\d+/)?.[0];
    if (!local) continue;
    if (pin === 'unpinned') warnings.push(`${tool}: CI installs the latest release (unpinned); local ${local}`);
    else if (pin !== 'latest' && local !== pin.replace(/^v/, '')) warnings.push(`${tool}: local ${local}, CI pins ${pin} — findings can differ`);
  }
  return warnings;
}

// --- 9. Run ------------------------------------------------------------------
const dirty = TREE !== HEAD_TREE;
if (INHERITED_NODE_ENV) console.log(`note: NODE_ENV=${INHERITED_NODE_ENV} is set in this shell; the checks run without it, as in CI.`);
console.log(`preflight (${MODE}) · node ${process.versions.node} · base ${BASE_SHA.slice(0, 9)} (${BASE_REF}) · head ${HEAD.slice(0, 9)}${dirty ? ' + uncommitted edits' : ''} · ${CHANGED.length} changed file(s) · ${SLOTS} parallel`);

const selected = entries.filter((e) => !ONLY || ONLY.some((o) => e.key.includes(o)));
const checks = selected.filter((e) => e.kind === 'check');
const groups = new Map();
for (const e of checks) {
  const k = `${e.workflow}#${e.jobId}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(e);
}
// Code checks start at once, alongside the generators; checks of generated
// artifacts wait for the generators so they see the regenerated files.
const isEarly = (g) => !g[0].workflow.endsWith('ci.yml') || g.some((e) => ['typecheck', 'unit-tests', 'integration-tests'].includes(e.handler) || e.eslintCache);
const early = [...groups.values()].filter(isEarly);
const late = [...groups.values()].filter((g) => !isEarly(g));

const S0 = snapshot();
let S1 = S0;
try {
  await Promise.all([
    (async () => {
      await runRegen();
      S1 = snapshot();
      await Promise.all(late.map(runGroup));
    })(),
    ...early.map(runGroup),
  ]);
} finally {
  if (startedStack) spawnSync('npx', ['supabase', 'stop'], { cwd: ROOT, stdio: 'ignore', env: BASE_ENV });
}
const strayEdits = diffSnap(S1, snapshot());
for (const e of selected.filter((x) => x.kind === 'unmapped')) {
  record(e.key, e.name, 'WARN', 0, `NOT MIRRORED (${e.reason}) — teach scripts/lib/workflow-steps.mjs about it`);
}

// --- 10. Report ----------------------------------------------------------------
const by = (s) => results.filter((r) => r.status === s);
const secs = Math.round((Date.now() - T0) / 1000);
const fails = by('FAIL');
console.log(`\n────────── preflight ${MODE}: ${Math.floor(secs / 60)}m${String(secs % 60).padStart(2, '0')}s ──────────`);
console.log(`PASS ${by('PASS').length} · FAIL ${fails.length} · UNKNOWN ${by('UNKNOWN').length} · SKIP ${by('SKIP').length} · WARN ${by('WARN').length}`);

for (const f of fails) {
  const tail = f.out.trim().split('\n').slice(-60).join('\n');
  console.log(`\n✗ ${f.key} — ${f.name}${f.note ? ` (${f.note})` : ''}${f.log ? `\n  full log: ${f.log.replace(`${ROOT}/`, '')}` : ''}${tail ? `\n${tail}` : ''}`);
}
const regenChanged = [...new Set(Object.values(regenResults).flatMap((r) => r.changed))];
if (regenChanged.length) {
  console.log(`\nGenerated artifacts were stale. They are regenerated in your tree now — review and commit these files:\n${regenChanged.map((f) => `  ${f}`).join('\n')}`);
}
for (const r of by('UNKNOWN')) console.log(`\n? ${r.key}: ${r.note}`);
const skipped = by('SKIP');
if (skipped.length) console.log(`\nSkipped here (CI still runs them):\n${skipped.map((r) => `  ${r.key} — ${r.note}`).join('\n')}`);
const ciOnly = new Map();
for (const e of selected.filter((x) => x.kind === 'ci-only')) {
  const k = `${e.workflow.replace(/^.*\//, '').replace(/\.ya?ml$/, '')}/${e.jobId}`;
  if (!ciOnly.has(k)) ciOnly.set(k, e.reason);
}
for (const c of CI_ONLY_WORKFLOWS) ciOnly.set(c.name, c.reason);
console.log(`\nCI-only (not reproducible locally):\n${[...ciOnly].map(([k, r]) => `  ${k} — ${r}`).join('\n')}`);
for (const w of versionWarnings()) console.log(`warn: ${w}`);
if (strayEdits.length) console.log(`\nwarn: the checks modified files (revert them unless intended; they are not part of the tested tree):\n${strayEdits.map((f) => `  ${f}`).join('\n')}`);
if (UNTRACKED.length) console.log(`\nwarn: ${UNTRACKED.length} untracked file(s) were present but are not in the tested tree (git add them, or they will not be pushed): ${UNTRACKED.slice(0, 8).join(', ')}${UNTRACKED.length > 8 ? ', …' : ''}`);

if (fails.length) {
  console.log('\npreflight: RED. Fix everything above in one batch, re-run `npm run preflight`, and push only when it is green. The exit code is the answer.');
  process.exit(1);
}
if (ONLY) {
  console.log('\npreflight: selected steps green (--only: no stamp written).');
  process.exit(0);
}
const stamp = writeStamp(ROOT, {
  headSha: HEAD, treeHash: TREE, mode: MODE, base: BASE_SHA, node: process.versions.node,
  finishedAt: new Date().toISOString(), seconds: secs,
  counts: { pass: by('PASS').length, unknown: by('UNKNOWN').length, skip: skipped.length },
});
console.log(`\npreflight: GREEN (${MODE}). Stamp: ${stamp.replace(`${ROOT}/`, '')} (tree ${TREE.slice(0, 9)}${dirty ? ' — commit exactly these files to keep it valid' : ''}).`);
console.log('Next: push, open the PR with `gh pr create --draft`, then `gh pr ready` (CI runs once, on ready).');
process.exit(0);
