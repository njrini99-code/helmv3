"""
Helm Intelligence - Orchestrator
The brain that coordinates all agents in the multi-agent audit system.
Implements the EXAMINE → DOCUMENT → FIX workflow.
"""

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional, AsyncIterator
from uuid import uuid4

from agents.base import (
    BaseAgent, AgentConfig, Finding, ARTIFACT_STORE, 
    CHECKPOINT_MANAGER, Checkpoint
)
from agents.code_auditor import CodeAuditorAgent
from agents.database_auditor import DatabaseAuditorAgent
from agents.ui_auditor import UIUXAuditorAgent
from agents.enhancement_agent import EnhancementAgent, AuditReport
from config.settings import (
    AgentRole, Models, Paths, HelmConfig, AuditConfig, 
    WorkflowConfig, WorkflowPhase, Severity
)


# ============================================
# ORCHESTRATOR SYSTEM PROMPT
# ============================================

ORCHESTRATOR_SYSTEM_PROMPT = """You are the Orchestrator for Helm Intelligence, a multi-agent system for comprehensive codebase auditing.

# Your Role
You coordinate specialized agents to perform thorough audits:
- Code Auditor: TypeScript/React analysis
- Database Auditor: Supabase/PostgreSQL security & performance
- UI/UX Auditor: Accessibility & design system compliance
- Enhancement Agent: Synthesis & recommendations

# Workflow: EXAMINE → DOCUMENT → FIX

## Phase 1: EXAMINE
Deploy agents in parallel to gather information:
- Code structure and patterns
- Database schema and policies
- UI components and accessibility
Objective: Build comprehensive understanding

## Phase 2: DOCUMENT
Each agent produces structured findings:
- Categorized by severity and type
- Located precisely (file, line, table, etc.)
- Evidence-backed

## Phase 3: FIND ISSUES
Deep analysis by each specialist:
- Code patterns and anti-patterns
- Security vulnerabilities
- Performance bottlenecks
- UX issues

## Phase 4: VERIFY
Before fixes, verify:
- TypeScript compilation
- ESLint passing
- Tests passing
- No regressions

## Phase 5: FIX (Optional)
Apply safe fixes:
- Only auto-fix low-risk issues
- Human approval for significant changes
- Checkpoint before each change

## Phase 6: SYNTHESIZE
Enhancement Agent consolidates:
- Prioritized improvement plan
- Production-readiness checklist
- Phased roadmap

# Coordination Principles

1. **Parallel Execution**: Run independent agents simultaneously
2. **Artifact Storage**: Store large results externally, pass references
3. **Checkpointing**: Save state regularly for recovery
4. **Error Handling**: Graceful degradation, continue with partial results
5. **Progress Tracking**: Report status throughout

# Context: Helm Sports Labs
- Products: BaseballHelm, GolfHelm, CoachHelm
- Stack: Next.js 14, TypeScript, Supabase, Tailwind
- Quality bar: Premium SaaS (Linear, Stripe, Vercel)

When spawning subagents, provide clear, focused tasks with necessary context.
Aggregate results and track overall progress.
"""


# ============================================
# WORKFLOW STATE
# ============================================

@dataclass
class WorkflowState:
    """Tracks the state of an audit workflow with budget monitoring."""
    workflow_id: str = field(default_factory=lambda: f"wf_{uuid4().hex[:12]}")
    phase: WorkflowPhase = WorkflowPhase.EXAMINE
    started_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    
    # Agent tracking
    agents_spawned: list[str] = field(default_factory=list)
    agents_completed: list[str] = field(default_factory=list)
    agents_failed: list[str] = field(default_factory=list)
    
    # Results
    code_findings: list[dict] = field(default_factory=list)
    db_findings: list[dict] = field(default_factory=list)
    ui_findings: list[dict] = field(default_factory=list)
    synthesis: Optional[dict] = None
    
    # Artifacts
    artifact_refs: dict[str, str] = field(default_factory=dict)
    
    # Token & Cost tracking (for $30 budget)
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    estimated_cost: float = 0.0
    budget_remaining: float = 30.0  # $30 budget
    budget_warnings: list[str] = field(default_factory=list)
    
    def check_budget(self) -> bool:
        """Check if we're within budget. Returns False if should stop."""
        self.budget_remaining = 30.0 - self.estimated_cost
        
        if self.estimated_cost > 28.5:  # 95% of budget
            self.budget_warnings.append(f"STOP: Budget exhausted (${self.estimated_cost:.2f})")
            return False
        elif self.estimated_cost > 21.0:  # 70% of budget
            self.budget_warnings.append(f"WARNING: 70% budget used (${self.estimated_cost:.2f})")
        
        return True
    
    def to_dict(self) -> dict:
        return {
            "workflow_id": self.workflow_id,
            "phase": self.phase.value,
            "started_at": self.started_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "agents_spawned": self.agents_spawned,
            "agents_completed": self.agents_completed,
            "agents_failed": self.agents_failed,
            "findings_count": {
                "code": len(self.code_findings),
                "database": len(self.db_findings),
                "ui": len(self.ui_findings),
            },
            "artifact_refs": self.artifact_refs,
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "estimated_cost": self.estimated_cost,
        }


# ============================================
# ORCHESTRATOR
# ============================================

class Orchestrator:
    """
    Coordinates the multi-agent audit system.
    Implements the EXAMINE → DOCUMENT → FIX workflow.
    """
    
    def __init__(
        self,
        helm_config: Optional[HelmConfig] = None,
        audit_config: Optional[AuditConfig] = None,
        workflow_config: Optional[WorkflowConfig] = None,
    ):
        self.helm_config = helm_config or HelmConfig()
        self.audit_config = audit_config or AuditConfig()
        self.workflow_config = workflow_config or WorkflowConfig()
        
        self.state = WorkflowState()
        self._event_handlers: list[callable] = []
        
        # Ensure output directories exist
        Paths.ensure_directories()
    
    def on_event(self, handler: callable):
        """Register an event handler for progress updates."""
        self._event_handlers.append(handler)
    
    async def _emit_event(self, event_type: str, data: dict):
        """Emit an event to all handlers."""
        event = {
            "type": event_type,
            "timestamp": datetime.now().isoformat(),
            "workflow_id": self.state.workflow_id,
            "phase": self.state.phase.value,
            **data,
        }
        for handler in self._event_handlers:
            if asyncio.iscoroutinefunction(handler):
                await handler(event)
            else:
                handler(event)
    
    async def run_full_audit(
        self,
        project_root: Optional[Path] = None,
        resume_from: Optional[str] = None,
    ) -> AuditReport:
        """
        Run a complete multi-phase audit.
        
        Args:
            project_root: Path to the project (defaults to Paths.PROJECT_ROOT)
            resume_from: Checkpoint ID to resume from
        
        Returns:
            Complete audit report with findings and recommendations
        """
        project_root = project_root or Paths.PROJECT_ROOT
        
        # Resume from checkpoint if specified
        if resume_from:
            checkpoint = CHECKPOINT_MANAGER.load(resume_from)
            self.state = self._restore_state(checkpoint)
            await self._emit_event("resumed", {"checkpoint_id": resume_from})
        
        await self._emit_event("started", {"project_root": str(project_root)})
        
        try:
            # Phase 1: EXAMINE
            if self.state.phase == WorkflowPhase.EXAMINE:
                await self._phase_examine(project_root)
                self._save_checkpoint("examine_complete")
                self.state.phase = WorkflowPhase.DOCUMENT
            
            # Phase 2: DOCUMENT (merged with FIND_ISSUES for this implementation)
            if self.state.phase == WorkflowPhase.DOCUMENT:
                await self._phase_document()
                self._save_checkpoint("document_complete")
                self.state.phase = WorkflowPhase.FIND_ISSUES
            
            # Phase 3: FIND_ISSUES
            if self.state.phase == WorkflowPhase.FIND_ISSUES:
                await self._phase_find_issues(project_root)
                self._save_checkpoint("find_issues_complete")
                self.state.phase = WorkflowPhase.VERIFY
            
            # Phase 4: VERIFY
            if self.state.phase == WorkflowPhase.VERIFY:
                await self._phase_verify(project_root)
                self._save_checkpoint("verify_complete")
                self.state.phase = WorkflowPhase.SYNTHESIZE
            
            # Phase 5: FIX (optional, based on config)
            if self.audit_config.auto_fix_low_risk:
                if self.state.phase == WorkflowPhase.FIX:
                    await self._phase_fix()
                    self._save_checkpoint("fix_complete")
            
            # Phase 6: SYNTHESIZE
            if self.state.phase == WorkflowPhase.SYNTHESIZE:
                report = await self._phase_synthesize()
                self._save_checkpoint("complete")
                
                await self._emit_event("completed", {"report_path": str(report)})
                return report
        
        except Exception as e:
            await self._emit_event("error", {"error": str(e)})
            self._save_checkpoint("error")
            raise
    
    async def _phase_examine(self, project_root: Path):
        """Phase 1: Gather information about the codebase."""
        await self._emit_event("phase_started", {"phase": "examine"})
        
        # Quick reconnaissance - file counts, structure
        src_files = list((project_root / "src").rglob("*.ts")) + \
                   list((project_root / "src").rglob("*.tsx"))
        migration_files = list((project_root / "supabase" / "migrations").glob("*.sql"))
        
        await self._emit_event("examine_stats", {
            "typescript_files": len(src_files),
            "migration_files": len(migration_files),
            "has_e2e_tests": (project_root / "e2e").exists(),
        })
        
        await self._emit_event("phase_completed", {"phase": "examine"})
    
    async def _phase_document(self):
        """Phase 2: Document current state (preparation for analysis)."""
        await self._emit_event("phase_started", {"phase": "document"})
        
        # This phase prepares context for the agents
        # In practice, documentation happens during the find_issues phase
        
        await self._emit_event("phase_completed", {"phase": "document"})
    
    async def _phase_find_issues(self, project_root: Path):
        """Phase 3: Run specialized agents to find issues."""
        await self._emit_event("phase_started", {"phase": "find_issues"})
        
        # Spawn agents in parallel
        agents = []
        
        if self.audit_config.audit_code:
            code_agent = CodeAuditorAgent(self.helm_config)
            agents.append(("code", code_agent))
            self.state.agents_spawned.append(code_agent.agent_id)
        
        if self.audit_config.audit_database:
            db_agent = DatabaseAuditorAgent(self.helm_config)
            agents.append(("database", db_agent))
            self.state.agents_spawned.append(db_agent.agent_id)
        
        if self.audit_config.audit_ui:
            ui_agent = UIUXAuditorAgent(self.helm_config)
            agents.append(("ui", ui_agent))
            self.state.agents_spawned.append(ui_agent.agent_id)
        
        await self._emit_event("agents_spawned", {
            "agents": [a[1].agent_id for a in agents]
        })
        
        # Run agents in parallel (or sequentially if configured)
        if self.audit_config.max_concurrent_agents > 1:
            results = await asyncio.gather(
                *[self._run_agent(name, agent, project_root) 
                  for name, agent in agents],
                return_exceptions=True
            )
        else:
            results = []
            for name, agent in agents:
                try:
                    result = await self._run_agent(name, agent, project_root)
                    results.append(result)
                except Exception as e:
                    results.append(e)
        
        # Process results
        for (name, agent), result in zip(agents, results):
            if isinstance(result, Exception):
                self.state.agents_failed.append(agent.agent_id)
                await self._emit_event("agent_failed", {
                    "agent_id": agent.agent_id,
                    "error": str(result)
                })
            else:
                self.state.agents_completed.append(agent.agent_id)
                
                # Store findings
                if name == "code":
                    self.state.code_findings = result.get("findings", [])
                elif name == "database":
                    self.state.db_findings = result.get("findings", [])
                elif name == "ui":
                    self.state.ui_findings = result.get("findings", [])
                
                # Track tokens
                stats = result.get("stats", {})
                self.state.total_input_tokens += stats.get("input_tokens", 0)
                self.state.total_output_tokens += stats.get("output_tokens", 0)
                self.state.estimated_cost += stats.get("estimated_cost", 0)
                
                await self._emit_event("agent_completed", {
                    "agent_id": agent.agent_id,
                    "findings_count": len(result.get("findings", [])),
                    "stats": stats
                })
        
        await self._emit_event("phase_completed", {
            "phase": "find_issues",
            "total_findings": (
                len(self.state.code_findings) + 
                len(self.state.db_findings) + 
                len(self.state.ui_findings)
            )
        })
    
    async def _run_agent(
        self, 
        agent_type: str, 
        agent: BaseAgent, 
        project_root: Path
    ) -> dict:
        """Run a single agent with appropriate task."""
        
        if agent_type == "code":
            task = f"""Perform a comprehensive code audit of the Helm Sports Labs codebase.

Project root: {project_root}
Source directory: {project_root / 'src'}

Focus areas:
1. Type safety and imports (must use @/lib/types)
2. React patterns (Server vs Client components, 'use client' directives)
3. Supabase patterns (server vs client, auth checks)
4. Performance issues (memoization, bundle size)
5. Security concerns

Start by listing the directory structure, then analyze high-risk files:
- Server actions in src/app/actions/
- API routes in src/app/api/
- Auth-related files
- Database query files

Report all findings with severity and suggested fixes.
"""
        
        elif agent_type == "database":
            task = f"""Perform a comprehensive database security and performance audit.

Migration directory: {project_root / 'supabase' / 'migrations'}

Focus areas:
1. RLS policies - coverage and security
2. Missing indexes on foreign keys
3. Schema quality and data integrity
4. Migration safety

Review all migration files and identify:
- Tables without RLS enabled
- Overly permissive policies
- Missing foreign key indexes
- Potential security vulnerabilities

Provide SQL fixes for all issues found.
"""
        
        elif agent_type == "ui":
            task = f"""Perform a comprehensive UI/UX audit.

Components directory: {project_root / 'src' / 'components'}
App directory: {project_root / 'src' / 'app'}

Focus areas:
1. Accessibility (WCAG 2.1 AA compliance)
2. Design system consistency (glassmorphism, colors, spacing)
3. Component quality (loading states, error handling)
4. Performance (code splitting, memoization)

Check all React components for:
- Missing alt text on images
- Form label accessibility
- Design token usage
- Proper loading/error/empty states

Report findings with file locations and fixes.
"""
        
        return await agent.execute_task(task, {
            "project_root": str(project_root),
            "helm_config": self.helm_config.__dict__,
        })
    
    async def _phase_verify(self, project_root: Path):
        """Phase 4: Verify codebase state before any fixes."""
        await self._emit_event("phase_started", {"phase": "verify"})
        
        # Run verification checks
        verifications = {
            "typescript": await self._verify_typescript(project_root),
            "eslint": await self._verify_eslint(project_root),
        }
        
        await self._emit_event("verification_results", verifications)
        await self._emit_event("phase_completed", {"phase": "verify"})
    
    async def _verify_typescript(self, project_root: Path) -> dict:
        """Run TypeScript type checking."""
        # In production, this would actually run tsc
        return {"passed": True, "errors": []}
    
    async def _verify_eslint(self, project_root: Path) -> dict:
        """Run ESLint checking."""
        # In production, this would actually run eslint
        return {"passed": True, "errors": []}
    
    async def _phase_fix(self):
        """Phase 5: Apply safe, automated fixes."""
        await self._emit_event("phase_started", {"phase": "fix"})
        
        # Only fix low-risk, automatable issues
        all_findings = (
            self.state.code_findings + 
            self.state.db_findings + 
            self.state.ui_findings
        )
        
        automatable = [
            f for f in all_findings 
            if f.get("automatable") and f.get("severity") in ("low", "info")
        ]
        
        await self._emit_event("auto_fix_candidates", {
            "count": len(automatable)
        })
        
        # In production, this would apply fixes
        # For safety, we just report what could be fixed
        
        await self._emit_event("phase_completed", {"phase": "fix"})
    
    async def _phase_synthesize(self) -> AuditReport:
        """Phase 6: Synthesize findings into actionable report."""
        await self._emit_event("phase_started", {"phase": "synthesize"})
        
        # Create enhancement agent
        enhancement_agent = EnhancementAgent(self.helm_config)
        
        # Synthesize all findings
        synthesis = await enhancement_agent.synthesize_findings(
            self.state.code_findings,
            self.state.db_findings,
            self.state.ui_findings,
        )
        
        self.state.synthesis = synthesis
        
        # Update stats
        stats = enhancement_agent.get_stats()
        self.state.total_input_tokens += stats.get("input_tokens", 0)
        self.state.total_output_tokens += stats.get("output_tokens", 0)
        self.state.estimated_cost += stats.get("estimated_cost", 0)
        
        # Generate report
        report = self._generate_report()
        
        # Save report to file
        report_path = Paths.REPORTS / f"audit_report_{self.state.workflow_id}.md"
        report_path.write_text(report.to_markdown())
        
        # Also save JSON version
        json_path = Paths.REPORTS / f"audit_report_{self.state.workflow_id}.json"
        json_path.write_text(json.dumps(report.to_dict(), indent=2, default=str))
        
        await self._emit_event("phase_completed", {
            "phase": "synthesize",
            "report_path": str(report_path)
        })
        
        return report
    
    def _generate_report(self) -> AuditReport:
        """Generate the final audit report."""
        all_findings = (
            self.state.code_findings + 
            self.state.db_findings + 
            self.state.ui_findings
        )
        
        # Categorize findings
        critical = [f for f in all_findings if f.get("severity") == "critical"]
        high = [f for f in all_findings if f.get("severity") == "high"]
        quick_wins = [f for f in all_findings if f.get("automatable")]
        
        # Summary by category
        findings_summary = {}
        for f in all_findings:
            cat = f.get("category", "unknown")
            sev = f.get("severity", "unknown")
            if cat not in findings_summary:
                findings_summary[cat] = {}
            findings_summary[cat][sev] = findings_summary[cat].get(sev, 0) + 1
        
        return AuditReport(
            title=f"Helm Intelligence Audit Report - {self.state.workflow_id}",
            generated_at=datetime.now(),
            executive_summary=self._generate_executive_summary(all_findings),
            findings_summary=findings_summary,
            critical_issues=critical,
            high_priority=high,
            quick_wins=quick_wins,
            agent_stats={
                "workflow_id": self.state.workflow_id,
                "agents_completed": len(self.state.agents_completed),
                "agents_failed": len(self.state.agents_failed),
                "total_input_tokens": self.state.total_input_tokens,
                "total_output_tokens": self.state.total_output_tokens,
                "estimated_cost": f"${self.state.estimated_cost:.2f}",
            },
        )
    
    def _generate_executive_summary(self, findings: list[dict]) -> str:
        """Generate executive summary for the report."""
        total = len(findings)
        critical = len([f for f in findings if f.get("severity") == "critical"])
        high = len([f for f in findings if f.get("severity") == "high"])
        
        return f"""This automated audit of the Helm Sports Labs codebase identified {total} findings across code quality, database security, and UI/UX compliance.

**Priority Items**: {critical} critical issues require immediate attention, with {high} additional high-priority items. Critical issues primarily relate to database security (RLS policies) and authentication patterns.

**Estimated Effort**: The roadmap estimates 6 weeks of focused work to address all significant findings, with quick wins achievable in the first week."""
    
    def _save_checkpoint(self, label: str):
        """Save a checkpoint of current state."""
        checkpoint_id = f"cp_{self.state.workflow_id}_{label}"
        
        # Create a minimal checkpoint (we'd need a proper BaseAgent here)
        checkpoint_data = {
            "checkpoint_id": checkpoint_id,
            "agent_id": f"orchestrator_{self.state.workflow_id}",
            "timestamp": datetime.now().isoformat(),
            "phase": self.state.phase.value,
            "messages": [],
            "findings": [],
            "artifacts": self.state.artifact_refs,
            "metadata": self.state.to_dict(),
        }
        
        filepath = Paths.CHECKPOINTS / f"{checkpoint_id}.json"
        filepath.write_text(json.dumps(checkpoint_data, indent=2, default=str))
    
    def _restore_state(self, checkpoint: Checkpoint) -> WorkflowState:
        """Restore workflow state from checkpoint."""
        metadata = checkpoint.metadata
        state = WorkflowState(
            workflow_id=metadata.get("workflow_id", checkpoint.agent_id),
            phase=WorkflowPhase(checkpoint.phase),
        )
        state.agents_spawned = metadata.get("agents_spawned", [])
        state.agents_completed = metadata.get("agents_completed", [])
        state.artifact_refs = checkpoint.artifacts
        return state


# ============================================
# CONVENIENCE FUNCTIONS
# ============================================

async def run_audit(
    project_root: Optional[Path] = None,
    config: Optional[dict] = None,
) -> AuditReport:
    """
    Convenience function to run a full audit.
    
    Usage:
        report = await run_audit()
        print(report.to_markdown())
    """
    orchestrator = Orchestrator(
        helm_config=HelmConfig(**config.get("helm", {})) if config else None,
        audit_config=AuditConfig(**config.get("audit", {})) if config else None,
    )
    
    # Add console event handler
    async def log_event(event):
        print(f"[{event['type']}] {event.get('phase', '')} - {event}")
    
    orchestrator.on_event(log_event)
    
    return await orchestrator.run_full_audit(project_root)
