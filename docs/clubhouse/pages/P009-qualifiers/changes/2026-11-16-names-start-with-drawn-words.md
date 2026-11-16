# 2026-11-16 — Qualifiers

## 2026-11-16 — names start with the drawn words

```text
Design package: none (WebKit pass of #2538, 16 Nov; audit SWP-01)
PR/commit:      claude/project-thread-7ygzj3 (the follow-up to #2538)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Phone leaderboard rows (`screens/qualifiers/QualifierDetailPhone.tsx`):
  each row button is named by what it draws, in drawn order (place, name,
  state, to par, strokes), with separators and the rest as hidden words, instead
  of an `aria-label` that put the name before the place (SWP-01).

### Why

- The tier W axe scan on staging (16 Nov) still found label and name
  mismatches here after #2538 (WCAG 2.5.3).

### Verification

- Unit (jsdom): `src/clubhouse/__tests__/qualifiers-premium.test.tsx`,
  `qualifiers.test.tsx`, the CoachHelm team tests. A W rescan is owed.
