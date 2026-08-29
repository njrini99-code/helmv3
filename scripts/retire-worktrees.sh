#!/usr/bin/env bash
# scripts/retire-worktrees.sh — report which task worktrees are safe to retire.
#
# Usage:
#   scripts/retire-worktrees.sh              # report only. Default. Removes nothing.
#   scripts/retire-worktrees.sh --remove     # act on RETIRABLE rows only
#
# WHY THIS EXISTS
#
# scripts/new-worktree.sh creates worktrees and NOTHING retires them. Measured
# 2026-08-28: three worktrees on already-merged branches held 11.6 GB, and the
# machine had hit 97% disk earlier the same day, killing a build on ENOSPC.
# The leak is designed-in, not accidental.
#
# THE TRAP THIS TOOL EXISTS TO AVOID
#
# The obvious safety rule — "has commits main doesn't have, so keep it" — is
# WRONG HERE, and inverted: it would keep every merged worktree forever.
#
# This repo squash-merges. A squash lands one NEW commit on main; the branch's
# own commits never become ancestors of it. Measured on three merged branches:
#
#     agent/canonical-write-boundary   ancestor-of-main=NO  unique=2  PR MERGED
#     agent/stop-verification          ancestor-of-main=NO  unique=1  PR MERGED
#     agent/integration-distance       ancestor-of-main=NO  unique=1  PR MERGED
#     git branch --merged origin/main  ->  lists NONE of them
#
# So unique-commit count cannot distinguish "work you would lose" from "work
# already merged". Neither can ancestry. PR state is the only signal that can,
# which is why this tool requires `gh` and refuses to guess without it.
#
# WHAT IT REFUSES TO TOUCH, and each refusal is a separate check rather than
# one combined condition, so a report says exactly which fact saved a tree:
#
#   - the canonical checkout, identified STRUCTURALLY via the identity
#     authority, before any PR lookup. `gh pr list --head main` returns an
#     unrelated ancient closed PR on this repo, which a naive PR-state rule
#     would read as "closed, safe to delete" — and delete the control tower.
#   - any worktree with uncommitted changes
#   - any worktree whose branch has no merged PR
#   - any worktree whose remote branch still exists but whose local tip has
#     moved past it (commits made after the last push)
#   - any worktree a live process is sitting in
set -uo pipefail

REMOVE=0
[ "${1:-}" = "--remove" ] && REMOVE=1

command -v git >/dev/null 2>&1 || { echo "git required" >&2; exit 1; }

# Testability seam. HELM_PR_LOOKUP names a command receiving a branch and
# echoing "<number> <STATE>", or nothing when no PR exists. Tests set it to a
# stub because `gh` cannot answer for fixture branches that were never pushed
# anywhere. Unset in real use, where gh is the only source.
if [ -z "${HELM_PR_LOOKUP:-}" ] && ! command -v gh >/dev/null 2>&1; then
  echo "gh required: PR state is the only signal that can distinguish merged" >&2
  echo "work from work you would lose. Refusing to guess without it." >&2
  exit 1
fi

HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.claude/hooks/lib" && pwd -P)"
CANONICAL=$(node "$HOOKS_DIR/workspace-identity.mjs" --canonical-root 2>/dev/null)
[ -n "$CANONICAL" ] || { echo "could not resolve the canonical checkout" >&2; exit 1; }

git fetch origin --prune --quiet 2>/dev/null

printf '%-46s %-32s %-12s %s\n' WORKTREE BRANCH VERDICT WHY
printf '%.0s-' {1..118}; printf '\n'

RETIRABLE=()

while IFS=$'\t' read -r WT BR; do
  SHORT="${WT/#$HOME/~}"
  BR="${BR#refs/heads/}"

  # 1. canonical — structural, before anything else looks at a PR
  if [ "$WT" = "$CANONICAL" ]; then
    printf '%-46s %-32s %-12s %s\n' "$SHORT" "${BR:-–}" "KEEP" "canonical checkout (control tower)"
    continue
  fi

  # 2. detached HEAD has no branch to check a PR against
  if [ -z "$BR" ]; then
    printf '%-46s %-32s %-12s %s\n' "$SHORT" "(detached)" "KEEP" "detached HEAD — no branch to verify"
    continue
  fi

  # 3. uncommitted work exists nowhere else
  DIRTY=$(git -C "$WT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  if [ "${DIRTY:-1}" -ne 0 ]; then
    printf '%-46s %-32s %-12s %s\n' "$SHORT" "$BR" "KEEP" "$DIRTY uncommitted file(s)"
    continue
  fi

  # 4. a live process sitting in the tree means someone is using it
  if command -v lsof >/dev/null 2>&1 && lsof +D "$WT" 2>/dev/null | awk '$4=="cwd"' | grep -q .; then
    printf '%-46s %-32s %-12s %s\n' "$SHORT" "$BR" "KEEP" "a live process has its cwd here"
    continue
  fi

  # 5. PR state — the only signal that survives squash-merge.
  #
  #    EXIT CODE, not empty stdout, decides whether the question was ANSWERED.
  #    Empty stdout is ambiguous: it is what a successful "this branch has no
  #    PR" looks like AND what a failed lookup looks like. Reading them as the
  #    same thing printed "no PR found — cannot prove the work landed" for
  #    seven worktrees on 2026-08-28, four of them provably merged, because
  #    `gh pr list` (GraphQL) was failing with
  #    `tls: failed to verify certificate` and the error went to /dev/null.
  #
  #    Safe direction, false sentence. "Could not ask" is not "asked and found
  #    none", and an operator who reads the second concludes the work never
  #    landed rather than that the query never ran.
  #
  #    stderr is CAPTURED and bounded rather than discarded — the reason is the
  #    whole point of the distinction.
  LOOKUP_ERRFILE=$(mktemp)
  if [ -n "${HELM_PR_LOOKUP:-}" ]; then
    LOOKUP_OUT=$("$HELM_PR_LOOKUP" "$BR" 2>"$LOOKUP_ERRFILE")
    LOOKUP_RC=$?
  else
    LOOKUP_OUT=$(gh pr list --head "$BR" --state all --limit 1 --json number,state 2>"$LOOKUP_ERRFILE")
    LOOKUP_RC=$?
    if [ "$LOOKUP_RC" -eq 0 ]; then
      LOOKUP_OUT=$(printf '%s' "$LOOKUP_OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s);const p=a[0];process.stdout.write(p?p.number+" "+p.state:"")}catch{process.stdout.write("")}})' 2>/dev/null)
    fi
  fi
  LOOKUP_ERR=$(tr '\n' ' ' < "$LOOKUP_ERRFILE" | cut -c1-120)
  rm -f "$LOOKUP_ERRFILE"

  if [ "$LOOKUP_RC" -ne 0 ]; then
    printf '%-46s %-32s %-12s %s\n' "$SHORT" "$BR" "KEEP" "PR state unreadable — the lookup failed${LOOKUP_ERR:+: $LOOKUP_ERR}"
    continue
  fi

  read -r PR_NUM PR_STATE <<<"$LOOKUP_OUT"
  PR_NUM=${PR_NUM:-}
  PR_STATE=${PR_STATE:-}

  if [ -z "$PR_STATE" ]; then
    printf '%-46s %-32s %-12s %s\n' "$SHORT" "$BR" "KEEP" "no PR found — cannot prove the work landed"
    continue
  fi
  if [ "$PR_STATE" != "MERGED" ]; then
    printf '%-46s %-32s %-12s %s\n' "$SHORT" "$BR" "KEEP" "PR #${PR_NUM} is ${PR_STATE}, not MERGED"
    continue
  fi

  # 6. If the remote branch still exists, the local tip must match it — that is
  #    what catches commits made after the last push.
  #
  #    If it does NOT exist, that is the NORMAL state for a merged PR here:
  #    this repo has delete_branch_on_merge = true, verified against the API,
  #    so GitHub removes the branch the moment the PR merges.
  #
  #    An earlier version of this check required origin/$BR to exist. That was
  #    guaranteed FALSE for precisely the branches that are safe to retire, so
  #    the tool kept everything forever — the safe direction, and completely
  #    useless. The leak would have survived a tool written to fix it. Caught by
  #    running it, not by reading it.
  #
  #    Content is doubly preserved without the branch: the squash commit is on
  #    main, and GitHub keeps the PR's original commits addressable.
  if git show-ref --verify --quiet "refs/remotes/origin/$BR"; then
    LOCAL_TIP=$(git -C "$WT" rev-parse HEAD 2>/dev/null)
    REMOTE_TIP=$(git rev-parse "refs/remotes/origin/$BR" 2>/dev/null)
    if [ "$LOCAL_TIP" != "$REMOTE_TIP" ]; then
      printf '%-46s %-32s %-12s %s\n' "$SHORT" "$BR" "KEEP" "local tip differs from origin/$BR (unpushed)"
      continue
    fi
    WHY="PR #${PR_NUM} MERGED, clean, tip matches origin/$BR, idle"
  else
    WHY="PR #${PR_NUM} MERGED, clean, remote branch auto-deleted, idle"
  fi

  printf '%-46s %-32s %-12s %s\n' "$SHORT" "$BR" "RETIRABLE" "$WHY"
  RETIRABLE+=("$WT")
done < <(git worktree list --porcelain | awk '/^worktree /{p=$2} /^branch /{print p"\t"$2; p=""} /^detached/{print p"\t"; p=""}')

echo
if [ "${#RETIRABLE[@]}" -eq 0 ]; then
  echo "Nothing retirable."
  exit 0
fi

if [ "$REMOVE" -eq 0 ]; then
  echo "${#RETIRABLE[@]} retirable. Re-run with --remove to act:"
  printf '  scripts/retire-worktrees.sh --remove\n'
  echo
  echo "Reporting is the default on purpose. Every row above is a claim about"
  echo "someone's unfinished work, and it should be read before it is acted on."
  echo
  echo "RETIRABLE rows carry a standing owner authorization (2026-08-29): an"
  echo "agent may run --remove for them without asking, and should do it in the"
  echo "same step that merges the PR. KEEP rows still need a human."
  exit 0
fi

for WT in "${RETIRABLE[@]}"; do
  echo "removing $WT"
  git worktree remove "$WT" || echo "  refused — left in place"
done
