<!-- markdownlint-disable MD013 -->
# SCREEN · Floating dock + More sheet (mobile) — preflight

Components: `src/components/fairway/app-shell/FairwayBottomNav.tsx`, `MoreNavSheet.tsx`, `more-nav.ts`, `AppShell.tsx` (offset consumer). Foundation rework already landed in bf3e44426 (60px frost capsule, 16px inset, active island, `.fw-dock-fade`).
Evidence: `captures/coach/home__phone__fold.png`, `home__phone__more-sheet__fold.png`, every `*__phone__fold.png` for the dock.

## What a coach does here

Thumb-reach switching between Home, CoachHelm, Team, Calendar; More for the long tail (Rounds & Stats, Messages, Operations, Courses, Settings, Sign out). The dock must never cover the last row of a list and must feel the same on every screen.

## SCREEN

- **Archetype:** system chrome (applies to every archetype).
- **Dominant object:** none — the dock is supporting chrome; the active island is the only emphasis.
- **Floating:** the dock (frost floating tier). The More sheet is modal (frost).
- **EXISTING FAIRWAY:** FairwayBottomNav (dock), MoreNavSheet (Sheet), more-nav.ts (single active-match + overflow logic), Button/IconButton, fwHaptic.
- **NEW FAIRWAY NEEDED:** none.
- **CONTAINERS TO REMOVE / MERGE:** More sheet rows — icon tiles in rounded squares + chevrons read as a card list; they become one InsetGroup per section (GolfHelm, …) with seam rows, 44px, icon at rest, no tile. The identity row stays first; Settings and Sign out stay in the footer, Sign out as a danger text action, not a tinted pill.
- **POLISH (dock):**
  1. `--fw-mobile-nav-height` under-reserves by 10px on notched devices (globals.css:102 uses `max(10px, safe-area)`; the dock is additive `10px + safe-area`). One formula, both sides — token owner is helmv3-7f (asked).
  2. Import `matchActive` from `more-nav.ts` (local duplicate removed).
  3. More button: Fairway `Button` (not legacy `@/components/ui/button`), `fwHaptic('selection')` like the tabs; tabs skip the haptic when re-tapping the active tab.
  4. Active island cap 36% → 33% (brief: "≤ a third").
  5. Dock items keep `rounded-full` — the island is a compact pill by design (brief §3 pill: "compact pills"); recorded as the deliberate exception.
- **MOBILE:** 44px targets pinned by tests; safe area additive; reduced motion already via `useMediaQuery`; haptics per above; the More sheet preserves the underlying screen (Sheet is a sibling; AppShell marks the shell `inert` — no scroll reset).
- **STATES:** badges stay honest (count from nav-registry); no loading state.
- **RISKS:** `FairwayBottomNav.test.tsx` (#905 no justify-around), `MoreNavSheet.test.tsx` (#177/#178 width + 44/56px floors, prefetch gate, modified-click), `more-nav.test.ts`, `AppShell.inert.test.tsx` must stay green. app-shell/** is a shared directory — edits announced to helmv3-7f before landing.
