---
paths:
  - "**/*.tsx"
  - "**/*.css"
---

## Design System

**Fairway is the only dashboard design system.** `src/lib/redesign/flag.ts`
`isRedesignEnabled()` is hardcoded `return true` (Wave W1, 2026-07-09) — on
in every environment including prod. The old GolfDashboardShell/GolfSidebar
fork and its `glass-standard`/`cream-100`/`warm-*` visual language are
retired under `src/app/golf/(dashboard)/` — don't reintroduce them.

> Source of truth: `src/styles/design-tokens.css` (`--fw-*` custom
> properties) bridged into Tailwind via `tailwind.config.ts`
> (`bg-canvas`/`bg-surface`/`text-text-primary`/`rounded-card`/
> `shadow-soft` etc.). If this doc and the tokens disagree, tokens win.

### Primitives (`src/components/fairway`)
`Surface`/`Inset`/`Elevated` (`surfaces/`, THE card — `bg-surface` +
`rounded-card` + border-subtle *or* `shadow-soft`, never both, no forced
min-height) · `InstrumentPanel`/`Readout` (`instrument/`, dense metric
displays) · `Segmented` (`controls/segmented.tsx`, THE tab-switcher —
~15 call sites, style once here) · `ViewHeader` (`view-header/`) ·
`EmptyState`/`InsufficientData` (`feedback/`, never hand-roll a raw
"No X yet" line) · `InlineNotice` · `ModalShell`/`Sheet` (`overlays/`,
the ONE modal / ONE slide-over) · `Skeleton` (`feedback/Skeleton.tsx` —
`loading.tsx` must shape-match its page's real Fairway first paint;
see `stats/loading.tsx` for the bar).

### Type roles + banned classes
`font-fw-display`/`font-fw-sans`/`font-fw-mono` — Fraunces and General
Sans were **deliberately removed**; display/sans now resolve to the
system SF Pro stack, only `fw-mono` still loads a webfont (Fragment
Mono). Banned in golf-dashboard surfaces: raw `red-*`/`amber-*`/
`rose-*`/`violet-*`, `glass-*`, new `cream-*`/`warm-*`. **Legacy
exception**: `src/components/ui/skeleton.tsx`
(`GenericPageSkeleton`/`DetailPageSkeleton`/`FormPageSkeleton`) is still
correctly used by non-golf routes (admin, auth, baseball, onboarding) —
don't import it for new golf `loading.tsx` files.

### Hard-won invariants
- Never nest interactive children inside a `BentoCell` with `onOpen` —
  the whole cell is one `<button>`; a nested button/link is invalid
  HTML and a hydration-crash class.
- CoachHelm motion: always `useReducedMotionGuard()`
  (`src/lib/coachhelm/v3/motion.ts`) with initial-prop gating
  (`initial={prefersReducedMotion ? false : {...}}`), never raw
  `useReducedMotion()` (returns `null` pre-hydration → #418 mismatch).
- Select/Combobox popups inside a `ModalShell` portal into the dialog;
  z-index goes on the **Positioner**, not the Popup — the Popup is
  `position: static` so z-index there does nothing, and options mount
  in the DOM but paint invisibly below the dialog.
- Escape closes popup-then-dialog, one level per keypress —
  `ModalShell`'s `handleContentEscapeKeyDown` stops Radix's dialog-level
  Escape from swallowing the open popup's own Escape.
- Two z-index ladders, not interchangeable: `--fw-z-*` in
  `design-tokens.css` (current) vs. a second ladder in
  `src/styles/tokens.css` — a `z-modal` class doesn't reliably mean the
  Fairway ladder's `--fw-z-modal`; check which token file backs it.

### Quality Bar
Apple-grade premium polish: dense, even, honest empty states (no
full-screen monolith cards on mobile), accessible, server components
by default, reduced-motion-safe animation.

---
