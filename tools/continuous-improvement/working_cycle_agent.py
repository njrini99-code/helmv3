#!/usr/bin/env python3
"""
Helm Intelligence - WORKING Cycle Agent with Batch Verification

KEY FIX: Verifies issues in small batches (5 at a time) instead of all at once.
This prevents context overflow and actually produces results.
"""

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict
import re

# Import base classes
from enhanced_cycle_agent import HelmContext, Issue


class WorkingCycleAgent:
    """
    Cycle agent with WORKING batch verification
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
                fixes[issue_id] = status_content[:1000]
                print(f"  📝 {issue_id}: Marked as ✅ Fixed by Claude Code")
        
        return fixes
    
    async def run_cycle(self, mode: str = "full"):
        """Run complete cycle with batch verification"""
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   🔄 WORKING CONTINUOUS IMPROVEMENT CYCLE {self.current_cycle:03d}                        ║
║   Platform: {self.platform_name:<59} ║
║   Mode: {mode:<66} ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
        
        print("\n📚 Available Context:")
        print(self.helm_context.get_context_summary())
        print()
        
        # Phase 1: Verify previous fixes (in batches)
        prev_cycle = self._load_previous_cycle()
        if prev_cycle:
            await self.verify_previous_fixes_batched(prev_cycle)
        
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
    
    async def verify_previous_fixes_batched(self, prev_cycle: Dict):
        """
        🔧 WORKING VERSION: Verify fixes in small batches
        
        This is the KEY fix - we verify 5 issues at a time instead of 85 at once.
        """
        from claude_agent_sdk import query, ClaudeAgentOptions
        
        print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📋 PHASE 1: VERIFYING PREVIOUS FIXES (BATCH MODE)
  Checking if fixes from cycle {self.current_cycle - 1:03d} actually worked...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """)
        
        # Load previous issues
        prev_issues = [Issue.from_dict(i) for i in prev_cycle.get("issues", [])]
        
        # Parse MD to see what was fixed
        md_fixes = self._parse_md_file_for_fixes(self.current_cycle - 1)
        
        if not md_fixes:
            print("\n⚠️  No fixes found in MD file")
            return
        
        print(f"\n✅ Found {len(md_fixes)} issues marked as fixed")
        
        # Update issue states
        fixed_issues = []
        for issue in prev_issues:
            if issue.id in md_fixes:
                issue.state = "fixed"
                issue.fix_details = md_fixes[issue.id]
                issue.fixed_in_cycle = self.current_cycle - 1
                fixed_issues.append(issue)
        
        if not fixed_issues:
            print("⚠️  No matching issues found")
            return
        
        print(f"Now verifying in batches of 5...\n")
        
        # Verify in batches
        BATCH_SIZE = 5
        verified_count = 0
        not_fixed_count = 0
        regression_count = 0
        
        for i in range(0, len(fixed_issues), BATCH_SIZE):
            batch = fixed_issues[i:i + BATCH_SIZE]
            batch_num = (i // BATCH_SIZE) + 1
            total_batches = (len(fixed_issues) + BATCH_SIZE - 1) // BATCH_SIZE
            
            print(f"📦 Verifying batch {batch_num}/{total_batches} ({len(batch)} issues)...")
            
            v, n, r = await self._verify_batch(batch)
            verified_count += v
            not_fixed_count += n
            regression_count += r
            
            print(f"   ✅ Verified: {v}  ❌ Not fixed: {n}  ⚠️ Regressions: {r}\n")
        
        print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICATION COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total Verified: {verified_count}/{len(fixed_issues)}
  ✅ Actually fixed: {verified_count}
  ❌ Not actually fixed: {not_fixed_count}
  ⚠️  Regressions found: {regression_count}
        """)
    
    async def _verify_batch(self, batch: List[Issue]) -> tuple:
        """
        Verify a small batch of issues (5 at a time)
        Returns: (verified_count, not_fixed_count, regression_count)
        """
        from claude_agent_sdk import query, ClaudeAgentOptions
        
        options = ClaudeAgentOptions(
            cwd=str(self.project_path),
            allowed_tools=["Read", "Bash", "Grep"],
            permission_mode="default",
            max_turns=15,  # Shorter for batches
        )
        
        # Simple verification prompt for this batch
        batch_summary = "\n\n".join([
            f"ISSUE {issue.id}: {issue.title}\n"
            f"File: {issue.location.get('file', 'unknown')}\n"
            f"Claimed Fix: {issue.fix_details[:300]}..."
            for issue in batch
        ])
        
        prompt = f"""
Verify these {len(batch)} fixes by reading the actual code.

{batch_summary}

For EACH issue above, check:
1. Read the file mentioned
2. Verify the fix was actually applied
3. Check it solves the problem

Respond with ONE JSON object per issue:
```json
{{"issue_id": "ISSUE-XXX", "status": "verified"}}
```
or
```json
{{"issue_id": "ISSUE-XXX", "status": "not_fixed", "reason": "why"}}
```

Be concise. Just verify if the code change exists.
"""
        
        results = []
        
        async for message in query(prompt=prompt, options=options):
            if hasattr(message, 'content'):
                for block in message.content:
                    if hasattr(block, 'text'):
                        results.append(block.text)
        
        full_output = "\n".join(results)
        
        # Process results
        return self._process_batch_results(full_output, batch)
    
    def _process_batch_results(self, output: str, batch: List[Issue]) -> tuple:
        """Process verification results from one batch"""
        json_pattern = r'```json\s*(.*?)\s*```'
        matches = re.findall(json_pattern, output, re.DOTALL)
        
        verified = 0
        not_fixed = 0
        regressions = 0
        
        for match in matches:
            try:
                result = json.loads(match)
                issue_id = result.get("issue_id")
                status = result.get("status")
                
                issue = next((i for i in batch if i.id == issue_id), None)
                if not issue:
                    continue
                
                if status == "verified":
                    issue.state = "verified"
                    issue.verified_in_cycle = self.current_cycle
                    verified += 1
                    self.all_issues.append(issue)
                
                elif status == "not_fixed":
                    issue.state = "open"
                    issue.fixed_in_cycle = None
                    issue.fix_details = None
                    not_fixed += 1
                    self.all_issues.append(issue)
                    self.current_issues.append(issue)
                
            except json.JSONDecodeError:
                continue
        
        return (verified, not_fixed, regressions)
    
    async def find_new_issues(self):
        """Find new issues - simplified"""
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
            max_turns=40,  # Reduced
        )
        
        # Get known issues
        known_ids = [i.id for i in self.all_issues]
        known_issues = "\n".join([f"- {id}" for id in known_ids])
        
        prompt = f"""
Find NEW issues in this codebase.

Platform: {self.platform_name}
Project: {self.project_path}

Already known issues (don't duplicate):
{known_issues}

Find 5-10 NEW issues:
- Missing error handling
- Inconsistent patterns
- Security issues
- UX problems
- Missing functionality

For each issue:
```json
{{
  "id": "ISSUE-XXX",
  "title": "Short title",
  "description": "What's wrong",
  "severity": "critical|high|medium|low",
  "category": "security|ux|performance|code_quality",
  "location": {{"file": "path/to/file"}},
  "suggested_fix": "How to fix"
}}
```

Be specific. Include file paths.
"""
        
        results = []
        
        async for message in query(prompt=prompt, options=options):
            if hasattr(message, 'content'):
                for block in message.content:
                    if hasattr(block, 'text'):
                        preview = block.text[-300:]
                        print(preview)
                        results.append(block.text)
        
        full_output = "\n".join(results)
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
        
        # Use the full agent's export
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
    
    parser = argparse.ArgumentParser(description="Working Cycle Agent with Batch Verification")
    parser.add_argument("--project", required=True)
    parser.add_argument("--platform", required=True)
    parser.add_argument("--mode", default="full")
    
    args = parser.parse_args()
    
    agent = WorkingCycleAgent(args.project, args.platform)
    await agent.run_cycle(mode=args.mode)


if __name__ == "__main__":
    asyncio.run(main())
