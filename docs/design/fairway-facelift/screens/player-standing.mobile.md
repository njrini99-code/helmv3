<!-- markdownlint-disable MD013 -->
# My standing — `/golf/dashboard/my-standing` → `/coachhelm?view=standing` (player) · PHONE · SPEC ONLY

Files: the route is a `permanentRedirect` into `src/app/golf/(dashboard)/dashboard/coachhelm/page.tsx`, which renders the LEGACY `src/components/golf/coachhelm/home/PlayerCoachHelmHome.tsx` (a `StageRouter` over Overview · Development · Game Profile · Standing). Nothing under `src/components/fairway/pages/**` owns this view; it is outside the mobile lane's files and inside the CoachHelm lane.

## What the phone capture shows (this branch, player, 393×852)

8,600 px, and it reads: CoachHelm sub-tabs, a "← Home · Standing" bar, then seven eyebrow sections (Strokes gained · Putting · Approach · Short game · Scoring · Course mgmt · Pressure) of metric blocks — name + "vs team" chip, three bars (You · Team · PGA/Field) with tabular values, a verdict line, an italic "Closing this gap → 74.6 → 72.1 (+12 wks)" line. No card soup: it is one column of seam blocks. Defects: the arrow glyph and italic in the gap line (REVIEW: no arrows); the per-block "vs team" chips repeat the verdict the bars already show; no way to jump between the seven sections on a phone.

## SCREEN (phone)

- Archetype: C (report), phone reading. Dominant: the metric blocks. Supporting: a sticky section index (segmented scroller of the seven eyebrows) under the sub-tabs.
- EXISTING FAIRWAY: `StandingBars` (the Intelligence dossier's bars), Eyebrow, SignalChip, Toolbar (as the sticky section index).

## CONTAINERS TO CHANGE (when the CoachHelm lane takes it)

1. Metric blocks → `StandingBars frame="bare"` rows in seam sections; the "vs team" chip stays only when it disagrees with the PGA read.
2. Gap line → "Closing this gap: 74.6 to 72.1 in about 12 weeks." (words, no arrow, no italic).
3. A sticky section index (Toolbar, bare) so the seven sections are reachable without a 8,600 px scroll.
