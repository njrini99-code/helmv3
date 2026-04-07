#!/bin/bash
set -e

# Xcode Cloud pre-build script
# Installs node_modules so Capacitor SPM local package references resolve

cd "$CI_PRIMARY_REPOSITORY_PATH"

# Install Node.js dependencies (Capacitor plugins are referenced as local SPM packages)
npm ci
