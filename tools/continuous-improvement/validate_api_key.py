#!/usr/bin/env python3
"""
Validate API key by making a simple API call
"""
import asyncio
import os
import sys

# API key should be set as environment variable
API_KEY = os.environ.get('ANTHROPIC_API_KEY')
if not API_KEY:
    print("Error: ANTHROPIC_API_KEY environment variable is not set")
    sys.exit(1)

print("=== Testing Anthropic API Key ===")
print(f"Key: {API_KEY[:20]}...{API_KEY[-10:]}")
print()

# Set environment variable
os.environ['ANTHROPIC_API_KEY'] = API_KEY

# Test with direct API call
print("Testing with direct anthropic library...")
try:
    import anthropic
    
    client = anthropic.Anthropic(api_key=API_KEY)
    
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=10,
        messages=[{"role": "user", "content": "Hi"}]
    )
    
    print("✅ API key is VALID!")
    print(f"✅ Response: {response.content[0].text}")
    print()
    
except anthropic.AuthenticationError as e:
    print(f"❌ Authentication failed: {e}")
    print("The API key is invalid or expired.")
    sys.exit(1)
    
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)

# Test with SDK
print("Testing with claude-agent-sdk...")
try:
    from claude_agent_sdk import ClaudeAgentOptions, query
    
    async def test_sdk():
        options = ClaudeAgentOptions(
            cwd="/Users/ricknini/Downloads/helmv3",
            allowed_tools=["Bash"],
            permission_mode="default",
            max_turns=1
        )
        
        response_count = 0
        async for message in query(prompt="Echo: test", options=options):
            response_count += 1
            print(f"✅ SDK response {response_count}")
            if response_count >= 1:
                break
        
        print("✅ SDK works!")
    
    asyncio.run(test_sdk())
    
except Exception as e:
    print(f"❌ SDK Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print()
print("="*50)
print("✅ ALL TESTS PASSED - API key is working!")
print("="*50)
