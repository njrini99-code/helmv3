#!/usr/bin/env python3
"""
Helm Intelligence - Main Entry Point
Ultra-powerful multi-agent system for codebase auditing and improvement.

Usage:
    python -m helm_intelligence audit [--full] [--code] [--db] [--ui]
    python -m helm_intelligence report <workflow_id>
    python -m helm_intelligence resume <checkpoint_id>
"""

import asyncio
import argparse
import sys
import json
from datetime import datetime
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from config.settings import Paths, HelmConfig, AuditConfig, WorkflowConfig
from orchestrator.coordinator import Orchestrator
from memory.memory_system import MEMORY_SYSTEM
from tools.toolkit import register_all_tools


async def cmd_audit(args):
    """Run a full audit of the codebase."""
    print("""
╔═══════════════════════════════════════════════════════════════╗
║           HELM INTELLIGENCE - CODEBASE AUDIT                  ║
║         Ultra-Powerful Multi-Agent Analysis System            ║
╚═══════════════════════════════════════════════════════════════╝
""")
    
    audit_config = AuditConfig(
        audit_code=args.code or args.full,
        audit_database=args.db or args.full,
        audit_ui=args.ui or args.full,
        deep_analysis=args.deep,
        auto_fix_low_risk=args.fix,
        output_format=args.format,
    )
    
    if not (args.code or args.db or args.ui):
        audit_config.audit_code = True
        audit_config.audit_database = True
        audit_config.audit_ui = True
    
    orchestrator = Orchestrator(
        helm_config=HelmConfig(),
        audit_config=audit_config,
        workflow_config=WorkflowConfig(),
    )
    
    def on_event(event):
        event_type = event.get("type", "")
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        if event_type == "started":
            print(f"[{timestamp}] 🚀 Starting audit of {event.get('project_root')}")
        elif event_type == "phase_started":
            print(f"[{timestamp}] 📋 Phase: {event.get('phase', '').upper()}")
        elif event_type == "phase_completed":
            findings = event.get("total_findings", "")
            extra = f" - {findings} findings" if findings else ""
            print(f"[{timestamp}] ✅ Completed: {event.get('phase', '').upper()}{extra}")
        elif event_type == "agents_spawned":
            print(f"[{timestamp}] 🤖 Spawned {len(event.get('agents', []))} agents")
        elif event_type == "agent_completed":
            print(f"[{timestamp}]    └─ {event.get('agent_id', '')[:20]}: {event.get('findings_count', 0)} findings")
        elif event_type == "agent_failed":
            print(f"[{timestamp}]    └─ ❌ {event.get('agent_id', '')[:20]}: {event.get('error', '')[:50]}")
        elif event_type == "error":
            print(f"[{timestamp}] ❌ Error: {event.get('error')}")
        elif event_type == "completed":
            print(f"[{timestamp}] 🎉 Audit complete! Report: {event.get('report_path', '')}")
    
    orchestrator.on_event(on_event)
    project_root = Path(args.path) if args.path else Paths.PROJECT_ROOT
    
    try:
        report = await orchestrator.run_full_audit(project_root=project_root, resume_from=args.resume)
        
        all_findings = orchestrator.state.code_findings + orchestrator.state.db_findings + orchestrator.state.ui_findings
        critical = len([f for f in all_findings if f.get("severity") == "critical"])
        high = len([f for f in all_findings if f.get("severity") == "high"])
        
        print(f"""
{'='*60}
AUDIT SUMMARY
{'='*60}
Total Findings: {len(all_findings)}
  🔴 Critical: {critical}
  🟠 High:     {high}
  
Estimated Cost: ${orchestrator.state.estimated_cost:.2f}
Reports saved to: {Paths.REPORTS}
""")
        return 0 if critical == 0 else 1
        
    except KeyboardInterrupt:
        print("\n⚠️  Audit interrupted. State saved.")
        return 130
    except Exception as e:
        print(f"\n❌ Audit failed: {e}")
        return 1


def main():
    parser = argparse.ArgumentParser(prog="helm-intelligence", description="Multi-agent codebase auditing")
    subparsers = parser.add_subparsers(dest="command")
    
    audit_parser = subparsers.add_parser("audit", help="Run audit")
    audit_parser.add_argument("--full", action="store_true")
    audit_parser.add_argument("--code", action="store_true")
    audit_parser.add_argument("--db", action="store_true")
    audit_parser.add_argument("--ui", action="store_true")
    audit_parser.add_argument("--deep", action="store_true", default=True)
    audit_parser.add_argument("--fix", action="store_true")
    audit_parser.add_argument("--format", default="json")
    audit_parser.add_argument("--path", type=str)
    audit_parser.add_argument("--resume", type=str)
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 0
    
    Paths.ensure_directories()
    register_all_tools()
    
    if args.command == "audit":
        return asyncio.run(cmd_audit(args))
    return 0


if __name__ == "__main__":
    sys.exit(main())
