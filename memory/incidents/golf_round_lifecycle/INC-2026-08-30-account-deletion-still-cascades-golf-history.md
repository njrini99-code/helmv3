# INC-2026-08-30 — the golf-history cascade fix is committed but not applied

- Feature: `golf_round_lifecycle`
- Status: OPEN — repair exists in the repository and is NOT live in production
- Risk: R4 — irreversible destruction of user data on a single settings click;
  the fix is a schema change to a shared production database and needs
  explicit owner authorization to apply
- First seen: 2026-08-30, while classifying the permanently-red
  `Supabase Preview` check (that check was telling the truth)

<!-- schema-drift-absent:
    golf_player_anonymize_on_unlink, golf_players_user_id_fkey,
    anonymized_at, golf_players_anonymized_at_idx, baseball_timeline_acks,
    baseball_event_telemetry, golf_players_anonymize_on_unlink
-->

<!-- The names above are declared to docs:schema-drift as documented BECAUSE
     they are absent. golf_player_anonymize_on_unlink and the SET NULL form of
     golf_players_user_id_fkey are the missing repair. baseball_timeline_acks
     and baseball_event_telemetry are named in the "what was NOT checked"
     section as two guesses this session got WRONG — the real objects are
     baseball_timeline_event_acks and (for the telemetry migration) columns on
     baseball_pitch_events. Recording a wrong guess is the point of that
     section; deleting the names would delete the correction. -->

## What is wrong

`supabase/migrations/20260819200000_preserve_golf_history_on_account_deletion.sql`
is committed on `main`. Its own header records the owner decision of 2026-08-18
— *"There should be no deletion of golf shot history"* — and measured then that
**93 of 94 players** pass the delete route's pre-flight and reach the cascade.
That ratio is 2026-08-18's measurement and has NOT been re-measured here.

It is not applied. Verified read-only against production
(`qmnssrrolpinvwjjnufo`) on 2026-08-30:

| What the migration does | Production, today |
| --- | --- |
| makes `golf_players.user_id` nullable | still `NOT NULL` |
| FK to `users` becomes `ON DELETE SET NULL` | still `ON DELETE CASCADE` |
| adds `golf_player_anonymize_on_unlink()` | no `%anonymize%` function |

```text
golf_players_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
```

The route was then read as it stands today rather than trusted from that
migration's header — eleven days and many merges separate the two, and a
stopgap block could have landed in between. It did not:

- `src/app/api/account/delete/route.ts:150` — `USER_BLOCKING_TABLES` is still
  exactly `golf_goals.created_by_user_id`,
  `golf_qualifier_selections.selected_by_user_id` and
  `golf_travel_expenses.created_by`. Nothing blocks on `golf_rounds` or
  `golf_shots`.
- `src/app/api/account/delete/route.ts:308` — the route still ends in
  `admin.from('users').delete().eq('id', user.id)`, a service-role delete.
- The file names `golf_rounds`, `golf_shots` and `golf_players` **nowhere**, so
  no preservation or detach step was added on the application side either.

So the cascade below that delete still destroys the player's `golf_rounds`,
`golf_holes`, `golf_shots`, `golf_round_reviews` and `golf_round_stats_cache`.
Irreversibly, with no export and no grace period.

## Why nobody noticed

The migration's own header describes a version-stamp collision it was restamped
to avoid, and ends: *"A P0 that reports itself as applied is worse than one that
reports itself as missing."* That is what happened, by a different route —
`supabase_migrations.schema_migrations` records **846** versions against **337**
tracked migration files, so the ledger and the directory have long since stopped
being comparable by eye.

**Correction, 2026-08-30.** An earlier revision of this paragraph said the one
automated check that compares them, `Supabase Preview`, "has been red on every
`main` commit for so long that it reads as background noise." That is wrong, and
the truth is worse. Measured across eight PRs (#1679, #1680, #1686–#1691), the
check's conclusion is **`SKIPPED` every time** — never `FAILURE`. It is also
**not** among `main`'s six required contexts, so it could not block a merge even
if it did fail. A check that never runs is invisible in a way a red one is not.

Why it skips is legitimate: Supabase only builds a preview branch for a PR that
touches `supabase/migrations/**`. Most PRs do not. Branching itself **is**
enabled and does work — PR #1681 touches migrations, and its preview branch
reached `FUNCTIONS_DEPLOYED`.

What is genuinely unaddressed sits one level down. The Supabase branch record for
`main` carries status **`MIGRATIONS_FAILED`**, with `created_at` and `updated_at`
both `2026-07-03T21:11:11Z` — so it has not been refreshed since it was written.
Whether that is a live verdict on today's migrations or a stale record from
branching setup is NOT established here; both readings fit the timestamps, and
saying which would be a guess.

This matters for `Supabase Preview`'s disposition: it is **inert, not failing**.
Making it "green" is not the task — deciding whether an inert check should be
required, repaired, or removed is.

## Blast radius, measured

Read-only against production, 2026-08-30:

```text
golf_players    104     of which 104 have a linked user_id
golf_rounds     521
golf_shots   36,943
golf_holes    9,162
```

All 104 are exposed: `user_id` is `NOT NULL`, so every golf player currently has
an account whose deletion cascades. The migration header's 2026-08-18 baseline
(349 rounds / 24,526 shots / 6,192 holes) noted these counts "may only ever
increase". They have. Nothing has been lost yet — but the exposure has grown by
roughly half again since the fix was written.

## Application compatibility — audited, and patched ahead of the migration

The migration's header warns that the route and the schema must deploy in
LOCKSTEP. For the application half that turns out not to be necessary, which
removes the riskiest part of the operation.

The generated types are built from production, where `user_id` is still
`NOT NULL`, so `tsc` cannot see the change. To get the real breakage list a
disposable copy of the `golf_players` `Row`/`Insert`/`Update` types was edited
to make `user_id` nullable, `npm run typecheck` was run, and the errors taken as
the complete compile-visible set. The file was then restored and verified
byte-identical by sha256.

**Four errors, all one shape** — a `golf_players` -> `users` notification
fan-out putting `user_id` straight into an `in` list:

```text
src/app/golf/actions/announcements.ts:473
src/app/golf/actions/golf.ts:3723
src/app/golf/actions/tasks.ts:398
src/lib/coachhelm/v3/qualifying/player-notify.ts:52
```

They are stragglers, not a new problem: `golf.ts` already applies exactly this
filter in three other fan-outs (2869, 3459, 4793). Fixed to match, and shipped
*before* the migration — the filter is a no-op while the column is `NOT NULL`,
which is precisely what decouples the code deploy from the schema change.

Four further findings, none of which needed a change:

- **No code path anywhere sets `golf_players.user_id` to null.** Verified across
  `src/` and `supabase/`. The trigger fires on
  `old.user_id is not null and new.user_id is null`, so it is reachable ONLY
  through the FK's `ON DELETE SET NULL`. No ordinary write can trip the
  anonymisation by accident. This was worth checking before the apply and not
  after: had such a path existed, applying the migration would have silently
  destroyed a live player's name, email, phone and GPA on a write nobody
  thought of as a deletion.
- **Every column the trigger nulls is already nullable** — `first_name`,
  `last_name`, `email`, `phone`, `avatar_url`, `hometown`, `state`,
  `high_school_name`, `graduation_year`, `gpa`. No rendering path changes.
- **The two `user_id` consumers `tsc` did not flag are ownership checks** —
  `round-drafts.ts:690` and `api/golf/rounds/generate-review/route.ts:75`. Both
  compare with `!==` / `===` against `user.id`, so a null denies. Fail-closed.
- **Roster removal does not touch this.** `removePlayerFromTeamImpl` deletes the
  `golf_team_members` row only; it never writes `golf_players`.

### One consequence that is a product decision, not a compile break

An anonymised player keeps its `golf_team_members` row, and no query anywhere
filters on `user_id IS NULL` or reads `anonymized_at` (there are no `src/**`
references to that column at all). So after the migration, a player whose
account is deleted stays on the active roster with a blank name.

That is the intended trade — history is preserved, and the row must survive for
the rounds to survive — but *showing* them as an active teammate is a separate
choice from *keeping* them. It is recorded here rather than decided, because
picking a roster semantic is not a compatibility fix.

## What was checked, and what was not

Checked: the three objects above, individually, against the live catalog rather
than against the migration file — the G8 rule. And the delete route as it is
today, rather than as its migration's header described it in August, which is
the same rule pointed at code instead of schema.

Also now checked, and no longer an open question: **all 42 repo migrations with
no production ledger row are classified** in
`docs/reports/MIGRATION_REPO_PROD_CLASSIFICATION_2026-08-30.md`, by extracting
each file's declared objects and querying the live catalog. 22 are applied, 5
partial, 2 unapplied, 11 UNKNOWN by construction (GRANT/REVOKE and data
backfills leave no catalog object to look for), 2 self-declared no-ops. **This
migration is the only golf-facing one with genuinely missing effects.**

That classification also corrected two guesses this session made from filenames
(`baseball_event_telemetry` is a migration name, not a table; the table is
`baseball_timeline_event_acks`, not `baseball_timeline_acks`) and two more the
method itself nearly got wrong through case-folding — the `ncaa_division` enum
values and the avatar storage policies both read ABSENT until re-queried
case-insensitively, and both are present.

## The apply route is NOT `db push`

`supabase db push --dry-run` is covered by the `permissions.deny` prefix rule
and was not attempted. The non-denied equivalent, `supabase migration list
--linked`, answers the same question: **`db push` would propose 42 migrations**,
not the one the owner authorised.

That is the documented hard stop, confirmed rather than assumed. Whatever route
applies this migration must apply exactly this migration.

`migration repair` is not that route either. Repair rewrites *history*; it does
not execute SQL. Marking this version applied while its four objects are absent
would convert a visible P0 into an invisible one.

## What closes this

The migration is applied to production under explicit owner authorization, and
then re-verified against the live catalog:

```text
golf_players.user_id      attnotnull = false
golf_players_user_id_fkey confdeltype = 'n'   (SET NULL, currently 'c')
golf_player_anonymize_on_unlink()             exists
golf_players_anonymize_on_unlink              trigger exists
supabase_migrations.schema_migrations         records 20260819200000
```

### The decision needed is WHICH MECHANISM, not just "may I"

Authorization alone does not unblock this, because as of 2026-08-30 no apply
route is actually available:

- **`supabase db push` / `migration up`** — denied by `permissions.deny`,
  four spellings each.
- **`mcp__supabase__apply_migration`** — the owner's explicit grant, but that
  server exposes only `authenticate` in this session; OAuth is incomplete.
- **The same, after OAuth** — its grant requests `:read` scopes ONLY.
  `SUPABASE_MIGRATION_GRANT_VS_READ_SCOPES` is open precisely because
  `apply_migration` may not function as granted.
- **`mcp__claude_ai_Supabase__apply_migration`** — removed during the
  convergence run.
- **Direct DB credentials** — reaches production, but applying raw SQL and then
  treating the migration as in sync is explicitly out of bounds.

So completing the Supabase OAuth flow is a **prerequisite** for this, not
parallel work — and completing it may still not produce a usable route. The
owner's real decision is which mechanism this migration travels through. That
cannot be answered from inside this session, and a plain "yes, apply it" would
not be actionable.

Not attempted from this session: `supabase db push` and `migration up` are
denied by `permissions.deny`, deliberately, and a production schema change is
not something an agent should authorize for itself.

## The one route left for the local exercise

Docker is down (below), which removes `npx supabase start`. But a **Supabase
preview branch is not production** — it is an isolated ephemeral project built
from this repo's migrations, and it is the environment the plan's "do not use
production for destructive behavioral tests" rule points toward.

Branching is enabled and demonstrably works: #1681's preview branch reached
`FUNCTIONS_DEPLOYED` today. A PR that touches `supabase/migrations/**` gets one
automatically.

Not done from here, deliberately: creating a preview branch provisions a real
project on the owner's Supabase account, and this session neither has that grant
nor should assume it. Recorded as the recommended route for exercising this
migration if Docker stays down, not taken.

## Blocked, and why

The plan's local exercise of this migration could not be run. Docker Desktop is
installed and was launched, but the daemon did not come up within the session
(a bounded probe timed out repeatedly; two installs are present,
`/Applications/Docker.app` and `/Applications/Docker 2.app`). `npx supabase
start` therefore cannot run, and with 19 GiB free against a 12 GiB reserve the
image pull would be tight even once it does.

Stated rather than skipped: the migration has NOT been exercised against a local
stack, and that step remains outstanding before the production apply.
