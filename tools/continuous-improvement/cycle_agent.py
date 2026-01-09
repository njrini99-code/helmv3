#!/usr/bin/env python3
"""
Helm Intelligence - Continuous Improvement Cycle Agent

Creates a closed-loop system:
1. Analyze → Find issues
2. Export → issues-cycle-XXX.md 
3. Claude Code → Fixes issues + documents changes
4. Verify → Confirm fixes worked
5. Test → Find new issues with context-aware detection
6. Repeat

Usage:
    # Run cycle 1 (initial analysis)
    python cycle-agent.py --project ~/helmv3 --platform baseballhelm
    
    # After Claude Code fixes, run cycle 2 (verification + new analysis)
    python cycle-agent.py --project ~/helmv3 --platform baseballhelm --cycle 2
    
    # Continuous mode (runs until you stop it)
    python cycle-agent.py --project ~/helmv3 --platform baseballhelm --continuous
"""

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict
import re


class Issue:
    """Single issue with state tracking"""
    
    def __init__(self, 
                 id: str,
                 title: str,
                 description: str,
                 severity: str,
                 category: str,
                 location: Dict,
                 found_in_cycle: int,
                 context: Dict = None):
        self.id = id
        self.title = title
        self.description = description
        self.severity = severity  # critical, high, medium, low
        self.category = category  # security, ux, performance, accessibility, etc.
        self.location = location  # {file, line, function}
        self.found_in_cycle = found_in_cycle
        self.context = context or {}
        
        # State tracking
        self.state = "open"  # open, fixed, verified, regression
        self.fix_details = None
        self.fixed_in_cycle = None
        self.verified_in_cycle = None
        self.regression_of = None  # If this is a regression, ID of original issue
        
    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "severity": self.severity,
            "category": self.category,
            "location": self.location,
            "found_in_cycle": self.found_in_cycle,
            "state": self.state,
            "fix_details": self.fix_details,
            "fixed_in_cycle": self.fixed_in_cycle,
            "verified_in_cycle": self.verified_in_cycle,
            "regression_of": self.regression_of,
            "context": self.context
        }
    
    @classmethod
    def from_dict(cls, data: Dict):
        issue = cls(
            id=data["id"],
            title=data["title"],
            description=data["description"],
            severity=data["severity"],
            category=data["category"],
            location=data["location"],
            found_in_cycle=data["found_in_cycle"],
            context=data.get("context", {})
        )
        issue.state = data.get("state", "open")
        issue.fix_details = data.get("fix_details")
        issue.fixed_in_cycle = data.get("fixed_in_cycle")
        issue.verified_in_cycle = data.get("verified_in_cycle")
        issue.regression_of = data.get("regression_of")
        return issue


class CycleAgent:
    """
    Continuous improvement cycle orchestrator
    """
    
    def __init__(self, project_path: str, platform_name: str):
        self.project_path = Path(project_path)
        self.platform_name = platform_name
        self.helm_dir = self.project_path / ".helm"
        self.cycle_dir = self.helm_dir / "cycles"
        self.cycle_dir.mkdir(parents=True, exist_ok=True)
        
        # Load previous context
        self.context = self._load_context()
        self.current_cycle = self._get_next_cycle_number()
        
        # Issue tracking
        self.all_issues: List[Issue] = []
        self.current_issues: List[Issue] = []
        
    def _load_context(self) -> Dict:
        """Load accumulated context from previous runs"""
        context_file = self.helm_dir / "UNDERSTANDING.json"
        if context_file.exists():
            with open(context_file) as f:
                return json.load(f)
        return {}
    
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
    
    async def run_cycle(self, mode: str = "full"):
        """
        Run a complete improvement cycle
        
        Modes:
        - full: Complete analysis + verification
        - verify: Only verify previous fixes
        - analyze: Only find new issues
        """
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   🔄 CONTINUOUS IMPROVEMENT CYCLE {self.current_cycle:03d}                             ║
║   Platform: {self.platform_name:<59} ║
║   Mode: {mode:<66} ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
        
        # Phase 1: Load previous cycle
        prev_cycle = self._load_previous_cycle()
        if prev_cycle:
            await self.verify_previous_fixes(prev_cycle)
        
        # Phase 2: Find new issues (context-aware)
        if mode in ["full", "analyze"]:
            await self.find_new_issues()
        
        # Phase 3: Export issue list
        await self.export_issues()
        
        # Phase 4: Generate summary
        self.generate_summary()
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   ✅ CYCLE {self.current_cycle:03d} COMPLETE                                            ║
║                                                                              ║
║   📁 Issues exported to:                                                     ║
║   {str(self.cycle_dir / f'issues-cycle-{self.current_cycle:03d}.md'):<75}║
║                                                                              ║
║   📋 Next Steps:                                                             ║
║   1. Open the MD file in Cursor                                              ║
║   2. Tell Claude Code: "Fix all issues in this file"                         ║
║   3. Claude Code will fix + document changes in the MD                       ║
║   4. Run cycle {self.current_cycle + 1:03d} to verify fixes                                    ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
    
    async def verify_previous_fixes(self, prev_cycle: Dict):
        """Verify that previous fixes actually worked"""
        from claude_agent_sdk import query, ClaudeAgentOptions
        
        print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📋 PHASE 1: VERIFYING PREVIOUS FIXES
  Checking if fixes from cycle {self.current_cycle - 1:03d} actually worked...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """)
        
        # Load previous issues
        prev_issues = [Issue.from_dict(i) for i in prev_cycle.get("issues", [])]
        fixed_issues = [i for i in prev_issues if i.state == "fixed"]
        
        if not fixed_issues:
            print("⚠️  No fixed issues to verify from previous cycle")
            return
        
        print(f"Found {len(fixed_issues)} issues marked as fixed")
        print("Verifying each one...\n")
        
        options = ClaudeAgentOptions(
            cwd=str(self.project_path),
            allowed_tools=["Read", "Bash", "Glob", "Grep", "LS"],
            permission_mode="default",
            max_turns=50,
        )
        
        # Build verification context
        issues_summary = "\n\n".join([
            f"ISSUE {i.id}: {i.title}\n"
            f"Location: {i.location.get('file', 'unknown')}\n"
            f"Fix Details: {i.fix_details}\n"
            f"Original Problem: {i.description}"
            for i in fixed_issues
        ])
        
        prompt = f"""
You are verifying that previously fixed issues are ACTUALLY fixed.

Platform: {self.platform_name}
Project: {self.project_path}
Cycle: {self.current_cycle} (verifying fixes from cycle {self.current_cycle - 1})

Previous cycle claimed these issues were fixed:

{issues_summary}

Your job is to verify EACH issue:

1. Read the file mentioned in the issue
2. Check if the fix described was actually applied
3. Test if the issue is truly resolved (not just partially)
4. Look for any regressions caused by the fix

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
If a fix was partial or incorrect, mark it as not_fixed.
If a fix broke something else, mark it as regression_found.
"""
        
        verification_results = []
        
        async for message in query(prompt=prompt, options=options):
            if hasattr(message, 'content'):
                for block in message.content:
                    if hasattr(block, 'text'):
                        print(block.text)
                        verification_results.append(block.text)
        
        # Parse verification results
        full_output = "\n".join(verification_results)
        self._process_verification_results(full_output, fixed_issues)
    
    def _process_verification_results(self, output: str, fixed_issues: List[Issue]):
        """Process verification results from Claude"""
        # Extract JSON blocks
        json_pattern = r'```json\s*(.*?)\s*```'
        matches = re.findall(json_pattern, output, re.DOTALL)
        
        verified_count = 0
        not_fixed_count = 0
        regression_count = 0
        
        for match in matches:
            try:
                result = json.loads(match)
                issue_id = result.get("issue_id")
                
                # Find the issue
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
                    issue.state = "open"  # Revert to open
                    issue.fixed_in_cycle = None
                    issue.fix_details = None
                    not_fixed_count += 1
                    print(f"  ❌ {issue_id}: NOT actually fixed - reopening")
                
                elif status == "regression_found":
                    # Create new issue for the regression
                    regression = Issue(
                        id=result.get("new_issue_id", f"REG-{issue_id}"),
                        title=f"Regression from fix of {issue_id}",
                        description=result.get("regression_details", "Fix caused new issue"),
                        severity="high",
                        category="regression",
                        location=issue.location,
                        found_in_cycle=self.current_cycle
                    )
                    regression.regression_of = issue_id
                    self.current_issues.append(regression)
                    regression_count += 1
                    print(f"  ⚠️  {issue_id}: Caused regression - created {regression.id}")
                
                # Keep the issue in tracking
                self.all_issues.append(issue)
                
                # If not verified, add back to current issues
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
        """Find new issues using context-aware detection"""
        from claude_agent_sdk import query, ClaudeAgentOptions
        
        print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🔍 PHASE 2: CONTEXT-AWARE ISSUE DETECTION
  Using deep understanding to find issues...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """)
        
        options = ClaudeAgentOptions(
            cwd=str(self.project_path),
            allowed_tools=["Read", "Bash", "Glob", "Grep", "LS"],
            permission_mode="default",
            max_turns=100,
        )
        
        # Build context from previous understanding
        context_summary = json.dumps(self.context, indent=2)[:5000]
        
        # Get list of known issues to avoid duplicates
        known_issues = "\n".join([
            f"- {i.id}: {i.title} ({i.state})"
            for i in self.all_issues
        ])
        
        prompt = f"""
You are performing cycle {self.current_cycle} of continuous improvement analysis.

Platform: {self.platform_name}
Project: {self.project_path}

You have deep context about this application:
```json
{context_summary}
```

Known issues (don't duplicate these):
{known_issues}

Your job is to find NEW issues by:

1. **Testing Expected Features** - Based on context, test if features work as expected
2. **Checking Consistency** - Are similar things done similarly?
3. **Finding Gaps** - Is functionality missing that should exist?
4. **Detecting Anti-patterns** - Code that works but shouldn't be done that way
5. **Security Review** - Any new vulnerabilities?
6. **UX Issues** - Poor user experience patterns
7. **Performance** - Unnecessary slowness
8. **Accessibility** - Missing a11y features

Be context-aware:
- If you know a feature should have pagination, check if it does
- If you know what user roles exist, verify proper access control
- If you understand the data model, check for data integrity issues

For EACH issue found, output:
```json
{{
  "id": "ISSUE-XXX",
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
  "expected_behavior": "What should happen",
  "actual_behavior": "What actually happens",
  "user_impact": "How this affects users",
  "suggested_fix": "How to fix it"
}}
```

Start your investigation now. Be thorough. Find 5-15 real issues.
"""
        
        issue_results = []
        
        async for message in query(prompt=prompt, options=options):
            if hasattr(message, 'content'):
                for block in message.content:
                    if hasattr(block, 'text'):
                        # Show progress
                        preview = block.text[-500:] if len(block.text) > 500 else block.text
                        print(preview)
                        issue_results.append(block.text)
        
        # Parse found issues
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
                
                # Check if this is a duplicate
                issue_id = data.get("id")
                if any(i.id == issue_id for i in self.all_issues):
                    continue
                
                # Create issue
                issue = Issue(
                    id=issue_id,
                    title=data.get("title", "Unknown issue"),
                    description=data.get("description", ""),
                    severity=data.get("severity", "medium"),
                    category=data.get("category", "other"),
                    location=data.get("location", {}),
                    found_in_cycle=self.current_cycle,
                    context={
                        "evidence": data.get("evidence"),
                        "expected_behavior": data.get("expected_behavior"),
                        "actual_behavior": data.get("actual_behavior"),
                        "user_impact": data.get("user_impact"),
                        "suggested_fix": data.get("suggested_fix")
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
        
        # Sort issues by severity
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        sorted_issues = sorted(
            self.current_issues,
            key=lambda i: (severity_order.get(i.severity, 999), i.id)
        )
        
        # Generate MD content
        md_content = self._generate_issues_md(sorted_issues)
        
        # Save MD
        md_file = self.cycle_dir / f"issues-cycle-{self.current_cycle:03d}.md"
        with open(md_file, "w") as f:
            f.write(md_content)
        
        # Save JSON
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
    
    def _generate_issues_md(self, issues: List[Issue]) -> str:
        """Generate the MD file that Claude Code will update"""
        
        # Count by severity
        critical = len([i for i in issues if i.severity == "critical"])
        high = len([i for i in issues if i.severity == "high"])
        medium = len([i for i in issues if i.severity == "medium"])
        low = len([i for i in issues if i.severity == "low"])
        
        md = f"""# Improvement Cycle {self.current_cycle:03d} - {self.platform_name}

> 🤖 Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
> 📊 Total Issues: {len(issues)}
> 🔴 Critical: {critical} | 🟠 High: {high} | 🟡 Medium: {medium} | 🟢 Low: {low}

---

## 📋 Instructions for Claude Code

This file contains issues for you to fix. For EACH issue:

1. **Read the issue details carefully**
2. **Fix the code** according to the suggested fix
3. **Update this file** in the "FIX STATUS" section with:
   - ✅ What you changed
   - 📁 Which files you modified
   - 🧪 How you tested it
   - ⚠️ Any concerns or limitations

**Format for documenting your fix:**
```markdown
### ✅ FIXED: [Issue ID]

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

**Notes:**
- Used existing design system patterns
- Added loading prop to maintain consistency
```

---

## 🔴 Critical Issues

"""
        
        # Add issues by severity
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
> **Found in Cycle:** {issue.current_cycle if hasattr(issue, 'current_cycle') else issue.found_in_cycle}

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
                
                # Add fix status section
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
            "by_category": {},
            "verified_from_previous": len([i for i in self.all_issues if i.verified_in_cycle == self.current_cycle]),
            "regressions_found": len([i for i in self.current_issues if i.category == "regression"]),
            "new_issues_found": len([i for i in self.current_issues if i.found_in_cycle == self.current_cycle and i.category != "regression"])
        }
        
        # Count by category
        for issue in self.current_issues:
            cat = issue.category
            stats["by_category"][cat] = stats["by_category"].get(cat, 0) + 1
        
        # Save summary
        summary_file = self.cycle_dir / f"cycle-{self.current_cycle:03d}-summary.json"
        with open(summary_file, "w") as f:
            json.dump(stats, f, indent=2)
        
        print(f"\n📊 Cycle {self.current_cycle} Summary:")
        print(f"   Total Active Issues: {stats['total_issues']}")
        print(f"   New Issues Found: {stats['new_issues_found']}")
        if self.current_cycle > 1:
            print(f"   Verified from Previous: {stats['verified_from_previous']}")
            print(f"   Regressions Found: {stats['regressions_found']}")


async def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Helm Intelligence - Continuous Improvement Cycle",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Run cycle 1 (initial analysis)
    python cycle-agent.py --project ~/helmv3 --platform baseballhelm
    
    # After Claude Code fixes, run next cycle
    python cycle-agent.py --project ~/helmv3 --platform baseballhelm
    
    # Continuous mode (runs cycles automatically)
    python cycle-agent.py --project ~/helmv3 --platform baseballhelm --continuous
        """
    )
    
    parser.add_argument("--project", required=True, help="Path to project")
    parser.add_argument("--platform", required=True, help="Platform name")
    parser.add_argument("--mode", choices=["full", "verify", "analyze"], 
                       default="full", help="Run mode")
    parser.add_argument("--continuous", action="store_true",
                       help="Run cycles continuously")
    parser.add_argument("--wait", type=int, default=300,
                       help="Wait time between cycles in continuous mode (seconds)")
    
    args = parser.parse_args()
    
    agent = CycleAgent(args.project, args.platform)
    
    if args.continuous:
        print(f"🔄 Running in continuous mode (will cycle every {args.wait}s)")
        print("Press Ctrl+C to stop")
        
        while True:
            try:
                await agent.run_cycle(mode=args.mode)
                
                if args.wait > 0:
                    print(f"\n⏳ Waiting {args.wait} seconds before next cycle...")
                    await asyncio.sleep(args.wait)
                
                # Reload for next cycle
                agent = CycleAgent(args.project, args.platform)
                
            except KeyboardInterrupt:
                print("\n\n👋 Stopped by user")
                break
    else:
        await agent.run_cycle(mode=args.mode)


if __name__ == "__main__":
    asyncio.run(main())
