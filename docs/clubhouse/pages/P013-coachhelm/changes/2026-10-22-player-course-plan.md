## 2026-10-22 — Player: their own Course plan (flag off)

```text
Design package: none (supercharge 04 Example 10; the coach's Course plan is
                the reference)
PR/commit:      see git log (claude/coachhelm-round-prompts, chs-21 / par-14)
Contract IDs:   CH-13916 section, CH-13917 plan, CH-13233 failed,
                CH-13333 no course yet, CH-13733 chip haptic
Actions:        Pick a course; a course; Try again; none written
Data impact:    reads only: listMyCoursePlanCourses and getMyCoursePlan take
                no player id and answer for the signed-in player's own
                golf_players row
Held items:     coachhelm_course_plan_v1 stays off in production
```

### Changed

- The player's Board shows "Course plan" at the foot of the side column (and
  under the empty Board) when `coachhelm_course_plan_v1` is on. Pick a course
  lists the player's courses with three or more countable rounds, and a
  course shows at most three lines from their own rounds there, in the
  player's voice.
- Below six rounds the plan adds "From your N rounds here, so take it as a
  reminder, not a read." When nothing has cost a stroke a round, it says so
  instead of listing lines.
- Two new server actions read the plan for the session's player only: the
  player is found by `golf_players.user_id` from the session, never from a
  passed id, and only the player copy comes back.

### Why

- The coach could read a course plan for a player, but the player could not
  read their own.

### Verification

- `src/app/golf/actions/__tests__/coachhelm-course-plan.test.ts` (player
  scope: flag off, signed out, no player row, a failed lookup, and only the
  session player's rounds),
  `src/lib/coachhelm/course-plan/__tests__/build-plan.test.ts` and
  `src/clubhouse/screens/coachhelm/__tests__/my-course-plan.test.tsx`.
- Preview states `coachhelm-player?state=courseplan`, `courseplannone` and
  `courseplanfailed`, phone screenshots (390 × 844), light and dark.
