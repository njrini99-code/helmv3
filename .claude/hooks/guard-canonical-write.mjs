#!/usr/bin/env node
// .claude/hooks/guard-canonical-write.mjs — PreToolUse / Write|Edit|MultiEdit
//
// ONE responsibility: refuse agent file mutations inside the canonical Helm
// checkout. Task worktrees are unaffected.
//
// This is the only blocking hook in the repo. The five it replaces were
// unwired on 2026-08-27 because they matched WORDS against a command line,
// which refused an `echo`, a `grep`, and a `git commit -m` whose text merely
// described the thing they blocked. This guard does not read intent, does not
// match keywords, and does not look at branch names, file names, features or
// prompts. It compares two absolute paths.
//
// The decision, in full:
//
//     target path is inside canonicalRoot  ->  BLOCK
//     anything else                        ->  ALLOW
//
// `canonicalRoot` comes from git itself (`rev-parse --git-common-dir`, whose
// parent is the main checkout), so a linked worktree resolves to the same
// canonical root from anywhere in the repo. Nothing is inferred.
//
// WHY PATHS AND NOT cwd. The active workspace resolves the RELATIVE case, but
// the invariant being protected is about the file, not the session: a session
// sitting in a task worktree that writes an absolute path into the canonical
// checkout is exactly the mutation this exists to stop. Comparing the resolved
// target covers both, and satisfies the cwd-based cases too, because a file in
// a worktree is not inside the canonical root.

import { resolveActiveRoot, canonicalRootOf } from './lib/workspace-identity.mjs';
import { resolve, relative, isAbsolute, sep } from 'node:path';

/** True when `child` is inside `parent` (or is `parent` itself). */
function isInside(parent, child) {
  if (!parent || !child) return false;
  const rel = relative(parent, child);
  if (rel === '') return true;
  return !rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel);
}

async function readStdinJson() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
  } catch {
    return {};
  }
}

async function main() {
  const input = await readStdinJson();

  const filePath = input?.tool_input?.file_path;
  if (typeof filePath !== 'string' || !filePath) process.exit(0);

  const activeRoot = resolveActiveRoot(input);
  const canonicalRoot = canonicalRootOf(activeRoot);

  // A relative file_path is resolved against the ACTIVE workspace, never
  // against CLAUDE_PROJECT_DIR. Resolving it against the original project dir
  // is the bug class this whole change exists to close.
  const target = isAbsolute(filePath) ? resolve(filePath) : resolve(activeRoot, filePath);

  if (!isInside(canonicalRoot, target)) process.exit(0);

  process.stderr.write(
    `BLOCKED: this file is inside the canonical Helm checkout.\n\n` +
      `  file       ${target}\n` +
      `  canonical  ${canonicalRoot}\n` +
      `  active     ${activeRoot}\n\n` +
      `The canonical checkout is the control tower: it is for inspection, ` +
      `fetching, creating workspaces and coordinating releases. Agents do not ` +
      `mutate it.\n\n` +
      `Create or enter a task worktree, then make the change there:\n\n` +
      `  scripts/new-worktree.sh <task-name>\n\n` +
      `That gives you ~/worktrees/helmv3/<task-name> on branch ` +
      `agent/<task-name>, with no upstream and isolated dependencies.\n`,
  );
  process.exit(2);
}

main().catch(() => process.exit(0)); // never break a session on an internal error
