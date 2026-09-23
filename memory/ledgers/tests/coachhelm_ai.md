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
