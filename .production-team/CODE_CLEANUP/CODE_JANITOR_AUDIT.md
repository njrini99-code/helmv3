# 🧹 Code Janitor Audit - Round 01

**Platform:** Both Platforms (BaseballHelm + GolfHelm)
**Timestamp:** 2026-01-10
**Scope:** Dead Code, File Organization, Markdown Consolidation, Code Quality

---

## Executive Summary

| Category | Count | Priority |
|----------|-------|----------|
| Console.log statements | 27 | P1 - Remove |
| Markdown files to consolidate | 88 | P2 - Organize |
| Large files (>500 lines) | 15 | P2 - Consider splitting |
| Old/backup files | 1 | P0 - Delete |
| TODO comments | 6 | P3 - Convert to issues |
| Root markdown files | 43 | P1 - Move to /docs |

**Overall Cleanup Health: Needs Attention**

---

## 🗑️ Dead Code Detection

### Old/Backup Files (Safe to Delete)

#### 1. page.old.tsx
**Location:** `src/app/products/page.old.tsx`
**Lines:** 758
**Status:** UNUSED - old version of products page
**Action:** DELETE
**Command:** `rm src/app/products/page.old.tsx`
**Risk:** NONE - clearly marked as .old

---

## 🔍 Console.log Statements (27 Found)

### Files with Debug Logging

| File | Count | Type |
|------|-------|------|
| `src/lib/utils/schedule-parser.ts` | 14 | Parser debugging |
| `src/components/baseball/calendar/BaseballCalendarWrapper.tsx` | 5 | Calendar connections |
| `src/lib/error-logging.ts` | 2 | Intentional logging |
| `src/lib/performance.tsx` | 1 | Performance metrics |
| `src/lib/logger.ts` | 1 | Debug logger (intentional) |
| `src/hooks/use-dashboard.ts` | 1 | Error logging |
| `src/app/baseball/(onboarding)/coach-onboarding/page.tsx` | 1 | Debug signup |

### Action Items

**Remove (Debug Code):**
```
src/lib/utils/schedule-parser.ts (14 instances)
src/components/baseball/calendar/BaseballCalendarWrapper.tsx (5 instances)
src/app/baseball/(onboarding)/coach-onboarding/page.tsx (1 instance)
```

**Keep (Intentional Logging):**
```
src/lib/error-logging.ts - Context logging for Sentry
src/lib/performance.tsx - Performance metrics
src/lib/logger.ts - Debug logger utility
src/hooks/use-dashboard.ts - Error handling
```

**Priority:** P1
**Effort:** 30 minutes

---

## 📄 Markdown Consolidation

### Current State: 88 Markdown Files (excluding node_modules)

| Location | Count | Status |
|----------|-------|--------|
| Root directory | 43 | ❌ Too many - move to /docs |
| /docs | 45 | ⚠️ Needs organization |
| /src | 4 | ✅ OK |
| /supabase | 2 | ✅ OK |
| /e2e | 1 | ✅ OK |
| /.taskmaster | 3 | ✅ OK |
| /.claude | 3 | ✅ OK |
| /claude-skills | 9 | ✅ OK |
| /tools | 6 | ✅ OK |

### Root Files to Move/Archive

**Category 1: Batch/Progress Notes (Archive or Delete)**
```
BATCH_5_DASHBOARD_LAYOUTS.md
BATCH_9_DESIGN_INTEGRATION.md
BATCH_10_MESSAGING_UI.md
BATCH_10_NOTES.md
FINAL_95_PERCENT_FIXES.md
PREMIUM_FIXES_APPLIED.md
GOLF_DASHBOARD_FIXES_SUMMARY.md
PERFORMANCE_IMPROVEMENTS_APPLIED.md
ADDITIONAL_OPTIMIZATIONS.md
SKELETONS_LOADING_UPDATED.md
ANIMATIONS_COMPLETE.md
V2_UI_WIRING_COMPLETE.md
FIX_STATS_RLS_ISSUE.md
```
**Recommendation:** Move to `/docs/archive/` or delete (git has history)

**Category 2: Setup Guides (Move to /docs)**
```
SUPABASE_MCP_SETUP.md → docs/setup/SUPABASE_MCP.md
RUN_ON_YOUR_MACHINE.md → docs/setup/LOCAL_DEVELOPMENT.md
COACHHELM_DATABASE_SETUP.md → docs/setup/COACHHELM_DATABASE.md
COACHHELM_QUICK_START.md → docs/setup/COACHHELM_QUICKSTART.md
PLAYWRIGHT_SETUP_GUIDE.md → docs/setup/PLAYWRIGHT.md
SENTRY_SETUP_GUIDE.md → docs/setup/SENTRY.md
```

**Category 3: Feature Docs (Move to /docs/features)**
```
FEATURE_1_COACH_PHILOSOPHY_SETTINGS.md → docs/features/COACH_PHILOSOPHY.md
COACHHELM_IMPLEMENTATION_GUIDE.md → docs/features/COACHHELM.md
WHERE_IS_COACHHELM.md → Delete (likely outdated)
```

**Category 4: Reports (Move to /docs/reports)**
```
COACHHELM_VERIFICATION_REPORT.md
CORRECTED_VERIFICATION.md
PREMIUM_UI_AUDIT.md
AGENT1_SECURITY_REPORT.md
AUTH_FLOW_ANALYSIS.md
```

**Category 5: Keep in Root**
```
README.md ✅
CLAUDE.md ✅
CLAUDE_CODE_GUIDE.md ✅
DEPLOY.md ✅
TODO.md ✅ (but consolidate with issues)
WORKFLOW.md ✅
```

### /docs Consolidation

**Multiple Auth Audit Files (Consolidate to 1):**
```
AUTH_AUDIT_SUMMARY.md
AUTH_GAPS_AUDIT_REPORT.md
AUTH_SYSTEM_AUDIT.md
AUTHENTICATION_SYSTEM_AUDIT.md
COMPREHENSIVE_AUTH_AUDIT.md
COMPREHENSIVE_AUTH_SYSTEM_PLAN.md
```
**→ Consolidate to:** `docs/security/AUTH_SYSTEM.md`

**Multiple RLS/Security Files (Consolidate to 1):**
```
RLS_AUDIT_REPORT.md
RLS_SECURITY_AUDIT.md
SECURITY_AUDIT.md
DATA_INTEGRITY_AUDIT.md
```
**→ Consolidate to:** `docs/security/RLS_POLICIES.md`

**Multiple Calendar Files (Consolidate to 1):**
```
CALENDAR_COMPREHENSIVE_IMPLEMENTATION_PLAN.md
CALENDAR_SYSTEM_AUDIT_REPORT.md
CALENDAR_SYSTEM_AUDIT.md
```
**→ Consolidate to:** `docs/features/CALENDAR_SYSTEM.md`

**Phase Docs (Archive if completed):**
```
PHASE_1_COLLEGE_COACH.md
PHASE_2_HS_COACH.md
PHASE_3_PLAYER_CORE.md
PHASE_4_PLAYER_RECRUITING.md
PHASE_5_JUCO_COACH.md
PHASE_6_SHOWCASE_COACH.md
```
**→ Move to:** `docs/archive/phases/`

**Priority:** P2
**Effort:** 2-3 hours

---

## 📊 Large Files (>500 Lines)

### Files That Could Be Split

| File | Lines | Recommendation |
|------|-------|----------------|
| `src/lib/types/database.ts` | 6,785 | Keep (auto-generated) |
| `src/app/golf/actions/golf.ts` | 3,411 | Split by feature |
| `src/lib/utils/golf-stats-calculator-shots.ts` | 1,692 | Consider modules |
| `src/components/golf/ShotTrackingComprehensive.tsx` | 1,409 | Extract sub-components |
| `src/app/golf/(onboarding)/player/page.tsx` | 975 | Extract form steps |
| `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx` | 968 | Extract sections |
| `src/components/golf/stats/GolfStatsDisplay.tsx` | 878 | Extract stat cards |
| `src/app/baseball/(onboarding)/player/page.tsx` | 815 | Extract form steps |
| `src/components/golf/calendar/EventDetailModal.tsx` | 814 | Extract tabs |
| `src/app/baseball/(dashboard)/dashboard/page.tsx` | 753 | Extract sections |
| `src/lib/coachhelm/v2/types.ts` | 737 | Keep (type definitions) |
| `src/app/golf/(dashboard)/dashboard/development/development-client.tsx` | 722 | Extract components |
| `src/lib/utils/schedule-parser.ts` | 712 | Split parsers |
| `src/app/golf/(onboarding)/coach/page.tsx` | 701 | Extract form steps |
| `src/lib/coachhelm/v2/mining/shot-pattern-miner.ts` | 693 | Consider modules |

### Split Recommendations

**golf.ts (3,411 lines):**
```
Split into:
- golf-players.ts (player CRUD)
- golf-rounds.ts (round management)
- golf-events.ts (calendar events)
- golf-qualifiers.ts (qualifier functions)
- golf-stats.ts (statistics)
```

**ShotTrackingComprehensive.tsx (1,409 lines):**
```
Extract:
- ShotTrackingHeader.tsx
- ShotTrackingControls.tsx
- ShotTrackingMap.tsx
- ShotTrackingStats.tsx
- ShotTrackingList.tsx
```

**Priority:** P2
**Effort:** 4-6 hours

---

## 📦 Dependencies Audit

### Package.json Analysis

**Total Dependencies:** 39 (28 runtime + 11 dev)

**All packages appear to be in use:**
- UI: @radix-ui/*, lucide-react, framer-motion, recharts
- Backend: @supabase/*, postgres, resend
- Utilities: date-fns, clsx, zod, zustand
- Build: next, tailwindcss, typescript, eslint

**No obvious unused packages detected.**

**Recommendation:** Run `npx depcheck` for deeper analysis.

---

## 🔍 Code Quality Issues

### TODO Comments (6 Found)

**Priority:** P3 - Convert to GitHub Issues

### Magic Numbers

**Files to audit for magic numbers:**
- Stats calculations
- Threshold values
- Timeout durations

---

## 📋 Priority Action Items

### P0 - Immediate (< 5 min)

| # | Item | Command |
|---|------|---------|
| 1 | Delete old products page | `rm src/app/products/page.old.tsx` |

### P1 - This Week (1-2 hours)

| # | Item | Effort |
|---|------|--------|
| 2 | Remove debug console.logs (20 instances) | 30 min |
| 3 | Move batch/progress notes to /docs/archive | 30 min |
| 4 | Move setup guides to /docs/setup | 30 min |

### P2 - This Sprint (3-4 hours)

| # | Item | Effort |
|---|------|--------|
| 5 | Consolidate auth audit docs | 1 hour |
| 6 | Consolidate calendar docs | 30 min |
| 7 | Move phase docs to archive | 30 min |
| 8 | Organize /docs with subdirectories | 1 hour |

### P3 - Backlog

| # | Item | Effort |
|---|------|--------|
| 9 | Split golf.ts into modules | 2 hours |
| 10 | Extract ShotTracking sub-components | 2 hours |
| 11 | Convert TODOs to GitHub issues | 30 min |

---

## 📊 Summary Statistics

| Category | Before | After (Target) |
|----------|--------|----------------|
| Root .md files | 43 | 6 |
| /docs files | 45 | 25 |
| Console.logs | 27 | 7 (intentional only) |
| Old/backup files | 1 | 0 |
| Files >1000 lines | 6 | 6 (some acceptable) |

---

## Proposed Directory Structure

```
/docs
├── setup/
│   ├── LOCAL_DEVELOPMENT.md
│   ├── SUPABASE_MCP.md
│   ├── COACHHELM_DATABASE.md
│   ├── PLAYWRIGHT.md
│   └── SENTRY.md
├── features/
│   ├── CALENDAR_SYSTEM.md
│   ├── COACHHELM.md
│   ├── COACH_PHILOSOPHY.md
│   └── SHOT_TRACKING.md
├── security/
│   ├── AUTH_SYSTEM.md
│   ├── RLS_POLICIES.md
│   └── SECURITY_AUDIT.md
├── architecture/
│   ├── PLATFORM_ARCHITECTURE.md
│   ├── GOLF_ARCHITECTURE.md
│   ├── SCHEMA.md
│   └── ENVIRONMENT_VARIABLES.md
├── guides/
│   ├── PERFORMANCE-TIPS.md
│   ├── BACKUP_AND_DISASTER_RECOVERY.md
│   └── OAUTH_SETUP.md
└── archive/
    ├── phases/
    ├── batches/
    └── reports/
```

---

## Verification Checklist

After cleanup:
- [ ] Run `npm run typecheck`
- [ ] Run `npm run build`
- [ ] Verify no broken imports
- [ ] Check all docs have valid links
- [ ] Confirm no useful content was lost

---

*"A place for everything, and everything in its place. Clean code is happy code."*
