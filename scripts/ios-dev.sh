#!/usr/bin/env bash
# Run the iOS app against this Mac's dev server, for testing Clubhouse on a
# phone or the simulator (docs/clubhouse/MOBILE.md). Debug builds only.
#
#   terminal 1:  npm run dev -- -H 0.0.0.0     (logs the port it picked)
#   terminal 2:  npm run ios:dev               (same port: PORT, else this checkout's)
#
# The phone and the Mac must be on the same network. golf_clubhouse_ui is on in
# development, so the phone gets Clubhouse. When `cap run` finishes, the
# tracked native files go back to production, so nothing here can be committed
# or archived by accident (src/test/lib/capacitor-config.test.ts checks).
set -euo pipefail
cd "$(dirname "$0")/.."

port="${PORT:-$(node scripts/lib/dev-port.mjs)}"
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
# `cap sync` also rewrites the Swift package manifest; it goes back with the native config.
spm=ios/App/CapApp-SPM/Package.swift
config="$native/capacitor.config.json"
backup="$(mktemp)"
cp "$config" "$backup"
clean=0
git diff --quiet -- "$native" && clean=1
spm_clean=0
git diff --quiet -- "$spm" && spm_clean=1
restore() {
  if [ "$clean" = 1 ]; then
    git checkout -- "$native"
  else
    cp "$backup" "$config"
  fi
  [ "$spm_clean" = 1 ] && git checkout -- "$spm"
  rm -f "$backup"
  echo "ios:dev: native config is back on production."
}
trap restore EXIT

echo "ios:dev: the app will load $url"
if ! CAP_SERVER_URL="$url" npx cap run ios "$@"; then
  # `cap run` looks for App.app, but the product is named for the app ("Helm Sports Labs.app"), so its install step
  # fails on a simulator after a good build. Install and launch the build it made directly.
  target=""
  prev=""
  for a in "$@"; do [ "$prev" = "--target" ] && target="$a"; case "$a" in --target=*) target="${a#--target=}";; esac; prev="$a"; done
  app="$(find "ios/DerivedData/${target:-_}/Build/Products/Debug-iphonesimulator" -maxdepth 1 -name '*.app' 2>/dev/null | head -1)"
  if [ -n "$target" ] && [ -n "$app" ] && xcrun simctl list devices | grep -q "$target"; then
    xcrun simctl install "$target" "$app"
    xcrun simctl launch "$target" "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Info.plist")"
  else
    exit 1
  fi
fi
