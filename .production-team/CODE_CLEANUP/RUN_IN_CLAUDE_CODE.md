# 🚀 Execute This Audit in Claude Code

**Platform:** Both Platforms
**Round:** 01
**Agents:** 1

## Copy/Paste This Into Claude Code:

```
I need to execute a Both Platforms production audit with 1 specialized agents.

AGENTS TO RUN:

1. 🧹 Code Janitor
   - Load full prompt from: /Users/ricknini/Downloads/helmv3/.production-team/CODE_CLEANUP/PROMPT_CODE_JANITOR.md
   - Execute the audit following all instructions
   - Save findings to: /Users/ricknini/Downloads/helmv3/.production-team/CODE_CLEANUP/CODE_JANITOR_AUDIT.md
   - Update memory at: .production-team/memory/code_janitor_memory.json

EXECUTION STEPS:

1. For each agent, read their PROMPT file above
2. Execute the audit exactly as instructed
3. Use Supabase MCP for database queries
4. Save findings in markdown format
5. Update agent memory JSON

Work autonomously through all 1 agents.

After all agents complete, generate:
- /Users/ricknini/Downloads/helmv3/.production-team/CODE_CLEANUP/04_CROSS_AGENT_SYNTHESIS.md
- /Users/ricknini/Downloads/helmv3/.production-team/CODE_CLEANUP/05_PRIORITY_ACTION_ITEMS.md
```

## Then Open Claude Code and Paste Above Message

That's it! Claude Code will run all 1 agents with full intelligence and memory.
