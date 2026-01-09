#!/bin/bash
#
# Helm Intelligence - Multi-Platform Quick Start
#
# Runs improvement cycles on ALL your platforms
#
# Usage:
#   ./run-all-platforms.sh ~/helmv3
#

set -e

PROJECT_PATH="${1}"

if [ -z "$PROJECT_PATH" ]; then
    echo "Usage: ./run-all-platforms.sh PROJECT_PATH"
    echo ""
    echo "Example:"
    echo "  ./run-all-platforms.sh ~/helmv3"
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
echo "║   🔄 HELM INTELLIGENCE - MULTI-PLATFORM IMPROVEMENT                      ║"
echo "║                                                                          ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Project: $PROJECT_PATH"
echo ""

# Check if overnight analysis has been run
UNDERSTANDING_FILE="$PROJECT_PATH/.helm/UNDERSTANDING.json"

if [ ! -f "$UNDERSTANDING_FILE" ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  📚 STEP 1: RUNNING OVERNIGHT ANALYSIS (ALL PLATFORMS)"
    echo "  Building comprehensive understanding..."
    echo "  This will take 2-4 hours and cost ~$16-30"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    read -p "Run overnight analysis on all platforms? (y/n) " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd ../
        
        # Run for BaseballHelm
        echo "🏀 Analyzing BaseballHelm..."
        python overnight.py --project "$PROJECT_PATH" --name baseballhelm
        
        # Run for GolfHelm
        echo "⛳ Analyzing GolfHelm..."
        python overnight.py --project "$PROJECT_PATH" --name golfhelm
        
        # Check for CoachHelm
        if [ -d "$PROJECT_PATH/src/app/coach" ]; then
            echo "🏈 Analyzing CoachHelm..."
            python overnight.py --project "$PROJECT_PATH" --name coachhelm
        fi
        
        echo ""
        echo "✅ Overnight analysis complete for all platforms"
        echo ""
    else
        echo "⚠️  Skipping overnight analysis"
        echo ""
    fi
else
    echo "✅ Overnight analysis found"
    echo ""
fi

# Ask about mode
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🔄 STEP 2: CONTINUOUS IMPROVEMENT CYCLES (ALL PLATFORMS)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Choose mode:"
echo "  1) Single cycle on all platforms (run once, then you fix)"
echo "  2) Continuous mode (cycles every 10 minutes on all platforms)"
echo "  3) Parallel mode (run all platforms simultaneously - FAST but $$$)"
echo "  4) Just show statistics"
echo ""
read -p "Mode (1-4): " MODE_CHOICE
echo ""

case $MODE_CHOICE in
    1)
        echo "Running single cycle on all platforms..."
        python multi_platform_cycle.py --project "$PROJECT_PATH"
        ;;
    2)
        echo "Running continuous mode (10 min cycles on all platforms)..."
        echo "Press Ctrl+C to stop"
        python multi_platform_cycle.py --project "$PROJECT_PATH" --continuous --wait 600
        ;;
    3)
        echo "Running parallel mode (all platforms at once)..."
        python multi_platform_cycle.py --project "$PROJECT_PATH" --parallel
        ;;
    4)
        echo "Showing combined statistics..."
        python multi_platform_cycle.py --project "$PROJECT_PATH" --stats-only
        ;;
    *)
        echo "Invalid choice. Running single cycle..."
        python multi_platform_cycle.py --project "$PROJECT_PATH"
        ;;
esac

echo ""
echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                          ║"
echo "║   ✅ MULTI-PLATFORM WORKFLOW COMPLETE                                    ║"
echo "║                                                                          ║"
echo "║   📁 Check $PROJECT_PATH/.helm/cycles/ for issues                       ║"
echo "║                                                                          ║"
echo "║   Each platform has its own issues-cycle-XXX.md file                     ║"
echo "║                                                                          ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""
