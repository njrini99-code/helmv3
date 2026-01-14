#!/bin/bash

# Production Audit Team - Quick Run Script
# Usage: ./run-audit.sh [round_number]

ROUND=${1:-1}

echo "🎭 Starting Production Audit Team - Round $ROUND"
echo ""

cd "$(dirname "$0")/.."

python3 .production-team/run_audit.py $ROUND

echo ""
echo "✅ Audit complete! Check .production-team/ROUND_$(printf "%02d" $ROUND)/ for results"
