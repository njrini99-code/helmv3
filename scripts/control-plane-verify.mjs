#!/usr/bin/env node
/**
 * Ask the control plane whether it is still true.
 *
 *   npm run control-plane:verify           static + runtime (local)
 *   npm run control-plane:verify:static    CI-safe subset, no user-global deps
 *
 * THIS VERIFIER IS READ-ONLY. It does not clean up, regenerate, delete a
 * branch, or edit a config. A verifier that repairs what it inspects cannot
 * tell you what was wrong — and the previous docs gate did exactly that:
 * it re-ran the generator and diffed, so the only way to learn the docs were
 * stale was to have already fixed them.
 *
 * EXIT SEMANTICS
 *
 *   0  VERIFIED           every check passed, or is a named acknowledged gap
 *   1  CONTROL FAILURE    a control that should hold does not
 *   2  UNKNOWN            a required state could not be established
 *
 * UNKNOWN never becomes PASS. That rule is the whole point: this repo's
 * recurring failure is not missing controls, it is controls that stopped
 * running while their documentation stayed put.
 *
 *   guard-bash.sh        existed, unwired, deleted
 *   guard-sql.sh         existed, unwired, deleted
 *   retire-worktrees.sh  existed, never invoked
 *   four rule files      claimed hooks that were gone
 *   worktree GC          keyed on a ref GitHub deletes on merge
 *   Docs Regen           opened a PR that sat open instead of keeping main current
 *
 * An ACKNOWLEDGED_GAP is different from an UNKNOWN: it has an id, an owner, a
 * reason and a date in config/control-plane-gaps.json, and it is PRINTED on
 * every run so it cannot fade.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The tree under inspection. Overridable so failure injections can run against
 * a disposable COPY and never against the live checkout — §21's requirement,
 * and the direct regression for the #1676 near miss where a fixture test
 * resolved its target back to the real repo and removed a live worktree.
 *
 * Safe to expose because this verifier is READ-ONLY. It never writes, deletes,
 * regenerates or mutates anything, so pointing it somewhere else can produce a
 * wrong ANSWER but never a wrong ACTION.
 */
const ROOT = resolve(process.env.HELM_CONTROL_PLANE_ROOT || resolve(HERE, '..'));

export const PASS = 'PASS';
export const FAIL = 'FAIL';
export const UNKNOWN = 'UNKNOWN';
export const GAP = 'ACKNOWLEDGED_GAP';

const STATIC_ONLY = process.argv.includes('--static');
const JSON_OUT = process.argv.includes('--json');

const results = [];
const add = (section, id, state, detail) => results.push({ section, id, state, detail });

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}
function git(args, cwd = ROOT) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}
function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Fold check states into a process result. Exported so the precedence is
 * testable without running the whole verifier.
 *
 * UNKNOWN outranks FAIL: if we could not establish some required state, the
 * run's honest summary is "unknown", not "these specific things are broken" —
 * the latter implies everything else was checked.
 */
export function summarise(all) {
  const fails = all.filter((r) => r.state === FAIL);
  const unknowns = all.filter((r) => r.state === UNKNOWN);
  if (unknowns.length) return { outcome: UNKNOWN, code: 2, fails, unknowns };
  if (fails.length) return { outcome: 'CONTROL FAILURE', code: 1, fails, unknowns };
  return { outcome: 'VERIFIED', code: 0, fails, unknowns };
}

// ---------------------------------------------------------------------------
// STATIC — everything provable from the repository alone.

function checkGenerated() {
  for (const [id, args] of [
    ['enforcement-inventory-current', ['scripts/gen-enforcement-inventory.mjs', '--check']],
    ['generated-docs-current', ['scripts/regen-docs.mjs', '--check']],
    ['tool-authority-matrix-current', ['scripts/gen-tool-authority.mjs', '--check']],
  ]) {
    const r = sh('node', args);
    add('generated', id, r.status === 0 ? PASS : FAIL,
      r.status === 0 ? 'matches its sources' : (r.stderr || r.stdout || '').trim().split('\n')[0]);
  }
}

function checkHookWiring() {
  const settings = readJson(resolve(ROOT, '.claude/settings.json'));
  if (!settings) return add('hooks', 'hook-config-readable', UNKNOWN, 'could not read .claude/settings.json');

  const rows = [];
  for (const [event, entries] of Object.entries(settings.hooks ?? {})) {
    for (const e of entries ?? []) {
      for (const h of e.hooks ?? []) rows.push({ event, matcher: e.matcher ?? '', command: h.command ?? '' });
    }
  }
  if (!rows.length) return add('hooks', 'hooks-declared', UNKNOWN, 'no hooks declared at all');

  const missing = rows
    .map((r) => (r.command.match(/[^\s"']*\.claude\/hooks\/[A-Za-z0-9._/-]+/) ?? [])[0])
    .filter(Boolean)
    .map((p) => p.replace(/^"?\$\{?CLAUDE_PROJECT_DIR\}?"?/, '').replace(/^\/+/, ''))
    .filter((p) => !existsSync(resolve(ROOT, p)));
  add('hooks', 'hook-scripts-exist', missing.length ? FAIL : PASS,
    missing.length ? `configured hooks whose script is absent: ${missing.join(', ')}` : `${rows.length} configured hooks all resolve`);

  // A blocking hook whose matcher cannot reach the tool it claims to guard is
  // the exact shape of guard-bash.sh: wired, and unable to fire.
  const pre = rows.filter((r) => r.event === 'PreToolUse');
  const canary = pre.filter((r) => /guard-canonical-write/.test(r.command));
  if (!canary.length) {
    add('hooks', 'canonical-write-guard-wired', FAIL, 'no PreToolUse hook runs guard-canonical-write.mjs');
  } else {
    const reaches = /Write|Edit|MultiEdit/.test(canary[0].matcher);
    add('hooks', 'canonical-write-guard-reachable', reaches ? PASS : FAIL,
      reaches ? `matcher '${canary[0].matcher}' can reach the tools it guards` : `matcher '${canary[0].matcher}' cannot reach Write/Edit/MultiEdit`);
  }
}

function checkClaimConsistency() {
  // Prose must not claim stronger enforcement than the generated inventory.
  const inv = existsSync(resolve(ROOT, 'docs/CONTROL_PLANE_ENFORCEMENT.md'))
    ? readFileSync(resolve(ROOT, 'docs/CONTROL_PLANE_ENFORCEMENT.md'), 'utf-8')
    : null;
  if (!inv) return add('claims', 'enforcement-inventory-present', UNKNOWN, 'docs/CONTROL_PLANE_ENFORCEMENT.md missing');

  const files = ['CLAUDE.md', 'AGENTS.md', '.claude/rules/database.md', '.claude/rules/shipping.md', '.claude/rules/autonomy.md'];
  // Quoted spans are corrections recording what the old text said; an assertion
  // is what the file says in its own voice.
  const strip = (t) => t.replace(/[“”"][^“”"]*[“”"]/g, ' ');
  const banned = [
    { re: /are blocked by a PreToolUse hook/i, why: 'claims a destructive-SQL hook that does not exist' },
    { re: /A governed edit is blocked until/i, why: 'claims prevention where only Stop-time detection exists' },
    { re: /they block the shapes\s+that actually matter/i, why: 'claims hooks block force push / destructive SQL / recursive rm' },
  ];
  const offenders = [];
  for (const f of files) {
    const p = resolve(ROOT, f);
    if (!existsSync(p)) continue;
    const text = strip(readFileSync(p, 'utf-8'));
    for (const b of banned) if (b.re.test(text)) offenders.push(`${f}: ${b.why}`);
  }
  add('claims', 'no-prose-overclaims-enforcement', offenders.length ? FAIL : PASS,
    offenders.length ? offenders.join(' | ') : 'no file asserts enforcement the inventory does not show');
}

function checkToolStaticAuthority() {
  const decl = readJson(resolve(ROOT, 'config/tool-authority.json'));
  const obs = readJson(resolve(ROOT, 'config/control-plane-observations.json'));
  if (!decl) return add('tools', 'authority-declared', UNKNOWN, 'config/tool-authority.json missing');
  if (!obs) return add('tools', 'observations-present', UNKNOWN, 'config/control-plane-observations.json missing');

  const declared = new Set();
  for (const s of decl.services) {
    declared.add(s.authority);
    for (const a of s.alternates ?? []) declared.add(a.namespace);
  }
  const unrecorded = [...declared].filter(
    (n) => !(obs.observations ?? []).some((o) => o.namespace === n),
  );
  add('tools', 'every-declared-namespace-observed', unrecorded.length ? FAIL : PASS,
    unrecorded.length ? `declared but never observed: ${unrecorded.join(', ')}` : `${declared.size} namespaces declared and observed`);
}

function checkWorktreePolicy() {
  const src = existsSync(resolve(ROOT, 'scripts/new-worktree.sh'))
    ? readFileSync(resolve(ROOT, 'scripts/new-worktree.sh'), 'utf-8')
    : null;
  if (!src) return add('lifecycle', 'worktree-creator-present', UNKNOWN, 'scripts/new-worktree.sh missing');

  const budget = /check-mutation-budget\.mjs/.test(src);
  const reserve = /HELM_DISK_RESERVE_GIB|WORKTREE_MIN_FREE_GIB/.test(src);
  // Order matters: the budget must be enforced BEFORE `git worktree add`, or a
  // refusal has already cost what it was refusing to spend.
  //
  // Line-based and comment-aware on purpose. A first draft used indexOf over the
  // whole file and matched `git worktree add` inside the script's own help text
  // at line 15, reporting a false FAIL against a correctly-ordered script. That
  // is the same substring-is-not-a-mechanism error the enforcement generator
  // made on its first run.
  const lines = src.split('\n');
  const execIdx = (needle) =>
    lines.findIndex((l) => !l.trimStart().startsWith('#') && l.includes(needle));
  const addIdx = execIdx('git worktree add');
  const budgetIdx = execIdx('check-mutation-budget.mjs');
  const beforeAlloc = budgetIdx !== -1 && addIdx !== -1 && budgetIdx < addIdx;

  add('lifecycle', 'mutation-budget-enforced', budget && beforeAlloc ? PASS : FAIL,
    !budget ? 'new-worktree.sh does not consult the mutation budget'
      : !beforeAlloc ? 'budget is checked AFTER git worktree add — a refusal would already have allocated'
        : 'budget enforced before allocation');
  add('lifecycle', 'disk-reserve-enforced', reserve ? PASS : FAIL,
    reserve ? 'reserve checked before allocation' : 'no disk reserve in the worktree creator');
}

function checkControlPlaneTests() {
  const r = sh('npx', ['vitest', 'run', '--project', 'unit',
    'src/test/scripts/worktree-lifecycle.test.ts',
    'src/test/scripts/control-plane-enforcement.test.ts',
    'src/test/scripts/repo-guards.test.ts',
    'src/test/scripts/new-worktree-precheck.test.ts',
    'src/test/scripts/control-plane-verify.test.ts']);
  const m = (r.stdout ?? '').match(/Tests\s+(\d+) passed/);
  add('tests', 'control-plane-suites', r.status === 0 ? PASS : FAIL,
    r.status === 0 ? `${m ? m[1] : '?'} control-plane assertions pass` : 'control-plane suites failing');
}

// ---------------------------------------------------------------------------
// RUNTIME — needs this machine, this checkout, the network.

function checkRepoIdentity() {
  const top = git(['rev-parse', '--show-toplevel']);
  const head = git(['rev-parse', 'HEAD']);
  const originMain = git(['rev-parse', 'origin/main']);
  if (!top || !head) return add('repo', 'identity', UNKNOWN, 'not inside a git repository');
  add('repo', 'identity', originMain ? PASS : UNKNOWN,
    originMain ? `${top} @ ${head.slice(0, 9)} (origin/main ${originMain.slice(0, 9)})` : 'origin/main unresolvable');
}

function checkDisk() {
  const r = sh('/bin/df', ['-Pk', ROOT]);
  const line = (r.stdout ?? '').trim().split('\n')[1];
  if (!line) return add('disk', 'free-space', UNKNOWN, 'could not measure free space');
  const freeGib = Math.floor(Number(line.split(/\s+/)[3]) / 1048576);
  const reserve = Number(process.env.HELM_DISK_RESERVE_GIB ?? 12);
  const budget = Number(process.env.HELM_INSTALL_BUDGET_GIB ?? 5);
  add('disk', 'free-space', freeGib >= reserve ? PASS : FAIL,
    `${freeGib} GiB free; reserve ${reserve}; install budget ${budget}; install threshold ${reserve + budget}`);
}

function checkLifecycleRuntime() {
  const r = sh('node', ['scripts/worktree-lifecycle.mjs', '--json']);
  if (r.status !== 0 && !r.stdout) return add('lifecycle', 'reporter', UNKNOWN, 'lifecycle reporter produced nothing');
  let rows;
  try {
    rows = JSON.parse(r.stdout);
  } catch {
    return add('lifecycle', 'reporter', UNKNOWN, 'lifecycle reporter output unparseable');
  }

  // Safe GC waiting to happen is itself a control failure: it means the
  // retire-at-merge step was skipped, which is the original leak.
  const retirable = rows.filter((x) => x.branchVerdict === 'DELETE_MERGED_EXACT' && x.worktree === 'none');
  add('lifecycle', 'no-retirable-branches-waiting', retirable.length ? FAIL : PASS,
    retirable.length ? `${retirable.length} branch(es) provably merged and deletable: ${retirable.map((x) => x.branch).join(', ')}` : 'no safe GC pending');

  const budgetRes = sh('node', ['scripts/check-mutation-budget.mjs', '--json']);
  let bd = null;
  try {
    bd = JSON.parse(budgetRes.stdout);
  } catch { /* fall through */ }
  if (!bd) add('lifecycle', 'mutation-budget', UNKNOWN, 'could not evaluate the mutation budget');
  else add('lifecycle', 'mutation-budget', bd.decision.ok || bd.decision.used <= bd.decision.budget ? PASS : FAIL,
    `${bd.decision.used}/${bd.decision.budget} mutation workspace(s) in use`);

  const unknowns = rows.filter((x) => String(x.branchVerdict).startsWith('UNKNOWN'));
  const unique = rows.filter((x) => x.branchVerdict === 'NO_UPSTREAM_UNIQUE_WORK');
  add('lifecycle', 'unclassified-branches', PASS,
    `${unknowns.length} UNKNOWN_*, ${unique.length} NO_UPSTREAM_UNIQUE_WORK (preserved deliberately — never auto-deleted)`);
}

function checkDangerousUpstreams() {
  const raw = git(['for-each-ref', '--format=%(refname:short) %(upstream:short)', 'refs/heads']) ?? '';
  const bad = raw.split('\n').filter(Boolean).map((l) => l.split(/\s+/))
    .filter(([b, up]) => up && b !== 'main' && /^origin\/(main|master)$/.test(up));
  add('repo', 'no-task-branch-tracks-trunk', bad.length ? FAIL : PASS,
    bad.length ? `a bare push from these would target trunk: ${bad.map(([b]) => b).join(', ')}` : 'no task branch tracks origin/main');
}

function checkObservationFreshness() {
  const settings = readJson(resolve(ROOT, '.claude/settings.json'));
  const mcp = readJson(resolve(ROOT, '.mcp.json')) ?? {};
  const obs = readJson(resolve(ROOT, 'config/control-plane-observations.json'));
  if (!settings || !obs) return add('tools', 'observation-freshness', UNKNOWN, 'settings or observations unreadable');
  return import('./gen-tool-authority.mjs').then(({ fingerprintFor }) => {
    const stale = (obs.observations ?? []).filter(
      (o) => o.configuration_fingerprint !== fingerprintFor(o.service, { settings, mcp }),
    );
    add('tools', 'observation-freshness', stale.length ? FAIL : PASS,
      stale.length
        ? `configuration changed since these were observed: ${stale.map((o) => o.namespace).join(', ')} — re-exercise or re-record`
        : `${(obs.observations ?? []).length} observations still describe the current configuration`);
  });
}

function checkUserGlobal() {
  const p = resolve(process.env.HOME ?? '', '.claude/settings.json');
  if (!existsSync(p)) return add('user-global', 'readable', UNKNOWN, 'user-global settings not readable from here');
  const text = readFileSync(p, 'utf-8');
  const stale = /blocked by a PreToolUse hook/.test(text);
  add('user-global', 'no-stale-hook-claim', stale ? FAIL : PASS,
    stale ? 'autoMode prose still claims a PreToolUse hook blocks destructive SQL' : 'no stale hook claim');

  const d = readJson(p);
  const allow = (d?.permissions?.allow ?? []);
  const phantom = allow.filter((r) => r.startsWith('mcp__plugin_supabase_supabase'));
  add('user-global', 'no-phantom-plugin-grants', phantom.length ? FAIL : PASS,
    phantom.length ? `grants for an uninstalled plugin: ${phantom.join(', ')}` : 'no phantom plugin grants');
}

function checkSandbox() {
  const p = resolve(process.env.HOME ?? '', '.claude/settings.json');
  const d = readJson(p);
  const fs = d?.sandbox?.filesystem;
  if (!fs) return add('sandbox', 'filesystem', UNKNOWN, 'sandbox.filesystem not present in user-global settings');
  add('sandbox', 'filesystem', fs.disabled ? GAP : PASS,
    fs.disabled
      ? 'sandbox.filesystem.disabled=true — measured 2026-08-29 as NOT enforced (10/10 probes allowed, including denyRead paths). See gap SANDBOX_FILESYSTEM_DISABLED.'
      : 'sandbox.filesystem enabled');
}

function checkOpenPrResidue() {
  const r = sh('gh', ['api', 'repos/{owner}/{repo}/pulls?state=open&per_page=50', '--jq', '.[] | "\\(.number) \\(.head.ref)"']);
  if (r.status !== 0) return add('github', 'open-pr-residue', UNKNOWN, 'could not list open PRs');
  const lines = (r.stdout ?? '').trim().split('\n').filter(Boolean);
  const known = readJson(resolve(ROOT, 'config/open-pr-dispositions.json')) ?? {};
  const unclassified = lines.filter((l) => !known[l.split(' ')[0]]);
  add('github', 'open-pr-residue', unclassified.length ? FAIL : PASS,
    unclassified.length
      ? `open PRs with no recorded disposition: ${unclassified.join('; ')}`
      : `${lines.length} open PR(s), all classified`);
}

// ---------------------------------------------------------------------------

async function run() {
  checkGenerated();
  checkHookWiring();
  checkClaimConsistency();
  checkToolStaticAuthority();
  checkWorktreePolicy();
  checkControlPlaneTests();

  if (!STATIC_ONLY) {
    checkRepoIdentity();
    checkDisk();
    checkLifecycleRuntime();
    checkDangerousUpstreams();
    await checkObservationFreshness();
    checkUserGlobal();
    checkSandbox();
    checkOpenPrResidue();
  }

  const gaps = readJson(resolve(ROOT, 'config/control-plane-gaps.json'))?.gaps ?? [];
  const summary = summarise(results);

  if (JSON_OUT) {
    console.log(JSON.stringify({ mode: STATIC_ONLY ? 'static' : 'full', results, gaps, summary }, null, 2));
    process.exit(summary.code);
  }

  let section = '';
  for (const r of results) {
    if (r.section !== section) {
      section = r.section;
      console.log(`\n  ${section.toUpperCase()}`);
    }
    const mark = r.state === PASS ? 'PASS ' : r.state === FAIL ? 'FAIL ' : r.state === GAP ? 'GAP  ' : 'UNKN ';
    console.log(`    ${mark} ${r.id.padEnd(38)} ${r.detail}`);
  }

  if (gaps.length) {
    console.log('\n  ACKNOWLEDGED GAPS — established, owned, and deliberately open');
    for (const g of gaps) console.log(`    ${g.id.padEnd(38)} owner=${g.owner} since ${g.opened}`);
    console.log('    These are NOT unknowns. Each has an owner and a closing condition.');
  }

  console.log('');
  console.log(`  ${summary.outcome}  (exit ${summary.code})  —  ${results.filter((r) => r.state === PASS).length} pass, ` +
    `${summary.fails.length} fail, ${summary.unknowns.length} unknown, ${results.filter((r) => r.state === GAP).length} acknowledged gap(s)`);
  if (summary.unknowns.length) {
    console.log('  UNKNOWN is not PASS. A state that could not be established is reported as unknown.');
  }
  process.exit(summary.code);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    console.error('control-plane-verify: the verifier itself failed');
    console.error(err);
    process.exit(2);
  });
}
