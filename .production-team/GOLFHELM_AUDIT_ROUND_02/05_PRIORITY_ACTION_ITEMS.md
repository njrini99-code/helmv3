# 📋 Priority Action Items - GolfHelm Round 02
## January 10, 2026

---

## 🎉 Round 1 → Round 2 Progress

| Category | Round 1 Items | Resolved | Still Open |
|----------|---------------|----------|------------|
| P1 Critical | 3 | 2 (67%) | 1 |
| P2 Important | 5 | 3 (60%) | 2 |
| P3 Nice to Have | 4 | 0 (0%) | 4 |
| **Total** | **12** | **5 (42%)** | **7** |

**🎯 Key Achievement:** All loading.tsx and error handling items from Round 1 are RESOLVED!

---

## Severity Legend

| Level | Meaning | Action Timeline |
|-------|---------|-----------------|
| 🔴 P1 | **CRITICAL** - Security or UX blocker | This week |
| 🟠 P2 | **IMPORTANT** - Should be addressed | This sprint |
| 🟢 P3 | **POLISH** - Nice to have | Backlog |

---

## 🔴 P1 - CRITICAL (Remaining from Round 1)

### 1. Enable Leaked Password Protection ⚠️

**Source:** Database Sentinel
**Status:** NOT FIXED from Round 1
**Effort:** 5 minutes
**Owner:** DevOps

**This is a 5-minute configuration change that has been open for 2 audit rounds.**

**Action:**
1. Go to Supabase Dashboard
2. Navigate to Authentication → Settings → Password Protection
3. Enable "Reject leaked passwords"
4. Save changes

**Verification:** Try signing up with "password123" - should be rejected.

**Documentation:** https://supabase.com/docs/guides/auth/password-security

---

## 🟠 P2 - IMPORTANT (Remaining + New)

### 2. Add Toast Notifications to Roster Actions

**Source:** Feature Maestro
**Status:** Still limited from Round 1
**Effort:** 1 hour
**Owner:** Frontend Dev

**Current:** Only 9 toast calls in entire golf codebase
**Target:** Toast feedback on all user-initiated mutations

**Files to Update:**
- `src/components/golf/roster/InvitePlayerButton.tsx`
- `src/components/golf/roster/PlayerActionsMenu.tsx`

**Pattern:**
```tsx
import { toast } from 'sonner';

// After successful action
toast.success('Player added to roster');

// After error
toast.error('Failed to add player');
```

---

### 3. Add Skip Links for Keyboard Navigation

**Source:** Experience Architect
**Status:** Still missing
**Effort:** 30 minutes
**Owner:** Frontend Dev

**File to Update:** `src/app/golf/(dashboard)/layout.tsx`

**Implementation:**
```tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 bg-green-600 text-white px-4 py-2 rounded-lg"
>
  Skip to main content
</a>
...
<main id="main-content">
```

---

### 4. Add Loading/Error to Auth Pages

**Source:** Feature Maestro
**Status:** New finding
**Effort:** 1 hour
**Owner:** Frontend Dev

**Files to Create:**
```
src/app/golf/(auth)/login/loading.tsx
src/app/golf/(auth)/login/error.tsx
src/app/golf/(auth)/signup/loading.tsx
src/app/golf/(auth)/signup/error.tsx
```

**Template:**
```tsx
// loading.tsx
export default function Loading() {
  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center">
      <div className="animate-pulse">Loading...</div>
    </div>
  );
}

// error.tsx
'use client';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Something went wrong</h2>
        <button onClick={reset} className="px-4 py-2 bg-green-600 text-white rounded-lg">
          Try again
        </button>
      </div>
    </div>
  );
}
```

---

### 5. Complete Modal Focus Management

**Source:** Experience Architect
**Status:** Partial implementation
**Effort:** 2 hours
**Owner:** Frontend Dev

**Files to Audit:**
- `src/components/golf/SaveRoundModal.tsx`
- `src/components/golf/UnfinishedRoundModal.tsx`
- `src/components/golf/calendar/EventDetailModal.tsx`

**Requirements:**
- ✅ Focus trapped inside modal when open
- ✅ Return focus to trigger element on close
- ✅ Close on Escape key
- ✅ First focusable element receives focus on open

---

## 🟢 P3 - POLISH (Backlog)

### 6. Move pg_trgm to Extensions Schema

**Source:** Database Sentinel
**Status:** Open from Round 1
**Effort:** 5 minutes
**Owner:** DBA

```sql
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO authenticated, anon;
```

---

### 7. Enable Additional MFA Options

**Source:** Database Sentinel
**Status:** Open from Round 1
**Effort:** 10 minutes
**Owner:** DevOps

**Action:** Enable TOTP in Supabase Dashboard → Authentication → MFA

---

### 8. Add sr-only Text for Screen Readers

**Source:** Experience Architect
**Status:** Limited implementation
**Effort:** 1 hour
**Owner:** Frontend Dev

**Pattern:**
```tsx
<span className="sr-only">View player profile</span>
```

Add to:
- Progress indicators
- Icon-only status badges
- Decorative elements

---

### 9. Add Remaining Loading/Error States

**Source:** Feature Maestro
**Status:** Good but not 100%
**Effort:** 2 hours
**Owner:** Frontend Dev

**Missing files:**
```
src/app/golf/(dashboard)/dashboard/my-qualifiers/loading.tsx
src/app/golf/(dashboard)/dashboard/my-qualifiers/error.tsx
src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/loading.tsx
src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/error.tsx
src/app/golf/(onboarding)/coach/loading.tsx
src/app/golf/(onboarding)/coach/error.tsx
src/app/golf/(onboarding)/player/loading.tsx
src/app/golf/(onboarding)/player/error.tsx
```

---

## Summary by Effort

| Priority | Items | Total Effort |
|----------|-------|--------------|
| 🔴 P1 | 1 | 5 minutes |
| 🟠 P2 | 4 | 4.5 hours |
| 🟢 P3 | 4 | 3.5 hours |
| **TOTAL** | **9** | **~8 hours** |

---

## ✅ Completed from Round 1

These items no longer need attention:

- [x] Add loading.tsx to rounds/[id]/review
- [x] Add loading.tsx to classes page
- [x] Add loading.tsx to development pages
- [x] Add loading.tsx to my-development
- [x] Add error handling to messages.ts
- [x] Add aria-labels to icon buttons (significant progress)
- [x] Improve hover/focus states

---

## Recommended Sprint Plan

### This Week (Urgent)

| Task | Effort | Owner |
|------|--------|-------|
| P1: Enable leaked password protection | 5 min | DevOps |
| P2: Add skip links | 30 min | Frontend |
| P2: Add toast to roster actions | 1 hr | Frontend |

### Next Sprint

| Task | Effort | Owner |
|------|--------|-------|
| P2: Add loading/error to auth pages | 1 hr | Frontend |
| P2: Complete modal focus management | 2 hr | Frontend |
| P3: Move pg_trgm extension | 5 min | DBA |

---

## Tracking Checklist

### P1 Critical
- [ ] Enable leaked password protection

### P2 Important
- [ ] Add toast to roster actions
- [ ] Add skip links
- [ ] Add auth page loading/error states
- [ ] Complete modal focus management

### P3 Polish
- [ ] Move pg_trgm extension
- [ ] Enable MFA options
- [ ] Add sr-only text
- [ ] Add remaining loading/error states

---

## 📅 Next Audit

**Recommended:** Run Round 03 after completing P1 and P2 items.

**Command:**
```bash
python3 .claude/run_audit.py audit-golf 3
```

---

*"From 12 items to 9. Progress is real. Finish strong."*

---
**Report Generated:** 2026-01-10
**Source:** Cross-Agent Synthesis
**Round:** 02
