/**
 * The ONE workspace door.
 *
 * Before this module, a worktree in this repo was created three different
 * ways — scripts/new-worktree.sh, the harness's own WorktreeCreate path
 * (--worktree / isolation: "worktree"), and raw `git worktree add` — and only
 * the first was governed. A subagent asking for isolation got none of the
 * budget check, the disk reserve, the .helm/workspace.json marker, or the
 * local-only .env.local that a human running new-worktree.sh got for free.
 *
 * Every caller now goes through `createWorkspace()`:
 *
 *   scripts/new-worktree.sh              CLI front door (thin — see that file)
 *   .claude/hooks/worktree-create.mjs    the WorktreeCreate hook
 *
 * and `listWorkspaces()` is the one place that turns `git worktree list` into
 * classified rows, shared by the mutation-budget check, the SessionStart
 * stamp hook, and (indirectly, via scripts/lib/worktree-lifecycle.mjs) repo:doctor.
 *
 * WHAT THIS DELIBERATELY REVERSES, and why that is not a regression
 *
 * scripts/new-worktree.sh's own header recorded, for cause, that symlinking
 * node_modules was replaced with a real per-worktree `npm ci`: two branches
 * with different lockfiles testing against whichever tree was installed last
 * manufactures both fake failures and fake passes. This module makes the
 * symlink the DEFAULT again. That is a real, accepted hazard — not an
 * oversight — because the lesson only applies to a worktree that installs.
 * Most control-plane, docs, and config work never runs a single test, and
 * coupling every worktree to a ~3.8 GiB isolated install is what took this
 * repo's disk to zero bytes free on 2026-08-29 (see ensure-worktree-deps.mjs).
 * The escape hatch is `install: true` (`--install` on the CLI), which runs a
 * real, isolated `npm ci` via ensure-worktree-deps.mjs instead of symlinking.
 * Choose it for any task that will actually run tests against a lockfile that
 * might differ from the canonical checkout's.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  symlinkSync,
  writeFileSync,
  realpathSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The pure budget classifier, and the one place `inspectWorkspaces` (git
// worktree list -> classified rows) is implemented. Importing it rather than
// re-walking `git worktree list --porcelain` here keeps exactly one algorithm
// for "what workspaces exist and what kind are they" — the same reason
// repo-doctor's identity check stopped owning its own git calls.
import { inspectWorkspaces } from '../check-mutation-budget.mjs';
import { DEFAULT_MUTATION_BUDGET, mutationBudgetDecision } from './worktree-lifecycle.mjs';
import { canonicalRootOf } from '../../.claude/hooks/lib/workspace-identity.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Thrown by createWorkspace(). `.code` is stable; `.message` is for humans. */
export class WorkspaceError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'WorkspaceError';
    this.code = code;
    Object.assign(this, extra);
  }
}

function fail(code, message, extra) {
  throw new WorkspaceError(code, message, extra);
}

function warn(message) {
  process.stderr.write(`${message}\n`);
}

function expandHome(p) {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

function normaliseName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    fail('EMPTY_NAME', 'refusing: workspace name is empty');
  }
  // Slashes would nest directories unexpectedly — the same rule
  // new-worktree.sh has always enforced, now enforced once.
  return name.trim().replace(/\//g, '-');
}

function branchExists(repo, branch) {
  const r = spawnSync('git', ['-C', repo, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
  return r.status === 0;
}

/**
 * Free space, in whole GiB, at `path`. Mirrors new-worktree.sh's own
 * `free_gib` — a small duplication rather than an import, because this must
 * keep working even if ensure-worktree-deps.mjs's install-budget policy
 * changes independently (that file answers "can I afford an install"; this
 * answers "can I afford to allocate a checkout at all", a stricter and
 * earlier question).
 */
function freeGib(path) {
  try {
    const out = execFileSync('/bin/df', ['-Pk', path], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const line = out.trim().split('\n')[1];
    if (!line) return null;
    const avail = Number(line.split(/\s+/)[3]);
    return Number.isFinite(avail) ? Math.floor(avail / 1_048_576) : null;
  } catch {
    return null;
  }
}

/**
 * The local-stack anon key, best-effort. Two sources only, in order:
 *
 *   1. `supabase status -o env`, if the local stack happens to be running.
 *   2. a documented default in supabase/config.toml.
 *
 * This repo's config.toml documents no such default (verified against the
 * file, not assumed) — so when the stack is not running, this returns an
 * empty key rather than inventing one. A fabricated JWT-shaped string would
 * trip .gitleaks.toml's hardcoded-JWT rule and the #516 secrets guard test,
 * and would be wrong besides.
 */
function resolveLocalAnonKey(repo) {
  const localBin = resolve(repo, 'node_modules/.bin/supabase');
  const cmd = existsSync(localBin) ? localBin : 'supabase';
  const result = spawnSync(cmd, ['status', '-o', 'env'], {
    cwd: repo,
    encoding: 'utf-8',
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (!result.error && result.status === 0 && result.stdout) {
    const m = result.stdout.match(/ANON_KEY="?([^"\n]+)"?/);
    if (m && m[1]) {
      return { key: m[1], source: 'supabase status -o env (local stack running at creation time)' };
    }
  }
  return { key: '', source: null };
}

function buildEnvLocal({ key, source }) {
  const lines = [
    '# GENERATED for a task worktree: local stack only, no production credentials;',
    '# production env lives only in the canonical checkout.',
    '# Rewritten by scripts/lib/create-workspace.mjs on every (re)creation — do not',
    "# hand-edit, and never copy the canonical checkout's .env.local into a worktree.",
    '',
    'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321',
  ];
  if (key) {
    lines.push(`# anon key source: ${source}`);
    lines.push(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${key}`);
  } else {
    lines.push(
      '# The local Supabase stack was not running when this workspace was created,',
      '# and supabase/config.toml documents no default local anon key to fall back to',
      "# — there isn't one to fall back to, verified against the file rather than",
      '# assumed. Start the stack and fill this in:',
      '#   ./node_modules/.bin/supabase start',
      '#   ./node_modules/.bin/supabase status -o env',
    );
    lines.push('NEXT_PUBLIC_SUPABASE_ANON_KEY=');
  }
  lines.push(
    '',
    '# SUPABASE_SERVICE_ROLE_KEY is deliberately NOT set here. This workspace gets',
    "# no production write capability — see AGENTS.md's \"Helm agent canonicality\".",
    '',
  );
  return lines.join('\n');
}

/**
 * Create one task workspace: the ONE thing every entry point does.
 *
 * @param {object} opts
 * @param {string} opts.name     task name; slashes become dashes, empty refused
 * @param {string} [opts.base]   ref to branch from — default origin/main
 * @param {boolean} [opts.install] real isolated `npm ci` instead of a symlink
 * @param {boolean} [opts.keep]  force parkPolicy: KEEP even on an agent/*
 *                               branch — see the parkPolicy note below
 * @param {string} [opts.home]   worktree home dir — default HELM_WORKTREE_HOME
 *                               or ~/worktrees/helmv3
 * @param {string} opts.repo     the repo to branch from (its canonical root
 *                               is where node_modules/.node-version are read)
 * @returns {Promise<{path: string, branch: string, base: string, deps: string}>}
 */
export async function createWorkspace(opts = {}) {
  const {
    name,
    base = 'origin/main',
    install = false,
    keep = false,
    home: homeArg = process.env.HELM_WORKTREE_HOME ?? '~/worktrees/helmv3',
    repo,
  } = opts;

  if (!repo || !existsSync(repo)) {
    fail('NO_REPO', 'createWorkspace: `repo` must be an existing directory (the repo to branch from)');
  }

  // 1. Normalise the name.
  const task = normaliseName(name);
  const branch = `agent/${task}`;
  const home = expandHome(homeArg);
  const path = resolve(home, task);

  // 2. Refuse if the path or the branch already exists. Cheap, and first —
  // no point checking budget or disk for a request that cannot proceed.
  if (existsSync(path)) fail('PATH_EXISTS', `refusing: ${path} already exists`, { path });
  if (branchExists(repo, branch)) {
    fail('BRANCH_EXISTS', `refusing: branch ${branch} already exists`, { branch });
  }

  mkdirSync(home, { recursive: true });

  // 3. Mutation-worktree budget — enforced BEFORE any allocation, so a
  // refusal costs nothing. Shares its classifier with repo:doctor and the
  // SessionStart stamp hook via listWorkspaces() below.
  const canonicalRoot = canonicalRootOf(repo);
  const budget = Number(process.env.HELM_MAX_MUTATION_WORKTREES ?? DEFAULT_MUTATION_BUDGET);
  const spaces = inspectWorkspaces(repo, canonicalRoot);
  const decision = mutationBudgetDecision(spaces, budget);
  if (!decision.ok) {
    const lines = [
      `refusing: ${decision.reason}.`,
      '',
      'Already in use:',
      ...spaces.filter((s) => s.counts).map((s) => `  ${s.path}\n    ${s.kind} — ${s.reason}`),
      '',
      `Budget is ${budget} mutation workspace(s) at a time. Finish or park one:`,
      '',
      '  npm run worktrees          # report',
      '  npm run worktrees:park     # remove disposable checkouts',
      '  npm run worktrees:retire   # park + delete branches proven merged',
      '',
      'Override deliberately: HELM_MAX_MUTATION_WORKTREES=<n>.',
    ];
    fail('BUDGET_EXCEEDED', lines.join('\n'), { decision, spaces });
  }

  // 4. Disk reserve — the same 12 GiB floor new-worktree.sh has always used.
  // At zero bytes free nothing runs at all, not even the command that would
  // clean up, so this refuses before allocating rather than after failing.
  const reserveGib = Number(process.env.HELM_DISK_RESERVE_GIB ?? process.env.HELM_MIN_FREE_GIB ?? 12);
  const avail = freeGib(home);
  if (avail !== null && avail < reserveGib) {
    const lines = [
      `refusing: ${avail} GiB free under ${home}, reserve is ${reserveGib} GiB.`,
      '',
      'This is the MACHINE reserve, not an install estimate. At zero bytes free',
      'nothing runs at all — writing a command\'s output fails, so no command can',
      'be issued to clean up.',
      '',
      'Reclaim. Parking removes a checkout WITHOUT abandoning its branch:',
      '',
      '  node scripts/worktree-lifecycle.mjs           # report',
      '  node scripts/worktree-lifecycle.mjs --park    # remove disposable checkouts',
      '  node scripts/worktree-lifecycle.mjs --retire  # also delete proven-merged branches',
      '',
      'Override: HELM_DISK_RESERVE_GIB=<n>.',
    ];
    fail('DISK_LOW', lines.join('\n'), { avail, reserveGib });
  }

  // 5. Fetch — quiet, and a failed fetch is a warning, not a refusal. Working
  // from a stale origin/main is a worse-but-survivable outcome; refusing to
  // work at all because the network is briefly down is not the tradeoff this
  // door should make.
  const fetchResult = spawnSync('git', ['-C', repo, 'fetch', 'origin', '--quiet'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (fetchResult.status !== 0) {
    warn(
      `warning: git fetch origin failed — continuing with locally known refs (${(fetchResult.stderr || '').trim().slice(0, 200)})`,
    );
  }

  // 6. git worktree add --no-track <path> -b agent/<name> <base>
  // --no-track is load-bearing: without it the new branch inherits `base`
  // (often a remote-tracking ref) as its upstream, and a later bare
  // `git push` from the task branch targets that ref instead of its own.
  const add = spawnSync(
    'git',
    ['-C', repo, 'worktree', 'add', '--no-track', path, '-b', branch, base],
    { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (add.status !== 0) {
    fail('WORKTREE_ADD_FAILED', `git worktree add failed: ${(add.stderr || add.stdout || '').trim()}`);
  }

  // 7. Declared identity. parkPolicy defaults to PARK_IF_REPRODUCIBLE for a
  // task worktree (every branch this door creates is agent/<task>) — the
  // door's whole point is that cleanup should be cheap enough it always
  // happens, and a checkout that never releases itself defeats that by
  // default. `keep: true` (`--keep` on the CLI) opts back into the old
  // always-KEEP behaviour for a worktree that is meant to sit around.
  //
  // This does NOT weaken the lifecycle tool's own safety net:
  // scripts/lib/worktree-lifecycle.mjs still refuses to park a dirty
  // checkout, one with unpushed commits, one a live process is using, or one
  // whose branch has an OPEN PR without a recorded PARK_IF_REPRODUCIBLE
  // disposition. parkPolicy only says "this checkout may be asked"; it is
  // never itself proof that removing it is safe.
  mkdirSync(join(path, '.helm'), { recursive: true });
  const marker = {
    kind: 'task',
    task,
    branch,
    base,
    environment: 'local',
    supabase: 'local',
    productionWrites: false,
    parkPolicy: keep ? 'KEEP' : 'PARK_IF_REPRODUCIBLE',
    createdBy: 'create-workspace.mjs',
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(path, '.helm/workspace.json'), `${JSON.stringify(marker, null, 2)}\n`);

  // 8. Dependencies — symlinked by default (see the module header for why
  // that default changed back), a real isolated install when asked.
  let deps = 'symlinked';
  if (install) {
    deps = 'installed';
    const depsScript = resolve(HERE, '..', 'ensure-worktree-deps.mjs');
    const result = spawnSync('node', [depsScript, path], { encoding: 'utf-8' });
    if (result.stdout) warn(result.stdout.trim());
    if (result.status !== 0) {
      deps = 'install-refused';
      warn(
        `dependency install refused or failed — the worktree itself is intact.\n` +
          `Re-run: node scripts/ensure-worktree-deps.mjs ${path}`,
      );
      if (result.stderr) warn(result.stderr.trim());
    }
  } else {
    const canonicalNodeModules = join(canonicalRoot, 'node_modules');
    if (existsSync(canonicalNodeModules)) {
      symlinkSync(canonicalNodeModules, join(path, 'node_modules'), 'dir');
    } else {
      deps = 'not-available';
      warn(
        `no node_modules at ${canonicalNodeModules} — nothing to symlink; ` +
          `run --install or node scripts/ensure-worktree-deps.mjs ${path}`,
      );
    }
  }

  // 9. Node version pin, so a worktree does not silently fall back to the
  // machine default while CI pins something else.
  const nodeVersionSrc = join(canonicalRoot, '.node-version');
  if (existsSync(nodeVersionSrc)) {
    copyFileSync(nodeVersionSrc, join(path, '.node-version'));
  }

  // 10. A LOCAL-ONLY .env.local, generated fresh. Never read or copy the
  // canonical checkout's .env.local — it holds production credentials this
  // workspace must never see.
  writeFileSync(join(path, '.env.local'), buildEnvLocal(resolveLocalAnonKey(repo)));

  return { path, branch, base, deps };
}

/**
 * Classified workspace rows for `repo`, shared by the mutation-budget check,
 * the SessionStart stamp hook, and anything else that needs "what workspaces
 * exist and what kind are they" without re-walking git itself.
 */
export function listWorkspaces(repo) {
  const canonicalRoot = canonicalRootOf(repo);
  return inspectWorkspaces(repo, canonicalRoot);
}

// ---------------------------------------------------------------------------
// CLI surface — the shared entry point for scripts/new-worktree.sh and any
// other script-level caller. The WorktreeCreate hook
// (.claude/hooks/worktree-create.mjs) calls createWorkspace() directly rather
// than shelling out to this, since it already runs inside Node.
//
//   node create-workspace.mjs --name <task> [--base <ref>] [--install] [--keep]
//                             [--home <dir>] [--repo <dir>]
//                             [--path-only | --summary]
//
// --keep stamps parkPolicy: KEEP instead of the default
// PARK_IF_REPRODUCIBLE. Use it for a worktree that should sit around rather
// than be cleaned up as soon as it is clean and pushed — the lifecycle
// tool's dirty/unpushed/live-process/open-PR refusals still apply either way.
//
// Default output is a single-line JSON object. --path-only prints nothing but
// the absolute path (for callers that want the WorktreeCreate contract's
// shape). --summary prints a human-readable block ending with the path as
// its last line, matching what scripts/new-worktree.sh has always shown.
// Every other message this CLI prints — fetch warnings, install progress,
// refusal reasons — goes to stderr, never stdout, so a caller capturing only
// stdout never has to parse narration out of data.
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { install: false, keep: false, pathOnly: false, summary: false, help: false, usageError: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--name') out.name = argv[(i += 1)];
    else if (a === '--base') out.base = argv[(i += 1)];
    else if (a === '--home') out.home = argv[(i += 1)];
    else if (a === '--repo') out.repo = argv[(i += 1)];
    else if (a === '--install') out.install = true;
    else if (a === '--keep') out.keep = true;
    else if (a === '--path-only') out.pathOnly = true;
    else if (a === '--summary') out.summary = true;
    else if (a === '-h' || a === '--help') out.help = true;
    else {
      warn(`unknown flag: ${a}`);
      out.usageError = true;
    }
  }
  return out;
}

function resolveRepoArg(repoArg) {
  if (repoArg) return resolve(repoArg);
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return process.cwd();
  }
}

function renderSummary({ path, branch, base, deps }) {
  return [
    '',
    `  workspace   ${path}`,
    `  branch      ${branch}   (no upstream — first push must be:`,
    `                          git push -u origin ${branch})`,
    `  base        ${base}`,
    '  env         local, no production writes',
    `  deps        ${deps}`,
    '',
    path,
    '',
  ].join('\n');
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help || args.usageError || !args.name) {
    process.stderr.write(
      'usage: create-workspace.mjs --name <task> [--base <ref>] [--install] [--keep] ' +
        '[--home <dir>] [--repo <dir>] [--path-only | --summary]\n',
    );
    process.exit(args.help && !args.usageError ? 0 : 2);
  }

  const repo = resolveRepoArg(args.repo);
  try {
    const result = await createWorkspace({
      name: args.name,
      base: args.base ?? 'origin/main',
      install: args.install,
      keep: args.keep,
      home: args.home,
      repo,
    });
    if (args.pathOnly) {
      process.stdout.write(`${result.path}\n`);
    } else if (args.summary) {
      process.stdout.write(renderSummary(result));
    } else {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`${err && err.message ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

// `process.argv[1]` is the resolved script path when run directly; when this
// module is only imported it is the importer's path, so this never fires
// then. realpathSync guards the symlink case the same way
// workspace-identity.mjs's own CLI guard does.
if (process.argv[1] && (() => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})()) {
  main(process.argv.slice(2));
}
