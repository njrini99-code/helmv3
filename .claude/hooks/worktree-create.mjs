#!/usr/bin/env node
// .claude/hooks/worktree-create.mjs — the WorktreeCreate hook.
//
// The harness fires WorktreeCreate whenever a worktree is being made via
// `--worktree`, `isolation: "worktree"`, or a background session, and — once
// this hook is wired into .claude/settings.json (see
// docs/operations/WORKSPACES.md; this PR does not edit settings.json) —
// REPLACES the harness's own default of `git worktree add` under
// `.claude/worktrees/<name>/`. That default bypasses every governance this
// repo has: no mutation budget, no disk reserve, no .helm/workspace.json
// marker, and a location the nested-worktree check would flag. This hook
// routes the SAME request through scripts/lib/create-workspace.mjs — the one
// module scripts/new-worktree.sh also calls — so a subagent asking for
// isolation gets exactly what a human running new-worktree.sh gets.
//
// CONTRACT (harness hooks reference — see the scratchpad's
// details-harness.md §1 for the full quoted text):
//   - stdin carries JSON with (at least) `cwd` and `name`.
//   - stdout MUST be the absolute worktree path as the LAST non-empty line,
//     and NOTHING ELSE — a command-type WorktreeCreate hook cannot emit the
//     hookSpecificOutput JSON shape other events use, because the harness
//     reads stdout itself as the path string. Every other message this hook
//     produces goes to stderr.
//   - ANY non-zero exit code fails worktree creation outright — there is no
//     JSON decision model for this event, unlike PreToolUse/PostToolUse.
//   - the harness itself validates the returned path is absolute, has no
//     ./.. segments, and does not pass through a symlink below the repo
//     root — createWorkspace()'s own path (resolve() under HELM_WORKTREE_HOME)
//     already satisfies this, so no extra validation is duplicated here.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { createWorkspace } from '../../scripts/lib/create-workspace.mjs';
import { canonicalRootOf } from './lib/workspace-identity.mjs';

function readStdinJson() {
  try {
    const raw = readFileSync(0, 'utf-8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    process.stderr.write(`worktree-create: could not parse stdin JSON — ${err?.message ?? err}\n`);
    return {};
  }
}

function warn(message) {
  process.stderr.write(`${message}\n`);
}

async function main() {
  const input = readStdinJson();

  // `name` is a slug the harness either got from the user or auto-generated.
  // Absent (or blank) is possible per the docs' own wording ("either
  // specified by the user or auto-generated") — generate the same shape the
  // docs' own example uses (`bold-oak-a3f2`) rather than refuse.
  const name =
    typeof input.name === 'string' && input.name.trim()
      ? input.name.trim()
      : `wt-${randomBytes(3).toString('hex')}`;

  // Resolve the repo from `cwd` via its shared .git directory — the same
  // logic canonicalRootOf() already implements (git rev-parse
  // --git-common-dir, then that dir's parent), reused rather than
  // reimplemented so this hook can never disagree with repo:doctor or
  // scripts/lib/worktree-lifecycle.mjs about what "the repo" means.
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const repo = canonicalRootOf(cwd);

  try {
    const { path } = await createWorkspace({ name, repo, base: 'origin/main' });
    // The ENTIRE contract for a command-type WorktreeCreate hook: this line,
    // and only this line, on stdout.
    process.stdout.write(`${path}\n`);
    process.exit(0);
  } catch (err) {
    warn(`worktree-create refused: ${err?.message ?? err}`);
    process.exit(1);
  }
}

main();
