# 2026-11-12 — coachhelm (practice plan)

## 2026-11-12 — The plan page names itself whole on a phone (G14)

```text
Design package: none (preview grade G14, GRADE_A.md)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- On a phone the practice plan page (and the run view, which shares its head)
  opens on the plan's large title, whole,
  with its day under it, as the player's plan page and every Practice section
  already do. The bar's title is plain text
  and stays hidden under the large title until it scrolls up
  (shell/large-title.tsx), so the large title is the one h1.
- Its loading skeleton draws the phone's large-title block too, so the bar's
  title is hidden from the first paint.

### Why

- Preview grade G14: the bar held the plan's name alone and cut it ("Short game
  and pre…").

### Verification

- `coachhelm/plan/__tests__/plan-phone-large-title.test.tsx`;
  `practice/__tests__/skeleton-mirror.test.tsx` updated (the
  coach's plan skeleton now has one large-title block, like the player's); plan,
  practice and large-title suites 26 files,
  201 tests, exit 0; eslint exit 0. Not re-shot in WebKit.
