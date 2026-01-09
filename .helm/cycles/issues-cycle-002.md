# Improvement Cycle 002 - multi-platform

> 🤖 Generated: 2026-01-09 14:04:22
> 📊 Total Issues: 15
> 🔴 Critical: 5 | 🟠 High: 6 | 🟡 Medium: 3 | 🟢 Low: 0

> 📚 **Context Available:**
> ✅ UNDERSTANDING.json - 0 features documented
> ✅ HELM_ESSAY.md - 14561 words of technical documentation
> ✅ ACTIONS.md - 4 prioritized action items
> ✅ ISSUES.md - 38 detailed issues
> ✅ security/RLS_AUDIT.md - Security audit available

---

## 📋 Instructions for Claude Code

This file contains issues for you to fix. For EACH issue:

1. **Read the issue details carefully**
2. **Consult the context files** mentioned above for full understanding
3. **Fix the code** according to the suggested fix
4. **Update this file** in the "FIX STATUS" section with:
   - Status: ✅ Fixed
   - Changes Made: [what you changed]
   - Files Modified: [which files]
   - Testing: [how you verified]
   - Context Used: [which docs you referenced]

**IMPORTANT:** Always update the FIX STATUS section with "Status: ✅ Fixed" when you complete each fix.
This is how the cycle agent knows to verify your work in the next cycle.

**Before fixing, read these context files:**
```bash
# Full application understanding
cat .helm/UNDERSTANDING.json
cat .helm/HELM_ESSAY.md

# Known issues and priorities
cat .helm/ACTIONS.md
cat .helm/ISSUES.md

# Security context
cat .helm/security/RLS_AUDIT.md
```

**Format for documenting your fix:**
```markdown
### FIX STATUS: [Issue ID]

**Status:** ✅ Fixed

**Changes Made:**
- Added loading state to dashboard
- Implemented skeleton UI during data fetch

**Files Modified:**
- `src/app/dashboard/page.tsx` - Added isLoading state
- `src/components/loading-skeleton.tsx` - Created new component

**Testing:**
- Tested with slow 3G network simulation
- Verified skeleton appears before data loads
- Confirmed smooth transition to actual content

**Context Used:**
- Followed patterns from HELM_ESSAY.md section on loading states
- Aligned with ACTIONS.md priority #3

**Notes:**
- Used existing design system patterns
- Added loading prop to maintain consistency
```

---

## 🔴 Critical Issues


### CORE-001: Implement JUCO Mode Toggle

> **Severity:** 🔴 Critical  
> **Category:** ux  
> **Source:** overnight_actions  
> **Found in Cycle:** 1

**Problem:**
JUCO coaches need dual functionality (recruiting mode vs team mode) but no UI or logic exists to switch modes. The coach_mode field exists in auth store but is unused, blocking 30% of JUCO coach features.

**Location:**
- File: `src/stores/auth-store.ts`

**Suggested Fix:**
Add mode toggle component in Header.tsx, implement routing logic in middleware.ts based on mode

---

### FIX STATUS: CORE-001

<!-- Claude Code: Document your fix here -->

**Status:** ⏳ Not Started

**Changes Made:**
<!-- Describe what you changed -->

**Files Modified:**
<!-- List all files you modified -->

**Testing:**
<!-- How did you verify the fix? -->

**Context Used:**
<!-- Which context files did you reference? -->

**Notes:**
<!-- Any concerns, limitations, or follow-up needed -->

---


### CORE-002: Multi-Team Support for Showcase Coaches

> **Severity:** 🔴 Critical  
> **Category:** ux  
> **Source:** overnight_actions  
> **Found in Cycle:** 1

**Problem:**
Showcase organizations like Perfect Game have 10-50 teams. Database schema exists but UI is incomplete: no team selector, no organization-level dashboard, no cross-team roster view, no org-level analytics.

**Location:**
- File: `src/app/baseball/dashboard/organization/`

**Suggested Fix:**
Create TeamSelector.tsx, OrgDashboard.tsx, and organization page with aggregated stats

---

### FIX STATUS: CORE-002

<!-- Claude Code: Document your fix here -->

**Status:** ⏳ Not Started

**Changes Made:**
<!-- Describe what you changed -->

**Files Modified:**
<!-- List all files you modified -->

**Testing:**
<!-- How did you verify the fix? -->

**Context Used:**
<!-- Which context files did you reference? -->

**Notes:**
<!-- Any concerns, limitations, or follow-up needed -->

---


### CORE-003: Complete High School Coach Dashboard

> **Severity:** 🔴 Critical  
> **Category:** ux  
> **Source:** overnight_actions  
> **Found in Cycle:** 1

**Problem:**
Route exists at /baseball/dashboard/team/high-school but dashboard is barely implemented. Missing: roster management table, college interest tracker, batch video upload, team analytics, communication tools.

**Location:**
- File: `src/app/baseball/dashboard/team/high-school/page.tsx`

**Suggested Fix:**
Build RosterTable, CollegeInterestTracker, BatchVideoUpload, TeamAnalytics components

---

### FIX STATUS: CORE-003

<!-- Claude Code: Document your fix here -->

**Status:** ⏳ Not Started

**Changes Made:**
<!-- Describe what you changed -->

**Files Modified:**
<!-- List all files you modified -->

**Testing:**
<!-- How did you verify the fix? -->

**Context Used:**
<!-- Which context files did you reference? -->

**Notes:**
<!-- Any concerns, limitations, or follow-up needed -->

---


### FEAT-103: CRITICAL: RLS disabled on conversation_participants table

> **Severity:** 🔴 Critical  
> **Category:** security  
> **Source:** feature_check  
> **Found in Cycle:** 2

**Problem:**
Security vulnerability: conversation_participants table has RLS disabled (migration 078), allowing unauthorized access to conversation membership

**Location:**
- File: `supabase/migrations/*078*.sql`

**Suggested Fix:**
Re-enable RLS on conversation_participants with proper policies

---

### FIX STATUS: FEAT-103

<!-- Claude Code: Document your fix here -->

**Status:** ⏳ Not Started

**Changes Made:**
<!-- Describe what you changed -->

**Files Modified:**
<!-- List all files you modified -->

**Testing:**
<!-- How did you verify the fix? -->

**Context Used:**
<!-- Which context files did you reference? -->

**Notes:**
<!-- Any concerns, limitations, or follow-up needed -->

---


### RLS-004: Missing Policies on 15 Golf Tables

> **Severity:** 🔴 Critical  
> **Category:** security  
> **Source:** overnight_issues  
> **Found in Cycle:** 1

**Problem:**
15 golf tables have RLS ENABLED but NO POLICIES defined. Depending on Supabase defaults, tables are either completely inaccessible (blocks features) or completely open (data exposure).

**Location:**
- File: `supabase/migrations/`

**Suggested Fix:**
Add complete policy sets for all 15 tables with proper team scoping

---

### FIX STATUS: RLS-004

<!-- Claude Code: Document your fix here -->

**Status:** ⏳ Not Started

**Changes Made:**
<!-- Describe what you changed -->

**Files Modified:**
<!-- List all files you modified -->

**Testing:**
<!-- How did you verify the fix? -->

**Context Used:**
<!-- Which context files did you reference? -->

**Notes:**
<!-- Any concerns, limitations, or follow-up needed -->

---


## 🟠 High Issues


### FEAT-130: Missing: 2FA/MFA setup

> **Severity:** 🟠 High  
> **Category:** missing_feature  
> **Source:** feature_check  
> **Found in Cycle:** 2

**Problem:**
No two-factor authentication option in settings despite security importance for coach accounts

**Location:**
- File: `src/app/baseball/(dashboard)/dashboard/settings/page.tsx`

**Suggested Fix:**
Implement Supabase MFA with TOTP authenticator apps

---

### FIX STATUS: FEAT-130

<!-- Claude Code: Document your fix here -->

**Status:** ⏳ Not Started

**Changes Made:**
<!-- Describe what you changed -->

**Files Modified:**
<!-- List all files you modified -->

**Testing:**
<!-- How did you verify the fix? -->

**Context Used:**
<!-- Which context files did you reference? -->

**Notes:**
<!-- Any concerns, limitations, or follow-up needed -->

---


### FEAT-XXX: Missing X feature

> **Severity:** 🟠 High  
> **Category:** missing_feature  
> **Source:** feature_check  
> **Found in Cycle:** 2

**Problem:**
Feature documented but not implemented

**Location:**
- File: `where it should be`

**Suggested Fix:**
Implement this

---

### FIX STATUS: FEAT-XXX

<!-- Claude Code: Document your fix here -->

**Status:** ⏳ Not Started

**Changes Made:**
<!-- Describe what you changed -->

**Files Modified:**
<!-- List all files you modified -->

**Testing:**
<!-- How did you verify the fix? -->

**Context Used:**
<!-- Which context files did you reference? -->

**Notes:**
<!-- Any concerns, limitations, or follow-up needed -->

---


### PERF-001: Add Database Indexes for Discovery Page

> **Severity:** 🟠 High  
> **Category:** performance  
> **Source:** overnight_actions  
> **Found in Cycle:** 1

**Problem:**
Player discovery with filters (position, grad year, state, velocity) is slow (2-3s) due to missing indexes. Would be 80% faster with proper indexing.

**Location:**
- File: `supabase/migrations/20260109000002_discovery_indexes.sql`

**Suggested Fix:**
Add indexes on recruiting_activated, primary_position, grad_year, state, throwing_velocity, exit_velocity

---

### FIX STATUS: PERF-001

<!-- Claude Code: Document your fix here -->

**Status:** ⏳ Not Started

**Changes Made:**
<!-- Describe what you changed -->

**Files Modified:**
<!-- List all files you modified -->

**Testing:**
<!-- How did you verify the fix? -->

**Context Used:**
<!-- Which context files did you reference? -->

**Notes:**
<!-- Any concerns, limitations, or follow-up needed -->

---


### RLS-002: Conversation Participants RLS History Unstable

> **Severity:** 🟠 High  
> **Category:** security  
> **Source:** overnight_issues  
> **Found in Cycle:** 1

**Problem:**
Migration 078 DISABLED RLS on conversation_participants with comment 'Nuclear Option: Drop ALL Policies'. While migration 20260108000001 re-enabled it, history shows system couldn't maintain stable RLS without recursion issues.

**Location:**
- File: `supabase/migrations/078_*.sql`

**Suggested Fix:**
Monitor for recursion errors, consider simplifying policy logic further

---

### FIX STATUS: RLS-002

<!-- Claude Code: Document your fix here -->

**Status:** ⏳ Not Started

**Changes Made:**
<!-- Describe what you changed -->

**Files Modified:**
<!-- List all files you modified -->

**Testing:**
<!-- How did you verify the fix? -->

**Context Used:**
<!-- Which context files did you reference? -->

**Notes:**
<!-- Any concerns, limitations, or follow-up needed -->

---


### RLS-006: Permissive Policies Using USING (true)

> **Severity:** 🟠 High  
> **Category:** security  
> **Source:** overnight_issues  
> **Found in Cycle:** 1

**Problem:**
Multiple tables use USING (true) or WITH CHECK (true) making data completely public to authenticated users. Exposes coach contact info, invite codes, allows notification spam, exposes AI patterns and ML models.

**Location:**
- File: `supabase/policies/`

**Suggested Fix:**
Replace all USING (true) with proper scoping based on team/role

---

### FIX STATUS: RLS-006

<!-- Claude Code: Document your fix here -->

**Status:** ⏳ Not Started

**Changes Made:**
<!-- Describe what you changed -->

**Files Modified:**
<!-- List all files you modified -->

**Testing:**
<!-- How did you verify the fix? -->

**Context Used:**
<!-- Which context files did you reference? -->

**Notes:**
<!-- Any concerns, limitations, or follow-up needed -->

---


### RLS-007: Coaches Can View All Players (Baseball)

> **Severity:** 🟠 High  
> **Category:** security  
> **Source:** overnight_issues  
> **Found in Cycle:** 1

**Problem:**
Policy 'Coaches can view all players' allows ANY user with role='coach' to see ALL player profiles regardless of recruiting_activated status or commitment. NCAA violation risk for viewing committed players.

**Location:**
- File: `supabase/policies/players.sql`

**Suggested Fix:**
Drop 'Coaches can view all players' policy, keep only recruiting-scoped policy

---

### FIX STATUS: RLS-007

<!-- Claude Code: Document your fix here -->

**Status:** ⏳ Not Started

**Changes Made:**
<!-- Describe what you changed -->

**Files Modified:**
<!-- List all files you modified -->

**Testing:**
<!-- How did you verify the fix? -->

**Context Used:**
<!-- Which context files did you reference? -->

**Notes:**
<!-- Any concerns, limitations, or follow-up needed -->

---


## 🟡 Medium Issues


### PERF-003: Console.log Statements in Production

> **Severity:** 🟡 Medium  
> **Category:** code_quality  
> **Source:** overnight_issues  
> **Found in Cycle:** 1

**Problem:**
next.config.mjs has removeConsole commented out with note 'temporarily for debugging PDF upload'. This leaves 28+ console.log statements in production bundle.

**Location:**
- File: `next.config.mjs`
- Line: 35

**Suggested Fix:**
Enable removeConsole for production, keep only error/warn

---

### FIX STATUS: PERF-003

<!-- Claude Code: Document your fix here -->

**Status:** ⏳ Not Started

**Changes Made:**
<!-- Describe what you changed -->

**Files Modified:**
<!-- List all files you modified -->

**Testing:**
<!-- How did you verify the fix? -->

**Context Used:**
<!-- Which context files did you reference? -->

**Notes:**
<!-- Any concerns, limitations, or follow-up needed -->

---


### RLS-008: profile_views Insert Permissive

> **Severity:** 🟡 Medium  
> **Category:** security  
> **Source:** overnight_issues  
> **Found in Cycle:** 1

**Problem:**
Policy allows viewer_id to be NULL OR not match auth.uid(), enabling fake view inflation and analytics poisoning.

**Location:**
- File: `supabase/policies/profile_views.sql`

**Suggested Fix:**
Enforce viewer_id = auth.uid() in WITH CHECK clause

---

### FIX STATUS: RLS-008

<!-- Claude Code: Document your fix here -->

**Status:** ⏳ Not Started

**Changes Made:**
<!-- Describe what you changed -->

**Files Modified:**
<!-- List all files you modified -->

**Testing:**
<!-- How did you verify the fix? -->

**Context Used:**
<!-- Which context files did you reference? -->

**Notes:**
<!-- Any concerns, limitations, or follow-up needed -->

---


### TECH-003: Add Audit Logging to SECURITY DEFINER Functions

> **Severity:** 🟡 Medium  
> **Category:** security  
> **Source:** overnight_actions  
> **Found in Cycle:** 1

**Problem:**
18 SECURITY DEFINER functions bypass RLS but have no logging. No visibility into function usage, making debugging and security auditing difficult.

**Location:**
- File: `supabase/migrations/20260109000003_function_audit_log.sql`

**Suggested Fix:**
Create function_audit_log table, add logging to can_users_message(), create_conversation_with_participants(), are_users_on_same_roster(), handle_new_user()

---

### FIX STATUS: TECH-003

<!-- Claude Code: Document your fix here -->

**Status:** ⏳ Not Started

**Changes Made:**
<!-- Describe what you changed -->

**Files Modified:**
<!-- List all files you modified -->

**Testing:**
<!-- How did you verify the fix? -->

**Context Used:**
<!-- Which context files did you reference? -->

**Notes:**
<!-- Any concerns, limitations, or follow-up needed -->

---

