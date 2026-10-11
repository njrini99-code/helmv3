#!/usr/bin/env node
// .claude/hooks/deps-hygiene.mjs — SessionStart + PostToolUse(Bash). ADVISORY ONLY.
//
// PostToolUse on purpose: the repo's owner grant is "no PreToolUse hook" (a test and the
// enforcement inventory treat any PreToolUse hook as a blocking mechanism), so this
// hook reports right after the command instead of before it.
//
// Why: most worktrees do not own a node_modules, they symlink the canonical
// checkout's (scripts/lib/create-workspace.mjs, "deps: symlinked"). That makes
// three mistakes cheap and silent, all of which happened on 2026-10-10:
//   1. an install/uninstall/dedupe run through a symlinked node_modules rewrites
//      node_modules/.package-lock.json for EVERY worktree that shares it, even
//      with --package-lock-only;
//   2. a worktree whose package-lock.json differs from the one it borrows
//      node_modules from resolves the wrong versions without any error;
//   3. heavy, rarely-run tools (momentic, promptfoo) were dependencies of every
//      install; they now run through pinned npx and a bare/unpinned call drifts.
//
// Never blocks and never throws; every failure
// degrades to a silent exit 0. Silent when there is nothing to say.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, statSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// name -> pinned invocation. Keep in sync with package.json scripts / CI.
export const ON_DEMAND_TOOLS = {
  promptfoo: 'npm run evals (or: npx --yes promptfoo@0.124.0 <cmd>)',
  momentic: 'npx --yes momentic@3.63.1 <cmd>',
  'react-devtools': 'npm run clubhouse:profile (npx --yes react-devtools@8.0.0)',
};

const INSTALLISH = /\bnpm\s+(?:ci|install|i|add|uninstall|remove|rm|prune|dedupe|ddp|update|up)\b/;
const LOCK_ONLY = /--package-lock-only|--lockfile-only|--dry-run/;

function readStdinJson() {
  try {
    const raw = readFileSync(0, 'utf-8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function emit(eventName, additionalContext) {
  process.stdout.write(
    `${JSON.stringify({ hookSpecificOutput: { hookEventName: eventName, additionalContext } })}\n`,
  );
}

function sha1(path) {
  try {
    return createHash('sha1').update(readFileSync(path)).digest('hex').slice(0, 12);
  } catch {
    return null;
  }
}

function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

/** State of <root>/node_modules: { kind: 'missing'|'dir'|'link'|'dangling', target? } */
export function nodeModulesState(root) {
  const p = join(root, 'node_modules');
  try {
    const st = lstatSync(p);
    if (!st.isSymbolicLink()) return { kind: 'dir' };
    const target = resolve(dirname(p), readlinkSync(p));
    return existsSync(target) ? { kind: 'link', target } : { kind: 'dangling', target };
  } catch {
    return { kind: 'missing' };
  }
}

/** Other worktrees whose node_modules symlinks into <root>/node_modules. */
export function sharers(root) {
  const mine = (() => {
    try {
      return realpathSync(join(root, 'node_modules'));
    } catch {
      return null;
    }
  })();
  if (!mine) return [];
  const out = [];
  for (const line of git(['worktree', 'list', '--porcelain'], root).split('\n')) {
    if (!line.startsWith('worktree ')) continue;
    const wt = line.slice(9);
    if (resolve(wt) === resolve(root)) continue;
    try {
      if (lstatSync(join(wt, 'node_modules')).isSymbolicLink() && realpathSync(join(wt, 'node_modules')) === mine) out.push(wt);
    } catch {
      /* no node_modules there */
    }
  }
  return out;
}

function hiddenLockTouchedRecently(root, seconds = 180) {
  try {
    return Date.now() - statSync(join(root, 'node_modules', '.package-lock.json')).mtimeMs < seconds * 1000;
  } catch {
    return true; // cannot tell: say it, rather than stay silent
  }
}

function liveBuilds() {
  try {
    const ps = execFileSync('ps', ['-axo', 'command'], { encoding: 'utf-8', timeout: 3000 });
    return ps.split('\n').filter((l) => /\bnext (?:dev|build)\b|next-server|next-build/.test(l)).length;
  } catch {
    return 0;
  }
}

function sessionStart(root) {
  const notes = [];
  const nm = nodeModulesState(root);
  if (nm.kind === 'dangling') {
    notes.push(`node_modules is a broken link -> ${nm.target}. Fix: node scripts/ensure-worktree-deps.mjs ${root}`);
  } else if (nm.kind === 'link') {
    const donor = join(dirname(nm.target), 'package-lock.json');
    const mineLock = sha1(join(root, 'package-lock.json'));
    const donorLock = sha1(donor);
    if (mineLock && donorLock && mineLock !== donorLock) {
      notes.push(
        `this checkout borrows node_modules from ${dirname(nm.target)} but their package-lock.json differ (${mineLock} vs ${donorLock}); installed versions may not match this branch. Give it its own install: node scripts/ensure-worktree-deps.mjs ${root}`,
      );
    }
  }
  try {
    const want = readFileSync(join(root, '.nvmrc'), 'utf-8').trim().replace(/^v/, '');
    const have = process.versions.node;
    if (want && have.split('.')[0] !== want.split('.')[0]) {
      notes.push(`Node ${have} is active but the repo pins ${want} (.nvmrc); run: fnm use`);
    }
  } catch {
    /* no pin file */
  }
  if (notes.length) emit('SessionStart', `deps-hygiene: ${notes.join(' | ')}`);
}

function postBash(root, command) {
  const notes = [];
  const nm = nodeModulesState(root);
  if (INSTALLISH.test(command)) {
    const shared = nm.kind === 'link' ? [root] : sharers(root);
    if (nm.kind === 'link') {
      if (hiddenLockTouchedRecently(root)) {
        notes.push(
          `that npm command ran through node_modules -> ${nm.target}; npm writes through the link (even --package-lock-only rewrites node_modules/.package-lock.json for every worktree sharing it). Check ${nm.target}/.package-lock.json still matches the donor package-lock.json; for lockfile-only work, detach first: rm node_modules && npm install --package-lock-only --ignore-scripts && ln -s ${nm.target} node_modules`,
        );
      }
    } else if (nm.kind === 'dir' && shared.length && !LOCK_ONLY.test(command)) {
      const builds = liveBuilds();
      notes.push(
        `that install changed a node_modules shared by ${shared.length} worktree(s)${builds ? ` while ${builds} next dev/build process(es) were running` : ''}; restart their dev servers and re-run their checks. Install here only when nothing is running.`,
      );
    }
  }
  for (const [tool, how] of Object.entries(ON_DEMAND_TOOLS)) {
    const bare = new RegExp(`(?:^|[;&|(]\\s*|npx\\s+(?:--yes\\s+|-y\\s+)?)${tool}(?![@\\w/.-])`);
    if (bare.test(command)) notes.push(`${tool} is not a repo dependency any more; use ${how} (a bare call only works from a stale install)`);
  }
  if (notes.length) emit('PostToolUse', `deps-hygiene: ${notes.join(' | ')}`);
}

function main() {
  const input = readStdinJson();
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  if (input.hook_event_name === 'SessionStart') return sessionStart(root);
  if (input.hook_event_name === 'PostToolUse' && input.tool_name === 'Bash') {
    return postBash(root, String(input.tool_input?.command ?? ''));
  }
}

try {
  if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(new URL(import.meta.url).pathname)) main();
} catch {
  /* advisory hook: never fail the session */
}
