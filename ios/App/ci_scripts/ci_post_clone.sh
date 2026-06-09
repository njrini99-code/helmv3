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
# the plugin set changes — Xcode Cloud then fails with "an out-of-date
# resolved file was detected ... not allowed when automatic dependency
# resolution is disabled". Deleting it here forces a fresh resolution,
# which is fully deterministic: the only remote dependency
# (capacitor-swift-pm) is pinned `exact`, and local path packages carry no
# pins at all.
RESOLVED="ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved"
if [ -f "$RESOLVED" ]; then
    echo "=== Removing stale SwiftPM Package.resolved (regenerated during resolution) ==="
    rm "$RESOLVED"
fi

echo "=== CI setup complete ==="
