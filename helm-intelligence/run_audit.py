#!/usr/bin/env python3
"""
Helm Intelligence - MAXIMUM POWER Audit Runner
Full 200K context, $30 budget, comprehensive analysis.

Budget: $30 USD (~7 full audits)
Context: 200,000 tokens per agent
Thinking: 32,000 tokens extended thinking
Output: 16,384 tokens per response

Usage:
    export ANTHROPIC_API_KEY=your_key_here
    python run_audit.py              # Full audit (~$4)
    python run_audit.py --quick      # Fast audit (~$2)
"""

import asyncio
import os
import sys
import json
import argparse
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from config.settings import Paths, HelmConfig, AuditConfig, WorkflowConfig, Models
from orchestrator.coordinator import Orchestrator
from memory.memory_system import MEMORY_SYSTEM
from tools.toolkit import register_all_tools


# ============================================
# CONFIGURATION - $30 BUDGET, MAXIMUM POWER
# ============================================

DEFAULT_PROJECT_ROOT = os.environ.get(
    "HELM_PROJECT_ROOT", 
    "/Users/ricknini/Downloads/helmv3"
)

BUDGET_USD = 30.0
SLACK_WEBHOOK = os.environ.get("SLACK_WEBHOOK_URL")


# ============================================
# NOTIFICATION HELPERS
# ============================================

def send_slack_notification(message: str, is_error: bool = False):
    """Send notification to Slack (if configured)."""
    if not SLACK_WEBHOOK:
        return
    
    try:
        import urllib.request
        import urllib.parse
        
        emoji = "🔴" if is_error else "✅"
        payload = json.dumps({
            "text": f"{emoji} *Helm Intelligence*\n{message}",
            "mrkdwn": True,
        })
        
        req = urllib.request.Request(
            SLACK_WEBHOOK,
            data=payload.encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"Warning: Could not send Slack notification: {e}")


def log(message: str, level: str = "INFO"):
    """Log with timestamp."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [{level}] {message}")


# ============================================
# MAIN AUDIT FUNCTION
# ============================================

async def run_full_audit(
    project_root: Path,
    audit_code: bool = True,
    audit_database: bool = True,
    audit_ui: bool = True,
    quick_mode: bool = False,
) -> dict:
    """
    Run a comprehensive audit of the codebase.
    
    Returns:
        dict with report, stats, and findings
    """
    start_time = datetime.now()
    
    log("Starting Helm Intelligence audit...")
    log(f"Project root: {project_root}")
    log(f"Audit scope: code={audit_code}, db={audit_database}, ui={audit_ui}")
    
    # Configure the audit
    audit_config = AuditConfig(
        audit_code=audit_code,
        audit_database=audit_database,
        audit_ui=audit_ui,
        deep_analysis=not quick_mode,
        auto_fix_low_risk=False,  # Never auto-fix in overnight runs
        max_concurrent_agents=3 if quick_mode else 4,
    )
    
    helm_config = HelmConfig()
    workflow_config = WorkflowConfig()
    
    # Create orchestrator
    orchestrator = Orchestrator(
        helm_config=helm_config,
        audit_config=audit_config,
        workflow_config=workflow_config,
    )
    
    # Event handler for logging
    def on_event(event):
        event_type = event.get("type", "")
        
        if event_type == "started":
            log("Audit started")
        elif event_type == "phase_started":
            log(f"Phase: {event.get('phase', '').upper()}")
        elif event_type == "phase_completed":
            findings = event.get("total_findings")
            extra = f" ({findings} findings)" if findings else ""
            log(f"Phase completed: {event.get('phase', '').upper()}{extra}")
        elif event_type == "agents_spawned":
            log(f"Spawned {len(event.get('agents', []))} agents")
        elif event_type == "agent_completed":
            log(f"  Agent {event.get('agent_id', '')[:15]} completed: {event.get('findings_count', 0)} findings")
        elif event_type == "agent_failed":
            log(f"  Agent {event.get('agent_id', '')[:15]} FAILED: {event.get('error', '')}", "ERROR")
        elif event_type == "error":
            log(f"Error: {event.get('error')}", "ERROR")
        elif event_type == "completed":
            log(f"Audit complete! Report: {event.get('report_path', '')}")
    
    orchestrator.on_event(on_event)
    
    try:
        # Run the audit
        report = await orchestrator.run_full_audit(project_root=project_root)
        
        # Calculate summary
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
        all_findings = (
            orchestrator.state.code_findings +
            orchestrator.state.db_findings +
            orchestrator.state.ui_findings
        )
        
        critical = len([f for f in all_findings if f.get("severity") == "critical"])
        high = len([f for f in all_findings if f.get("severity") == "high"])
        medium = len([f for f in all_findings if f.get("severity") == "medium"])
        low = len([f for f in all_findings if f.get("severity") == "low"])
        
        result = {
            "success": True,
            "workflow_id": orchestrator.state.workflow_id,
            "duration_seconds": duration,
            "findings": {
                "total": len(all_findings),
                "critical": critical,
                "high": high,
                "medium": medium,
                "low": low,
            },
            "cost": {
                "estimated_usd": orchestrator.state.estimated_cost,
                "input_tokens": orchestrator.state.total_input_tokens,
                "output_tokens": orchestrator.state.total_output_tokens,
            },
            "report_path": str(Paths.REPORTS / f"audit_report_{orchestrator.state.workflow_id}.md"),
        }
        
        # Log summary
        log("=" * 50)
        log("AUDIT COMPLETE - MAXIMUM POWER MODE")
        log("=" * 50)
        log(f"Duration: {duration:.0f} seconds")
        log(f"Total findings: {len(all_findings)}")
        log(f"  Critical: {critical}")
        log(f"  High: {high}")
        log(f"  Medium: {medium}")
        log(f"  Low: {low}")
        log(f"")
        log(f"💰 BUDGET TRACKING ($30 total)")
        log(f"  This audit: ${orchestrator.state.estimated_cost:.2f}")
        log(f"  Remaining: ${30.0 - orchestrator.state.estimated_cost:.2f}")
        log(f"  Tokens: {orchestrator.state.total_input_tokens + orchestrator.state.total_output_tokens:,}")
        log(f"")
        log(f"Report: {result['report_path']}")
        
        # Send notification
        if critical > 0:
            send_slack_notification(
                f"Audit found *{critical} critical* issues!\n"
                f"Total: {len(all_findings)} findings\n"
                f"Duration: {duration:.0f}s | Cost: ${orchestrator.state.estimated_cost:.2f}",
                is_error=True
            )
        else:
            send_slack_notification(
                f"Audit complete: {len(all_findings)} findings\n"
                f"Duration: {duration:.0f}s | Cost: ${orchestrator.state.estimated_cost:.2f}"
            )
        
        # Alert if cost is high
        if orchestrator.state.estimated_cost > COST_ALERT_THRESHOLD:
            log(f"Warning: Cost exceeded threshold (${COST_ALERT_THRESHOLD})", "WARN")
        
        # Store learnings in memory
        if critical > 0 or high > 0:
            MEMORY_SYSTEM.semantic.add(
                content=f"Audit on {start_time.date()}: {critical} critical, {high} high priority issues",
                category="audit_history",
                tags=["audit", "summary"],
            )
        
        return result
        
    except Exception as e:
        log(f"Audit failed: {e}", "ERROR")
        send_slack_notification(f"Audit FAILED: {e}", is_error=True)
        
        return {
            "success": False,
            "error": str(e),
        }


# ============================================
# CLI
# ============================================

def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Helm Intelligence - Autonomous Codebase Audit"
    )
    
    parser.add_argument(
        "--path",
        type=str,
        default=DEFAULT_PROJECT_ROOT,
        help="Project root path"
    )
    
    parser.add_argument(
        "--code-only",
        action="store_true",
        help="Only run code audit"
    )
    
    parser.add_argument(
        "--db-only",
        action="store_true",
        help="Only run database audit"
    )
    
    parser.add_argument(
        "--ui-only",
        action="store_true",
        help="Only run UI/UX audit"
    )
    
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Quick mode (less thorough, faster)"
    )
    
    parser.add_argument(
        "--output",
        type=str,
        help="Output JSON results to file"
    )
    
    return parser.parse_args()


async def main():
    """Main entry point."""
    args = parse_args()
    
    # Check for API key
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY environment variable not set")
        sys.exit(1)
    
    # Ensure directories exist
    Paths.ensure_directories()
    register_all_tools()
    
    # Determine what to audit
    audit_code = True
    audit_database = True
    audit_ui = True
    
    if args.code_only:
        audit_database = False
        audit_ui = False
    elif args.db_only:
        audit_code = False
        audit_ui = False
    elif args.ui_only:
        audit_code = False
        audit_database = False
    
    # Run the audit
    result = await run_full_audit(
        project_root=Path(args.path),
        audit_code=audit_code,
        audit_database=audit_database,
        audit_ui=audit_ui,
        quick_mode=args.quick,
    )
    
    # Output results
    if args.output:
        Path(args.output).write_text(json.dumps(result, indent=2))
        log(f"Results written to {args.output}")
    
    # Exit code based on critical findings
    if not result.get("success"):
        sys.exit(1)
    elif result.get("findings", {}).get("critical", 0) > 0:
        sys.exit(2)  # Exit code 2 = critical issues found
    else:
        sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
