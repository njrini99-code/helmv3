#!/bin/bash
#
# Setup Claude Code MCP Server for Autonomous Issue Processing
#
# This creates an MCP server that lets Claude Code work autonomously
#

echo "Setting up Claude Code autonomous issue processor..."

# Create MCP server directory
mkdir -p ~/.claude-code-mcp

# Create the MCP server config
cat > ~/.claude-code-mcp/config.json << 'EOF'
{
  "mcpServers": {
    "issue-processor": {
      "command": "python3",
      "args": ["-m", "issue_processor_mcp"],
      "cwd": "/Users/ricknini/Downloads/helmv3/tools/continuous-improvement"
    }
  }
}
EOF

echo "✅ MCP config created"
echo ""
echo "To use it:"
echo "1. In Cursor, open Claude Code settings"
echo "2. Add MCP server path: ~/.claude-code-mcp/config.json"
echo "3. Restart Claude Code"
echo "4. You'll have access to autonomous issue processing"
