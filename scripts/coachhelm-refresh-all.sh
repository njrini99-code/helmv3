#!/usr/bin/env bash
# coachhelm-refresh-all.sh — fire every CoachHelm cron in dependency order.
#
# Re-runs the full v3 engine pipeline against current shot/round data:
#   1. roster-sweep            → triggerPlayerInsightsAfterRound per player
#                                (tier-1 generators, composite synthesis,
#                                 pattern miner, performance predictor)
#   2. v3/standing-refresh     → percentile tables (team_pct, level_pct)
#   3. v3/genome-nightly       → 8-dimension player genome vectors
#   4. v3/causality-attribute  → coach_weights from corrected improvement_lift
#   5. v3/goal-suggestions-write → engine-suggested development goals
#   6. coachhelm-calibration   → confidence buckets from validated predictions
#   7. coachhelm-insight-lifecycle → mature/retract/effectiveness rollup
#   8. v3/goal-suggestions-evaluate → mark expired suggestions
#
# Idempotent — every cron skip-filters work it already finished. Safe to
# re-run on demand. Each step prints duration + result; exits non-zero on
# any HTTP != 200.
#
# Usage:
#   npm run coachhelm:refresh
#   # or directly:
#   ./scripts/coachhelm-refresh-all.sh
#
# Reads CRON_SECRET from .env.local (or the env). Targets prod by default;
# override with HELM_HOST=https://your-preview.vercel.app.

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
HELM_HOST="${HELM_HOST:-https://helmsportslabs.com}"
ENV_FILE="${ENV_FILE:-.env.local}"
TIMEOUT_SECS="${TIMEOUT_SECS:-290}"

if [[ -z "${CRON_SECRET:-}" ]] && [[ -f "$ENV_FILE" ]]; then
  CRON_SECRET=$(grep '^CRON_SECRET' "$ENV_FILE" | head -1 | cut -d'"' -f2)
fi
if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "ERROR: CRON_SECRET not set. Add to .env.local or export it." >&2
  exit 1
fi

# ── Cron pipeline (order matters — later steps depend on earlier writes) ────
crons=(
  "coachhelm-roster-sweep           Per-player v3 engine (insights/patterns/predictions/composites)"
  "v3/standing-refresh              Percentile tables for every metric"
  "v3/genome-nightly                8-dimension player genome vectors"
  "v3/causality-attribute           Coach weights from corrected attribution"
  "v3/goal-suggestions-write        Engine-suggested development goals"
  "coachhelm-calibration            Confidence buckets from validated predictions"
  "coachhelm-insight-lifecycle      Mature/retract states + effectiveness rollup"
  "v3/goal-suggestions-evaluate     Expire goal suggestions past their window"
)

total=${#crons[@]}
step=0
failed=0
t_run_start=$(date +%s)

echo "═══════════════════════════════════════════════════════════════════════"
echo " CoachHelm full refresh — $total crons against $HELM_HOST"
echo "═══════════════════════════════════════════════════════════════════════"

for entry in "${crons[@]}"; do
  step=$((step + 1))
  cron="${entry%% *}"
  desc=$(echo "$entry" | sed 's/^[^ ]* *//')
  printf "\n[%d/%d] %s\n      %s\n" "$step" "$total" "$cron" "$desc"

  t0=$(date +%s)
  response=$(curl -sS -w "\n__HTTP__%{http_code}" \
    "$HELM_HOST/api/cron/$cron" \
    -H "Authorization: Bearer $CRON_SECRET" \
    --max-time "$TIMEOUT_SECS" || echo $'\n__HTTP__000')
  t1=$(date +%s)

  http_code=$(echo "$response" | grep '^__HTTP__' | sed 's/^__HTTP__//')
  body=$(echo "$response" | sed '/^__HTTP__/d')

  duration=$((t1 - t0))
  if [[ "$http_code" == "200" ]]; then
    printf "      ✓ %ss — %s\n" "$duration" "$(echo "$body" | head -c 400)"
  else
    printf "      ✗ %ss — HTTP %s — %s\n" "$duration" "$http_code" "$(echo "$body" | head -c 400)"
    failed=$((failed + 1))
  fi
done

total_secs=$(($(date +%s) - t_run_start))
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
if [[ "$failed" -eq 0 ]]; then
  echo " ✓ DONE — $total/$total crons green in ${total_secs}s"
else
  echo " ✗ DONE — $failed/$total FAILED in ${total_secs}s"
fi
echo "═══════════════════════════════════════════════════════════════════════"

exit "$failed"
