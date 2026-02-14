# Helm Intelligence

> **MAXIMUM POWER MODE** - Ultra-powerful multi-agent system with full 200K context windows.

Built for **Helm Sports Labs** with a **$30 API budget** that enables ~7 comprehensive audits.

## 🔥 Maximum Power Specifications

| Setting | Value |
|---------|-------|
| **Context Window** | 200,000 tokens per agent |
| **Extended Thinking** | 32,000 tokens |
| **Max Output** | 16,384 tokens per response |
| **Budget** | $30 USD (~7 full audits) |
| **Cost per Audit** | ~$4 USD |

## 🚀 Features

### Multi-Agent Architecture
- **Orchestrator**: Coordinates all agents using Claude Opus 4
- **Code Auditor**: TypeScript/React analysis (Claude Sonnet 4)
- **Database Auditor**: Supabase/PostgreSQL security & performance
- **UI/UX Auditor**: Accessibility & design system compliance
- **Enhancement Agent**: Synthesis & recommendations

### Intelligent Workflow
```
EXAMINE → DOCUMENT → FIND ISSUES → VERIFY → FIX → SYNTHESIZE
```

Each phase is checkpointed for recovery and can be resumed.

### Memory System
- **Semantic Memory**: Facts and knowledge that persist across sessions
- **Episodic Memory**: Successful patterns and learnings
- **Codebase Knowledge**: File purposes, conventions, recurring issues

### Production-Ready
- Automatic checkpointing for crash recovery
- Token usage tracking and cost estimation
- Parallel agent execution
- Comprehensive reporting (JSON, Markdown, GitHub Issues)

## 📦 Installation

```bash
# Clone or copy the helm-agents directory
cd helm-agents

# Install dependencies
pip install anthropic

# Set your API key
export ANTHROPIC_API_KEY=your_key_here

# Configure project path (optional - defaults to helmv3)
export HELM_PROJECT_ROOT=/path/to/your/project
```

## 🎯 Quick Start

### Run a Full Audit
```bash
python main.py audit --full
```

### Run Specific Auditors
```bash
# Code only
python main.py audit --code

# Database only
python main.py audit --db

# UI/UX only
python main.py audit --ui

# Combine
python main.py audit --code --db
```

### View Reports
```bash
# List reports
ls .helm-intelligence/reports/

# View specific report
python main.py report <workflow_id>
```

### Resume from Checkpoint
```bash
python main.py resume <checkpoint_id>
```

## 🏗️ Architecture

```
helm-agents/
├── config/
│   └── settings.py          # Configuration & constants
├── agents/
│   ├── base.py              # Core agent framework
│   ├── code_auditor.py      # TypeScript/React analysis
│   ├── database_auditor.py  # Supabase/PostgreSQL analysis
│   ├── ui_auditor.py        # Accessibility & design
│   └── enhancement_agent.py # Synthesis & recommendations
├── orchestrator/
│   └── coordinator.py       # Multi-agent coordination
├── tools/
│   └── toolkit.py           # Agent tools (file ops, analysis)
├── memory/
│   └── memory_system.py     # Persistent memory
└── main.py                  # CLI entry point
```

## 🔧 Configuration

### HelmConfig
Customize for your project in `config/settings.py`:

```python
@dataclass
class HelmConfig:
    products: list[str] = ["BaseballHelm", "GolfHelm", "CoachHelm"]
    framework: str = "Next.js 14 App Router"
    language: str = "TypeScript strict"
    database: str = "Supabase (PostgreSQL)"
    # ... more
```

### AuditConfig
Control what gets audited:

```python
@dataclass
class AuditConfig:
    audit_code: bool = True
    audit_database: bool = True
    audit_ui: bool = True
    deep_analysis: bool = True
    auto_fix_low_risk: bool = False
    max_concurrent_agents: int = 4
```

## 📊 Reports

### Finding Structure
```json
{
  "id": "abc123",
  "category": "security",
  "severity": "critical",
  "title": "Missing RLS policy on golf_rounds",
  "description": "Table allows unauthorized access",
  "location": {
    "file": "supabase/migrations/016_golf_schema.sql",
    "table": "golf_rounds"
  },
  "evidence": "RLS not enabled",
  "suggested_fix": "ALTER TABLE golf_rounds ENABLE ROW LEVEL SECURITY;",
  "automatable": true
}
```

### Severity Levels
- **Critical**: Security vulnerabilities, data loss risks
- **High**: Performance issues, accessibility blockers
- **Medium**: Code quality, minor UX problems
- **Low**: Style inconsistencies

## 🤖 Agent Details

### Code Auditor
Checks for:
- Type safety issues (`any` usage, missing types)
- React patterns (missing `'use client'`, Server/Client misuse)
- Supabase patterns (wrong client, missing auth checks)
- Import violations (wrong `@/types` path)
- Performance issues (missing memoization)
- Helm-specific rules (pipeline stages, table names)

### Database Auditor
Checks for:
- Tables without RLS enabled
- Missing CRUD policies
- Overly permissive policies (`USING (true)`)
- Missing indexes on foreign keys
- Schema integrity issues
- Migration safety

### UI/UX Auditor
Checks for:
- Missing alt text on images
- Form accessibility (labels, ARIA)
- Design system compliance
- Glassmorphism consistency
- Component quality (loading states, error handling)
- Responsive design

## 💰 Budget & Cost ($30 Total)

**Your $30 budget enables:**
- ~7 full comprehensive audits
- ~15 quick/targeted audits
- Full 200K context on every agent

**Cost Breakdown:**

| Audit Type | Estimated Cost | What You Get |
|------------|----------------|--------------|
| Full Audit | ~$4 | All 4 agents, deep analysis, 200K context |
| Code Only | ~$1.50 | TypeScript/React deep dive |
| DB Only | ~$1.00 | RLS security audit |
| Quick Mode | ~$2 | All agents, faster analysis |

**Model Costs (Sonnet 4):**
- Input: $3 per million tokens
- Output: $15 per million tokens
- Prompt caching: 90% savings on repeated prompts

## 🔄 Workflow Phases

### Phase 1: EXAMINE
Gather information about the codebase structure, dependencies, and configuration.

### Phase 2: DOCUMENT
Prepare context and identify high-risk areas for deep analysis.

### Phase 3: FIND ISSUES
Run specialized agents in parallel to detect issues:
- Code patterns and anti-patterns
- Security vulnerabilities
- Performance bottlenecks
- UX issues

### Phase 4: VERIFY
Run TypeScript and ESLint checks to ensure baseline quality.

### Phase 5: FIX (Optional)
Apply safe, automated fixes for low-risk issues.

### Phase 6: SYNTHESIZE
Combine all findings into a prioritized improvement plan.

## 🧠 Memory System

### Semantic Memory
Stores facts discovered during audits:
```python
MEMORY_SYSTEM.semantic.add(
    content="Component X uses prop drilling - consider context",
    category="code",
    tags=["react", "patterns"],
)
```

### Episodic Memory
Captures successful patterns:
```python
MEMORY_SYSTEM.episodic.record(
    observation="Found 15 components with inline objects",
    reasoning="Causes unnecessary re-renders",
    action="Wrapped in useMemo",
    outcome="Performance score improved 20%",
    success=True,
)
```

### Context for Agents
```python
context = MEMORY_SYSTEM.get_context_for_agent("code_auditor")
# Returns relevant memories for this agent type
```

## 🔌 Extending

### Add a New Tool
```python
from agents.base import Tool, TOOL_REGISTRY

TOOL_REGISTRY.register(Tool(
    name="my_tool",
    description="Does something useful",
    input_schema={
        "type": "object",
        "properties": {
            "param": {"type": "string"}
        },
        "required": ["param"]
    },
    handler=my_handler_function
))
```

### Add a New Agent
```python
from agents.base import BaseAgent, AgentConfig

class MyAgent(BaseAgent):
    def __init__(self):
        config = AgentConfig(
            role=AgentRole.CUSTOM,
            model=Models.SPECIALIST,
            system_prompt="Your expertise...",
            tools=["read_file", "my_tool"],
        )
        super().__init__(config)
    
    async def execute_task(self, task: str, context: dict) -> dict:
        async for event in self.run(task, context):
            # Process events
            pass
        return {"findings": self.findings}
```

## 📋 Production Checklist

The system generates a production-readiness checklist:

- [ ] All tables have RLS enabled
- [ ] All server actions check auth
- [ ] No `any` types in TypeScript
- [ ] All images have alt text
- [ ] Design system consistent
- [ ] Loading states present
- [ ] Error boundaries in place

## 🚀 Overnight Runs

Set up as a cron job or GitHub Action:

```yaml
# .github/workflows/audit.yml
name: Nightly Audit
on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM daily
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Audit
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: python helm-agents/main.py audit --full
```

## 📝 License

MIT License - Built for Helm Sports Labs

## 🤝 Contributing

1. Add new tools to `tools/toolkit.py`
2. Add new agents to `agents/`
3. Update configs in `config/settings.py`
4. Test with `python main.py audit --code`

---

Built with ❤️ using the Claude SDK

# Triggered redeploy Sat Feb 14 18:31:54 EST 2026
