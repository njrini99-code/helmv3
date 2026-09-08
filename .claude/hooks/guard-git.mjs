#!/usr/bin/env node
// .claude/hooks/guard-git.mjs — PreToolUse guard for dangerous Bash git/gh/vercel commands.
//
// Blocks unsafe force pushes, accidental main pushes from a task branch,
// bulk staging, forced branch deletion, and unreviewed worktree removal.
// Ordinary branch creation and authorized merges are allowed. Production
// CLI actions use permissions.ask so the user can authorize them.
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

/**
 * The `git push ...` clause of a compound command, stopping at the next
 * shell separator (&&, ||, ;, |, or newline). Flags are tested against this
 * clause only — testing the whole command let an unrelated `-f` elsewhere
 * in a compound command (e.g. `git push origin foo && rm -f x`) be
 * misread as a force-push flag.
 */
export function pushClauseOf(command) {
  const cmd = String(command || '');
  const m = cmd.match(/\bgit\s+push\b[^\n;|&]*/);
  return m ? m[0] : '';
}
const WORKTREE_REMOVE_RE = /\bgit\s+worktree\s+remove\b/;
const ADD_A_RE = /\bgit\s+add\s+(-A\b|--all\b|\.\s*$|\.\s)/;
const BRANCH_D_RE = /\bgit\s+branch\s+(-D\b|--delete\s+--force\b)/;

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
/**
 * Replace every quoted span and heredoc body with a single opaque word, so the
 * matchers below see COMMANDS and not prose. Until 2026-09-07 they matched raw
 * text, so
 *
 *     echo "never run git push --force on main"
 *     grep -rn "git push --force" docs/
 *     git commit -m "docs: explain why git reset --hard is banned"
 *
 * were refused: a string that merely NAMES a dangerous command is not that
 * command. This is the same keyword-matching failure this repo deleted a whole
 * Bash guard for; it survived here inside the quoting.
 *
 * A placeholder (not deletion) keeps argument arity intact, so
 * `git push origin "$b"` still parses as a push with a target ref.
 */
export function maskQuoted(command) {
  let s = String(command || '');
  // Heredoc bodies first — they can contain unbalanced quotes.
  s = s.replace(/<<-?\s*'?"?([A-Za-z_][A-Za-z0-9_]*)'?"?[\s\S]*?\n\s*\1\b/g, '<<Q');
  s = s.replace(/'[^']*'/g, 'Q');
  s = s.replace(/"(?:[^"\\]|\\.)*"/g, 'Q');
  return s;
}

export function evaluateCommand(command, branch) {
  const cmd = maskQuoted(command);

  const pushClause = pushClauseOf(cmd);

  if (FORCE_PUSH_RE.test(cmd) && FORCE_FLAG_RE.test(pushClause)) {
    const hasLease = LEASE_RE.test(pushClause);
    const target = targetRefOf(cmd);
    const targetIsMain = !target || target === 'main';
    if (!(hasLease && !targetIsMain)) {
      return 'git push --force/-f is blocked unless --force-with-lease targets a non-main ref';
    }
  }

  if (FORCE_PUSH_RE.test(cmd) && !FORCE_FLAG_RE.test(pushClause)) {
    const target = targetRefOf(cmd);
    if (target === 'main' && branch && branch !== 'main') {
      return `git push targeting main from branch '${branch}' is blocked — land via npm run pr:land`;
    }
  }

  if (WORKTREE_REMOVE_RE.test(cmd)) return 'raw `git worktree remove` is blocked — use npm run worktrees:{park,retire}';
  if (ADD_A_RE.test(cmd)) return '`git add -A`/`git add .` is blocked — stage explicit paths, the tree is shared';
  if (BRANCH_D_RE.test(cmd)) return '`git branch -D` is blocked — use npm run worktrees:{park,retire}';

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
