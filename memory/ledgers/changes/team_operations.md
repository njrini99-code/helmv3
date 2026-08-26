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
