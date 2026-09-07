#!/usr/bin/env node
// .claude/hooks/guard-git.mjs — PreToolUse guard for dangerous Bash git/gh/vercel commands.
//
// Blocks, in a Bash command string:
//   - `git push --force` / `git push -f`, UNLESS `--force-with-lease` is
//     present AND the target ref is not `main`. The landing sequencer never
//     force-pushes at all (scripts/pr-land.mjs), so this rule exists purely
//     as a guardrail; a bare --force/-f (no lease) is always blocked, and
//     --force-with-lease is only allowed away from `main`.
//   - `git push origin main` (or `git push origin HEAD:main`) from a branch
//     whose upstream/current branch is not `main` — a stray push that would
//     otherwise land arbitrary commits on the shared branch.
//   - `git add -A` / `git add .` — this tree is shared between agents;
//     explicit paths only (AGENTS.md, autonomy.md).
//   - `git branch -D` — the lifecycle tool
//     (`npm run worktrees{,:park,:retire}`) is the sole branch-deletion
//     authority and preserves a tag first.
//   - raw `git worktree add`, `git worktree remove`, `git checkout -b`,
//     `git switch -c` — the door scripts (scripts/new-worktree.sh,
//     worktree-lifecycle.mjs) call git from Node, not from a Bash tool_input,
//     so they never match this.
//   - `gh pr merge` in any form — landing goes through `npm run pr:land`.
//   - `vercel --prod`, `vercel deploy --prod`, `vercel promote`,
//     `vercel rollback`, `vercel env rm`.
//
// This is text matching over a Bash command string, not shell semantics —
// the same caveat guard-canonical-write.mjs's header documents at length.
// It catches the literal, typed forms of these commands; it does not, and
// cannot, catch every way a shell could construct the same effect (command
// substitution, aliases, a script that wraps `git push`). It is a guardrail
// for the common case, not a sandbox boundary.
//
// Contract: reads hook JSON on stdin, exit 0 to allow, exit 2 with a
// one-line reason on stderr to block. Never throws — a crash must exit 0.

import { execFileSync } from 'node:child_process';

function readStdinJson() {
  return new Promise((resolvePromise) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      try {
        resolvePromise(JSON.parse(data || '{}'));
      } catch {
        resolvePromise({});
      }
    });
    process.stdin.on('error', () => resolvePromise({}));
  });
}

function currentBranch(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

const FORCE_PUSH_RE = /\bgit\s+push\b/;
const FORCE_FLAG_RE = /(--force\b|--force-with-lease\b|(^|\s)-f(\s|$))/;
const LEASE_RE = /--force-with-lease\b/;
const WORKTREE_ADD_RE = /\bgit\s+worktree\s+add\b/;
const WORKTREE_REMOVE_RE = /\bgit\s+worktree\s+remove\b/;
const CHECKOUT_B_RE = /\bgit\s+checkout\s+-b\b/;
const SWITCH_C_RE = /\bgit\s+switch\s+-c\b/;
const ADD_A_RE = /\bgit\s+add\s+(-A\b|--all\b|\.\s*$|\.\s)/;
const BRANCH_D_RE = /\bgit\s+branch\s+(-D\b|--delete\s+--force\b)/;
const GH_PR_MERGE_RE = /\bgh\s+pr\s+merge\b/;
const VERCEL_PROD_RE = /\bvercel\b[^\n]*(--prod\b)/;
const VERCEL_PROMOTE_RE = /\bvercel\s+promote\b/;
const VERCEL_ROLLBACK_RE = /\bvercel\s+rollback\b/;
const VERCEL_ENV_RM_RE = /\bvercel\s+env\s+rm\b/;

/** The ref a `git push` command targets, best-effort, or null for "current branch". */
export function targetRefOf(command) {
  // `git push <remote> <local>:<remote-ref>` or `git push <remote> <ref>`.
  const m = command.match(/\bgit\s+push\b([^\n|;&]*)/);
  if (!m) return null;
  const rest = m[1].trim();
  const tokens = rest.split(/\s+/).filter((t) => t && !t.startsWith('-'));
  // tokens[0] is the remote (e.g. "origin"), tokens[1] is the ref if given.
  if (tokens.length < 2) return null;
  const refSpec = tokens[1];
  const target = refSpec.includes(':') ? refSpec.split(':').pop() : refSpec;
  return target.replace(/^refs\/heads\//, '') || null;
}

/**
 * Evaluate a Bash command string. `branch` is the current branch (from git,
 * best-effort, may be null). Returns a block reason, or null to allow.
 */
export function evaluateCommand(command, branch) {
  const cmd = String(command || '');

  if (FORCE_PUSH_RE.test(cmd) && FORCE_FLAG_RE.test(cmd)) {
    const hasLease = LEASE_RE.test(cmd);
    const target = targetRefOf(cmd);
    const targetIsMain = !target || target === 'main';
    if (!(hasLease && !targetIsMain)) {
      return 'git push --force/-f is blocked unless --force-with-lease targets a non-main ref';
    }
  }

  if (FORCE_PUSH_RE.test(cmd) && !FORCE_FLAG_RE.test(cmd)) {
    const target = targetRefOf(cmd);
    if (target === 'main' && branch && branch !== 'main') {
      return `git push targeting main from branch '${branch}' is blocked — land via npm run pr:land`;
    }
  }

  if (WORKTREE_ADD_RE.test(cmd)) return 'raw `git worktree add` is blocked — use scripts/new-worktree.sh';
  if (WORKTREE_REMOVE_RE.test(cmd)) return 'raw `git worktree remove` is blocked — use npm run worktrees:{park,retire}';
  if (CHECKOUT_B_RE.test(cmd)) return 'raw `git checkout -b` is blocked — use scripts/new-worktree.sh';
  if (SWITCH_C_RE.test(cmd)) return 'raw `git switch -c` is blocked — use scripts/new-worktree.sh';
  if (ADD_A_RE.test(cmd)) return '`git add -A`/`git add .` is blocked — stage explicit paths, the tree is shared';
  if (BRANCH_D_RE.test(cmd)) return '`git branch -D` is blocked — use npm run worktrees:{park,retire}';
  if (GH_PR_MERGE_RE.test(cmd)) return '`gh pr merge` is blocked — use npm run pr:land';
  if (VERCEL_PROD_RE.test(cmd)) return 'a production Vercel deploy flag is blocked — use scripts/deploy-prod.sh';
  if (VERCEL_PROMOTE_RE.test(cmd)) return '`vercel promote` is blocked';
  if (VERCEL_ROLLBACK_RE.test(cmd)) return '`vercel rollback` is blocked';
  if (VERCEL_ENV_RM_RE.test(cmd)) return '`vercel env rm` is blocked';

  return null;
}

async function run() {
  const input = await readStdinJson();
  if (input?.tool_name !== 'Bash') {
    process.exit(0);
    return;
  }
  const branch = currentBranch(input?.cwd);
  const reason = evaluateCommand(input?.tool_input?.command, branch);
  if (reason) {
    process.stderr.write(`BLOCKED by guard-git: ${reason}\n`);
    process.exit(2);
    return;
  }
  process.exit(0);
}

import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
if (process.argv[1] && (() => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})()) {
  run().catch(() => process.exit(0));
}
