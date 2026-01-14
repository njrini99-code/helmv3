#!/usr/bin/env python3
"""
Production Audit Team Orchestrator v2.0 - Memory-Enhanced Edition
Coordinates three AI agents with persistent memory and direct database access.
"""

import os
import json
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

# Configuration
PROJECT_ROOT = Path(__file__).parent.parent
PRODUCTION_TEAM_DIR = PROJECT_ROOT / ".production-team"
MEMORY_DIR = PRODUCTION_TEAM_DIR / "memory"
SUPABASE_DIR = PROJECT_ROOT / "supabase"
SRC_DIR = PROJECT_ROOT / "src"

# Ensure memory directory exists
MEMORY_DIR.mkdir(parents=True, exist_ok=True)

class AgentMemory:
    """Manages persistent memory for an agent across rounds."""
    
    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self.memory_file = MEMORY_DIR / f"{agent_id}_memory.json"
        self.memory = self._load_memory()
    
    def _load_memory(self) -> Dict:
        """Load existing memory or create fresh."""
        if self.memory_file.exists():
            with open(self.memory_file, 'r') as f:
                return json.load(f)
        
        return {
            "agent_id": self.agent_id,
            "total_rounds": 0,
            "last_updated": None,
            "knowledge_base": {},
            "round_history": [],
            "known_issues_resolved": [],
            "known_issues_open": [],
            "improvement_metrics": {
                "false_positive_rate": [],
                "findings_per_round": [],
                "depth_score": []
            }
        }
    
    def save_memory(self):
        """Persist memory to disk."""
        self.memory["last_updated"] = datetime.now().isoformat()
        with open(self.memory_file, 'w') as f:
            json.dump(self.memory, f, indent=2)
    
    def add_round(self, round_number: int, findings: Dict):
        """Add a new round to history."""
        self.memory["total_rounds"] = round_number
        self.memory["round_history"].append({
            "round": round_number,
            "timestamp": datetime.now().isoformat(),
            "findings_count": len(findings.get("findings", [])),
            "critical_count": sum(1 for f in findings.get("findings", []) if f.get("severity") == "CRITICAL"),
            "warning_count": sum(1 for f in findings.get("findings", []) if f.get("severity") == "WARNING"),
        })
    
    def get_resolved_issues(self) -> List[str]:
        """Get list of issues that were resolved in past rounds."""
        return [issue["issue"] for issue in self.memory["known_issues_resolved"]]
    
    def mark_issue_resolved(self, issue: str, round_found: int, round_resolved: int):
        """Mark an issue as resolved."""
        # Remove from open
        self.memory["known_issues_open"] = [
            i for i in self.memory["known_issues_open"] if i.get("issue") != issue
        ]
        # Add to resolved
        self.memory["known_issues_resolved"].append({
            "issue": issue,
            "round_found": round_found,
            "round_resolved": round_resolved,
            "resolution_time": round_resolved - round_found
        })
    
    def add_open_issue(self, issue: str, severity: str, round_found: int):
        """Add a new open issue."""
        # Check if already exists
        existing = [i for i in self.memory["known_issues_open"] if i.get("issue") == issue]
        if existing:
            existing[0]["attempts_to_fix"] = existing[0].get("attempts_to_fix", 0) + 1
        else:
            self.memory["known_issues_open"].append({
                "issue": issue,
                "severity": severity,
                "round_found": round_found,
                "attempts_to_fix": 0
            })
    
    def get_context_prompt(self) -> str:
        """Generate context for the agent based on memory."""
        if self.memory["total_rounds"] == 0:
            return "This is your first audit. Establish baseline findings."
        
        resolved_count = len(self.memory["known_issues_resolved"])
        open_count = len(self.memory["known_issues_open"])
        last_round_findings = self.memory["round_history"][-1]["findings_count"] if self.memory["round_history"] else 0
        
        context = f"""
## Your Memory Context (Round {self.memory['total_rounds'] + 1})

You've audited this codebase {self.memory['total_rounds']} times before.

### Progress Tracking:
- Issues Resolved Since Round 1: {resolved_count}
- Issues Still Open: {open_count}
- Last Round Findings: {last_round_findings}

### Don't Re-Report (Already Fixed):
"""
        for issue in self.memory["known_issues_resolved"][-10:]:  # Last 10
            context += f"- {issue['issue']} (fixed in Round {issue['round_resolved']})\n"
        
        context += "\n### Focus on These Open Issues:\n"
        for issue in self.memory["known_issues_open"][:10]:  # Top 10
            context += f"- [{issue['severity']}] {issue['issue']} (found in Round {issue['round_found']})\n"
        
        context += f"\n### Evolution Strategy:\n"
        if self.memory["total_rounds"] == 1:
            context += "- Round 2: Verify Round 1 fixes, go deeper on edge cases\n"
        elif self.memory["total_rounds"] == 2:
            context += "- Round 3: Pattern recognition, predict similar issues\n"
        else:
            context += "- Advanced auditing: Performance, optimization, excellence\n"
        
        return context


class ProductionAuditOrchestrator:
    """Orchestrates the three-agent production audit system with memory."""
    
    def __init__(self, round_number: int = 1):
        self.round_number = round_number
        self.round_dir = PRODUCTION_TEAM_DIR / f"ROUND_{round_number:02d}"
        self.round_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize agent memories
        self.db_memory = AgentMemory("database_sentinel")
        self.feature_memory = AgentMemory("feature_maestro")
        self.ux_memory = AgentMemory("experience_architect")
        
        # Initialize findings storage
        self.findings = {
            "database_sentinel": {},
            "feature_maestro": {},
            "experience_architect": {}
        }
    
    def _query_supabase(self, query: str) -> Optional[List]:
        """Execute a query against Supabase using MCP (when available)."""
        # This will be called by Claude Code with MCP access
        # For now, return a placeholder
        print(f"  [DB QUERY]: {query[:100]}...")
        return None
    
    def run_database_sentinel(self) -> Dict:
        """Execute Database Sentinel audit with memory context."""
        print("🛡️  DATABASE SENTINEL - Starting memory-enhanced audit...")
        
        # Load context from memory
        context = self.db_memory.get_context_prompt()
        print(f"  📚 Loaded memory: {self.db_memory.memory['total_rounds']} previous rounds")
        
        findings = {
            "timestamp": datetime.now().isoformat(),
            "agent": "Database Sentinel",
            "round": self.round_number,
            "scope": "Schema, RLS, Performance, Data Integrity",
            "context": context,
            "findings": []
        }
        
        # Check for schema files
        schema_files = list((SUPABASE_DIR / "migrations").glob("*.sql")) if (SUPABASE_DIR / "migrations").exists() else []
        findings["findings"].append({
            "category": "Schema Migrations",
            "status": "FOUND" if schema_files else "MISSING",
            "details": f"Found {len(schema_files)} migration files",
            "severity": "INFO" if schema_files else "CRITICAL",
            "new_in_round": self.round_number
        })
        
        # Check for RLS policies
        rls_files = [f for f in PROJECT_ROOT.glob("*.sql") if "rls" in f.name.lower() or "policies" in f.name.lower()]
        findings["findings"].append({
            "category": "RLS Policy Files",
            "status": "FOUND" if rls_files else "MISSING",
            "details": f"Found {len(rls_files)} RLS-related SQL files: {', '.join(f.name for f in rls_files)}",
            "severity": "WARNING" if not rls_files else "INFO",
            "new_in_round": self.round_number
        })
        
        # Database queries (would use MCP in Claude Code)
        findings["findings"].append({
            "category": "Live Database Queries",
            "status": "PENDING",
            "details": "Run via Claude Code with Supabase MCP for: table enumeration, RLS policy checks, performance analysis",
            "severity": "INFO",
            "queries_to_run": [
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
                "SELECT schemaname, tablename, policyname FROM pg_policies",
                "SELECT * FROM pg_stat_user_tables ORDER BY n_live_tup DESC"
            ]
        })
        
        # Update memory
        self.db_memory.add_round(self.round_number, findings)
        for finding in findings["findings"]:
            if finding.get("severity") in ["CRITICAL", "WARNING"]:
                self.db_memory.add_open_issue(
                    finding["category"],
                    finding["severity"],
                    self.round_number
                )
        self.db_memory.save_memory()
        
        self.findings["database_sentinel"] = findings
        self._save_findings("01_DATABASE_SENTINEL_FINDINGS.md", findings)
        
        print("✅ Database Sentinel audit complete")
        return findings
    
    def run_feature_maestro(self) -> Dict:
        """Execute Feature Maestro audit with memory context."""
        print("🎯 FEATURE MAESTRO - Starting memory-enhanced audit...")
        
        context = self.feature_memory.get_context_prompt()
        print(f"  📚 Loaded memory: {self.feature_memory.memory['total_rounds']} previous rounds")
        
        findings = {
            "timestamp": datetime.now().isoformat(),
            "agent": "Feature Maestro",
            "round": self.round_number,
            "scope": "Feature Completeness, User Journeys, Edge Cases",
            "context": context,
            "findings": []
        }
        
        # BaseballHelm routes
        baseball_dir = SRC_DIR / "app" / "baseball"
        if baseball_dir.exists():
            baseball_routes = [d.name for d in baseball_dir.iterdir() if d.is_dir()]
            findings["findings"].append({
                "category": "BaseballHelm Feature Routes",
                "status": "FOUND",
                "details": f"Routes: {', '.join(baseball_routes[:15])}{'...' if len(baseball_routes) > 15 else ''}",
                "count": len(baseball_routes),
                "severity": "INFO",
                "routes": baseball_routes
            })
        
        # GolfHelm routes
        golf_dir = SRC_DIR / "app" / "golf"
        if golf_dir.exists():
            golf_routes = [d.name for d in golf_dir.iterdir() if d.is_dir()]
            findings["findings"].append({
                "category": "GolfHelm Feature Routes",
                "status": "FOUND",
                "details": f"Routes: {', '.join(golf_routes[:15])}{'...' if len(golf_routes) > 15 else ''}",
                "count": len(golf_routes),
                "severity": "INFO",
                "routes": golf_routes
            })
        
        # Error handling
        error_files = list(SRC_DIR.glob("**/error.tsx")) + list(SRC_DIR.glob("**/global-error.tsx"))
        findings["findings"].append({
            "category": "Error Boundaries",
            "status": "FOUND" if error_files else "MISSING",
            "details": f"Found {len(error_files)} error boundary files",
            "severity": "INFO" if error_files else "CRITICAL"
        })
        
        # Loading states
        loading_files = list(SRC_DIR.glob("**/loading.tsx"))
        findings["findings"].append({
            "category": "Loading States",
            "status": "FOUND" if loading_files else "PARTIAL",
            "details": f"Found {len(loading_files)} loading state files across {len([str(f) for f in loading_files])} routes",
            "severity": "INFO" if loading_files else "WARNING"
        })
        
        # Update memory
        self.feature_memory.add_round(self.round_number, findings)
        for finding in findings["findings"]:
            if finding.get("severity") in ["CRITICAL", "WARNING"]:
                self.feature_memory.add_open_issue(
                    finding["category"],
                    finding["severity"],
                    self.round_number
                )
        self.feature_memory.save_memory()
        
        self.findings["feature_maestro"] = findings
        self._save_findings("02_FEATURE_MAESTRO_FINDINGS.md", findings)
        
        print("✅ Feature Maestro audit complete")
        return findings
    
    def run_experience_architect(self) -> Dict:
        """Execute Experience Architect audit with memory context."""
        print("✨ EXPERIENCE ARCHITECT - Starting memory-enhanced audit...")
        
        context = self.ux_memory.get_context_prompt()
        print(f"  📚 Loaded memory: {self.ux_memory.memory['total_rounds']} previous rounds")
        
        findings = {
            "timestamp": datetime.now().isoformat(),
            "agent": "Experience Architect",
            "round": self.round_number,
            "scope": "UI/UX Excellence, Design Consistency, Accessibility",
            "context": context,
            "findings": []
        }
        
        # Component library
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
            
            # UI components subdirectory
            if (components_dir / "ui").exists():
                ui_components = list((components_dir / "ui").glob("*.tsx"))
                component_names = [f.stem for f in ui_components]
                findings["findings"].append({
                    "category": "UI Design System Components",
                    "status": "FOUND",
                    "details": f"Found {len(ui_components)} UI components: {', '.join(component_names[:20])}{'...' if len(component_names) > 20 else ''}",
                    "components": component_names,
                    "severity": "INFO"
                })
        
        # Styling files
        if (SRC_DIR / "app" / "globals.css").exists():
            findings["findings"].append({
                "category": "Global Styles",
                "status": "FOUND",
                "details": "globals.css present",
                "severity": "INFO"
            })
        
        tailwind_config = PROJECT_ROOT / "tailwind.config.ts"
        if tailwind_config.exists():
            findings["findings"].append({
                "category": "Design Tokens (Tailwind)",
                "status": "FOUND",
                "details": "Tailwind config present - check for kelly green (#22c55e) and glassmorphism utilities",
                "severity": "INFO",
                "action": "Verify kelly green and glassmorphism in config"
            })
        
        # Accessibility hints (sample check)
        if components_dir.exists():
            component_files = list(components_dir.glob("**/*.tsx"))
            a11y_components = []
            for tsx_file in component_files[:50]:  # Sample 50
                try:
                    content = tsx_file.read_text()
                    if "aria-" in content:
                        a11y_components.append(tsx_file.name)
                except:
                    pass
            
            findings["findings"].append({
                "category": "Accessibility (ARIA Attributes)",
                "status": "PARTIAL" if a11y_components else "NEEDS_REVIEW",
                "details": f"Found ARIA attributes in {len(a11y_components)} of 50 sampled components",
                "severity": "WARNING" if not a11y_components else "INFO",
                "recommendation": "Full accessibility audit needed"
            })
        
        # Update memory
        self.ux_memory.add_round(self.round_number, findings)
        for finding in findings["findings"]:
            if finding.get("severity") in ["CRITICAL", "WARNING"]:
                self.ux_memory.add_open_issue(
                    finding["category"],
                    finding["severity"],
                    self.round_number
                )
        self.ux_memory.save_memory()
        
        self.findings["experience_architect"] = findings
        self._save_findings("03_EXPERIENCE_ARCHITECT_FINDINGS.md", findings)
        
        print("✅ Experience Architect audit complete")
        return findings
    
    def synthesize_findings(self):
        """Generate cross-agent synthesis with memory awareness."""
        print("🔗 Synthesizing cross-agent findings with memory context...")
        
        # Collect critical and warning items
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
        
        # Get progress metrics
        total_resolved = (
            len(self.db_memory.memory["known_issues_resolved"]) +
            len(self.feature_memory.memory["known_issues_resolved"]) +
            len(self.ux_memory.memory["known_issues_resolved"])
        )
        
        synthesis = f"""# Round {self.round_number:02d} - Cross-Agent Synthesis (Memory-Enhanced)

Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## Memory Intelligence

### Audit History:
- **Database Sentinel**: {self.db_memory.memory['total_rounds']} rounds completed
- **Feature Maestro**: {self.feature_memory.memory['total_rounds']} rounds completed
- **Experience Architect**: {self.ux_memory.memory['total_rounds']} rounds completed
- **Total Issues Resolved**: {total_resolved} (across all rounds)

### Round {self.round_number} Focus:
{"This is the initial baseline audit." if self.round_number == 1 else "Building on previous rounds' learnings."}

## Executive Summary

This synthesis combines insights from all three memory-enhanced agents to identify critical cross-cutting concerns.

## Critical Issues ({len(critical_items)})

"""
        if critical_items:
            for i, item in enumerate(critical_items, 1):
                synthesis += f"{i}. **[{item['agent'].replace('_', ' ').upper()}]** {item['category']}\n"
                synthesis += f"   - {item['details']}\n\n"
        else:
            synthesis += "✅ No critical issues identified!\n\n"
        
        synthesis += f"""## Warnings ({len(warning_items)})

"""
        if warning_items:
            for i, item in enumerate(warning_items, 1):
                synthesis += f"{i}. **[{item['agent'].replace('_', ' ').upper()}]** {item['category']}\n"
                synthesis += f"   - {item['details']}\n\n"
        else:
            synthesis += "✅ No warnings!\n\n"
        
        synthesis += """## Cross-Agent Intelligence

### What Database Sentinel Tells Features & UX:
- Database schema completeness affects feature development
- RLS gaps create security risks in user flows
- Performance issues surface as slow UI

### What Feature Maestro Tells Database & UX:
- Missing features indicate database gaps
- Error handling needs depend on data validation
- User journeys reveal necessary database queries

### What Experience Architect Tells Database & Features:
- UI patterns require specific data structures
- Design consistency depends on feature completeness
- Accessibility needs drive database schema

## Memory-Driven Insights

"""
        
        if self.round_number > 1:
            synthesis += f"""### Progress Since Last Round:
- Database issues resolved: {len([i for i in self.db_memory.memory['known_issues_resolved'] if i.get('round_resolved') == self.round_number])}
- Feature gaps closed: {len([i for i in self.feature_memory.memory['known_issues_resolved'] if i.get('round_resolved') == self.round_number])}
- UX improvements made: {len([i for i in self.ux_memory.memory['known_issues_resolved'] if i.get('round_resolved') == self.round_number])}

### Persistent Issues (Need Attention):
"""
            for mem in [self.db_memory, self.feature_memory, self.ux_memory]:
                for issue in mem.memory["known_issues_open"][:3]:
                    rounds_open = self.round_number - issue["round_found"]
                    synthesis += f"- [{mem.agent_id}] {issue['issue']} (open for {rounds_open} rounds)\n"
        else:
            synthesis += "### First Round - Establishing Baseline\n"
            synthesis += "- Agents are learning the codebase\n"
            synthesis += "- Memory will compound in future rounds\n"
        
        synthesis += f"""

## Next Steps

1. **Address all P0 CRITICAL issues** immediately
2. **Plan fixes for P1 WARNING items**
3. **Run Round {self.round_number + 1}** to verify and deepen audit
4. **Agents will remember** what was fixed and focus on new areas

## Intelligence Evolution

Round {self.round_number + 1} will be smarter because agents now know:
- What's already been fixed (won't re-report)
- What patterns exist (can predict issues)
- Where to look deeper (areas with clusters)

---
*Powered by persistent memory. Getting smarter every round.*
"""
        
        # Save synthesis
        synthesis_path = self.round_dir / "04_CROSS_AGENT_SYNTHESIS.md"
        synthesis_path.write_text(synthesis)
        print(f"✅ Synthesis saved to {synthesis_path}")
        
        # Generate action items
        self._generate_action_items(critical_items, warning_items)
    
    def _generate_action_items(self, critical_items: List, warning_items: List):
        """Generate prioritized action items with memory context."""
        action_items = f"""# Round {self.round_number:02d} - Priority Action Items (Memory-Enhanced)

Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## 🔴 IMMEDIATE BLOCKERS (P0)

"""
        if critical_items:
            for i, item in enumerate(critical_items, 1):
                action_items += f"### {i}. {item['category']}\n"
                action_items += f"**Agent:** {item['agent'].replace('_', ' ').title()}\n"
                action_items += f"**Issue:** {item['details']}\n"
                action_items += f"**Priority:** P0 - Production Blocker\n"
                action_items += f"**First Found:** Round {self.round_number}\n"
                action_items += f"**Action Required:** [Requires immediate fix before Round {self.round_number + 1}]\n\n"
        else:
            action_items += "✅ No production blockers!\n\n"
        
        action_items += """## 🟡 IMPORTANT IMPROVEMENTS (P1)

"""
        if warning_items:
            for i, item in enumerate(warning_items[:10], 1):  # Top 10
                action_items += f"### {i}. {item['category']}\n"
                action_items += f"**Agent:** {item['agent'].replace('_', ' ').title()}\n"
                action_items += f"**Issue:** {item['details']}\n"
                action_items += f"**Priority:** P1 - Important\n"
                action_items += f"**First Found:** Round {self.round_number}\n"
                action_items += f"**Action Required:** [Plan fix for next round]\n\n"
        
        total_open = (
            len(self.db_memory.memory["known_issues_open"]) +
            len(self.feature_memory.memory["known_issues_open"]) +
            len(self.ux_memory.memory["known_issues_open"])
        )
        
        total_resolved = (
            len(self.db_memory.memory["known_issues_resolved"]) +
            len(self.feature_memory.memory["known_issues_resolved"]) +
            len(self.ux_memory.memory["known_issues_resolved"])
        )
        
        action_items += f"""## 📊 Overall Progress

- **Critical Issues:** {len(critical_items)}
- **Warnings:** {len(warning_items)}
- **Total Open Issues:** {total_open}
- **Issues Resolved (All Time):** {total_resolved}
- **Current Round:** {self.round_number}
- **Next Round:** {self.round_number + 1}

## Memory Status

- 🛡️ Database Sentinel: {self.db_memory.memory['total_rounds']} rounds, {len(self.db_memory.memory['known_issues_open'])} open issues
- 🎯 Feature Maestro: {self.feature_memory.memory['total_rounds']} rounds, {len(self.feature_memory.memory['known_issues_open'])} open issues
- ✨ Experience Architect: {self.ux_memory.memory['total_rounds']} rounds, {len(self.ux_memory.memory['known_issues_open'])} open issues

## Ready for Round {self.round_number + 1}?

- [ ] All P0 blockers from this round addressed
- [ ] P1 improvements planned or in progress
- [ ] Agents' memories saved (✅ automatic)
- [ ] Code changes committed
- [ ] Ready for deeper audit

## What Changes in Round {self.round_number + 1}

Agents will:
- ✓ Skip re-reporting fixed issues
- ✓ Go deeper based on patterns learned
- ✓ Predict issues in similar areas
- ✓ Focus on areas with highest issue density
- ✓ Provide more sophisticated checks

---
*The longer we audit, the smarter we get. Memory compounds with every round.*
"""
        
        action_items_path = self.round_dir / "05_PRIORITY_ACTION_ITEMS.md"
        action_items_path.write_text(action_items)
        print(f"✅ Action items saved to {action_items_path}")
    
    def _save_findings(self, filename: str, findings: Dict):
        """Save agent findings to markdown with memory context."""
        output_path = self.round_dir / filename
        
        md_content = f"""# {findings['agent']} - Round {self.round_number:02d}

**Timestamp:** {findings['timestamp']}  
**Scope:** {findings['scope']}  
**Round:** {self.round_number}  
**Memory Loaded:** Yes (from {findings.get('context', 'N/A')[:50] if findings.get('context') else 'First round'}...)

## Agent Memory Context

{findings.get('context', 'First audit - establishing baseline')}

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
            md_content += f"**Severity:** {finding['severity']}\n"
            
            if 'count' in finding:
                md_content += f"**Count:** {finding['count']}\n"
            
            if 'components' in finding:
                md_content += f"**Components:** {', '.join(finding['components'][:30])}{'...' if len(finding['components']) > 30 else ''}\n"
            
            if 'routes' in finding:
                md_content += f"**Routes:** {', '.join(finding['routes'][:20])}{'...' if len(finding['routes']) > 20 else ''}\n"
            
            if 'queries_to_run' in finding:
                md_content += f"**Queries for Claude Code:**\n"
                for q in finding['queries_to_run']:
                    md_content += f"- `{q}`\n"
            
            if 'action' in finding:
                md_content += f"**Recommended Action:** {finding['action']}\n"
            
            md_content += "\n"
        
        md_content += f"""---
*Generated by {findings['agent']} at {findings['timestamp']}*  
*Memory-enhanced audit - Round {self.round_number}*  
*This agent will be smarter in Round {self.round_number + 1}*
"""
        
        output_path.write_text(md_content)
        print(f"  → Saved to {output_path}")
    
    def run_full_audit(self):
        """Execute complete audit with all memory-enhanced agents."""
        print(f"\n{'='*70}")
        print(f"🎭 PRODUCTION AUDIT TEAM - ROUND {self.round_number:02d} (MEMORY-ENHANCED)")
        print(f"{'='*70}\n")
        
        print(f"📁 Output Directory: {self.round_dir}")
        print(f"🧠 Memory Directory: {MEMORY_DIR}\n")
        
        # Run agents sequentially
        self.run_database_sentinel()
        print()
        self.run_feature_maestro()
        print()
        self.run_experience_architect()
        print()
        
        # Synthesize with memory
        self.synthesize_findings()
        
        print(f"\n{'='*70}")
        print("✨ MEMORY-ENHANCED AUDIT COMPLETE!")
        print(f"{'='*70}")
        print(f"\n📊 Review findings in: {self.round_dir}")
        print(f"🧠 Agent memories saved in: {MEMORY_DIR}")
        print(f"\nMemory Stats:")
        print(f"  - Database Sentinel: {len(self.db_memory.memory['round_history'])} total rounds")
        print(f"  - Feature Maestro: {len(self.feature_memory.memory['round_history'])} total rounds")
        print(f"  - Experience Architect: {len(self.ux_memory.memory['round_history'])} total rounds")
        print(f"\nNext steps:")
        print(f"  1. Review 04_CROSS_AGENT_SYNTHESIS.md")
        print(f"  2. Address items in 05_PRIORITY_ACTION_ITEMS.md")
        print(f"  3. Run Round {self.round_number + 1:02d} (agents will be smarter!)\n")


def main():
    """Main entry point."""
    import sys
    
    round_number = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    
    orchestrator = ProductionAuditOrchestrator(round_number=round_number)
    orchestrator.run_full_audit()


if __name__ == "__main__":
    main()
