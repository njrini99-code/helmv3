<!-- markdownlint-disable MD004 MD007 MD012 MD013 MD022 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
# coachhelm ai test ledger

## 2026-09-04 — no new tests; the composer fixes ride the existing suite (PR #1828)

- `PromptComposer`'s Enter-by-pointer gate and `CoachHelmChat`'s per-conversation
  key are the same two fixes the team-message composer received, and are covered
  there by `MessageComposer.enterKey.test.tsx` and
  `FairwayMessages.composerScope.test.ts`. The CoachHelm siblings were changed
  identically and verified against the existing 299-test CoachHelm suite rather
  than duplicating those gates.
- Recorded deliberately: if the two composers ever diverge, this is the note
  that says the CoachHelm side has no gate of its own and should get one.

## 2026-09-23 — A7 distance-profile surface: new contracts pinned by tests

- New: `distance-profile-window.test.ts` (4) — closed-window bounds, a
  pinned (not assumed) leap-year `addMonths` edge case, and the window
  label including its neutral no-window fallback.
  `buildDistanceProfileViewModel.test.ts` (6) and
  `DistanceProfileSection.test.tsx` (5) — the status-discriminated
  render switch (`kind`, never raw `value !== null`), the
  `approach_measured_contribution` special case (always a real number,
  never an InsufficientData hedge), the accessible name baking in
  value/kind (an advisor-review catch — a bare `aria-label` had been
  replacing all descendant text for assistive tech), and
  keyboard open/close (Enter, Escape) parity with click.
- `FairwayPlayerGameFingerprint.mode.test.tsx` (existing, 7) reran
  unchanged and green — pins that the new `sectionAddenda` prop is a
  true no-op for every call site that doesn't pass it.

## 2026-09-23 — A7 Scoring surface: new contracts pinned by tests (slice 2)

- New: `buildScoringViewModel.test.ts` (5) — par-grouping across
  'all'/'mid' bands, par5-grouping into fixed metric order, a
  `courseNameById` resolution + its fallback, a two-courses-same-hole
  identity collision (mirroring A3's own fixture), and the
  empty-input case. `ScoringSection.test.tsx` (8) — a supported par
  tile next to an insufficient one switching on `kind` alone (not
  `value !== null`), fixed per-hole metric ordering, accessible-name
  baking for both row shapes, keyboard open/close (Enter, Escape)
  parity with click, the empty-collection state, an invalid par-5 row
  next to a real `0%` sibling getting metric-aware copy rather than a
  blanket "no data" claim, a non-terminating percent
  (`33.333333333333336%` → `33.3%`) formatted in the drill-down, and
  two identical hole numbers at different courses rendering with
  distinct accessible names. `load-par-opportunities.test.ts` (1) —
  wiring-only pass-through, mirroring `load-distance-profile.test.ts`.
- Two of these tests initially asserted the wrong thing rather than
  finding a real bug: a single-play "invalid" fixture at
  `greenShotNumber: 4` (fails regulation) produced `eligible=1`
  (nonzero) so the row was `'insufficient'`, not `'invalid'` as
  intended — the fixture was changed to three such plays, which
  clears the 3-play floor for regulation/green-in-two (`'supported'`,
  real `0%`) while putting-conversion's own `created` denominator
  stays 0 (`'invalid'`), correctly isolating the case the copy fix
  targets. `FairwayPlayerGameFingerprint.mode.test.tsx` (existing, 7)
  and `PlayerDeepDiveTabs.test.tsx` reran unchanged and green.
