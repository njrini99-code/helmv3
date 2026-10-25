# 2026-10-25 — Rounds: the coach's view of a course (P-7, slice 10)

## 2026-10-25 — A player's history at a course, for their coach

```text
Design package: P-7 build plan, 4.4, 6.4
PR/commit:      feature/p7-course-review-stats
Contract IDs:   none new
Actions:        none (a prefilled message; nothing sends from the page)
Data impact:    none
Held items:     none
```

### Changed

- The coach's course page (`?player=`, checked against active team membership)
  names the player throughout and has "Message Lena" in place of Start a round
  here. It opens Messages with a draft from the first figure past its floor
  (the costly stretch, then how the course plays, then a plain ask). The coach
  sends it there.

### Departures

- No footer about rounds from before the player joined the team: the
  membership start column is unverified, so the page claims nothing.
- No `revalidatePath` for the course route: the page is dynamic (auth cookies)
  and reads fresh on every request.

### Verification

- `course-coach.test.tsx`.
