# 2026-11-13 — home

## 2026-11-13 — The class line is named by its own words

```text
Design package: none (audit 2026-11-13, F-0011; no visible change)
PR/commit:      agent/ch-look-a11y
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The coach's class line (`.ch-ca-home__btn`, CH-2870) is named by a hidden copy of
  its words ("4 of 9 in class now. Everyone out of class … Opens class status") in
  place of an aria-label; the drawn lines are `aria-hidden`. The spoken name is
  unchanged.

### Why

- Audit 2026-11-13 F-0011 (S2, axe `label-content-name-mismatch`, WCAG 2.5.3 Label in
  Name): the name a screen reader and Voice Control use did not hold the words on the
  control, so a voice-control user who said what they saw could not reach it.
  On the phone the two drawn lines ran together for axe ("nowEveryone"); on the
  desk the " · " between them was never in the label.

### Verification

- `src/clubhouse/__tests__/class-awareness.test.tsx` (phone and desktop: no aria-label,
  the name opens with the first line).
