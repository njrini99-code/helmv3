#!/usr/bin/env node
// .claude/hooks/require-preflight.mjs — PreToolUse(Bash): no push or PR
// without a green `npm run preflight` for the exact tree being published.
//
// Why: agents pushed, waited for CI, read the failure, fixed one thing and
// pushed again — each push cancelling the last run. `npm run preflight`
// reproduces the required checks locally in minutes; this hook makes running
// it the only way forward in a Claude session.
//
// Refuses, when .helm/runtime/preflight.json does not match the tree:
//   git push <remote> <branch>      (any branch except main — guard-git owns main)
//   gh pr create                    (without --draft; a draft runs no CI)
//   gh pr ready                     (the moment CI actually runs)
// Allowed regardless: `git push --delete`, tag pushes, `--dry-run`,
// `gh pr ready --undo`, repos without scripts/preflight.mjs, and sessions
// the owner started with HELM_PREFLIGHT_OVERRIDE=1 in the environment (it is
// read from the hook's process env, so a command prefix cannot set it).
//
// Hooks only run inside Claude Code: the owner's own terminal is unaffected
// (the git pre-push hook applies there, with HELM_SKIP_PREPUSH=1 as its
// escape hatch).
//
// Text matching over the command string, like guard-git.mjs — a guardrail
// for the typed forms, not a sandbox. Contract: exit 0 allow, exit 2 with a
// reason on stderr to block. Never throws; an internal error allows.

import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { maskQuoted } from './guard-git.mjs';

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

/** Split a masked command into simple clauses at shell separators. */
function clauses(masked) {
  return masked.split(/&&|\|\||[;|\n]/).map((c) => c.trim()).filter(Boolean);
}

/**
 * What in `command` needs a preflight stamp. Returns null (nothing to check)
 * or { action, rev, dir } — `rev` is the revision being published and `dir`
 * a directory the command switched to (`cd X &&` or `git -C X`), if any.
 */
export function publishIntent(command) {
  const masked = maskQuoted(command);
  let dir = null;
  for (const clause of clauses(masked)) {
    const cd = clause.match(/^cd\s+(\S+)$/);
    if (cd) {
      dir = cd[1];
      continue;
    }
    const push = clause.match(/(?:^|\s)git\s+(?:-C\s+(\S+)\s+)?push\b(.*)$/);
    if (push) {
      const args = push[2].trim().split(/\s+/).filter(Boolean);
      if (args.some((a) => /^(--delete|-d|--dry-run|-n|--tags|--mirror)$/.test(a))) continue;
      const positional = args.filter((a) => !a.startsWith('-'));
      const refspec = positional[1] ?? null;
      if (refspec?.startsWith(':')) continue; // deletion refspec
      const [src, dst = src] = refspec ? refspec.replace(/^\+/, '').split(':') : ['HEAD', null];
      const target = dst ? dst.replace(/^refs\/heads\//, '') : null;
      if (target === 'main' || (refspec && /^refs\/tags\//.test(refspec))) continue;
      // A quoted/variable ref (masked to Q) cannot be resolved here: judge HEAD.
      return { action: 'git push', rev: !src || src === 'Q' ? 'HEAD' : src, target, dir: push[1] ?? dir };
    }
    if (/(?:^|\s)gh\s+pr\s+create\b/.test(clause)) {
      if (/\s(--draft|-d)\b/.test(clause)) continue;
      return { action: 'gh pr create (not --draft)', rev: 'HEAD', dir };
    }
    if (/(?:^|\s)gh\s+pr\s+ready\b/.test(clause)) {
      if (/\s--undo\b/.test(clause)) continue;
      return { action: 'gh pr ready', rev: 'HEAD', dir };
    }
  }
  return null;
}

function gitOut(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/** Returns a block reason, or null to allow. `env` is injectable for tests. */
export async function evaluate(input, env = process.env) {
  if (input?.tool_name !== 'Bash') return null;
  const intent = publishIntent(input?.tool_input?.command);
  if (!intent) return null;
  if (env.HELM_PREFLIGHT_OVERRIDE === '1') return null;
  const base = input?.cwd || process.cwd();
  const cwd = intent.dir ? (isAbsolute(intent.dir) ? intent.dir : resolve(base, intent.dir.replace(/^~(?=\/|$)/, env.HOME ?? '~'))) : base;
  const root = gitOut(cwd, ['rev-parse', '--show-toplevel']);
  if (!root || !existsSync(join(root, 'scripts/preflight.mjs')) || !existsSync(join(root, 'scripts/lib/preflight-stamp.mjs'))) return null;
  // `git push` with no refspec pushes the current branch; main is guard-git's business.
  if (intent.action === 'git push' && (!intent.target || intent.target === 'HEAD') && gitOut(root, ['rev-parse', '--abbrev-ref', 'HEAD']) === 'main') return null;
  // The stamp logic lives with the checkout being pushed, so a branch that
  // changes it is judged by its own rules.
  const { verifyStamp } = await import(pathToFileURL(join(root, 'scripts/lib/preflight-stamp.mjs')).href);
  const r = verifyStamp(root, intent.rev);
  if (r.ok) return null;
  return (
    `${intent.action} needs a green preflight for this exact tree — ${r.reason}.\n` +
    '  Run `npm run preflight` (add `--full` for migrations, `use server`, or broad changes), fix EVERYTHING it reports in one batch, commit, and retry.\n' +
    '  Open PRs with `gh pr create --draft`; run `gh pr ready` only after preflight passes, so CI runs once.\n' +
    '  If a failure is pre-existing on main or infrastructure noise, stop and report it to the user instead of pushing around it.'
  );
}

async function run() {
  try {
    const reason = await evaluate(await readStdinJson());
    if (reason) {
      process.stderr.write(`BLOCKED by require-preflight: ${reason}\n`);
      process.exit(2);
      return;
    }
  } catch {
    // never block on an internal error
  }
  process.exit(0);
}

if (process.argv[1] && (() => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})()) {
  run().catch(() => process.exit(0));
}
