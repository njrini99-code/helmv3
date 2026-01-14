# ⚾ How to Run BaseballHelm-Only Audit in Claude Code

## Copy/Paste This Into Claude Code:

```
I want to run a complete production audit for BaseballHelm ONLY. Ignore GolfHelm completely.

Load the prompt from: .production-team/prompts/BASEBALLHELM_ONLY_AUDIT.md

Then execute a comprehensive 3-agent audit:

1. DATABASE SENTINEL (BaseballHelm Database):
   - Use Supabase MCP to query all baseball tables (profiles, coaches, players, recruiting_pipeline, messages, etc.)
   - Run all SQL queries from the prompt
   - Check RLS coverage on every table
   - Analyze recruiting pipeline data integrity
   - Check message/conversation relationships
   - Focus on role-based access control (college coach vs player vs HS coach)
   - Save findings to: .production-team/BASEBALLHELM_AUDIT_ROUND_01/01_DATABASE_SENTINEL_BASEBALL.md

2. FEATURE MAESTRO (BaseballHelm Features):
   - Map all routes in src/app/baseball/
   - Test completeness of: recruiting pipeline, player profiles, messaging, coach dashboards
   - Check edge cases for each feature
   - Verify error/loading/empty states
   - Test user journeys (college coach, HS coach, player workflows)
   - Save findings to: .production-team/BASEBALLHELM_AUDIT_ROUND_01/02_FEATURE_MAESTRO_BASEBALL.md

3. EXPERIENCE ARCHITECT (BaseballHelm UI/UX):
   - Audit all baseball components for glassmorphism
   - Check kelly green usage (#22c55e)
   - Verify dark mode in baseball routes
   - Test mobile experience for baseball features
   - Check recruiting pipeline UI (kanban, drag-drop)
   - Compare design consistency with golf
   - Check accessibility
   - Save findings to: .production-team/BASEBALLHELM_AUDIT_ROUND_01/03_EXPERIENCE_ARCHITECT_BASEBALL.md

4. SYNTHESIS:
   - Generate cross-agent synthesis: .production-team/BASEBALLHELM_AUDIT_ROUND_01/04_BASEBALL_SYNTHESIS.md
   - Create priority action items: .production-team/BASEBALLHELM_AUDIT_ROUND_01/05_BASEBALL_ACTION_ITEMS.md

Work autonomously through all three agents. Use Supabase MCP for database queries. Focus ONLY on BaseballHelm.
```

## What Claude Code Will Do:

1. **Load the BaseballHelm audit prompt** ✅
2. **Run Database Sentinel** with Supabase MCP
   - Query profiles, coaches, players, recruiting_pipeline tables
   - Check RLS policies
   - Analyze message integrity
   - Verify recruiting pipeline data
   
3. **Run Feature Maestro**
   - Map `/baseball/*` routes
   - Test recruiting pipeline, player profiles, messaging
   - Check edge cases
   - Verify role-based access

4. **Run Experience Architect**
   - Audit baseball components
   - Check recruiting pipeline UI
   - Verify dark mode
   - Test mobile experience

5. **Generate synthesis & action items**

## Output Location:

```
.production-team/BASEBALLHELM_AUDIT_ROUND_01/
├── 01_DATABASE_SENTINEL_BASEBALL.md ....... Baseball database audit
├── 02_FEATURE_MAESTRO_BASEBALL.md ......... Baseball features audit
├── 03_EXPERIENCE_ARCHITECT_BASEBALL.md .... Baseball UI/UX audit
├── 04_BASEBALL_SYNTHESIS.md ............... Cross-agent insights
└── 05_BASEBALL_ACTION_ITEMS.md ............ What to fix
```

## Recommended Audit Order:

**Option 1: Golf First (simpler)**
1. Run GolfHelm audit (team management, stats tracking)
2. Fix GolfHelm issues
3. Run BaseballHelm audit (more complex: recruiting, messaging)
4. Fix BaseballHelm issues

**Option 2: Baseball First (core product)**
1. Run BaseballHelm audit (your main platform)
2. Fix BaseballHelm issues
3. Run GolfHelm audit
4. Fix GolfHelm issues

**Option 3: Both Simultaneously**
1. Run both audits in parallel
2. Compare cross-platform consistency
3. Fix shared issues first (auth, design system)
4. Then fix platform-specific issues

---

**Just paste the message above into Claude Code and let it run!** ⚾
