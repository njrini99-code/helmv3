# 2026-11-16 — CoachHelm

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

- Team board Huddle dots (`screens/coachhelm/team/Huddle.tsx`): each dot's
  name starts with the initials it draws, then the player's name (SWP-01).

### Why

- The tier W axe scan on staging (16 Nov) still found label and name
  mismatches here after #2538 (WCAG 2.5.3).

### Verification

- Unit (jsdom): `src/clubhouse/__tests__/qualifiers-premium.test.tsx`,
  `qualifiers.test.tsx`, the CoachHelm team tests. A W rescan is owed.
