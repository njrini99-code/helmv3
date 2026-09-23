/**
 * Remove one workspace on the harness's request — the body of the
 * WorktreeRemove hook (.claude/hooks/worktree-remove.mjs).
 *
 * The WorktreeCreate hook routes every harness worktree (agent-<hex>,
 * wf_<hex>-<n>, --worktree sessions) through scripts/lib/create-workspace.mjs.
 * With no WorktreeRemove hook, the harness fell back to a bare
 * `git worktree remove`, which refused any checkout carrying the stale
 * `.mcp.json` copy — and 57 worktrees accumulated. This is the other half of
 * that door: gather facts, let decideRemoval() in worktree-lifecycle.mjs
 * decide, and act only on its verdict. It never passes --force.
 */
import { existsSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  ALREADY_GONE,
  REFUSE,
  REMOVE_DELETE_BRANCH,
  decideRemoval,
  effectiveDirty,
} from './worktree-lifecycle.mjs';
import {
  archiveBeforeDelete,
  contentInMain,
  gitIn,
  knownCopyPredicate,
  prFor,
  restoreCopies,
  statusPorcelain,
  uniqueCommits,
  workspaceIntent,
} from './worktree-facts.mjs';

const real = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
};

function listWorktrees(git) {
  const out = [];
  let cur = null;
  for (const line of (git(['worktree', 'list', '--porcelain']) ?? '').split('\n')) {
    if (line.startsWith('worktree ')) {
      if (cur) out.push(cur);
      cur = { path: line.slice(9), branch: null };
    } else if (cur && line.startsWith('branch refs/heads/')) {
      cur.branch = line.slice('branch refs/heads/'.length);
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * @param {{worktreePath: string, cwd?: string, log?: (m: string) => void}} opts
 * @returns {{ok: boolean, action: string, reason: string}}
 */
export function removeWorkspace({ worktreePath, cwd, log = () => {} }) {
  const target = resolve(worktreePath);
  const exists = existsSync(target);

  // The repository comes from the worktree itself, or the caller's cwd once
  // the directory is gone. `git worktree list` from its common dir is the
  // authority on what is registered; the first entry is the main checkout.
  const probe = gitIn(exists ? target : cwd ?? process.cwd());
  const commonDir = probe(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (!commonDir) {
    return exists
      ? { ok: false, action: REFUSE, reason: `${target} is not inside a git repository` }
      : { ok: true, action: ALREADY_GONE, reason: 'nothing left at that path' };
  }
  const repo = dirname(commonDir);
  const git = gitIn(repo);
  const all = listWorktrees(git);
  const canonical = all[0]?.path ?? repo;
  const entry = all.find((w) => real(w.path) === real(target));

  const facts = {
    exists,
    registered: Boolean(entry),
    isCanonical: real(target) === real(canonical),
  };
  if (entry && exists && !facts.isCanonical) {
    const branch = entry.branch;
    const localSha = git(['rev-parse', 'HEAD'], { cwd: target });
    const upstream = branch
      ? git(['for-each-ref', '--format=%(upstream:short)', `refs/heads/${branch}`]) || null
      : null;
    const dirty = effectiveDirty(
      statusPorcelain(git, target),
      knownCopyPredicate(git, canonical)(target),
    );
    const unique = localSha ? uniqueCommits(git, localSha) : null;
    // A PR lookup is only needed when the tip carries commits main lacks.
    const pr = branch && unique !== 0 ? prFor(branch, repo) : { lookup: 'OK', state: 'NONE' };
    Object.assign(facts, {
      parkPolicy: workspaceIntent(target).parkPolicy,
      dirtyCount: dirty.dirtyCount,
      staleCopies: dirty.ignored,
      branch,
      localSha,
      uniqueCommits: unique,
      upstream,
      remoteSha: upstream ? git(['rev-parse', upstream]) : null,
      prLookup: pr.lookup,
      prNumber: pr.number ?? null,
      prState: pr.state ?? null,
      prHeadSha: pr.headSha ?? null,
      contentInMain:
        pr.state === 'MERGED' && pr.headSha && pr.headSha !== localSha ? contentInMain(git, localSha) : null,
    });
  }

  const d = decideRemoval(facts);
  if (d.action === ALREADY_GONE) {
    git(['worktree', 'prune']);
    return { ok: true, ...d };
  }
  if (d.action === REFUSE) return { ok: false, ...d };

  if (facts.staleCopies?.length) {
    log(`restoring stale copies: ${facts.staleCopies.join(', ')}`);
    restoreCopies(git, target, facts.staleCopies);
  }
  if (git(['worktree', 'remove', target]) === null) {
    return { ok: false, action: REFUSE, reason: `git worktree remove refused ${target} (untracked files?)` };
  }
  log(`removed checkout ${target}`);

  if (d.action === REMOVE_DELETE_BRANCH && facts.branch) {
    // Re-check the tip right before the irreversible step.
    if (git(['rev-parse', `refs/heads/${facts.branch}`]) !== facts.localSha) {
      return { ok: true, action: 'REMOVE', reason: `${d.reason}; branch tip moved, branch kept` };
    }
    if (d.archive && !archiveBeforeDelete(git, facts.branch, facts.localSha, facts.prNumber, log)) {
      return { ok: true, action: 'REMOVE', reason: `${d.reason}; archive tag failed, branch kept` };
    }
    if (git(['branch', '-D', facts.branch]) === null) {
      return { ok: true, action: 'REMOVE', reason: `${d.reason}; branch delete refused, branch kept` };
    }
    log(`deleted branch ${facts.branch}`);
  }
  return { ok: true, ...d };
}
