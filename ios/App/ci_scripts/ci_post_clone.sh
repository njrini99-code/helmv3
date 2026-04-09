#!/bin/bash
set -e

echo "=== Installing Node.js dependencies for Capacitor ==="

# Navigate to the project root (3 levels up from ci_scripts/)
cd "$CI_PRIMARY_REPOSITORY_PATH"

# Install Node.js if not available (Xcode Cloud has it, but just in case)
if ! command -v node &> /dev/null; then
    echo "Node.js not found, installing via Homebrew..."
    brew install node
fi

echo "Node version: $(node --version)"
echo "npm version: $(npm --version)"

# Install dependencies (only production deps needed for Capacitor plugins)
npm ci --prefer-offline --no-audit --no-fund

echo "=== Node modules installed ==="
echo "Capacitor plugins check:"
ls -d node_modules/@capacitor/*/  2>/dev/null | head -15 || echo "WARNING: No @capacitor packages found"
