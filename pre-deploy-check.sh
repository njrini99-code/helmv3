#!/bin/bash
# ============================================
# HELM SPORTS LABS - PRE-DEPLOYMENT CHECKS
# ============================================
#
# All gates are blocking. No yellow warnings silently pass a broken deploy.

set -euo pipefail

echo ""
echo "HELM SPORTS LABS - PRE-DEPLOYMENT CHECKS"
echo "============================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: package.json not found. Run this from the project root.${NC}"
    exit 1
fi

echo "[1/5] Installing dependencies..."
npm ci --silent
echo -e "${GREEN}ok${NC}"
echo ""

echo "[2/5] Typecheck..."
npm run typecheck
echo -e "${GREEN}ok${NC}"
echo ""

echo "[3/5] Lint..."
npm run lint
echo -e "${GREEN}ok${NC}"
echo ""

echo "[4/5] Unit tests..."
npm run test -- --run
echo -e "${GREEN}ok${NC}"
echo ""

echo "[5/5] Build..."
npm run build
echo -e "${GREEN}ok${NC}"
echo ""

echo "============================================"
echo -e "${GREEN}All gates passed. Safe to deploy.${NC}"
echo "============================================"
