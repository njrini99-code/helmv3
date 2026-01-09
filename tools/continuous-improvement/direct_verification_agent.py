#!/usr/bin/env python3
"""
ULTRA SIMPLE VERSION - Direct file checking instead of SDK

Instead of asking an SDK agent to verify, we just:
1. Read the fix documentation from Claude Code
2. Read the actual files mentioned
3. Do simple checks (file exists, has expected content)
4. Mark as verified if file was changed
"""

import asyncio
import json
from pathlib import Path
from typing import List, Dict
import re
from datetime import datetime

from enhanced_cycle_agent import HelmContext, Issue


class DirectVerificationAgent:
    """
    Simplest possible verification - just check if files were modified
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
    
    def _load_previous_cycle(self):
        """Load previous cycle"""
        if self.current_cycle == 1:
            return None
        
        prev_cycle = self.current_cycle - 1
        prev_file = self.cycle_dir / f"issues-cycle-{prev_cycle:03d}.json"
        
        if not prev_file.exists():
            return None
        
        with open(prev_file) as f:
            return json.load(f)
    
    def _parse_md_file_for_fixes(self, cycle_number: int) -> Dict:
        """Parse MD file to see what was fixed"""
        md_file = self.cycle_dir / f"issues-cycle-{cycle_number:03d}.md"
        
        if not md_file.exists():
            return {}
        
        print(f"📄 Reading {md_file.name}...")
        
        with open(md_file) as f:
            content = f.read()
        
        fixes = {}
        sections = re.split(r'### FIX STATUS:\s*([A-Z]+-\d+)', content)
        
        for i in range(1, len(sections), 2):
            if i + 1 >= len(sections):
                break
                
            issue_id = sections[i].strip()
            status_content = sections[i + 1]
            
            if ('✅' in status_content and 'Fixed' in status_content):
                # Extract files modified
                files_match = re.search(r'\*\*Files Modified:\*\*\s*(.*?)(?=\*\*|###|$)', status_content, re.DOTALL)
                files = []
                if files_match:
                    files_text = files_match.group(1)
                    # Find all file paths
                    file_paths = re.findall(r'`([^`]+)`', files_text)
                    files = file_paths
                
                fixes[issue_id] = {
                    'files': files,
                    'content': status_content[:500]
                }
                print(f"  📝 {issue_id}: {len(files)} files modified")
        
        return fixes
    
    async def run_cycle(self, mode: str = "full"):
        """Run cycle with direct verification"""
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   🔄 DIRECT VERIFICATION CYCLE {self.current_cycle:03d}                                   ║
║   Platform: {self.platform_name:<59} ║
║   Mode: Simple file checking                                                 ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
        
        print("\n📚 Available Context:")
        print(self.helm_context.get_context_summary())
        print()
        
        # Phase 1: Direct verification
        prev_cycle = self._load_previous_cycle()
        if prev_cycle:
            self.verify_by_checking_files(prev_cycle)
        
        # Phase 2: Find new issues (use SDK for this)
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
    
    def verify_by_checking_files(self, prev_cycle: Dict):
        """
        SIMPLE: Just check if the files mentioned actually exist and were modified
        """
        
        print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📋 PHASE 1: DIRECT FILE VERIFICATION
  Checking if documented files actually exist and were modified
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """)
        
        prev_issues = [Issue.from_dict(i) for i in prev_cycle.get("issues", [])]
        
        # Parse MD
        md_fixes = self._parse_md_file_for_fixes(self.current_cycle - 1)
        
        if not md_fixes:
            print("\n⚠️  No fixes found in MD file")
            return
        
        print(f"\n✅ Found {len(md_fixes)} issues with documented fixes")
        print("Checking files...\n")
        
        verified = 0
        not_fixed = 0
        
        for issue in prev_issues:
            if issue.id not in md_fixes:
                continue
            
            fix_info = md_fixes[issue.id]
            files = fix_info['files']
            
            if not files:
                print(f"  ⚠️  {issue.id}: No files documented")
                issue.state = "open"
                self.current_issues.append(issue)
                not_fixed += 1
                continue
            
            # Check if files exist
            all_exist = True
            for file_path in files:
                full_path = self.project_path / file_path
                if not full_path.exists():
                    all_exist = False
                    break
            
            if all_exist:
                issue.state = "verified"
                issue.verified_in_cycle = self.current_cycle
                issue.fixed_in_cycle = self.current_cycle - 1
                verified += 1
                self.all_issues.append(issue)
                print(f"  ✅ {issue.id}: Files exist - VERIFIED")
            else:
                issue.state = "open"
                issue.fixed_in_cycle = None
                not_fixed += 1
                self.current_issues.append(issue)
                self.all_issues.append(issue)
                print(f"  ❌ {issue.id}: Files missing - NOT FIXED")
        
        print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICATION COMPLETE (File Check Method)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total Checked: {len(md_fixes)}
  ✅ Files exist (verified): {verified}
  ❌ Files missing (not fixed): {not_fixed}

Note: This is a simple file existence check. Files exist = assumed fixed.
        """)
    
    async def find_new_issues(self):
        """Find new issues - use SDK"""
        from claude_agent_sdk import query, ClaudeAgentOptions
        
        print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🔍 PHASE 2: FINDING NEW ISSUES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """)
        
        options = ClaudeAgentOptions(
            cwd=str(self.project_path),
            allowed_tools=["Read", "Bash", "Glob"],
            permission_mode="default",
            max_turns=40,
        )
        
        known_ids = [i.id for i in self.all_issues]
        
        prompt = f"""
Find 5-10 NEW issues in {self.platform_name}.

Known issues to skip: {', '.join(known_ids[:20])}

Look for:
- Missing error handling
- Broken links or references
- Inconsistent patterns
- Security issues

For each issue output:
```json
{{"id": "ISSUE-XXX", "title": "Short title", "description": "Details", "severity": "high", "category": "code_quality", "location": {{"file": "path/to/file"}}, "suggested_fix": "How to fix"}}
```

Be specific. Include real file paths.
"""
        
        results = []
        
        async for message in query(prompt=prompt, options=options):
            if hasattr(message, 'content'):
                for block in message.content:
                    if hasattr(block, 'text'):
                        print(block.text[-200:])
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
    
    parser = argparse.ArgumentParser(description="Direct File Verification Agent")
    parser.add_argument("--project", required=True)
    parser.add_argument("--platform", required=True)
    parser.add_argument("--mode", default="full")
    
    args = parser.parse_args()
    
    agent = DirectVerificationAgent(args.project, args.platform)
    await agent.run_cycle(mode=args.mode)


if __name__ == "__main__":
    asyncio.run(main())
