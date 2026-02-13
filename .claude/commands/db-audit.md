# GolfHelm Database Audit

Run a comprehensive database audit using the GolfHelm Database Engineer skill.

## Audit Scope
`$ARGUMENTS`

If no arguments provided, run a **full audit**. Otherwise, run a **targeted audit** on the specified area.

## Examples
- `/db-audit` → Full database health check (all 7 agents, 2 waves)
- `/db-audit rls` → RLS policy audit only
- `/db-audit stats` → Stats integrity check only
- `/db-audit team` → Team membership & join flow audit
- `/db-audit coach can't see players` → Targeted investigation
- `/db-audit player dashboard empty` → Targeted investigation

## Instructions

1. **Read the skill file** at `.skills/skills/golfhelm-db-engineer/SKILL.md`
2. **Follow the workflow exactly** as described in the skill:
   - If no arguments: run Step 0 (Triage) → Step 1 (Wave 1) → Step 1.5 (Coordinator Handoff) → Step 2 (Wave 2) → Step 3 (Compile Report)
   - If arguments provided: run the Targeted Audit flow — read relevant reference files and run focused diagnostic queries
3. **Use ONLY the `execute_sql` MCP tool** for all database queries — no other tools, APIs, or HTTP requests
4. **Only SELECT queries** — never modify data unless explicitly told to "fix it"
5. **Output the full report** in the format specified in the skill file, with severity levels and evidence
6. **LIMIT 50** on every diagnostic query to prevent timeouts

## Reference Files (in `.skills/skills/golfhelm-db-engineer/references/`)

| File | Use When |
|------|----------|
| `audit-playbooks.md` | Full audit / health check |
| `rls-policies.md` | RLS / visibility / "can't see data" |
| `stats-contracts.md` | Stats wrong / calculations off |
| `business-logic.md` | Team join / roster / membership |
| `schema.md` | Schema / column lookup |
| `smart-diagnostics.md` | Logic bugs / impossible states / triggers |
