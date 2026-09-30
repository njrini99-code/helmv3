# P008 — Settings: wiring map

## Entry point

```text
Route:                   /golf/dashboard/settings (coach and player), ?section=
                         /golf/dashboard/settings/notifications and /golf/dashboard/settings/coaching-intelligence
                         are the old links; each hands the same route a fixed section
Page:                    src/app/golf/(dashboard)/dashboard/settings/page.tsx (isClubhouseFor -> Clubhouse, else Fairway);
                         settings/notifications/page.tsx (section notifications) and
                         settings/coaching-intelligence/layout.tsx (coach: section coachhelm; player: none) do the same
Clubhouse route adapter: src/clubhouse/routes/settings.tsx (session, team; a missing team is not an empty state, the team
                         cards just are not there; a session with neither profile renders nothing)
Server loader:           src/clubhouse/data/settings.ts loadSettings (every read in one server pass, each with its own
                         error flag; each failed read logs through chLogServer('settings', …) and never fails the page)
Screen:                  src/clubhouse/screens/settings/Settings.tsx (live container: the writes, this device's push, the
                         native flag) -> SettingsView.tsx (header, rail, the open section, the page's copy of the data)
Skeleton:                src/clubhouse/screens/settings/SettingsSkeleton.tsx (CH-8401), from settings/loading.tsx and the
                         loading files of the two old links
```

## End-to-end graph

```text
UI (SettingsView rail; AccountSection, NotificationsSection, TeamSection, GolfSection, CoachHelmSection, PreferencesSection)
↓
Action: the cards' handlers. Forms and dialogs go through useSaveAction (useAction, with the work that follows a landed save
        inside the action so the toast's Retry finishes it); switches, segments and pickers through useInstantSave; the
        CoachHelm settings through usePhilosophy's ordered queue
↓
Client controller: keepSaved (SettingsView) wraps the writes so a landed write also patches the page's copy of the data;
                   useAction and useInstantSave add the offline refusal (CH-1903), the slow notice (CH-1902), chReport,
                   the toast and the haptic
↓
Writes: createLiveWrites (screens/settings/writes.ts): direct RLS-scoped Supabase writes, Supabase Auth, and the server actions
↓
Server actions: app/actions/notification-preferences.ts, app/golf/actions/{v3/notification-prefs,coaching-philosophy,teams,insights,team-switcher}.ts,
                DELETE /api/account/delete
↓
Data: users, golf_coaches, golf_players, golf_teams, organizations, golf_team_settings, golf_team_members,
      golf_team_join_requests, golf_coach_philosophy, golf_coachhelm_settings, golf_team_coachhelm_settings,
      golf_player_notification_state, storage avatars
↓
Realtime: none
↓
Contract outcomes: CONTRACT.md (Bridge IDs 8ccii, catalog CH-8xxx)
↓
Bridge: recorded, not wired (D-68)
↓
Tests: src/clubhouse/__tests__/settings.test.tsx (the screen), settings-server.test.tsx (loader, route, addresses, loading
       files, live writes), logic.test.ts (the settings model), native.test.tsx (sign-out order)
```

## Actions

Each action's record is in `config/clubhouse/pages/P008-settings.json` (`actions`), and the whole list is readable
in `docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md`. A form save offline is refused before anything is sent (the
shell's 10703, CH-1903); a switch or CoachHelm autosave offline is refused by Settings (80701). The photo upload,
push on this device, sign out, copy and Report a problem check nothing first.

| Action | Control | Handler | Service | Data | Contracts |
| --- | --- | --- | --- | --- | --- |
| ACT-P008-OPEN-SECTION | Section rail | `show` (via `go` when dirty) | none | none | address 80102 · role 80801 · unsaved confirm 81202 |
| ACT-P008-SAVE-PROFILE | Profile › Save changes | `save.run` (`settings.saveProfile`) | `writes.saveProfile` (direct, by user id; zero rows is a failure) | golf_coaches, golf_players | name 80501, 80502 · lands 80901 · fails 80601 · read fails 80625 · refresh 81501 · keeps edits 81205 · refused 80808 · Retry 81402 |
| ACT-P008-UPLOAD-PHOTO | Profile › Add or Replace photo | `upload` | `writes.uploadAvatar` (avatars bucket, `<userId>/avatar-<time>.<ext>`) | storage avatars | refused or fails 80602 · uploading 80302 (tested in the preview only) · no photo 80404 |
| ACT-P008-CHANGE-EMAIL | Email › Send confirmation, Enter | `send.run` (`settings.changeEmail`) | `writes.changeEmail` (`auth.updateUser`) | Supabase Auth | not an address 80503, same email 80504 · lands 80901 · fails 80603 · Enter 82001 |
| ACT-P008-CHANGE-PASSWORD | Password › Update password | `change.run` (`settings.changePassword`) | `writes.changePassword` (signs in with the current password, then `auth.updateUser`) | Supabase Auth | problems 80505 to 80507 · lands 80901 · fails 80604 · needs the current one 80807 |
| ACT-P008-SET-DELIVERY | Email and push switches, quiet mode | `flip` (`useInstantSave`) | `updateNotificationPreferences` | users.notification_preferences | silent when it lands 80902 · fails 80605 · rolls back 81302 · saving 81301 · offline 80701 · Retry 81402 · quiet mode 81003 |
| ACT-P008-SET-DIGEST | Weekly team email switch (coach) | `save.run` (digest) | `writes.setDigest` → `saveCoachingPhilosophy` | golf_coach_philosophy | fails 80606 · read fails 80628 · rolls back 81302 |
| ACT-P008-TOGGLE-DEVICE-PUSH | Push on this device | `togglePush` | `usePushSubscription` | browser subscription | fails 80607 · blocked 81002 |
| ACT-P008-SET-ROUTING | CoachHelm updates switch (player) | `setCell` | `setCategoryChannel` | golf_player_notification_state | fails 80608 · read fails 80627 · quiet mode 81003 |
| ACT-P008-BULK-ROUTING | Mute push, Mute email, Reset | `bulk` | `setAllChannels` | golf_player_notification_state | reset confirm 81104 · fails 80609 |
| ACT-P008-SET-ROUTING-QUIET | CoachHelm quiet mode (player) | `save.run` (quiet) | `setQuietMode` | golf_player_notification_state | fails 80610 |
| ACT-P008-SAVE-TEAM | Team details › Save changes | `save.run` (`settings.saveTeam`) | `writes.saveTeam` (organization, then team; zero rows is a failure) | golf_teams, organizations | 80508 to 80510 · lands 80901 · fails 80611 · read fails 80629 · refresh 81501 · staff 80805 · refused 80808 |
| ACT-P008-COPY-INVITE | Copy code, Copy link, Share | `copy`, `share` | none | none | fails 80613 · success haptic 81705 |
| ACT-P008-REGENERATE-CODE | Invite players › Make a new code | `regen.run` (`settings.regenerateCode`) | `regenerateJoinCode` | golf_teams | confirm 81103 · lands 80901 · fails 80612 · read fails 80630 · Retry 81402 · own team 80806 |
| ACT-P008-SAVE-SCORING | Scoring and format › Save changes | `save.run` (`settings.saveScoring`) | `writes.saveScoring` (upsert by team) | golf_team_settings | lands 80901 · fails 80614 · read fails 80631 · kept 81204 |
| ACT-P008-SAVE-REMINDERS | Event reminders › Save changes | `save.run` (`settings.saveReminders`) | `writes.saveReminders` (upsert by team) | golf_team_settings | 80511 · lands 80901 · fails 80615 · read fails 80632 |
| ACT-P008-SAVE-GOLF | Golf details › Save changes (player) | `save.run` (`settings.saveGolf`) | `writes.saveGolf` (by player id; zero rows is a failure) | golf_players | 80512 to 80515 · lands 80901 · fails 80616 · read fails 80633 · refused 80808 |
| ACT-P008-LEAVE-TEAM | Team › Leave team (player) | `leave.run` (`settings.leaveTeam`) | `writes.leaveTeam` (deletes the player's own membership row; zero rows is a failure) | golf_team_members | confirm 81102 · lands 80901 · fails 80617 · read fails 80634 · refresh 81501 |
| ACT-P008-REQUEST-JOIN | Join a team › Ask to join, Enter (player) | `join.run` (`settings.requestJoin`) | `createTeamJoinRequest` | golf_team_join_requests | no team 80402 · lands 80901 · fails 80618 · refresh 81501 · Enter 82001 |
| ACT-P008-CANCEL-JOIN-REQUEST | Join a team › Cancel (player) | `cancel.run` (`settings.cancelRequest`) | `cancelJoinRequest` | golf_team_join_requests | waiting 80403 · lands 80901 · fails 80619 · kept 81204 |
| ACT-P008-SET-COACHHELM-COACH | CoachHelm › On your dashboards, Insights, Predictions, Patterns | `setC` (`useInstantSave`) | `writes.setCoachHelmCoach` (update, else insert) | golf_coachhelm_settings | turn-off confirm 81105 · fails 80620 · rolls back 81302 · read fails 80635 |
| ACT-P008-SET-COACHHELM-TEAM | CoachHelm › For the whole team (head coach) | `save.run` (team) | `updateTeamCoachHelmSettings` | golf_team_coachhelm_settings | head coach only 80804 · fails 80621 · rolls back 81302 |
| ACT-P008-SAVE-PHILOSOPHY | Priorities, sensitivity, sliders, alerts, delivery, windows, display | `change` (ordered queue, sliders wait 600ms) | `writes.savePhilosophy` (update, zero rows a failure; or create the row on the first save) | golf_coach_philosophy | fails 80622 · saving 80303 · waiting slider 81206 · kept 81204 · refused 80808 |
| ACT-P008-SET-ANIMATIONS | Preferences › Animations | `updatePreferences` | `useAppearancePreferences` | this device's storage | motion 81608 |
| ACT-P008-SET-HAPTICS | Preferences › Haptics (app) | `setHapticsEnabled` | `haptics-pref` | this device's storage | tick 81707 |
| ACT-P008-REPORT-PROBLEM | Help and legal › Report a problem | `report` | Sentry feedback, else mail | none | falls back to email 81001 |
| ACT-P008-SIGN-OUT | Session › Sign out | `writes.signOut` | `writes.signOut` (push teardown, active team, session) | Supabase Auth | fails 80624 |
| ACT-P008-DELETE-ACCOUNT | Session › Delete account | `del.run` (`settings.deleteAccount`) | `DELETE /api/account/delete`, then `cleanupAfterDelete` | the account and its rows | confirm 81101 · lands 80903 · fails 80623 · Retry 81402 |
| ACT-P008-RETRY-READ | A notice's Try again | `onRetry` (`router.refresh`) | none | none | reads the page again 81401 |

## Components

| Path | Purpose | States |
| --- | --- | --- |
| `screens/settings/Settings.tsx` | The live container: `createLiveWrites`, `usePushSubscription`, the native flag, `router.refresh` | 80101, 81501 |
| `screens/settings/SettingsView.tsx` | Header, rail, the open section, the unsaved-changes confirm, the page's copy of the data (`keepSaved`) | 80101, 80102, 80801, 81202, 81204, 81708 |
| `screens/settings/Account.tsx` | Profile, Email, Password, Help and legal, Session and account | 80404, 80501 to 80507, 80601 to 80604, 80623, 80624, 80625, 81001, 81101 |
| `screens/settings/Notifications.tsx` | `DeliveryCard` (email, push, quiet mode, weekly email), `RoutingCard` (CoachHelm updates) | 80605 to 80610, 80626 to 80628, 81002, 81003, 81104 |
| `screens/settings/Team.tsx` | Team details, Invite players, Scoring and format, Event reminders | 80401, 80508 to 80511, 80611 to 80615, 80629 to 80632, 81103 |
| `screens/settings/Golf.tsx` | Golf details, Team (leave) or Join a team | 80402, 80403, 80512 to 80515, 80616 to 80619, 80633, 80634, 81102 |
| `screens/settings/CoachHelm.tsx` | The team and dashboards switches, priorities, sensitivity, alerts, signal controls, windows, display | 80303, 80620 to 80622, 80635, 81105, 81206 |
| `screens/settings/Preferences.tsx` | Animations, Haptics (app) | 81608, 81707 |
| `screens/settings/parts.tsx` | `Card`, `Row`, `Field`, `SaveBar`, `ReadFailed`, `useUnsavedGuard`, `useDraft`, `useSaveAction`, `useInstantSave`, `SettingSwitch` | 80301, 80625 to 80635, 81201 to 81205, 81301, 81302, 81401, 81402 |
| `screens/settings/live.ts` | `keepSaved`: a landed write also patches the page's copy of the data | 81204 |
| `screens/settings/model.ts` | Types, `SECTIONS`, `parseSection`, the validators, labels | 80501 to 80515, 80801 |
| `screens/settings/writes.ts` | `createLiveWrites`, `afterDeleteHref`, `changed` (an update that changed no row is a failure) | 80806, 80807, 80808, 80903 |
| `screens/settings/SettingsSkeleton.tsx` | Route skeleton | 80201 |

## Hooks

| Path | Type | Used by |
| --- | --- | --- |
| `src/hooks/golf/use-push-subscription.ts` (`usePushSubscription`) | shared, not UI | Settings.tsx |
| `src/hooks/golf/use-appearance-preferences.ts` (`useAppearancePreferences`) | shared | Preferences.tsx |
| `src/lib/utils/haptics-pref.ts` | shared | Preferences.tsx |
| `src/clubhouse/lib/use-action.ts`, `haptics.ts`, `track.ts`, `reduced-motion.ts`, `motion.ts` | Clubhouse | throughout |

## Services / server actions

| Name | Path | Existing/New/Held | Purpose |
| --- | --- | --- | --- |
| getNotificationPreferences, updateNotificationPreferences | actions/notification-preferences.ts | Existing | email and push |
| setCategoryChannel, setAllChannels, setQuietMode | golf/actions/v3/notification-prefs.ts | Existing | the player's CoachHelm updates |
| saveCoachingPhilosophy, revalidateCoachingPhilosophyPaths | golf/actions/coaching-philosophy.ts | Existing | the weekly email flag, the CoachHelm cache paths |
| regenerateJoinCode, createTeamJoinRequest, cancelJoinRequest, getPlayerJoinRequests | golf/actions/teams.ts | Existing | invite code and join requests |
| getTeamCoachHelmAccess, getOrCreateTeamCoachHelmSettings, updateTeamCoachHelmSettings | golf/actions/insights.ts | Existing | the team-wide CoachHelm switch (head coach) |
| clearActiveTeam | golf/actions/team-switcher.ts | Existing | after sign out and delete |
| DELETE /api/account/delete | app/api/account/delete/route.ts | Existing | delete the signed-in user's account |
| Direct client writes | screens/settings/writes.ts | Existing | golf_coaches, golf_players, golf_team_settings, golf_teams, organizations, golf_team_members, golf_coachhelm_settings, golf_coach_philosophy, avatars, Supabase Auth |

## Data resources

### DATA-SETTINGS

```text
Tables:   users, golf_coaches, golf_players, golf_teams, organizations, golf_team_settings, golf_team_members,
          golf_team_join_requests, golf_coach_philosophy, golf_coachhelm_settings, golf_team_coachhelm_settings,
          golf_player_notification_state
RPCs:     golf_my_join_requests and golf_team_by_join_code, inside getPlayerJoinRequests and createTeamJoinRequest
Storage:  avatars (public URL; the path starts with the user's folder)
Realtime: none
Cache:    none on the server; the page keeps its own copy of the data (81204) and a fresh read replaces it
RLS:      own rows for profile and golf details; any staff coach for the team and its settings; any coach of the
          organization for the organization; a player can delete their own team membership; the head coach only for
          the team CoachHelm row (the action checks). Read from the repo's migrations, not checked against the live database.
Read path:  the server loader (RLS-scoped client, no service role)
Write path: the writes above; forms save on Save changes, switches save on change
```

## Held dependencies

None. `status.data` is existing and the manifest lists no held plan.

## Impact notes

- The server actions are shared with Fairway's Settings; a change to one changes both UIs.
- A new card must use `useSaveAction` (or `useInstantSave`) so its landing work runs on Retry, and a new write that
  changes a value a card shows needs a patch in `keepSaved`, or the section shows the old value on return (81204).
- `golf_coach_philosophy` has one row per coach (unique on coach_id): the first CoachHelm save creates it and its id
  must be kept (81204), or the next save fails.
- The loader reads `golf_coach_philosophy` twice and `golf_teams` twice; the reads run in parallel and are not merged.
- Unsaved edits are guarded by `DirtyContext`: a card that holds edits must call `useReportDirty`.
