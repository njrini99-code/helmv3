#!/usr/bin/env node
// .claude/hooks/deps-hygiene.mjs — SessionStart + PostToolUse(Bash). ADVISORY ONLY.
//
// PostToolUse on purpose: the repo's owner grant is "no PreToolUse hook" outside an audit
// session (a test and the enforcement inventory treat any PreToolUse hook as a blocking
// mechanism; the one allowed is the audit-only no-prod-in-audit.mjs), so this hook reports
// right after the command instead of before it.
//
// Why: every checkout's node_modules is an APFS clone of the deps store entry
// for its own lockfile (scripts/lib/deps-store.mjs). SessionStart is the
// backstop for checkouts the post-checkout hook did not reach:
//   - node_modules missing: clone it now (a store hit takes 10-20 s), or say
//     the one command that fills the store;
//   - node_modules a symlink: unsupported. A symlinked tree resolves whatever
//     the donor has (canonical was 70 packages behind main on 2026-11-15),
//     Turbopack refuses it, and an npm write through it rewrites the donor's
//     tree for everyone (2026-10-10, 2026-11-15);
//   - node_modules a real tree for another lockfile: say so. It is never
//     replaced here: a dev server may be running from it (--refresh does that).
// After Bash it still warns about npm writes through a symlink, and about
// heavy rarely-run tools (momentic, promptfoo) that run through pinned npx.
//
// Never blocks and never throws; every failure
// degrades to a silent exit 0. Silent when there is nothing to say.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, statSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirMatchesLock, keyForDir, readMarker } from '../../scripts/lib/deps-store.mjs';

/** The helper next to this hook (same checkout, same version). */
const ENSURE = resolve(dirname(fileURLToPath(import.meta.url)), '../../scripts/ensure-worktree-deps.mjs');

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

/** Clone node_modules for a checkout that has none: one line saying what happened. */
function cloneMissing(root) {
  if (!existsSync(join(root, 'package-lock.json')) || !existsSync(ENSURE)) return null;
  const r = spawnSync('node', [ENSURE, root, '--clone-only', '--quiet'], { encoding: 'utf-8', timeout: 50_000 });
  const state = (r.stdout || '').trim().split('\n').pop() || '';
  if (state === 'deps: cloned') return `node_modules was missing; cloned it from the deps store for this lockfile.`;
  if (state === 'deps: missing') {
    return `node_modules is missing and the deps store has no tree for this lockfile yet. Fill it once (one npm ci; every checkout on this lockfile clones it after that): node scripts/ensure-worktree-deps.mjs ${root}`;
  }
  const why = (r.stderr || '').trim().split('\n')[0] || (r.error ? r.error.message : state || 'no answer');
  return `node_modules is missing and could not be cloned (${why}). Run: node scripts/ensure-worktree-deps.mjs ${root}`;
}

function sessionStart(root) {
  const notes = [];
  const nm = nodeModulesState(root);
  if (nm.kind === 'dangling') {
    notes.push(`node_modules is a broken link -> ${nm.target}. Replace it with a clone: node scripts/ensure-worktree-deps.mjs ${root}`);
  } else if (nm.kind === 'link') {
    notes.push(
      `node_modules is a symlink -> ${nm.target}, which is not supported: it resolves whatever versions that tree has, Turbopack refuses it, and an npm write through it changes the other checkout. Replace it with a clone of this lockfile's tree: node scripts/ensure-worktree-deps.mjs ${root}`,
    );
  } else if (nm.kind === 'missing') {
    const note = cloneMissing(root);
    if (note) notes.push(note);
  } else if (nm.kind === 'dir') {
    const key = keyForDir(root);
    const marker = readMarker(root);
    if (key && marker?.key !== key) {
      const match = dirMatchesLock(root);
      if (!match.ok && match.mismatches.length && !match.mismatches[0].startsWith('unreadable')) {
        notes.push(
          `node_modules was installed for a different lockfile (${match.mismatches.length} packages differ, e.g. ${match.mismatches.slice(0, 2).join('; ')}). Tests and tools here run those versions. When nothing is running from it: node scripts/ensure-worktree-deps.mjs ${root} --refresh`,
        );
      }
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

/**
 * The checkout a Bash command actually ran in: a leading `cd <dir> &&` wins, then the
 * tool call's cwd, then the session's project dir. Judging CLAUDE_PROJECT_DIR alone
 * warned about the session's own symlinked checkout when the command had cd'd into
 * the canonical one (2026-10-11).
 */
export function commandRoot(command, cwd, projectDir) {
  const base = cwd || projectDir || process.cwd();
  const m = /^\s*cd\s+("[^"]+"|'[^']+'|[^\s;&|]+)\s*(?:&&|;)/.exec(command || '');
  if (!m) return base;
  const dir = m[1].replace(/^["']|["']$/g, '').replace(/^~(?=\/|$)/, process.env.HOME || '~');
  return resolve(base, dir);
}

function main() {
  const input = readStdinJson();
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  if (input.hook_event_name === 'SessionStart') return sessionStart(root);
  if (input.hook_event_name === 'PostToolUse' && input.tool_name === 'Bash') {
    const command = String(input.tool_input?.command ?? '');
    return postBash(commandRoot(command, input.cwd, process.env.CLAUDE_PROJECT_DIR), command);
  }
}

try {
  if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(new URL(import.meta.url).pathname)) main();
} catch {
  /* advisory hook: never fail the session */
}
