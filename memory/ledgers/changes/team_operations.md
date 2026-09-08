# Change ledger — team_operations

## 2026-08-26 — task modals: touch focus rule + unclippable footer; hub/travel/tasks skeletons

- SHA: 596913022, f4216fef8, + the skeleton-fidelity commit following.
- Change: FairwayCreateTaskModal's title autoFocus gated on fine pointer.
  FairwayCreateFromTemplateModal restructured to the Body-wraps-Form /
  Footer-outside composition (its Cancel/Create buttons sat inside the
  overflow-hidden panel and clipped off-screen once the roster checkbox
  list grew — no scroll could reach them). team-hub/loading.tsx rewritten
  off the retired tabbed layout onto the live bento grid;
  travel/loading.tsx now paints the real no-selection EmptyState default;
  tasks/loading.tsx matches the collapsed templates rail + Quick stats.
- Why: owner TestFlight keyboard report + the sweep's shape-match audit
  (loading.tsx must mirror the real first paint).

## 2026-09-07 — route `loading.tsx` fallbacks reshaped to the real first paint

- SHA: 6eccdf03d.
- Change: this feature's route Suspense fallbacks (`dashboard/documents`, `dashboard/tasks`, `dashboard/announcements`) were reshaped.
  No route, table, server action, data flow or business rule changed — the
  edits are confined to `loading.tsx` skeleton geometry and its ARIA
  wrapper.
- Why: the fallbacks were shape-matched to each page's SETTLED layout
  rather than the markup that paints at t=0. For a `'use client'` page
  holding its own `loading` state, the Suspense fallback is replaced by
  that component's loading branch, so reserving the populated geometry
  caused the layout shift the fallback exists to prevent. A route whose
  `page.tsx` is a pure `permanentRedirect` shim now renders `bg-canvas`
  only — no geometry, no `<h1>` for a screen that never mounts.
- Verification: every edited file was adversarially re-verified against
  its page's source, twice for the files that failed the first pass.
  typecheck 0, lint 0, build 0.
