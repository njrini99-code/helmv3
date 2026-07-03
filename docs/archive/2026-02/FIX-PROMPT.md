# GolfHelm Critical Fix Prompt

You are fixing critical design system violations and broken features in GolfHelm, a college golf team management SaaS built with Next.js, TypeScript, Supabase, and Tailwind CSS.

**Project path:** `/Users/ricknini/Downloads/helmv3/`

## IMPORTANT: Do NOT touch these (they are best-in-class)
- CoachHelm V2 AI Engine (src/lib/coachhelm/)
- Mobile round entry (MobileScoreEntry.tsx, LiveScorecard.tsx)
- Stats engine (actions/stats-data.ts, stats-v2.ts)
- Calendar system (src/components/golf/calendar/)
- Accessibility features (focus traps, ARIA, skip links, reduced-motion)
- Offline sync engine
- Skeleton component SHAPES in GolfSkeletons.tsx (only fix their colors, not their structure)

## Design System Reference
- Primary brand color: `#16A34A` → use `primary-*` tokens (primary-50 through primary-950)
- Background cream: `#FFFEFA` → use `bg-cream` or design token
- Gray palette: ONLY use `warm-*` tokens (warm-50 through warm-950)
- Glass cards: `bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass`
- Loading states: Skeleton shimmers ONLY. NO spinners (animate-spin) for content loading.
- Fonts: DM Sans only for sans-serif

---

## Fix 1: 404 Page Links to Baseball Dashboard

**File:** `src/app/not-found.tsx`

**Problems:**
- Links to `/baseball/dashboard` — this is the GOLF product
- Uses `bg-[#FAF6F1]` — should be `bg-[#FFFEFA]` or the cream design token
- Uses `text-slate-200`, `text-slate-900`, `text-slate-500`, `text-slate-400` — should all be `warm-*` equivalents
- Uses `text-green-600` — should be `text-primary-600`

**Fix:**
- Change all links from `/baseball/dashboard` to `/golf/dashboard`
- Replace `bg-[#FAF6F1]` with the cream background token
- Replace all `text-slate-*` with `text-warm-*` equivalents (slate-900→warm-900, slate-500→warm-500, slate-400→warm-400, slate-200→warm-200)
- Replace `text-green-600` with `text-primary-600`

---

## Fix 2: Skeleton Shimmer Uses Cool Gray

**File:** `src/app/globals.css`

**Problem:** The `skeleton-shimmer` animation class uses `@apply bg-slate-100` — every skeleton loading state across the entire app renders in cool gray instead of warm tones.

**Fix:** Change `@apply bg-slate-100` to `@apply bg-warm-100` in the skeleton-shimmer class definition.

---

## Fix 3: Global CSS Base Styles Use Slate

**File:** `src/app/globals.css`

**Problems:**
- `* { @apply border-slate-200; }` — every default border is cool-toned
- `body { @apply text-slate-900; }` — default body text is cool
- `h1, h2, h3, h4, h5, h6 { @apply font-semibold text-slate-900; }` — all headings are cool

**Fix:**
- Change `border-slate-200` → `border-warm-200`
- Change body `text-slate-900` → `text-warm-900`
- Change heading `text-slate-900` → `text-warm-900`

---

## Fix 4: CoachStatus Type Mismatch (CRM Page Broken)

**Problem:** The local `CoachStatus` type in the CRM page defines 5 statuses, but the database has 15. This causes ~35 TypeScript errors and the CRM page is broken at runtime.

**Files to fix:**
- `src/app/golf/admin/crm/page.tsx` (lines 40-45 — CoachStatus type definition + STATUS_CONFIG + all references)
- `src/app/golf/admin/crm/components/AddCoachModal.tsx`
- `src/app/golf/admin/crm/components/CoachDetailPanel.tsx`
- `src/app/golf/admin/crm/components/ContactLogModal.tsx`
- `src/app/golf/admin/crm/components/PipelineStats.tsx`
- `src/app/golf/admin/page.tsx` (uses `"contacted"` and `"customer"` which don't exist)

**The database CoachStatus enum is:**
```typescript
type CoachStatus = 'new_lead' | 'researching' | 'outreach_pending' | 'initial_contact' | 'follow_up' | 'engaged' | 'demo_scheduled' | 'demo_completed' | 'proposal_sent' | 'negotiating' | 'closed_won' | 'closed_lost' | 'not_interested' | 'bad_timing' | 'nurture'
```

**Fix:**
1. Update the `CoachStatus` type to match the database enum exactly
2. Update `STATUS_CONFIG` to include all 15 statuses with appropriate labels, colors, and icons
3. Update the pipeline view/kanban columns to reflect the new stages
4. Fix `src/app/golf/admin/page.tsx` — replace `"contacted"` with `"initial_contact"` and `"customer"` with `"closed_won"`
5. Run `npx tsc --noEmit` after fixing — this should eliminate ~35 of the 59 TypeScript errors

**Suggested STATUS_CONFIG structure for the 15 statuses:**
```typescript
const STATUS_CONFIG = {
  new_lead: { label: 'New Lead', color: 'warm', icon: '🆕' },
  researching: { label: 'Researching', color: 'blue', icon: '🔍' },
  outreach_pending: { label: 'Outreach Pending', color: 'amber', icon: '📋' },
  initial_contact: { label: 'Initial Contact', color: 'sky', icon: '👋' },
  follow_up: { label: 'Follow Up', color: 'indigo', icon: '🔄' },
  engaged: { label: 'Engaged', color: 'violet', icon: '💬' },
  demo_scheduled: { label: 'Demo Scheduled', color: 'cyan', icon: '📅' },
  demo_completed: { label: 'Demo Completed', color: 'teal', icon: '✅' },
  proposal_sent: { label: 'Proposal Sent', color: 'orange', icon: '📨' },
  negotiating: { label: 'Negotiating', color: 'yellow', icon: '🤝' },
  closed_won: { label: 'Closed Won', color: 'green', icon: '🏆' },
  closed_lost: { label: 'Closed Lost', color: 'red', icon: '❌' },
  not_interested: { label: 'Not Interested', color: 'warm', icon: '🚫' },
  bad_timing: { label: 'Bad Timing', color: 'warm', icon: '⏰' },
  nurture: { label: 'Nurture', color: 'purple', icon: '🌱' },
}
```

---

## Fix 5: Appearance Preferences Not Consumed

**File:** `src/components/golf/settings/AppearanceModal.tsx` saves preferences to localStorage but a comment says they're NOT consumed by other components.

**Preferences to wire up:**
- `displayDensity` (comfortable/compact) — should affect padding/spacing across dashboard components
- `dateFormat` — should affect all date rendering
- `scoreDisplay` (to-par/raw) — should affect how scores are shown
- `animations` (on/off) — should toggle Framer Motion animations

**Fix approach:**
1. Create a hook `useAppearancePreferences()` that reads from localStorage with SSR safety
2. Wire `displayDensity` into the dashboard shell and card components (compact = less padding)
3. Wire `dateFormat` into a shared date formatting utility (create one if it doesn't exist)
4. Wire `scoreDisplay` into round/stats components that show scores
5. Wire `animations` into Framer Motion — when off, set `motion.div` to render as plain `div` or use `LazyMotion` with reduced features
6. Remove the TODO comment acknowledging they don't work

---

## Fix 6: Color Fragmentation — Emerald to Primary Migration

**Scope:** 544 instances of `emerald-*` across ~50+ files in `src/components/golf/`

**Problem:** `emerald-600` = `#059669` (Tailwind default, bluer/darker) vs `primary-600` = `#16A34A` (your brand green). Two different greens throughout the app.

**Fix — find and replace these mappings:**
```
emerald-50  → primary-50
emerald-100 → primary-100
emerald-200 → primary-200
emerald-300 → primary-300
emerald-400 → primary-400
emerald-500 → primary-500
emerald-600 → primary-600
emerald-700 → primary-700
emerald-800 → primary-800
emerald-900 → primary-900
emerald-950 → primary-950
```

**Search scope:** `src/components/golf/`, `src/app/golf/`

**DO NOT touch:** Files in `src/components/ui/` (shared components), `node_modules`, or config files.

After replacing, verify no visual regression by checking key pages: dashboard, roster, rounds, settings.

---

## Fix 7: Slate and Stone Gray Cleanup

**Problem:** 77 uses of `slate-*` and 81 uses of `stone-*` in golf components. The design system only uses `warm-*`.

**Fix — search and replace in `src/components/golf/` and `src/app/golf/`:**
```
slate-50  → warm-50      stone-50  → warm-50
slate-100 → warm-100     stone-100 → warm-100
slate-200 → warm-200     stone-200 → warm-200
slate-300 → warm-300     stone-300 → warm-300
slate-400 → warm-400     stone-400 → warm-400
slate-500 → warm-500     stone-500 → warm-500
slate-600 → warm-600     stone-600 → warm-600
slate-700 → warm-700     stone-700 → warm-700
slate-800 → warm-800     stone-800 → warm-800
slate-900 → warm-900     stone-900 → warm-900
slate-950 → warm-950     stone-950 → warm-950
```

**Also fix hardcoded hex values in chart components:**
- `#E2E8F0` (slate-200) → `#e7e5e4` (warm-200)
- `#64748B` (slate-500) → `#78716c` (warm-500)

**Key files with slate/stone usage:**
- `src/app/golf/(dashboard)/dashboard/page.tsx` (loading + error states)
- `src/app/golf/join/[code]/golf-join-team-client.tsx`
- `src/app/golf/join/[code]/error.tsx`, `page.tsx`
- `src/app/golf/admin/crm/components/EventDetailModal.tsx`
- `src/app/golf/admin/crm/components/PipelineView.tsx`
- `src/app/golf/admin/crm/components/QuickActionsPanel.tsx`
- `src/components/golf/tasks/` (multiple files)
- `src/components/errors/RouteErrorBoundary.tsx`

---

## Fix 8: Font Cleanup

**Problem:** 3 sans-serif fonts loaded: DM Sans (via Next.js font), Inter (via Google Fonts import in globals.css), SF Pro (in Tailwind config).

**Fix:**
1. Remove the Inter Google Fonts `@import` from `src/app/globals.css`
2. Remove `font-sf-pro` from `tailwind.config.ts` fontFamily (or keep only as a fallback, not primary)
3. DM Sans should be the single sans-serif font

---

## Fix 9: Onboarding Color Alignment

**Problem:** Onboarding uses its own color system in tailwind.config.ts:
- `onboarding-kelly-green: #169B45` (vs brand `#16A34A`)
- `onboarding-cream: #FFFDF7` (vs brand `#FFFEFA`)
- `onboarding-text-primary: #1A1A1A` (neutral black, not warm)

**Fix:**
1. Replace `onboarding-kelly-green` references with `primary-600`
2. Replace `onboarding-cream` references with the main cream token
3. Replace `onboarding-text-primary` references with `warm-900`
4. Remove the onboarding-specific color definitions from tailwind.config.ts

---

## Fix 10: Replace Content Loading Spinners with Skeletons

**Priority files (route loading states):**
- `src/app/golf/join/[code]/loading.tsx` — replace spinner with skeleton
- `src/app/golf/(onboarding)/coach/loading.tsx` — replace spinner with skeleton
- `src/app/golf/(onboarding)/player/loading.tsx` — replace spinner with skeleton
- `src/app/golf/(auth)/signup/loading.tsx` — replace spinner with skeleton
- `src/app/golf/(auth)/forgot-password/loading.tsx` — replace spinner with skeleton
- `src/app/golf/(auth)/reset-password/loading.tsx` — replace spinner with skeleton
- `src/app/golf/(auth)/login/loading.tsx` — replace spinner with skeleton
- `src/components/ui/loading.tsx` (PageLoading) — replace spinner with skeleton

**Use existing skeleton components from `src/components/golf/GolfSkeletons.tsx` where appropriate, or create simple skeleton layouts for auth/onboarding pages.**

**Spinners are STILL OK for:**
- Inline button loading states (small, contextual)
- Form submission feedback (brief, action-specific)

**Spinners are NOT OK for:**
- Page loading states
- Content area loading
- Data fetching indicators
- Chart loading states

---

## Verification Checklist

After all fixes, run:
```bash
npx tsc --noEmit          # Should drop from 59 errors to ~24
npx next lint             # Should have 0 errors
npm run build             # Must still pass
```

Visually verify:
- [ ] 404 page shows golf branding and links to /golf/dashboard
- [ ] Loading skeletons are warm-toned (not cool gray)
- [ ] Dashboard page borders and text are warm-toned
- [ ] CRM page loads without runtime errors
- [ ] Onboarding pages use consistent brand colors
- [ ] No emerald green visible (should all be primary green)
