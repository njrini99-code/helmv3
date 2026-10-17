# Clubhouse status: the single source of truth

Updated 2026-10-17 from a full read-only audit (all 15 pages, routes, role
checks, held migrations and features, release state, Sentry, tooling, iOS,
tests). Read this page first. If another Clubhouse doc disagrees with it on
current state, rollout, rollback or what is left, this page wins; the stale
ones found by this audit are listed at the end. `PROGRESS.md` keeps the full
history (gates, decisions, questions, data gaps, verification log).

## Where it stands

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
- **Open release work:** draft PR #2201 (`agent/course-picker-premium-pr`, head
  `15ac49254`): course picker, Add a course photo, Qualifiers, CoachHelm and
  Standing contrast, the sidebar re-sort and script brand, the sign-in round
  trips (`loginAction`) and the welcome-to-dashboard hand-off. Its gates pass
  with no build (owner, 2026-10-17: no builds); CI aggregate and Review Gate
  are red only because it is a draft.
- **Database:** nothing Clubhouse needs is waiting. One new migration rides on
  #2201, `20261016220000_golf_set_course_image.sql` (any team member may set a
  course photo); the app falls back to the coach-only write without it. Apply
  after #2201 merges, with the owner's OK, and give it a `HELD.md` row.
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
| P003 Roster | Ready with caveats | Status-change write never watched in a real session; availability stays read-only (held `20260929120000`); `roster?tab=requests` from the join-request notification is ignored. Fixed 2026-10-17: a `?player=` link on the phone could open the list instead of the profile |
| P004 Stats (team) | Ready with caveats | No phone browser capture. Fixed 2026-10-17: whoever the dashboard draws as a player now goes to their Stats instead of "not rebuilt" |
| P005 Stats (player) | Ready with caveats | Focus-area write untested in a real session; strokes-gained figures wait on the held fix (data quality, not a blocker) |
| P006 Calendar | Ready with caveats | No device pass. Retry after a lost reply is safe for events and series (C-17) and busy time (fixed 2026-10-17) |
| P007 Messages | Ready with caveats | Conversation files is a HELD feature that turns on with the flag (decision 1); the Messages E2E signs in to production and waits for the owner |
| P008 Settings | Ready with caveats | Desktop built from the system with no handoff screen, never owner-reviewed (decision 3); Back over the Settings list itself with a Profile, Email or Password sheet open still leaves without asking. Fixed 2026-10-17: a refused save says why; Back over a section's sheet with edits asks first |
| P009 Qualifiers | Not ready | Squad-size and entrant edits are HELD and turn on with the flag (decision 1); held `20260929200000` (coach reasoning coach-only, D-35; the app already reads it coach-only). Fixed 2026-10-17: a coach on `/my-qualifiers` goes to Qualifiers |
| P010 Team Hub | Ready with caveats | No device pass. Fixed 2026-10-17: a failed roster read says so with Try again (CH-10208); the dark scan passes |
| P011 Rounds | Not ready | Q-120 decision (decision 2); the owner's device pass (airplane mode, kill the app, Recover); 11 contracts without a test, including writes refused offline; the round E2E runs only against a local stack, never in CI |
| P012 Classes | Ready with caveats | Import and calendar writes never run live; a retried import after a lost answer syncs nothing, duplicate rows from one import both insert (no fix recorded) |
| P013 CoachHelm | Ready with caveats | Q-124 (the stats cache counts test rounds; fix is the held stats chain); 17 contracts without a test; Player Ask decision open |
| P014 Recruiting | Ready with caveats | Film uploads refused until held `20260930140000` (the dialog says so); after a lost reply, Add can create the prospect twice |
| P015 Auth (front door) | Not ready, stays off | No Clubhouse version of reset-password, demo, coach onboarding, `coach/pending`, `join`, `join/[code]`, `staff/join/[token]`; crash containment, route error, not-found and error tracking unticked in `catalog/screens/auth.md`. Off at turn-on (step 5) |

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
- **Held migrations:** none is required by the app. `20261001000000` (Q-120,
  server version check on submit; the app checks on its side), `20260929200000`
  (D-35), `20261008160000` (Messages delete; fallback in place, but preview
  Sentry -1A0 logs the missing `hidden_at`, 89 events), `20260929120000`
  (availability), `20260930140000` (recruit film), `20260930150000` and the
  OD-01 stats chain (data quality), `20261007106000` (batch trace writer;
  Sentry -196, 105 events, its noise fix is in the undeployed #2197).
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
  Roster fix it found and one stale opener in the scan. `clubhouse:perf` has Stats and Home from 2026-10-01;
  CoachHelm and any re-measure since #2189 are missing (it needs a production
  build). `clubhouse-quality` is not a required check and runs only on some
  paths.
- **iOS (native, owner's call):** the offline cold-start reload loop is not
  addressed (`GolfBridgeViewController.swift:158-164` treats `offline.html` as
  leaving `/golf/`, and `SceneDelegate.swift:21-29` reloads the online login,
  which fails again; inferred from code). The launch colour is still `#F2E6D2`
  against the page's `#ebe7dc`.

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
6. Also open: `20260929200000` (qualifier privacy); white cards and Instrument
   Sans against the brand doc; making `clubhouse-quality` required; held
   migration timing for the stats chain, the strokes-gained fix and Messages
   delete; roster availability; Player CoachHelm Ask; the iOS items; open PRs
   #2096, #2091, #2073, #2048, #2105, #2177, #2193, #2200.

## Shortest path to turn-on, in order

1. Land #2201 (draft; gates pass) and apply `20261016220000` with the owner's
   OK.
2. Agent fix pass: done 2026-10-17 (the three route dead ends, busy-time
   retry, Settings' refused-save message and Back with edits, Team Hub's
   failed-roster notice, Home's midnight rollover, the Roster `?player=` link,
   the dark-mode scan, the stale docs). Left: a CI job for the round E2E
   against a local stack (it adds runner minutes to every push; owner's call)
   and Settings' Back over the list with a Profile, Email or Password sheet
   open.
3. Deploy `main` (the six undeployed commits, then #2201) with the flag still
   off, and confirm with `npm run release:status -- --strict`.
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
   has no team), and coach onboarding, `coach/pending`, `join/[code]`,
   `staff/join` and the demo have no Clubhouse versions.
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
  Not recorded yet.
- **Never promote `dpl_DowNH8VfxSXvSp5ggp2ZMkHMZpCb` (`ef6e017a2`).** It was
  the 2026-09-30 train's rollback target. Promoting it now would undo #2170
  and everything after it.

## Turn-on criteria

- [ ] `main` with #2201 builds (`npm run build`) and a browser check of it is
      clean. #2201 built once on `8cb03d5a3` (2026-10-17, before the owner's
      no-build call); nothing since.
- [ ] Owner decisions 1 and 2 are made (held features, Q-120).
- [ ] The owner's real-iPhone pass is clean.
- [ ] The rollback deployment is named above.
- [ ] After the canary deploy: no new Sentry issue families on Clubhouse
      routes for a full weekday.
- [ ] After the canary deploy: zero rounds completed with zero holes
      (read-only SQL; zero in the seven days to 2026-10-17 with the flag off).

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
| Open release work | draft PR [#2201](https://github.com/njrini99-code/helmv3/pull/2201) (`agent/course-picker-premium-pr`) |
| The last merge train | #2189 (`agent/clubhouse-release`), merged 2026-10-14 |
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
