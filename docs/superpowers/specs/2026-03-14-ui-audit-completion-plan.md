# UI Audit Completion Plan

**Date:** 2026-03-14
**Status:** In Progress
**Reference:** `docs/legacy/root-docs/UI_AUDIT_REPORT.md`

---

## What's Done

### CRM Overhaul (Complete)
- [x] Simplified 15 → 7 coach statuses
- [x] Email Tracking tab (5th tab)
- [x] Email templates + merge tags
- [x] Unified activity timeline in CoachDetailPanel
- [x] Toast notification system
- [x] Rate limiting + bounce suppression
- [x] Search debounce, hidden filters, mobile fixes
- [x] Import dedup + batch insert
- [x] Auto follow-up scheduling
- [x] Inbound leads tab (6th tab)
- [x] Landing page glass signup upgraded

### UI Audit Sprint 1 (Complete)
- [x] Auth: Login mobile-responsive, input heights, button standardization
- [x] Auth: Off-brand emerald/teal → primary green
- [x] Auth: min-h-dvh on all loading/error pages
- [x] Auth: Focus-visible rings on submit buttons
- [x] Onboarding: Join flow redesigned with glassmorphism
- [x] Onboarding: Shared StepIndicator extracted
- [x] Onboarding: Dead onboarding tokens removed from tailwind.config
- [x] Coach Dashboard: H1 standardized (font-semibold, tracking-tight)
- [x] Coach Dashboard: Headers unified (golf-mobile-page-header)
- [x] Coach Dashboard: glass-standard applied, MobileMenuButton everywhere
- [x] Coach Dashboard: Alerts skeleton loader, sidebar active state
- [x] Player Dashboard: Header blur fixed, H1 standardized
- [x] Player Dashboard: Empty states standardized, alert()→toast
- [x] Player Dashboard: MobileMenuButton, score colors unified
- [x] Design Tokens: Off-brand greens fixed in globals.css
- [x] Design Tokens: Slate→warm migration in layout components

### Premium Glass Style (In Progress)
- [x] Created `glass-premium` CSS class matching products page
- [ ] Applied to player dashboard cards (agent running)

---

## Remaining Work

### Phase 1: Premium Glass Rollout (after player dashboard preview approval)

**Goal:** Apply the products-page premium card style across all dashboards.

| Task | Files | Est. |
|------|-------|------|
| Apply `glass-premium` to coach dashboard cards | CoachDashboard.tsx, alerts, insights, patterns, intelligence | 1 agent |
| Apply `glass-premium` to shared team pages | calendar, roster, tasks, messages, announcements, documents, travel | 1 agent |
| Apply `glass-premium` to CRM dashboard cards | CRMDashboard.tsx, CoachTable, PipelineView, EmailTrackingView | 1 agent |
| Update `glass-standard` definition to be closer to premium (for any remaining uses) | globals.css | Manual |

### Phase 2: Remaining Slate → Warm Migration

**Goal:** Eliminate all 4,124 `slate-*` usages outside of baseball.

| Area | Est. Slate Count | Files |
|------|-----------------|-------|
| `src/app/baseball/` | ~2,000+ | DO NOT TOUCH — separate product |
| `src/components/baseball/` | ~500+ | DO NOT TOUCH |
| `src/app/golf/` pages | ~200 | Dashboard pages, auth, onboarding |
| `src/components/golf/` | ~100 | Golf-specific components |
| `src/components/ui/` | ~300 | Shared UI primitives (careful — baseball uses these too) |
| `src/app/(public)/` | ~200 | Landing, products, legal pages |
| `src/lib/` | ~50 | Utility files |

**Approach:**
1. Run targeted grep per directory
2. Replace `text-slate-900` → `text-warm-900`, `bg-slate-100` → `bg-warm-100`, etc.
3. Skip baseball — it may have its own color system
4. For shared `src/components/ui/` components, verify baseball doesn't depend on slate before changing

**Agent split:**
- Agent A: `src/app/golf/` (all non-dashboard pages not yet fixed)
- Agent B: `src/app/(public)/` (landing, products, legal)
- Agent C: `src/components/ui/` (shared primitives — careful audit first)

### Phase 3: Glass Opacity Consolidation

**Goal:** Reduce 17 unique `bg-white/` opacity values to 3 standard tiers.

| Current | Migrate To | Token |
|---------|-----------|-------|
| `bg-white/45`, `bg-white/50`, `bg-white/55` | `bg-white/55` | glass-subtle |
| `bg-white/60`, `bg-white/65`, `bg-white/70`, `bg-white/72`, `bg-white/75` | `bg-white/70` | glass-standard |
| `bg-white/80`, `bg-white/85`, `bg-white/90`, `bg-white/95` | `bg-white/80` | glass-prominent |
| `bg-white/5`, `bg-white/10`, `bg-white/15`, `bg-white/20`, `bg-white/30`, `bg-white/40` | Keep as-is | Dark-bg overlays (intentionally varied) |

**Approach:**
1. Grep each value, review context
2. Values on dark backgrounds (nav, sidebar, hero) stay as-is — they're intentional
3. Values on light cream backgrounds get normalized to tiers
4. Approximately 400 replacements across ~100 files

### Phase 4: Button Standardization

**Goal:** Every button in the app uses consistent radius, padding, weight, shadow.

| Size | Padding | Radius | Weight | Shadow |
|------|---------|--------|--------|--------|
| sm | `px-3 py-1.5` | `rounded-xl` | `font-medium` | `shadow-sm` |
| md (default) | `px-5 py-2.5` | `rounded-xl` | `font-semibold` | `shadow-lg shadow-primary-600/25` |
| lg | `px-7 py-3.5` | `rounded-xl` | `font-semibold` | `shadow-lg shadow-primary-600/25` |

**Approach:**
1. Audit all button instances (already done in audit report)
2. Create/verify `<Button>` component variants match these specs
3. Replace inline button styles with `<Button size="sm|md|lg" variant="primary|secondary|ghost">`
4. Focus on golf dashboard + auth first, baseball later

### Phase 5: Container Max-Width Rules

**Goal:** Consistent content widths by page type.

| Page Type | Max Width | Examples |
|-----------|----------|---------|
| Forms / Settings | `max-w-2xl` (672px) | Settings, Coaching Intelligence |
| Feed / List pages | `max-w-4xl` (896px) | Alerts, Announcements, My Qualifiers |
| Standard pages | `max-w-6xl` (1152px) | Roster, Stats |
| Data-rich dashboards | `max-w-7xl` (1280px) | Dashboard, Calendar, Intelligence |

**Approach:**
1. Map every page to its category
2. Update max-w-* classes to match the rule
3. ~15 files to update

### Phase 6: Empty State Standardization

**Goal:** Every empty state uses identical pattern.

```tsx
<div className="py-16 text-center">
  <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
    <Icon size={24} className="text-warm-400" />
  </div>
  <h3 className="text-lg font-semibold text-warm-900 mb-1">Title</h3>
  <p className="text-sm text-warm-500 max-w-sm mx-auto">Description</p>
  <Button className="mt-4">CTA</Button>
</div>
```

**Approach:**
1. Create shared `EmptyState` component if one doesn't exist
2. Replace all inline empty states across ~15-20 pages
3. Each gets appropriate icon, title, description, optional CTA

### Phase 7: Stat Card Consolidation

**Goal:** Reduce 4 stat card implementations to 1-2.

Current implementations:
1. `GlassStatCard` (from glass-card.tsx)
2. `StatCardSparkline` (premium-components.tsx)
3. `KPICard` (local to stats-client.tsx)
4. Inline `glass-standard rounded-xl p-4`

**Target:**
- `StatCard` — standard KPI card (icon, value, label, trend)
- `StatCardSparkline` — for cards with mini charts (keep as premium variant)
- Delete local KPICard implementations and inline versions

### Phase 8: Shadow System Cleanup

**Goal:** Single source of truth for shadows.

Current state: 3 parallel systems (tailwind.config.ts, tokens.css, globals.css)

**Approach:**
1. Tailwind config shadows are canonical
2. Remove CSS variable shadow definitions from tokens.css and globals.css
3. Update any CSS classes that reference `var(--shadow-*)` to use Tailwind shadow classes directly
4. Remove legacy shadow definitions from tailwind config (14 legacy entries)

### Phase 9: Typography Hierarchy

**Goal:** Restore proper font-weight hierarchy.

Current: `font-normal` used 39 times, `font-medium` 2,537 times — everything reads as "bold"

**Approach:**
1. Body text / descriptions: `font-normal` (400)
2. Labels / secondary: `font-medium` (500)
3. Headings / emphasis: `font-semibold` (600)
4. Hero / display: `font-bold` (700)
5. Audit high-traffic pages first, systematically downgrade `font-medium` to `font-normal` on body text

### Phase 10: Accessibility Pass

**Goal:** WCAG 2.1 AA compliance on all interactive elements.

| Item | Status | Action |
|------|--------|--------|
| Skip-to-content links | Partial (login/signup have them) | Add to forgot-password, reset-password, all dashboard pages |
| Focus-visible rings | Fixed in auth | Verify all dashboard buttons/inputs have them |
| Heading hierarchy | Good | Verify no skipped levels |
| Form labels | Good (except signup access code) | Add aria-label to access code input |
| Icon-only buttons | Partial | Add aria-label to all icon-only buttons |
| Touch targets | Good | Verify 44px minimum on all mobile interactive elements |
| Color contrast | Needs audit | Run contrast check on warm-400 text on cream backgrounds |

### Phase 11: Dead Code Cleanup

| Item | Action |
|------|--------|
| Unused `golden-*` color tokens | Check if products page still uses them; if not, remove |
| Unused `warm-cream`, `warm-stone`, `field`, `fairway` tokens | Check usage; remove if dead |
| Legacy shadow definitions (14 in tailwind config) | Remove after shadow system cleanup |
| `font-serif` / Playfair Display (2 uses) | Decide: expand usage or remove |
| Duplicate `2xs` font size (same as `label`) | Remove `2xs` |
| `rounded` base value inversion (4px < `rounded-sm` 8px) | Fix in tailwind config |

---

## Execution Order

| Phase | Depends On | Parallelizable? |
|-------|-----------|----------------|
| 1. Premium Glass Rollout | Player preview approval | Yes (3 agents) |
| 2. Slate → Warm | Nothing | Yes (3 agents) |
| 3. Glass Opacity | Nothing | Yes (1 agent) |
| 4. Button Standardization | Nothing | Yes (2 agents) |
| 5. Container Widths | Nothing | Yes (1 agent) |
| 6. Empty States | Nothing | Yes (1 agent) |
| 7. Stat Cards | Nothing | Yes (1 agent) |
| 8. Shadow Cleanup | Phase 1 done | Sequential |
| 9. Typography | Nothing | Yes (2 agents) |
| 10. Accessibility | Phases 4,6 done | Sequential |
| 11. Dead Code | Phase 8 done | Sequential |

**Phases 1-7 can all run in parallel** (11 agents max).
**Phases 8-11 are sequential cleanup** after the main work.

Total estimated: ~50 agents across all phases, or 5-6 batches of parallel work.
