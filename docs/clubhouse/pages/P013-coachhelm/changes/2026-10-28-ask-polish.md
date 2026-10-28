# 2026-10-28 — CoachHelm Ask: polish (dates, contrast, steps, caps, motion)

## 2026-10-28 — Ask polish from the main-branch audit

```text
Design package: none (CoachHelm audit of main, 2026-10-28)
PR/commit:      fix/coachhelm-ask-polish
Contract IDs:   none changed
Actions:        none
Data impact:    none (read tools only mark a capped list partial)
Held items:     the Clubhouse Ask does not read ?q= yet; the redirect
                keeps it for when it does
```

### Changed

- Trend dates under the in-thread chart: on a phone the dates ran
  together ("Sep 12Sep 19Sep 26Sep 27"). `spreadLabels` (ui/charts/Line)
  picks the names that fit the measured width: all, else every second or
  third, always ending on the newest, else first and last, else the
  newest. No two ever touch, and each stays inside the plot.
- Night contrast: the avatar's wheel and ball take the night green
  (`--ch-green-600`), well over 3:1 on the sheet; they were about 1.4:1.
  A chosen visual row gets a 1px ring in `--ch-selected-ink`; its fill
  alone was about 1.01:1. Light is unchanged.
- Step labels: the team rounds, qualifiers and tournaments reads say
  what they read ("Reading the team’s rounds", "Reading qualifier
  standings", "Reading tournament results") instead of "Working".
- Capped lists: `get_qualifiers` at its 900-round cap, and every
  per-player figure and the weekly line of `get_team_rounds` at its
  600-round cap, are partial with a note, never complete.
- The working shimmer stops for reduced motion and Animations off (the
  words hold in the line's ink) and is solid primary ink for Increase
  Contrast and forced colours.
- An old `/coachhelm/chat` link keeps `?c=` (id-shaped) and `?q=`
  (encoded, no control characters, at most 1000 characters) on the
  Ask sub-tab. Nothing else of its query is carried.

### Verification

- `line-spread-labels.test` (tick choice, never overlapping, at every
  width from 60 to 720 and 1 to 12 points), `contrast-tokens.test`
  (night mark and selected row at 3:1 or more, light unchanged),
  `agent-tools.progress-labels.test`, `team-read-tools.test` (both
  caps), `coachhelm-ask-shimmer-motion.test`, `alias.test` (the chat
  redirect).
