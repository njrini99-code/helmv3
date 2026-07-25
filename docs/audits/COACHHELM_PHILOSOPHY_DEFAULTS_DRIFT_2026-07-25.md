# Verified finding: `PHILOSOPHY_DEFAULTS` disagrees with the DB column defaults

**Found by:** the owner, while checking the live schema.
**Verified against live prod:** 2026-07-25. **Confirmed — all four fields differ.**
**Status:** NOT fixed. Fixing it changes which insights fire for real coaches, so
it is a product decision, not a drive-by. Deliberately excluded from the
2026-07-25 remediation deploy, whose scope was the round-analysis drain.

---

## The drift

| Field | DB column default | `src/lib/coachhelm/constants.ts` | Effect of the DB value |
|---|---|---|---|
| `pressure_gap_threshold` | **2.0** | **2.5** | DB is *more* sensitive — flags pressure gaps sooner |
| `bubble_zone_range` | **1.5** | **1.0** | DB is *wider* — more players counted as "on the bubble" |
| `priority_short_game` | **2** | **3** | ranking of short game vs putting is **inverted** |
| `priority_putting` | **3** | **2** | " |

Everything else agrees: `decline_threshold` 2.0, `priority_ball_striking` 1,
`priority_course_management` 4, `priority_mental_game` 5, all five weights
(35/30/20/10/5), `alert_sensitivity` `'balanced'`.

## Why it is live, not theoretical

Two code paths produce a "default" philosophy and they disagree:

1. **`src/hooks/coachhelm/useCoachPhilosophy.ts:166-177`** — when a coach has no
   row, it INSERTs with *only the five priority fields* taken from
   `PHILOSOPHY_DEFAULTS`. The thresholds are omitted, so **Postgres defaults win
   for thresholds (2.0 / 1.5) while code values win for priorities**. The row is
   a hybrid of the two sources. The inline comment — "postgres defaults handle
   this largely, but explicit here for clarity" — is exactly where the drift hides.
2. **`src/app/golf/actions/insights.ts:256-259`** — when no row is found at read
   time, the insight engine builds an in-memory philosophy by spreading
   `PHILOSOPHY_DEFAULTS`, so it runs at **2.5 / 1.0** and the code priority order.

### Measured blast radius (live prod, 2026-07-25)

| Measure | Count |
|---|---|
| `golf_coaches` total | **15** |
| `golf_coach_philosophy` rows | **5** |
| **Coaches with no philosophy row** | **10** |
| Saved rows at DB threshold defaults (2.0 / 1.5) | **5 of 5** |
| Saved rows at code threshold defaults (2.5 / 1.0) | **0 of 5** |
| Saved rows with DB priority order (short 2 / putt 3) | 1 |
| Saved rows with code priority order (short 3 / putt 2) | 2 |

So **two-thirds of coaches (10/15) run the insight engine at 2.5 / 1.0**, while
**every coach who has a row runs at 2.0 / 1.5** — from the same "default"
concept. No row has ever carried the code threshold values, because the insert
path never writes them.

## What needs deciding before this can be fixed

The values are not interchangeable — they change insight volume:

- Aligning **code → DB** (2.0 / 1.5) is a no-op for the 5 coaches with rows, but
  makes the 10 rowless coaches *more* sensitive: more pressure-gap alerts, a
  wider bubble zone.
- Aligning **DB → code** (2.5 / 1.0) is a no-op for the 10 rowless coaches, but
  changes nothing for existing rows either (a column DEFAULT only affects future
  inserts) — so it fixes new-row behaviour only, and leaves the 5 existing rows
  at values that then match neither source.

**Recommendation:** pick one authoritative source, then make
`useCoachPhilosophy`'s insert write **every** defaulted field explicitly so the
two paths cannot silently diverge again. My read is that the DB values should
win for thresholds — they are what every real saved row already uses and what
production insights have been computed against — and the code order should win
for priorities, since it is what the app's own insert path writes (2 of 5 rows).
That is a split resolution and it is the owner's call, because it changes alert
volume for 10 coaches.

## Same shape as the rest of this audit

This is another instance of the recurring CoachHelm failure mode: two sources of
truth for one value, no test asserting they agree, and no surface where the
disagreement is visible. Worth adding a unit test that asserts
`PHILOSOPHY_DEFAULTS` matches the DB column defaults once the authoritative
side is chosen — that turns this class of drift into a CI failure.
