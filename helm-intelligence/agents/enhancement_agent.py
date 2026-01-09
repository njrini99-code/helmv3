"""
Helm Intelligence - Enhancement Agent
Synthesizes audit findings and generates production-readiness recommendations.
"""

from dataclasses import dataclass, field
from typing import Optional
from pathlib import Path
from datetime import datetime

from agents.base import BaseAgent, Finding, AgentConfig, ARTIFACT_STORE
from config.settings import AgentRole, Models, Severity, Category, HelmConfig


# ============================================
# ENHANCEMENT AGENT SYSTEM PROMPT  
# ============================================

ENHANCEMENT_AGENT_SYSTEM_PROMPT = """You are the Enhancement Agent for Helm Intelligence, responsible for synthesizing audit findings and generating production-readiness recommendations.

# Your Role
You receive findings from specialized agents (Code, Database, UI/UX) and:
1. Synthesize findings into a coherent improvement plan
2. Prioritize by impact and effort
3. Identify systemic patterns
4. Generate actionable recommendations
5. Create a production-readiness roadmap

# Codebase Context: Helm Sports Labs
- **Products**: BaseballHelm (recruiting), GolfHelm (team management), CoachHelm (AI)
- **Quality Bar**: Premium SaaS - think Linear, Stripe, Vercel
- **Current Focus**: CoachHelm AI development

# Prioritization Framework

## Impact Levels
- **Critical**: Security vulnerabilities, data loss risks, broken core functionality
- **High**: Performance issues affecting UX, accessibility blockers
- **Medium**: Code quality issues, minor UX problems
- **Low**: Style inconsistencies, nice-to-haves

## Effort Levels
- **Quick Win**: < 30 minutes, often automatable
- **Small**: 1-4 hours
- **Medium**: 1-2 days
- **Large**: 3+ days, may require architecture changes

## Priority Matrix
```
                   LOW EFFORT    HIGH EFFORT
HIGH IMPACT        Do First      Plan Carefully
LOW IMPACT         Quick Wins    Defer/Skip
```

# Synthesis Tasks

## 1. Pattern Detection
Look for systemic issues appearing across multiple files:
- Same mistake repeated (e.g., missing 'use client' everywhere)
- Architectural anti-patterns
- Knowledge gaps in the team

## 2. Root Cause Analysis
For recurring issues, identify the root cause:
- Missing documentation?
- Unclear conventions?
- Technical debt from early decisions?

## 3. Improvement Categories

### Security
- RLS policy gaps
- Auth bypass risks
- Data exposure vulnerabilities

### Performance
- Database query optimization
- Bundle size reduction
- Rendering optimization

### Quality
- Type safety improvements
- Code organization
- Testing coverage

### UX/Accessibility
- A11y compliance
- Design system consistency
- User experience gaps

### Developer Experience
- Build time improvements
- Documentation gaps
- Tooling improvements

# Output Format

## Executive Summary
Brief overview for stakeholders (2-3 paragraphs)

## Critical Issues (Do Immediately)
- Issue description
- Affected areas
- Fix complexity
- Recommended action

## High Priority (This Sprint)
Similar format, grouped by category

## Improvement Roadmap
Week 1-2: Security & Critical Fixes
Week 3-4: Performance & Quality
Week 5-6: UX & Polish

## Quick Wins (Automatable)
List of issues that can be auto-fixed

## Technical Debt Backlog
Lower priority items for future consideration

Be specific and actionable. Include effort estimates and concrete next steps.
"""


# ============================================
# ENHANCEMENT AGENT
# ============================================

class EnhancementAgent(BaseAgent):
    """
    Synthesizes findings from all auditor agents.
    MAXIMUM POWER MODE - Full context for comprehensive synthesis.
    """
    
    def __init__(self, helm_config: Optional[HelmConfig] = None):
        config = AgentConfig(
            role=AgentRole.ENHANCEMENT_AGENT,
            model=Models.ORCHESTRATOR,  # Sonnet for cost efficiency
            system_prompt=ENHANCEMENT_AGENT_SYSTEM_PROMPT,
            tools=[
                "read_artifact",
                "list_artifacts",
                "write_report",
                "create_github_issues",
            ],
            max_turns=50,
            temperature=0.0,
            thinking_budget=0,        # Disabled for API compatibility
            max_output_tokens=16384,  # Full output for comprehensive reports
        )
        super().__init__(config)
        self.helm_config = helm_config or HelmConfig()
    
    async def execute_task(self, task: str, context: dict) -> dict:
        """Execute the enhancement task."""
        async for event in self.run(task, context):
            if event["type"] == "complete":
                break
        
        return {
            "agent_id": self.agent_id,
            "findings": [f.to_dict() for f in self.findings],
            "stats": self.get_stats(),
        }
    
    async def synthesize_findings(
        self, 
        code_findings: list[dict],
        db_findings: list[dict],
        ui_findings: list[dict],
    ) -> dict:
        """Synthesize findings from all auditor agents."""
        
        # Store findings as artifacts for reference
        code_ref = ARTIFACT_STORE.store(self.agent_id, "code_findings", code_findings)
        db_ref = ARTIFACT_STORE.store(self.agent_id, "db_findings", db_findings)
        ui_ref = ARTIFACT_STORE.store(self.agent_id, "ui_findings", ui_findings)
        
        task = f"""Synthesize audit findings into a comprehensive improvement plan.

# Input Findings

## Code Audit ({len(code_findings)} findings)
Artifact reference: {code_ref}
Summary: {self._summarize_findings(code_findings)}

## Database Audit ({len(db_findings)} findings)
Artifact reference: {db_ref}
Summary: {self._summarize_findings(db_findings)}

## UI/UX Audit ({len(ui_findings)} findings)
Artifact reference: {ui_ref}
Summary: {self._summarize_findings(ui_findings)}

# Your Task

1. **Pattern Analysis**
   - Identify issues that appear across multiple audits
   - Find root causes of recurring problems
   - Detect systemic patterns

2. **Prioritization**
   - Rank all findings by impact and effort
   - Group into: Critical, High, Medium, Low priority
   - Identify quick wins that can be automated

3. **Roadmap Creation**
   - Create a phased improvement plan
   - Week 1-2: Security & Critical
   - Week 3-4: Performance & Quality  
   - Week 5-6: UX & Polish

4. **Actionable Recommendations**
   - Specific fixes with code examples
   - Architecture improvements
   - Process improvements

Generate a comprehensive report that the development team can immediately act on.
"""
        
        context = {
            "total_findings": len(code_findings) + len(db_findings) + len(ui_findings),
            "helm_config": self.helm_config.__dict__,
        }
        
        result = await self.execute_task(task, context)
        
        return {
            "synthesis": result,
            "artifact_refs": {
                "code": code_ref,
                "database": db_ref,
                "ui": ui_ref,
            },
            "prioritized_findings": self._prioritize_all_findings(
                code_findings, db_findings, ui_findings
            ),
        }
    
    def _summarize_findings(self, findings: list[dict]) -> str:
        """Create a brief summary of findings by severity."""
        by_severity = {}
        for f in findings:
            sev = f.get("severity", "unknown")
            by_severity[sev] = by_severity.get(sev, 0) + 1
        
        by_category = {}
        for f in findings:
            cat = f.get("category", "unknown")
            by_category[cat] = by_category.get(cat, 0) + 1
        
        return f"By severity: {by_severity}, By category: {by_category}"
    
    def _prioritize_all_findings(
        self,
        code_findings: list[dict],
        db_findings: list[dict],
        ui_findings: list[dict],
    ) -> dict:
        """Prioritize all findings into buckets."""
        all_findings = code_findings + db_findings + ui_findings
        
        # Sort by severity
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
        sorted_findings = sorted(
            all_findings,
            key=lambda f: severity_order.get(f.get("severity", "info"), 5)
        )
        
        # Bucket into priority groups
        critical = [f for f in sorted_findings if f.get("severity") == "critical"]
        high = [f for f in sorted_findings if f.get("severity") == "high"]
        medium = [f for f in sorted_findings if f.get("severity") == "medium"]
        low = [f for f in sorted_findings if f.get("severity") in ("low", "info")]
        
        # Identify quick wins (automatable)
        quick_wins = [f for f in sorted_findings if f.get("automatable", False)]
        
        return {
            "critical": critical,
            "high": high,
            "medium": medium,
            "low": low,
            "quick_wins": quick_wins,
            "total": len(all_findings),
        }
    
    async def generate_production_checklist(self) -> dict:
        """Generate a production-readiness checklist."""
        task = """Generate a comprehensive production-readiness checklist for Helm Sports Labs.

# Categories to Cover

## 1. Security
- [ ] All tables have RLS enabled
- [ ] All tables have complete CRUD policies
- [ ] No overly permissive policies (USING true)
- [ ] Auth checks in all server actions
- [ ] No exposed secrets in code
- [ ] Input validation on all forms
- [ ] CSRF protection
- [ ] Rate limiting on auth endpoints

## 2. Performance
- [ ] Database indexes on foreign keys
- [ ] Database indexes on filter columns
- [ ] Bundle size under budget (<500KB initial)
- [ ] Images optimized (next/image)
- [ ] Code splitting implemented
- [ ] No N+1 query patterns
- [ ] Caching strategy in place

## 3. Quality
- [ ] TypeScript strict mode passing
- [ ] ESLint passing with no warnings
- [ ] All 'use client' directives present
- [ ] No console.log in production
- [ ] Error boundaries in place
- [ ] Proper error logging (Sentry)

## 4. Accessibility
- [ ] All images have alt text
- [ ] All forms have labels
- [ ] Color contrast passing
- [ ] Keyboard navigation working
- [ ] Screen reader tested
- [ ] Focus management in modals

## 5. UX
- [ ] Loading states on all async operations
- [ ] Empty states with CTAs
- [ ] Error messages are user-friendly
- [ ] Responsive design tested
- [ ] Design system consistent

## 6. Testing
- [ ] E2E tests for critical paths
- [ ] Auth flow tested
- [ ] Payment flow tested (if applicable)
- [ ] Error scenarios tested

## 7. Operations
- [ ] Environment variables documented
- [ ] Deployment pipeline working
- [ ] Monitoring in place
- [ ] Backup strategy
- [ ] Rollback procedure documented

Generate a detailed checklist with current status based on audit findings.
"""
        
        result = await self.execute_task(task, {})
        return {
            "checklist": result,
            "stats": self.get_stats(),
        }
    
    async def generate_improvement_roadmap(
        self,
        findings: list[dict],
        timeline_weeks: int = 6
    ) -> dict:
        """Generate a phased improvement roadmap."""
        task = f"""Generate a {timeline_weeks}-week improvement roadmap.

# Findings Summary
Total findings: {len(findings)}
{self._summarize_findings(findings)}

# Roadmap Requirements

## Week 1-2: Foundation & Security
- Address all critical security issues
- Fix RLS policy gaps
- Add missing auth checks
- Enable proper error logging

## Week 3-4: Quality & Performance
- Fix type safety issues
- Optimize database queries
- Add missing indexes
- Reduce bundle size

## Week 5-6: Polish & UX
- Fix accessibility issues
- Ensure design system consistency
- Add missing loading/empty states
- Final testing and QA

# For Each Week, Provide:
1. Specific tasks with effort estimates
2. Dependencies and blockers
3. Success criteria
4. Testing requirements

Make the roadmap realistic and achievable. Account for ongoing feature work.
"""
        
        result = await self.execute_task(task, {"findings": findings[:50]})  # Limit for context
        return {
            "roadmap": result,
            "timeline_weeks": timeline_weeks,
            "stats": self.get_stats(),
        }
    
    async def generate_github_issues(self, findings: list[dict], max_issues: int = 20) -> list[dict]:
        """Generate GitHub issues from findings."""
        task = f"""Convert the top {max_issues} findings into GitHub issues.

# Findings
{self._summarize_findings(findings)}

# Issue Format
For each issue:
- Title: Clear, actionable (e.g., "Fix missing RLS policy on golf_rounds table")
- Body: Description, evidence, steps to fix
- Labels: severity (critical/high/medium), category (security/performance/etc.)
- Assignee suggestion: Based on area (frontend/backend/db)

Group related findings into single issues where appropriate.
Prioritize by severity - critical and high first.
"""
        
        result = await self.execute_task(task, {"findings": findings[:max_issues]})
        return result


# ============================================
# REPORT GENERATION HELPERS
# ============================================

@dataclass
class AuditReport:
    """Structured audit report."""
    title: str
    generated_at: datetime = field(default_factory=datetime.now)
    executive_summary: str = ""
    findings_summary: dict = field(default_factory=dict)
    critical_issues: list[dict] = field(default_factory=list)
    high_priority: list[dict] = field(default_factory=list)
    quick_wins: list[dict] = field(default_factory=list)
    roadmap: str = ""
    checklist: dict = field(default_factory=dict)
    agent_stats: dict = field(default_factory=dict)
    
    def to_markdown(self) -> str:
        """Convert report to Markdown format."""
        md = f"""# {self.title}

Generated: {self.generated_at.strftime('%Y-%m-%d %H:%M:%S')}

## Executive Summary

{self.executive_summary}

## Findings Overview

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
"""
        for cat, counts in self.findings_summary.items():
            md += f"| {cat} | {counts.get('critical', 0)} | {counts.get('high', 0)} | {counts.get('medium', 0)} | {counts.get('low', 0)} |\n"
        
        md += "\n## Critical Issues (Immediate Action Required)\n\n"
        for i, issue in enumerate(self.critical_issues[:10], 1):
            md += f"### {i}. {issue.get('title', 'Untitled')}\n\n"
            md += f"**Location**: {issue.get('location', {})}\n\n"
            md += f"{issue.get('description', '')}\n\n"
            md += f"**Fix**: {issue.get('suggested_fix', 'See details')}\n\n"
        
        md += "\n## Quick Wins (Automatable)\n\n"
        for issue in self.quick_wins[:10]:
            md += f"- {issue.get('title', 'Untitled')} ({issue.get('location', {}).get('file', 'unknown')})\n"
        
        md += f"\n## Improvement Roadmap\n\n{self.roadmap}\n"
        
        md += "\n## Agent Statistics\n\n"
        md += f"```json\n{self.agent_stats}\n```\n"
        
        return md
    
    def to_dict(self) -> dict:
        """Convert report to dictionary."""
        return {
            "title": self.title,
            "generated_at": self.generated_at.isoformat(),
            "executive_summary": self.executive_summary,
            "findings_summary": self.findings_summary,
            "critical_issues": self.critical_issues,
            "high_priority": self.high_priority,
            "quick_wins": self.quick_wins,
            "roadmap": self.roadmap,
            "checklist": self.checklist,
            "agent_stats": self.agent_stats,
        }
