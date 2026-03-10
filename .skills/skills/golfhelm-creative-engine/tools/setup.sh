#!/bin/bash
# ─────────────────────────────────────────────────────
#  GolfHelm Creative Engine — Setup Script
# ─────────────────────────────────────────────────────
#  Run this once to install all dependencies.
#
#  Usage: cd tools && bash setup.sh
# ─────────────────────────────────────────────────────

set -e

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  GolfHelm Creative Engine Setup          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Install from https://nodejs.org (v18+)"
    exit 1
fi
NODE_VERSION=$(node -v)
echo "✅ Node.js: $NODE_VERSION"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found."
    exit 1
fi
echo "✅ npm: $(npm -v)"

# Install npm dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Install Playwright browsers (Chromium only — all we need)
echo ""
echo "🌐 Installing Playwright Chromium..."
npx playwright install chromium

# Create output directories
mkdir -p ./output
mkdir -p ./backgrounds

# Check for Pixabay API key
echo ""
if [ -z "$PIXABAY_API_KEY" ]; then
    echo "⚠️  Optional: Pixabay API key not set."
    echo "   For stock golf backgrounds, get a free key:"
    echo "   1. Go to https://pixabay.com/api/docs/"
    echo "   2. Sign up (free)"
    echo "   3. Add to your shell profile:"
    echo "      export PIXABAY_API_KEY=\"your-key-here\""
    echo ""
    echo "   Or create a .env file in this directory:"
    echo "      echo 'PIXABAY_API_KEY=your-key-here' > .env"
else
    echo "✅ Pixabay API key: configured"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Setup complete! Here's how to use it:"
echo ""
echo "  1. Have Claude generate an HTML creative using the skill"
echo "  2. Save it as creative.html"
echo "  3. Render to PNG:"
echo "     node render.js creative.html"
echo ""
echo "  4. Or run the full pipeline:"
echo "     node creative-pipeline.js creative.html --bg-type=cream"
echo ""
echo "  5. For carousel batches:"
echo "     node creative-pipeline.js ./slides/ --bg-type=cream --logo=logo.png"
echo ""
echo "  6. Fetch golf backgrounds (optional):"
echo "     node fetch-background.js grass"
echo "     node creative-pipeline.js creative.html --bg=backgrounds/bg-grass-1.jpg"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
