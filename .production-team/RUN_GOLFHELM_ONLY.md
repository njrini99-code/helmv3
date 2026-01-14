# 🏌️ How to Run GolfHelm-Only Audit in Claude Code

## Copy/Paste This Into Claude Code:

```
I want to run a complete production audit for GolfHelm ONLY. Ignore BaseballHelm completely.

Load the prompt from: .production-team/prompts/GOLFHELM_ONLY_AUDIT.md

Then execute a comprehensive 3-agent audit:

1. DATABASE SENTINEL (GolfHelm Database):
   - Use Supabase MCP to query all golf_* tables
   - Run all SQL queries from the prompt
   - Check RLS coverage on every golf table
   - Analyze relationships, orphaned records, performance
   - Focus on team-based access control
   - Save findings to: .production-team/GOLFHELM_AUDIT_ROUND_01/01_DATABASE_SENTINEL_GOLF.md

2. FEATURE MAESTRO (GolfHelm Features):
   - Map all routes in src/app/golf/
   - Test completeness of: team management, round creation, scoring, stats, tournaments
   - Check edge cases for each feature
   - Verify error/loading/empty states
   - Test user journeys (coach workflow)
   - Save findings to: .production-team/GOLFHELM_AUDIT_ROUND_01/02_FEATURE_MAESTRO_GOLF.md

3. EXPERIENCE ARCHITECT (GolfHelm UI/UX):
   - Audit all golf components for glassmorphism
   - Check kelly green usage (#22c55e)
   - Verify dark mode in golf routes
   - Test mobile experience for golf features
   - Compare design consistency with baseball
   - Check accessibility
   - Save findings to: .production-team/GOLFHELM_AUDIT_ROUND_01/03_EXPERIENCE_ARCHITECT_GOLF.md

4. SYNTHESIS:
   - Generate cross-agent synthesis: .production-team/GOLFHELM_AUDIT_ROUND_01/04_GOLF_SYNTHESIS.md
   - Create priority action items: .production-team/GOLFHELM_AUDIT_ROUND_01/05_GOLF_ACTION_ITEMS.md

Work autonomously through all three agents. Use Supabase MCP for database queries. Focus ONLY on GolfHelm.
```

## What Claude Code Will Do:

1. **Load the GolfHelm audit prompt** ✅
2. **Run Database Sentinel** with Supabase MCP
   - Query all `golf_*` tables
   - Check RLS policies
   - Analyze performance
   - Find orphaned records
   
3. **Run Feature Maestro**
   - Map `/golf/*` routes
   - Test team management, rounds, scoring, stats
   - Check edge cases
   - Verify UI states

4. **Run Experience Architect**
   - Audit golf components
   - Check glassmorphism + kelly green
   - Verify dark mode
   - Test mobile experience

5. **Generate synthesis & action items**

## Output Location:

```
.production-team/GOLFHELM_AUDIT_ROUND_01/
├── 01_DATABASE_SENTINEL_GOLF.md ........ Golf database audit
├── 02_FEATURE_MAESTRO_GOLF.md .......... Golf features audit
├── 03_EXPERIENCE_ARCHITECT_GOLF.md ..... Golf UI/UX audit
├── 04_GOLF_SYNTHESIS.md ................ Cross-agent insights
└── 05_GOLF_ACTION_ITEMS.md ............. What to fix
```

## After GolfHelm Audit:

Review findings, fix issues, then run **BaseballHelm-only audit** separately.

---

**Just paste the message above into Claude Code and let it run!** 🚀
