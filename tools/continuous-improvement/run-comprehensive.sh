#!/bin/bash
#
# COMPREHENSIVE MULTI-PLATFORM CYCLE
#
# This runs a FULL analysis:
# - ALL platforms (BaseballHelm, GolfHelm, Helm)
# - Verifies cycle-001 fixes
# - Checks UNDERSTANDING.json for incomplete features
# - Checks HELM_ESSAY.md for implementation gaps
# - Comprehensive code scan
# - Finds 60-100+ issues
#

# API key should be set as environment variable
# export ANTHROPIC_API_KEY="your-key-here"
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "Error: ANTHROPIC_API_KEY environment variable is not set"
  exit 1
fi

cd /Users/ricknini/Downloads/helmv3/tools/continuous-improvement

# Clean up previous cycle 2/3
rm -f /Users/ricknini/Downloads/helmv3/.helm/cycles/issues-cycle-002.* 2>/dev/null
rm -f /Users/ricknini/Downloads/helmv3/.helm/cycles/issues-cycle-003.* 2>/dev/null
rm -f /Users/ricknini/Downloads/helmv3/.helm/cycles/cycle-002-summary.json 2>/dev/null
rm -f /Users/ricknini/Downloads/helmv3/.helm/cycles/cycle-003-summary.json 2>/dev/null

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║   🔄 COMPREHENSIVE MULTI-PLATFORM ANALYSIS                   ║"
echo "║                                                              ║"
echo "║   This will:                                                 ║"
echo "║   ✅ Verify cycle-001 fixes                                  ║"
echo "║   ✅ Check ALL platforms (Baseball, Golf, Helm)              ║"
echo "║   ✅ Find incomplete features from UNDERSTANDING.json        ║"
echo "║   ✅ Find gaps from HELM_ESSAY.md                            ║"
echo "║   ✅ Comprehensive code scan                                 ║"
echo "║                                                              ║"
echo "║   Expected: 60-100+ issues found                             ║"
echo "║   Time: 20-30 minutes                                        ║"
echo "║   Cost: ~$5-8                                                ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Press Ctrl+C to cancel, or wait 5 seconds to start..."
sleep 5
echo ""
echo "🚀 Starting comprehensive analysis..."
echo ""

python3 comprehensive_agent.py \
  --project /Users/ricknini/Downloads/helmv3

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   ✅ COMPREHENSIVE ANALYSIS COMPLETE                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 Next steps:"
echo "   1. Review findings in GitHub Issues / the project board"
echo "   2. Legacy .helm/cycles output is archived context only"
echo "   2. Tell Claude Code to fix issues"
echo "   3. Run cycle 3 to verify"
echo ""
