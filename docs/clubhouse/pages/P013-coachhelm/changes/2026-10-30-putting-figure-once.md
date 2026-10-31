# 2026-10-30 — CoachHelm: the putting figure once

## 2026-10-30 — The putting card, its gauge and its audit say the Tour figure once (F-0070)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0070; fix plan
                PR 10)
PR/commit:      claude/audit-fix-10-coachhelm-putting (#2421)
Contract IDs:   none
Actions:        none (Fairway renders the same generator content)
Data impact:    none
Held items:     none
```

### Changed

- The shared generator (lib/coachhelm/v3/generators/putt-distance.ts) writes
  the rate, its likely range and the Tour figure once each, as whole numbers;
  the coach copy says "their" at the second mention, so the reader puts the
  name in once. Evidence fields unchanged.
- data/coachhelm-map.ts: a labelled comparison drops the anchor’s "make % avg"
  and shows a percent whole, so the gauge reads "PGA Tour 62%" (any labelled
  percent comparison is now a whole number); with a gauge drawn, the audit’s
  "Compared with" no longer repeats its figure.

### Why

- One card gave the same Tour figure three ways (prose, gauge "make % avg
  62.2", audit). Stored insights change only when regenerated; none were
  regenerated.

### Verification

- putt-distance-copy.test (new) and coachhelm.test F-0070 cases: red on main,
  green after. The legacy PuttDistanceGenerator.test pins updated to the new
  wording.
