# Settings checklist

Reference: no Settings screen exists in the handoff. The page is built from the handoff design system
(`design/handoff/design-system/components`): Surface (cards), Inset, PopoverPanel, FormField, Input,
Select, Switch and Segmented, plus the layout the owner chose on 2026-09-29 (one page, a section rail;
selected section is a flat green tint).
Route: /golf/dashboard/settings (coach and player) · `?section=account|notifications|team|golf|coachhelm|preferences`
· /settings/notifications and /settings/coaching-intelligence open their section.
Surface tag: `settings.<section>` and `settings.<profile|notifications|routing|coachhelm|invite|session>`

Sections

| Section | Coach | Player | Cards |
| --- | --- | --- | --- |
| Account | yes | yes | Profile (photo, name) · Email · Password · Help and legal · Session and account (sign out, delete) |
| Notifications | yes | yes | Email and push (quiet mode, push on this device, per-kind matrix, weekly team email for coaches) · CoachHelm updates (players) |
| Team | yes | no | Team details (team, school) · Invite players · Scoring and format · Event reminders |
| Golf profile | no | yes | Golf details · Team (leave) or Join a team (code, pending requests) |
| CoachHelm | yes | no | CoachHelm (team switch, dashboards) · What matters most · Sensitivity and thresholds · Alerts · Signal controls · Analysis windows · Display |
| Preferences | yes | yes | This device (animations; haptics in the app) |

Data (same tables and actions as the current Settings page):
- Profile: `golf_coaches.full_name, avatar_url` / `golf_players.first_name, last_name, avatar_url`; photos to the `avatars` bucket under the user's folder.
- Email and password: Supabase Auth (`updateUser`; password re-authenticates first).
- Email and push: `users.notification_preferences` via `get/updateNotificationPreferences`. Device push: `usePushSubscription`.
- Weekly team email: `golf_coach_philosophy.email_digest_enabled` via `saveCoachingPhilosophy`.
- CoachHelm updates (players): `golf_player_notification_state` via `setCategoryChannel`, `setAllChannels`, `setQuietMode`.
- Team: `golf_teams.name, season, join_code`, `organizations.*`, `golf_team_settings.*` (scoring, tees, handicap, timezone, reminders); `regenerateJoinCode`.
- Golf profile: `golf_players` details; membership via `getPlayerJoinRequests`, `createTeamJoinRequest`, `cancelJoinRequest`, leave = own `golf_team_members` row (RLS "Players can leave teams").
- CoachHelm: `golf_coachhelm_settings` (dashboards), `golf_team_coachhelm_settings` via `getOrCreateTeamCoachHelmSettings` / `updateTeamCoachHelmSettings` (head coach only), `golf_coach_philosophy` (created on first save).
- Delete account: `DELETE /api/account/delete` (unchanged route).

## spec
- [x] Desktop reference files and screenshots are named above (design-system components; no Settings screenshot exists, layout decided by the owner, D-18)
- [x] Every figure on the screen is mapped to a table and column, or logged as a data gap in PROGRESS.md
- [x] Every control is mapped to an existing server action, or to a migration that has to be written (never applied by an agent)
- [x] Differences between the README and the screenshots are resolved as decisions in PROGRESS.md (D-18)

## desktop
- [ ] Matches the reference at 924px and at 1280px or wider (spacing, type, radius, depth) (awaiting owner review)
- [x] Only Clubhouse tokens and classes are used, and `clubhouse:check` is clean
- [x] N/A: no scores on this page (numbers are settings values, shown with units)
- [x] N/A: no scoring colours; danger red only on Delete account and invalid fields
- [x] Copy is in sentence case, in the head-pro voice, and actions are a verb plus an object
- [x] Controls that point at an unbuilt screen are hidden via `rebuiltHref`, never dead (none point elsewhere)
- [x] A narrow canvas (container below 860px) reflows without horizontal page scroll (rail becomes a strip; forms one column below 560px)

## wired
- [x] Everything is read server-side in one pass, so final data is on first paint (no client fetch waterfall)
- [x] Reads go through the RLS-scoped client, with no service role for a user's own data
- [x] Every Supabase call reads `error`; lists over 1,000 rows paginate, and `.in()` is chunked (no list reads here)
- [x] N/A: no statistics on this page
- [x] N/A: no dates shown except join-request dates
- [ ] Unit tests cover the loader's derivations (model validation is tested; the loader itself is not)

## states
- [x] Loading: a route skeleton shaped like the page, so nothing shifts when data lands
- [x] Empty (first run): a coach with no team sees why the Team section is empty; a player with no team sees Join a team
- [x] N/A: no filters on this page
- [x] Partial failure: each section has its own failure flag and shows an inline notice with Try again; the rest of the page still works, and a failed read never shows a blank form that could be saved over real data
- [x] Crash containment: every section is wrapped in a `SectionBoundary` with a surface tag
- [x] Route error: the Clubhouse error view (it inherits the `logError`, chunk and stale-action recovery)
- [x] Not found and no access: a player on /settings/coaching-intelligence lands on their own Settings; the team switch says only the head coach can change it
- [ ] Offline or slow network: the action says so instead of spinning forever
- [x] User errors: every mutation goes through `useAction` or `useInstantSave`, with a specific failure message, Retry, an error haptic and a Sentry event
- [x] Forms: inline field messages and double submit is prevented (Save disabled while pending or invalid)
- [ ] Forms: focus moves to the first invalid field
- [x] Destructive actions: a confirm step (delete account needs "delete" typed; leave team; new invite code; reset updates; turn off CoachHelm)
- [x] Optimistic updates roll back on failure and tell the coach
- [x] Unsaved edits: leaving the page or switching sections asks first; the browser asks before unload

## error-tracking
- [x] Server read failures are logged with `chLogServer('settings', '<read>')`
- [x] Client crashes are reported with `chReport`, tagged `ui=clubhouse` and `surface=settings.<section>`
- [x] Key intents leave a `chTrail` breadcrumb (section change, each switch, sign out, copy, share, delete open)
- [x] No `catch` swallows an error without reporting or handling it on screen (feedback widget and share-sheet dismissal fall back by design, commented)
- [x] Handled failures are low severity and crashes are high, so alerts stay meaningful
- [ ] Every failure path was forced once locally and seen in the console or Sentry (preview `?state=failwrites|failed|partial` done; live paths not)

## phone-spec
- [ ] `docs/clubhouse/phone/settings.md` is written as an intentional native design, not a shrunk desktop
- [ ] The owner approved it (the file says `Status: approved`)

## phone
- [ ] Built at 390px and 430px, respecting the safe areas
- [ ] Touch targets are at least 44px, and hover-only affordances have a tap equivalent
- [ ] Sheets are used instead of popovers, and they drag to dismiss
- [ ] The bottom tab bar and toasts don't overlap content
- [ ] Checked in the iOS app shell (Capacitor), with native haptics felt on a device

## motion
- [x] Transitions use only 90, 150, 220 and 360ms with the Clubhouse ease (section change uses the route transition)
- [x] Press scales to 0.985 on every tappable surface
- [x] No count-ups and no entrance staggers; data is final on mount
- [x] Reduced motion is honoured through `useChReducedMotion`, and the Animations preference now turns every Clubhouse transition off
- [x] Haptics: select for sections, switches and pickers; commit on saves; error on failures; warning before delete

## accessibility
- [x] Full keyboard path, with visible focus and no traps; Esc closes overlays
- [x] Landmarks, headings in order, table roles, and labels on icon buttons and every switch
- [x] N/A: no charts
- [x] Status changes are announced (aria-live on save status) and errors use role=alert
- [ ] Text contrast meets WCAG AA on every surface

## performance
- [x] No request waterfall on the server, with independent reads in parallel
- [x] Client JS is limited to the interactive islands, and animation code is loaded lazily
- [ ] No layout shift after first paint

## verified
- [ ] typecheck, lint, `clubhouse:check` and the screen's tests are green, with exit codes recorded in the log
- [ ] Browser pass on desktop and phone with a real coach account, logged in PROGRESS.md
- [ ] Owner review of the built screen
