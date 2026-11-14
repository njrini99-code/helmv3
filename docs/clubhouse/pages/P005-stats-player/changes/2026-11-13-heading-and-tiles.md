# 2026-11-13 — stats-player

## 2026-11-13 — My stats h1 on the phone; glance tiles named by faces

```text
Design package: none (audit 2026-11-13, F-0011, F-0020; no visible change)
PR/commit:      agent/ch-look-a11y
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- F-0020: the player's own phone page has one h1, "My stats" (visually hidden,
  as Team stats' is), in every state, including no rounds. The first-run card's
  title is an h2, not an h3, so the headings no longer skip a level (desktop
  `heading-order`). Only the headings change; the charts are untouched.
- F-0011: the At a glance tiles (`.ch-shs-gc`) are named by what they show,
  label, figure and line in order, then "Open `<detail>`" for a screen reader, in
  place of an aria-label that read them in other words.

### Why

- Audit 2026-11-13 F-0011 (S2, axe `label-content-name-mismatch`, WCAG 2.5.3
  Label in Name): the name a screen reader and Voice Control use did not hold
  the words on the control, so a voice-control user who said what they saw could
  not reach it.
- F-0020 (S3, axe `page-has-heading-one`): the demo player with no rounds had no
  h1.

### Verification

- `screens/stats/__tests__/stats-states.test.tsx` (no rounds and with rounds:
  one h1, My stats, no heading skips a level), `stats-summary-cards.test.tsx`
  (tiles: no aria-label, the name opens with label and figure).
