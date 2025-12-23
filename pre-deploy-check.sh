#!/bin/bash

# ============================================
# HELM SPORTS LABS - PRE-DEPLOYMENT CHECKS
# ============================================

echo ""
echo "🔍 HELM SPORTS LABS - PRE-DEPLOYMENT CHECKS"
echo "============================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found. Run this from the project root.${NC}"
    exit 1
fi

echo "📦 Checking dependencies..."
npm install --silent
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "🔤 Running TypeScript check..."
npm run typecheck 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ No TypeScript errors${NC}"
else
    echo -e "${RED}❌ TypeScript errors found${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "🧹 Running lint check..."
npm run lint 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ No lint errors${NC}"
else
    echo -e "${YELLOW}⚠ Lint warnings (non-blocking)${NC}"
fi

echo ""
echo "🏗️ Building application..."
npm run build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Build successful${NC}"
else
    echo -e "${RED}❌ Build failed${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "📋 Checking environment variables..."
if [ -f ".env.local" ]; then
    if grep -q "NEXT_PUBLIC_SUPABASE_URL" .env.local && grep -q "NEXT_PUBLIC_SUPABASE_ANON_KEY" .env.local; then
        echo -e "${GREEN}✓ Environment variables configured${NC}"
    else
        echo -e "${YELLOW}⚠ Some environment variables may be missing${NC}"
    fi
else
    echo -e "${YELLOW}⚠ No .env.local file found${NC}"
fi

echo ""
echo "============================================"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ ALL CHECKS PASSED - Ready to deploy!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Push to GitHub: git push origin main"
    echo "  2. Deploy on Vercel: vercel --prod"
    echo "  3. Run SQL script in Supabase"
    echo ""
else
    echo -e "${RED}❌ $ERRORS ERROR(S) FOUND - Fix before deploying${NC}"
    echo ""
fi
echo "============================================"
