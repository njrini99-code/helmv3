#!/usr/bin/env python3
"""
COMPREHENSIVE MULTI-PLATFORM VERIFICATION

This checks EVERYTHING:
- All platforms (BaseballHelm, GolfHelm, Helm)
- Verifies cycle-001 fixes across all platforms
- Uses UNDERSTANDING.json to find incomplete features
- Uses HELM_ESSAY.md to check documented features
- Scans entire codebase for issues
- Finds gaps between docs and reality
"""

import asyncio
import json
from pathlib import Path
from typing import List, Dict
import re
from datetime import datetime

from enhanced_cycle_agent import HelmContext, Issue


class ComprehensiveAgent:
    """
    Comprehensive multi-platform verification and discovery
    """
    
    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.helm_dir = self.project_path / ".helm"
        self.cycle_dir = self.helm_dir / "cycles"
        self.cycle_dir.mkdir(parents=True, exist_ok=True)
        
        # Detect all platforms
        self.platforms = self._detect_platforms()
        
        # Load context for ALL platforms
        self.contexts = {}
        for platform in self.platforms:
            self.contexts[platform] = HelmContext(self.project_path)
        
        self.current_cycle = self._get_next_cycle_number()
        
        self.all_issues: List[Issue] = []
        self.current_issues: List[Issue] = []
        
    def _detect_platforms(self) -> List[str]:
        """Detect all platforms"""
        platforms = []
        
        # Check for domain routes
        app_dir = self.project_path / "src" / "app"
        if app_dir.exists():
            for subdir in app_dir.iterdir():
                if subdir.is_dir() and subdir.name in ["baseball", "golf", "coach"]:
                    platforms.append(f"{subdir.name}helm")
        
        # Check for HELM (core)
        if (self.project_path / "src").exists():
            platforms.append("helm")
        
        # Deduplicate
        platforms = list(set(platforms))
        
        if not platforms:
            platforms = ["baseballhelm", "golfhelm", "helm"]
        
        return platforms
    
    def _get_next_cycle_number(self) -> int:
        """Find the next cycle number"""
        existing = list(self.cycle_dir.glob("issues-cycle-*.md"))
        if not existing:
            return 1
        
        numbers = []
        for f in existing:
            match = re.search(r'cycle-(\d+)', f.name)
            if match:
                numbers.append(int(match.group(1)))
        
        return max(numbers) + 1 if numbers else 1
    
    async def run_comprehensive_cycle(self):
        """Run comprehensive verification and discovery"""
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   🔄 COMPREHENSIVE MULTI-PLATFORM CYCLE {self.current_cycle:03d}                          ║
║                                                                              ║
║   Platforms: {', '.join(self.platforms):<57} ║
║   Mode: Full verification + feature checking + gap analysis                 ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
        
        # Phase 1: Verify previous cycle fixes (ALL platforms)
        if self.current_cycle > 1:
            self.verify_all_platforms()
        
        # Phase 2: Check for incomplete features (uses UNDERSTANDING.json)
        await self.check_incomplete_features()
        
        # Phase 3: Find implementation gaps (uses HELM_ESSAY.md)
        await self.find_implementation_gaps()
        
        # Phase 4: Comprehensive code scan
        await self.comprehensive_code_scan()
        
        # Phase 5: Export
        await self.export_issues()
        
        # Phase 6: Summary
        self.generate_summary()
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   ✅ COMPREHENSIVE CYCLE {self.current_cycle:03d} COMPLETE                               ║
║                                                                              ║
║   📁 Issues: {str(self.cycle_dir / f'issues-cycle-{self.current_cycle:03d}.md'):<66}║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
    
    def verify_all_platforms(self):
        """Verify fixes across ALL platforms"""
        
        print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📋 PHASE 1: VERIFYING PREVIOUS CYCLE (ALL PLATFORMS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """)
        
        # Load previous cycle
        prev_file = self.cycle_dir / f"issues-cycle-{self.current_cycle - 1:03d}.json"
        if not prev_file.exists():
            print("⚠️  No previous cycle found")
            return
        
        with open(prev_file) as f:
            prev_cycle = json.load(f)
        
        prev_issues = [Issue.from_dict(i) for i in prev_cycle.get("issues", [])]
        
        # Read MD file for fixes
        md_file = self.cycle_dir / f"issues-cycle-{self.current_cycle - 1:03d}.md"
        if not md_file.exists():
            return
        
        with open(md_file) as f:
            md_content = f.read()
        
        # Parse fixes
        fixes = {}
        sections = re.split(r'### FIX STATUS:\s*([A-Z]+-\d+)', md_content)
        
        for i in range(1, len(sections), 2):
            if i + 1 >= len(sections):
                break
            
            issue_id = sections[i].strip()
            status_content = sections[i + 1]
            
            if '✅' in status_content and 'Fixed' in status_content:
                # Extract files
                files = re.findall(r'`([^`]+?\.(?:tsx?|jsx?|py|sql|json))`', status_content)
                fixes[issue_id] = files
        
        print(f"Found {len(fixes)} issues marked as fixed\n")
        
        # Verify each
        verified = 0
        not_fixed = 0
        
        for issue in prev_issues:
            if issue.id not in fixes:
                continue
            
            files = fixes[issue.id]
            
            if not files:
                continue
            
            # Check if files exist
            all_exist = all((self.project_path / f).exists() for f in files)
            
            if all_exist:
                issue.state = "verified"
                issue.verified_in_cycle = self.current_cycle
                verified += 1
                self.all_issues.append(issue)
                print(f"  ✅ {issue.id}: Verified")
            else:
                issue.state = "open"
                not_fixed += 1
                self.current_issues.append(issue)
                self.all_issues.append(issue)
                print(f"  ❌ {issue.id}: Not fixed")
        
        print(f"\n✅ Verified: {verified}")
        print(f"❌ Not fixed: {not_fixed}\n")
    
    async def check_incomplete_features(self):
        """Check UNDERSTANDING.json for incomplete features"""
        from claude_agent_sdk import query, ClaudeAgentOptions
        
        print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🔍 PHASE 2: CHECKING FOR INCOMPLETE FEATURES
  Using UNDERSTANDING.json to find missing implementations
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """)
        
        options = ClaudeAgentOptions(
            cwd=str(self.project_path),
            allowed_tools=["Read", "Bash", "Glob", "Grep"],
            permission_mode="default",
            max_turns=80,  # More turns for comprehensive check
        )
        
        # Get all known issue IDs
        known_ids = [i.id for i in self.all_issues]
        
        prompt = f"""
Read .helm/UNDERSTANDING.json which documents all features that SHOULD exist.

For EACH feature in UNDERSTANDING.json:
1. Check if it's actually implemented in the codebase
2. Check if implementation is complete
3. Find missing pieces

Also check EACH platform:
{', '.join(self.platforms)}

For incomplete features, output:
```json
{{"id": "FEAT-XXX", "title": "Missing X feature", "description": "Feature documented but not implemented", "severity": "high", "category": "missing_feature", "location": {{"file": "where it should be"}}, "suggested_fix": "Implement this", "platform": "baseballhelm"}}
```

Skip these known IDs: {', '.join(known_ids[:30])}

Be THOROUGH. Check EVERY feature in UNDERSTANDING.json against actual code.
Find 20-40 incomplete features.
"""
        
        results = []
        
        async for message in query(prompt=prompt, options=options):
            if hasattr(message, 'content'):
                for block in message.content:
                    if hasattr(block, 'text'):
                        print(block.text[-300:])
                        results.append(block.text)
        
        full_output = "\n".join(results)
        self._parse_issues(full_output, "feature_check")
    
    async def find_implementation_gaps(self):
        """Use HELM_ESSAY.md to find gaps"""
        from claude_agent_sdk import query, ClaudeAgentOptions
        
        print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🔍 PHASE 3: FINDING IMPLEMENTATION GAPS
  Using HELM_ESSAY.md to check documented vs actual implementation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """)
        
        options = ClaudeAgentOptions(
            cwd=str(self.project_path),
            allowed_tools=["Read", "Bash", "Glob", "Grep"],
            permission_mode="default",
            max_turns=80,
        )
        
        known_ids = [i.id for i in self.all_issues]
        
        prompt = f"""
Read .helm/HELM_ESSAY.md which documents how the application SHOULD work.

Find gaps where:
- Essay describes a feature that doesn't exist
- Essay describes behavior that's not implemented
- Essay mentions components that are missing
- Documentation promises features that aren't there

Check ALL platforms: {', '.join(self.platforms)}

For each gap, output:
```json
{{"id": "GAP-XXX", "title": "Gap between docs and code", "description": "Essay says X but code does Y", "severity": "medium", "category": "documentation_gap", "location": {{"file": "path"}}, "suggested_fix": "Fix", "platform": "baseballhelm"}}
```

Skip: {', '.join(known_ids[:30])}

Find 15-30 gaps between documentation and reality.
"""
        
        results = []
        
        async for message in query(prompt=prompt, options=options):
            if hasattr(message, 'content'):
                for block in message.content:
                    if hasattr(block, 'text'):
                        print(block.text[-300:])
                        results.append(block.text)
        
        full_output = "\n".join(results)
        self._parse_issues(full_output, "gap_analysis")
    
    async def comprehensive_code_scan(self):
        """Comprehensive scan of entire codebase"""
        from claude_agent_sdk import query, ClaudeAgentOptions
        
        print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🔍 PHASE 4: COMPREHENSIVE CODE SCAN
  Scanning entire codebase for issues
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """)
        
        options = ClaudeAgentOptions(
            cwd=str(self.project_path),
            allowed_tools=["Read", "Bash", "Glob", "Grep"],
            permission_mode="default",
            max_turns=80,
        )
        
        known_ids = [i.id for i in self.all_issues]
        
        prompt = f"""
Scan the ENTIRE codebase for issues:

1. **Security Issues**
   - Missing authentication checks
   - No RLS policies
   - Exposed API keys
   - SQL injection risks

2. **Data Integrity**
   - Missing validation
   - No error handling
   - Race conditions
   - Data loss risks

3. **UX Problems**
   - Missing loading states
   - No error messages
   - Broken navigation
   - Accessibility issues

4. **Performance**
   - N+1 queries
   - Missing indexes
   - Unnecessary re-renders
   - Large bundle sizes

5. **Code Quality**
   - Duplicated code
   - Inconsistent patterns
   - Missing types
   - Dead code

Check ALL platforms: {', '.join(self.platforms)}
Check ALL directories: src/app, src/components, src/lib, supabase

For each issue:
```json
{{"id": "ISSUE-XXX", "title": "Title", "description": "Details", "severity": "critical|high|medium|low", "category": "security|ux|performance|code_quality", "location": {{"file": "path", "line": 42}}, "suggested_fix": "How to fix", "platform": "helm"}}
```

Skip: {', '.join(known_ids[:30])}

Be COMPREHENSIVE. Find 30-50 real issues across the entire codebase.
"""
        
        results = []
        
        async for message in query(prompt=prompt, options=options):
            if hasattr(message, 'content'):
                for block in message.content:
                    if hasattr(block, 'text'):
                        print(block.text[-300:])
                        results.append(block.text)
        
        full_output = "\n".join(results)
        self._parse_issues(full_output, "comprehensive_scan")
    
    def _parse_issues(self, output: str, source: str):
        """Parse issues from output"""
        json_pattern = r'```json\s*(.*?)\s*```'
        matches = re.findall(json_pattern, output, re.DOTALL)
        
        new_count = 0
        
        for match in matches:
            try:
                data = json.loads(match)
                issue_id = data.get("id")
                
                if any(i.id == issue_id for i in self.all_issues):
                    continue
                
                issue = Issue(
                    id=issue_id,
                    title=data.get("title", "Unknown"),
                    description=data.get("description", ""),
                    severity=data.get("severity", "medium"),
                    category=data.get("category", "other"),
                    location=data.get("location", {}),
                    found_in_cycle=self.current_cycle,
                    source=source,
                    context={
                        "suggested_fix": data.get("suggested_fix"),
                        "platform": data.get("platform", "unknown")
                    }
                )
                
                self.current_issues.append(issue)
                self.all_issues.append(issue)
                new_count += 1
                
                print(f"  🆕 {issue.id}: {issue.title}")
                
            except json.JSONDecodeError:
                continue
        
        print(f"\n✅ Found {new_count} new issues from {source}")
    
    async def export_issues(self):
        """Export issues"""
        from enhanced_cycle_agent import EnhancedCycleAgent
        
        temp_agent = EnhancedCycleAgent(str(self.project_path), "multi-platform")
        temp_agent.current_cycle = self.current_cycle
        temp_agent.current_issues = self.current_issues
        temp_agent.helm_context = self.contexts.get("helm", HelmContext(self.project_path))
        temp_agent.cycle_dir = self.cycle_dir
        
        await temp_agent.export_issues()
    
    def generate_summary(self):
        """Generate summary"""
        
        # Group by platform
        by_platform = {}
        for issue in self.current_issues:
            platform = issue.context.get("platform", "unknown")
            if platform not in by_platform:
                by_platform[platform] = []
            by_platform[platform].append(issue)
        
        stats = {
            "cycle": self.current_cycle,
            "total_issues": len(self.current_issues),
            "by_severity": {
                "critical": len([i for i in self.current_issues if i.severity == "critical"]),
                "high": len([i for i in self.current_issues if i.severity == "high"]),
                "medium": len([i for i in self.current_issues if i.severity == "medium"]),
                "low": len([i for i in self.current_issues if i.severity == "low"]),
            },
            "by_platform": {k: len(v) for k, v in by_platform.items()},
            "by_source": {},
            "verified_from_previous": len([i for i in self.all_issues if i.verified_in_cycle == self.current_cycle]),
            "new_issues_found": len([i for i in self.current_issues if i.found_in_cycle == self.current_cycle])
        }
        
        for issue in self.current_issues:
            src = issue.source
            stats["by_source"][src] = stats["by_source"].get(src, 0) + 1
        
        summary_file = self.cycle_dir / f"cycle-{self.current_cycle:03d}-summary.json"
        with open(summary_file, "w") as f:
            json.dump(stats, f, indent=2)
        
        print(f"\n📊 Comprehensive Summary:")
        print(f"   Total Issues: {stats['total_issues']}")
        print(f"   By Platform:")
        for platform, count in stats['by_platform'].items():
            print(f"     {platform}: {count}")
        print(f"   By Source:")
        for source, count in stats['by_source'].items():
            print(f"     {source}: {count}")


async def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Comprehensive Multi-Platform Verification")
    parser.add_argument("--project", required=True)
    
    args = parser.parse_args()
    
    agent = ComprehensiveAgent(args.project)
    await agent.run_comprehensive_cycle()


if __name__ == "__main__":
    asyncio.run(main())
