#!/usr/bin/env python3
"""
Helm Intelligence - Cycle Dashboard

View statistics and progress across improvement cycles.

Usage:
    python view-cycles.py ~/helmv3
"""

import json
import sys
from datetime import datetime
from pathlib import Path


class CycleDashboard:
    """Display cycle statistics and progress"""
    
    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.cycle_dir = self.project_path / ".helm" / "cycles"
        
        if not self.cycle_dir.exists():
            print(f"❌ No cycles found at {self.cycle_dir}")
            sys.exit(1)
    
    def load_cycles(self) -> list[dict]:
        """Load all cycle summaries"""
        cycles = []
        
        for summary_file in sorted(self.cycle_dir.glob("cycle-*-summary.json")):
            with open(summary_file) as f:
                data = json.load(f)
                
                # Load issue details
                cycle_num = data["cycle"]
                issues_file = self.cycle_dir / f"issues-cycle-{cycle_num:03d}.json"
                if issues_file.exists():
                    with open(issues_file) as f2:
                        issue_data = json.load(f2)
                        data["timestamp"] = issue_data.get("timestamp")
                        data["issues"] = issue_data.get("issues", [])
                
                cycles.append(data)
        
        return cycles
    
    def display_summary(self):
        """Display summary of all cycles"""
        cycles = self.load_cycles()
        
        if not cycles:
            print("No cycles found yet. Run cycle-agent.py to start!")
            return
        
        print("""
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║   📊 HELM INTELLIGENCE - IMPROVEMENT CYCLES DASHBOARD                    ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
        """)
        
        print(f"\nProject: {self.project_path}")
        print(f"Total Cycles: {len(cycles)}")
        print(f"Latest Cycle: {cycles[-1]['cycle']}")
        
        # Progress chart
        print("\n" + "━" * 75)
        print("  PROGRESS OVER TIME")
        print("━" * 75 + "\n")
        
        print(f"{'Cycle':<8} {'Total':<8} {'🔴':<6} {'🟠':<6} {'🟡':<6} {'🟢':<6} {'Status':<20}")
        print("─" * 75)
        
        for cycle in cycles:
            cycle_num = cycle["cycle"]
            total = cycle["total_issues"]
            sev = cycle["by_severity"]
            
            # Status
            if total == 0:
                status = "✅ Complete"
            elif cycle_num < len(cycles):
                status = "⏳ In progress"
            else:
                status = "🔄 Active"
            
            print(f"{cycle_num:<8} {total:<8} {sev['critical']:<6} {sev['high']:<6} {sev['medium']:<6} {sev['low']:<6} {status:<20}")
        
        # Trend analysis
        if len(cycles) >= 2:
            first = cycles[0]["total_issues"]
            last = cycles[-1]["total_issues"]
            delta = first - last
            percent = (delta / first * 100) if first > 0 else 0
            
            print("\n" + "━" * 75)
            print("  TREND ANALYSIS")
            print("━" * 75 + "\n")
            
            if delta > 0:
                print(f"✅ {delta} issues resolved ({percent:.1f}% reduction)")
            elif delta < 0:
                print(f"⚠️  {abs(delta)} new issues found")
            else:
                print("➡️  No net change (new issues = resolved issues)")
        
        # Category breakdown
        print("\n" + "━" * 75)
        print("  CURRENT ISSUES BY CATEGORY (Latest Cycle)")
        print("━" * 75 + "\n")
        
        latest = cycles[-1]
        categories = latest.get("by_category", {})
        
        if categories:
            for cat, count in sorted(categories.items(), key=lambda x: x[1], reverse=True):
                bar = "█" * count
                print(f"{cat:<20} {bar} {count}")
        else:
            print("🎉 No issues!")
        
        # Verification stats
        if len(cycles) >= 2:
            latest = cycles[-1]
            verified = latest.get("verified_from_previous", 0)
            regressions = latest.get("regressions_found", 0)
            new = latest.get("new_issues_found", 0)
            
            print("\n" + "━" * 75)
            print("  VERIFICATION STATS (Latest Cycle)")
            print("━" * 75 + "\n")
            
            print(f"✅ Verified fixed from previous: {verified}")
            print(f"⚠️  Regressions found: {regressions}")
            print(f"🆕 New issues discovered: {new}")
        
        # Recent activity
        print("\n" + "━" * 75)
        print("  RECENT ACTIVITY")
        print("━" * 75 + "\n")
        
        for cycle in cycles[-3:]:  # Last 3 cycles
            cycle_num = cycle["cycle"]
            timestamp = cycle.get("timestamp", "unknown")
            if timestamp != "unknown":
                dt = datetime.fromisoformat(timestamp)
                timestamp = dt.strftime("%Y-%m-%d %H:%M")
            
            print(f"Cycle {cycle_num:03d}: {timestamp} - {cycle['total_issues']} issues")
            
            if cycle.get("verified_from_previous"):
                print(f"  └─ Verified {cycle['verified_from_previous']} fixes from previous cycle")
        
        # Next steps
        print("\n" + "━" * 75)
        print("  NEXT STEPS")
        print("━" * 75 + "\n")
        
        latest_cycle = cycles[-1]["cycle"]
        issues_file = self.cycle_dir / f"issues-cycle-{latest_cycle:03d}.md"
        
        if cycles[-1]["total_issues"] > 0:
            print(f"1. Open {issues_file}")
            print("2. Let Claude Code fix the issues")
            print(f"3. Run cycle {latest_cycle + 1} to verify fixes")
        else:
            print("🎉 All issues resolved! Consider running a new analysis to find more improvements.")
        
        print()
    
    def display_detailed_cycle(self, cycle_num: int):
        """Display detailed information for a specific cycle"""
        issues_file = self.cycle_dir / f"issues-cycle-{cycle_num:03d}.json"
        
        if not issues_file.exists():
            print(f"❌ Cycle {cycle_num} not found")
            return
        
        with open(issues_file) as f:
            data = json.load(f)
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║   📋 CYCLE {cycle_num:03d} DETAILS                                              ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
        """)
        
        print(f"\nTimestamp: {data.get('timestamp', 'unknown')}")
        print(f"Platform: {data.get('platform', 'unknown')}")
        print(f"Total Issues: {len(data.get('issues', []))}")
        
        issues = data.get("issues", [])
        
        # Group by state
        by_state = {}
        for issue in issues:
            state = issue.get("state", "unknown")
            by_state[state] = by_state.get(state, 0) + 1
        
        print("\nIssues by State:")
        for state, count in sorted(by_state.items()):
            print(f"  {state}: {count}")
        
        # Show each issue
        print("\n" + "━" * 75)
        print("ISSUES")
        print("━" * 75 + "\n")
        
        for issue in issues:
            severity_emoji = {
                "critical": "🔴",
                "high": "🟠",
                "medium": "🟡",
                "low": "🟢"
            }.get(issue.get("severity"), "⚪")
            
            state_emoji = {
                "open": "⏳",
                "fixed": "🔧",
                "verified": "✅",
                "regression": "⚠️"
            }.get(issue.get("state"), "❓")
            
            print(f"{severity_emoji} {state_emoji} {issue.get('id')}: {issue.get('title')}")
            print(f"   Category: {issue.get('category')}")
            print(f"   Location: {issue.get('location', {}).get('file', 'unknown')}")
            
            if issue.get("fix_details"):
                print(f"   Fix: {issue['fix_details'][:100]}...")
            
            print()


def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description="View improvement cycle statistics and progress"
    )
    
    parser.add_argument("project", help="Project path")
    parser.add_argument("--cycle", type=int, help="Show details for specific cycle")
    
    args = parser.parse_args()
    
    dashboard = CycleDashboard(args.project)
    
    if args.cycle:
        dashboard.display_detailed_cycle(args.cycle)
    else:
        dashboard.display_summary()


if __name__ == "__main__":
    main()
