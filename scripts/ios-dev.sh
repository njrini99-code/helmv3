#!/usr/bin/env bash
# Run the iOS app against this Mac's dev server, for testing Clubhouse on a
# phone or the simulator (docs/clubhouse/MOBILE.md). Debug builds only.
#
#   terminal 1:  npm run dev -- -H 0.0.0.0
#   terminal 2:  npm run ios:dev            (PORT=3000 by default)
#
# The phone and the Mac must be on the same network. golf_clubhouse_ui is on in
# development, so the phone gets Clubhouse. When `cap run` finishes, the
# tracked native files go back to production, so nothing here can be committed
# or archived by accident (src/test/lib/capacitor-config.test.ts checks).
set -euo pipefail
cd "$(dirname "$0")/.."

port="${PORT:-3000}"
host="${CAP_DEV_HOST:-$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || true)}"
if [ -z "$host" ]; then
  echo "ios:dev: couldn't find this Mac's network address; set CAP_DEV_HOST=<ip>" >&2
  exit 1
fi
url="http://${host}:${port}/golf/dashboard"

if ! curl -s -o /dev/null --max-time 5 "http://${host}:${port}/"; then
  echo "ios:dev: nothing answers at http://${host}:${port}. Start it with: npm run dev -- -H 0.0.0.0" >&2
  exit 1
fi

native=ios/App/App
config="$native/capacitor.config.json"
backup="$(mktemp)"
cp "$config" "$backup"
clean=0
git diff --quiet -- "$native" && clean=1
restore() {
  if [ "$clean" = 1 ]; then
    git checkout -- "$native"
  else
    cp "$backup" "$config"
  fi
  rm -f "$backup"
  echo "ios:dev: native config is back on production."
}
trap restore EXIT

echo "ios:dev: the app will load $url"
CAP_SERVER_URL="$url" npx cap run ios "$@"
