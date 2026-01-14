# 🎯 Priority Action Items - GolfHelm Audit Round 01

**Platform:** GolfHelm ONLY
**Generated:** 2026-01-10
**Source:** Cross-Agent Synthesis of Database Sentinel, Feature Maestro, Experience Architect

---

## Quick Stats

| Priority | Count | Estimated Effort |
|----------|-------|------------------|
| P1 Critical | 3 | 1-2 hours |
| P2 Important | 5 | 4-6 hours |
| P3 Nice to Have | 4 | 10-18 hours |
| **Total** | **12** | **15-26 hours** |

---

## 🔴 P1 - Critical (Do This Week)

### 1. Enable Leaked Password Protection

**Source:** Database Sentinel
**Type:** Configuration
**Effort:** 5 minutes
**Owner:** DevOps

**Current State:**
- Supabase can check passwords against HaveIBeenPwned.org
- Currently disabled

**Action:**
1. Go to Supabase Dashboard
2. Navigate to Auth → Settings
3. Enable "Leaked password protection"
4. Save changes

**Verification:** Attempt to sign up with a known leaked password (e.g., "password123") - should be rejected.

---

### 2. Add loading.tsx to rounds/[id]/review

**Source:** Feature Maestro + Experience Architect
**Type:** Frontend
**Effort:** 30 minutes
**Owner:** Frontend Dev

**Current State:**
- Page loads data without loading state
- Users see blank/flash during data fetch

**Action:**
Create file: `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/loading.tsx`

```tsx
import { GolfSkeletons } from '@/components/golf/GolfSkeletons';

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#FAF6F1] p-6">
      <GolfSkeletons.RoundReview />
    </div>
  );
}
```

**Verification:** Navigate to any round review page and observe loading skeleton.

---

### 3. Add loading.tsx to classes page

**Source:** Feature Maestro + Experience Architect
**Type:** Frontend
**Effort:** 30 minutes
**Owner:** Frontend Dev

**Current State:**
- Classes page missing loading state
- Complex data fetch with no feedback

**Action:**
Create file: `src/app/golf/(dashboard)/dashboard/classes/loading.tsx`

```tsx
export default function Loading() {
  return (
    <div className="min-h-screen bg-[#FAF6F1] p-6">
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-slate-200 rounded w-48"></div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-48 bg-white/70 rounded-2xl border border-white/20"></div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Verification:** Navigate to classes page and observe loading skeleton.

---

## 🟡 P2 - Important (Do This Sprint)

### 4. Add loading.tsx to development pages

**Source:** Feature Maestro + Experience Architect
**Type:** Frontend
**Effort:** 1 hour
**Owner:** Frontend Dev

**Files to Create:**
- `src/app/golf/(dashboard)/dashboard/development/loading.tsx`
- `src/app/golf/(dashboard)/dashboard/my-development/loading.tsx`

**Action:** Create consistent loading skeletons for both pages.

---

### 5. Add toast notifications to roster actions

**Source:** Feature Maestro
**Type:** Frontend
**Effort:** 1 hour
**Owner:** Frontend Dev

**Current State:**
- Roster add/remove actions have no visual feedback
- Users unsure if action succeeded

**Files to Update:**
- `src/components/golf/roster/InvitePlayerButton.tsx`
- Related roster action handlers

**Action:**
```tsx
import { toast } from 'sonner';

// After successful action
toast.success('Player added to roster');

// After error
toast.error('Failed to add player');
```

---

### 6. Add aria-labels to icon-only buttons

**Source:** Experience Architect
**Type:** Accessibility
**Effort:** 2-3 hours
**Owner:** Frontend Dev

**Current State:**
- Many icon buttons lack aria-labels
- Screen readers can't identify button purpose

**Files to Audit:**
- `src/components/golf/calendar/*.tsx`
- `src/components/golf/layout/*.tsx`
- `src/components/ui/*.tsx`

**Pattern:**
```tsx
// Before
<button onClick={handleClick}>
  <CalendarIcon className="h-5 w-5" />
</button>

// After
<button onClick={handleClick} aria-label="Open calendar">
  <CalendarIcon className="h-5 w-5" />
</button>
```

---

### 7. Add error handling to messages.ts

**Source:** Feature Maestro
**Type:** Backend
**Effort:** 30 minutes
**Owner:** Backend Dev

**File:** `src/app/golf/actions/messages.ts`

**Current State:**
- Some functions lack try/catch
- Errors not properly propagated to UI

**Action:**
```tsx
export async function sendMessage(data: MessageData) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('messages').insert(data);
    if (error) throw error;
    revalidatePath('/golf/dashboard/messages');
    return { success: true };
  } catch (error) {
    console.error('Failed to send message:', error);
    return { success: false, error: 'Failed to send message' };
  }
}
```

---

### 8. Fix mobile modal overflow

**Source:** Experience Architect
**Type:** Frontend
**Effort:** 1-2 hours
**Owner:** Frontend Dev

**Files to Check:**
- `src/components/golf/SaveRoundModal.tsx`
- `src/components/golf/calendar/EventDetailModal.tsx`

**Action:**
- Add `max-h-[90vh] overflow-y-auto` to modal content containers
- Test all modals on mobile viewport (375px width)

---

## 🟢 P3 - Nice to Have (Backlog)

### 9. Move pg_trgm to extensions schema

**Source:** Database Sentinel
**Type:** Database
**Effort:** 5 minutes
**Owner:** DBA

**Action:**
```sql
DROP EXTENSION IF EXISTS pg_trgm;
CREATE EXTENSION pg_trgm SCHEMA extensions;
```

---

### 10. Consider dark mode support

**Source:** Experience Architect
**Type:** Frontend
**Effort:** 8-16 hours
**Owner:** Frontend Dev

**Notes:**
- Currently 0 dark mode classes in codebase
- Would require CSS variable setup + theme toggle
- Only implement if user feedback indicates demand

---

### 11. Enable additional MFA options

**Source:** Database Sentinel
**Type:** Configuration
**Effort:** 10 minutes
**Owner:** DevOps

**Action:**
- Enable TOTP in Supabase Auth settings
- Consider adding MFA requirement for coach accounts

---

### 12. Standardize input padding tokens

**Source:** Experience Architect
**Type:** Frontend
**Effort:** 1 hour
**Owner:** Frontend Dev

**Current State:**
- Some inputs use `px-4 py-2`, others use `px-4 py-2.5`
- Minor inconsistency

**Action:**
- Audit all input components
- Standardize to `px-4 py-2.5` per design system

---

## 📋 Sprint Planning Template

### Recommended Sprint 1 Focus

| Task | Points | Assignee |
|------|--------|----------|
| P1.1 Enable leaked password protection | 1 | DevOps |
| P1.2 Add loading.tsx to rounds/[id]/review | 2 | Frontend |
| P1.3 Add loading.tsx to classes page | 2 | Frontend |
| P2.4 Add loading.tsx to development pages | 3 | Frontend |
| P2.5 Add toast notifications to roster | 3 | Frontend |
| **Total** | **11** | |

### Recommended Sprint 2 Focus

| Task | Points | Assignee |
|------|--------|----------|
| P2.6 Add aria-labels to icon buttons | 5 | Frontend |
| P2.7 Add error handling to messages.ts | 2 | Backend |
| P2.8 Fix mobile modal overflow | 3 | Frontend |
| **Total** | **10** | |

---

## ✅ Verification Checklist

After completing all P1 and P2 items:

- [ ] All high-traffic pages have loading.tsx
- [ ] Roster actions show toast feedback
- [ ] Icon buttons have aria-labels
- [ ] messages.ts has proper error handling
- [ ] Modals work on mobile viewports
- [ ] Leaked password protection is enabled

---

## 📅 Next Audit

**Recommended:** Run Round 02 audit after completing P1 and P2 items.

**Command:**
```bash
python3 .claude/run_audit.py audit-golf 2
```

---

*"Prioritization is the art of knowing what NOT to do first."*
