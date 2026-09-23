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

def describe_key(key: str) -> str:
    """py/clear-text-logging-sensitive-data (#7, then #609): this used to
    print the first 20 and last 10 characters of the real key, and the
    first fix still printed 8. Any substring of the credential is key
    material once it lands in a terminal scrollback or a captured log, and
    CodeQL rightly keeps flagging it. What a human needs to confirm "this is
    the key I meant to test" is its shape, not its bytes: the length and
    whether it carries the Anthropic prefix."""
    prefix_ok = key.startswith("sk-ant-")
    return f"length {len(key)}, anthropic prefix: {'yes' if prefix_ok else 'no'}"


print("=== Testing Anthropic API Key ===")
print(f"Key: {describe_key(API_KEY)}")
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
    
except Exception as e:  # noqa: BLE001 — diagnostic: report whatever failed, then exit 1
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
    
except Exception as e:  # noqa: BLE001 — diagnostic: report whatever failed, then exit 1
    print(f"❌ SDK Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print()
print("="*50)
print("✅ ALL TESTS PASSED - API key is working!")
print("="*50)
