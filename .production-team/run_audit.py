#!/usr/bin/env python3
"""
Production Audit Team Orchestrator
Coordinates three AI agents to audit Helm Sports Labs for production readiness.
"""

import os
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
import subprocess

# Configuration
PROJECT_ROOT = Path(__file__).parent.parent
PRODUCTION_TEAM_DIR = PROJECT_ROOT / ".production-team"
SUPABASE_DIR = PROJECT_ROOT / "supabase"
SRC_DIR = PROJECT_ROOT / "src"

class ProductionAuditOrchestrator:
    """Orchestrates the three-agent production audit system."""
    
    def __init__(self, round_number: int = 1):
        self.round_number = round_number
        self.round_dir = PRODUCTION_TEAM_DIR / f"ROUND_{round_number:02d}"
        self.round_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize agent findings storage
        self.findings = {
            "database_sentinel": [],
            "feature_maestro": [],
            "experience_architect": []
        }
        
    def run_database_sentinel(self) -> Dict:
        """Execute Database Sentinel audit."""
        print("🛡️  DATABASE SENTINEL - Starting audit...")
        
        findings = {
            "timestamp": datetime.now().isoformat(),
            "agent": "Database Sentinel",
            "scope": "Schema, RLS, Performance, Data Integrity",
            "findings": []
        }
        
        # Check for Supabase schema
        schema_files = list((SUPABASE_DIR / "migrations").glob("*.sql")) if (SUPABASE_DIR / "migrations").exists() else []
        
        findings["findings"].append({
            "category": "Schema Migrations",
            "status": "FOUND" if schema_files else "MISSING",
            "details": f"Found {len(schema_files)} migration files" if schema_files else "No migrations directory",
            "severity": "INFO" if schema_files else "CRITICAL"
        })
        
        # Check for RLS policy files
        rls_files = [f for f in PROJECT_ROOT.glob("*.sql") if "rls" in f.name.lower() or "policies" in f.name.lower()]
        findings["findings"].append({
            "category": "RLS Policies",
            "status": "FOUND" if rls_files else "MISSING",
            "details": f"Found {len(rls_files)} RLS-related SQL files",
            "severity": "WARNING" if not rls_files else "INFO"
        })
        
        # Check for database audit scripts
        audit_scripts = [f for f in PROJECT_ROOT.glob("*.sql") if "audit" in f.name.lower()]
        findings["findings"].append({
            "category": "Audit Tools",
            "status": "FOUND" if audit_scripts else "MISSING", 
            "details": f"Found {len(audit_scripts)} audit scripts",
            "severity": "INFO"
        })
        
        self.findings["database_sentinel"] = findings
        self._save_findings("01_DATABASE_SENTINEL_FINDINGS.md", findings)
        
        print("✅ Database Sentinel audit complete")
        return findings
    
    def run_feature_maestro(self) -> Dict:
        """Execute Feature Maestro audit."""
        print("🎯 FEATURE MAESTRO - Starting audit...")
        
        findings = {
            "timestamp": datetime.now().isoformat(),
            "agent": "Feature Maestro",
            "scope": "Feature Completeness, User Journeys, Edge Cases",
            "findings": []
        }
        
        # Check for BaseballHelm routes
        baseball_dir = SRC_DIR / "app" / "baseball"
        if baseball_dir.exists():
            baseball_routes = [d.name for d in baseball_dir.iterdir() if d.is_dir()]
            findings["findings"].append({
                "category": "BaseballHelm Routes",
                "status": "FOUND",
                "details": f"Routes: {', '.join(baseball_routes[:10])}{'...' if len(baseball_routes) > 10 else ''}",
                "count": len(baseball_routes),
                "severity": "INFO"
            })
        
        # Check for GolfHelm routes
        golf_dir = SRC_DIR / "app" / "golf"
        if golf_dir.exists():
            golf_routes = [d.name for d in golf_dir.iterdir() if d.is_dir()]
            findings["findings"].append({
                "category": "GolfHelm Routes",
                "status": "FOUND",
                "details": f"Routes: {', '.join(golf_routes[:10])}{'...' if len(golf_routes) > 10 else ''}",
                "count": len(golf_routes),
                "severity": "INFO"
            })
        
        # Check for API routes
        api_dir = SRC_DIR / "app" / "api"
        if api_dir.exists():
            api_routes = [d.name for d in api_dir.iterdir() if d.is_dir()]
            findings["findings"].append({
                "category": "API Endpoints",
                "status": "FOUND",
                "details": f"Endpoints: {', '.join(api_routes)}",
                "count": len(api_routes),
                "severity": "INFO"
            })
        
        # Check for error handling
        error_files = list(SRC_DIR.glob("**/error.tsx")) + list(SRC_DIR.glob("**/global-error.tsx"))
        findings["findings"].append({
            "category": "Error Boundaries",
            "status": "FOUND" if error_files else "MISSING",
            "details": f"Found {len(error_files)} error boundary files",
            "severity": "INFO" if error_files else "CRITICAL"
        })
        
        # Check for loading states
        loading_files = list(SRC_DIR.glob("**/loading.tsx"))
        findings["findings"].append({
            "category": "Loading States",
            "status": "FOUND" if loading_files else "PARTIAL",
            "details": f"Found {len(loading_files)} loading state files",
            "severity": "INFO" if loading_files else "WARNING"
        })
        
        self.findings["feature_maestro"] = findings
        self._save_findings("02_FEATURE_MAESTRO_FINDINGS.md", findings)
        
        print("✅ Feature Maestro audit complete")
        return findings
    
    def run_experience_architect(self) -> Dict:
        """Execute Experience Architect audit."""
        print("✨ EXPERIENCE ARCHITECT - Starting audit...")
        
        findings = {
            "timestamp": datetime.now().isoformat(),
            "agent": "Experience Architect",
            "scope": "UI/UX Excellence, Design Consistency, Accessibility",
            "findings": []
        }
        
        # Check for component library
        components_dir = SRC_DIR / "components"
        if components_dir.exists():
            component_files = list(components_dir.glob("**/*.tsx"))
            findings["findings"].append({
                "category": "Component Library",
                "status": "FOUND",
                "details": f"Found {len(component_files)} component files",
                "count": len(component_files),
                "severity": "INFO"
            })
        
        # Check for UI components subdirectories
        if (components_dir / "ui").exists():
            ui_components = list((components_dir / "ui").glob("*.tsx"))
            findings["findings"].append({
                "category": "UI Design System",
                "status": "FOUND",
                "details": f"Found {len(ui_components)} UI components",
                "components": [f.stem for f in ui_components[:20]],
                "severity": "INFO"
            })
        
        # Check for global styles
        if (SRC_DIR / "app" / "globals.css").exists():
            findings["findings"].append({
                "category": "Global Styles",
                "status": "FOUND",
                "details": "globals.css present",
                "severity": "INFO"
            })
        
        # Check Tailwind config
        tailwind_config = PROJECT_ROOT / "tailwind.config.ts"
        if tailwind_config.exists():
            findings["findings"].append({
                "category": "Design Tokens",
                "status": "FOUND",
                "details": "Tailwind config present",
                "severity": "INFO"
            })
        
        # Check for accessibility files
        a11y_hints = []
        for tsx_file in component_files[:100]:  # Sample first 100
            content = tsx_file.read_text()
            if "aria-" in content:
                a11y_hints.append(tsx_file.name)
        
        findings["findings"].append({
            "category": "Accessibility",
            "status": "PARTIAL" if a11y_hints else "NEEDS_REVIEW",
            "details": f"Found ARIA attributes in {len(a11y_hints)} components (sample of 100)",
            "severity": "WARNING" if not a11y_hints else "INFO"
        })
        
        self.findings["experience_architect"] = findings
        self._save_findings("03_EXPERIENCE_ARCHITECT_FINDINGS.md", findings)
        
        print("✅ Experience Architect audit complete")
        return findings
    
    def synthesize_findings(self):
        """Generate cross-agent synthesis and priority action items."""
        print("🔗 Synthesizing cross-agent findings...")
        
        # Collect all critical and warning items
        critical_items = []
        warning_items = []
        
        for agent, findings in self.findings.items():
            for finding in findings.get("findings", []):
                severity = finding.get("severity", "INFO")
                if severity == "CRITICAL":
                    critical_items.append({
                        "agent": agent,
                        "category": finding["category"],
                        "details": finding["details"]
                    })
                elif severity == "WARNING":
                    warning_items.append({
                        "agent": agent,
                        "category": finding["category"],
                        "details": finding["details"]
                    })
        
        synthesis = f"""# Round {self.round_number:02d} - Cross-Agent Synthesis

Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## Executive Summary

This synthesis combines insights from all three agents to identify critical cross-cutting concerns and prioritize action items for production readiness.

## Critical Issues ({len(critical_items)})

"""
        if critical_items:
            for i, item in enumerate(critical_items, 1):
                synthesis += f"{i}. **[{item['agent'].upper()}]** {item['category']}\n"
                synthesis += f"   - {item['details']}\n\n"
        else:
            synthesis += "✅ No critical issues identified!\n\n"
        
        synthesis += f"""## Warnings ({len(warning_items)})

"""
        if warning_items:
            for i, item in enumerate(warning_items, 1):
                synthesis += f"{i}. **[{item['agent'].upper()}]** {item['category']}\n"
                synthesis += f"   - {item['details']}\n\n"
        else:
            synthesis += "✅ No warnings!\n\n"
        
        synthesis += """## Cross-Agent Insights

### Database ↔ Features
- Database schema should support all feature requirements
- RLS policies must align with feature-level permissions
- Missing indexes may cause feature performance issues

### Features ↔ Experience
- Incomplete features create poor UX
- Error states need both functionality and design
- Loading states require coordination between backend and UI

### Database ↔ Experience
- Data model complexity affects UI patterns
- Real-time subscriptions impact design choices
- Data structure influences component architecture

## Next Steps

1. Address all CRITICAL issues immediately
2. Create tickets for WARNING items
3. Plan deep-dive audit for next round
4. Schedule cross-functional review

"""
        
        # Save synthesis
        synthesis_path = self.round_dir / "04_CROSS_AGENT_SYNTHESIS.md"
        synthesis_path.write_text(synthesis)
        print(f"✅ Synthesis saved to {synthesis_path}")
        
        # Generate priority action items
        self._generate_action_items(critical_items, warning_items)
    
    def _generate_action_items(self, critical_items: List, warning_items: List):
        """Generate prioritized action items."""
        action_items = f"""# Round {self.round_number:02d} - Priority Action Items

Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## 🔴 IMMEDIATE BLOCKERS

"""
        if critical_items:
            for i, item in enumerate(critical_items, 1):
                action_items += f"### {i}. {item['category']}\n"
                action_items += f"**Agent:** {item['agent']}\n"
                action_items += f"**Issue:** {item['details']}\n"
                action_items += f"**Priority:** P0 - Production Blocker\n"
                action_items += f"**Action Required:** [TODO: Add specific remediation steps]\n\n"
        else:
            action_items += "✅ No production blockers!\n\n"
        
        action_items += """## 🟡 IMPORTANT IMPROVEMENTS

"""
        if warning_items:
            for i, item in enumerate(warning_items[:5], 1):  # Top 5
                action_items += f"### {i}. {item['category']}\n"
                action_items += f"**Agent:** {item['agent']}\n"
                action_items += f"**Issue:** {item['details']}\n"
                action_items += f"**Priority:** P1 - Important\n"
                action_items += f"**Action Required:** [TODO: Add specific improvements]\n\n"
        
        action_items += f"""## 📊 Overall Progress

- **Critical Issues:** {len(critical_items)}
- **Warnings:** {len(warning_items)}
- **Agents Completed:** 3/3
- **Next Round:** {self.round_number + 1:02d}

## Ready for Next Round?

- [ ] All P0 blockers resolved
- [ ] P1 improvements planned
- [ ] Database optimizations applied
- [ ] Feature gaps closed
- [ ] UX polish complete

"""
        
        action_items_path = self.round_dir / "05_PRIORITY_ACTION_ITEMS.md"
        action_items_path.write_text(action_items)
        print(f"✅ Action items saved to {action_items_path}")
    
    def _save_findings(self, filename: str, findings: Dict):
        """Save agent findings to markdown file."""
        output_path = self.round_dir / filename
        
        md_content = f"""# {findings['agent']} - Round {self.round_number:02d}

**Timestamp:** {findings['timestamp']}  
**Scope:** {findings['scope']}

## Findings

"""
        for i, finding in enumerate(findings['findings'], 1):
            severity_emoji = {
                "CRITICAL": "🔴",
                "WARNING": "🟡",
                "INFO": "🔵"
            }.get(finding['severity'], "⚪")
            
            md_content += f"### {i}. {severity_emoji} {finding['category']}\n\n"
            md_content += f"**Status:** {finding['status']}\n"
            md_content += f"**Details:** {finding['details']}\n"
            
            if 'count' in finding:
                md_content += f"**Count:** {finding['count']}\n"
            
            if 'components' in finding:
                md_content += f"**Components:** {', '.join(finding['components'])}\n"
            
            md_content += "\n"
        
        md_content += f"""---
*Generated by {findings['agent']} at {findings['timestamp']}*
"""
        
        output_path.write_text(md_content)
        print(f"  → Saved to {output_path}")
    
    def run_full_audit(self):
        """Execute complete audit with all agents."""
        print(f"\n{'='*60}")
        print(f"🎭 PRODUCTION AUDIT TEAM - ROUND {self.round_number:02d}")
        print(f"{'='*60}\n")
        
        print(f"📁 Output Directory: {self.round_dir}\n")
        
        # Run agents sequentially
        self.run_database_sentinel()
        print()
        self.run_feature_maestro()
        print()
        self.run_experience_architect()
        print()
        
        # Synthesize
        self.synthesize_findings()
        
        print(f"\n{'='*60}")
        print("✨ AUDIT COMPLETE!")
        print(f"{'='*60}")
        print(f"\n📊 Review findings in: {self.round_dir}")
        print(f"\nNext steps:")
        print(f"  1. Review 04_CROSS_AGENT_SYNTHESIS.md")
        print(f"  2. Address items in 05_PRIORITY_ACTION_ITEMS.md")
        print(f"  3. Run Round {self.round_number + 1:02d} after fixes\n")

def main():
    """Main entry point."""
    import sys
    
    round_number = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    
    orchestrator = ProductionAuditOrchestrator(round_number=round_number)
    orchestrator.run_full_audit()

if __name__ == "__main__":
    main()
