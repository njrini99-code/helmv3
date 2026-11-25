#!/usr/bin/env node
// .claude/hooks/stamp-workspace.mjs — SessionStart.
//
// A backstop, not a second door. Every workspace scripts/lib/create-workspace.mjs
// makes already carries .helm/workspace.json — this hook exists for the
// workspaces that PREDATE the door, or that someone made by hand with a raw
// `git worktree add`. Both are otherwise counted as "unreadable / no declared
// kind — fails safe" (classifyWorkspaceKind in scripts/lib/worktree-lifecycle.mjs)
// and reported by scripts/worktree-lifecycle.mjs as
// KEEP_WORKSPACE_INTENT_REQUIRED. Stamping them lets the rest of the control
// plane reason about them instead of just refusing to touch them.
//
// The stamp is parkPolicy: PARK_IF_REPRODUCIBLE, the same default the door
// writes. It must never be KEEP: KEEP means a human or `--keep` asked for the
// checkout to stay, and a hook that stamps it on every unmarked checkout makes
// the merged-PR rule for unmarked checkouts (`landedUnmarked`, which needs the
// marker ABSENT) unreachable and makes decideRemoval refuse forever. The sweep's
// other refusals (dirty, unpushed, live process, open-PR disposition) still
// apply to a stamped checkout; the stamp only says "nobody asked to keep it".
//
// This hook does two things, in this order, and never throws a session off
// course — a SessionStart hook that fails still has to let the session start:
//   1. if the active root is a linked (non-canonical) worktree with no
//      .helm/workspace.json, write one — kind: task, parkPolicy:
//      PARK_IF_REPRODUCIBLE, createdBy naming this hook so a reader can tell it
//      was a backstop, not the door.
//   2. if that worktree's path is inside the repo root, warn — the door
//      never places one there, so this is always leftover from a hand-rolled
//      `git worktree add` or a workspace older than the door.
// It prints nothing else. The one worktree-count line a session sees comes from
// session-context.sh (via lib/worktree-line.mjs), so there is a single number.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoots } from './lib/workspace-identity.mjs';

function readStdinJson() {
  try {
    const raw = readFileSync(0, 'utf-8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function emit(additionalContext) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext },
    })}\n`,
  );
}

function stampIfUnmarked(activeRoot) {
  const markerPath = join(activeRoot, '.helm/workspace.json');
  if (existsSync(markerPath)) return null;
  const marker = {
    kind: 'task',
    parkPolicy: 'PARK_IF_REPRODUCIBLE',
    createdBy: 'stamp-workspace (unmarked at session start)',
    createdAt: new Date().toISOString(),
  };
  try {
    mkdirSync(join(activeRoot, '.helm'), { recursive: true });
    writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
    return `stamped an unmarked worktree at ${activeRoot} with .helm/workspace.json ` +
      '(kind: task, parkPolicy: PARK_IF_REPRODUCIBLE) — it predates the workspace door or was made by hand.';
  } catch (err) {
    return `could not stamp ${markerPath}: ${err?.message ?? err}`;
  }
}

function main() {
  const lines = [];

  try {
    const input = readStdinJson();
    const roots = workspaceRoots(input);

    if (roots.inRepo && roots.kind === 'task') {
      const stampLine = stampIfUnmarked(roots.activeRoot);
      if (stampLine) lines.push(stampLine);

      if (roots.canonicalRoot && roots.activeRoot.startsWith(`${roots.canonicalRoot}/`)) {
        lines.push(
          'WARNING: this worktree is inside the repo; the door puts them under ~/worktrees/helmv3',
        );
      }
    }
  } catch (err) {
    lines.push(`stamp-workspace: could not inspect the active workspace (${err?.message ?? err})`);
  }

  // Nothing to say is the normal case: print no context rather than an empty one.
  if (lines.length) emit(lines.join('\n'));
  process.exit(0);
}

main();
