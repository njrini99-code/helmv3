#!/bin/bash

# Ultra Agent Audit - Start Script
# Premium path-by-path auditing tool for Helm Sports Labs

echo ""
echo "🎯 Starting Ultra Agent Audit..."
echo ""

cd "$(dirname "$0")/tools/ux-flow-auditor"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Start the server
npm start
