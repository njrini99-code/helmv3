# Wiring report: classes-roster-home (4 Nov 2026)

Checked against helmv3 main 03d9087 (read only). Written: `## Wiring, 4 Nov 2026` at the end of 06 (tables W.1 to W.5) and 08 (W-CRH-1 to W-CRH-28), pointer lines under both H1s, fixes in place marked "(fixed 4 Nov wiring: ...)".

## 1. Gaps by kind (each now wired as an engineering rule in 06)

- **Data: 6.** Practice rounds count today, because `loadSeasonRounds` filters none. The fix is a new shared `countsForScoring(r)` in `data/season.ts`, applied in `loadRoster` and `loadCoachHome` under `crh`; Latest rounds keeps every round. Home has no year map, so `yearById` is built from the roster read Home already makes (`data/home.ts:331`). `invitees` and `inviteeIds` are not aligned (757 vs 781), so years are drawn only when the lengths match. Classes and Roster carry no `clock`. The no-term and after-end states can't occur on real data (`inferTermForImport` always returns a term; `loadClasses` throws without one), so they are fixture guards only. The shell has no `crh` field.
- **Actions: 4.** First, requests.elsewhere: when the action answers exactly "This request has already been processed" (`teams.ts:1284`, 1508), keep the row hidden, show no toast and call `router.refresh()`. Second, a new `useDeepLinkSheet` (`shell/use-deep-link-sheet.ts`) does replaceState then pushState. Third, queue-failed gets a Try again that refreshes the route (`CoachQueue.tsx` has none). Fourth, Classes and Roster call `useHomeDayRollover`. `setIntent` has no server length cap; the client cap is the only one.
- **Privacy: 0.** The filters are named: `routes/roster.tsx:16` to 17 sends a player to `loadPlayerRoster`, which selects no figures, and Home's player path is counts only (`home.ts:763` to 774). `yearById` must not go on `ChPlayerHome`.
- **Notifications: 0 added.** One citation was wrong (below). Join rows are bell rows only and send no push.
- **Flags: 2.** `isFlagEnabled` is server only, so the flag reaches the client through `ChShellData.crh` (`data/shell.ts:34`, beside `classAwareness` at 266) and the routes' props. The Home route is `dashboard/page.tsx:206` to 213, not under `routes/`.
- **Handoffs: 0 gaps.** One shared helper each: `countsForScoring` (shared with stats-home), `messagesPrefillHref` (`screens/messages/prefill.ts:49`), `coachHelmPlayerHref` (`ui/PlayerPeek.tsx:32`), and `data-ch-hero-flat` (set by stats-home).

## 2. Moved citations fixed

- `ui/PlayerPeek.tsx:31` corrected to `:48` (two places in 05).
- `screens/roster/writes.ts` does not exist. Classes writes are `screens/classes/writes.ts:145` and `class-status-writes.ts`; Roster's writes are server actions (`actions/teams.ts`, `roster.ts`, `team-management.ts`). Fixed in 02 §1.
- The Join approved bell row stores `/golf/dashboard` (`teams.ts:1408`) and a decline stores `/golf/dashboard/settings` (1541). Fixed in 05.
- CP-02.1 and CP-02.2 now name the Home route and desktop Home files; the bell opens rows at `shell/Bell.tsx:385` to 387.

## 3. New held migrations

None. Every figure comes from an existing loader, and every write uses an existing action and policy.

## 4. Product calls for Nick

None needed. Calls I made, all reversible in one line:
- requests.elsewhere is silent (no toast).
- The practice cut is gated per lane flag.
- Home year coins fall back to name-only coins when the invitee arrays don't line up.

## 5. Exact text for shared files (lead to apply)

START_HERE shared values, new row:

> Practice rounds: one helper `countsForScoring(r)` in `src/clubhouse/data/season.ts`, true when `round_type` is null or `roundTypeFromDb(round_type) !== 'practice'`. Roster, Home and Stats loaders call it under their lane flags. Latest rounds lists every round; Stats' pressure gap and by-type row keep the uncut window.

START_HERE §4 build order note:

> While only one of `clubhouse_classes_roster_home_v1` and `clubhouse_stats_redesign_v1` is on, the same player's average can differ between Roster or Home and My stats. Turn both on together, or accept the gap during rollout.
