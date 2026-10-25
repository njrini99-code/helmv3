# HELD DATA PLAN — Live rounds, push

```text
Plan ID: HD-live-rounds-realtime
Status: HELD
Pages: Live rounds (P016): the live view, Home's Live now card, the qualifier page
Feature: golf_round_lifecycle (memory/registry.yml)
Migration: supabase/migrations/20261025050100_golf_round_live_realtime.sql
Date: 2026-10-25
```

## Requirement

A birdie should reach a coach's screen within about two seconds. With the live table applied the screens poll every
20 seconds; this turns on push from the database over private Realtime topics.

## Current schema

After `20261025050000`: `helm_private.golf_live_broadcast` is a no-op. No policy on `realtime.messages` for these topics.

## Proposed schema

Replace the broadcaster with `realtime.send` on `golf-live:coach:<team>` and `golf-live:team:<team>` (private), add
`golf_live_topic_allowed(topic)` and the SELECT policy `golf_live_receive` on `realtime.messages` (broadcast only).

## Tables / columns

None. One function body, one function, one policy.

## Relationships

None new.

## RLS / permissions

Joining the coach topic needs `is_golf_team_coach`; the team topic needs `is_golf_team_player` and not being on the
course (four hours). Authorisation is checked at join, not per message, so a client leaves the team topic when its own
round starts. No INSERT policy: clients never send on these topics.

## Indexes

None.

## Backfill

None.

## Compatibility

Fails fast on a database without `realtime.send` (a local stack without Realtime). Policies are OR'ed, so 4.33's
`tour:` policies are unaffected. The policy is not in `supabase/schemas` (no realtime schema in `schema_paths`).

## Privacy / sensitive data

PRECONDITION: before production, confirm a public (non-private) subscriber on the same topic receives nothing. The
project cannot switch to private-only channels (18 public `.channel(` uses on main).

## Rollback concept

In the file header: drop the policy, restore the no-op body, drop the topic function.

## UI behavior while held

The hook polls the live table every 20 seconds (or the v0 poll before migration 1). The channel code is not
turned on without the policy.

## SQL preparation status

WRITTEN — HOLD — NOT APPLIED. Applied on a scratch Postgres with a stand-in `realtime` schema: its three VERIFY lines
pass and the topic checks in `golf_round_live.sql` (test 15) pass. Not run against Supabase Realtime.

## HELD.md registration

Row `20261025050100_golf_round_live_realtime.sql`, **HOLD**.

## Activation checklist

- [ ] Apply `20261025050000` first.
- [ ] Run the public-subscriber precondition check.
- [ ] `npm run db:apply -- supabase/migrations/20261025050100_golf_round_live_realtime.sql` (owner).
- [ ] Join a coach topic as a coach and see a lane arrive; join as a player on the course and see none.
