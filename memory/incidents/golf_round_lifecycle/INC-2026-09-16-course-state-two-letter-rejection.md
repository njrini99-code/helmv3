# INC-2026-09-16 — tournament rounds at a Canadian course could not start

- Feature: `golf_round_lifecycle`
- Status: MITIGATED in production data (2026-09-16); code fix on
  `agent/fix-course-state-length`, not yet deployed
- Risk: R2 — players locked out of round entry for a live tournament; no
  data lost, nothing written
- First seen: 2026-09-13/14 (UNCW at the Canadian Collegiate, Oviinbyrd Golf
  Club, Port Carling, Ontario); reported 2026-09-16 08:37 by the UNCW coach
  as "won't let them pick the course, or it lets them pick the course but
  resets when they start the round"

## What was wrong

Both round schemas in `src/app/golf/actions/golf.ts`
(`golfRoundComprehensiveSchema` and `partialRoundSchema`) declared

```ts
courseState: z.string().max(2).optional(),
```

while the course library stores `golf_courses.state` as free text and the
course editor never constrained it. Oviinbyrd Golf Club (`13d2c110-…`,
created 2026-08-09 by the UNCW team) carried `state = 'Ontario'`. Picking its
Championship tee copied that value into the round setup verbatim, and the
first `savePartialRound` of the new round failed Zod validation.

That first save has no holes, so the server's salvage path
("drop the failing holes, keep the rest") had nothing to keep. It logged
`Auto-save unsalvageable (failure outside holes)` and returned a bare
`{ success: false, error: 'retry' }`. The client rendered the generic
"That save did not go through… Please try again." and stayed on setup —
which, from the tee box, looks exactly like the start button resetting.

Validation runs before auth in that action, so every one of the 62
`error_logs` rows (2026-09-14 01:24–01:56Z, `/server/savePartialRound`,
message `Auto-save validation failed: courseState: Too big: expected string
to have <=2 characters`) carries `user_id: null`. That is why a per-team
search of the logs found nothing at first.

## What was ruled out first

The initial hypothesis was a recent course-library migration. It was not:

- production and the repo both sit at migration `20260909230000`; the
  course-library migrations are June–August and unchanged
- the `agent/golf-course-geometry` branch adds no migrations
- RLS on the course tables is intact; UNCW's tee and 18 holes are complete
- no server errors for UNCW in Vercel runtime logs, `helm_debug.trace_runs`,
  or `admin_events`; no stale-asset recovery reloads; no session revocations
- other teams started rounds on the same deployment (US courses, 2-letter
  states) without incident

The failing deployment (`479569b09`, #1943) did not introduce the cap — it has
been in both schemas since the round schemas were written. What changed is
that a team created a course outside the US and then played a tournament on it.

## Mitigation applied (production data, 2026-09-16)

Target identified before the write: the one `golf_courses` row with a state
longer than 2 characters.

```sql
update public.golf_courses
   set state = 'ON', last_edited_at = now(), updated_at = now()
 where id = '13d2c110-bee4-496e-b390-e523a4bd0fbb' and state = 'Ontario';
```

Recorded in `golf_course_edit_history` (`ef121b61-…`) with the reason
`2026-09-16 incident: round-create schema rejected states longer than 2
characters`. No rounds, notes, or other courses were touched. Players must
reload the New Round page and re-pick the course; a setup form still holding
"Ontario" in memory will keep failing until then.

## Code fix (`agent/fix-course-state-length`)

- both schemas: `courseState` cap raised to 100 characters (matching
  `courseCity`; the `golf_rounds.course_state` column is `text`)
- `FairwayNewRoundEntry.tsx`: manual State input `maxLength` 2 → 100
- `golf-schemas.test.ts`: duplicated schema synced; "Ontario" and
  "British Columbia" accepted, 101 characters rejected
- `golf-save-partial-round-course-state.test.ts`: a fresh tournament round
  with `courseState: 'Ontario'` starts and persists the value

## What closes this

- the fix is merged and the production deployment serves it (a round at a
  course whose library state is a full name starts without the data edit)
- optional follow-up, not done here: normalise `golf_courses.state` at the
  course editor, or accept both forms in the picker, so the library and the
  round never disagree on the shape of the field
