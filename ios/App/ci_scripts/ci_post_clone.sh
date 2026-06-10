#!/bin/bash
set -e

echo "=== Installing Node.js dependencies for Capacitor ==="

# Navigate to the project root (3 levels up from ci_scripts/)
cd "$CI_PRIMARY_REPOSITORY_PATH"

# Install Node.js if not available
if ! command -v node &> /dev/null; then
    echo "Node.js not found, installing via Homebrew..."
    brew install node
fi

echo "Node version: $(node --version)"
echo "npm version: $(npm --version)"

# Install dependencies
npm ci --prefer-offline --no-audit --no-fund

echo "=== Running Capacitor sync to generate capacitor.config.json ==="
npx cap sync ios

echo "=== Verifying capacitor.config.json exists ==="
ls -la ios/App/App/capacitor.config.json

# `cap sync` rewrites CapApp-SPM/Package.swift on every build, so the
# committed Package.resolved's originHash goes permanently stale the moment
# the plugin set changes. Xcode Cloud's resolution step runs with automatic
# dependency resolution DISABLED, which hard-fails on BOTH a stale resolved
# file ("an out-of-date resolved file was detected") AND a missing one
# ("a resolved file is required"). The only durable fix is to REGENERATE the
# file here, after cap sync, with an explicit resolver run — same Xcode,
# same (freshly rewritten) Package.swift, so the originHash matches what the
# build step validates. Deterministic: the only remote dependency
# (capacitor-swift-pm) is pinned `exact`; local path packages carry no pins.
RESOLVED="ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved"
echo "=== Regenerating SwiftPM Package.resolved (cap sync rewrote Package.swift) ==="
rm -f "$RESOLVED"
xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj -scheme App \
  || xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj

if [ ! -f "$RESOLVED" ]; then
    echo "ERROR: Package.resolved was not regenerated at $RESOLVED" >&2
    exit 1
fi
echo "=== Regenerated Package.resolved: ==="
cat "$RESOLVED"

echo "=== CI setup complete ==="
