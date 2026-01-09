#!/usr/bin/env python3
"""
Quick test run of multi-platform cycle
"""
import sys
import asyncio
from pathlib import Path

# Add the continuous-improvement directory to path
sys.path.insert(0, str(Path(__file__).parent))

from multi_platform_cycle import MultiPlatformOrchestrator

async def test_run():
    project_path = "/Users/ricknini/Downloads/helmv3"
    
    orchestrator = MultiPlatformOrchestrator(project_path)
    
    print("\n🔍 Detected platforms:")
    for platform in orchestrator.platforms:
        print(f"  • {platform}")
    
    print("\n▶️  Running first cycle on all platforms...\n")
    
    results = await orchestrator.run_all_platforms(mode="full", sequential=True)
    
    print("\n📊 Final statistics:")
    orchestrator.print_combined_stats()
    
    return results

if __name__ == "__main__":
    asyncio.run(test_run())
