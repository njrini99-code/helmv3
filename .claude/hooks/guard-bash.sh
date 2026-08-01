#!/usr/bin/env bash
# PreToolUse / Bash — deterministic guards for traps this repo has actually hit.
#
# Contract (docs: code.claude.com/docs/en/hooks):
#   stdin  = JSON with .tool_input.command
#   exit 0 = no objection (normal permission flow still applies)
#   exit 2 = BLOCK; stderr is fed back to Claude as the reason
# Never exit 1 — that is a non-blocking "hook error" notice, not a block.
set -uo pipefail

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && exit 0

block() { printf '%s\n' "$1" >&2; exit 2; }

# 1. git stash — refs/stash is REPO-GLOBAL, shared across every worktree.
#    A stash pushed in one worktree is visible (and poppable) from all of them,
#    so parallel agents silently steal each other's work.
if printf '%s' "$CMD" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+stash([[:space:]]|$)'; then
  block "BLOCKED: 'git stash'. refs/stash is repo-global and shared by every worktree, so a stash here is visible and poppable from all of them — that is how parallel work gets silently swapped.
Use instead: a WIP commit on the current branch (git add -A && git commit -m wip), or copy the file aside."
fi

# 2. rm -rf .next — deleting the Turbopack cache mid-session wedges cold compile
#    for the rest of the session and costs minutes per page.
if printf '%s' "$CMD" | grep -Eq 'rm[[:space:]]+(-[a-zA-Z]+[[:space:]]+)*.*\.next([/[:space:]]|$)'; then
  block "BLOCKED: removing .next mid-session. This wedges Turbopack into a cold-compile loop for the rest of the session.
If you genuinely need a clean build, stop the dev server first, then delete it, then restart."
fi

# 3. Exit-code masking — a gate command on the LEFT of a pipe reports the
#    PIPE's exit status, not the gate's. `npm test | tail` exits 0 while the
#    tests fail. This is the single most dangerous shape for a verification
#    step, because it manufactures a green result.
GATE='(npm[[:space:]]+(run[[:space:]]+)?(test|lint|typecheck|build)|npx[[:space:]]+(vitest|tsc|eslint|semgrep)|vitest[[:space:]]+run)'
if printf '%s' "$CMD" | grep -Eq "$GATE" \
   && printf '%s' "$CMD" | grep -q '|' \
   && ! printf '%s' "$CMD" | grep -q 'pipefail'; then
  block "BLOCKED: a gate command is piped, so its exit code is masked — the pipeline reports the LAST command's status, so a failing suite still looks like success.
Fix (keeps your filtering): prefix with 'set -o pipefail;' e.g.
  set -o pipefail; npm test 2>&1 | tail -40
Or capture the code explicitly: npm test > /tmp/out 2>&1; echo \"exit=\$?\"; tail -40 /tmp/out"
fi

# 4. Direct push to main — production serves main in this repo, so `git push
#    origin main` is a deploy, not a save. Force-pushing it can also destroy
#    history other worktrees are built on.
if printf '%s' "$CMD" | grep -Eq 'git[[:space:]]+push.*(--force|-f)([[:space:]]|$)'; then
  block "BLOCKED: force push. It rewrites remote history that other worktrees and open PRs are built on.
If you truly need it, use --force-with-lease and run it yourself."
fi
if printf '%s' "$CMD" | grep -Eq 'git[[:space:]]+push([[:space:]]+[^|;&]*)?[[:space:]]+(origin[[:space:]]+)?main([[:space:]]|$)'; then
  block "BLOCKED: pushing directly to main. Production serves main here, so this is a deploy — not a checkpoint.
Push a branch and open a PR instead: git push -u origin <branch>"
fi

exit 0
