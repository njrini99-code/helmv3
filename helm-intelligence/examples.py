#!/usr/bin/env python3
"""
Helm Intelligence - Example Usage
Shows how to use the multi-agent system programmatically.
"""

import asyncio
import sys
from pathlib import Path

# Add to path
sys.path.insert(0, str(Path(__file__).parent))

from config.settings import Paths, HelmConfig, AuditConfig
from orchestrator.coordinator import Orchestrator
from agents.code_auditor import CodeAuditorAgent
from agents.database_auditor import DatabaseAuditorAgent
from agents.ui_auditor import UIUXAuditorAgent
from agents.enhancement_agent import EnhancementAgent
from memory.memory_system import MEMORY_SYSTEM
from tools.toolkit import register_all_tools


# ============================================
# EXAMPLE 1: Run a Full Audit
# ============================================

async def example_full_audit():
    """Run a complete multi-agent audit."""
    print("=" * 60)
    print("EXAMPLE 1: Full Multi-Agent Audit")
    print("=" * 60)
    
    # Create orchestrator with custom config
    orchestrator = Orchestrator(
        helm_config=HelmConfig(),
        audit_config=AuditConfig(
            audit_code=True,
            audit_database=True,
            audit_ui=True,
            deep_analysis=True,
        ),
    )
    
    # Register event handler for progress
    def on_event(event):
        print(f"  [{event.get('type')}] {event.get('phase', '')}")
    
    orchestrator.on_event(on_event)
    
    # Run the audit
    report = await orchestrator.run_full_audit()
    
    print(f"\nReport generated: {report.title}")
    print(f"Total findings: {len(report.critical_issues) + len(report.high_priority)}")
    
    return report


# ============================================
# EXAMPLE 2: Run a Single Agent
# ============================================

async def example_single_agent():
    """Run just the Code Auditor agent."""
    print("\n" + "=" * 60)
    print("EXAMPLE 2: Single Agent (Code Auditor)")
    print("=" * 60)
    
    # Create the agent
    agent = CodeAuditorAgent(HelmConfig())
    
    # Define the task
    task = """Analyze the src/app/actions directory for server action issues:
    1. Check for missing auth verification
    2. Check for missing revalidatePath calls
    3. Check for console.log statements
    
    Report all findings with file paths and suggested fixes.
    """
    
    # Run the agent
    result = await agent.execute_task(task, {
        "project_root": str(Paths.PROJECT_ROOT)
    })
    
    print(f"\nAgent completed: {result['agent_id']}")
    print(f"Findings: {len(result['findings'])}")
    print(f"Stats: {result['stats']}")
    
    # Print some findings
    for finding in result['findings'][:3]:
        print(f"\n  [{finding['severity']}] {finding['title']}")
        print(f"    Location: {finding['location']}")
    
    return result


# ============================================
# EXAMPLE 3: Use Memory System
# ============================================

async def example_memory():
    """Demonstrate the memory system."""
    print("\n" + "=" * 60)
    print("EXAMPLE 3: Memory System")
    print("=" * 60)
    
    # Add some memories
    MEMORY_SYSTEM.semantic.add(
        content="The golf_rounds table requires team_id scoping in RLS policies",
        category="database",
        tags=["rls", "golf", "security"],
        source_agent="database_auditor",
    )
    
    MEMORY_SYSTEM.semantic.add(
        content="Components in src/components/golf often miss 'use client' directive",
        category="code",
        tags=["react", "golf", "client-components"],
        source_agent="code_auditor",
    )
    
    # Record an episodic memory (successful pattern)
    MEMORY_SYSTEM.episodic.record(
        observation="Found multiple components with inline object props",
        reasoning="Inline objects cause re-renders on every parent render",
        action="Suggested wrapping with useMemo or extracting to constants",
        outcome="Performance improved after fixes were applied",
        success=True,
        category="code",
        tags=["performance", "react", "memoization"],
    )
    
    # Search memories
    print("\nSearching for 'golf' memories:")
    memories = MEMORY_SYSTEM.semantic.search("golf", limit=5)
    for mem in memories:
        print(f"  - [{mem.category}] {mem.content[:60]}...")
    
    # Get context for an agent
    print("\nContext for code_auditor:")
    context = MEMORY_SYSTEM.get_context_for_agent("code_auditor")
    print(context[:500] + "..." if len(context) > 500 else context)
    
    # Get stats
    print("\nMemory stats:")
    stats = MEMORY_SYSTEM.get_stats()
    print(f"  Semantic memories: {stats['semantic']['total_memories']}")
    print(f"  Episodic memories: {stats['episodic']['total_episodes']}")
    
    return stats


# ============================================
# EXAMPLE 4: Database Audit Only
# ============================================

async def example_database_audit():
    """Run just the Database Auditor."""
    print("\n" + "=" * 60)
    print("EXAMPLE 4: Database Auditor")
    print("=" * 60)
    
    agent = DatabaseAuditorAgent(HelmConfig())
    
    # Run RLS security audit
    findings = await agent.audit_rls_security()
    
    print(f"\nRLS Audit complete: {len(findings)} findings")
    
    # Group by severity
    by_severity = {}
    for f in findings:
        sev = f.severity.value
        by_severity[sev] = by_severity.get(sev, 0) + 1
    
    print(f"By severity: {by_severity}")
    
    return findings


# ============================================
# EXAMPLE 5: UI/UX Audit
# ============================================

async def example_ui_audit():
    """Run the UI/UX Auditor."""
    print("\n" + "=" * 60)
    print("EXAMPLE 5: UI/UX Auditor")
    print("=" * 60)
    
    agent = UIUXAuditorAgent(HelmConfig())
    
    # Run accessibility audit
    findings = await agent.audit_accessibility()
    
    print(f"\nAccessibility audit complete: {len(findings)} findings")
    
    # Show categories
    by_category = {}
    for f in findings:
        cat = f.category.value
        by_category[cat] = by_category.get(cat, 0) + 1
    
    print(f"By category: {by_category}")
    
    return findings


# ============================================
# EXAMPLE 6: Enhancement Agent
# ============================================

async def example_enhancement():
    """Use the Enhancement Agent to synthesize findings."""
    print("\n" + "=" * 60)
    print("EXAMPLE 6: Enhancement Agent (Synthesis)")
    print("=" * 60)
    
    agent = EnhancementAgent(HelmConfig())
    
    # Mock findings from other agents
    code_findings = [
        {"title": "Missing 'use client'", "severity": "high", "category": "code_quality"},
        {"title": "Any type usage", "severity": "medium", "category": "type_safety"},
    ]
    db_findings = [
        {"title": "RLS not enabled", "severity": "critical", "category": "security"},
    ]
    ui_findings = [
        {"title": "Missing alt text", "severity": "high", "category": "accessibility"},
    ]
    
    # Synthesize
    synthesis = await agent.synthesize_findings(
        code_findings,
        db_findings,
        ui_findings,
    )
    
    print(f"\nSynthesis complete")
    print(f"Artifact refs: {synthesis['artifact_refs']}")
    print(f"Prioritized findings: {synthesis['prioritized_findings']['total']} total")
    print(f"  Critical: {len(synthesis['prioritized_findings']['critical'])}")
    print(f"  Quick wins: {len(synthesis['prioritized_findings']['quick_wins'])}")
    
    return synthesis


# ============================================
# MAIN
# ============================================

async def main():
    """Run all examples."""
    # Ensure setup
    Paths.ensure_directories()
    register_all_tools()
    
    print("""
╔═══════════════════════════════════════════════════════════════╗
║           HELM INTELLIGENCE - USAGE EXAMPLES                  ║
╚═══════════════════════════════════════════════════════════════╝
""")
    
    # Run examples (comment out ones you don't want)
    
    # Example 1: Full audit (longest, most comprehensive)
    # await example_full_audit()
    
    # Example 2: Single agent
    # await example_single_agent()
    
    # Example 3: Memory system (always safe to run)
    await example_memory()
    
    # Example 4: Database audit
    # await example_database_audit()
    
    # Example 5: UI audit
    # await example_ui_audit()
    
    # Example 6: Enhancement/synthesis
    # await example_enhancement()
    
    print("\n" + "=" * 60)
    print("Examples complete!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
