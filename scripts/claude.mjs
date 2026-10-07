#!/usr/bin/env node
// scripts/claude.mjs — the `h` / `helm` launcher.
//
// Opens Claude Code in the Helm checkout you are standing in (canonical or a
// worktree), or in the canonical checkout when run from outside Helm. Claude
// is launched normally, so the checkout's own CLAUDE.md (which imports
// AGENTS.md), .claude/rules, skills, commands, agents, hooks, settings and
// .mcp.json all load — exactly what a direct `claude` launch gets.
//
// What it adds: before launching, it compares the checkout's agent
// configuration with origin/main and warns when the branch is carrying a
// STALE copy (a control-plane file this branch never touched but main has
// changed since). That is how an old branch would otherwise bring back
// retired rules or hooks. The fix is to merge or rebase on origin/main; the
// launcher never changes the checkout itself and never fetches.
//
// History: until 2026-09 this launcher injected canonical's settings, agents
// and AGENTS.md with `--setting-sources user,local`. Excluding the project
// source also dropped CLAUDE.md, every path-scoped rule, project skill, slash
// command and workflow, and subagents never saw AGENTS.md. Do not bring that
// back; keep branches current instead.
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Paths whose content changes how agents behave in this repo. */
export const CONTROL_PLANE = ['AGENTS.md', 'CLAUDE.md', '.claude', '.mcp.json', 'scripts/claude.mjs'];

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function lines(text) {
  return text ? text.split('\n').filter(Boolean) : [];
}

/**
 * Where to launch. A cwd inside any checkout of the same repository as `root`
 * is kept (normalized to that checkout's top level); anything else opens the
 * canonical checkout.
 */
export function resolveLaunchDirectory(cwd, root = scriptRoot) {
  let canonicalRoot = root;
  try {
    canonicalRoot = dirname(git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
    const currentCommon = git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    if (dirname(currentCommon) === canonicalRoot) {
      return { canonicalRoot, cwd: git(cwd, ['rev-parse', '--show-toplevel']) };
    }
  } catch { /* Outside Helm: open the canonical checkout. */ }
  return { canonicalRoot, cwd: canonicalRoot };
}

/**
 * Control-plane files that differ from `base` although this branch never
 * changed them — main moved on and this checkout still has the old copy.
 * Files the branch (or the working tree) changed on purpose are listed in
 * `changedHere` and are not a problem. Returns null when it cannot tell
 * (no `base` ref, detached from history, not a git checkout).
 */
export function configDrift(cwd, base = 'origin/main') {
  try {
    const mergeBase = git(cwd, ['merge-base', 'HEAD', base]);
    const differs = lines(git(cwd, ['diff', '--name-only', 'HEAD', base, '--', ...CONTROL_PLANE]));
    const changedHere = new Set([
      ...lines(git(cwd, ['diff', '--name-only', mergeBase, 'HEAD', '--', ...CONTROL_PLANE])),
      ...lines(git(cwd, ['diff', '--name-only', 'HEAD', '--', ...CONTROL_PLANE])),
    ]);
    return { stale: differs.filter((f) => !changedHere.has(f)), changedHere: [...changedHere] };
  } catch {
    return null;
  }
}

/** The one warning the launcher prints, or null when the config is current. */
export function driftWarning(drift, base = 'origin/main') {
  if (!drift || drift.stale.length === 0) return null;
  const shown = drift.stale.slice(0, 8).join(', ');
  const more = drift.stale.length > 8 ? ` (+${drift.stale.length - 8} more)` : '';
  return (
    `h: this checkout's agent config is behind ${base}: ${drift.stale.length} file(s) ` +
    `this branch did not change are stale: ${shown}${more}.\n` +
    `h: run \`git merge ${base}\` (or rebase) to pick up the current rules and hooks.\n`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const launch = resolveLaunchDirectory(process.cwd());
  const warning = driftWarning(configDrift(launch.cwd));
  if (warning) process.stderr.write(warning);
  const result = spawnSync('claude', process.argv.slice(2), { cwd: launch.cwd, stdio: 'inherit' });
  if (result.error) process.stderr.write(`Could not launch Claude: ${result.error.message}\n`);
  process.exit(result.status ?? 1);
}
