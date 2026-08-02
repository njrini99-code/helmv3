# CoachHelm Surface Audit — 2026-08-01

## Executive Summary

Audited entire CoachHelm intelligence surface for gaps: computed but not displayed, built but unwired components, actions defined but never called, stubbed UI, and data persisted but never read.

**Findings**: 1 CRITICAL gap (comparison weighting), 4 MEDIUM gaps (task reminder cron), 3 LOW audit/legitimate design gaps. All major CoachHelm components (PerformancePrediction, WhatIfPanel, HeroNarrativeCard, CompositeRatingCard, worst-holes analytics) properly wired and displayed.

---

## 1. COMPUTED BUT NOT DISPLAYED

### 1.1 CRITICAL: Comparison Weighting Sliders (Intentional Placebo Control)

**File**: `src/components/golf/coachhelm/settings/WeightDistributor.tsx`

**Status**: Intentionally suppressed UI — component shows "coming soon" stub instead of interactive sliders.

**Columns Involved**:
- `golf_coach_philosophy.weight_historical`
- `golf_coach_philosophy.weight_recent_form`
- `golf_coach_philosophy.weight_tournament`
- `golf_coach_philosophy.weight_qualifying`
- `golf_coach_philosophy.weight_subjective`

**Problem**: 
- Weights are **persisted to the database** (settings page saves them)
- **Zero consumers read them** — roster-comparison engine is not wired
- Before W31/F062, the UI showed interactive sliders, creating a **placebo control** (coach thinks saving weights affects ranking, but nothing changes)
- Suppressed intentionally to prevent confusion

**Evidence**:
```typescript
// WeightDistributor.tsx lines 31-46
export function WeightDistributor(_props: WeightDistributorProps) {
  void _props;
  return (
    <div className="rounded-lg border border-dashed border-warm-200 bg-warm-50/50 p-4">
      <p className="text-sm text-warm-600">
        Comparison weighting is coming soon. We're finishing the roster-comparison
        engine that uses these factors — until then this control is hidden so it
        doesn't imply changes that aren't applied yet.
      </p>
    </div>
  );
}
```

**Cross-Reference**: Comments at line 30 reference F062 / F115 (design specs) and a TODO to wire these into roster-comparison when ready.

**Impact**: HIGH
- If coach accesses settings, sees no weights control (mitigated)
- If coach somehow pre-W31 saved weights, they exist in DB but are ignored
- Duplication risk: live insight-ranker uses separate table (`golf_coachhelm_coach_weights`), not these columns

**Recommendation**:
1. **Short-term**: Leave as-is (intentional design is correct)
2. **Medium-term**: Wire `golf_coach_philosophy.weight_*` into roster-comparison ranking engine
3. **Alternative**: Delete columns + remove stub UI once roster-comparison not needed

**Related Files**:
- `src/components/golf/coachhelm/settings/ThresholdSlider.tsx` — other settings controls (working)
- `src/app/golf/actions/coaching-philosophy.ts` — persists weight columns
- `src/app/golf/actions/insights.ts` — reads weights (may be legacy code path)

---

### 1.2 LOW: Calibrated Confidence Field

**File**: `src/lib/coachhelm/v2/reasoning/confidence-calibrator.ts`

**Status**: Computed and properly displayed via fallback chain.

**Used**: PerformancePrediction component reads it with fallback:
```typescript
const confidencePercent = Math.round(
  Number(prediction.calibratedConfidence ?? prediction.confidence ?? 0) * 100
);
```

**Impact**: NONE — properly integrated.

---

## 2. BUILT BUT UNWIRED COMPONENTS

**All major CoachHelm components are properly mounted and wired.**

### Summary Check

| Component | File | Used In | Status |
|-----------|------|---------|--------|
| PerformancePrediction | `src/components/golf/coachhelm/player/PerformancePrediction.tsx` | DeepDiveDrill, FairwayPlayerCoachHelm | ✓ WIRED |
| WhatIfPanel | `src/components/golf/coachhelm/player/WhatIfPanel.tsx` | DeepDiveDrill, FairwayPlayerCoachHelm | ✓ WIRED |
| HeroNarrativeCard | `src/components/golf/coachhelm/v3/HeroNarrativeCard.tsx` | FairwayPlayerCoachHelm | ✓ WIRED |
| CompositeRatingCard | `src/components/golf/coachhelm/player/CompositeRatingCard.tsx` | FairwayPlayerCoachHelm | ✓ WIRED |
| FairwayTrendBrain | `src/components/golf/coachhelm/player/FairwayTrendBrain.tsx` | FairwayPlayerCoachHelm | ✓ WIRED |
| ShotAnalysisCard | `src/components/golf/coachhelm/player/ShotAnalysisCard.tsx` | DeepDiveDrill | ✓ WIRED |

**Verdict**: No unwired components found in production surfaces.

---

## 3. ACTIONS DEFINED BUT NEVER CALLED

### 3.1 MEDIUM: Task Reminder Cron Functions (Wrapper Pattern)

**File**: `src/app/golf/actions/task-reminders.ts`

**Unused Direct Call Sites**:
- `cancelTaskReminder()` — **0 call sites**
- `getUpcomingReminders()` — **0 call sites**
- `markReminderSent()` — **called only by cron's `processReminders()`**
- `getReminderStats()` — **0 call sites**
- `getDueReminders()` — **called only by cron's `processReminders()`**

**Status**: These are cron-only helper functions, wrapped by `withAdminObserved()` for observability. The web UI does NOT have a task-reminder UI that calls these directly.

**Cron Route**: `/api/cron/task-reminders` (Vercel hourly job)
- Calls `processReminders(adminClient)` 
- `processReminders()` internally calls `getDueReminders()`, processes them, and calls `markReminderSent()`

**Evidence**:
```typescript
// /api/cron/task-reminders/route.ts line 41
const result = await processReminders(supabase);
```

**Impact**: MEDIUM
- These functions are **not dead code** — they ARE called by the cron
- But there is **no interactive task-reminder notification UI** for players/coaches
- Suggests task reminders are cron-only, never user-initiated

**Recommendation**:
1. **Verify**: These functions should only be called via `/api/cron/task-reminders`
2. **Document**: Add JSDoc comment that these are cron-only exports
3. **Consider**: If task reminders should have an in-app UI (snooze, dismiss, stats), implement it before these functions see production use
4. **Do NOT delete**: The functions ARE live in production via the cron

---

### 3.2 LOW: Auth Password Reset Function

**File**: `src/app/golf/actions/auth.ts`

**Function**: `requestPasswordResetAction(email: string)`

**Usage**: 2 call sites (password reset flow)

**Status**: Legitimate — authentication is critical and low-usage functions here are expected.

**Impact**: NONE

---

### 3.3 LOW: Travel Action

**File**: `src/app/golf/actions/travel.ts`

**Function**: `getItineraryForEvent(eventId: string)`

**Usage**: 2 call sites (travel page)

**Status**: Legitimate — team management feature.

**Impact**: NONE

---

## 4. DATA PERSISTED BUT NEVER READ

### 4.1 Course Edit History Tables (Audit Log)

**Tables**:
- `golf_course_edit_history`
- `golf_course_tee_edit_history`

**Status**: INSERTs exist in `course-library.ts`, no SELECTs anywhere.

**Impact**: LOW — these are audit tables. No reporting UI needed (legitimate design).

**Recommendation**: 
- If admin dashboard should show edit history, implement query + reporting view
- If audit trail is sufficient, document as audit-only in schema comments

---

### 4.2 Golf Predictions Validation

**Table**: `golf_predictions` + `golf_prediction_validations`

**Status**: PROPERLY USED — predictions are validated and updated via cron:
- `/api/cron/coachhelm-validation` — validates predictions against actual outcomes
- `/api/cron/coachhelm-calibration` — calibrates confidence via validation feedback

**Impact**: NONE — properly wired.

---

### 4.3 Worst Holes Insights

**Computed**: `generateWorstHolesInsights()` (v2 orchestrator)

**Stored**: `golf_coach_insights` table

**Displayed**: `src/components/golf/stats/spine-stage/ScoringDrill.tsx`

**Status**: PROPERLY USED

**Impact**: NONE

---

## 5. DATABASE COLUMNS WRITTEN BUT UNUSED

### 5.1 Coaching Philosophy Weight Columns (See Section 1.1)

**Columns**: `weight_historical`, `weight_recent_form`, `weight_tournament`, `weight_qualifying`, `weight_subjective`

**Written**: `src/app/golf/actions/coaching-philosophy.ts`

**Read**: **Never** (roster-comparison not wired)

**Impact**: HIGH — duplicate effort tracking compared to `golf_coachhelm_coach_weights` table used by live insight ranker

---

## 6. INTENTIONAL FEATURE STUBS

### Comparison Weighting Settings (F062/F115)

**Component**: `WeightDistributor.tsx`

**Status**: Intentional — shows "coming soon" instead of functional sliders

**Design Rationale**: Prevent placebo controls. A coach who can save but sees no effect is frustrated; showing "coming soon" is more honest.

**Blocks**: Roster comparison feature (not yet released)

**Action**: Restore once roster-comparison engine consumes weights

---

## 7. INSIGHT TYPES COMPUTED BY ORCHESTRATOR

### All Documented Generators Checked

| Generator | Type | Displayed? | Table | Status |
|-----------|------|-----------|-------|--------|
| PuttDistanceGenerator | v3 | ✓ Yes | golf_coach_insights | WIRED |
| PuttBiasGenerator | v3 | ✓ Yes | golf_coach_insights | WIRED |
| ScramblingGenerator | v3 | ✓ Yes | golf_coach_insights | WIRED |
| ParTypeGenerator | v3 | ✓ Yes | golf_coach_insights | WIRED |
| CourseMgmtGenerator | v3 | ✓ Yes | golf_coach_insights | WIRED |
| PressureGapGenerator | v3 | ✓ Yes | golf_coach_insights | WIRED |
| WarmupHoleGenerator | v3 | ✓ Yes | golf_coach_insights | WIRED |
| ApproachMissGenerator | v3 | ✓ Yes | golf_coach_insights | WIRED |
| TeeStrategyGenerator | v3 | ✓ Yes | golf_coach_insights | WIRED |
| generateWorstHolesInsights | v2 | ✓ Yes | golf_coach_insights | WIRED |

**Verdict**: All insight types have display consumers.

---

## 8. SUMMARY BY SEVERITY

| Severity | Count | Issue | Recommendation |
|----------|-------|-------|-----------------|
| CRITICAL | 1 | Comparison weights computed but ignored | Wire or hide UI (currently hidden, intentional) |
| MEDIUM | 1 | Task reminder cron functions not called from web UI | Document as cron-only; verify cron route still active |
| LOW | 3 | Audit tables, auth functions, legitimate design patterns | No action required |

---

## 9. ACTIONABLE NEXT STEPS (Prioritized)

### Tier 1: Verify (No Breaking Changes)

1. **Task Reminder Cron Status** (15 min)
   - Verify `/api/cron/task-reminders` is active in `vercel.json`
   - Check logs to confirm it runs hourly
   - If cron is dead, document or delete functions
   
2. **Course Edit History Usage** (30 min)
   - Search admin dashboard for references to `golf_course_edit_history`
   - If unused, document as audit-only in schema
   - If needed, implement admin UI

### Tier 2: Wire Features (Medium Effort)

3. **Comparison Weighting** (3–5 hours)
   - Implement roster-comparison ranking logic
   - Integrate `golf_coach_philosophy.weight_*` columns
   - Restore interactive WeightDistributor UI
   - Add tests for weight-based ranking

### Tier 3: Cleanup (Optional)

4. **Deduplicate Weight Storage** (1–2 hours)
   - Decide: use `golf_coach_philosophy.weight_*` OR `golf_coachhelm_coach_weights`?
   - Migrate data if switching tables
   - Remove unused column

---

## 10. FILES TO VERIFY

- [ ] `/api/cron/task-reminders` — confirm active in `vercel.json`
- [ ] `memory/context/coachhelm-ai.md` — verify weight strategy is documented
- [ ] `/admin/` routes — check if edit history needs querying
- [ ] `src/app/golf/actions/coaching-philosophy.ts` — clarify weight column intent
- [ ] `src/lib/golf/player-signal-settings.ts` — if weights used here, update docs

---

## Audit Scope & Methodology

**Analyzed**:
- 90+ CoachHelm components
- 200+ server actions
- 266 database tables (schema from `src/lib/types/database.ts`)
- Orchestrator, mining, prediction, NLG pipelines
- Component imports across the entire codebase

**Search Techniques**:
- Grep for component names across `src/app` and `src/components`
- SQL table scan for WRITE vs READ patterns
- Action file exports matched against usage sites
- Orchestrator generator outputs matched to display consumers

**Verified No Gaps**:
- All v3 generators have display consumers
- All major dashboard components properly wired
- Insights flow from computation → storage → retrieval → display correctly

**Known Intentional Design**:
- WeightDistributor stub (F062/F115) — prevents placebo controls
- Task reminder cron-only functions — no web UI yet (legitimate)
- Course edit history audit tables — working as designed

---

**Report Generated**: 2026-08-01  
**Audit Window**: 2026-07-30 to 2026-08-01  
**Next Review**: 2026-08-15 (post-roster-comparison release)
