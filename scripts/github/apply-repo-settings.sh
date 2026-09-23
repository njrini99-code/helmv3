#!/usr/bin/env bash
# apply-repo-settings.sh — dry-run by default; the owner runs --apply.
#
# What this does, in order:
#   1. PATCH /repos/{owner}/{repo}: merge-commit off, rebase-merge off,
#      squash-merge on with PR title/body as the squash commit message.
#   2. Enable secret_scanning_non_provider_patterns and
#      secret_scanning_validity_checks under security_and_analysis.
#   3. (--apply --i-understand-protection-moves only) Create a repository
#      ruleset on `main` that turns on GitHub's native merge queue.
#
# IMPORTANT — read before running step 3 with --apply:
# GitHub's merge-queue feature is implemented as a ruleset rule
# (`merge_queue`), and a ruleset can ALSO carry its own
# `required_status_checks` rule. If the ruleset's required-checks list ever
# drifts from classic branch protection's required_status_checks.contexts,
# the two enforcement paths disagree about what's required — a PR could
# clear one and still be blocked (or not blocked) by the other. This script
# does NOT patch branch protection for you. Moving required checks into the
# ruleset (and deciding whether to keep, narrow, or remove them from classic
# branch protection) is a decision with real blast radius on `main`, so
# --apply refuses to touch the ruleset endpoint unless you ALSO pass
# --i-understand-protection-moves, confirming a human read this and decided
# the two lists should move together in this same step.
#
# The six required contexts as of 2026-09-06 (read live below, not
# hardcoded): CI aggregate, Review Gate aggregate, Analyze (actions),
# Analyze (javascript-typescript), Analyze (python), block-historical-edits.
# See .github/branch-protection.md and docs/CONTROL_PLANE_ENFORCEMENT.md.
#
# Every call below is idempotent: re-running with --apply after a partial
# or full success prints "already set" for anything that already matches
# and only PATCHes/POSTs what's still different.
#
# Usage:
#   scripts/github/apply-repo-settings.sh                 # dry run (default): prints the gh api calls
#   scripts/github/apply-repo-settings.sh --apply         # runs settings 1-2, skips the ruleset
#   scripts/github/apply-repo-settings.sh --apply --i-understand-protection-moves   # runs 1-3

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULESET_FILE="${SCRIPT_DIR}/merge-queue-ruleset.json"

APPLY=false
UNDERSTAND_PROTECTION_MOVES=false

for arg in "$@"; do
  case "$arg" in
    --apply)
      APPLY=true
      ;;
    --i-understand-protection-moves)
      UNDERSTAND_PROTECTION_MOVES=true
      ;;
    -h|--help)
      /bin/ls "$0" >/dev/null 2>&1 || true
      sed -n '1,40p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required and was not found on PATH." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required and was not found on PATH." >&2
  exit 1
fi

REPO_SLUG="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
if [ -z "$REPO_SLUG" ]; then
  echo "Could not determine owner/repo from gh; run from inside the repo checkout." >&2
  exit 1
fi

run_or_print() {
  # $1 = description, remaining args = the gh api invocation
  local desc="$1"
  shift
  if [ "$APPLY" = true ]; then
    echo "==> $desc"
    "$@"
  else
    echo "[dry-run] $desc"
    printf '    %q' "$@"
    printf '\n'
  fi
}

echo "Repository: $REPO_SLUG"
echo "Mode: $([ "$APPLY" = true ] && echo APPLY || echo DRY-RUN)"
echo

# ---------------------------------------------------------------------------
# 1. Merge button settings + squash commit message template
# ---------------------------------------------------------------------------
CURRENT_MERGE_SETTINGS="$(gh api "repos/${REPO_SLUG}" \
  -q '{allow_merge_commit, allow_rebase_merge, allow_squash_merge, squash_merge_commit_title, squash_merge_commit_message}' \
  2>/dev/null || echo '{}')"

DESIRED_MERGE_SETTINGS='{"allow_merge_commit":false,"allow_rebase_merge":false,"allow_squash_merge":true,"squash_merge_commit_title":"PR_TITLE","squash_merge_commit_message":"PR_BODY"}'

if [ "$(echo "$CURRENT_MERGE_SETTINGS" | jq -S .)" = "$(echo "$DESIRED_MERGE_SETTINGS" | jq -S .)" ]; then
  echo "Merge button settings: already set."
else
  run_or_print "PATCH /repos/${REPO_SLUG} — merge button settings" \
    gh api -X PATCH "repos/${REPO_SLUG}" \
      -f allow_merge_commit=false \
      -f allow_rebase_merge=false \
      -f allow_squash_merge=true \
      -f squash_merge_commit_title=PR_TITLE \
      -f squash_merge_commit_message=PR_BODY
fi
echo

# ---------------------------------------------------------------------------
# 2. Secret scanning: non-provider patterns + validity checks
# ---------------------------------------------------------------------------
CURRENT_SECRET_SCANNING="$(gh api "repos/${REPO_SLUG}" \
  -q '.security_and_analysis // {} | {non_provider: .secret_scanning_non_provider_patterns.status, validity: .secret_scanning_validity_checks.status}' \
  2>/dev/null || echo '{}')"

NON_PROVIDER_STATUS="$(echo "$CURRENT_SECRET_SCANNING" | jq -r '.non_provider // "unknown"')"
VALIDITY_STATUS="$(echo "$CURRENT_SECRET_SCANNING" | jq -r '.validity // "unknown"')"

if [ "$NON_PROVIDER_STATUS" = "enabled" ] && [ "$VALIDITY_STATUS" = "enabled" ]; then
  echo "Secret scanning (non-provider patterns + validity checks): already set."
else
  run_or_print "PATCH /repos/${REPO_SLUG} — secret scanning" \
    gh api -X PATCH "repos/${REPO_SLUG}" \
      -f 'security_and_analysis[secret_scanning_non_provider_patterns][status]=enabled' \
      -f 'security_and_analysis[secret_scanning_validity_checks][status]=enabled'
fi
echo

# ---------------------------------------------------------------------------
# 3. Merge queue ruleset on main (gated behind --i-understand-protection-moves)
# ---------------------------------------------------------------------------
echo "Merge queue ruleset (main):"
if [ "$APPLY" = true ] && [ "$UNDERSTAND_PROTECTION_MOVES" != true ]; then
  echo "  Refusing to touch the ruleset endpoint: --apply was passed without"
  echo "  --i-understand-protection-moves. Re-run with both flags once a human"
  echo "  has decided how required checks move between branch protection and"
  echo "  the new ruleset (see the header comment in this script)."
  echo
  exit 0
fi

EXISTING_RULESET_ID="$(gh api "repos/${REPO_SLUG}/rulesets" \
  --jq '.[] | select(.name=="merge-queue-main") | .id' 2>/dev/null || true)"

if [ -n "$EXISTING_RULESET_ID" ]; then
  echo "  Ruleset 'merge-queue-main' already exists (id ${EXISTING_RULESET_ID}): already set."
  echo "  This script does not update an existing ruleset in place — delete it"
  echo "  first via 'gh api -X DELETE repos/${REPO_SLUG}/rulesets/${EXISTING_RULESET_ID}'"
  echo "  if you intend to recreate it with different parameters."
  exit 0
fi

REQUIRED_CONTEXTS_JSON="$(gh api "repos/${REPO_SLUG}/branches/main/protection/required_status_checks" \
  -q '.contexts' 2>/dev/null || echo '[]')"

if [ "$REQUIRED_CONTEXTS_JSON" = "[]" ] || [ -z "$REQUIRED_CONTEXTS_JSON" ]; then
  echo "  Could not read required_status_checks.contexts from branch protection" >&2
  echo "  on main (empty or unreachable) — refusing to create a ruleset with an" >&2
  echo "  empty or guessed required-checks list. Check branch protection first." >&2
  exit 1
fi

echo "  Required contexts read from branch protection: $REQUIRED_CONTEXTS_JSON"

RULESET_BODY="$(jq \
  --argjson contexts "$REQUIRED_CONTEXTS_JSON" \
  '
    .rules |= map(
      if .type == "required_status_checks" then
        .parameters.required_status_checks = ($contexts | map({context: .}))
      else
        .
      end
    )
    | del(._comment)
  ' \
  "$RULESET_FILE")"

run_or_print "POST /repos/${REPO_SLUG}/rulesets — create merge-queue-main" \
  gh api -X POST "repos/${REPO_SLUG}/rulesets" --input - <<<"$RULESET_BODY"
