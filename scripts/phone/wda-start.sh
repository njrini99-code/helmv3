#!/bin/bash
# wda-start.sh: run WebDriverAgent on the cabled iPhone and forward its port to
# 127.0.0.1:8100. Leaves both running in the background; logs in $HELM_PHONE_OUT.
# Reads HELM_PHONE_UDID (required), HELM_WDA_DIR (default ~/tools/WebDriverAgent)
# and HELM_WDA_DERIVED (default $TMPDIR/wda-dd). Build WDA once first: README.md.
set -euo pipefail
if [[ ${1:-} == -h || ${1:-} == --help ]]; then
  sed -n '2,5p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi
: "${HELM_PHONE_UDID:?set HELM_PHONE_UDID (xcrun devicectl list devices)}"
WDA_DIR=${HELM_WDA_DIR:-$HOME/tools/WebDriverAgent}
DD=${HELM_WDA_DERIVED:-${TMPDIR:-/tmp}/wda-dd}
OUT=${HELM_PHONE_OUT:-${TMPDIR:-/tmp}/helm-phone}
mkdir -p "$OUT"
if curl -sf -m 2 http://127.0.0.1:8100/status > /dev/null; then
  echo "WDA already answering on 127.0.0.1:8100"
  exit 0
fi
(cd "$WDA_DIR" && nohup xcodebuild test-without-building -project WebDriverAgent.xcodeproj \
  -scheme WebDriverAgentRunner -destination "id=$HELM_PHONE_UDID" -derivedDataPath "$DD" \
  > "$OUT/wda.log" 2>&1 &)
nohup iproxy 8100 8100 -u "$HELM_PHONE_UDID" > "$OUT/iproxy.log" 2>&1 &
for _ in $(seq 1 60); do
  if curl -sf -m 2 http://127.0.0.1:8100/status > /dev/null; then
    echo "WDA ready on 127.0.0.1:8100"
    exit 0
  fi
  sleep 1
done
echo "WDA did not answer in 60s; see $OUT/wda.log" >&2
exit 1
