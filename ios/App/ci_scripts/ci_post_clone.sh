#!/bin/bash
# Xcode Cloud post-clone: install JS deps, cap sync, regenerate Package.resolved.
#
# HISTORY of failures this script defends against (read before editing):
#   1. Stale committed Package.resolved → originHash mismatch (PR #250/#251):
#      cap sync rewrites CapApp-SPM/Package.swift every build, so the resolved
#      file MUST be regenerated here, after cap sync.
#   2. "node_modules/@capacitor/* doesn't exist" at resolution time
#      (2026-06-10): CapApp-SPM/Package.swift references LOCAL PATH packages
#      under node_modules — if npm ci silently fails (brew/node flake, network)
#      every later step explodes with misleading SPM errors. This script now
#      fails LOUDLY at the exact phase that broke, with diagnostics.
set -euo pipefail
trap 'echo "### ci_post_clone FAILED at line $LINENO (phase: ${PHASE:-unknown}) ###" >&2' ERR

PHASE="env"
echo "=== [1/6] Environment ==="
if [ -z "${CI_PRIMARY_REPOSITORY_PATH:-}" ]; then
    echo "ERROR: CI_PRIMARY_REPOSITORY_PATH is not set — refusing to guess cwd" >&2
    exit 1
fi
cd "$CI_PRIMARY_REPOSITORY_PATH"
echo "cwd: $(pwd)"

PHASE="node-install"
echo "=== [2/6] Node.js ==="
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
if ! command -v node &> /dev/null; then
    echo "Node.js not found, installing via Homebrew..."
    brew install node || { echo "brew install node failed once — retrying"; brew install node; }
fi
echo "node: $(node --version)  npm: $(npm --version)"

PHASE="npm-ci"
echo "=== [3/6] npm ci ==="
npm ci --no-audit --no-fund || {
    echo "npm ci failed once — retrying after cache clean"
    npm cache clean --force || true
    npm ci --no-audit --no-fund
}

PHASE="verify-plugins"
echo "=== [4/6] Verify every Package.swift local path package exists ==="
# Every node_modules path referenced by the (committed, pre-sync) manifest must
# exist NOW — if any is missing, npm ci did not deliver what package.json
# promises, and every later SPM step would fail with misleading errors.
MISSING=0
while IFS= read -r pkg; do
    if [ ! -d "$pkg" ]; then
        echo "MISSING: $pkg" >&2
        MISSING=1
    fi
done < <(grep -oE 'node_modules/@capacitor/[a-z-]+' ios/App/CapApp-SPM/Package.swift | sort -u)
if [ "$MISSING" -ne 0 ]; then
    echo "ERROR: npm ci completed but plugin paths are missing. Contents of node_modules/@capacitor:" >&2
    ls node_modules/@capacitor >&2 2>&1 || echo "(node_modules/@capacitor does not exist at all)" >&2
    exit 1
fi
echo "All referenced @capacitor plugin paths present."

PHASE="cap-sync"
echo "=== [5/6] Capacitor sync ==="
npx cap sync ios
ls -la ios/App/App/capacitor.config.json

PHASE="spm-resolve"
echo "=== [6/6] Regenerate SwiftPM Package.resolved ==="
# cap sync rewrote CapApp-SPM/Package.swift, so the committed resolved file's
# originHash is stale. Xcode Cloud's build step runs with automatic dependency
# resolution DISABLED, which hard-fails on both a stale AND a missing resolved
# file — regenerate it here with the same Xcode that will build. Deterministic:
# the only remote dependency (capacitor-swift-pm) is pinned `exact`.
RESOLVED="ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved"
rm -f "$RESOLVED"
xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj -scheme App \
  || xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj

if [ ! -f "$RESOLVED" ]; then
    echo "ERROR: Package.resolved was not regenerated at $RESOLVED" >&2
    exit 1
fi
echo "=== Regenerated Package.resolved: ==="
cat "$RESOLVED"

echo "=== ci_post_clone complete ==="
