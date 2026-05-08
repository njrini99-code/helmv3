#!/bin/bash

# ANTHROPIC_API_KEY must be set in your shell environment.
# Previously hardcoded — that key has been compromised and should be rotated at
# https://console.anthropic.com/settings/keys
: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY must be set in environment (export from your shell rc, do NOT hardcode)}"

echo "🔑 Testing API Key..."
python3 /Users/ricknini/Downloads/helmv3/tools/continuous-improvement/test_api_key.py

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ API key works! Running multi-platform cycle..."
    echo ""
    cd /Users/ricknini/Downloads/helmv3/tools/continuous-improvement
    python3 multi_platform_cycle.py --project /Users/ricknini/Downloads/helmv3
else
    echo ""
    echo "❌ API key test failed. Please check your key."
fi
