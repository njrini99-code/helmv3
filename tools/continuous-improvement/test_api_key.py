#!/usr/bin/env python3
"""
Test if claude-agent-sdk can see the API key
"""
import os
import sys

print("=== API Key Check ===")
print(f"ANTHROPIC_API_KEY set: {bool(os.getenv('ANTHROPIC_API_KEY'))}")

if os.getenv('ANTHROPIC_API_KEY'):
    key = os.getenv('ANTHROPIC_API_KEY')
    print(f"Key starts with: {key[:20]}...")
    print(f"Key length: {len(key)}")
else:
    print("❌ API key not found in environment")
    print("\nSet it like this:")
    print('export ANTHROPIC_API_KEY="sk-ant-..."')
    sys.exit(1)

print("\n=== Testing SDK Import ===")
try:
    from claude_agent_sdk import ClaudeAgentOptions, query
    print("✅ SDK imported successfully")
    
    print("\n=== Testing Simple Query ===")
    import asyncio
    
    async def test():
        options = ClaudeAgentOptions(
            cwd="/Users/ricknini/Downloads/helmv3",
            allowed_tools=["Bash"],
            permission_mode="default",
            max_turns=1
        )
        
        async for message in query(prompt="Say hello", options=options):
            print(f"✅ SDK working! Got response: {message}")
            return
    
    asyncio.run(test())
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
