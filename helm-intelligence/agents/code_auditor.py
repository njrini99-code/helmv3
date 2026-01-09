"""
Helm Intelligence - Code Auditor Agent
Specialized agent for TypeScript/Next.js 14 code analysis.
"""

from dataclasses import dataclass
from typing import Optional
from pathlib import Path

from agents.base import BaseAgent, Finding, AgentConfig, TOOL_REGISTRY
from config.settings import AgentRole, Models, Severity, Category, HelmConfig


# ============================================
# CODE AUDITOR SYSTEM PROMPT
# ============================================

CODE_AUDITOR_SYSTEM_PROMPT = """You are an expert Code Auditor Agent for Helm Intelligence, a multi-agent system for auditing and improving the Helm Sports Labs codebase.

# Your Expertise
- TypeScript strict mode
- Next.js 14 App Router architecture
- React Server Components vs Client Components
- Supabase integration patterns
- Tailwind CSS and design systems
- Performance optimization
- Security best practices

# Codebase Context: Helm Sports Labs
- **Products**: BaseballHelm (recruiting), GolfHelm (team management), CoachHelm (AI layer)
- **Stack**: Next.js 14, TypeScript strict, Supabase, Tailwind CSS, Zustand, Framer Motion
- **Design**: Linear/Vercel-inspired, glassmorphism, premium aesthetics

# Critical Rules (from CLAUDE.md)
1. **Type Imports**: Always `import type { X } from '@/lib/types'` - NOT @/types/database
2. **Supabase Client**: 
   - Server: `import { createClient } from '@/lib/supabase/server'` then `await createClient()`
   - Client: `'use client'` + `import { createClient } from '@/lib/supabase/client'` then `createClient()`
3. **Client Components**: MUST have `'use client'` directive if using hooks/interactivity
4. **Server Actions**: Must check auth first, call `revalidatePath()` after mutations
5. **Pipeline Stages**: Only 5 valid: 'watchlist' | 'high_priority' | 'offer_extended' | 'committed' | 'uninterested'

# File Structure
```
src/
├── app/
│   ├── baseball/           # Baseball routes
│   ├── golf/               # Golf routes
│   ├── actions/            # Server actions ONLY
│   └── api/                # API routes
├── components/
│   ├── ui/                 # Primitives (Button, GlassCard, etc.)
│   ├── baseball/           # Baseball components
│   ├── golf/               # Golf components
│   └── shared/             # Cross-product
├── lib/
│   ├── supabase/           # server.ts, client.ts
│   ├── types/              # ALL types
│   └── queries/            # Server queries
├── hooks/                  # Custom hooks
└── stores/                 # Zustand stores
```

# Your Task
Systematically analyze code files for:
1. **Type Safety**: Missing types, `any` usage, incorrect imports
2. **React Patterns**: Missing 'use client', Server/Client component misuse
3. **Supabase Patterns**: Wrong client usage, missing auth checks, no revalidation
4. **Performance**: Missing memoization, inline object creation, bundle size
5. **Code Quality**: Dead code, duplication, complexity, naming
6. **Security**: Exposed secrets, unsafe operations, missing validation
7. **Architecture**: Wrong file placement, circular dependencies

# Output Format
For each finding, provide:
- Severity: critical | high | medium | low
- Category: type_safety | code_quality | performance | security | architecture
- Location: { file, line (if applicable), component }
- Evidence: The problematic code snippet
- Suggested fix: Concrete code example

Use the provided tools to read files, search patterns, and analyze the codebase.
Be thorough but prioritize critical issues. Think step-by-step before making findings.
"""


# ============================================
# CODE AUDITOR AGENT
# ============================================

class CodeAuditorAgent(BaseAgent):
    """
    Specialized agent for TypeScript/Next.js code analysis.
    MAXIMUM POWER MODE - Full 200K context, deep analysis.
    """
    
    def __init__(self, helm_config: Optional[HelmConfig] = None):
        config = AgentConfig(
            role=AgentRole.CODE_AUDITOR,
            model=Models.SPECIALIST,
            system_prompt=CODE_AUDITOR_SYSTEM_PROMPT,
            tools=[
                "read_file",
                "list_directory",
                "search_files",
                "grep_pattern",
                "analyze_imports",
                "check_types",
                "run_eslint",
            ],
            max_turns=100,
            temperature=0.0,
            thinking_budget=0,        # Disabled for API compatibility
            max_output_tokens=16384,  # Full output capacity
        )
        super().__init__(config)
        self.helm_config = helm_config or HelmConfig()
    
    async def execute_task(self, task: str, context: dict) -> dict:
        """Execute the code audit task."""
        findings = []
        
        # Run the agentic loop
        async for event in self.run(task, context):
            if event["type"] == "text":
                # Parse findings from text if structured
                pass
            elif event["type"] == "complete":
                break
        
        return {
            "agent_id": self.agent_id,
            "findings": [f.to_dict() for f in self.findings],
            "stats": self.get_stats(),
        }
    
    async def audit_file(self, filepath: str) -> list[Finding]:
        """Audit a specific file."""
        task = f"""Analyze this file for code quality issues:

File: {filepath}

Check for:
1. Missing or incorrect type imports (must use @/lib/types)
2. Supabase client misuse (server vs client)
3. Missing 'use client' directive for interactive components
4. Performance issues (missing memoization, inline objects in JSX)
5. Security concerns (exposed data, missing validation)
6. Dead code or unused exports
7. Complexity and maintainability issues

Read the file and provide detailed findings with specific line numbers and fixes.
"""
        await self.execute_task(task, {})
        return self.findings
    
    async def audit_directory(self, directory: str, patterns: list[str] = None) -> list[Finding]:
        """Audit all matching files in a directory."""
        patterns = patterns or ["**/*.ts", "**/*.tsx"]
        
        task = f"""Perform a comprehensive code audit of:

Directory: {directory}
Patterns: {patterns}

Phase 1: Discovery
- List all TypeScript/React files
- Identify high-risk areas (auth, API routes, database queries)

Phase 2: Deep Analysis
For each file, check:
1. Type safety and imports
2. React patterns (Server vs Client components)
3. Supabase patterns
4. Performance issues
5. Security vulnerabilities

Phase 3: Synthesis
- Prioritize findings by severity
- Group related issues
- Identify systemic patterns (same mistake across files)

Be thorough but efficient. Focus on impactful issues.
"""
        await self.execute_task(task, {"patterns": patterns})
        return self.findings
    
    async def check_helm_patterns(self) -> list[Finding]:
        """Check for Helm-specific pattern violations."""
        task = """Check for Helm Sports Labs specific pattern violations:

1. **Import Violations**
   Search for: `from '@/types` or `from '@/types/database'`
   Should be: `from '@/lib/types'`

2. **Pipeline Stage Violations**
   Search for invalid pipeline stages like: 'contacted', 'campus_visit', 'priority'
   Valid stages: 'watchlist', 'high_priority', 'offer_extended', 'committed', 'uninterested'

3. **Table Name Violations**
   Search for incorrect table names like: 'recruit_watchlist', 'player_videos', 'colleges'
   Correct names: 'watchlists', 'videos', 'organizations'

4. **Supabase Client Violations**
   - Server files using client import
   - Client components missing 'use client'
   - Missing `await` on `createClient()` in server contexts

5. **Server Action Violations**
   - Missing auth check
   - Missing `revalidatePath()` after mutations
   - Console.log statements

Search the entire codebase and report all violations with file paths and line numbers.
"""
        await self.execute_task(task, {"helm_config": self.helm_config.__dict__})
        return self.findings


# ============================================
# HELPER FUNCTIONS FOR CODE ANALYSIS
# ============================================

def detect_client_component_issues(content: str, filepath: str) -> list[Finding]:
    """Detect issues with client component declarations."""
    findings = []
    
    # Check for React hooks without 'use client'
    hooks = ["useState", "useEffect", "useCallback", "useMemo", "useRef", "useContext"]
    has_hooks = any(hook in content for hook in hooks)
    has_use_client = "'use client'" in content or '"use client"' in content
    
    if has_hooks and not has_use_client:
        findings.append(Finding(
            category=Category.CODE_QUALITY,
            severity=Severity.HIGH,
            title="Missing 'use client' directive",
            description="File uses React hooks but lacks 'use client' directive",
            location={"file": filepath, "line": 1},
            evidence=f"Uses hooks: {[h for h in hooks if h in content]}",
            suggested_fix="Add 'use client'; at the top of the file",
            automatable=True,
        ))
    
    return findings


def detect_import_issues(content: str, filepath: str) -> list[Finding]:
    """Detect incorrect import patterns."""
    findings = []
    
    # Wrong type imports
    if "@/types/database" in content or "from '@/types'" in content:
        findings.append(Finding(
            category=Category.CODE_QUALITY,
            severity=Severity.HIGH,
            title="Incorrect type import path",
            description="Types should be imported from @/lib/types",
            location={"file": filepath},
            evidence="Uses @/types instead of @/lib/types",
            suggested_fix="import type { X } from '@/lib/types'",
            automatable=True,
        ))
    
    return findings


def detect_supabase_issues(content: str, filepath: str) -> list[Finding]:
    """Detect Supabase client usage issues."""
    findings = []
    
    # Server file using client import
    is_server_file = "/actions/" in filepath or "/api/" in filepath or "page.tsx" in filepath
    uses_client_import = "from '@/lib/supabase/client'" in content
    has_use_client = "'use client'" in content
    
    if is_server_file and uses_client_import and not has_use_client:
        findings.append(Finding(
            category=Category.SECURITY,
            severity=Severity.CRITICAL,
            title="Server file using client Supabase",
            description="Server-side file is using client Supabase import",
            location={"file": filepath},
            evidence="Uses @/lib/supabase/client in server context",
            suggested_fix="Use @/lib/supabase/server and await createClient()",
            automatable=True,
        ))
    
    # Missing await on createClient in server
    if "@/lib/supabase/server" in content:
        if "createClient()" in content and "await createClient()" not in content:
            # Check if it's not being assigned to await
            if "= createClient()" in content:
                findings.append(Finding(
                    category=Category.CODE_QUALITY,
                    severity=Severity.HIGH,
                    title="Missing await on server createClient",
                    description="Server Supabase client must be awaited",
                    location={"file": filepath},
                    evidence="const supabase = createClient() instead of await createClient()",
                    suggested_fix="const supabase = await createClient()",
                    automatable=True,
                ))
    
    return findings


def detect_server_action_issues(content: str, filepath: str) -> list[Finding]:
    """Detect issues in server actions."""
    findings = []
    
    if "'use server'" not in content:
        return findings
    
    # Missing auth check
    if "supabase.auth.getUser()" not in content and "getUser()" not in content:
        findings.append(Finding(
            category=Category.SECURITY,
            severity=Severity.CRITICAL,
            title="Server action missing auth check",
            description="Server actions should verify user authentication",
            location={"file": filepath},
            evidence="No auth.getUser() call found",
            suggested_fix="Add: const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error('Unauthorized');",
            automatable=False,
        ))
    
    # Check for revalidatePath after mutations
    has_mutation = any(x in content for x in [".insert(", ".update(", ".delete(", ".upsert("])
    has_revalidate = "revalidatePath" in content
    
    if has_mutation and not has_revalidate:
        findings.append(Finding(
            category=Category.CODE_QUALITY,
            severity=Severity.MEDIUM,
            title="Missing revalidatePath after mutation",
            description="Server actions should revalidate cache after mutations",
            location={"file": filepath},
            evidence="Has mutation but no revalidatePath call",
            suggested_fix="Add: revalidatePath('/relevant/path') after the mutation",
            automatable=False,
        ))
    
    # Console.log in production code
    if "console.log" in content:
        findings.append(Finding(
            category=Category.CODE_QUALITY,
            severity=Severity.LOW,
            title="Console.log in server action",
            description="Remove console.log statements from production code",
            location={"file": filepath},
            evidence="Contains console.log",
            suggested_fix="Remove or replace with proper logging",
            automatable=True,
        ))
    
    return findings
