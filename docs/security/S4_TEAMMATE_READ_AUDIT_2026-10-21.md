# S4 teammate-read audit, 2026-10-21

Scope: migration `20261017005000_golf_players_select_drop_teammate_branch`
removes the teammate branch from `golf_players_select`. After it, a player
can read only their own `golf_players` row through the table. Teammate
display data comes from `golf_player_profiles()` (migration
`20261017004000`) through `readGolfPlayerProfiles`
(`src/lib/golf/player-profiles.ts`).

## Result

Every player-reachable teammate read now goes through the helper, reads
only the caller's own row, sits behind a coach gate, or uses the admin
client. Two reads had to move to the helper, and both are fixed in the
same PR as this audit: `getTeamComparisonImpl` (`stats-data.ts`) and
`getGolfPlayerUserIdImpl` (`messages.ts`).

## Method

- Scanned `src` for every `golf_players` read: direct `.from()` calls and
  PostgREST embeds from other tables.
- 245 sites in 178 files. 89 read the caller's own row by `user_id` and
  are unaffected.
- The other 137 were reviewed one by one: which client, who can reach
  the code, and which player ids it can name.

Verdicts for the 137:

- SAFE-COACH 66: a coach gate runs before the read.
- SAFE-OWN 38: own row only, or the ids come from an own-row read.
- SAFE-ADMIN 17: the service client, so RLS does not apply.
- DEGRADES-BENIGN 13: a player now gets fewer rows. No feature is lost.
- ALREADY-HELPER 2: the helper's own RPC and fallback paths.
- MUST-MIGRATE 1: `getGolfPlayerUserId`. Fixed here.

The full per-site list is kept with the audit working files, not in the
repo. Re-run the scan before changing the policy again.

## Benign degrades

A player now sees only their own row, or a 404 in place of a 403:

- Genome and roster `[id]` page metadata: a teammate's name no longer
  appears in the title. The page body already redirects non-coaches.
- `putt-tendencies` and `generate-review` routes: 403 becomes 404 for a
  teammate's id. Both were denied before and still are.
- `rounds/[id]`: own round still embeds the player. A teammate's round
  already redirected.
- Calendar page, Clubhouse calendar and hub: the roster embed returns one
  row for a player. The result feeds coach-only UI.
- Announcement detail: a player's recipient, task and acknowledgement
  lists were already own-row through RLS on those tables.
- `conflicts.ts`: a player naming teammates now gets only themselves and
  `partial=true`. This closes a read of teammates' busy time.
- `getCoachRosterStats`: an exported action with no caller and no coach
  gate. A player calling it now gets a roster of one.

## Rollout notes

- Order: deploy the app, apply 004000, then apply 005000.
- Confirm `golf_player_profiles` exists in production before 005000. The
  helper falls back to table reads when the function is missing, and
  after 005000 that fallback is limited to the caller's own row.
- pgTAP: `supabase/tests/rls/golf_player_profiles_teammate_scope.sql`
  covers both migrations. CI builds the database from every migration.
- `calendar-events.ts` `getPlayerAvailabilityImpl` has a UI gate and a
  shared-team check, not a server role gate. After 005000 a player
  naming a teammate gets "Team member not found". That is intended.
- Follow-up, not blocking: add a coach gate to `getCoachRosterStats` or
  delete it. Skip the roster reads for players in the Clubhouse hub and
  calendar loaders.
