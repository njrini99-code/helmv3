#!/usr/bin/env python3
"""
Feature-Based Issue Organizer

Splits cycle issues into separate MD files per feature/area.
Claude Code can then fix one feature at a time with better context.

Usage:
    python organize_by_feature.py --cycle 1 --project ~/helmv3
    
Creates:
    .helm/cycles/features/
    ├── baseball-recruiting-issues.md
    ├── golf-scorecard-issues.md
    ├── auth-and-security-issues.md
    ├── database-and-rls-issues.md
    └── ui-and-components-issues.md
"""

import json
import sys
from pathlib import Path
from typing import Dict, List
import re


class FeatureOrganizer:
    """
    Organizes issues by feature/area for better Claude Code context
    """
    
    def __init__(self, project_path: Path, cycle_number: int):
        self.project_path = project_path
        self.cycle_number = cycle_number
        self.helm_dir = project_path / ".helm"
        self.cycle_dir = self.helm_dir / "cycles"
        self.features_dir = self.cycle_dir / "features"
        self.features_dir.mkdir(parents=True, exist_ok=True)
        
        # Load cycle data
        self.cycle_file = self.cycle_dir / f"issues-cycle-{cycle_number:03d}.json"
        if not self.cycle_file.exists():
            print(f"❌ Cycle file not found: {self.cycle_file}")
            sys.exit(1)
        
        with open(self.cycle_file) as f:
            self.cycle_data = json.load(f)
        
        self.issues = self.cycle_data.get("issues", [])
        
        # Load understanding for feature context
        understanding_file = self.helm_dir / "UNDERSTANDING.json"
        self.understanding = {}
        if understanding_file.exists():
            with open(understanding_file) as f:
                self.understanding = json.load(f)
    
    def categorize_by_feature(self) -> Dict[str, List[Dict]]:
        """
        Group issues by feature area based on file paths and categories
        """
        
        feature_groups = {
            "baseball-recruiting": [],
            "baseball-pipeline": [],
            "baseball-showcase": [],
            "golf-scorecard": [],
            "golf-team-management": [],
            "golf-analytics": [],
            "auth-and-security": [],
            "database-and-rls": [],
            "api-routes": [],
            "ui-components": [],
            "performance": [],
            "accessibility": [],
            "other": []
        }
        
        for issue in self.issues:
            file_path = issue.get("location", {}).get("file", "")
            category = issue.get("category", "")
            
            # Determine feature group based on file path and category
            assigned = False
            
            # Baseball features
            if "baseball" in file_path.lower():
                if "recruiting" in file_path or "recruit" in file_path:
                    feature_groups["baseball-recruiting"].append(issue)
                elif "pipeline" in file_path:
                    feature_groups["baseball-pipeline"].append(issue)
                elif "showcase" in file_path:
                    feature_groups["baseball-showcase"].append(issue)
                else:
                    feature_groups["baseball-recruiting"].append(issue)
                assigned = True
            
            # Golf features
            elif "golf" in file_path.lower():
                if "scorecard" in file_path or "round" in file_path or "shot" in file_path:
                    feature_groups["golf-scorecard"].append(issue)
                elif "team" in file_path or "roster" in file_path:
                    feature_groups["golf-team-management"].append(issue)
                elif "analytics" in file_path or "stats" in file_path:
                    feature_groups["golf-analytics"].append(issue)
                else:
                    feature_groups["golf-scorecard"].append(issue)
                assigned = True
            
            # Auth and security
            elif category == "security" or "auth" in file_path.lower() or "rls" in file_path.lower():
                if "rls" in file_path.lower() or "policy" in file_path.lower() or "migration" in file_path.lower():
                    feature_groups["database-and-rls"].append(issue)
                else:
                    feature_groups["auth-and-security"].append(issue)
                assigned = True
            
            # Database
            elif "supabase" in file_path or "migration" in file_path or "database" in file_path:
                feature_groups["database-and-rls"].append(issue)
                assigned = True
            
            # API routes
            elif "api/" in file_path or "route" in file_path:
                feature_groups["api-routes"].append(issue)
                assigned = True
            
            # UI components
            elif "component" in file_path.lower() or category == "ux":
                feature_groups["ui-components"].append(issue)
                assigned = True
            
            # Performance
            elif category == "performance":
                feature_groups["performance"].append(issue)
                assigned = True
            
            # Accessibility
            elif category == "accessibility":
                feature_groups["accessibility"].append(issue)
                assigned = True
            
            # Other
            if not assigned:
                feature_groups["other"].append(issue)
        
        # Remove empty groups
        return {k: v for k, v in feature_groups.items() if v}
    
    def generate_feature_md(self, feature_name: str, issues: List[Dict]) -> str:
        """
        Generate a feature-specific markdown file
        """
        
        # Get feature context from understanding
        feature_context = self._get_feature_context(feature_name)
        
        severity_counts = {
            "critical": len([i for i in issues if i.get("severity") == "critical"]),
            "high": len([i for i in issues if i.get("severity") == "high"]),
            "medium": len([i for i in issues if i.get("severity") == "medium"]),
            "low": len([i for i in issues if i.get("severity") == "low"]),
        }
        
        md = f"""# {feature_name.replace('-', ' ').title()} - Issues (Cycle {self.cycle_number:03d})

> 🎯 **Feature Focus:** {feature_name}
> 📊 **Total Issues:** {len(issues)}
> 🔴 Critical: {severity_counts['critical']} | 🟠 High: {severity_counts['high']} | 🟡 Medium: {severity_counts['medium']} | 🟢 Low: {severity_counts['low']}

---

## 📚 Feature Context

{feature_context}

---

## 📋 Instructions for Claude Code

This file contains issues **ONLY for the {feature_name.replace('-', ' ').title()} feature**.

Working on one feature at a time gives you:
- ✅ Better context and focus
- ✅ Easier to test related changes
- ✅ Clearer understanding of dependencies
- ✅ Reduced chance of conflicts

**Before fixing:**
1. Read the feature context above
2. Check `.helm/UNDERSTANDING.json` for this feature's details
3. Review `.helm/HELM_ESSAY.md` for architecture patterns

**For EACH issue:**
1. Fix the code according to the suggested solution
2. Update the FIX STATUS section below the issue
3. Test the fix in the context of this feature
4. Document your changes thoroughly

**Fix format:**
```markdown
### ✅ FIXED: [Issue ID]

**Changes Made:**
- [What you changed]

**Files Modified:**
- [Which files]

**Testing:**
- [How you verified it works]

**Notes:**
- [Any concerns or follow-up needed]
```

---

## 🔴 Critical Issues

"""
        
        # Group by severity
        for severity, emoji in [("critical", "🔴"), ("high", "🟠"), 
                                ("medium", "🟡"), ("low", "🟢")]:
            
            severity_issues = [i for i in issues if i.get("severity") == severity]
            if not severity_issues:
                continue
            
            if severity != "critical":
                md += f"\n## {emoji} {severity.title()} Issues\n\n"
            
            for issue in severity_issues:
                md += self._format_issue(issue)
        
        return md
    
    def _get_feature_context(self, feature_name: str) -> str:
        """
        Get relevant context for this feature from UNDERSTANDING.json
        """
        
        if not self.understanding:
            return "No feature context available."
        
        # Extract relevant features
        features = self.understanding.get("features", [])
        
        # Find matching features
        matching = []
        for feature in features:
            name = feature.get("name", "").lower()
            if any(word in name for word in feature_name.split("-")):
                matching.append(feature)
        
        if not matching:
            return f"Feature area: {feature_name.replace('-', ' ').title()}"
        
        context = []
        for feature in matching[:3]:  # Limit to 3 most relevant
            context.append(f"**{feature.get('name', 'Unknown')}**")
            context.append(f"- Route: `{feature.get('route', 'N/A')}`")
            context.append(f"- Description: {feature.get('description', 'N/A')}")
            
            if feature.get("user_roles"):
                context.append(f"- User Roles: {', '.join(feature['user_roles'])}")
            
            context.append("")
        
        return "\n".join(context)
    
    def _format_issue(self, issue: Dict) -> str:
        """
        Format a single issue for the markdown file
        """
        
        issue_id = issue.get("id", "UNKNOWN")
        title = issue.get("title", "Unknown issue")
        severity = issue.get("severity", "medium")
        category = issue.get("category", "other")
        description = issue.get("description", "")
        location = issue.get("location", {})
        context = issue.get("context", {})
        source = issue.get("source", "unknown")
        
        severity_emoji = {
            "critical": "🔴",
            "high": "🟠",
            "medium": "🟡",
            "low": "🟢"
        }.get(severity, "⚪")
        
        md = f"""
### {issue_id}: {title}

> **Severity:** {severity_emoji} {severity.title()}  
> **Category:** {category}  
> **Source:** {source}

**Problem:**
{description}

**Location:**
- File: `{location.get('file', 'unknown')}`
"""
        
        if location.get('line'):
            md += f"- Line: {location['line']}\n"
        if location.get('function'):
            md += f"- Function: `{location['function']}`\n"
        
        if context.get('evidence'):
            md += f"\n**Evidence:**\n{context['evidence']}\n"
        
        if context.get('expected_behavior'):
            md += f"\n**Expected Behavior:**\n{context['expected_behavior']}\n"
        
        if context.get('actual_behavior'):
            md += f"\n**Actual Behavior:**\n{context['actual_behavior']}\n"
        
        if context.get('user_impact'):
            md += f"\n**User Impact:**\n{context['user_impact']}\n"
        
        if context.get('suggested_fix'):
            md += f"\n**Suggested Fix:**\n{context['suggested_fix']}\n"
        
        md += f"""
---

### FIX STATUS: {issue_id}

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
    
    def organize(self):
        """
        Main method to organize issues by feature
        """
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   📁 ORGANIZING CYCLE {self.cycle_number:03d} ISSUES BY FEATURE                          ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
        
        print(f"Total issues in cycle: {len(self.issues)}\n")
        
        # Categorize issues
        feature_groups = self.categorize_by_feature()
        
        print(f"Organized into {len(feature_groups)} feature areas:\n")
        
        # Generate MD files for each feature
        for feature_name, issues in feature_groups.items():
            print(f"  📝 {feature_name:<30} {len(issues)} issues")
            
            md_content = self.generate_feature_md(feature_name, issues)
            
            output_file = self.features_dir / f"{feature_name}-issues.md"
            with open(output_file, "w") as f:
                f.write(md_content)
        
        # Generate index file
        self._generate_index(feature_groups)
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   ✅ ORGANIZATION COMPLETE                                                   ║
║                                                                              ║
║   📁 Feature files: .helm/cycles/features/                                   ║
║   📋 Index file: .helm/cycles/features/INDEX.md                              ║
║                                                                              ║
║   🎯 Next Steps:                                                             ║
║   1. Open a feature file in Cursor                                           ║
║   2. Tell Claude Code: "Fix all issues in this file"                         ║
║   3. Move to next feature when done                                          ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
    
    def _generate_index(self, feature_groups: Dict[str, List[Dict]]):
        """
        Generate an index file showing all features and their issues
        """
        
        index_md = f"""# Cycle {self.cycle_number:03d} - Feature-Based Issue Index

> 📊 Total Issues: {len(self.issues)}
> 📁 Feature Areas: {len(feature_groups)}

This index helps you work on one feature at a time.

---

## 🎯 Feature Areas

"""
        
        for feature_name, issues in sorted(feature_groups.items(), 
                                          key=lambda x: len(x[1]), 
                                          reverse=True):
            
            critical = len([i for i in issues if i.get("severity") == "critical"])
            high = len([i for i in issues if i.get("severity") == "high"])
            medium = len([i for i in issues if i.get("severity") == "medium"])
            low = len([i for i in issues if i.get("severity") == "low"])
            
            index_md += f"""
### {feature_name.replace('-', ' ').title()}

**File:** `{feature_name}-issues.md`  
**Total Issues:** {len(issues)}  
**Breakdown:** 🔴 {critical} Critical | 🟠 {high} High | 🟡 {medium} Medium | 🟢 {low} Low

**Top Issues:**
"""
            
            # Show top 3 issues
            for issue in sorted(issues, 
                               key=lambda x: ["critical", "high", "medium", "low"].index(x.get("severity", "low")))[:3]:
                issue_id = issue.get("id", "UNKNOWN")
                title = issue.get("title", "Unknown")
                severity = issue.get("severity", "medium")
                emoji = {"critical": "🔴", "high": "🟠", "medium": "🟡", "low": "🟢"}.get(severity, "⚪")
                index_md += f"- {emoji} **{issue_id}:** {title}\n"
            
            index_md += "\n"
        
        index_md += """
---

## 📋 Recommended Order

Work on features in this order for maximum impact:

1. **Critical Security Issues First**
   - Start with `database-and-rls-issues.md`
   - Then `auth-and-security-issues.md`

2. **Core Features**
   - Baseball or Golf (whichever is your priority)
   - Focus on one platform at a time

3. **Cross-Cutting Concerns**
   - `api-routes-issues.md`
   - `ui-components-issues.md`

4. **Polish**
   - `performance-issues.md`
   - `accessibility-issues.md`

---

## 🔄 Workflow

```
For each feature file:
1. Open [feature]-issues.md in Cursor
2. Tell Claude Code: "Fix all issues in this file"
3. Claude Code fixes + documents in FIX STATUS sections
4. Review changes
5. Move to next feature
```

When all features are done:
- Run next cycle to verify fixes
- Cycle agent will merge all FIX STATUS updates
- New issues will be organized by feature again
"""
        
        index_file = self.features_dir / "INDEX.md"
        with open(index_file, "w") as f:
            f.write(index_md)


def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Organize cycle issues by feature for better Claude Code context"
    )
    
    parser.add_argument("--project", required=True, help="Path to project")
    parser.add_argument("--cycle", type=int, required=True, help="Cycle number to organize")
    
    args = parser.parse_args()
    
    project_path = Path(args.project)
    
    organizer = FeatureOrganizer(project_path, args.cycle)
    organizer.organize()


if __name__ == "__main__":
    main()
