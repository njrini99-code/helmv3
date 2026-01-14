# 🚀 Execute This Audit in Claude Code

**Platform:** GolfHelm
**Round:** 01
**Agents:** 3

## Copy/Paste This Into Claude Code:

```
I need to execute a GolfHelm production audit with 3 specialized agents.

AGENTS TO RUN:

1. 🛡️ Database Sentinel
   - Load full prompt from: /Users/ricknini/Downloads/helmv3/.production-team/GOLFHELM_AUDIT_ROUND_01/PROMPT_DATABASE_SENTINEL.md
   - Execute the audit following all instructions
   - Save findings to: /Users/ricknini/Downloads/helmv3/.production-team/GOLFHELM_AUDIT_ROUND_01/01_DATABASE_SENTINEL_FINDINGS.md
   - Update memory at: .production-team/memory/database_sentinel_memory.json

2. 🎯 Feature Maestro
   - Load full prompt from: /Users/ricknini/Downloads/helmv3/.production-team/GOLFHELM_AUDIT_ROUND_01/PROMPT_FEATURE_MAESTRO.md
   - Execute the audit following all instructions
   - Save findings to: /Users/ricknini/Downloads/helmv3/.production-team/GOLFHELM_AUDIT_ROUND_01/02_FEATURE_MAESTRO_FINDINGS.md
   - Update memory at: .production-team/memory/feature_maestro_memory.json

3. ✨ Experience Architect
   - Load full prompt from: /Users/ricknini/Downloads/helmv3/.production-team/GOLFHELM_AUDIT_ROUND_01/PROMPT_EXPERIENCE_ARCHITECT.md
   - Execute the audit following all instructions
   - Save findings to: /Users/ricknini/Downloads/helmv3/.production-team/GOLFHELM_AUDIT_ROUND_01/03_EXPERIENCE_ARCHITECT_FINDINGS.md
   - Update memory at: .production-team/memory/experience_architect_memory.json

EXECUTION STEPS:

1. For each agent, read their PROMPT file above
2. Execute the audit exactly as instructed
3. Use Supabase MCP for database queries
4. Save findings in markdown format
5. Update agent memory JSON

Work autonomously through all 3 agents.

After all agents complete, generate:
- /Users/ricknini/Downloads/helmv3/.production-team/GOLFHELM_AUDIT_ROUND_01/04_CROSS_AGENT_SYNTHESIS.md
- /Users/ricknini/Downloads/helmv3/.production-team/GOLFHELM_AUDIT_ROUND_01/05_PRIORITY_ACTION_ITEMS.md
```

## Then Open Claude Code and Paste Above Message

That's it! Claude Code will run all 3 agents with full intelligence and memory.
