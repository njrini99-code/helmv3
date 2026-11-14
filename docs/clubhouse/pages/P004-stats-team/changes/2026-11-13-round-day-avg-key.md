# P004 Stats (team) — 2026-11-13

## 2026-11-13 — The dashed average is the chart's key, "Round-day avg"

```text
Design package: none (audit 2026-11-13: F-0009, F-0004; owner: "Start improving the look and feel")
PR/commit:      agent/ch-look-coachhelm-stats
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     F-0004 reported as a harness artifact, see Verification
```

### Changed

- `screens/stats/ScoringFeatureChart.tsx` (`TeamFeatureChart`): the dashed
  mean is no longer labelled on its line, where the scoring line ran through
  the words (painted 1.93:1). Under the drawing, a key carries the line's own
  dash and "Round-day avg 76.4" in the card's second ink, so no line can
  cross it, whatever the rounds do. The name says which average it is, so it
  no longer reads as a second scoring average under the card's headline.
- `screens/stats/StatsTeamPhoneShs.tsx`: the detail's By round day ribbon
  names its reference line "Round-day avg" too.

### Why

- Audit F-0009 (coach phone, light and dark).

### Verification

- `screens/stats/__tests__/team-line-days.test.tsx`: the old string's
  assertion now reads "Round-day avg 75.3", and a new case pins the key
  under the drawing with no "avg" text inside the SVG. It failed before the
  change and passes after.
- Contrast from tokens: the key's ink (`--ch-feature-ink-2`) on the feature
  card is 8.84:1 in light and 8.44:1 in dark.
- F-0004: new `screens/stats/__tests__/team-card-chart-click.test.tsx` clicks
  inside each team card's drawing or rows and sees its detail open (phone) or
  its pane change (desk). It passed on unchanged code, and fails when the
  chart is made to swallow the click. The audit's timeouts were Playwright
  clicking the card's keyboard key (`.ch-shs-sum__key`, `pointer-events:
  none` on purpose, STATS-8), which a pointer never hits; its mouse retest ran
  on a desk, where Team scoring is already the open pane, and looked for an
  address change or a dialog, which a desk never makes. No change to the
  cards.
- Screenshots: pending the lead's visual pass (no browser was run here); no
  VERIFY rows were added.
