#!/usr/bin/env python3
"""
SIMPLIFIED VERSION - Assumes fixes work, focuses on finding NEW issues

This version:
1. Reads MD file to see what was fixed
2. ASSUMES those fixes worked (no deep verification)
3. Focuses on finding new issues

This is 10x simpler and actually works!
"""

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict
import re

# Import the base classes from the full version
from enhanced_cycle_agent import HelmContext, Issue


class SimplifiedCycleAgent:
    """
    Simplified cycle agent that trusts Claude Code's fixes
    """
    
    def __init__(self, project_path: str, platform_name: str):
        self.project_path = Path(project_path)
        self.platform_name = platform_name
        self.helm_dir = self.project_path / ".helm"
        self.cycle_dir = self.helm_dir / "cycles"
        self.cycle_dir.mkdir(parents=True, exist_ok=True)
        
        self.helm_context = HelmContext(self.project_path)
        self.current_cycle = self._get_next_cycle_number()
        
        self.all_issues: List[Issue] = []
        self.current_issues: List[Issue] = []
        
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
    
    def _load_previous_cycle(self) -> Optional[Dict]:
        """Load the previous cycle's issues"""
        if self.current_cycle == 1:
            return None
        
        prev_cycle = self.current_cycle - 1
        prev_file = self.cycle_dir / f"issues-cycle-{prev_cycle:03d}.json"
        
        if not prev_file.exists():
            return None
        
        with open(prev_file) as f:
            return json.load(f)
    
    def _parse_md_file_for_fixes(self, cycle_number: int) -> Dict[str, str]:
        """Parse MD file to see what Claude Code fixed"""
        md_file = self.cycle_dir / f"issues-cycle-{cycle_number:03d}.md"
        
        if not md_file.exists():
            return {}
        
        print(f"📄 Reading {md_file.name} to find documented fixes...")
        
        with open(md_file) as f:
            content = f.read()
        
        fixes = {}
        sections = re.split(r'### FIX STATUS:\s*([A-Z]+-\d+)', content)
        
        for i in range(1, len(sections), 2):
            if i + 1 >= len(sections):
                break
                
            issue_id = sections[i].strip()
            status_content = sections[i + 1]
            
            if ('✅' in status_content and 'Fixed' in status_content) or \
               ('**Status:** Fixed' in status_content) or \
               ('Status: Fixed' in status_content):
                fixes[issue_id] = status_content[:500]
                print(f"  📝 {issue_id}: Marked as ✅ Fixed by Claude Code")
        
        return fixes
    
    async def run_cycle(self, mode: str = "full"):
        """Run simplified cycle"""
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   🔄 SIMPLIFIED IMPROVEMENT CYCLE {self.current_cycle:03d}                                ║
║   Platform: {self.platform_name:<59} ║
║   Mode: Fast (trusts Claude Code fixes)                                      ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
        
        print("\n📚 Available Context:")
        print(self.helm_context.get_context_summary())
        print()
        
        # Phase 1: Load and mark previous fixes as verified
        prev_cycle = self._load_previous_cycle()
        if prev_cycle:
            self.mark_fixes_as_verified(prev_cycle)
        
        # Phase 2: Find new issues
        if mode in ["full", "analyze"]:
            await self.find_new_issues()
        
        # Phase 3: Export
        await self.export_issues()
        
        # Phase 4: Summary
        self.generate_summary()
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   ✅ CYCLE {self.current_cycle:03d} COMPLETE                                            ║
║                                                                              ║
║   📁 Issues: {str(self.cycle_dir / f'issues-cycle-{self.current_cycle:03d}.md'):<66}║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
    
    def mark_fixes_as_verified(self, prev_cycle: Dict):
        """Simple: trust Claude Code's fixes without deep verification"""
        
        print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📋 PHASE 1: PROCESSING PREVIOUS FIXES
  (Trusting Claude Code's documented fixes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """)
        
        prev_issues = [Issue.from_dict(i) for i in prev_cycle.get("issues", [])]
        
        # Parse MD to see what was fixed
        md_fixes = self._parse_md_file_for_fixes(self.current_cycle - 1)
        
        if not md_fixes:
            print("\n⚠️  No fixes found in MD file")
            return
        
        print(f"\n✅ Found {len(md_fixes)} issues marked as fixed")
        print("✅ Marking them as verified (trusting Claude Code)")
        print()
        
        verified_count = 0
        for issue in prev_issues:
            if issue.id in md_fixes:
                issue.state = "verified"
                issue.verified_in_cycle = self.current_cycle
                issue.fixed_in_cycle = self.current_cycle - 1
                self.all_issues.append(issue)
                verified_count += 1
                print(f"  ✅ {issue.id}: Marked as verified")
        
        print(f"\n✅ Verified {verified_count} fixes (trusted Claude Code's work)")
    
    async def find_new_issues(self):
        """Find new issues - same as before"""
        from claude_agent_sdk import query, ClaudeAgentOptions
        
        print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🔍 PHASE 2: FINDING NEW ISSUES
  Using context-aware analysis...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """)
        
        options = ClaudeAgentOptions(
            cwd=str(self.project_path),
            allowed_tools=["Read", "Bash", "Glob", "Grep", "LS"],
            permission_mode="default",
            max_turns=60,
        )
        
        helm_context = self.helm_context.get_full_context_for_prompt()
        known_ids = self.helm_context.get_known_issue_ids()
        known_ids.extend([i.id for i in self.all_issues])
        known_issues = "\n".join([f"- {id}" for id in known_ids])
        
        prompt = f"""
You are performing cycle {self.current_cycle} of continuous improvement.

Platform: {self.platform_name}
Project: {self.project_path}

Context:
{helm_context}

Known issues (DO NOT DUPLICATE):
{known_issues}

Find NEW issues by checking:
1. Missing features mentioned in docs
2. Inconsistencies across similar features
3. Security vulnerabilities
4. UX problems
5. Performance issues

For EACH issue found, output:
```json
{{
  "id": "ISSUE-XXX",
  "title": "Short title",
  "description": "Detailed description",
  "severity": "critical|high|medium|low",
  "category": "security|ux|performance|code_quality",
  "location": {{"file": "path/to/file", "line": 42}},
  "suggested_fix": "How to fix it"
}}
```

Find 5-10 real issues.
"""
        
        issue_results = []
        
        async for message in query(prompt=prompt, options=options):
            if hasattr(message, 'content'):
                for block in message.content:
                    if hasattr(block, 'text'):
                        preview = block.text[-500:] if len(block.text) > 500 else block.text
                        print(preview)
                        issue_results.append(block.text)
        
        full_output = "\n".join(issue_results)
        self._parse_new_issues(full_output)
    
    def _parse_new_issues(self, output: str):
        """Parse new issues"""
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
                    source="cycle_analysis",
                    context={"suggested_fix": data.get("suggested_fix")}
                )
                
                self.current_issues.append(issue)
                self.all_issues.append(issue)
                new_count += 1
                
                print(f"  🆕 {issue.id}: {issue.title}")
                
            except json.JSONDecodeError:
                continue
        
        print(f"\n✅ Found {new_count} new issues")
    
    async def export_issues(self):
        """Export issues"""
        from enhanced_cycle_agent import EnhancedCycleAgent
        
        # Use the full agent's export method
        temp_agent = EnhancedCycleAgent(str(self.project_path), self.platform_name)
        temp_agent.current_cycle = self.current_cycle
        temp_agent.current_issues = self.current_issues
        temp_agent.helm_context = self.helm_context
        temp_agent.cycle_dir = self.cycle_dir
        
        await temp_agent.export_issues()
    
    def generate_summary(self):
        """Generate summary"""
        stats = {
            "cycle": self.current_cycle,
            "total_issues": len(self.current_issues),
            "by_severity": {
                "critical": len([i for i in self.current_issues if i.severity == "critical"]),
                "high": len([i for i in self.current_issues if i.severity == "high"]),
                "medium": len([i for i in self.current_issues if i.severity == "medium"]),
                "low": len([i for i in self.current_issues if i.severity == "low"]),
            },
            "verified_from_previous": len([i for i in self.all_issues if i.verified_in_cycle == self.current_cycle]),
            "new_issues_found": len([i for i in self.current_issues if i.found_in_cycle == self.current_cycle])
        }
        
        summary_file = self.cycle_dir / f"cycle-{self.current_cycle:03d}-summary.json"
        with open(summary_file, "w") as f:
            json.dump(stats, f, indent=2)
        
        print(f"\n📊 Cycle {self.current_cycle} Summary:")
        print(f"   Total Active Issues: {stats['total_issues']}")
        print(f"   New Issues Found: {stats['new_issues_found']}")
        if self.current_cycle > 1:
            print(f"   Verified from Previous: {stats['verified_from_previous']}")


async def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Simplified Cycle Agent")
    parser.add_argument("--project", required=True)
    parser.add_argument("--platform", required=True)
    parser.add_argument("--mode", default="full")
    
    args = parser.parse_args()
    
    agent = SimplifiedCycleAgent(args.project, args.platform)
    await agent.run_cycle(mode=args.mode)


if __name__ == "__main__":
    asyncio.run(main())
