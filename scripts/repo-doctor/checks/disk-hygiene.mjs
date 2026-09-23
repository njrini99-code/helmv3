// Disk hygiene: untracked bloat and a stray auto-memory store, both WARN —
// neither is a hard invariant, both are the kind of thing that quietly grows
// until a `find`/`grep` returns two copies of everything (autonomy.md's
// `.worktrees/codex-golf-team-operations` incident) or a machine hits zero
// bytes free (AGENTS.md's six-worktrees-in-one-day incident).
//
//   disk.untracked-bloat   a directory that is NOT gitignored and NOT
//                          committed, over 50 MB, sitting at the repo root or
//                          under docs/. Gitignored bloat over a much larger
//                          threshold is already scratch.mjs's job — this
//                          check is for the narrower, easy-to-miss case: a
//                          scratch export or generated folder nobody added to
//                          .gitignore, quietly growing in a checkout that
//                          `git status` shows as "clean" at a glance because
//                          reviewers scan for staged changes, not untracked
//                          directories.
//   disk.auto-memory-dir   the harness's per-project auto-memory store
//                          (~/.claude/projects/<mangled-repo-path>/memory)
//                          exists at all. shipping.md §1b: this repo runs
//                          with autoMemoryEnabled: false specifically because
//                          it already has an explicit, Git-backed memory
//                          architecture (memory/registry.yml, memory/
//                          features/**, …) and a second, machine-local store
//                          is a second authority for engineering truth. Its
//                          existence — not its size — is the finding: the
//                          flag can read false while a store from before that
//                          setting still sits on disk.

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { canonicalRootOf } from '../../../.claude/hooks/lib/workspace-identity.mjs';
import { git } from '../lib/exec.mjs';
import { check, Status } from '../result.mjs';

export const meta = { id: 'disk', title: 'Untracked bloat & auto-memory store' };

const UNTRACKED_WARN_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Untracked (never committed, and not merely gitignored) directory paths,
 * relative to repoRoot, at the repo root or anywhere under docs/. `git
 * status --porcelain --untracked-files=normal` reports a wholly-untracked
 * directory as ONE entry ending in "/" — including a subdirectory of an
 * otherwise-tracked parent like docs/ — rather than every file inside it.
 */
export function untrackedDirsInScope(porcelain) {
  return (porcelain ?? '')
    .split('\n')
    .filter((l) => l.startsWith('?? ') && l.endsWith('/'))
    .map((l) => l.slice(3, -1))
    .filter((p) => !p.includes('/') || p.startsWith('docs/'));
}

function dirBytes(absPath) {
  if (!existsSync(absPath)) return null;
  const r = spawnSync('du', ['-sk', absPath], { encoding: 'utf-8', timeout: 20000 });
  if (r.status !== 0 || !r.stdout) return null;
  const kib = Number.parseInt(r.stdout.split('\t')[0], 10);
  return Number.isNaN(kib) ? null : kib * 1024;
}

/** `/a/b/c` -> `-a-b-c`, the harness's own project-directory mangling scheme. */
export function mangleProjectPath(absPath) {
  return absPath.replace(/\//g, '-');
}

export async function run(ctx) {
  const out = [];
  const { repoRoot } = ctx;
  const homeDir = ctx.homeDir ?? homedir();

  // --- untracked bloat ---
  const st = git(repoRoot, ['status', '--porcelain', '--untracked-files=normal']);
  if (!st.ok) {
    out.push(check('disk.untracked-bloat', Status.UNKNOWN, 'git status failed', { detail: st.error }));
  } else {
    const candidates = untrackedDirsInScope(st.value);
    const offenders = [];
    for (const rel of candidates) {
      const bytes = dirBytes(join(repoRoot, rel));
      if (bytes !== null && bytes > UNTRACKED_WARN_BYTES) offenders.push({ path: rel, mb: Math.round(bytes / 1024 / 1024) });
    }
    out.push(
      offenders.length === 0
        ? check('disk.untracked-bloat', Status.PASS, `no untracked directory over ${UNTRACKED_WARN_BYTES / 1024 / 1024} MB at the repo root or under docs/`)
        : check('disk.untracked-bloat', Status.WARN,
            `${offenders.length} untracked director${offenders.length === 1 ? 'y is' : 'ies are'} over ${UNTRACKED_WARN_BYTES / 1024 / 1024} MB and uncommitted`, {
              evidence: offenders,
            }),
    );
  }

  // --- auto-memory store ---
  const canonicalRoot = canonicalRootOf(repoRoot);
  const projectDir = join(homeDir, '.claude', 'projects', mangleProjectPath(canonicalRoot));
  const memoryDir = join(projectDir, 'memory');
  out.push(
    existsSync(memoryDir)
      ? check('disk.auto-memory-dir', Status.WARN,
          `a harness auto-memory store exists at ${memoryDir.replace(homeDir, '~')} — shipping.md §1b: this repo's memory authority is memory/registry.yml + memory/features/**, not a machine-local store`, {
            actual: memoryDir,
          })
      : check('disk.auto-memory-dir', Status.PASS, 'no harness auto-memory store for this project'),
  );

  return out;
}
