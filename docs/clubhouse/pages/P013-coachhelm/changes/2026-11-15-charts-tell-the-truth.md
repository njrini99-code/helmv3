# 2026-11-15 — CoachHelm

## 2026-11-15 — CoachHelm's pictures honour which way is better

```text
Design package: none (owner's stats and charts audit, 15 Nov 2026, section 5)
PR/commit:      claude/project-thread-szdz3m
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (a file goal carries `lowerBetter`; its word is the check-ins' change against their own spread)
Held items:     colours (visual-system thread): the Comparison "you" bar's fill
```

### Changed

- Player file goal (`file/cards.tsx` GoalBlock, `coachhelm-file-shape.ts`
  `goalWord`): a lower-is-better goal draws better up, and the word is
  "Improved", "No clear change" or "Worse" from the check-ins' change past two
  standard errors of their own spread, from three check-ins (CH-07).
- This week's focus stories (`team/Stories.tsx`): before, now and the target
  on one axis that runs better to the right, with zero marked when the measure
  is signed; the way is said in words ("Moved towards the target") (CH-08).
- Comparison (`team/panels.tsx`): bars run from a zero rule, so a negative
  value draws to the left of it (CH-23). Read evidence: the strip runs from par,
  under par up, on one range at least ten strokes wide, and penalties from zero
  with no floor (CH-14).
- Course card (`team/CourseCard.tsx`): weeks sit by date (CH-11).
- Roster fingerprints (`team/Cards.tsx`): one ruler for the roster, sized so
  the largest gain and loss fit, no 2pt floor (CH-17).
- Ask: miss-pattern wedges have area in proportion to the count, none for a
  direction with no misses (`chat/visual/blocks.tsx`, CH-22); the ruled trend
  colours its last round only past the shown rounds' spread
  (`chat/studio/drawings.tsx`, CH-24).
- Momentum and the deep dive say a change past two standard errors (CH-05).

### Why

- The owner's stats and charts audit (15 Nov 2026) found pictures that read a
  lower-is-better goal upside down, coloured by the wrong sign, clamped
  silently, and grew shapes from a floor.

### Verification

- Tests: `data/__tests__/coachhelm-file-shape.test.ts`,
  `file/__tests__/goal-block.test.tsx`, `team/__tests__/stories.test.tsx`,
  `team/__tests__/tile-row.test.tsx`,
  `team/__tests__/panels-comparison.test.tsx`,
  `team/__tests__/fingerprint.test.tsx`,
  `team/__tests__/course-trend.test.tsx`,
  `chat/__tests__/miss-pattern.test.tsx`,
  `chat/studio/__tests__/drawings.test.ts`,
  `__tests__/coachhelm-dive.test.tsx`, `__tests__/coachhelm-profile.test.tsx`.
- Screenshots: before and after in the PR description.
