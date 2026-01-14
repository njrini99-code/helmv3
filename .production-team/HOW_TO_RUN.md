# 🚀 Running Production Audits in Claude Code

## Overview
Your production audit team is powered by Claude Code with direct database access via Supabase MCP. Each agent gets **progressively smarter** by learning from past rounds.

## Setup (One-Time)

### 1. Verify Supabase MCP Connection
```bash
# Check your .mcp.json has Supabase configured
cat .mcp.json

# Should see something like:
# {
#   "mcpServers": {
#     "supabase": {
#       "command": "npx",
#       "args": ["-y", "@modelcontextprotocol/server-supabase"],
#       "env": {
#         "SUPABASE_URL": "your-project.supabase.co",
#         "SUPABASE_SERVICE_ROLE_KEY": "your-key"
#       }
#     }
#   }
# }
```

### 2. Initialize Agent Memory
Memory files are created automatically on first run, but you can verify:
```bash
ls -la .production-team/memory/
# Should see (or will be created):
# - database_sentinel_memory.json
# - feature_maestro_memory.json  
# - experience_architect_memory.json
```

## Running Audits

### Method 1: Automated Python Script (Quick)

```bash
# Run Round 1 (all agents)
python3 .production-team/run_audit_v2.py 1

# Run Round 2 (after fixes)
python3 .production-team/run_audit_v2.py 2

# Run Round N
python3 .production-team/run_audit_v2.py N
```

**What this does:**
- Loads each agent's memory from past rounds
- Runs file-based audits (schema, routes, components)
- Saves findings to `.production-team/ROUND_{N}/`
- Updates agent memories automatically

**Limitations:**
- Cannot query live database (Python script limitation)
- Only analyzes files, not actual data

### Method 2: Claude Code with Database Access (RECOMMENDED)

This is where the magic happens - agents can query your live database!

#### Step 1: Start Claude Code Session
```bash
# Navigate to project
cd /Users/ricknini/Downloads/helmv3

# Start Claude Code
claude-code
```

#### Step 2: Run Database Sentinel (with real DB queries)

In Claude Code chat:
```
Load the prompt from .production-team/prompts/DATABASE_SENTINEL_PROMPT.md

Execute a Database Sentinel audit for Round {N}.

Use Supabase MCP to run all the SQL queries in the prompt.

Save findings to .production-team/ROUND_{N}/01_DATABASE_SENTINEL_FINDINGS.md

Update your memory at .production-team/memory/database_sentinel_memory.json
```

Claude Code will:
1. Load the prompt
2. Load memory from past rounds
3. Execute real SQL queries against your database via MCP
4. Analyze results with context from previous rounds
5. Generate detailed findings
6. Save everything and update memory

#### Step 3: Run Feature Maestro

In Claude Code chat:
```
Load the prompt from .production-team/prompts/FEATURE_MAESTRO_PROMPT.md

Execute a Feature Maestro audit for Round {N}.

Map all routes, test features, verify edge cases.

Save findings to .production-team/ROUND_{N}/02_FEATURE_MAESTRO_FINDINGS.md

Update your memory at .production-team/memory/feature_maestro_memory.json
```

#### Step 4: Run Experience Architect

In Claude Code chat:
```
Load the prompt from .production-team/prompts/EXPERIENCE_ARCHITECT_PROMPT.md

Execute an Experience Architect audit for Round {N}.

Analyze all components, check design consistency, verify glassmorphism and kelly green usage.

Save findings to .production-team/ROUND_{N}/03_EXPERIENCE_ARCHITECT_FINDINGS.md

Update your memory at .production-team/memory/experience_architect_memory.json
```

#### Step 5: Generate Cross-Agent Synthesis

In Claude Code chat:
```
Read all findings from:
- .production-team/ROUND_{N}/01_DATABASE_SENTINEL_FINDINGS.md
- .production-team/ROUND_{N}/02_FEATURE_MAESTRO_FINDINGS.md
- .production-team/ROUND_{N}/03_EXPERIENCE_ARCHITECT_FINDINGS.md

Also load all three agent memories to see progress over time.

Generate:
1. Cross-agent synthesis (.production-team/ROUND_{N}/04_CROSS_AGENT_SYNTHESIS.md)
2. Priority action items (.production-team/ROUND_{N}/05_PRIORITY_ACTION_ITEMS.md)
3. Updated scorecard (.production-team/SCORECARD.md)
```

## How Memory Makes Agents Smarter

### Round 1 → Round 2
**Database Sentinel:**
- Round 1: "Found 15 tables without RLS"
- *Fixes applied*
- Round 2: "Verified 12 tables now have RLS. Still missing on: golf_tournaments, golf_rounds, messages"
- **Agent learned**: Pattern of missing RLS, focuses audit on remaining tables

**Feature Maestro:**
- Round 1: "BaseballHelm has 5 features without error states"
- *Fixes applied*
- Round 2: "Verified error states added to 4 features. Recruiting pipeline still needs error handling for concurrent edits"
- **Agent learned**: Error state pattern, predicts similar gaps in GolfHelm

**Experience Architect:**
- Round 1: "Found 20 components not using glassmorphism"
- *Fixes applied*
- Round 2: "Verified glassmorphism added to 18 components. Modals and calendar still need treatment"
- **Agent learned**: Glassmorphism pattern, checks new components automatically

### Round 2 → Round 3
Agents now have enough data to **predict issues**:

**Database Sentinel:**
- "Last round I found RLS missing on golf_* tables. Let me proactively check all new golf tables for RLS before they become production issues."

**Feature Maestro:**
- "Pattern detected: Features in /coaches/ routes often miss empty states. Checking all coach-related features."

**Experience Architect:**
- "Previous rounds show new pages often miss dark sidebar styling. Auditing recently added routes for consistency."

### Round 4+ Excellence
Agents become **expert auditors**:
- Skip resolved issues automatically
- Focus on optimization and polish
- Provide sophisticated recommendations
- Predict architectural concerns

## Example: Full Round Workflow

```bash
# 1. Run audit (automated or via Claude Code)
python3 .production-team/run_audit_v2.py 1
# OR use Claude Code with prompts (recommended for database access)

# 2. Review findings
cat .production-team/ROUND_01/04_CROSS_AGENT_SYNTHESIS.md
cat .production-team/ROUND_01/05_PRIORITY_ACTION_ITEMS.md

# 3. Fix issues identified
# (make code changes, update database, improve UI)

# 4. Commit changes
git add .
git commit -m "fix: address Round 1 audit findings"

# 5. Run Round 2 (agents verify fixes and go deeper)
python3 .production-team/run_audit_v2.py 2
# OR use Claude Code

# 6. Repeat until 95+ score
```

## Verifying Agent Memory

Check what agents have learned:
```bash
# View Database Sentinel's memory
cat .production-team/memory/database_sentinel_memory.json | jq

# See Feature Maestro's patterns
cat .production-team/memory/feature_maestro_memory.json | jq .knowledge_base

# Check Experience Architect's improvements
cat .production-team/memory/experience_architect_memory.json | jq .improvement_metrics
```

## Overnight Autonomous Audits

Combine with your Claude Code autonomous workflows:

```bash
# Before going to sleep, start comprehensive audit
# In Claude Code:
cat <<EOF
Run a complete 3-agent production audit for Round {N}.

For each agent:
1. Load prompt from .production-team/prompts/
2. Load memory from .production-team/memory/
3. Execute thorough audit (use Supabase MCP for Database Sentinel)
4. Save findings to ROUND_{N}/
5. Update agent memory
6. Generate synthesis and action items

Work autonomously. I'll review in the morning.
EOF
```

Wake up to complete audit results with memory-enhanced intelligence!

## Best Practices

### 1. Run Audits After Significant Changes
- After adding new features
- After database schema changes
- After design system updates
- Before production deployments

### 2. Let Memory Compound
- Don't delete memory files
- Run sequential rounds (1, 2, 3...)
- Agents get smarter over time

### 3. Address High-Priority Issues First
- P0 CRITICAL: Fix immediately
- P1 WARNING: Plan for next iteration
- P2 INFO: Nice-to-have improvements

### 4. Use Database Access When Possible
- Python script: Quick file-based audit
- Claude Code + MCP: Deep database analysis
- Combine both for comprehensive coverage

### 5. Track Progress in Scorecard
- Update `.production-team/SCORECARD.md` after each round
- Monitor improvement trends
- Celebrate progress!

## Troubleshooting

### Memory Not Loading?
```bash
# Check memory files exist
ls .production-team/memory/

# If missing, they'll be created on first run
# Or manually create empty template:
echo '{"agent_id":"database_sentinel","total_rounds":0,"knowledge_base":{},"round_history":[],"known_issues_resolved":[],"known_issues_open":[]}' > .production-team/memory/database_sentinel_memory.json
```

### Supabase MCP Not Working?
```bash
# Verify MCP config
cat .mcp.json

# Test Supabase connection
npx @modelcontextprotocol/server-supabase --version

# Check environment variables
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY
```

### Agent Hallucinating Fixes?
- Agents mark issues as "resolved" based on absence in new scans
- If issues persist, they'll reappear in next round
- Memory tracks "attempts_to_fix" for persistent issues

## Success Criteria

You'll know the system is working when:
- ✅ Agents skip reporting already-fixed issues
- ✅ Findings get more sophisticated each round
- ✅ Memory files grow with learnings
- ✅ Cross-agent synthesis identifies correlations
- ✅ Overall scores improve round-over-round
- ✅ Production readiness score reaches 95+

---

*Your agents are ready. They'll learn. They'll improve. They'll compound.*

**Run Round 1 now:**
```bash
python3 .production-team/run_audit_v2.py 1
# OR use Claude Code for database-powered audits
```
