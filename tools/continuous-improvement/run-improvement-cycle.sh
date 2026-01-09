#!/bin/bash
#
# Helm Intelligence - Complete Improvement Workflow
#
# This script runs the full cycle:
# 1. Overnight deep analysis (if not done yet)
# 2. Continuous improvement cycles
#
# Usage:
#   ./run-improvement-cycle.sh ~/helmv3 baseballhelm
#

set -e

PROJECT_PATH="${1}"
PLATFORM_NAME="${2}"

if [ -z "$PROJECT_PATH" ] || [ -z "$PLATFORM_NAME" ]; then
    echo "Usage: ./run-improvement-cycle.sh PROJECT_PATH PLATFORM_NAME"
    echo ""
    echo "Example:"
    echo "  ./run-improvement-cycle.sh ~/helmv3 baseballhelm"
    echo ""
    exit 1
fi

# Check API key
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "❌ ANTHROPIC_API_KEY not set"
    echo ""
    echo "   export ANTHROPIC_API_KEY='sk-ant-...'"
    echo ""
    exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                          ║"
echo "║   🔄 HELM INTELLIGENCE - COMPLETE IMPROVEMENT WORKFLOW                   ║"
echo "║                                                                          ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Project: $PROJECT_PATH"
echo "Platform: $PLATFORM_NAME"
echo ""

# Check if overnight analysis has been run
UNDERSTANDING_FILE="$PROJECT_PATH/.helm/UNDERSTANDING.json"

if [ ! -f "$UNDERSTANDING_FILE" ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  📚 STEP 1: RUNNING OVERNIGHT DEEP ANALYSIS"
    echo "  Building comprehensive understanding first..."
    echo "  This will take 1-2 hours and cost ~$8-15"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    read -p "Run overnight analysis? (y/n) " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd ../
        python overnight.py --project "$PROJECT_PATH" --name "$PLATFORM_NAME"
        echo ""
        echo "✅ Overnight analysis complete"
        echo ""
    else
        echo "⚠️  Skipping overnight analysis"
        echo "   Cycle agent will work without deep context"
        echo ""
    fi
else
    echo "✅ Overnight analysis found at $UNDERSTANDING_FILE"
    echo ""
fi

# Ask about mode
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🔄 STEP 2: CONTINUOUS IMPROVEMENT CYCLES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Choose mode:"
echo "  1) Single cycle (run once, then you fix in Claude Code)"
echo "  2) Continuous (runs cycles automatically every 5 minutes)"
echo "  3) Overnight continuous (runs until you stop it)"
echo ""
read -p "Mode (1-3): " MODE_CHOICE
echo ""

case $MODE_CHOICE in
    1)
        echo "Running single cycle..."
        python cycle_agent.py --project "$PROJECT_PATH" --platform "$PLATFORM_NAME"
        ;;
    2)
        echo "Running continuous mode (5 min cycles)..."
        python cycle_agent.py --project "$PROJECT_PATH" --platform "$PLATFORM_NAME" --continuous --wait 300
        ;;
    3)
        echo "Running overnight continuous mode (10 min cycles)..."
        echo "Press Ctrl+C to stop"
        python cycle_agent.py --project "$PROJECT_PATH" --platform "$PLATFORM_NAME" --continuous --wait 600
        ;;
    *)
        echo "Invalid choice. Running single cycle..."
        python cycle_agent.py --project "$PROJECT_PATH" --platform "$PLATFORM_NAME"
        ;;
esac

echo ""
echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                          ║"
echo "║   ✅ WORKFLOW COMPLETE                                                   ║"
echo "║                                                                          ║"
echo "║   📁 Check $PROJECT_PATH/.helm/cycles/ for issues                       ║"
echo "║                                                                          ║"
echo "║   Next: Open issues-cycle-XXX.md in Cursor and let Claude Code fix!     ║"
echo "║                                                                          ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""
