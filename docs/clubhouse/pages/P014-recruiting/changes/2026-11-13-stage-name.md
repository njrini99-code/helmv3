# 2026-11-13 — recruiting

## 2026-11-13 — A pipeline stage is named by its word, then its count

```text
Design package: none (audit 2026-11-13, F-0011; no visible change)
PR/commit:      agent/ch-look-a11y
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- A stage button (`.ch-rec-pipe__stage`, CH-14801) is named "Watched, 1
  prospect", then its line where one is drawn, from its own words: the count
  coin is `aria-hidden` and its count is read in words after the stage. No
  aria-label.

### Why

- Audit 2026-11-13 F-0011 (S2, axe `label-content-name-mismatch`, WCAG 2.5.3
  Label in Name): the name a screen reader and Voice Control use did not hold
  the words on the control, so a voice-control user who said what they saw could
  not reach it. The face read "1Watched…" against the aria-label "Watched, 1
  prospect".

### Verification

- `screens/recruiting/__tests__/pipeline-name.test.tsx` (compact and full);
  `src/clubhouse/__tests__/recruiting.test.tsx` (names updated).
