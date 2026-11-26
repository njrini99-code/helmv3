#!/usr/bin/env bash
# Fails CI if a query references a column that does not exist on its table.
# These mistakes have shipped to prod twice; each was a several-hour fire.
#
# Invariants enforced:
#   1. golf_team_coach_staff has NO user_id column. Use coach_id, joined via
#      golf_coaches (or use verifyTeamAccess / coach_id_for_team RPC).
#   2. golf_coaches has NO team_id column. Use golf_team_coach_staff to map.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

FAIL=0
SEARCH_PATHS=(src supabase/tests)

# Patterns are scoped to a window so we only flag the broken combination
# (table + column) not coincidental uses of either name on its own.

echo "→ Invariant 1: golf_team_coach_staff.user_id (column does not exist)"
HITS=$(grep -rnE --include='*.ts' --include='*.tsx' --include='*.sql' \
  -B0 -A6 "from[(]['\"]golf_team_coach_staff['\"]" "${SEARCH_PATHS[@]}" 2>/dev/null \
  | grep -B6 "[.]eq[(]['\"]user_id['\"]" \
  | grep -E "^(src|supabase)/.*:.*from[(]['\"]golf_team_coach_staff" || true)
if [[ -n "$HITS" ]]; then
  echo "✖ FOUND: query of golf_team_coach_staff filtering by user_id"
  echo "$HITS"
  echo
  echo "  golf_team_coach_staff has no user_id column. Use one of:"
  echo "    - verifyTeamAccess(teamId, userId) from @/lib/auth/verify-player-access"
  echo "    - coach_id_for_team(team_id, user_id) RPC"
  echo "    - Join through golf_coaches.user_id → golf_coaches.id → golf_team_coach_staff.coach_id"
  FAIL=1
fi

echo "→ Invariant 2: golf_coaches.team_id (column does not exist)"
HITS=$(grep -rnE --include='*.ts' --include='*.tsx' --include='*.sql' \
  -B0 -A6 "from[(]['\"]golf_coaches['\"]" "${SEARCH_PATHS[@]}" 2>/dev/null \
  | grep -B6 "[.]eq[(]['\"]team_id['\"]" \
  | grep -E "^(src|supabase)/.*:.*from[(]['\"]golf_coaches" || true)
if [[ -n "$HITS" ]]; then
  echo "✖ FOUND: query of golf_coaches filtering by team_id"
  echo "$HITS"
  echo
  echo "  golf_coaches has no team_id column. Use golf_team_coach_staff."
  FAIL=1
fi

if [[ $FAIL -eq 0 ]]; then
  echo "✓ All schema invariants pass"
fi
exit $FAIL
