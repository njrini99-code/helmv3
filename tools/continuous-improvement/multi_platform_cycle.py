#!/usr/bin/env python3
"""
Helm Intelligence - Multi-Platform Orchestrator

Runs improvement cycles across ALL Helm platforms:
- BaseballHelm
- GolfHelm
- CoachHelm (if exists)

Usage:
    # Run on all platforms
    python multi-platform-cycle.py --project ~/helmv3
    
    # Run on specific platforms
    python multi-platform-cycle.py --project ~/helmv3 --platforms baseball golf
    
    # Continuous mode on all platforms
    python multi-platform-cycle.py --project ~/helmv3 --continuous
"""

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Dict
import subprocess


class MultiPlatformOrchestrator:
    """
    Manages improvement cycles across multiple platforms
    """
    
    def __init__(self, project_path: str, platforms: List[str] = None):
        self.project_path = Path(project_path)
        
        # Auto-detect platforms if not specified
        if platforms:
            self.platforms = platforms
        else:
            self.platforms = self._detect_platforms()
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   🔄 MULTI-PLATFORM CONTINUOUS IMPROVEMENT                                   ║
║                                                                              ║
║   Project: {str(self.project_path):<59} ║
║   Platforms: {', '.join(self.platforms):<57} ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
    
    def _detect_platforms(self) -> List[str]:
        """
        Auto-detect platforms by looking for:
        1. Domain-specific routes (src/app/baseball, src/app/golf)
        2. Existing .helm directories with platform names
        3. package.json or config mentions
        """
        platforms = []
        
        # Check for domain routes
        app_dir = self.project_path / "src" / "app"
        if app_dir.exists():
            for subdir in app_dir.iterdir():
                if subdir.is_dir():
                    name = subdir.name
                    if name in ["baseball", "golf", "coach"]:
                        platform_name = f"{name}helm"
                        if platform_name not in platforms:
                            platforms.append(platform_name)
        
        # Check .helm directory for essays
        helm_dir = self.project_path / ".helm"
        if helm_dir.exists():
            for essay in helm_dir.glob("*_ESSAY.md"):
                # BASEBALLHELM_ESSAY.md -> baseballhelm
                platform_name = essay.stem.replace("_ESSAY", "").lower()
                if platform_name not in platforms:
                    platforms.append(platform_name)
        
        # Default if nothing found
        if not platforms:
            print("⚠️  No platforms auto-detected. Using defaults: baseballhelm, golfhelm")
            platforms = ["baseballhelm", "golfhelm"]
        
        return platforms
    
    async def run_single_cycle(self, platform: str, mode: str = "full"):
        """Run a single cycle for one platform"""
        
        print(f"\n{'='*80}")
        print(f"  🏃 Running cycle for {platform.upper()}")
        print(f"{'='*80}\n")
        
        # Import here to use the enhanced agent
        sys.path.insert(0, str(Path(__file__).parent))
        from enhanced_cycle_agent import EnhancedCycleAgent
        
        try:
            agent = EnhancedCycleAgent(str(self.project_path), platform)
            await agent.run_cycle(mode=mode)
            return True, None
        except Exception as e:
            return False, str(e)
    
    async def run_all_platforms(self, mode: str = "full", sequential: bool = True):
        """
        Run cycles on all platforms
        
        Args:
            mode: "full", "verify", or "analyze"
            sequential: If True, run one at a time. If False, run in parallel.
        """
        
        results = {}
        
        if sequential:
            # Run one platform at a time
            for platform in self.platforms:
                success, error = await self.run_single_cycle(platform, mode)
                results[platform] = {"success": success, "error": error}
        else:
            # Run all platforms in parallel
            tasks = [
                self.run_single_cycle(platform, mode)
                for platform in self.platforms
            ]
            parallel_results = await asyncio.gather(*tasks)
            
            for platform, (success, error) in zip(self.platforms, parallel_results):
                results[platform] = {"success": success, "error": error}
        
        # Print summary
        self._print_summary(results)
        
        return results
    
    def _print_summary(self, results: Dict):
        """Print summary of all platform cycles"""
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   📊 MULTI-PLATFORM CYCLE SUMMARY                                            ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
        
        for platform, result in results.items():
            status = "✅" if result["success"] else "❌"
            print(f"{status} {platform.upper():<20}", end="")
            
            if result["success"]:
                # Try to get cycle info
                cycle_dir = self.project_path / ".helm" / "cycles"
                latest_summary = max(
                    cycle_dir.glob("cycle-*-summary.json"),
                    default=None,
                    key=lambda p: p.stat().st_mtime
                )
                
                if latest_summary:
                    with open(latest_summary) as f:
                        data = json.load(f)
                        total = data.get("total_issues", "?")
                        print(f" {total} issues remaining")
                else:
                    print(" Completed")
            else:
                print(f" Error: {result['error'][:50]}")
        
        print()
    
    def get_combined_stats(self) -> Dict:
        """Get combined statistics across all platforms"""
        
        stats = {
            "platforms": {},
            "total_issues": 0,
            "total_critical": 0,
            "total_high": 0,
            "total_medium": 0,
            "total_low": 0
        }
        
        cycle_dir = self.project_path / ".helm" / "cycles"
        if not cycle_dir.exists():
            return stats
        
        # Get latest summary for each platform
        for platform in self.platforms:
            # Find latest cycle for this platform
            pattern = f"cycle-*-summary.json"
            summaries = sorted(cycle_dir.glob(pattern))
            
            if summaries:
                latest = summaries[-1]
                with open(latest) as f:
                    data = json.load(f)
                    
                    platform_stats = {
                        "total": data.get("total_issues", 0),
                        "by_severity": data.get("by_severity", {})
                    }
                    
                    stats["platforms"][platform] = platform_stats
                    stats["total_issues"] += platform_stats["total"]
                    stats["total_critical"] += platform_stats["by_severity"].get("critical", 0)
                    stats["total_high"] += platform_stats["by_severity"].get("high", 0)
                    stats["total_medium"] += platform_stats["by_severity"].get("medium", 0)
                    stats["total_low"] += platform_stats["by_severity"].get("low", 0)
        
        return stats
    
    def print_combined_stats(self):
        """Print combined statistics across platforms"""
        
        stats = self.get_combined_stats()
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   📊 COMBINED PLATFORM STATISTICS                                            ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

Total Issues Across All Platforms: {stats['total_issues']}
  🔴 Critical: {stats['total_critical']}
  🟠 High: {stats['total_high']}
  🟡 Medium: {stats['total_medium']}
  🟢 Low: {stats['total_low']}

By Platform:
        """)
        
        for platform, pstats in stats['platforms'].items():
            print(f"  {platform.upper():<20} {pstats['total']} issues")
            sev = pstats['by_severity']
            print(f"    🔴 {sev.get('critical', 0)}  🟠 {sev.get('high', 0)}  🟡 {sev.get('medium', 0)}  🟢 {sev.get('low', 0)}")
        
        print()


async def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Multi-Platform Continuous Improvement Orchestrator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Auto-detect and run on all platforms
    python multi-platform-cycle.py --project ~/helmv3
    
    # Run on specific platforms
    python multi-platform-cycle.py --project ~/helmv3 --platforms baseball golf
    
    # Continuous mode (runs cycles every 10 minutes)
    python multi-platform-cycle.py --project ~/helmv3 --continuous --wait 600
    
    # Run in parallel (faster but more API usage)
    python multi-platform-cycle.py --project ~/helmv3 --parallel
    
    # Show combined stats
    python multi-platform-cycle.py --project ~/helmv3 --stats-only
        """
    )
    
    parser.add_argument("--project", required=True, help="Path to project")
    parser.add_argument("--platforms", nargs="+", 
                       help="Platforms to process (e.g., baseball golf)")
    parser.add_argument("--mode", choices=["full", "verify", "analyze"], 
                       default="full", help="Run mode")
    parser.add_argument("--continuous", action="store_true",
                       help="Run cycles continuously")
    parser.add_argument("--wait", type=int, default=600,
                       help="Wait time between cycles in continuous mode (seconds)")
    parser.add_argument("--parallel", action="store_true",
                       help="Run platforms in parallel (faster but more API usage)")
    parser.add_argument("--stats-only", action="store_true",
                       help="Just show combined statistics")
    
    args = parser.parse_args()
    
    # Normalize platform names
    if args.platforms:
        # Add "helm" suffix if not present
        platforms = [
            p if p.endswith("helm") else f"{p}helm"
            for p in args.platforms
        ]
    else:
        platforms = None
    
    orchestrator = MultiPlatformOrchestrator(args.project, platforms)
    
    if args.stats_only:
        orchestrator.print_combined_stats()
        return
    
    if args.continuous:
        print(f"\n🔄 Running in continuous mode (cycling every {args.wait}s)")
        print("Press Ctrl+C to stop\n")
        
        while True:
            try:
                await orchestrator.run_all_platforms(
                    mode=args.mode,
                    sequential=not args.parallel
                )
                
                if args.wait > 0:
                    print(f"\n⏳ Waiting {args.wait} seconds before next cycle...")
                    await asyncio.sleep(args.wait)
                
                # Reload orchestrator
                orchestrator = MultiPlatformOrchestrator(args.project, platforms)
                
            except KeyboardInterrupt:
                print("\n\n👋 Stopped by user")
                break
    else:
        await orchestrator.run_all_platforms(
            mode=args.mode,
            sequential=not args.parallel
        )
        
        # Show combined stats after single run
        print("\n")
        orchestrator.print_combined_stats()


if __name__ == "__main__":
    asyncio.run(main())
