#!/bin/bash

# Test API key first
export ANTHROPIC_API_KEY="sk-ant-api03-XD8E2ACtgAFCh_XGTBtW8mcONUUk_x8PfDT7DWBBMgDrFM5gVuFHJN9fKHzvzUqShBfGrvXjQxKlEpP50KxVPg-W2sqpwAA"

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
