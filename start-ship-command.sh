#!/bin/bash
# Start Ship Command Hub

# Kill any existing processes
lsof -ti:3333 | xargs kill -9 2>/dev/null
lsof -ti:3334 | xargs kill -9 2>/dev/null

# Navigate to tool
cd "$(dirname "$0")/tools/ux-flow-auditor"

# Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Start
echo ""
echo "🚢 Starting Ship Command Hub..."
echo "   Dashboard: http://localhost:3333"
echo ""
npm start
