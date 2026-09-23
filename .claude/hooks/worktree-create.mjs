#!/usr/bin/env node
// .claude/hooks/worktree-create.mjs — the WorktreeCreate hook.
//
// The harness calls this for --worktree, isolated agents and background
// sessions. Resolve the creator from canonical so a source branch cannot
// bring back stale environment or tool provisioning.
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
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

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

  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  try {
    const commonDir = execFileSync('git', ['-C', cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const repo = dirname(commonDir);
    const sharedModule = join(repo, 'scripts/lib/create-workspace.mjs');
    const moduleUrl = existsSync(sharedModule)
      ? pathToFileURL(sharedModule)
      : new URL('../../scripts/lib/create-workspace.mjs', import.meta.url);
    const { createWorkspace } = await import(moduleUrl.href);
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
