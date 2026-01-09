#!/bin/bash
#
# Clone and Setup Ralph Wiggum Plugin for Claude Code
#

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   📦 Setting up Ralph Wiggum Plugin                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# 1. Clone the Claude Code repository
echo "📥 Cloning Claude Code repository..."
cd ~/Downloads
git clone https://github.com/anthropics/claude-code.git
cd claude-code

echo "✅ Repository cloned"
echo ""

# 2. Navigate to Ralph Wiggum plugin
echo "📂 Navigating to Ralph Wiggum plugin..."
cd plugins/ralph-wiggum

echo "✅ Found Ralph Wiggum plugin"
echo ""

# 3. Install dependencies
echo "📦 Installing dependencies..."
if [ -f "package.json" ]; then
    npm install
elif [ -f "requirements.txt" ]; then
    pip install -r requirements.txt --break-system-packages
elif [ -f "pyproject.toml" ]; then
    pip install -e . --break-system-packages
fi

echo "✅ Dependencies installed"
echo ""

# 4. Show README
echo "📖 Ralph Wiggum README:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat README.md
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Follow instructions in README.md above"
echo "   2. Configure with your project path"
echo "   3. Point it to .helm/cycles/issues-cycle-002.md"
echo ""
echo "Location: ~/Downloads/claude-code/plugins/ralph-wiggum"
