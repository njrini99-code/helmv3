#!/usr/bin/env node
// .claude/hooks/stamp-workspace.mjs — SessionStart.
//
// A backstop, not a second door. Every workspace scripts/lib/create-workspace.mjs
// makes already carries .helm/workspace.json — this hook exists for the
// workspaces that PREDATE the door, or that someone made by hand with a raw
// `git worktree add`. Both are invisible to the mutation budget as anything
// but "unreadable / no declared kind — counted, fails safe"
// (classifyWorkspaceKind in scripts/lib/worktree-lifecycle.mjs), and
// invisible to scripts/worktree-lifecycle.mjs as anything but
// KEEP_WORKSPACE_INTENT_REQUIRED. Stamping them lets the rest of the control
// plane reason about them instead of just refusing to touch them.
//
// This hook does three things, always in this order, and never throws a
// session off course — a SessionStart hook that fails still has to let the
// session start:
//   1. if the active root is a linked (non-canonical) worktree with no
//      .helm/workspace.json, write one — kind: task, parkPolicy: KEEP,
//      createdBy naming this hook so a reader can tell it was a backstop,
//      not the door.
//   2. if that worktree's path is inside the repo root, warn — the door
//      never places one there, so this is always leftover from a hand-rolled
//      `git worktree add` or a workspace older than the door.
//   3. always report "workspaces: N of budget <budget>", reusing the exact
//      classifier the mutation budget and repo:doctor use, so this number and
//      a budget refusal can never disagree.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoots } from './lib/workspace-identity.mjs';
import { listWorkspaces } from '../../scripts/lib/create-workspace.mjs';
import { DEFAULT_MUTATION_BUDGET } from '../../scripts/lib/worktree-lifecycle.mjs';

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
    parkPolicy: 'KEEP',
    createdBy: 'stamp-workspace (unmarked at session start)',
    createdAt: new Date().toISOString(),
  };
  try {
    mkdirSync(join(activeRoot, '.helm'), { recursive: true });
    writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
    return `stamped an unmarked worktree at ${activeRoot} with .helm/workspace.json ` +
      '(kind: task, parkPolicy: KEEP) — it predates the workspace door or was made by hand.';
  } catch (err) {
    return `could not stamp ${markerPath}: ${err?.message ?? err}`;
  }
}

function main() {
  const lines = [];
  let canonicalRoot = null;

  try {
    const input = readStdinJson();
    const roots = workspaceRoots(input);
    canonicalRoot = roots.canonicalRoot;

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

  const budget = Number(process.env.HELM_MAX_MUTATION_WORKTREES ?? DEFAULT_MUTATION_BUDGET);
  try {
    const spaces = listWorkspaces(canonicalRoot ?? process.cwd());
    const used = spaces.filter((s) => s.counts).length;
    lines.push(`workspaces: ${used} of budget ${budget}`);
  } catch (err) {
    lines.push(`workspaces: could not inspect (${err?.message ?? err}); budget ${budget}`);
  }

  emit(lines.join('\n'));
  process.exit(0);
}

main();
