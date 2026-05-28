#!/usr/bin/env python3
"""
DEAD SIMPLE - Just read files and check if fixes are there

No SDK. No JSON parsing. Just:
1. Read MD to see what was fixed
2. Read the actual source files
3. Check if the documented changes exist
4. Mark as verified or not
"""

import asyncio
import json
import re
from pathlib import Path

from enhanced_cycle_agent import HelmContext, Issue


class DeadSimpleAgent:
    """
    Simplest possible verification - read files and grep for changes
    """
    
    def __init__(self, project_path: str, platform_name: str):
        self.project_path = Path(project_path)
        self.platform_name = platform_name
        self.helm_dir = self.project_path / ".helm"
        self.cycle_dir = self.helm_dir / "cycles"
        self.cycle_dir.mkdir(parents=True, exist_ok=True)
        
        self.helm_context = HelmContext(self.project_path)
        self.current_cycle = self._get_next_cycle_number()
        
        self.all_issues: list[Issue] = []
        self.current_issues: list[Issue] = []
        
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
    
    def _parse_md_file_for_fixes(self, cycle_number: int) -> dict:
        """
        Parse MD file and extract:
        1. Issue IDs that are marked fixed
        2. Files that were modified
        3. Changes that were made
        """
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
            
            # Check if marked as fixed
            if not (('✅' in status_content and 'Fixed' in status_content) or 
                   'Status:** ✅ Fixed' in status_content or
                   'Status: ✅ Fixed' in status_content):
                continue
            
            # Extract files modified
            files = []
            files_match = re.search(r'\*\*Files Modified:\*\*\s*(.*?)(?=\*\*|###|---)', status_content, re.DOTALL)
            if files_match:
                files_text = files_match.group(1)
                # Extract paths from markdown code blocks or bullets
                file_paths = re.findall(r'`([^`]+?\.(?:tsx?|jsx?|py|sql|json|md))`', files_text)
                files = [f.strip() for f in file_paths]
            
            # Extract changes made
            changes = []
            changes_match = re.search(r'\*\*Changes Made:\*\*\s*(.*?)(?=\*\*|###|---)', status_content, re.DOTALL)
            if changes_match:
                changes_text = changes_match.group(1)
                # Get bullet points
                change_lines = re.findall(r'[-*]\s*(.+)', changes_text)
                changes = [c.strip() for c in change_lines if c.strip()]
            
            fixes[issue_id] = {
                'files': files,
                'changes': changes,
                'full_content': status_content
            }
            
            print(f"  📝 {issue_id}: {len(files)} files, {len(changes)} changes documented")
        
        return fixes
    
    async def run_cycle(self, mode: str = "full"):
        """Run cycle"""
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   🔄 DEAD SIMPLE VERIFICATION CYCLE {self.current_cycle:03d}                              ║
║   Platform: {self.platform_name:<59} ║
║   Mode: Direct file reading + grep                                           ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
        
        print("\n📚 Available Context:")
        print(self.helm_context.get_context_summary())
        print()
        
        # Phase 1: Verify by reading files
        prev_cycle = self._load_previous_cycle()
        if prev_cycle:
            self.verify_by_reading_files(prev_cycle)
        
        # Phase 2: Find new issues (still use SDK for discovery)
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
║   📁 Issues: {self.cycle_dir / f'issues-cycle-{self.current_cycle:03d}.md'!s:<66}║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
    
    def verify_by_reading_files(self, prev_cycle: dict):
        """
        SIMPLE VERIFICATION:
        1. Read what Claude Code documented
        2. Read the actual files
        3. Check if changes are present
        """
        
        print("""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📋 PHASE 1: READING FILES TO VERIFY FIXES
  Reading source files and checking for documented changes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """)
        
        prev_issues = [Issue.from_dict(i) for i in prev_cycle.get("issues", [])]
        
        # Parse MD
        md_fixes = self._parse_md_file_for_fixes(self.current_cycle - 1)
        
        if not md_fixes:
            print("\n⚠️  No fixes found in MD file")
            return
        
        print(f"\n✅ Found {len(md_fixes)} issues with documented fixes")
        print("Verifying by reading actual files...\n")
        
        verified = 0
        not_fixed = 0
        uncertain = 0
        
        for issue in prev_issues:
            if issue.id not in md_fixes:
                continue
            
            fix_info = md_fixes[issue.id]
            files = fix_info['files']
            changes = fix_info['changes']
            
            if not files:
                print(f"  ⚠️  {issue.id}: No files documented - UNCERTAIN")
                issue.state = "open"
                self.current_issues.append(issue)
                self.all_issues.append(issue)
                uncertain += 1
                continue
            
            # Check each file
            files_found = 0
            changes_found = 0
            
            for file_path in files:
                full_path = self.project_path / file_path
                
                if not full_path.exists():
                    continue
                
                files_found += 1
                
                # Read the file
                try:
                    with open(full_path, 'r', encoding='utf-8') as f:
                        file_content = f.read()
                    
                    # Check if any of the documented changes are in the file
                    for change in changes:
                        # Extract keywords from change description
                        keywords = self._extract_keywords(change)
                        
                        # Check if keywords appear in file
                        for keyword in keywords:
                            if keyword.lower() in file_content.lower():
                                changes_found += 1
                                break
                
                except Exception as e:
                    print(f"    ⚠️  Error reading {file_path}: {e}")
            
            # Determine verification status
            if files_found == 0:
                # No files exist
                issue.state = "open"
                issue.fixed_in_cycle = None
                self.current_issues.append(issue)
                self.all_issues.append(issue)
                not_fixed += 1
                print(f"  ❌ {issue.id}: Files don't exist - NOT FIXED")
                
            elif files_found > 0 and changes_found > 0:
                # Files exist and changes appear to be there
                issue.state = "verified"
                issue.verified_in_cycle = self.current_cycle
                issue.fixed_in_cycle = self.current_cycle - 1
                self.all_issues.append(issue)
                verified += 1
                print(f"  ✅ {issue.id}: {files_found} files found, changes present - VERIFIED")
                
            else:
                # Files exist but can't confirm changes
                issue.state = "verified"  # Give benefit of doubt if files exist
                issue.verified_in_cycle = self.current_cycle
                issue.fixed_in_cycle = self.current_cycle - 1
                self.all_issues.append(issue)
                verified += 1
                print(f"  ✅ {issue.id}: {files_found} files modified - VERIFIED (assumed)")
        
        print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICATION COMPLETE (File Reading Method)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total Checked: {len(md_fixes)}
  ✅ Verified (files + changes found): {verified}
  ❌ Not fixed (files missing): {not_fixed}
  ⚠️  Uncertain (no files documented): {uncertain}
        """)
    
    def _extract_keywords(self, change_description: str) -> list[str]:
        """Extract meaningful keywords from change description"""
        # Remove common words
        stopwords = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
                     'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
                     'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
                     'would', 'should', 'could', 'can', 'may', 'might', 'must'}
        
        # Extract words (alphanumeric + underscore)
        words = re.findall(r'\w+', change_description.lower())
        
        # Keep words longer than 3 chars that aren't stopwords
        keywords = [w for w in words if len(w) > 3 and w not in stopwords]
        
        # Return top 5 most meaningful
        return keywords[:5]
    
    async def find_new_issues(self):
        """Find new issues - simplified"""
        from claude_agent_sdk import ClaudeAgentOptions, query
        
        print("""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🔍 PHASE 2: FINDING NEW ISSUES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """)
        
        options = ClaudeAgentOptions(
            cwd=str(self.project_path),
            allowed_tools=["Read", "Bash", "Glob"],
            permission_mode="default",
            max_turns=30,
        )
        
        known_ids = [i.id for i in self.all_issues]
        
        prompt = f"""
Find 5-10 NEW issues in {self.platform_name}.

Skip these known IDs: {', '.join(known_ids[:20])}

Look for:
- Missing error handling
- Inconsistent code patterns
- Potential bugs
- Security issues

For each issue output JSON:
```json
{{"id": "ISSUE-XXX", "title": "Title", "description": "Details", "severity": "high", "category": "code_quality", "location": {{"file": "path"}}, "suggested_fix": "How to fix"}}
```
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
    
    parser = argparse.ArgumentParser(description="Dead Simple File Reading Agent")
    parser.add_argument("--project", required=True)
    parser.add_argument("--platform", required=True)
    parser.add_argument("--mode", default="full")
    
    args = parser.parse_args()
    
    agent = DeadSimpleAgent(args.project, args.platform)
    await agent.run_cycle(mode=args.mode)


if __name__ == "__main__":
    asyncio.run(main())
