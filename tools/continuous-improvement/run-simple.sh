#!/bin/bash
#
# SIMPLIFIED VERSION - Actually works!
#
# This uses the simplified agent that TRUSTS Claude Code's fixes
# instead of trying to verify them (which was failing)
#

# API key should be set as environment variable
# export ANTHROPIC_API_KEY="your-key-here"
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "Error: ANTHROPIC_API_KEY environment variable is not set"
  exit 1
fi

cd /Users/ricknini/Downloads/helmv3/tools/continuous-improvement

python3 simplified_cycle_agent.py \
  --project /Users/ricknini/Downloads/helmv3 \
  --platform baseballhelm

echo ""
echo "✅ Done! Check .helm/cycles/ for your issues"
