# 📋 Priority Action Items - BaseballHelm
## Round 01 | January 10, 2026

---

## Severity Legend

| Level | Meaning | Action Timeline |
|-------|---------|-----------------|
| 🔴 P0 | **BLOCKER** - Prevents production launch | Immediate |
| 🟠 P1 | **CRITICAL** - Major user experience impact | This week |
| 🟡 P2 | **WARNING** - Should be fixed soon | This sprint |
| 🟢 P3 | **POLISH** - Nice to have | Backlog |

---

## 🔴 P0 - BLOCKERS (Must Fix Before Launch)

### 1. Add error.tsx to Auth Pages
**Agent:** Feature Maestro
**Effort:** 2 hours
**Impact:** Auth crashes will be unhandled, users locked out

**Files to Create:**
```
src/app/baseball/(auth)/login/error.tsx
src/app/baseball/(auth)/signup/error.tsx
src/app/baseball/(auth)/complete-signup/error.tsx
src/app/baseball/(auth)/forgot-password/error.tsx
src/app/baseball/(auth)/reset-password/error.tsx
```

**Template:**
```tsx
'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF6F1]">
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold text-slate-900 mb-2">
          Authentication Error
        </h2>
        <p className="text-slate-600 mb-4">{error.message}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
```

---

### 2. Add error.tsx to Onboarding Pages
**Agent:** Feature Maestro
**Effort:** 2 hours
**Impact:** Users drop out if onboarding crashes

**Files to Create:**
```
src/app/baseball/(onboarding)/coach/error.tsx
src/app/baseball/(onboarding)/coach-onboarding/error.tsx
src/app/baseball/(onboarding)/player/error.tsx
```

---

### 3. Enable Leaked Password Protection
**Agent:** Database Sentinel
**Effort:** 5 minutes
**Impact:** Users can sign up with compromised passwords

**Action:**
1. Go to Supabase Dashboard
2. Navigate to: Authentication → Settings → Password Protection
3. Enable "Reject leaked passwords"

**Documentation:** https://supabase.com/docs/guides/auth/password-security

---

### 4. Add Basic Accessibility (aria-labels)
**Agent:** Experience Architect
**Effort:** 4 hours
**Impact:** Legal liability, excludes disabled users

**Critical Files (icon-only buttons):**
- All pages with delete/edit/close buttons
- Navigation components
- Modal close buttons
- Form submit buttons

**Pattern:**
```tsx
<button aria-label="Close modal">
  <IconX aria-hidden="true" />
</button>
```

---

## 🟠 P1 - CRITICAL (Fix This Week)

### 5. Add error.tsx to Remaining Dashboard Pages
**Agent:** Feature Maestro
**Effort:** 4 hours
**Count:** 29 pages missing

**High Priority Pages:**
- `/baseball/(dashboard)/dashboard/pipeline/` ✅ (already has)
- `/baseball/(dashboard)/dashboard/teams/page.tsx`
- `/baseball/(dashboard)/dashboard/roster/page.tsx`
- `/baseball/(dashboard)/dashboard/calendar/page.tsx`
- `/baseball/(dashboard)/dashboard/academics/page.tsx`
- `/baseball/(dashboard)/dashboard/dev-plans/page.tsx`

---

### 6. Add error.tsx to Team Join Flow
**Agent:** Feature Maestro
**Effort:** 1 hour
**Impact:** Invalid invite codes crash page

**File to Create:**
```
src/app/baseball/join/[code]/error.tsx
```

---

### 7. Restrict Overly Permissive INSERT Policies
**Agent:** Database Sentinel
**Effort:** 2 hours
**Impact:** Potential data abuse

**Tables to Fix:**
| Table | Current | Recommended |
|-------|---------|-------------|
| `notifications` | `WITH CHECK (true)` | Restrict to service_role or trigger |
| `profile_views` | `WITH CHECK (true)` | Validate viewer_id = auth.uid() |
| `video_views` | `WITH CHECK (true)` | Validate viewer_id = auth.uid() |
| `function_audit_log` | `WITH CHECK (true)` | Restrict to service_role |

**Example Fix:**
```sql
DROP POLICY "Anyone can create views" ON profile_views;
CREATE POLICY "Authenticated users record own views" ON profile_views
  FOR INSERT WITH CHECK (viewer_id = auth.uid());
```

---

### 8. Add loading.tsx to Auth & Onboarding
**Agent:** Feature Maestro + Experience Architect
**Effort:** 2 hours

**Files to Create:**
```
src/app/baseball/(auth)/login/loading.tsx
src/app/baseball/(auth)/signup/loading.tsx
src/app/baseball/(onboarding)/coach/loading.tsx
src/app/baseball/(onboarding)/player/loading.tsx
```

---

## 🟡 P2 - WARNING (Fix This Sprint)

### 9. Add loading.tsx to Remaining Pages
**Agent:** Feature Maestro
**Effort:** 4 hours
**Count:** 26 pages missing

---

### 10. Add Screen Reader Text (sr-only)
**Agent:** Experience Architect
**Effort:** 4 hours

**Pattern:**
```tsx
<span className="sr-only">View player profile</span>
```

---

### 11. Add Skip Links
**Agent:** Experience Architect
**Effort:** 2 hours

**Implementation:**
```tsx
// In layout.tsx
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute ...">
  Skip to main content
</a>
...
<main id="main-content">
```

---

### 12. Add Focus Management to Modals
**Agent:** Experience Architect
**Effort:** 4 hours

**Requirements:**
- Trap focus inside modal when open
- Return focus to trigger element on close
- Close on Escape key

---

### 13. Move pg_trgm Extension
**Agent:** Database Sentinel
**Effort:** 1 hour

```sql
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO authenticated, anon;
```

---

## 🟢 P3 - POLISH (Backlog)

### 14. Enable Additional MFA Options
**Agent:** Database Sentinel
**Effort:** 1 hour
**Action:** Enable in Supabase Dashboard → Authentication → MFA

---

### 15. Cleanup Orphaned User Records
**Agent:** Database Sentinel
**Effort:** 1 hour

```sql
-- Identify orphaned users
SELECT id, email FROM auth.users u
WHERE u.id NOT IN (SELECT user_id FROM players WHERE user_id IS NOT NULL)
  AND u.id NOT IN (SELECT user_id FROM coaches WHERE user_id IS NOT NULL);

-- Review and delete if appropriate
```

---

### 16. Mobile Testing at All Breakpoints
**Agent:** Experience Architect
**Effort:** 4 hours

**Breakpoints to Test:**
- 375px (iPhone SE)
- 414px (iPhone Plus)
- 768px (iPad)
- 1024px (iPad Pro)

---

### 17. Complete Video Edit Page
**Agent:** Feature Maestro
**Effort:** 2 hours

**Missing:**
- `videos/[id]/edit/error.tsx`
- `videos/[id]/edit/loading.tsx`

---

## Summary by Effort

| Priority | Items | Total Effort |
|----------|-------|--------------|
| 🔴 P0 | 4 | 8 hours |
| 🟠 P1 | 4 | 9 hours |
| 🟡 P2 | 5 | 15 hours |
| 🟢 P3 | 4 | 8 hours |
| **TOTAL** | **17** | **40 hours** |

---

## Recommended Sprint Plan

### Week 1: Blockers & Critical
- Day 1-2: All error.tsx files (P0 + P1)
- Day 3: Accessibility basics (aria-labels)
- Day 4: RLS policy fixes
- Day 5: Enable password protection, testing

### Week 2: Warning & Polish
- Day 1-2: Remaining loading.tsx files
- Day 3: Screen reader text, skip links
- Day 4: Modal focus management
- Day 5: Mobile testing, cleanup

---

## Assignee Suggestions

| Task Type | Suggested Role |
|-----------|----------------|
| error.tsx / loading.tsx files | Junior Developer |
| RLS policy fixes | Senior Developer / DBA |
| Accessibility additions | Frontend Developer |
| Password protection | DevOps / Backend |
| Mobile testing | QA Engineer |

---

## Tracking

Use this checklist to track progress:

### P0 Blockers
- [ ] Auth error.tsx (5 files)
- [ ] Onboarding error.tsx (3 files)
- [ ] Enable leaked password protection
- [ ] Add aria-labels to icon buttons

### P1 Critical
- [ ] Remaining dashboard error.tsx (29 files)
- [ ] Team join error.tsx
- [ ] Fix permissive INSERT policies
- [ ] Auth/onboarding loading.tsx

### P2 Warning
- [ ] Remaining loading.tsx (26 files)
- [ ] Screen reader text
- [ ] Skip links
- [ ] Modal focus management
- [ ] Move pg_trgm extension

### P3 Polish
- [ ] Enable MFA
- [ ] Cleanup orphaned users
- [ ] Mobile testing
- [ ] Complete video edit page

---

*"Prioritize ruthlessly. Ship blockers first, polish later."*

---
**Report Generated:** 2026-01-10
**Source:** Database Sentinel, Feature Maestro, Experience Architect
