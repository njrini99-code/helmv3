#!/bin/bash
#
# RUN CYCLE 2 - Verify cycle 1 fixes
#
# This explicitly sets cycle number to avoid confusion
#

# API key should be set as environment variable
# export ANTHROPIC_API_KEY="your-key-here"
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "Error: ANTHROPIC_API_KEY environment variable is not set"
  exit 1
fi

cd /Users/ricknini/Downloads/helmv3/tools/continuous-improvement

# First, clean up any existing cycle 002 or 003 to start fresh
rm -f /Users/ricknini/Downloads/helmv3/.helm/cycles/issues-cycle-002.* 2>/dev/null
rm -f /Users/ricknini/Downloads/helmv3/.helm/cycles/issues-cycle-003.* 2>/dev/null
rm -f /Users/ricknini/Downloads/helmv3/.helm/cycles/cycle-002-summary.json 2>/dev/null
rm -f /Users/ricknini/Downloads/helmv3/.helm/cycles/cycle-003-summary.json 2>/dev/null

echo "🧹 Cleaned up previous cycle 002/003 files"
echo ""
echo "🔄 Running Cycle 2 (verifying Cycle 1 fixes)..."
echo ""

python3 dead_simple_agent.py \
  --project /Users/ricknini/Downloads/helmv3 \
  --platform baseballhelm

echo ""
echo "✅ Done!"
echo ""
echo "📋 Next: Open .helm/cycles/issues-cycle-002.md in Cursor"
