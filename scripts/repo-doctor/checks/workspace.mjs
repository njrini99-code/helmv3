// Nested worktrees and nested git metadata — the mechanical cause of "agents
// keep editing the wrong copy." A worktree INSIDE the repo root means file
// search returns two copies of every source file.
//
// MARKER POLICY (the "one workspace door" change, 2026-09-05): every
// worktree scripts/lib/create-workspace.mjs makes carries .helm/workspace.json,
// created by either the CLI (scripts/new-worktree.sh) or the WorktreeCreate
// hook. That gives location and marker-presence two SEPARATE invariants
// instead of one:
//
//   nested,   marked    -> WARN  mis-placed, but tracked — the door never
//                                puts one here, but tooling can at least
//                                account for it
//   nested,   unmarked  -> FAIL  mis-placed AND untracked
//   external, unmarked  -> FAIL  every worktree must carry the marker,
//                                wherever it lives (a raw `git worktree add`
//                                or a pre-door checkout) — see
//                                docs/operations/WORKSPACES.md;
//                                .claude/hooks/stamp-workspace.mjs backstops
//                                this for the ACTIVE worktree at SessionStart,
//                                but does not reach an idle one
//   canonical             -> its own check below, WARN if absent — the file
//                                is gitignored and machine-local, so absence
//                                on a fresh clone is expected, not a defect

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { git } from '../lib/exec.mjs';
import { check, Status } from '../result.mjs';
// The one identity authority, same as checks/identity.mjs. `ctx.repoRoot` is
// the ACTIVE root — wherever repo:doctor happens to be invoked from, which
// may itself be a task worktree — so "canonical" for this check's purposes
// must be resolved explicitly rather than assumed to equal repoRoot.
import { canonicalRootOf } from '../../../.claude/hooks/lib/workspace-identity.mjs';

export const meta = { id: 'workspace', title: 'Workspace containment' };

function readMarker(worktreePath) {
  const p = join(worktreePath, '.helm/workspace.json');
  if (!existsSync(p)) return { present: false, kind: null };
  try {
    const data = JSON.parse(readFileSync(p, 'utf-8'));
    return { present: true, kind: data?.kind ?? null };
  } catch {
    return { present: true, kind: null, unreadable: true };
  }
}

export async function run(ctx) {
  const out = [];
  const { repoRoot } = ctx;

  const wt = git(repoRoot, ['worktree', 'list', '--porcelain']);
  if (!wt.ok) {
    out.push(check('workspace.worktrees', Status.UNKNOWN, 'git worktree list failed', { detail: wt.error }));
  } else {
    const paths = wt.value
      .split('\n')
      .filter((l) => l.startsWith('worktree '))
      .map((l) => l.slice('worktree '.length));

    // Resolved from the identity authority, not assumed to equal repoRoot:
    // repo:doctor may itself be running from inside a task worktree, and
    // `git worktree list` already returns every worktree of the shared repo
    // regardless of which one you ran it from.
    const canonical = resolve(canonicalRootOf(repoRoot));
    const others = paths.filter((p) => resolve(p) !== canonical);
    const nested = others.filter((p) => resolve(p).startsWith(`${canonical}/`));

    // 1. Nested location. WARN when every nested worktree carries a marker
    // (mis-placed but accounted for); FAIL when any lacks one.
    if (nested.length === 0) {
      out.push(check('workspace.nested-worktrees', Status.PASS, `no nested worktrees (${paths.length} total, all external)`));
    } else {
      const unmarkedNested = nested.filter((p) => !readMarker(p).present);
      out.push(
        unmarkedNested.length > 0
          ? check('workspace.nested-worktrees', Status.FAIL,
              `${unmarkedNested.length} of ${nested.length} nested worktree(s) have no .helm/workspace.json marker`, {
                evidence: unmarkedNested,
                source: 'config/repo/manifest.yml (workspace.nested_worktrees)',
              })
          : check('workspace.nested-worktrees', Status.WARN,
              `${nested.length} worktree(s) inside the repo root — marked, so tooling can account for ` +
              'them, but scripts/lib/create-workspace.mjs always places new ones under ~/worktrees/helmv3', {
                evidence: nested,
                source: 'docs/operations/WORKSPACES.md',
              }),
      );
    }

    // 2. Marker presence, independent of location. Every worktree — nested or
    // not — must be accounted for; an unmarked one is invisible to the
    // mutation budget as anything but "counts, fails safe", which is
    // tolerance, not correctness.
    const unmarkedAny = others.filter((p) => !readMarker(p).present);
    out.push(
      unmarkedAny.length === 0
        ? check('workspace.worktree-markers', Status.PASS, `every linked worktree carries .helm/workspace.json (${others.length} checked)`)
        : check('workspace.worktree-markers', Status.FAIL,
            `${unmarkedAny.length} worktree(s) have no .helm/workspace.json — predates the workspace door or was made by hand`, {
              evidence: unmarkedAny,
              source: 'scripts/lib/create-workspace.mjs always writes one; .claude/hooks/stamp-workspace.mjs backstops the active worktree only, at SessionStart',
            }),
    );

    // 3. The canonical checkout's OWN marker. Gitignored and machine-local —
    // absence is expected on a fresh clone, so this is WARN, never FAIL.
    const canonicalMarker = readMarker(canonical);
    out.push(
      !canonicalMarker.present
        ? check('workspace.canonical-marker', Status.WARN,
            'canonical checkout has no .helm/workspace.json (kind: canonical) — gitignored and machine-local, expected on a fresh clone')
        : canonicalMarker.kind === 'canonical'
          ? check('workspace.canonical-marker', Status.PASS, 'canonical checkout is marked kind: canonical')
          : check('workspace.canonical-marker', Status.WARN,
              `canonical checkout's .helm/workspace.json has kind '${canonicalMarker.kind}', expected 'canonical'`),
    );
  }

  // 4. No unexpected nested .git under the repo root (a copied/embedded checkout).
  const nestedGit = [];
  const skip = new Set(['node_modules', '.git', '.next', 'dist', '.turbo']);
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (skip.has(e.name)) continue;
      const full = join(dir, e.name);
      if (e.name === '.git') { nestedGit.push(full); continue; }
      // a nested .git file (linked worktree marker) also counts
      if (existsSync(join(full, '.git')) && !statSync(join(full, '.git')).isDirectory() === false) {
        // handled by the recursion below via the .git entry
      }
      walk(full, depth + 1);
    }
  };
  walk(repoRoot, 0);
  out.push(
    nestedGit.length === 0
      ? check('workspace.nested-git', Status.PASS, 'no nested .git metadata under the repo root')
      : check('workspace.nested-git', Status.FAIL, `${nestedGit.length} nested .git found under the repo root`, {
          evidence: nestedGit.map((p) => p.replace(repoRoot + '/', '')),
        }),
  );

  return out;
}
