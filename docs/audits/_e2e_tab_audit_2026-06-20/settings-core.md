## Settings + Notifications [both]

Audited 2026-06-20. Scope: `/golf/dashboard/settings` (general hub, coach + player) and
`/golf/dashboard/settings/notifications` (per-category matrix). Both the legacy components
and the **live Fairway redesign fork** were traced, because `NEXT_PUBLIC_REDESIGN=true`
(`.env.local:45`; redesign is LIVE in prod per project memory) so the Fairway components
are what users actually see.

---

### End-to-end wiring (actual)

**Route fork.** `src/app/golf/(dashboard)/dashboard/settings/page.tsx:98` calls `useRedesign()`;
flag-on returns `<FairwaySettingsGeneral/>` (`src/components/fairway/pages/settings/FairwaySettingsGeneral.tsx`),
flag-off returns `LegacyGolfSettingsPage` (same file, lines 108+). The layout
(`settings/layout.tsx`) is metadata-only passthrough.

**Auth / role.** Neither the general page nor its children call `getGolfSessionProfile()`.
Role comes from the client `useGolfUser()` context (`src/contexts/golf-user-context.tsx`),
which is populated by the dashboard layout. Unauthenticated users are kept out by the
dashboard layout / middleware, not by this page. Role-conditional sections key off
`profile.role` (`coach`/`player`) and ids; correct sections render per role
(`FairwaySettingsGeneral.tsx:353-405`).

**Profile load.** `loadProfile()` (`FairwaySettingsGeneral.tsx:170-242`) reads `email` from
`supabase.auth.getUser()`, and for players fetches `golf_players` + `golf_teams` (with
`organizations(name)`). Columns verified against live schema. Coach branch uses only context.

**Mutations (all client-side, `@/lib/supabase/client`, all `.update()`/`.upsert()` — no
delete-then-insert):**
- PersonalInfo → `golf_players` (`.eq('user_id')`) / `golf_coaches` (`.eq('user_id')`) +
  `router.refresh()` (`FairwaySettingsGeneral.tsx:506-522`). RLS `*_update_own` (`user_id = auth.uid()`) ✓.
- Email → `supabase.auth.updateUser({email})` (confirmation flow) ✓.
- Password → `supabase.auth.updateUser({password})` ✓.
- GolfScoring (coach) → `fromUntyped(...,'golf_team_settings').upsert(..., {onConflict:'team_id'})`
  incl. `sg_benchmark_level` (live column confirmed) (`:852`). RLS "Coaches can manage settings" ALL ✓.
- PlayerGolfDetails → `golf_players.update(...).eq('id', playerId)` (`:1020`). RLS still scopes to
  `user_id=auth.uid()`, so the `id` filter is redundant but safe ✓.
- TeamSettings (coach) → `golf_teams.update(...)` + `organizations.update(...)` bound to
  `golfUser.teamId` (cookie-aware ACTIVE team) (`:1150-1186`). RLS `golf_teams_update_coach` +
  `organizations_update_own` ✓ (caveat below).
- Invite (coach) → `golf_teams.update({join_code})` + clipboard copy (`:1285-1314`) ✓.
- Appearance → localStorage only via `useAppearancePreferences` (`:727`) — no DB.
- Sign out → `clearActiveTeam()` + `supabase.auth.signOut()` + `location.href='/golf/login'` ✓.
- Delete account → `DELETE /api/account/delete` (auth-checked, admin client) ✓.

**Mutation revalidation.** The general-page mutations are client `.update()` calls — they do NOT
revalidate server caches; instead they call `onUpdate()` (re-runs `loadProfile`) and
PersonalInfo additionally `router.refresh()`. Acceptable for this client-rendered page.

**Notifications route.** `settings/notifications/page.tsx` is a server component, properly
gated: `getGolfSessionProfile()` → redirect if no session → **player-only**; non-players get a
static "not available for coaches" card (`:26-81`). For players it reads
`golf_player_notification_state` (`prefs`, `quiet_mode`) and renders
`FairwaySettingsNotifications` (flag-on) / `NotificationPrefsClient` (flag-off). Toggles call
`setCategoryChannel` / `setQuietMode` (`src/app/golf/actions/v3/notification-prefs.ts`) — both
auth-check, both upsert one state row (no delete-then-insert), both `revalidatePath`,
optimistic UI with rollback ✓. RLS "Players manage own notification state" ✓.

---

### Expected vs actual (feature doc #26)

The feature doc describes a **single** "Preferences → NotificationsPanel: 7 notification toggles
(email & push)" writing `users.notification_preferences`, plus an Appearance + Location panel.
The live app has **diverged hard** from this and from the legacy code:

1. The legacy `NotificationsPanel` (writes `users.notification_preferences`, the column the
   delivery layer actually reads) is **not rendered in the live Fairway page** — it was replaced
   by a Link to `/settings/notifications` (`FairwaySettingsGeneral.tsx:334-352`). That target is
   **player-only**. Result: **coaches have no UI anywhere in the live app to set their email/push
   notification preferences.**
2. The player-facing v3 matrix at `/settings/notifications` writes
   `golf_player_notification_state.prefs`, which **no delivery code reads** — `routeNotification`
   (the only consumer) is dead code (see findings). So those toggles do nothing.
3. Doc's "LocationPanel" (default course/city/state) is absent from both legacy and Fairway pages
   — feature was removed; doc is stale.
4. Doc lists no Distance Units panel; legacy page has one (`page.tsx:362-371`) but the **Fairway
   (live) page omits it** — players cannot set yards/meters in the live app.
5. Known Gap "Appearance prefs not consumed" is partially closed (date format/animations now
   consumed via `useFormatDate` etc.), but still localStorage-only (no cross-device sync).

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|---|---|---|---|---|---|
| CRITICAL | dead-control | src/lib/coachhelm/v3/notifications/router.ts:69 | `routeNotification` (the only consumer of `golf_player_notification_state.prefs`/`quiet_mode`) is never imported or called by any delivery path (`email.ts:802` and `push.ts:135` gate on `users.notification_preferences` instead). | Every toggle and quiet-mode switch on the live `/settings/notifications` page is cosmetic — turning push/email off for a category does not stop those notifications; quiet mode silences nothing. | Wire `routeNotification` into the insight/goal/round-review delivery callsites (load the player's `golf_player_notification_state` row and honor the decision), OR collapse to the single `users.notification_preferences` system. |
| CRITICAL | incomplete-feature | src/components/fairway/pages/settings/FairwaySettingsGeneral.tsx:334-352 | Live Fairway settings replaced the legacy `NotificationsPanel` (which writes `users.notification_preferences`, the column `email.ts`/`push.ts` read) with a Link to player-only `/settings/notifications`. No coach-facing notification UI exists. `updateNotificationPreferences` is unreachable in the live app. | Coaches cannot change ANY email/push notification preference in the live app; the only control that actually gates delivery is orphaned. | Render a notifications panel in the Fairway general page that writes `users.notification_preferences` (reuse `getNotificationPreferences`/`updateNotificationPreferences`), or make the v3 system cover coaches AND wire it to delivery. |
| HIGH | wrong-data | src/lib/notifications/types.ts:52-53 vs src/app/actions/notification-preferences.ts:107-108 | Delivery defaults `DEFAULT_NOTIFICATION_PREFERENCES` set `push_messages:true, push_events:true`, but the settings UI panel (`page.tsx:911-912`) and `getNotificationPreferences` default both to `false`. | A user who never saved prefs sees push OFF in the UI while the delivery layer treats push as ON (masked today only because `push_subscriptions` is empty). UI is not the source of truth shown. | Make the three default sets identical (single shared `DEFAULT_NOTIFICATION_PREFERENCES`). |
| MEDIUM | incomplete-feature | src/components/fairway/pages/settings/FairwaySettingsGeneral.tsx (no DistanceUnitsPanel) | The legacy page exposes a Distance Units (yards/meters) panel (`page.tsx:362-371`); the live Fairway page omits it entirely. `useDistanceUnits` still drives display across the app. | Players on the live app cannot switch to meters; the preference is reachable only if it was set before the redesign. | Add a Distance Units `SectionCard` to `FairwaySettingsGeneral` reusing `useDistanceUnits`. |
| MEDIUM | no-error-state | src/components/fairway/pages/settings/FairwaySettingsGeneral.tsx:170-242 | `loadProfile()` has no try/catch and no error branch; if the player `golf_players`/`golf_teams` fetch fails, `setProfile` is never called and the page stays on the skeleton forever (`:278`). | Transient query failure leaves the entire settings page stuck on loading skeleton with no retry or message. | Wrap in try/catch; on failure set an error state with a retry, or render a minimal profile from context. |
| MEDIUM | dead-control | src/components/golf/CommandPalette.tsx:106 | Command palette surfaces "Notification Preferences" → `/golf/dashboard/settings/notifications` to all users including coaches; coaches land on the player-only "not available" card. | Coaches get a dead-end navigation target from the command palette. | Hide the entry for coaches, or point coaches at a working notifications panel. |
| LOW | revalidation | src/app/actions/notification-preferences.ts:45 | `updateNotificationPreferences` reads current prefs with `.single()` (read path was deliberately switched to `.maybeSingle()` at `:92` with an orphaned-user comment); the write path was not. Error is unchecked. | For an orphaned auth user (no `public.users` row) the read yields null silently and the merge proceeds with only new keys; not a crash but loses the orphan-safety symmetry. Minor. | Use `.maybeSingle()` here too for consistency. |
| LOW | rls | src/components/fairway/pages/settings/FairwaySettingsGeneral.tsx:1163-1176 | `organizations_update_own` RLS checks `golf_coaches.organization_id = organizations.id` for the auth user. A program head editing a toggled ACTIVE team whose org differs from their own `organization_id` would have the org update silently rejected (error thrown → toast) after the team-name update already succeeded. | Edge case: partial save (team saved, org rejected) for multi-org program heads. | Scope org edit to the active team's org with a clearer error, or gate the org fields when the active team's org ≠ coach's org. |
| INFO | type-mismatch | src/app/actions/notification-preferences.ts:12-24 vs page.tsx:904-914 | The Zod schema / legacy panel still carry baseball-only keys (`email_pipeline_updates`, `email_profile_views`) that the golf UI never renders. | No functional bug; dead keys in a shared cross-sport schema. | None required; document as shared-schema artifact. |

---

### Coverage notes
- RLS verified live for all mutated tables (`golf_players`, `golf_coaches`, `golf_team_settings`,
  `golf_teams`, `organizations`, `golf_player_notification_state`, `users`).
- `golf_team_settings.sg_benchmark_level` confirmed present in live schema (the `fromUntyped`
  cast comment about "regenerated on next deploy" is now stale but harmless).
- Push permission: the spec mentions "push permission" but **no Settings surface calls
  `Notification.requestPermission()` or registers a web-push subscription** — push toggles set DB
  flags only; actual permission/subscription is handled (if anywhere) outside Settings.
  `push_subscriptions` and (golf) `device_tokens` exist but Settings never writes them. Needs live
  verification of where push is actually requested.
- Avatar upload, ConfirmDialog, JoinTeamSection, CoachHelmToggle were not deep-traced beyond their
  import wiring; they appeared correctly wired.
