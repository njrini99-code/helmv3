#!/usr/bin/env python3
"""
Helm Intelligence - Enhanced Cycle Agent with Full Context Loading + MD Parsing

FIXED: Now reads MD file to see what Claude Code documented!

Key improvement: The agent now parses the issues-cycle-XXX.md file to see which
issues Claude Code marked as "✅ Fixed" in the FIX STATUS sections, then verifies
those fixes by actually reading the code.

This creates the proper closed-loop: MD file → verification → next cycle.
"""

import asyncio
import json
import re
from datetime import datetime
from pathlib import Path


class HelmContext:
    """
    Loads and manages ALL context from overnight analysis
    """
    
    def __init__(self, project_path: Path):
        self.project_path = project_path
        self.helm_dir = project_path / ".helm"
        
        # Load all context files
        self.understanding = self._load_json("UNDERSTANDING.json")
        self.essay = self._load_text("HELM_ESSAY.md")
        self.actions = self._load_text("ACTIONS.md")
        self.issues = self._load_text("ISSUES.md")
        self.rls_audit = self._load_text("security/RLS_AUDIT.md")
        
    def _load_json(self, filename: str) -> dict:
        """Load JSON file if it exists"""
        filepath = self.helm_dir / filename
        if filepath.exists():
            with open(filepath) as f:
                return json.load(f)
        return {}
    
    def _load_text(self, filename: str) -> str:
        """Load text file if it exists"""
        filepath = self.helm_dir / filename
        if filepath.exists():
            with open(filepath) as f:
                return f.read()
        return ""
    
    def has_context(self) -> bool:
        """Check if any context files exist"""
        return bool(self.understanding or self.essay or self.actions)
    
    def get_context_summary(self) -> str:
        """Get a summary of available context"""
        summary = []
        
        if self.understanding:
            features = self.understanding.get("features", [])
            summary.append(f"✅ UNDERSTANDING.json - {len(features)} features documented")
        
        if self.essay:
            word_count = len(self.essay.split())
            summary.append(f"✅ HELM_ESSAY.md - {word_count} words of technical documentation")
        
        if self.actions:
            action_count = len([line for line in self.actions.split('\n') if line.strip().startswith('- [ ]')])
            summary.append(f"✅ ACTIONS.md - {action_count} prioritized action items")
        
        if self.issues:
            issue_count = len([line for line in self.issues.split('\n') if line.strip().startswith('###')])
            summary.append(f"✅ ISSUES.md - {issue_count} detailed issues")
        
        if self.rls_audit:
            summary.append("✅ security/RLS_AUDIT.md - Security audit available")
        
        if not summary:
            summary.append("⚠️  No overnight analysis context found")
            summary.append("   Run: python overnight.py --project PATH --name PLATFORM")
        
        return "\n".join(summary)
    
    def get_full_context_for_prompt(self) -> str:
        """
        Get comprehensive context formatted for Claude prompts
        """
        context_parts = []
        
        # 1. Structured Understanding
        if self.understanding:
            context_parts.append("# APPLICATION UNDERSTANDING\n")
            context_parts.append("```json\n" + json.dumps(self.understanding, indent=2)[:10000] + "\n```\n")
        
        # 2. Technical Essay (key sections)
        if self.essay:
            context_parts.append("\n# TECHNICAL DOCUMENTATION (EXCERPT)\n")
            # Get first 5000 chars as summary
            context_parts.append(self.essay[:5000])
            if len(self.essay) > 5000:
                context_parts.append("\n[...essay continues, see HELM_ESSAY.md for full documentation...]")
        
        # 3. Known Issues (to avoid duplicates)
        if self.issues:
            context_parts.append("\n# KNOWN ISSUES (DO NOT DUPLICATE THESE)\n")
            context_parts.append(self.issues[:3000])
        
        # 4. Priority Actions
        if self.actions:
            context_parts.append("\n# PRIORITIZED ACTIONS\n")
            context_parts.append(self.actions[:2000])
        
        # 5. Security Findings
        if self.rls_audit:
            context_parts.append("\n# SECURITY AUDIT FINDINGS\n")
            context_parts.append(self.rls_audit[:2000])
        
        return "\n".join(context_parts)
    
    def get_known_issue_ids(self) -> list[str]:
        """Extract issue IDs from ISSUES.md to avoid duplicates"""
        if not self.issues:
            return []
        
        # Extract issue IDs like "ISSUE-001", "BUG-123", "SEC-042"
        pattern = r'\b([A-Z]+-\d+)\b'
        matches = re.findall(pattern, self.issues)
        return list(set(matches))


class Issue:
    """Single issue with state tracking"""
    
    def __init__(self, 
                 id: str,
                 title: str,
                 description: str,
                 severity: str,
                 category: str,
                 location: dict,
                 found_in_cycle: int,
                 source: str = "cycle_analysis",
                 context: dict = None):
        self.id = id
        self.title = title
        self.description = description
        self.severity = severity
        self.category = category
        self.location = location
        self.found_in_cycle = found_in_cycle
        self.source = source
        self.context = context or {}
        
        # State tracking
        self.state = "open"
        self.fix_details = None
        self.fixed_in_cycle = None
        self.verified_in_cycle = None
        self.regression_of = None
        
    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "severity": self.severity,
            "category": self.category,
            "location": self.location,
            "found_in_cycle": self.found_in_cycle,
            "source": self.source,
            "state": self.state,
            "fix_details": self.fix_details,
            "fixed_in_cycle": self.fixed_in_cycle,
            "verified_in_cycle": self.verified_in_cycle,
            "regression_of": self.regression_of,
            "context": self.context
        }
    
    @classmethod
    def from_dict(cls, data: dict):
        issue = cls(
            id=data["id"],
            title=data["title"],
            description=data["description"],
            severity=data["severity"],
            category=data["category"],
            location=data["location"],
            found_in_cycle=data["found_in_cycle"],
            source=data.get("source", "cycle_analysis"),
            context=data.get("context", {})
        )
        issue.state = data.get("state", "open")
        issue.fix_details = data.get("fix_details")
        issue.fixed_in_cycle = data.get("fixed_in_cycle")
        issue.verified_in_cycle = data.get("verified_in_cycle")
        issue.regression_of = data.get("regression_of")
        return issue


class EnhancedCycleAgent:
    """
    Enhanced cycle agent that uses FULL overnight analysis context
    AND parses MD files to see what Claude Code documented
    """
    
    def __init__(self, project_path: str, platform_name: str):
        self.project_path = Path(project_path)
        self.platform_name = platform_name
        self.helm_dir = self.project_path / ".helm"
        self.cycle_dir = self.helm_dir / "cycles"
        self.cycle_dir.mkdir(parents=True, exist_ok=True)
        
        # Load FULL context from overnight analysis
        self.helm_context = HelmContext(self.project_path)
        
        self.current_cycle = self._get_next_cycle_number()
        
        # Issue tracking
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
    
    def _load_previous_cycle(self) -> dict | None:
        """Load the previous cycle's issues"""
        if self.current_cycle == 1:
            return None
        
        prev_cycle = self.current_cycle - 1
        prev_file = self.cycle_dir / f"issues-cycle-{prev_cycle:03d}.json"
        
        if not prev_file.exists():
            return None
        
        with open(prev_file) as f:
            return json.load(f)
    
    def _parse_md_file_for_fixes(self, cycle_number: int) -> dict[str, str]:
        """
        🔧 NEW: Parse the MD file to see which issues Claude Code claimed to fix.
        
        This is the KEY fix - we read the actual MD file that Claude Code updated
        to see which issues are marked as "✅ Fixed" in their FIX STATUS sections.
        
        Returns: {issue_id: fix_documentation}
        """
        md_file = self.cycle_dir / f"issues-cycle-{cycle_number:03d}.md"
        
        if not md_file.exists():
            return {}
        
        print(f"📄 Reading {md_file.name} to find documented fixes...")
        
        with open(md_file) as f:
            content = f.read()
        
        # Find all FIX STATUS sections
        fixes = {}
        
        # Split by FIX STATUS sections: ### FIX STATUS: ISSUE-XXX
        sections = re.split(r'### FIX STATUS:\s*([A-Z]+-\d+)', content)
        
        for i in range(1, len(sections), 2):
            if i + 1 >= len(sections):
                break
                
            issue_id = sections[i].strip()
            status_content = sections[i + 1]
            
            # Look for Status line with checkmark or "Fixed"
            # Matches: **Status:** ✅ Fixed, Status: ✅ Fixed, **Status:** Fixed, etc.
            if ('✅' in status_content and 'Fixed' in status_content) or \
               ('**Status:** Fixed' in status_content) or \
               ('Status: Fixed' in status_content):
                # Extract fix details for verification (first 2000 chars)
                fixes[issue_id] = status_content[:2000]
                print(f"  📝 {issue_id}: Marked as ✅ Fixed by Claude Code")
        
        return fixes
    
    async def run_cycle(self, mode: str = "full"):
        """Run a complete improvement cycle with FULL context"""
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   🔄 ENHANCED CONTINUOUS IMPROVEMENT CYCLE {self.current_cycle:03d}                       ║
║   Platform: {self.platform_name:<59} ║
║   Mode: {mode:<66} ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
        
        # Show available context
        print("\n📚 Available Context:")
        print(self.helm_context.get_context_summary())
        print()
        
        if not self.helm_context.has_context():
            print("⚠️  WARNING: No overnight analysis context found!")
            print("   For best results, run overnight.py first.")
            print()
            proceed = input("Continue anyway? (y/n) ")
            if proceed.lower() != 'y':
                print("Cancelled. Run overnight.py first for better results.")
                return
        
        # Phase 1: Load previous cycle and verify fixes
        prev_cycle = self._load_previous_cycle()
        if prev_cycle:
            await self.verify_previous_fixes(prev_cycle)
        
        # Phase 2: Import issues from overnight analysis (cycle 1 only)
        if self.current_cycle == 1 and self.helm_context.has_context():
            await self.import_overnight_issues()
        
        # Phase 3: Find new issues (context-aware)
        if mode in ["full", "analyze"]:
            await self.find_new_issues()
        
        # Phase 4: Export issue list
        await self.export_issues()
        
        # Phase 5: Generate summary
        self.generate_summary()
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   ✅ CYCLE {self.current_cycle:03d} COMPLETE                                            ║
║                                                                              ║
║   📁 Issues exported to:                                                     ║
║   {self.cycle_dir / f'issues-cycle-{self.current_cycle:03d}.md'!s:<75}║
║                                                                              ║
║   📋 Next Steps:                                                             ║
║   1. Open the MD file in Cursor                                              ║
║   2. Tell Claude Code: "Fix all issues in this file"                         ║
║   3. Claude Code will fix + document changes in the MD                       ║
║   4. Run cycle {self.current_cycle + 1:03d} to verify fixes                                    ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
    
    async def import_overnight_issues(self):
        """
        Import issues from overnight analysis (ACTIONS.md, ISSUES.md, RLS_AUDIT.md)
        Only on cycle 1 - these become the initial issues to fix
        """
        print("""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📋 IMPORTING ISSUES FROM OVERNIGHT ANALYSIS
  These will become your initial issues to fix...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """)
        
        from claude_agent_sdk import ClaudeAgentOptions, query
        
        options = ClaudeAgentOptions(
            cwd=str(self.project_path),
            allowed_tools=["Read", "Bash", "Glob", "LS"],
            permission_mode="default",
            max_turns=20,
        )
        
        prompt = """
You are importing issues from overnight analysis into the continuous improvement system.

Read these files:
- .helm/ACTIONS.md (prioritized action items)
- .helm/ISSUES.md (detailed issue descriptions)
- .helm/security/RLS_AUDIT.md (security findings)

Extract ALL issues and convert them to this standardized format:

```json
{
  "id": "ISSUE-XXX" or original ID,
  "title": "Short title",
  "description": "Detailed description",
  "severity": "critical|high|medium|low",
  "category": "security|ux|performance|accessibility|code_quality",
  "location": {
    "file": "path/to/file",
    "line": 42
  },
  "source": "overnight_actions" or "overnight_issues" or "rls_audit",
  "context": {
    "original_priority": "if from ACTIONS.md",
    "vulnerability_type": "if from RLS_AUDIT.md",
    "suggested_fix": "any fix suggestions"
  }
}
```

For each issue in the files, create one JSON block.
These will become the initial issues for the cycle system to track.
"""
        
        import_results = []
        
        async for message in query(prompt=prompt, options=options):
            if hasattr(message, 'content'):
                for block in message.content:
                    if hasattr(block, 'text'):
                        print(block.text[-500:] if len(block.text) > 500 else block.text)
                        import_results.append(block.text)
        
        # Parse imported issues
        full_output = "\n".join(import_results)
        self._parse_imported_issues(full_output)
    
    def _parse_imported_issues(self, output: str):
        """Parse issues imported from overnight analysis"""
        json_pattern = r'```json\s*(.*?)\s*```'
        matches = re.findall(json_pattern, output, re.DOTALL)
        
        imported_count = 0
        
        for match in matches:
            try:
                data = json.loads(match)
                
                issue = Issue(
                    id=data.get("id", f"IMPORT-{imported_count + 1:03d}"),
                    title=data.get("title", "Imported issue"),
                    description=data.get("description", ""),
                    severity=data.get("severity", "medium"),
                    category=data.get("category", "other"),
                    location=data.get("location", {}),
                    found_in_cycle=self.current_cycle,
                    source=data.get("source", "overnight_import"),
                    context=data.get("context", {})
                )
                
                self.current_issues.append(issue)
                self.all_issues.append(issue)
                imported_count += 1
                
                print(f"  📥 Imported: {issue.id} - {issue.title}")
                
            except json.JSONDecodeError:
                continue
        
        print(f"\n✅ Imported {imported_count} issues from overnight analysis")
    
    async def verify_previous_fixes(self, prev_cycle: dict):
        """
        🔧 FIXED: Verify that previous fixes actually worked
        
        Now reads the MD file FIRST to see what Claude Code documented!
        """
        from claude_agent_sdk import ClaudeAgentOptions, query
        
        print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📋 PHASE 1: VERIFYING PREVIOUS FIXES
  Checking if fixes from cycle {self.current_cycle - 1:03d} actually worked...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """)
        
        # Load previous issues from JSON
        prev_issues = [Issue.from_dict(i) for i in prev_cycle.get("issues", [])]
        
        # 🔧 NEW: Parse MD file to see what Claude Code claimed to fix
        md_fixes = self._parse_md_file_for_fixes(self.current_cycle - 1)
        
        if not md_fixes:
            print("\n⚠️  No fixed issues found in MD file")
            print("   Claude Code needs to update FIX STATUS sections with '✅ Fixed'")
            print("   Or no fixes were made yet.")
            return
        
        print(f"\n✅ Found {len(md_fixes)} issues marked as fixed in MD file")
        print("Now verifying each one by reading the actual code...\n")
        
        # Update issue states based on MD file
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
        
        options = ClaudeAgentOptions(
            cwd=str(self.project_path),
            allowed_tools=["Read", "Bash", "Glob", "Grep", "LS"],
            permission_mode="default",
            max_turns=30,
        )
        
        # Build verification context
        issues_summary = "\n\n".join([
            f"ISSUE {i.id}: {i.title}\n"
            f"Location: {i.location.get('file', 'unknown')}\n"
            f"Fix Details: {i.fix_details[:500]}...\n"
            f"Original Problem: {i.description}"
            for i in fixed_issues
        ])
        
        # Include context about what the app should do
        helm_context = self.helm_context.get_full_context_for_prompt()
        
        prompt = f"""
You are verifying that previously fixed issues are ACTUALLY fixed.

{helm_context}

Platform: {self.platform_name}
Project: {self.project_path}
Cycle: {self.current_cycle} (verifying fixes from cycle {self.current_cycle - 1})

Claude Code claimed these issues were fixed:

{issues_summary}

Your job is to verify EACH issue:

1. Read the file mentioned in the issue
2. Check if the fix described was actually applied
3. Compare against the application understanding to verify it's correct
4. Test if the issue is truly resolved (not just partially)
5. Look for any regressions caused by the fix

For EACH issue, respond with:
```json
{{
  "issue_id": "ISSUE-XXX",
  "verified": true/false,
  "status": "verified" | "not_fixed" | "regression_found",
  "evidence": "What you found in the code",
  "regression_details": "If regression found, describe it",
  "new_issue_id": "If regression, suggest new issue ID"
}}
```

Be thorough. Actually READ the files. Don't assume fixes worked.
Use the application context to understand if fixes are complete.
"""
        
        verification_results = []
        
        async for message in query(prompt=prompt, options=options):
            if hasattr(message, 'content'):
                for block in message.content:
                    if hasattr(block, 'text'):
                        print(block.text)
                        verification_results.append(block.text)
        
        full_output = "\n".join(verification_results)
        self._process_verification_results(full_output, fixed_issues)
    
    def _process_verification_results(self, output: str, fixed_issues: list[Issue]):
        """Process verification results from Claude"""
        json_pattern = r'```json\s*(.*?)\s*```'
        matches = re.findall(json_pattern, output, re.DOTALL)
        
        verified_count = 0
        not_fixed_count = 0
        regression_count = 0
        
        for match in matches:
            try:
                result = json.loads(match)
                issue_id = result.get("issue_id")
                
                issue = next((i for i in fixed_issues if i.id == issue_id), None)
                if not issue:
                    continue
                
                status = result.get("status")
                
                if status == "verified":
                    issue.state = "verified"
                    issue.verified_in_cycle = self.current_cycle
                    verified_count += 1
                    print(f"  ✅ {issue_id}: Verified fixed")
                
                elif status == "not_fixed":
                    issue.state = "open"
                    issue.fixed_in_cycle = None
                    issue.fix_details = None
                    not_fixed_count += 1
                    print(f"  ❌ {issue_id}: NOT actually fixed - reopening")
                
                elif status == "regression_found":
                    regression = Issue(
                        id=result.get("new_issue_id", f"REG-{issue_id}"),
                        title=f"Regression from fix of {issue_id}",
                        description=result.get("regression_details", "Fix caused new issue"),
                        severity="high",
                        category="regression",
                        location=issue.location,
                        found_in_cycle=self.current_cycle,
                        source="regression_detection"
                    )
                    regression.regression_of = issue_id
                    self.current_issues.append(regression)
                    regression_count += 1
                    print(f"  ⚠️  {issue_id}: Caused regression - created {regression.id}")
                
                self.all_issues.append(issue)
                
                if status != "verified":
                    self.current_issues.append(issue)
                    
            except json.JSONDecodeError:
                continue
        
        print(f"""
Verification Summary:
  ✅ Verified fixed: {verified_count}
  ❌ Not actually fixed: {not_fixed_count}
  ⚠️  Regressions found: {regression_count}
        """)
    
    async def find_new_issues(self):
        """Find new issues using FULL context from overnight analysis"""
        from claude_agent_sdk import ClaudeAgentOptions, query
        
        print("""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🔍 PHASE 2: CONTEXT-AWARE ISSUE DETECTION
  Using deep understanding + overnight analysis to find issues...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """)
        
        options = ClaudeAgentOptions(
            cwd=str(self.project_path),
            allowed_tools=["Read", "Bash", "Glob", "Grep", "LS"],
            permission_mode="default",
            max_turns=60,
        )
        
        # Get FULL context
        helm_context = self.helm_context.get_full_context_for_prompt()
        
        # Get known issue IDs to avoid duplicates
        known_ids = self.helm_context.get_known_issue_ids()
        known_ids.extend([i.id for i in self.all_issues])
        known_issues = "\n".join([f"- {id}" for id in known_ids])
        
        prompt = f"""
You are performing cycle {self.current_cycle} of continuous improvement analysis.

Platform: {self.platform_name}
Project: {self.project_path}

You have COMPREHENSIVE context about this application:

{helm_context}

Known issues (DO NOT DUPLICATE):
{known_issues}

Your job is to find NEW issues by:

1. **Testing Expected Features** - Based on context, test if features work as expected
2. **Checking Consistency** - Are similar things done similarly?
3. **Finding Gaps** - Is functionality missing that should exist based on the docs?
4. **Detecting Anti-patterns** - Code that works but shouldn't be done that way
5. **Security Review** - Compare against RLS audit findings
6. **UX Issues** - Based on feature descriptions, find UX problems
7. **Performance** - Unnecessary slowness
8. **Accessibility** - Missing a11y features
9. **Cross-referencing** - Issues mentioned in ACTIONS.md or ISSUES.md but not yet fixed

Be HIGHLY context-aware:
- If HELM_ESSAY.md says a feature should have pagination, verify it does
- If UNDERSTANDING.json lists user roles, check access control
- If ACTIONS.md prioritizes something, check if it's done
- If RLS_AUDIT.md found vulnerabilities, check if they're fixed

For EACH issue found, output:
```json
{{
  "id": "ISSUE-XXX" (use next available number),
  "title": "Short title",
  "description": "Detailed description of the problem",
  "severity": "critical|high|medium|low",
  "category": "security|ux|performance|accessibility|code_quality|data_integrity",
  "location": {{
    "file": "path/to/file",
    "line": 42,
    "function": "functionName"
  }},
  "evidence": "What you found that proves this is an issue",
  "expected_behavior": "What should happen (based on context)",
  "actual_behavior": "What actually happens",
  "user_impact": "How this affects users",
  "suggested_fix": "How to fix it",
  "context_reference": "Which context doc mentions this (HELM_ESSAY.md, ACTIONS.md, etc.)"
}}
```

Start your investigation now. Be thorough. Find 5-15 real, actionable issues.
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
        """Parse newly found issues from Claude's output"""
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
                    title=data.get("title", "Unknown issue"),
                    description=data.get("description", ""),
                    severity=data.get("severity", "medium"),
                    category=data.get("category", "other"),
                    location=data.get("location", {}),
                    found_in_cycle=self.current_cycle,
                    source="cycle_analysis",
                    context={
                        "evidence": data.get("evidence"),
                        "expected_behavior": data.get("expected_behavior"),
                        "actual_behavior": data.get("actual_behavior"),
                        "user_impact": data.get("user_impact"),
                        "suggested_fix": data.get("suggested_fix"),
                        "context_reference": data.get("context_reference")
                    }
                )
                
                self.current_issues.append(issue)
                self.all_issues.append(issue)
                new_count += 1
                
                print(f"  🆕 Found: {issue.id} - {issue.title}")
                
            except json.JSONDecodeError:
                continue
        
        print(f"\n✅ Found {new_count} new issues")
    
    async def export_issues(self):
        """Export issues to MD file for Claude Code"""
        
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        sorted_issues = sorted(
            self.current_issues,
            key=lambda i: (severity_order.get(i.severity, 999), i.id)
        )
        
        md_content = self._generate_issues_md(sorted_issues)
        
        md_file = self.cycle_dir / f"issues-cycle-{self.current_cycle:03d}.md"
        with open(md_file, "w") as f:
            f.write(md_content)
        
        json_file = self.cycle_dir / f"issues-cycle-{self.current_cycle:03d}.json"
        with open(json_file, "w") as f:
            json.dump({
                "cycle": self.current_cycle,
                "timestamp": datetime.now().isoformat(),
                "platform": self.platform_name,
                "issues": [i.to_dict() for i in sorted_issues]
            }, f, indent=2)
        
        print(f"\n✅ Exported {len(sorted_issues)} issues")
        print(f"   MD: {md_file}")
        print(f"   JSON: {json_file}")
    
    def _generate_issues_md(self, issues: list[Issue]) -> str:
        """Generate the MD file that Claude Code will update"""
        
        critical = len([i for i in issues if i.severity == "critical"])
        high = len([i for i in issues if i.severity == "high"])
        medium = len([i for i in issues if i.severity == "medium"])
        low = len([i for i in issues if i.severity == "low"])
        
        md = f"""# Improvement Cycle {self.current_cycle:03d} - {self.platform_name}

> 🤖 Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
> 📊 Total Issues: {len(issues)}
> 🔴 Critical: {critical} | 🟠 High: {high} | 🟡 Medium: {medium} | 🟢 Low: {low}

> 📚 **Context Available:**
> {self.helm_context.get_context_summary().replace(chr(10), chr(10) + '> ')}

---

## 📋 Instructions for Claude Code

This file contains issues for you to fix. For EACH issue:

1. **Read the issue details carefully**
2. **Consult the context files** mentioned above for full understanding
3. **Fix the code** according to the suggested fix
4. **Update this file** in the "FIX STATUS" section with:
   - Status: ✅ Fixed
   - Changes Made: [what you changed]
   - Files Modified: [which files]
   - Testing: [how you verified]
   - Context Used: [which docs you referenced]

**IMPORTANT:** Always update the FIX STATUS section with "Status: ✅ Fixed" when you complete each fix.
This is how the cycle agent knows to verify your work in the next cycle.

**Before fixing, read these context files:**
```bash
# Full application understanding
cat .helm/UNDERSTANDING.json
cat .helm/HELM_ESSAY.md

# Known issues and priorities
cat .helm/ACTIONS.md
cat .helm/ISSUES.md

# Security context
cat .helm/security/RLS_AUDIT.md
```

**Format for documenting your fix:**
```markdown
### FIX STATUS: [Issue ID]

**Status:** ✅ Fixed

**Changes Made:**
- Added loading state to dashboard
- Implemented skeleton UI during data fetch

**Files Modified:**
- `src/app/dashboard/page.tsx` - Added isLoading state
- `src/components/loading-skeleton.tsx` - Created new component

**Testing:**
- Tested with slow 3G network simulation
- Verified skeleton appears before data loads
- Confirmed smooth transition to actual content

**Context Used:**
- Followed patterns from HELM_ESSAY.md section on loading states
- Aligned with ACTIONS.md priority #3

**Notes:**
- Used existing design system patterns
- Added loading prop to maintain consistency
```

---

## 🔴 Critical Issues

"""
        
        for severity, emoji in [("critical", "🔴"), ("high", "🟠"), 
                                ("medium", "🟡"), ("low", "🟢")]:
            
            severity_issues = [i for i in issues if i.severity == severity]
            if not severity_issues:
                continue
            
            if severity != "critical":
                md += f"\n## {emoji} {severity.title()} Issues\n\n"
            
            for issue in severity_issues:
                md += f"""
### {issue.id}: {issue.title}

> **Severity:** {emoji} {severity.title()}  
> **Category:** {issue.category}  
> **Source:** {issue.source}  
> **Found in Cycle:** {issue.found_in_cycle}

**Problem:**
{issue.description}

**Location:**
- File: `{issue.location.get('file', 'unknown')}`
"""
                
                if issue.location.get('line'):
                    md += f"- Line: {issue.location['line']}\n"
                if issue.location.get('function'):
                    md += f"- Function: `{issue.location['function']}`\n"
                
                if issue.context.get('evidence'):
                    md += f"\n**Evidence:**\n{issue.context['evidence']}\n"
                
                if issue.context.get('expected_behavior'):
                    md += f"\n**Expected Behavior:**\n{issue.context['expected_behavior']}\n"
                
                if issue.context.get('actual_behavior'):
                    md += f"\n**Actual Behavior:**\n{issue.context['actual_behavior']}\n"
                
                if issue.context.get('user_impact'):
                    md += f"\n**User Impact:**\n{issue.context['user_impact']}\n"
                
                if issue.context.get('suggested_fix'):
                    md += f"\n**Suggested Fix:**\n{issue.context['suggested_fix']}\n"
                
                if issue.context.get('context_reference'):
                    md += f"\n**Context Reference:**\n{issue.context['context_reference']}\n"
                
                md += f"""
---

### FIX STATUS: {issue.id}

<!-- Claude Code: Document your fix here -->

**Status:** ⏳ Not Started

**Changes Made:**
<!-- Describe what you changed -->

**Files Modified:**
<!-- List all files you modified -->

**Testing:**
<!-- How did you verify the fix? -->

**Context Used:**
<!-- Which context files did you reference? -->

**Notes:**
<!-- Any concerns, limitations, or follow-up needed -->

---

"""
        
        return md
    
    def generate_summary(self):
        """Generate a summary of this cycle"""
        
        stats = {
            "cycle": self.current_cycle,
            "total_issues": len(self.current_issues),
            "by_severity": {
                "critical": len([i for i in self.current_issues if i.severity == "critical"]),
                "high": len([i for i in self.current_issues if i.severity == "high"]),
                "medium": len([i for i in self.current_issues if i.severity == "medium"]),
                "low": len([i for i in self.current_issues if i.severity == "low"]),
            },
            "by_source": {},
            "by_category": {},
            "verified_from_previous": len([i for i in self.all_issues if i.verified_in_cycle == self.current_cycle]),
            "regressions_found": len([i for i in self.current_issues if i.category == "regression"]),
            "new_issues_found": len([i for i in self.current_issues if i.found_in_cycle == self.current_cycle and i.category != "regression"])
        }
        
        for issue in self.current_issues:
            src = issue.source
            stats["by_source"][src] = stats["by_source"].get(src, 0) + 1
            
            cat = issue.category
            stats["by_category"][cat] = stats["by_category"].get(cat, 0) + 1
        
        summary_file = self.cycle_dir / f"cycle-{self.current_cycle:03d}-summary.json"
        with open(summary_file, "w") as f:
            json.dump(stats, f, indent=2)
        
        print(f"\n📊 Cycle {self.current_cycle} Summary:")
        print(f"   Total Active Issues: {stats['total_issues']}")
        print(f"   New Issues Found: {stats['new_issues_found']}")
        if self.current_cycle > 1:
            print(f"   Verified from Previous: {stats['verified_from_previous']}")
            print(f"   Regressions Found: {stats['regressions_found']}")
        
        if stats['by_source']:
            print("\n   Issues by Source:")
            for src, count in stats['by_source'].items():
                print(f"     {src}: {count}")


async def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Enhanced Helm Intelligence - Continuous Improvement Cycle with Full Context + MD Parsing",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument("--project", required=True, help="Path to project")
    parser.add_argument("--platform", required=True, help="Platform name")
    parser.add_argument("--mode", choices=["full", "verify", "analyze"], 
                       default="full", help="Run mode")
    parser.add_argument("--continuous", action="store_true",
                       help="Run cycles continuously")
    parser.add_argument("--wait", type=int, default=300,
                       help="Wait time between cycles (seconds)")
    
    args = parser.parse_args()
    
    agent = EnhancedCycleAgent(args.project, args.platform)
    
    if args.continuous:
        print(f"🔄 Running in continuous mode (will cycle every {args.wait}s)")
        print("Press Ctrl+C to stop")
        
        while True:
            try:
                await agent.run_cycle(mode=args.mode)
                
                if args.wait > 0:
                    print(f"\n⏳ Waiting {args.wait} seconds before next cycle...")
                    await asyncio.sleep(args.wait)
                
                agent = EnhancedCycleAgent(args.project, args.platform)
                
            except KeyboardInterrupt:
                print("\n\n👋 Stopped by user")
                break
    else:
        await agent.run_cycle(mode=args.mode)


if __name__ == "__main__":
    asyncio.run(main())
