# Clubhouse views that write when opened

Read from the code on `origin/main` 9e7c86bfd9 and re-checked line by line
against it. Update a row whenever its loader changes. The audit tooling
(`.claude/skills/helm-tools/SKILL.md` §3) points here.

**What this means for an audit:**

- On staging, all of these are allowed.
- Log each one and check the rows after the run (§5).
- Never open any of them against production.

## Read this first: prefetch writes before you open a page

In production builds, `src/clubhouse/shell/use-prefetch-tabs.ts:50-55`
(`fetchAhead`) prefetches every tab. When the browser is idle it also sweeps the
other sections (Roster, Settings, …). `/golf/dashboard/coachhelm` and, since
15 Nov 2026, `/golf/dashboard/team-hub` are left out
(`src/clubhouse/lib/prefetch-guard.ts`; prod audit PMAC-01).
`src/clubhouse/lib/__tests__/prefetch-exposure.test.ts` walks every nav page's
code to the insight-delivery functions that record exposure and fails when one
that records is not left out.

So a page that writes while it renders on the server can write before the
auditor ever opens it. Row 3 is exposed to this; row 2 was until 15 Nov.

**Rule:** count prefetch writes as page writes. The run's write log starts when
the first page loads, not when a page is opened on purpose.

## 1. Paid AI call on open (the one to watch)

| View | What happens | Where | When |
| --- | --- | --- | --- |
| **Round review** | Calls Claude through `compose()`, with a possible retry. Writes `golf_rounds.ai_recap`, `golf_round_recap_provenance` and `golf_coachhelm_llm_calls`. | `src/clubhouse/screens/rounds/RoundReview.tsx:505` (`useRoundRecap`) → `src/clubhouse/screens/rounds/use-round-recap.ts` → `generateRoundRecap` (`src/app/golf/actions/round-recap.ts:509`) | The round is complete, not a test round, and has no recap yet (`src/clubhouse/data/round-review-shape.ts:336`). The viewer is a coach, or a player with the debrief flag off (`src/clubhouse/data/round-debrief.ts:84`). Within the rate limit and the team budget. |

**Audit rule:**

- Open round reviews only for rounds that already have a recap.
- Or count the calls and their cost against the staging team's budget, and say
  so in the run log.
- A round review opened twice costs nothing the second time.

CoachHelm Ask and quick chat make **no** AI call on open. `?q=` only fills in
the box.

## 2. Database writes on open

| # | View | Table written | Where | Notes |
| --- | --- | --- | --- | --- |
| 1 | CoachHelm (team board, player file, Your week, deep dive, standing) | `golf_insight_exposure` insert | `src/lib/coachhelm/v3/effectiveness/event-ledger.ts:193,244`, via `recordExposureForReturned` (`src/app/golf/actions/insight-delivery.ts:280`). Called from `src/clubhouse/data/coachhelm-team.ts:159`, `coachhelm-file.ts:48`, `coachhelm-dive.ts:176`, `coachhelm-player.ts:176,221` (`insight-delivery.ts:926`) | At most once per insight, coach and surface per UTC day. Uses the admin client. |
| 2 | Team Hub, player view | `golf_insight_exposure` (`hub_signal`) | `src/clubhouse/data/hub.ts:368` → `src/app/golf/actions/player-hub-data.ts:138` → `insight-delivery.ts:441/501` | Not prefetched since 15 Nov 2026 (PMAC-01): it writes only when Team Hub is opened. Rows written before that include prefetches nobody saw; causality runs leave every `hub_signal` row out (`src/lib/coachhelm/v3/causality/exposure-scope.ts`). Recording from the client once the card has been on screen is the follow-up; what to do with the old rows is Nick's call. |
| 3 | Settings, head coach | `golf_team_coachhelm_settings` insert if missing | `src/clubhouse/data/settings.ts:255` → `src/app/golf/actions/insights-coachhelm.ts:1180` | Prefetched. Only once per team. |
| 4 | Messages, opening a thread | `golf_conversation_participants.last_read_at`, `mark_golf_messages_read` RPC | `src/hooks/golf/use-golf-messages.ts:860` (and `:952` when a new message arrives while the tab is visible) → `src/app/actions/messages.ts` about 677–730 | Not fired for the thread desktop opens by itself (`deferMarkRead`, `src/clubhouse/screens/messages/Messages.tsx:160`). A deep link with `?conv=` does fire it. |
| 5 | Messages, one-time pin import | `golf_pin_conversation` RPC | `src/clubhouse/screens/messages/use-conversation-pins.ts:86` | Only if the browser has old pins in localStorage. A clean audit browser won't fire it. |
| 6 | Team Hub, Travel tab, player | `golf_player_notification_state.last_travel_seen_at` upsert | `src/clubhouse/screens/hub/TeamHub.tsx:353` → `src/app/golf/actions/player-notifications.ts:416` | Once per visit. |
| 7 | Practice plan, player | `golf_practice_plan_opens` upsert (`golf_practice_plan_record_open`) | `src/clubhouse/screens/coachhelm/plan/PlanPageActions.tsx:33`, `src/clubhouse/screens/coachhelm/plan/player/PlayerPractice.tsx:48` | Does nothing for coaches. |
| 8 | Round review | See section 1 | | |
| 9 | Continue round | `golf_rounds` through `/api/golf/rounds/partial-save` | `src/lib/golf/round-session/use-continue-round-session.ts` about 686–781 (beacon `:762`, listener `:781`) | Fires on every `visibilitychange: hidden` or `pagehide`, with no "anything changed" check. So switching tabs writes. New round's partial save does this only while tracking (`src/lib/golf/round-session/use-new-round-session.ts:713`), but see row 15. |
| 10 | Every Clubhouse page | Queued offline rounds, holes, shots | `src/clubhouse/shell/OfflineSync.tsx` → `src/lib/offline/sync-engine.ts:242` | Only if the browser's IndexedDB queue has something in it. Empty in a fresh audit browser. |
| 11 | Onboarding with `?code=` | Sign-up cookie and a rate-limit counter | `src/clubhouse/screens/onboard/Onboard.tsx:127`, `src/clubhouse/screens/onboard/Steps.tsx:280` → `src/lib/golf/signup-gate.ts:263` | Don't open onboarding with a code. |
| 12 | Retired with Fairway (#2527, 15 Nov 2026) | Nothing now | The `users.last_seen` heartbeat (`src/hooks/use-presence.ts`, `public.heartbeat()`) was mounted only by `FairwayDashboardShell.tsx`, which #2527 deleted; no Clubhouse code calls it | Not a write any more. A finding, not a safety note: `last_seen` stops moving, so Welcome's "last here" and anything reading `last_seen` go stale (re-checked on `db3a99ee1`). |
| 13 | Any page, on error | `error_logs`, `admin_events`; `/api/internal/log-auth-failure` | `logServerError`, `chLogServer`, `logBestEffortMiss`; `src/proxy.ts:148` | Only when a read or sign-in fails. A row here is itself a finding. Off production, `/api/admin/log-event` answers `persisted: false` and writes nothing. |
| 14 | Signing in (any role, password or magic link, and the demo entry) | Supabase Auth session and refresh-token rows, `auth.users.last_sign_in_at`, the auth audit log; a login event with IP, user agent and place (`logLogin`); login-attempt counters reset; a demo coach sign-in also sends a server analytics event with the IP | Supabase Auth; `src/app/golf/actions/auth.ts` (`loginActionImpl`, `logLogin`, `resetLoginAttempts`, `captureServer`) | Added 15 Nov 2026 (UI tooling audit). A signed-in check writes before its first page opens, which is why production checks stay logged out (`scripts/clubhouse/audit/prod-public.mjs`) and suites that sign in refuse production (`scripts/lib/production-site-guard.mjs`). |
| 15 | New round, setup (player, live sharing offered) | `golf_round_live_set_next_share` RPC, or a `golf_round_live_prefs` upsert | `src/clubhouse/screens/rounds/setup/LiveShareField.tsx:49-56` → `setNextLiveShare` (`src/app/golf/actions/round-live.ts:123`) | Added 15 Nov 2026 (prod audit PMAC-04). Fires once the share field has the player's saved level, on first show, before any tap, and again on each change. Whether opening setup may write at all is Nick's call; the recommended answer is no, sending the share level with the start-round payload instead. |

## 3. Background POSTs that only read

These show up as POST requests but don't write. Don't log them as writes:

- **New round** setup: `getPlayerQualifiers`, `getPlayerSavedCourses`,
  `getRecentCoursesForPlayer`, `loadSetupQualifiers`,
  `getNextQualifierRoundNumber`.
- **Badges:** `getNotificationBadgeBundle`, every 45 seconds.
- **Continue round:** `checkRoundStaleness`.
- **Bell:** `getUnifiedNotifications`. Marking read happens only on a tap or
  swipe.
- **Push prompt:** `shouldShowPushSoftAsk`.

## 4. Checked and read-only

- Loaders for Home, Calendar, Roster, Stats, Rounds, Tournaments, Recruiting,
  Qualifiers and Classes.
- `whats-new.ts` and `welcome.ts`.
- The Ask chat loader and the Monday brief.
- Opening the practice builder (autosave fires only on a change).
- Not database writes: change marks (a cookie), the typing indicator (Realtime
  broadcast), PostHog page views.

## 5. End-of-run check (staging SQL)

After the run, count the rows written since the run started, by demo coach and
player, in each table above:

- `golf_insight_exposure`
- `golf_conversation_participants`
- `golf_player_notification_state`
- `golf_practice_plan_opens`
- `golf_rounds` (updated_at)
- `golf_coachhelm_llm_calls`
- `golf_team_coachhelm_settings`
- `error_logs`

Then:

- Put the counts in the run log.
- Any table not on this list that changed is a finding.
- Any new `error_logs` row is a finding.
