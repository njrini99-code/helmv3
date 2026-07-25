# Pre-deploy data baseline — CoachHelm round-analysis drain

**Taken:** 2026-07-25, immediately before merging `plan/coachhelm-remediation`.
**Purpose:** prove that draining the 200 stranded rounds destroys no shot data.
Owner instruction being honoured: *"Don't lose Guilford shots."*

---

## Why the drain cannot touch shot data

Established by direct audit of the branch diff, not by assumption:

- The branch adds **zero** migrations (`git diff --name-only <base>..HEAD -- supabase/migrations` is empty).
- The branch's only mentions of `golf_shots` are in **documentation prose** — no code hunk reads or writes it.
- `src/lib/coachhelm/v2/post-round-trigger.ts` and
  `src/app/api/cron/coachhelm-safety-net/route.ts` contain **no reference to
  `golf_shots` at all**. They read `golf_rounds`, compute insights, and write
  `golf_coach_insights` rows plus the `coachhelm_analyzed_at` /
  `coachhelm_failed_at` terminal-state columns on `golf_rounds`.
- The drain is therefore **append-only on insights** and **column-update-only on
  rounds**. Shots, holes, and rounds are read-only inputs.

The one script that does clone real data —
`scripts/seed-demo-team-from-guilford.ts` — is a **manual script, not a cron and
not wired to any route**. Nothing in this deploy invokes it. It is not being run.

## Baseline counts (re-verify these after the drain; they must be identical)

| Org / team | Team ID | Rounds | Shots | Holes |
|---|---|---|---|---|
| **Guilford College — Men's Golf** (`bpotter@guilford.edu`) | `b714c30f-5459-4a57-8ccd-8af84fe6861a` | 68 | **4,990** | 1,197 |
| University of Lynchburg — Women's Golf | `343731cb-5109-4970-89e4-2e4bd49df8cb` | 20 | 1,597 | 360 |
| Demo University Golf (`njrini99@gmail.com`, `demo@golfhelmdemo.com`) | `6ecdd1a6-63fe-4beb-b094-00118f334163` | 90 | 6,699 | 1,593 |
| Demo University Golf (Pat) (`orangemanpat88@yahoo.com`) | `8a162bfc-c98f-923b-e847-d80d7803acb2` | 90 | 6,699 | 1,593 |
| Hampden-Sydney Golf | `814452e9-35ff-471a-a93a-912f5456f11f` | 3 | 222 | — |

**Global `golf_shots` row count: 21,276.** This is the single number to check
first — if it is unchanged, no shot was lost anywhere.

### Verification query to run after the drain

```sql
select
  (select count(*) from golf_shots) as all_shots_global,          -- expect 21276
  (select count(*) from golf_shots s
     where s.round_id in (select id from golf_rounds where player_id in
       (select player_id from golf_team_members
          where team_id = 'b714c30f-5459-4a57-8ccd-8af84fe6861a'))) as guilford_shots; -- expect 4990
```

Any decrease in either number means stop and investigate — the drain has no code
path that could cause it, so a drop would indicate something else running.

## Seeding scope

Standing owner constraint: **only `njrini99@gmail.com`'s team may be touched for
seeding.** That maps to org/team **Demo University Golf**
(`6ecdd1a6-63fe-4beb-b094-00118f334163`). Guilford College, University of
Lynchburg, Hampden-Sydney, and the Pat demo org are **off-limits for writes** —
they are real accounts or belong to someone else.
