# 2026-11-15 — hub

## 2026-11-15 — A trip says where it stays; a trip day is not empty

```text
Design package: none (prod audit 2026-11-15, P1-21, N13P-40; same cause N13C-94)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none new
Data impact:    none (reads only; no rows changed)
Held items:     an announcement's time that disagrees with the trip is not flagged (announcements carry no link to a trip)
```

### Changed

- `hub-summary.ts`: `tripStay` says where a trip stays: the hotel when set, else what its dates hold ("2 nights, hotel not set");
  "Same day" only for a trip back the day it leaves. `dayHolds` names what a day of the week strip holds, a trip included.
- `parts.tsx` (the trip pass) and `widgets.tsx` (Home's Next trip): Stay and Stays read `tripStay`. A Friday to Sunday trip with no
  hotel read "Same day" on the pass and "Hotel not set" on Home; both now say "2 nights, hotel not set".
- `widgets.tsx` (Next 7 days): a trip day with no events shows its "On the road" line and no "Nothing on"; its name in the strip
  says "on the road (Pinehurst)" instead of "nothing on, on the road".

### Why

Team Hub gave "Stay: Same day" for a Friday to Sunday trip, and Next 7 days said "On the road" right above "Nothing on Fri 13"
(N13P-40). The third part of the finding, three times for one bus (the trip card against two announcements), is not fixed here: an
announcement has no link to the trip, so there is nothing to compare its time with without a schema change.

### Verification

- `__tests__/hub-summary.test.ts`: stay for a hotel, two nights, one night, across a month, a day trip and no dates; a day's name with
  a trip, events, both and neither.
- `__tests__/hub-redesign.test.tsx`: a trip day with no events shows the trip and no "Nothing on".
- The hub suites (6 files, 225 tests) and `tsgo --noEmit` pass. Not checked in a browser or on a device in this change.
