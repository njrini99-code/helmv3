#!/bin/bash
# chunk.sh <plan> [secs]: record Instruments "Animation Hitches" on the phone while
# run.py <plan> drives it, print the hitches mapped to steps, then delete the trace.
# Keep secs at 45 or less: longer or failed recordings can leave the phone's ktrace
# stuck until it restarts. Reads HELM_PHONE_UDID (required) and HELM_PHONE_OUT.
set -euo pipefail
if [[ $# -lt 1 || $1 == -h || $1 == --help ]]; then
  sed -n '2,5p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi
: "${HELM_PHONE_UDID:?set HELM_PHONE_UDID (xcrun devicectl list devices)}"
DIR=$(cd "$(dirname "$0")" && pwd)
OUT=${HELM_PHONE_OUT:-${TMPDIR:-/tmp}/helm-phone}
export HELM_PHONE_OUT=$OUT
PLAN=$1
SECS=${2:-40}
mkdir -p "$OUT"
T="$OUT/h-$PLAN.trace"
L="$OUT/h-$PLAN.log"
rm -rf "$T"
: > "$OUT/steps.log"
xcrun xctrace record --template "Animation Hitches" --device "$HELM_PHONE_UDID" --all-processes \
  --time-limit "${SECS}s" --output "$T" > "$L" 2>&1 &
until grep -q "Ctrl-C" "$L"; do
  if ! kill -0 $! 2>/dev/null; then cat "$L"; exit 1; fi
  sleep 0.3
done
python3 "$DIR/run.py" "$PLAN"
wait
grep -E "error|Error" "$L" || true
python3 "$DIR/hitches.py" "$T" "$OUT/steps.log"
rm -rf "$T"
