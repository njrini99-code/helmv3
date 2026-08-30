# Repo migrations vs production — classification

<!-- schema-drift-absent:
    golf_player_anonymize_on_unlink, golf_players_anonymized_at_idx,
    anonymized_at, baseball_legacy_backfill_manifest,
    baseball_event_acks_select, baseball_event_acks_insert,
    baseball_event_acks_update, baseball_event_acks_delete,
    baseball_timeline_acks_select, baseball_timeline_acks_insert,
    baseball_timeline_acks_update, baseball_timeline_acks_delete,
    goal_suggestions_player_select, goal_suggestions_player_update,
    idx_baseball_timeline_acks_user_event,
    baseball_timeline_event_acks_user_id_fkey,
    golf_players_anonymize_on_unlink
-->

Every figure below was measured **2026-08-30** against production project
`qmnssrrolpinvwjjnufo` through the read path, and against the repository at
`a03ef845d`. It is a point-in-time measurement, not a live document — check
staleness with `git rev-list --count a03ef845d..HEAD -- 'supabase/migrations/**'`.

## Why this exists

`MIGRATIONS_REPO_PRODUCTION_LEDGER_DIVERGENCE` records that the repository and
production's migration ledger do not agree. The gap said what was unknown; it
did not say what was actually missing. This resolves that.

## The arithmetic, stated honestly

```text
remote ledger rows            846
repo tracked .sql files       337   (337 distinct versions, no duplicates)
                      ── of those ──
ledger row AND repo file      295
repo file, NO ledger row       42
ledger row, NO repo file      551
```

**551 is not "551 lost migrations."** Most of those versions predate the squashed
baseline and were folded into it; the rest are historical rows the repo stopped
tracking. (An earlier session in this run put the pre-baseline figure at 240.
That number is NOT re-derived here and is not part of this measurement — it is
recorded as its provenance, not as a result.)

**42 is not "42 unapplied migrations" either** — that is what the rest of this
document establishes, and most of them are already applied.

A ledger row is a claim about *history*. It is not evidence about the *schema*.
So the 42 were classified by extracting what each file declares — tables,
columns, functions, policies, indexes, triggers, enum values, constraints — and
checking those objects against the live catalog.

## Result — the 42 files with no ledger row

| class | n | meaning |
| --- | --- | --- |
| `APPLIED_EFFECTS_PRESENT` | 22 | every declared object exists in production |
| `PARTIAL_MIXED` | 5 | some declared objects exist, some do not |
| `UNAPPLIED_ALL_ABSENT` | 2 | no declared object exists |
| `UNKNOWN_ACL_ONLY` | 5 | only GRANT/REVOKE — an ACL state, not an object |
| `UNKNOWN_DML_ONLY` | 3 | only UPDATE/INSERT — a data backfill, not an object |
| `UNKNOWN_NO_SIGNAL` | 3 | extraction found nothing it could check |
| `DECLARED_NOOP` | 2 | the file itself says it is superseded |

**The eleven UNKNOWNs are a result, not a hole in the work.** A GRANT and a
backfill leave no catalog object to look for; calling them "probably applied"
would be the exact move this repo keeps having to undo. They stay UNKNOWN until
someone checks the ACL or the data directly.

### The one that matters

`20260819200000_preserve_golf_history_on_account_deletion` — `PARTIAL_MIXED`,
**1 of 5 objects present**, and the missing four are the whole point of it:

```text
golf_players.anonymized_at            ABSENT
golf_player_anonymize_on_unlink (fn)  ABSENT
golf_players_anonymize_on_unlink (tg) ABSENT
golf_players_anonymized_at_idx        ABSENT
golf_players_user_id_fkey             PRESENT — but confdeltype = 'c' (CASCADE)
```

`golf_players.user_id` is still `NOT NULL`. Measured the same day: **104 golf
players, all 104 with a linked user; 521 rounds, 36,943 shots, 9,162 holes.**
Every one of those 104 accounts can today destroy its own competitive history by
deleting itself. This is the P0 and it is tracked in
`memory/incidents/golf_round_lifecycle/` as
`INC-2026-08-30-account-deletion-still-cascades-golf-history.md`.

### A distinction that changed three verdicts: divergent NAME vs absent EFFECT

Three of the five `PARTIAL_MIXED` files declare policies that are absent *under
the names the migration uses*, while production covers the same table and the
same verbs under different names. "Unapplied" would have been wrong:

**`baseball_event_acknowledgements`** — migration declares
`baseball_event_acks_{select,insert,update,delete}`; production carries
`baseball_event_acknowledgements_{select,insert,update,delete}`.
All four verbs covered: **name divergence only.**

**`baseball_timeline_event_acks`** — migration declares
`baseball_timeline_acks_{select,insert,update,delete}`; production carries
`baseball_timeline_event_acks_{select,insert,update}`.
Three covered, **DELETE genuinely uncovered.**

**`golf_goal_suggestions`** — migration declares
`goal_suggestions_player_{select,update}`; production carries a single
`goal_suggestions_player_own` with `cmd = ALL`, a superset:
**name divergence only.**

Whether the *predicates* also match is not established here. Verb coverage is
what was measured; equivalence of the USING/WITH CHECK expressions needs a human
reading both, and is not claimed.

The remaining two `PARTIAL_MIXED` files are plain column gaps:
`baseball_camp_registrations.{registered_at,title}` and
`baseball_workload_events.count` are absent; their sibling columns are present.

### Genuinely unapplied, in full

- `20260702100100_baseball_event_acks_policy_restore` — 0/4. But see the table
  above: the verbs *are* covered under production's own names. Unapplied as
  written, not necessarily as intended.
- `20260715141727_baseball_legacy_stats_backfill` — 0/1. `baseball_legacy_backfill_manifest`
  does not exist in production. This one is unambiguous.

## Two guesses this method corrected

Both were mine, made from filenames, before any catalog was read:

- `baseball_event_telemetry` — a migration *name*. The table is
  `baseball_workload_events`, and it exists.
- `baseball_timeline_acks` — likewise. The table is `baseball_timeline_event_acks`.

And two more the *method itself* nearly got wrong, caught only by re-querying
case-insensitively:

- All seven `ncaa_division` enum values read ABSENT because the extractor
  lowercases SQL. Production stores them uppercase (`D1`, `NAIA`, `JUCO`,
  `JUCO_D1`, `JUCO_D2`, `JUCO_D3`, `CCCAA`). They are all **present**;
  `20260825211909` is applied.
- The four avatar storage policies read ABSENT for the same reason. Production
  has them capitalised (`Avatars accessible to authenticated`, …).
  `20260730030000` is applied.

Two files would have been reported as unapplied production gaps that are not.
A case-folding bug in a classifier is indistinguishable from a missing object
unless you go and look.

## What this does NOT authorise

`supabase db push` would propose **all 42** of these, not the one migration the
owner authorised. That is the documented hard stop and it was confirmed, not
assumed. Nothing here is a reason to run it.

Nothing here should be marked applied via `migration repair` either. Repair
rewrites *history*; it does not execute SQL. Recording a migration as applied
when its objects are absent converts a visible divergence into an invisible one.
