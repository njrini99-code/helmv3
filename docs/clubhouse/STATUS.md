# Clubhouse status: the single source of truth

Updated 2026-10-17 from a full read-only audit (all 15 pages, routes, role
checks, held migrations and features, release state, Sentry, tooling, iOS,
tests), and on 2026-10-19 for the completion pass (#2210 into #2202; see "Since
the 2026-10-17 audit" below). Read this page first. If another Clubhouse doc
disagrees with it on current state, rollout, rollback or what is left, this page
wins; the stale ones found by this audit are listed at the end. `PROGRESS.md`
keeps the full history (gates, decisions, questions, data gaps, verification
log). What is left, and who has it: [QUEUE.md](QUEUE.md).

## Since the 2026-10-17 audit (2026-10-19)

- **Production** serves `1e8a9fad8` (#2201, checked with `npm run
  release:status` on 2026-10-19), flag off. `main` is at `b37f647fd`, three
  commits ahead and not deployed: #2204 (password reset email and page),
  #2205 (players see only meetings they are invited to; held
  `20261018120000`), #2209 (qualifier reason written separately so held
  `20260929200000` can be applied).
- **Open release work:** PR #2202 (`agent/fairway-fixes-polish`): Fairway
  live-bug fixes plus the Clubhouse completion pass (#2210, merged into it
  2026-10-19): designed empty states (D-72), the live motion set pinned (D-73),
  the folding sidebar spring kept (D-74), desktop keyboard layer with Cmd+K,
  G-then-letter, `?` and right-click menus (D-75), Clubhouse date and time
  fields (D-76), every way in has a Clubhouse screen (D-77), native launch
  colour (D-78), the round as a scorecard to keep, with share and print (D-79),
  plus the iPad tier (821 to 1180px), Dynamic Type, 44px touch and the iOS
  offline cold-start fix. Not deployed.
- **Contracts:** P011 Rounds has 1 reserved contract (was 11: only 111809, the
  axe scan, is left); P013 CoachHelm has 8 (was 17). 110804 (Discard refuses a
  teammate's round) is implemented on #2202.
- **Verified locally on #2210's head:** typecheck, lint, `clubhouse:check`,
  `clubhouse:css`, full vitest; `clubhouse:a11y` 303 of 305 states (the two
  left are the preview harness); the premium sweep, 383 cases with no overflow
  (Chromium and WebKit, 390 and 1280); all 18 journeys on a production build
  against a local Supabase (Chromium and WebKit, with #2208 and #2209).
- **Still open:** the round E2E runs in no CI workflow until draft #2208
  lands (owner's call: runner minutes); `clubhouse:perf` needs a production
  build; no real-iPhone, VoiceOver or real-account write pass; the front door
  stays off (P015 checklist unticked); every held migration below is still
  unapplied, `20261016220000` included (ledger checked 2026-10-19).

## Where it stands (2026-10-17)

- **Production: off.** `golf_clubhouse_ui` is `production: false` in
  `config/feature-flags.yml` and the front door (`golf_clubhouse_front_door`)
  is off. Fairway serves coaches and players. Production serves `87bd60345`
  (#2189, merged 2026-10-14). `main` is at `22e542657`, six commits ahead and
  not deployed: #2194, #2195 (the Safari audit, F1 to F24), #2196, #2197,
  #2198, #2199; four of them are Clubhouse fixes.
- **Preview and development: on.** Every Vercel preview and `npm run dev`
  render Clubhouse.
- **History:** on in production by mistake 2026-10-08 to 2026-10-11 (#2180),
  turned off with #2188. The owner's end state is "ready, not on": agents make
  it ready; the owner flips it.
- **Open release work:** none here: #2201 merged 2026-10-18 (see above).
- **Database (wiring audit 2026-10-17, every page P001–P015 against the live
  catalog):** every table, view, bucket and RPC Clubhouse calls exists in
  production except five, each held with a fallback: `hidden_at` (P007 delete
  hidden), `golf_qualifier_selection_reasons` (P009 reads the column instead),
  `golf_set_course_image` (P011: coaches fall back, a player's photo is refused
  and the upload is now discarded), the batch trace writer (falls back per
  step), and recruit film (P014: if Storage refuses video, CH-14107/8 says so).
  `database.ts` matches production apart from the two functions this branch
  adds. The audit's write fixes are in code (group-chat reuse, second-team
  approval, task status sync, assistant travel brief, tee rollback, document
  re-attach, orphaned photos). Three new held migrations cover the rest:
  `20261017100000` (Settings switches the users trigger drops),
  `20261017101000` (announcement recipient/task policies), `20261017102000`
  (players read only their own RSVP rows; counts come from a definer function,
  with a fallback until applied). Coach organization repointing is PR #2200.
- **Production data check:** zero rounds completed with zero holes in the last
  seven days (read-only SQL, 2026-10-17).

## How far from production

Every screen is built and every coach and player route lands somewhere in
Clubhouse. What is left is mostly verification only the owner or a production
build can do, three owner decisions, and a handful of fixes. Measured as work:
one fix pass (a day), the owner's device pass (about an hour), then a one-team
canary watched for a full weekday.

### Page readiness (2026-10-17)

Manifests: every page is design approved (P008 Settings: draft), implementation
in progress, contract complete (P015 Auth: partial), verification partial. The
shared evidence is the 2026-10-06 WebKit audit (320 to 1280px, zero Axe
violations, no overflow) on synthetic fixtures. No page has a real-iPhone,
VoiceOver, dark-mode scan or real-account write pass.

| Page | Verdict | What blocks or caveats it |
| --- | --- | --- |
| P001 Shell | Ready with caveats | No device or VoiceOver pass for the frame every page sits in; the 10-16 brand and team-heading work is on #2201 |
| P002 Home | Ready with caveats | `golf_event_attendance` RLS lets a player read every teammate's replies through the API (Home shows counts only; decision 5); day labels and the midnight rollover fixed 2026-10-17 |
| P003 Roster | Ready with caveats | Status-change write never watched in a real session; availability stays read-only (held `20260929120000`). Fixed 2026-10-17: a `?player=` link on the phone could open the list instead of the profile. Fixed since: `roster?tab=requests` from the join-request notification opens the phone's requests sheet (#2201) and, 2026-10-20, focuses the desktop requests card |
| P004 Stats (team) | Ready with caveats | No phone browser capture. Fixed 2026-10-17: whoever the dashboard draws as a player now goes to their Stats instead of "not rebuilt" |
| P005 Stats (player) | Ready with caveats | Focus-area write untested in a real session; strokes-gained figures wait on the held fix (data quality, not a blocker) |
| P006 Calendar | Ready with caveats | No device pass. Retry after a lost reply is safe for events and series (C-17) and busy time (fixed 2026-10-17) |
| P007 Messages | Ready with caveats | Conversation files is a HELD feature that turns on with the flag (decision 1); its migrations are in (`20261001130000` applied 2026-10-03, `20261008160000` applied 2026-10-21); the Messages E2E signs in to production and waits for the owner |
| P008 Settings | Ready with caveats | Desktop built from the system with no handoff screen, never owner-reviewed (decision 3). Fixed 2026-10-17: a refused save says why; Back over any edit sheet with edits asks first and keeps Settings; the priority order after a failed save; one read per table; warning ticks on destructive confirms |
| P009 Qualifiers | Not ready | Squad-size and entrant edits are HELD and turn on with the flag (decision 1); `20260929200000` (coach reasoning coach-only, D-35) was applied 2026-10-21 and the app reads it coach-only. Fixed 2026-10-17: a coach on `/my-qualifiers` goes to Qualifiers |
| P010 Team Hub | Ready with caveats | No device pass. Fixed 2026-10-17: a failed roster read says so with Try again (CH-10208); the dark scan passes |
| P011 Rounds | Not ready | Q-120 decision (decision 2); the owner's device pass (airplane mode, kill the app, Recover); 1 contract without a test (111809, was 11 on 10-17); the round E2E runs only against a local stack, in CI only once draft #2208 lands |
| P012 Classes | Ready with caveats | Import and calendar writes never run live. The retried import after a lost answer and the duplicate rows in one import were already fixed in code and tested (#2148, 2026-10-06; the audit read a stale VERIFY note, corrected 2026-10-20); two imports in flight at once are closed by a locked database function (held `20261021110000`; until it is applied the import keeps its read before the insert, so two at once could still both insert) |
| P013 CoachHelm | Ready with caveats | Q-124 (the stats cache counts test rounds; fix is the held stats chain); 8 contracts without a test (was 17 on 10-17); Player Ask decision open |
| P014 Recruiting | Ready with caveats | Film uploads on (`20260930140000` applied 2026-10-21; `RECRUIT_FILM_ENABLED` is the off switch). Fixed 2026-10-20: after a lost reply, an Add with a corrected field (not the name) created the prospect twice; Retry and a repeated Save were already safe (CH-14915) |
| P015 Auth (front door) | Not ready, stays off | Since #2210 (D-77) reset-password, demo, coach onboarding, `coach/pending`, `join`, `join/[code]` and `staff/join/[token]` have Clubhouse screens; crash containment, route error, not-found, error tracking and the device checks are still unticked in `screens/auth.md`. Off at turn-on (step 5) |

### Cross-cutting findings

- **Routes (54 dashboard pages):** 24 Clubhouse screens, 18 alias redirects
  (15 layouts), 10 `next.config.mjs` redirects, 2 dev and catch-all; none
  renders Fairway inside Clubhouse.
  - Fixed 2026-10-17: a coach on `/rounds` or `/my-qualifiers` and a player on
    `/stats/team` stood on "not rebuilt" (each page's plain `redirect()` never
    ran, because the frame drops a page not rebuilt for the role). They redirect
    through `redirectToClubhouse` and are on the frame's aliased list; the
    player cases checked in Chrome, the coach cases by `alias-frame.test.ts`.
- **Role checks:** all nine sites use the dashboard role rule (the five pages,
  round-partial, round-submit, qualifier-setup; message-attachments through
  `pickGolfDashboardRole`).
- **Held features open with the flag (D-61):** conversation files
  (`message-attachments.ts:481`) and qualifier squad-size and entrant edits
  (`qualifier-setup.ts:54`) refuse unless Clubhouse is on for the caller, so
  turning the flag on releases them. Their plans
  (`docs/clubhouse/held/features/`) say they wait for the owner's explicit
  release.
- **Held migrations Clubhouse needs (apply order; `20261008160000` and
  `20260929200000` were applied 2026-10-21, see HELD.md):** `20261016220000`
  (after #2201), `20261007100000`, `20261017100000`–`20261017102000` (with the
  app change), `20261001000000` (Q-120), `20260930140000` (check the project
  Storage limit is at least 100 MB first), `20260930150000`, then the OD-01
  chain in one session (`20260924120000` → `140000` → `20260925120000` →
  `20260928120000` → `20260928150000`). `20260929120000` waits for a writer;
  `20261007102000` goes last with a fresh rollback snapshot.
  `20260928160000` is OBSOLETE and must never be applied.
- **Sentry (last seven days):** production has nothing from Clubhouse (flag
  off). Preview: -1A0 above, -158 (fixed in #2197), N+1 queries on Stats, Home,
  Roster and Calendar. The development-tagged issues are local only.
- **Tests:** 171 unit test files under `src/clubhouse`. Six Clubhouse E2E specs
  (32 tests) all skip without their environment; CI runs only quality and
  playground. The round, team-switch, phone-audit and materials specs run in no
  workflow: the biggest test gap for round safety.
- **Tooling:** the first dark-mode a11y scan ran 2026-10-17 (Chromium, reduced
  motion, 1280 and 390px): 304 screens and states, zero violations, after a
  Roster fix it found and one stale opener in the scan. `clubhouse:perf` has
  Stats and Home from 2026-10-01; CoachHelm and any re-measure since #2189 are
  missing (it needs a production build). `clubhouse-quality` is not a required
  check and runs only on some paths.
- **iOS (native, owner's call):** the offline cold-start reload loop is fixed
  on #2202 (`GolfBridgeViewController.isBundledPage`: the bundled
  `offline.html` no longer counts as leaving `/golf/`). Not run in the
  Simulator yet (2026-10-19: the local CoreSimulator service hung on every
  `simctl` call). It reaches users only with a new native build. The launch
  colour stays Fairway's canvas while the app serves Fairway (D-78).

## Owner decisions before turn-on

1. **Held features that the flag releases:** release conversation files (P007)
   and qualifier squad-size and entrant edits (P009), or give them their own
   switch so the flag does not release them.
2. **Q-120:** apply `20261001000000` (server-side version check on submit) or
   keep holding with the app-side check.
3. **Settings desktop:** review the screen built from the design system.
4. **Builds:** the turn-on criteria and `clubhouse:perf` need one production
   build; the owner said no builds on 2026-10-17. Decide when one is allowed.
5. **Attendance privacy:** `golf_event_attendance`'s select policy lets a player
   read every teammate's reply on every team event through the API (Home shows
   counts only). Narrow it to the player's own rows, or accept it.
6. **Folding sidebar motion:** the fold animates the sidebar's width (and the
   brand's margin, padding and word track) on the smooth spring, so the canvas
   reflows each frame. `clubhouse:css` flags it as new layout motion, which
   keeps the `presentation` check red (not required for merge). Keep it as the
   reviewed exception, or move to a transform-only fold (the sidebar draws over
   the canvas and the canvas reflows once, at the start or the end). Frame
   cost in Safari is NOT VERIFIED: timing needs a production build (item 4).
   Recommendation: keep the spring; measure on the first allowed build.
7. Decided 2026-10-21 (owner, via the coordinator): keep white cards and
   Instrument Sans in Clubhouse; the brand doc follows the product
   (`memory/brand/clubhouse-ui.md`). Also open: making `clubhouse-quality`
   required; held migration timing for the stats chain, the strokes-gained fix and Messages
   delete; roster availability; Player CoachHelm Ask; the iOS items; open PRs
   #2096, #2091, #2073, #2048, #2105, #2177, #2193, #2200.

## Shortest path to turn-on, in order

1. Done: #2201 landed and is in production (`1e8a9fad8`). Apply
   `20261016220000` with the owner's OK (still held, 2026-10-19).
2. Agent fix passes: done 2026-10-17 (route dead ends, busy-time retry,
   Settings' refused-save message and Back with edits, Team Hub's
   failed-roster notice, Home's midnight rollover, the Roster `?player=` link,
   the dark-mode scan, the stale docs) and 2026-10-19 (the completion pass,
   #2210 in #2202). Left: CI for the round E2E against a local stack (draft
   #2208; it adds runner minutes, owner's call).
3. Land #2202, then deploy `main` with the flag still off (owner's word), and
   confirm with `npm run release:status -- --strict`.
4. Owner decisions 1 and 2 above.
5. Owner real-iPhone pass: coach 20 minutes; player 30 minutes including
   airplane mode mid-round, killing the app and Recover; VoiceOver, large text
   and dark mode 10 minutes.
6. Name the rollback deployment below, set `HELM_CLUBHOUSE_TEAMS` to one canary
   team, turn the flag on, deploy, watch a full weekday (criteria below).
7. Widen the allowlist and deploy again.

## Retired by the owner (2026-10-12)

These are not coming back. The current redirects stay, and nothing is built:

| Was | Today with Clubhouse on |
| --- | --- |
| Course management (`/courses`) | redirects to Home |
| Printable scouting report (`/players/[id]/game/print`) | the `players/[id]` alias, to `stats?player=` |
| Genome compare (`/coachhelm/genome/compare`) | redirects to `stats/team` |
| Settings display density, date format, score display | not shown in Clubhouse Settings |

## How to turn it on (canary first)

The flag is compiled into the bundle and the allowlist is read at request time
from a server environment variable, but both changes reach users only through
a new production deploy.

1. Every box in "Turn-on criteria" below is ticked.
2. Set `HELM_CLUBHOUSE_TEAMS` in the Vercel production environment to the
   canary team UUIDs (`golf_teams.id`, comma-separated). `*` or an empty value
   means every team, so never leave it unset or empty for a canary, and the
   same holds when the list shrinks later.
   `scripts/check-required-env.mjs` refuses a production build with a
   Clubhouse flag on and the variable unset.
3. In `config/feature-flags.yml`, set `golf_clubhouse_ui`
   `environment.production: true`, then run `npm run flags:generate` and
   commit `src/lib/flags/registry.generated.ts` with it. The prebuild step
   fails when the generated registry is stale.
4. Merge, deploy with the command in AGENTS.md "Production", and confirm with
   `npm run release:status -- --strict`.
5. Leave `golf_clubhouse_front_door` off. It is global (a signed-out visitor
   has no team). Its screens exist since #2210 (D-77), but the P015 checklist
   (`screens/auth.md`) is not ticked and no owner review has happened.
6. Watch the canary for a full weekday (criteria below), then widen the
   allowlist and deploy again.

## Rollback

- **One team:** remove its UUID from `HELM_CLUBHOUSE_TEAMS` and deploy. If it
  is the last team on the list, do the flag-off commit below instead: an empty
  or unset value means every team (`clubhouseTeamAllowlist` in
  `src/clubhouse/gate.ts`), so emptying the list would turn Clubhouse on for
  everyone.
- **Everyone:** a flag-off commit (`production: false`, `npm run
  flags:generate`) and a deploy.
- **No schema to undo.** Both UIs share the round engine and the device's
  offline stores, so a round queued under Clubhouse replays under Fairway. An
  open tab keeps Clubhouse until it reloads; auto-reload waits while a round
  is unsaved.
- **Before turn-on, name the rollback deployment.** Record the current
  flag-off production deployment id here so a promote back to it is one step.
  Read from Vercel 2026-10-21 (release `d0f467a73`, deployed by the owner that
  morning): production is `dpl_CeADrBdMKv2MkZMhfJRxRv6CBYAc`; the one before
  it, `dpl_6Enpeka5udJctZo5MC5VHnVQ7o7R`, is the promote-back target while
  that stays current. Both are READY rollback candidates. Merges since then are
  not live, so the next production deploy replaces this: re-read it from
  `npm run release:status` (or Vercel) the day of turn-on and update this line
  in the same change.
- **Never promote `dpl_DowNH8VfxSXvSp5ggp2ZMkHMZpCb` (`ef6e017a2`).** It was
  the 2026-09-30 train's rollback target. Promoting it now would undo #2170
  and everything after it.

## Turn-on criteria

- [ ] `main` with #2202 builds and a browser check of it is clean. #2210's
      head built with `next build` on 2026-10-19 (local, `VERCEL_ENV=preview`)
      and passed all 18 journeys; `main` after #2202 has not been built.
- [ ] Owner decisions 1 and 2 are made (held features, Q-120).
- [ ] The owner's real-iPhone pass is clean.
- [ ] The rollback deployment is named above.
- [ ] After the canary deploy: no new Sentry issue families on Clubhouse
      routes for a full weekday (the `ui:clubhouse` search in Monitoring,
      against its baseline).
- [ ] After the canary deploy: zero rounds completed with zero holes
      (the read-only SQL in Monitoring; zero in the seven days to 2026-10-17
      with the flag off).

## Monitoring

Every Clubhouse error is tagged `ui:clubhouse`: the browser tags the session
when the shell mounts (`chTagSession`, `src/clubhouse/lib/track.ts`), and the
server tags the request's isolation scope when `isClubhouseFor` decides
Clubhouse (`src/clubhouse/gate.ts`, tested in
`src/clubhouse/__tests__/gate-sentry-tag.test.ts`). Fairway events carry no `ui`
tag. The server tag reaches production only with the deploy that carries it, so
take the canary from a build that includes it.

**The search to save** (Sentry org `helm-xs`, project `javascript-nextjs`):

    environment:production ui:clubhouse

It was not saved through the tools (the Sentry tools here can create alerts and
metric monitors, not saved searches, and an alert notifies people, so it waits
for the owner). Steps, before the canary deploy:

1. Sentry → Issues, project `javascript-nextjs`, environment `production`.
2. Search `ui:clubhouse is:unresolved`, then Save search as
   "Clubhouse canary (production)", visible to the organization.
3. Optional alert: Alerts → Create alert → Issues, project
   `javascript-nextjs`, environment `production`, when "A new issue is created"
   and the filter "The event's tags match `ui` equals `clubhouse`", notify the
   owner. Leave it active for the canary weekday.
4. Discover query for counts, to compare with the baseline below:
   dataset Errors, `environment:production ui:clubhouse`, fields `count()`,
   `count_unique(user)`, `count_unique(issue)`, period 14d.

**Baseline, recorded 2026-10-16 (read only).**

- Sentry, production, the 14 days to about 2026-10-16 21:35 UTC, error events
  whose transaction is under `/golf/dashboard` (`transaction:*golf/dashboard*`
  or `*golf/(dashboard)*`, which covers server GET and POST, browser routes and
  server components): **386 events, 28 issues, 26 users**. The largest:
  JAVASCRIPT-NEXTJS-Z0 statement timeout (86 events), -XP worst-hole read
  timeouts (79 events, 15 users), -YX AbortError (78), -196 the held-migration
  trace probe (73; its noise is dropped by #2197, not yet deployed) and -15A the
  round recap style trace (32 events, 17 users). `ui:clubhouse` in the same 14
  days: 0 events.
- Production database, `golf_rounds` with `status = 'completed'` and no
  `golf_holes` row: **18 of 774 completed rounds** (14 not `is_test`), the
  newest created 2026-09-28; **0 of the 64 completed in the last 14 days**.
  The turn-on criterion is that this stays 0 for rounds completed after the
  canary deploy. `golf_rounds` has no completion time, so `updated_at` (which
  the submit sets) stands in, a superset:

      SELECT count(*) FROM golf_rounds r
      WHERE r.status = 'completed' AND r.updated_at >= '<canary deploy time>'
        AND NOT EXISTS (SELECT 1 FROM golf_holes h WHERE h.round_id = r.id);

## Stale docs found by the 2026-10-17 audit

Fixed in the fix pass the same day, except the PROGRESS gate rows (a gate moves
only with evidence) and two manifest `held` entries that link plan docs
already marked RELEASED:

- `SWAP_AUDIT.md` §3: no row for the `coachhelm/qualifying/[id]` alias; says
  `team` is not rebuilt (it is aliased); says the tasks alias drops `?task`
  (it keeps it).
- `supabase/migrations/HELD.md` and `PROGRESS.md`: Q-120's app side is "not in
  the build production serves"; it is (#2189).
- P002 CONTRACT:70 and VERIFY:227-229: the phone skeleton is role-aware since
  10-08.
- P004 and P005 VERIFY: D-71 "No stats yet" and the profile loading gap are
  built and fixed.
- P006 VERIFY:231: the first-run state exists (`CalendarFirstRun.tsx`).
- P007 manifest: `message-attachments-hardening` is released (HELD.md:74).
- P008 DESIGN:252: the phone was approved 2026-09-30; catalog CH-8320: migration
  `20261008150000` was applied 2026-10-11.
- P010 VERIFY:114 and :116 contradict on arrow keys; :205-207 document upload
  and delete now check the coach; manifest `document-policy-scoping` released
  2026-10-03.
- P011 WIRING:33,46,65 and VERIFY:470-478: error pages show the Clubhouse error
  view, not Fairway.
- PROGRESS.md gate rows for CoachHelm and Classes (:672, :674) read all "todo".
- P015 manifest `routes` lists only login and welcome; signup and
  `/golf/player` are wired too.

## Where things live

| What | Where |
| --- | --- |
| Open release work | PR [#2202](https://github.com/njrini99-code/helmv3/pull/2202) (`agent/fairway-fixes-polish`, with #2210); draft [#2208](https://github.com/njrini99-code/helmv3/pull/2208) (round E2E in CI) |
| The last merge train | #2201, merged and in production (`1e8a9fad8`) |
| Held migrations, reasons and apply order | `supabase/migrations/HELD.md`; the Clubhouse order is in [PROGRESS.md](PROGRESS.md) "Release with the Clubhouse deploy" |
| Held features (D-61) | `docs/clubhouse/held/features/` |
| Gates, decisions (D-n), questions (Q-n), data gaps | [PROGRESS.md](PROGRESS.md) |
| Every state and outcome (CH- codes) | `catalog/` and `config/clubhouse/bridge-contracts.json` |
| Page manifests | `config/clubhouse/pages/` |
| The flag and the team allowlist | `config/feature-flags.yml`, `src/clubhouse/gate.ts` |
| Route aliases | `src/clubhouse/routes/alias.ts` and the route `layout.tsx` files; the table is [SWAP_AUDIT.md](SWAP_AUDIT.md) §3 |
| Audits and plans | [AUDITS.md](AUDITS.md) |
| How to build a page | [README.md](README.md); phone: [MOBILE.md](MOBILE.md) |
| Deploy and release check | AGENTS.md "Production", `docs/setup/DEPLOY.md`, `npm run release:status` |
