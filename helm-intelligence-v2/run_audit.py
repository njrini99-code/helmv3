#!/usr/bin/env python3
"""
Helm Intelligence v2 - Simplified Working Version
Actually audits your codebase with proper context management.
"""

import os
import sys
import json
import asyncio
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional
import anthropic

# ============================================
# CONFIGURATION
# ============================================

PROJECT_ROOT = Path(os.environ.get("HELM_PROJECT_ROOT", "/Users/ricknini/Downloads/helmv3"))
MODEL = "claude-sonnet-4-20250514"
MAX_FILE_SIZE = 50000  # Max chars per file to read
MAX_RESULTS = 30  # Max search results

@dataclass
class Finding:
    severity: str  # critical, high, medium, low
    category: str  
    title: str
    file: str
    line: Optional[int] = None
    evidence: str = ""
    fix: str = ""

@dataclass 
class AuditResult:
    findings: list[Finding] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    cost: float = 0.0

# ============================================
# TOOLS
# ============================================

def read_file(path: str) -> str:
    """Read file with size limit."""
    try:
        filepath = Path(path)
        if not filepath.exists():
            return f"Error: File not found: {path}"
        content = filepath.read_text()
        if len(content) > MAX_FILE_SIZE:
            return content[:MAX_FILE_SIZE] + f"\n\n... [TRUNCATED - file has {len(content)} chars, showing first {MAX_FILE_SIZE}]"
        return content
    except Exception as e:
        return f"Error: {e}"

def list_directory(path: str) -> str:
    """List directory contents."""
    try:
        dirpath = Path(path)
        if not dirpath.exists():
            return f"Error: Directory not found: {path}"
        
        items = []
        for item in sorted(dirpath.iterdir()):
            if item.name.startswith('.'):
                continue
            prefix = "[DIR]" if item.is_dir() else "[FILE]"
            items.append(f"{prefix} {item.name}")
        
        return "\n".join(items[:100])  # Limit to 100 items
    except Exception as e:
        return f"Error: {e}"

def search_pattern(directory: str, pattern: str) -> str:
    """Search for pattern in TypeScript files."""
    try:
        dirpath = Path(directory)
        results = []
        
        for filepath in dirpath.rglob("*.ts*"):
            if "node_modules" in str(filepath) or ".next" in str(filepath):
                continue
            try:
                content = filepath.read_text()
                lines = content.split('\n')
                for i, line in enumerate(lines, 1):
                    if pattern.lower() in line.lower():
                        results.append({
                            "file": str(filepath.relative_to(dirpath)),
                            "line": i,
                            "content": line.strip()[:150]
                        })
                        if len(results) >= MAX_RESULTS:
                            break
            except:
                continue
            if len(results) >= MAX_RESULTS:
                break
        
        if not results:
            return f"No matches found for '{pattern}'"
        
        output = []
        for r in results:
            output.append(f"{r['file']}:{r['line']}: {r['content']}")
        return "\n".join(output)
    except Exception as e:
        return f"Error: {e}"

def list_migrations(directory: str) -> str:
    """List SQL migration files."""
    try:
        dirpath = Path(directory)
        if not dirpath.exists():
            return f"Error: Directory not found: {directory}"
        
        files = sorted(dirpath.glob("*.sql"))
        return "\n".join([f.name for f in files])
    except Exception as e:
        return f"Error: {e}"

# Tool definitions for Claude
TOOLS = [
    {
        "name": "read_file",
        "description": "Read the contents of a file. Returns truncated content for large files.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Full path to the file"}
            },
            "required": ["path"]
        }
    },
    {
        "name": "list_directory",
        "description": "List contents of a directory. Shows files and subdirectories.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Full path to the directory"}
            },
            "required": ["path"]
        }
    },
    {
        "name": "search_pattern",
        "description": "Search for a text pattern in TypeScript files. Returns matching lines with file paths.",
        "input_schema": {
            "type": "object",
            "properties": {
                "directory": {"type": "string", "description": "Directory to search in"},
                "pattern": {"type": "string", "description": "Text pattern to search for (case-insensitive)"}
            },
            "required": ["directory", "pattern"]
        }
    },
    {
        "name": "list_migrations",
        "description": "List SQL migration files in a directory.",
        "input_schema": {
            "type": "object",
            "properties": {
                "directory": {"type": "string", "description": "Path to migrations directory"}
            },
            "required": ["directory"]
        }
    },
    {
        "name": "report_finding",
        "description": "Report an issue found during the audit.",
        "input_schema": {
            "type": "object",
            "properties": {
                "severity": {"type": "string", "enum": ["critical", "high", "medium", "low"]},
                "category": {"type": "string", "description": "Category like 'security', 'type_safety', 'performance', 'accessibility'"},
                "title": {"type": "string", "description": "Brief title of the issue"},
                "file": {"type": "string", "description": "File path where issue was found"},
                "line": {"type": "integer", "description": "Line number if applicable"},
                "evidence": {"type": "string", "description": "The problematic code snippet"},
                "fix": {"type": "string", "description": "Suggested fix"}
            },
            "required": ["severity", "category", "title", "file"]
        }
    },
    {
        "name": "complete_audit",
        "description": "Call this when you have finished the audit and reported all findings.",
        "input_schema": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "Brief summary of audit results"}
            },
            "required": ["summary"]
        }
    }
]

def execute_tool(name: str, args: dict, findings: list[Finding]) -> str:
    """Execute a tool and return the result."""
    if name == "read_file":
        return read_file(args["path"])
    elif name == "list_directory":
        return list_directory(args["path"])
    elif name == "search_pattern":
        return search_pattern(args["directory"], args["pattern"])
    elif name == "list_migrations":
        return list_migrations(args["directory"])
    elif name == "report_finding":
        findings.append(Finding(
            severity=args["severity"],
            category=args["category"],
            title=args["title"],
            file=args["file"],
            line=args.get("line"),
            evidence=args.get("evidence", ""),
            fix=args.get("fix", "")
        ))
        return f"Finding recorded: [{args['severity'].upper()}] {args['title']}"
    elif name == "complete_audit":
        return "AUDIT_COMPLETE"
    else:
        return f"Unknown tool: {name}"

# ============================================
# AGENT
# ============================================

CODE_AUDIT_PROMPT = f"""You are a code auditor for Helm Sports Labs. Analyze the codebase and find issues.

PROJECT: {PROJECT_ROOT}
SOURCE: {PROJECT_ROOT}/src
MIGRATIONS: {PROJECT_ROOT}/supabase/migrations

CRITICAL RULES TO CHECK:
1. Type imports MUST be from '@/lib/types' - NOT '@/types/database'
2. Client components MUST have 'use client' at top if they use hooks
3. Supabase server client: must await createClient() from '@/lib/supabase/server'
4. Server actions must check auth first and call revalidatePath() after mutations
5. No 'any' types allowed

YOUR TASK:
1. Start by listing src/app/actions to find server actions
2. Check a few server action files for auth checks and revalidatePath
3. Search for wrong import patterns (@/types/database, import {{ type)
4. Search for 'any' type usage
5. Check components for missing 'use client' with hooks
6. Report each issue you find using report_finding
7. Call complete_audit when done

Be thorough but efficient. Prioritize security issues."""

DB_AUDIT_PROMPT = f"""You are a database security auditor. Check Supabase migrations for security issues.

MIGRATIONS: {PROJECT_ROOT}/supabase/migrations

YOUR TASK:
1. List the migration files
2. Read recent migrations (focus on ones with 'rls', 'policy', or schema changes)
3. Check for:
   - Tables without RLS enabled (should have ENABLE ROW LEVEL SECURITY)
   - Overly permissive policies (USING (true) without proper checks)
   - Missing policies for authenticated users
   - Tables with sensitive data lacking team_id scoping
4. Report each issue using report_finding
5. Call complete_audit when done

Focus on security vulnerabilities."""

UI_AUDIT_PROMPT = f"""You are a UI/UX auditor. Check React components for accessibility and quality.

COMPONENTS: {PROJECT_ROOT}/src/components
APP: {PROJECT_ROOT}/src/app

YOUR TASK:
1. List the components directory structure
2. Search for img tags and check for alt attributes
3. Search for button and check for aria-label or text content
4. Search for onClick handlers on non-button elements (accessibility issue)
5. Check for missing loading states (search for 'isLoading', 'loading')
6. Report issues using report_finding
7. Call complete_audit when done

Focus on WCAG accessibility compliance."""


async def run_agent(client: anthropic.Anthropic, system_prompt: str, agent_name: str) -> AuditResult:
    """Run a single audit agent."""
    print(f"  🤖 Starting {agent_name}...")
    
    result = AuditResult()
    messages = [{"role": "user", "content": "Begin the audit. Use tools to explore the codebase and report findings."}]
    
    max_turns = 30
    turn = 0
    
    while turn < max_turns:
        turn += 1
        
        response = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            system=system_prompt,
            tools=TOOLS,
            messages=messages
        )
        
        result.input_tokens += response.usage.input_tokens
        result.output_tokens += response.usage.output_tokens
        
        # Process response
        assistant_content = []
        tool_calls = []
        
        for block in response.content:
            if block.type == "text":
                assistant_content.append(block)
            elif block.type == "tool_use":
                assistant_content.append(block)
                tool_calls.append(block)
        
        messages.append({"role": "assistant", "content": assistant_content})
        
        # Check if done
        if response.stop_reason == "end_turn" and not tool_calls:
            break
        
        # Execute tools
        if tool_calls:
            tool_results = []
            for tool in tool_calls:
                tool_result = execute_tool(tool.name, tool.input, result.findings)
                
                if tool_result == "AUDIT_COMPLETE":
                    print(f"  ✅ {agent_name} complete: {len(result.findings)} findings")
                    # Calculate cost
                    result.cost = (result.input_tokens * 3 / 1_000_000) + (result.output_tokens * 15 / 1_000_000)
                    return result
                
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool.id,
                    "content": tool_result[:10000]  # Truncate large results
                })
            
            messages.append({"role": "user", "content": tool_results})
    
    print(f"  ⚠️ {agent_name} hit max turns: {len(result.findings)} findings")
    result.cost = (result.input_tokens * 3 / 1_000_000) + (result.output_tokens * 15 / 1_000_000)
    return result


async def run_full_audit():
    """Run the complete audit with all agents."""
    print("""
╔═══════════════════════════════════════════════════════════════╗
║           HELM INTELLIGENCE v2 - CODEBASE AUDIT               ║
╚═══════════════════════════════════════════════════════════════╝
""")
    
    start_time = datetime.now()
    
    # Check for API key
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("❌ Error: ANTHROPIC_API_KEY not set")
        sys.exit(1)
    
    client = anthropic.Anthropic(api_key=api_key)
    
    print(f"📁 Project: {PROJECT_ROOT}")
    print(f"🔧 Model: {MODEL}")
    print()
    
    # Run agents
    print("🚀 Running audit agents...")
    
    all_findings = []
    total_cost = 0.0
    total_input = 0
    total_output = 0
    
    # Run agents sequentially to avoid rate limits
    agents = [
        ("Code Auditor", CODE_AUDIT_PROMPT),
        ("Database Auditor", DB_AUDIT_PROMPT),
        ("UI/UX Auditor", UI_AUDIT_PROMPT),
    ]
    
    for agent_name, prompt in agents:
        try:
            result = await run_agent(client, prompt, agent_name)
            all_findings.extend(result.findings)
            total_cost += result.cost
            total_input += result.input_tokens
            total_output += result.output_tokens
        except Exception as e:
            print(f"  ❌ {agent_name} failed: {e}")
    
    # Generate report
    duration = (datetime.now() - start_time).total_seconds()
    
    print()
    print("=" * 60)
    print("AUDIT COMPLETE")
    print("=" * 60)
    print(f"Duration: {duration:.0f} seconds")
    print(f"Total findings: {len(all_findings)}")
    print()
    
    # Count by severity
    by_severity = {}
    for f in all_findings:
        by_severity[f.severity] = by_severity.get(f.severity, 0) + 1
    
    print(f"  🔴 Critical: {by_severity.get('critical', 0)}")
    print(f"  🟠 High:     {by_severity.get('high', 0)}")
    print(f"  🟡 Medium:   {by_severity.get('medium', 0)}")
    print(f"  🟢 Low:      {by_severity.get('low', 0)}")
    print()
    print(f"💰 Cost: ${total_cost:.2f}")
    print(f"📊 Tokens: {total_input + total_output:,}")
    
    # Save report
    report_dir = PROJECT_ROOT / ".helm-intelligence" / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    
    report_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = report_dir / f"audit_{report_id}.md"
    
    # Generate markdown report
    md = f"""# Helm Intelligence Audit Report
Generated: {datetime.now().isoformat()}
Duration: {duration:.0f} seconds
Cost: ${total_cost:.2f}

## Summary
- Total findings: {len(all_findings)}
- Critical: {by_severity.get('critical', 0)}
- High: {by_severity.get('high', 0)}
- Medium: {by_severity.get('medium', 0)}
- Low: {by_severity.get('low', 0)}

## Findings

"""
    
    # Group by severity
    for severity in ["critical", "high", "medium", "low"]:
        findings_in_severity = [f for f in all_findings if f.severity == severity]
        if findings_in_severity:
            md += f"### {severity.upper()} ({len(findings_in_severity)})\n\n"
            for f in findings_in_severity:
                md += f"#### {f.title}\n"
                md += f"- **Category**: {f.category}\n"
                md += f"- **File**: `{f.file}`"
                if f.line:
                    md += f" (line {f.line})"
                md += "\n"
                if f.evidence:
                    md += f"- **Evidence**: `{f.evidence[:200]}`\n"
                if f.fix:
                    md += f"- **Fix**: {f.fix}\n"
                md += "\n"
    
    report_path.write_text(md)
    print()
    print(f"📄 Report saved: {report_path}")
    
    # Also save JSON
    json_path = report_dir / f"audit_{report_id}.json"
    json_data = {
        "timestamp": datetime.now().isoformat(),
        "duration_seconds": duration,
        "cost_usd": total_cost,
        "tokens": {"input": total_input, "output": total_output},
        "summary": by_severity,
        "findings": [
            {
                "severity": f.severity,
                "category": f.category,
                "title": f.title,
                "file": f.file,
                "line": f.line,
                "evidence": f.evidence,
                "fix": f.fix
            }
            for f in all_findings
        ]
    }
    json_path.write_text(json.dumps(json_data, indent=2))
    
    return all_findings


if __name__ == "__main__":
    asyncio.run(run_full_audit())
