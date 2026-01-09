#!/usr/bin/env python3
"""
Helm Intelligence - Enhancement Agent Only
Runs on existing audit findings to synthesize and prioritize.
"""

import os
import sys
import json
from datetime import datetime
from pathlib import Path
import anthropic

PROJECT_ROOT = Path("/Users/ricknini/Downloads/helmv3")
MODEL = "claude-sonnet-4-20250514"

ENHANCEMENT_PROMPT = """You are an Enhancement Agent for Helm Intelligence. Your job is to synthesize audit findings into actionable recommendations.

You will receive a list of findings from Code, Database, and UI/UX auditors. Your task:

1. **Pattern Analysis**: Group related findings. Identify root causes.
2. **Prioritization**: Rank by Impact (security > performance > quality) × Effort (quick wins first)
3. **Quick Wins**: Issues fixable in <30 minutes
4. **Roadmap**: Phase 1 (critical, this week), Phase 2 (high, next 2 weeks), Phase 3 (medium/low, ongoing)
5. **Recommendations**: Specific, actionable steps

Output a structured improvement plan."""


def main():
    print("""
╔═══════════════════════════════════════════════════════════════╗
║           HELM INTELLIGENCE - ENHANCEMENT AGENT               ║
║              Synthesize & Prioritize Findings                 ║
╚═══════════════════════════════════════════════════════════════╝
""")
    
    # Find the most recent audit JSON
    report_dir = PROJECT_ROOT / ".helm-intelligence" / "reports"
    json_files = sorted(report_dir.glob("audit_*.json"), reverse=True)
    
    if not json_files:
        print("❌ No audit findings found. Run the audit first.")
        sys.exit(1)
    
    latest = json_files[0]
    print(f"📁 Loading findings from: {latest.name}")
    
    data = json.loads(latest.read_text())
    findings = data.get("findings", [])
    
    if not findings:
        print("❌ No findings in the audit file.")
        sys.exit(1)
    
    print(f"📊 Found {len(findings)} findings to analyze")
    print()
    
    # Format findings
    findings_text = "# Audit Findings to Synthesize\n\n"
    
    for i, f in enumerate(findings, 1):
        findings_text += f"""## Finding {i}: {f['title']}
- Severity: {f['severity']}
- Category: {f['category']}
- File: {f['file']}
- Evidence: {f.get('evidence', 'N/A')[:200]}
- Suggested Fix: {f.get('fix', 'N/A')[:200]}

"""
    
    by_severity = data.get("summary", {})
    findings_text += f"""# Summary
- Total: {len(findings)} findings
- Critical: {by_severity.get('critical', 0)}
- High: {by_severity.get('high', 0)}
- Medium: {by_severity.get('medium', 0)}
- Low: {by_severity.get('low', 0)}
"""
    
    # Call Claude
    print("🧠 Running Enhancement Agent...")
    
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("❌ Error: ANTHROPIC_API_KEY not set")
        sys.exit(1)
    
    client = anthropic.Anthropic(api_key=api_key)
    
    response = client.messages.create(
        model=MODEL,
        max_tokens=8192,
        system=ENHANCEMENT_PROMPT,
        messages=[{
            "role": "user", 
            "content": f"""Analyze these {len(findings)} audit findings and create a prioritized improvement plan.

{findings_text}

Create:
1. **Pattern Analysis** - what are the root causes? Group related issues.
2. **Quick Wins** - what can be fixed in <30 min? List specific files.
3. **Prioritized Roadmap**:
   - Phase 1 (This Week): Critical security issues
   - Phase 2 (Next 2 Weeks): High priority items  
   - Phase 3 (Ongoing): Medium/low improvements
4. **Top 5 Recommendations** - most impactful changes

Be specific and actionable. Reference actual file paths from the findings."""
        }]
    )
    
    enhancement_report = response.content[0].text
    cost = (response.usage.input_tokens * 3 / 1_000_000) + (response.usage.output_tokens * 15 / 1_000_000)
    
    print(f"✅ Enhancement complete!")
    print(f"💰 Cost: ${cost:.2f}")
    print()
    print("=" * 60)
    print("ENHANCEMENT ANALYSIS")
    print("=" * 60)
    print()
    print(enhancement_report)
    print()
    
    # Save to file
    report_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    enhancement_path = report_dir / f"enhancement_{report_id}.md"
    
    md = f"""# Helm Intelligence Enhancement Report
Generated: {datetime.now().isoformat()}
Based on: {latest.name}
Cost: ${cost:.2f}

---

{enhancement_report}
"""
    
    enhancement_path.write_text(md)
    print(f"📄 Saved to: {enhancement_path}")


if __name__ == "__main__":
    main()
