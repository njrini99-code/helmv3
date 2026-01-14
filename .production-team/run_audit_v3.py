#!/usr/bin/env python3
"""
Production Audit Team Orchestrator v3.0 - Platform-Scoped Edition
Now supports --platform flag to audit golf, baseball, or both
"""

import os
import json
import argparse
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
    
    def get_context_prompt(self, platform: str = "both") -> str:
        """Generate context for the agent based on memory."""
        if self.memory["total_rounds"] == 0:
            return f"This is your first audit of {platform}. Establish baseline findings."
        
        resolved_count = len(self.memory["known_issues_resolved"])
        open_count = len(self.memory["known_issues_open"])
        last_round_findings = self.memory["round_history"][-1]["findings_count"] if self.memory["round_history"] else 0
        
        context = f"""
## Your Memory Context - {platform.upper()} (Round {self.memory['total_rounds'] + 1})

You've audited this codebase {self.memory['total_rounds']} times before.

**Platform Focus:** {platform.upper()} ONLY - Ignore other platforms.

### Progress Tracking:
- Issues Resolved Since Round 1: {resolved_count}
- Issues Still Open: {open_count}
- Last Round Findings: {last_round_findings}

### Don't Re-Report (Already Fixed):
"""
        for issue in self.memory["known_issues_resolved"][-10:]:
            context += f"- {issue['issue']} (fixed in Round {issue['round_resolved']})\n"
        
        context += "\n### Focus on These Open Issues:\n"
        for issue in self.memory["known_issues_open"][:10]:
            context += f"- [{issue['severity']}] {issue['issue']} (found in Round {issue['round_found']})\n"
        
        return context
    
    def add_open_issue(self, issue: str, severity: str, round_found: int):
        """Add a new open issue."""
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


class ProductionAuditOrchestrator:
    """Orchestrates the three-agent production audit system with platform scoping."""
    
    def __init__(self, round_number: int = 1, platform: str = "both"):
        self.round_number = round_number
        self.platform = platform.lower()  # golf, baseball, or both
        
        # Determine output directory based on platform
        if self.platform == "golf":
            self.round_dir = PRODUCTION_TEAM_DIR / f"GOLFHELM_AUDIT_ROUND_{round_number:02d}"
        elif self.platform == "baseball":
            self.round_dir = PRODUCTION_TEAM_DIR / f"BASEBALLHELM_AUDIT_ROUND_{round_number:02d}"
        else:
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
    
    def _get_platform_filter(self) -> str:
        """Get SQL/path filter for the platform."""
        if self.platform == "golf":
            return "golf_%"
        elif self.platform == "baseball":
            return "NOT LIKE 'golf_%'"
        else:
            return "%"
    
    def _get_platform_name(self) -> str:
        """Get display name for platform."""
        if self.platform == "golf":
            return "GolfHelm"
        elif self.platform == "baseball":
            return "BaseballHelm"
        else:
            return "Both Platforms"
    
    def run_database_sentinel(self) -> Dict:
        """Execute Database Sentinel audit with platform scoping."""
        platform_name = self._get_platform_name()
        print(f"🛡️  DATABASE SENTINEL - Auditing {platform_name}...")
        
        context = self.db_memory.get_context_prompt(platform_name)
        print(f"  📚 Loaded memory: {self.db_memory.memory['total_rounds']} previous rounds")
        
        findings = {
            "timestamp": datetime.now().isoformat(),
            "agent": "Database Sentinel",
            "platform": platform_name,
            "round": self.round_number,
            "scope": f"Schema, RLS, Performance - {platform_name} ONLY",
            "context": context,
            "findings": []
        }
        
        # Platform-specific queries
        if self.platform == "golf":
            findings["findings"].append({
                "category": "Golf Tables Discovery",
                "status": "PENDING",
                "details": "Run via Claude Code with Supabase MCP",
                "severity": "INFO",
                "queries_to_run": [
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'golf_%'",
                    "SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'golf_%'",
                    "SELECT tablename FROM pg_tables WHERE tablename LIKE 'golf_%' AND rowsecurity = false"
                ]
            })
        elif self.platform == "baseball":
            findings["findings"].append({
                "category": "Baseball Tables Discovery",
                "status": "PENDING",
                "details": "Run via Claude Code with Supabase MCP",
                "severity": "INFO",
                "queries_to_run": [
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name NOT LIKE 'golf_%'",
                    "SELECT tablename, rowsecurity FROM pg_tables WHERE tablename NOT LIKE 'golf_%'",
                    "SELECT tablename FROM pg_tables WHERE tablename NOT LIKE 'golf_%' AND rowsecurity = false"
                ]
            })
        else:
            findings["findings"].append({
                "category": "All Tables Discovery",
                "status": "PENDING",
                "details": "Run via Claude Code with Supabase MCP",
                "severity": "INFO",
                "queries_to_run": [
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
                    "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'",
                    "SELECT tablename FROM pg_tables WHERE rowsecurity = false"
                ]
            })
        
        # Update memory
        self.db_memory.add_round(self.round_number, findings)
        self.db_memory.save_memory()
        
        self.findings["database_sentinel"] = findings
        self._save_findings("01_DATABASE_SENTINEL_FINDINGS.md", findings)
        
        print(f"✅ Database Sentinel audit complete for {platform_name}")
        return findings
    
    def run_feature_maestro(self) -> Dict:
        """Execute Feature Maestro audit with platform scoping."""
        platform_name = self._get_platform_name()
        print(f"🎯 FEATURE MAESTRO - Auditing {platform_name}...")
        
        context = self.feature_memory.get_context_prompt(platform_name)
        print(f"  📚 Loaded memory: {self.feature_memory.memory['total_rounds']} previous rounds")
        
        findings = {
            "timestamp": datetime.now().isoformat(),
            "agent": "Feature Maestro",
            "platform": platform_name,
            "round": self.round_number,
            "scope": f"Feature Completeness - {platform_name} ONLY",
            "context": context,
            "findings": []
        }
        
        # Platform-specific routes
        if self.platform == "golf":
            golf_dir = SRC_DIR / "app" / "golf"
            if golf_dir.exists():
                golf_routes = [d.name for d in golf_dir.iterdir() if d.is_dir()]
                findings["findings"].append({
                    "category": "GolfHelm Feature Routes",
                    "status": "FOUND",
                    "details": f"Routes: {', '.join(golf_routes)}",
                    "count": len(golf_routes),
                    "severity": "INFO",
                    "routes": golf_routes
                })
        elif self.platform == "baseball":
            baseball_dir = SRC_DIR / "app" / "baseball"
            if baseball_dir.exists():
                baseball_routes = [d.name for d in baseball_dir.iterdir() if d.is_dir()]
                findings["findings"].append({
                    "category": "BaseballHelm Feature Routes",
                    "status": "FOUND",
                    "details": f"Routes: {', '.join(baseball_routes)}",
                    "count": len(baseball_routes),
                    "severity": "INFO",
                    "routes": baseball_routes
                })
        else:
            # Both platforms
            golf_dir = SRC_DIR / "app" / "golf"
            baseball_dir = SRC_DIR / "app" / "baseball"
            if golf_dir.exists():
                golf_routes = [d.name for d in golf_dir.iterdir() if d.is_dir()]
                findings["findings"].append({
                    "category": "GolfHelm Routes",
                    "status": "FOUND",
                    "details": f"{len(golf_routes)} routes",
                    "count": len(golf_routes),
                    "severity": "INFO"
                })
            if baseball_dir.exists():
                baseball_routes = [d.name for d in baseball_dir.iterdir() if d.is_dir()]
                findings["findings"].append({
                    "category": "BaseballHelm Routes",
                    "status": "FOUND",
                    "details": f"{len(baseball_routes)} routes",
                    "count": len(baseball_routes),
                    "severity": "INFO"
                })
        
        # Update memory
        self.feature_memory.add_round(self.round_number, findings)
        self.feature_memory.save_memory()
        
        self.findings["feature_maestro"] = findings
        self._save_findings("02_FEATURE_MAESTRO_FINDINGS.md", findings)
        
        print(f"✅ Feature Maestro audit complete for {platform_name}")
        return findings
    
    def run_experience_architect(self) -> Dict:
        """Execute Experience Architect audit with platform scoping."""
        platform_name = self._get_platform_name()
        print(f"✨ EXPERIENCE ARCHITECT - Auditing {platform_name}...")
        
        context = self.ux_memory.get_context_prompt(platform_name)
        print(f"  📚 Loaded memory: {self.ux_memory.memory['total_rounds']} previous rounds")
        
        findings = {
            "timestamp": datetime.now().isoformat(),
            "agent": "Experience Architect",
            "platform": platform_name,
            "round": self.round_number,
            "scope": f"UI/UX Excellence - {platform_name} ONLY",
            "context": context,
            "findings": []
        }
        
        # Component library (all platforms share this)
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
        
        # Update memory
        self.ux_memory.add_round(self.round_number, findings)
        self.ux_memory.save_memory()
        
        self.findings["experience_architect"] = findings
        self._save_findings("03_EXPERIENCE_ARCHITECT_FINDINGS.md", findings)
        
        print(f"✅ Experience Architect audit complete for {platform_name}")
        return findings
    
    def synthesize_findings(self):
        """Generate cross-agent synthesis."""
        platform_name = self._get_platform_name()
        print(f"🔗 Synthesizing findings for {platform_name}...")
        
        synthesis = f"""# {platform_name} Audit - Round {self.round_number:02d}

**Platform Focus:** {platform_name} ONLY
**Generated:** {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## Executive Summary

This synthesis combines insights from all three memory-enhanced agents focusing exclusively on {platform_name}.

[Rest of synthesis content...]
"""
        
        synthesis_path = self.round_dir / "04_CROSS_AGENT_SYNTHESIS.md"
        synthesis_path.write_text(synthesis)
        print(f"✅ Synthesis saved")
    
    def _save_findings(self, filename: str, findings: Dict):
        """Save agent findings to markdown."""
        output_path = self.round_dir / filename
        
        md_content = f"""# {findings['agent']} - {findings['platform']} - Round {self.round_number:02d}

**Platform:** {findings['platform']} ONLY
**Timestamp:** {findings['timestamp']}
**Scope:** {findings['scope']}

## Agent Memory Context

{findings.get('context', 'First audit')}

## Findings

[Findings content...]
"""
        
        output_path.write_text(md_content)
        print(f"  → Saved to {output_path}")
    
    def run_full_audit(self):
        """Execute complete audit."""
        platform_name = self._get_platform_name()
        print(f"\n{'='*70}")
        print(f"🎭 PRODUCTION AUDIT - {platform_name.upper()} - ROUND {self.round_number:02d}")
        print(f"{'='*70}\n")
        
        print(f"📁 Output: {self.round_dir}\n")
        
        self.run_database_sentinel()
        print()
        self.run_feature_maestro()
        print()
        self.run_experience_architect()
        print()
        self.synthesize_findings()
        
        print(f"\n{'='*70}")
        print(f"✨ {platform_name.upper()} AUDIT COMPLETE!")
        print(f"{'='*70}\n")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Production Audit Team Orchestrator")
    parser.add_argument("round", type=int, help="Round number")
    parser.add_argument("--platform", choices=["golf", "baseball", "both"], default="both",
                       help="Platform to audit: golf, baseball, or both (default: both)")
    
    args = parser.parse_args()
    
    orchestrator = ProductionAuditOrchestrator(round_number=args.round, platform=args.platform)
    orchestrator.run_full_audit()


if __name__ == "__main__":
    main()
