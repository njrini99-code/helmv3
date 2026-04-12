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

echo "=== CI setup complete ==="
