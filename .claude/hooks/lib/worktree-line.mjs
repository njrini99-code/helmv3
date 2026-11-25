// .claude/hooks/lib/worktree-line.mjs — the ONE worktree-count line a session sees.
//
// session-context.sh prints it at SessionStart. It used to print two numbers for
// one fact ("worktrees: 22" here, "workspaces: 21 of budget 6" from
// stamp-workspace.mjs), and the second one read like a limit. There is no count
// limit: creation only prints an advisory at DEFAULT_MUTATION_BUDGET, and
// repo:doctor warns above budget + 1 (scripts/repo-doctor/checks/worktree-hygiene.mjs).
// The one real refusal is the disk reserve in scripts/lib/create-workspace.mjs.
// A hard cap exists only when HELM_MAX_MUTATION_WORKTREES is set, and then the
// line says so.
//
// The count is the linked checkouts the lifecycle classifier counts
// (inspectWorkspaces: canonical never counts, a detached release checkout does
// not), so it agrees with repo:doctor.
//
// CLI: `node worktree-line.mjs [repo]` prints the line, or nothing when there is
// no linked checkout, and always exits 0.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Pure: the text for `linked` counted checkouts. Empty string when there are none. */
export function formatWorktreeLine(linked, budget, enforced) {
  if (!Number.isFinite(linked) || linked < 1) return '';
  if (enforced) {
    return `worktrees: ${linked} linked (hard cap ${budget}, set by HELM_MAX_MUTATION_WORKTREES)`;
  }
  // repo:doctor warns when used > budget + 1.
  return `worktrees: ${linked} linked (advisory; repo:doctor warns above ${budget + 1})`;
}

export async function worktreeLine(repo, env = process.env) {
  const { listWorkspaces } = await import('../../../scripts/lib/create-workspace.mjs');
  const { DEFAULT_MUTATION_BUDGET } = await import('../../../scripts/lib/worktree-lifecycle.mjs');
  const enforced = env.HELM_MAX_MUTATION_WORKTREES !== undefined;
  const budget = Number(env.HELM_MAX_MUTATION_WORKTREES ?? DEFAULT_MUTATION_BUDGET);
  const linked = listWorkspaces(repo).filter((s) => s.counts).length;
  return formatWorktreeLine(linked, budget, enforced);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const line = await worktreeLine(process.argv[2] ?? process.cwd());
    if (line) process.stdout.write(`${line}\n`);
  } catch {
    // A SessionStart helper must never break a session. The caller falls back.
    process.exit(1);
  }
}
