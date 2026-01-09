#!/bin/bash
#
# Helm Intelligence - Overnight Deep Analysis Launcher
#
# Run before bed, wake up to comprehensive documentation.
#
# Usage:
#   ./launch.sh                              # Uses default paths
#   ./launch.sh ~/my/baseballhelm ~/my/golfhelm   # Custom paths
#

set -e

# =============================================================================
# CONFIGURATION - Edit these paths
# =============================================================================

BASEBALLHELM_PATH="${1:-$HOME/baseballhelm}"
GOLFHELM_PATH="${2:-$HOME/golfhelm}"

# =============================================================================
# PREFLIGHT CHECKS
# =============================================================================

echo ""
echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                          ║"
echo "║   🌙 HELM INTELLIGENCE - OVERNIGHT ANALYSIS                              ║"
echo "║                                                                          ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""

# Check API key
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "❌ ANTHROPIC_API_KEY not set"
    echo ""
    echo "   export ANTHROPIC_API_KEY='sk-ant-...'"
    echo ""
    exit 1
fi

echo "✅ API key configured"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found"
    exit 1
fi

echo "✅ Python 3 found"

# Check claude-agent-sdk
if ! python3 -c "import claude_agent_sdk" 2>/dev/null; then
    echo "⚠️  claude-agent-sdk not installed"
    echo "   Installing now..."
    pip install claude-agent-sdk anyio
fi

echo "✅ claude-agent-sdk installed"

# Check project paths
PROJECTS_FOUND=0
CMD_ARGS=""

if [ -d "$BASEBALLHELM_PATH" ]; then
    echo "✅ BaseballHelm found: $BASEBALLHELM_PATH"
    CMD_ARGS="$CMD_ARGS --baseballhelm $BASEBALLHELM_PATH"
    PROJECTS_FOUND=$((PROJECTS_FOUND + 1))
else
    echo "⚠️  BaseballHelm not found at: $BASEBALLHELM_PATH"
fi

if [ -d "$GOLFHELM_PATH" ]; then
    echo "✅ GolfHelm found: $GOLFHELM_PATH"
    CMD_ARGS="$CMD_ARGS --golfhelm $GOLFHELM_PATH"
    PROJECTS_FOUND=$((PROJECTS_FOUND + 1))
else
    echo "⚠️  GolfHelm not found at: $GOLFHELM_PATH"
fi

if [ $PROJECTS_FOUND -eq 0 ]; then
    echo ""
    echo "❌ No projects found. Please specify paths:"
    echo "   ./launch.sh /path/to/baseballhelm /path/to/golfhelm"
    echo ""
    exit 1
fi

# =============================================================================
# ESTIMATE
# =============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Estimate for $PROJECTS_FOUND platform(s):"
echo ""
echo "   Time:  $(($PROJECTS_FOUND * 60))-$(($PROJECTS_FOUND * 120)) minutes"
echo "   Cost:  \$$(($PROJECTS_FOUND * 8))-\$$(($PROJECTS_FOUND * 15))"
echo ""
echo "   This will produce:"
echo "   • Complete technical essays"
echo "   • Feature specs alongside your code"
echo "   • RLS security audits with SQL fixes"
echo "   • Prioritized action items"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Confirm
read -p "Start overnight analysis? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

# =============================================================================
# RUN
# =============================================================================

echo ""
echo "🚀 Starting analysis..."
echo "   Logs: overnight.log"
echo ""
echo "   You can safely close this terminal."
echo "   The analysis will continue in the background."
echo ""

# Run in background with nohup
nohup python3 overnight.py $CMD_ARGS > overnight.log 2>&1 &

PID=$!
echo "   Process ID: $PID"
echo ""
echo "   To check progress:"
echo "   tail -f overnight.log"
echo ""
echo "   To stop:"
echo "   kill $PID"
echo ""
echo "🌙 Good night! Check .helm/ directories in your projects tomorrow."
echo ""
