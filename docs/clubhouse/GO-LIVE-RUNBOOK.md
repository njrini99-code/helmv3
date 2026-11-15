# Clubhouse redesign: go-live runbook

Nothing here has been run on production. Every step needs the owner's word in
the conversation: production migrations, flags and deploys are all off limits
until then. Not yet rehearsed end to end: stage 4 of
`PRODUCTION-PLAN-2026-11-05.md` needs a preview deploy first.

## Before you start

| Check | Command or place | Must show |
| --- | --- | --- |
| The PR is merged | `npm run pr:status -- 2483` | Merged, checks green |
| Production state | `npm run release:status` | Note the live SHA |
| Held rows | `supabase/migrations/HELD.md` | The 22 rows below are unapplied |
| Backup | Supabase dashboard, Database, Backups | Recent backup or PITR on |
| Time | Calendar | No live qualifier or round in progress |

Record the PITR marker that `db:apply` prints. Keep the previous deployment's
URL for the rollback.

## Step 1: migrations, in this order

Apply one file at a time with `npm run db:apply -- <file>`. It runs each file's
VERIFY block and stops on the first FAIL. Update the file's `HELD.md` row after
each one. A FAIL means stop and read it. Do not go on to the next file.

### Group A: owner approved 31 Oct, fixes for what is live

| # | File (`supabase/migrations/`) | Watch for |
| --- | --- | --- |
| 1 | `20261031134708_submit_round_open_completed_qualifier.sql` | Live RPC |
| 2 | `20261031140000_golf_rounds_tee_id_backfill.sql` | Changes rows |
| 3 | `20261031141000_golf_round_discards.sql` | New trigger on `golf_rounds` |
| 4 | `20261031142000_golf_events_class_rows_private.sql` | Live RLS policy |
| 5 | `20261105090000_golf_player_hub_events_class_rows.sql` | Needs 4 first |

File 5 is new since the 31 Oct approval, so it needs its own approval. Without
it the class rows stay readable through the hub RPC.

### Group B: the 17 redesign migrations

All 17 are applied on staging, and all are still HOLD for production.

| # | File | Watch for |
| --- | --- | --- |
| 6 | `20261026010000_golf_practice_plans.sql` | New tables |
| 7 | `20261026010100_golf_team_drills.sql` | New tables |
| 8 | `20261026010200_golf_practice_groups.sql` | New tables, definer function |
| 9 | `20261026010300_golf_practice_templates.sql` | New tables |
| 10 | `20261026010400_golf_documents_practice_plan.sql` | **Live table** |
| 11 | `20261026010500_golf_practice_plan_save.sql` | Definer function |
| 12 | `20261026010600_golf_practice_plan_publish.sql` | Definer functions |
| 13 | `20261026010700_golf_practice_plans_realtime.sql` | Realtime |
| 14 | `20261026010800_golf_practice_makeups.sql` | New |
| 15 | `20261026090300_golf_documents_plan_folder_check.sql` | **Live table** |
| 16 | `20261031150000_golf_conversation_pins.sql` | New table |
| 17 | `20261101090000_coachhelm_action_runs_hold.sql` | Live table |
| 18 | `20261101090100_coachhelm_ask_tone_and_facts.sql` | Additive |
| 19 | `20261101090200_coachhelm_player_ask_conversations.sql` | Additive |
| 20 | `20261101090300_coachhelm_ask_allowance.sql` | Additive |
| 21 | `20261102090000_golf_practice_plan_formats.sql` | New table |
| 22 | `20261104090000_golf_practice_plan_coach_why_and_draft_row.sql` | |

After the last one, run:

```bash
npm run db:types
```

Diff `src/lib/types/database.ts`. Any change goes in with its own PR.

**Rollback:** each file's `-- ROLLBACK:` block or `supabase/rollbacks/` file. A
rollback is a forward change, so check that nothing now depends on the file.

## Step 2: deploy, flags still off

Deploy from the linked checkout on the merged `main`, with the command in
`AGENTS.md` under "Production". Then:

```bash
npm run release:status -- --strict
```

It must show the merged SHA. This also ships the 127 unreleased commits already
on `main`, so read that list first.

Smoke test, flags off, on a test account: sign in as coach and player; open
Home, Roster, Calendar, Messages and Stats; save one round. Check Sentry for new
errors.

**Rollback:** `./node_modules/.bin/vercel promote <previous-url>`, then
`release:status`. This doesn't undo migrations, and doesn't need to: they are
additive and the old code ignores them.

## Step 3: turn on the 13 flags, together

Set all of these on in `config/feature-flags.yml` for production. Scoring
averages disagree between screens if only some are on, so flip them in one
change:

- `clubhouse_refresh_v1`
- `clubhouse_classes_roster_home_v1`
- `clubhouse_stats_redesign_v1`
- `golf_messages_redesign_v1`
- `golf_documents_library`

Run `npm run flags:generate`, then `npm run flags:check`, and ship through a PR
and a deploy as in step 2. `npm run release:status -- --strict` must show it.

**Rollback:** set the 13 back off and redeploy. It's the fastest full undo, and
user data stays where it is. Practice plans and Ask chats saved while the flags
were on stay in the database, hidden until the flags return.

## Step 4: check it live

On test accounts, coach and player, on an iPhone in Safari and in the app:

| Check | Pass |
| --- | --- |
| Coach Home, Roster, Stats, Messages, Team Board | Real numbers, no errors |
| Roster averages against Stats | Same figure for the same player |
| Player sees a teammate's classes | No, on Calendar or Home |
| Player Ask | Answers, and shows no coach-only read or guess |
| Ask write, then Undo inside 8 seconds | Nothing is saved |
| Practice plan: draft, publish, take down | Player sees it while published |
| Messages: pin on phone, check desktop | Pin syncs |
| Page switches, sheets, Stats filter | Smooth on the iPhone |
| Sentry, 30 minutes | No new errors |

Any failure on a privacy line means rolling the flags back straight away.
