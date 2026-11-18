# Clubhouse screens

## October 6 release evidence

Existing rules, route ticks and device requirements retain their scope.
They do not certify the dependency-upgraded release candidate.

[ALL_PAGE_AUDIT.md](ALL_PAGE_AUDIT.md) covers all 15 page families;
[SMOOTHNESS_AUDIT.md](SMOOTHNESS_AUDIT.md) records confirmed motion findings.
Physical Safari/iPhone acceptance and production-build profiling remain open.
The 2026-10-19 completion pass (#2210) is summarized in
[STATUS.md](STATUS.md) "Since the 2026-10-17 audit".

Every GolfHelm address (first listed from the old Fairway UI), who it is for,
and whether Clubhouse has rebuilt it. Tick a screen when its route is added to
`CH_REBUILT_ROUTES` (`src/clubhouse/shell/nav.ts`), which is when it reaches the
`desktop` gate in `PROGRESS.md`. `npm run clubhouse:check` fails if a ticked
screen isn't rebuilt, or a rebuilt route isn't ticked. Routes are under
`/golf/dashboard`. Redirect-only legacy links (`/alerts`, `/insights`,
`/patterns`, `/development`, `/my-development`, `/my-game-profile`,
`/my-standing`, `/analytics/coachhelm`, `/hub`) and `/dev/haptics` aren't
screens and aren't listed.

Mobile designs are tracked per screen in `PROGRESS.md` (the `phone-spec` and
`phone` gates).

Checked 2026-11-17: this list was drawn up against Fairway, which was retired on
2026-11-14 (#2527); Clubhouse is now the only coach and player UI. An unticked
line is a Fairway screen that has no rebuilt route of its own in
`CH_REBUILT_ROUTES`: some now redirect into a Clubhouse page in
`next.config.mjs` (`/tasks`, `/announcements`, `/documents` and `/travel` to
Team Hub's tabs), some are reached as a feature route (Tournaments, behind
`golf_tournaments_v1`), and some are old addresses whose layout sends each role
to its Clubhouse screen (`/courses`, `/team`, `/intelligence`;
`src/clubhouse/routes/alias.ts`). Practice (`/practice` and its pages) is drawn
by Clubhouse but is not in `CH_REBUILT_ROUTES`; its pages decide for themselves
(`CH_PRACTICE_PAGES` in `src/clubhouse/shell/nav.ts`).

## Who each screen is for (routing)

Every address carries one label after its route:

- **coach**: only a coach gets a screen there.
- **player**: only a player gets one.
- **shared**: both roles get a screen at the address, either the same
  component (Messages) or one each (Home: `CoachHome` and `PlayerHome`).
- **signed-out**: drawn before anyone signs in (the front door, below).

An **old address** draws nothing of its own and sends each role on. Its label
says who it still serves.

The full list is
[generated/CLUBHOUSE_ROUTE_MAP.md](generated/CLUBHOUSE_ROUTE_MAP.md). Each row
gives every address, the component each role gets, the query views that are
screens of their own (such as CoachHelm's `?view=player` for a coach), and where
an old address sends each role. The map is generated from the `screens` in each
page manifest (`config/clubhouse/pages/*.json`) and from
`config/clubhouse/other-routes.json`. `npm run clubhouse:check` fails in three
cases:

- a `page.tsx` under `src/app/golf` (outside `admin/`) has no label;
- a labelled component doesn't exist;
- a label disagrees with `CH_REBUILT_ROUTES`.

The lists below are the same addresses by role. A route that is **shared**
appears under both.

## Coaches

- [x] **Home** `/` · **shared** — Morning view of the program: the week ahead, who needs
  attention, the leaderboard, latest rounds
- [x] **Roster** `/roster` · **shared** — The team: player cards and list, join requests,
  invites, coach notes
- [ ] **Roster detail** `/roster/[id]` · old address, **shared** — Fairway's one-player
  roster record. A coach lands on that player's Stats (`/stats?player=`), a
  player on Roster
- [x] **Team stats** `/stats` · **shared** — The coach's view is Team stats: team figures,
  strokes gained by leg per player, trends, putting, season bests and export.
  `?player=` is the coach's drill-down into one player (`StatsPlayer`). A player
  at the same address gets My stats.
- [x] **Team stats, old link** `/stats/team` · old address, **shared** — The old nav's Team stats
  address. `next.config.mjs` sends both roles to `/stats` before its page runs.
  It stays ticked because `CH_REBUILT_ROUTES.coach` still lists it.
- [x] **Calendar** `/calendar` · **shared** — Practices, qualifiers, tournaments, travel and
  meetings; week, month and agenda; attendance, overlaps, files
- [ ] **Practice** `/practice` · **shared** — Plan a practice (blocks, groups, drills), publish
  it, run it on the day, keep a drill, group and template library, and print it
  (P017). `/plan/[planId]` is **shared**. These are **coach** only, and a player
  who opens one is sent to `/practice`: `/drills`, `/drills/[drillId]`,
  `/groups`, `/templates`, `/format`, `/plan/[planId]/edit` and
  `/print/[planId]`. Built
  and in the sidebar after Calendar. Left unticked because the tick follows
  `CH_REBUILT_ROUTES` and Practice is rebuilt through `CH_REBUILT_PATTERNS`
  (`CH_PRACTICE_PAGES` in `shell/nav.ts`); see
  `pages/P017-practice/PAGE.md`
- [x] **Messages** `/messages` · **shared** — Direct and group chat with players and coaches,
  plus team announcements
- [x] **Settings** `/settings` · **shared** — Account, notifications, team and invite code,
  CoachHelm settings, preferences
- [x] **Settings: notifications** `/settings/notifications` · **shared** — Old deep link;
  opens the Notifications section
- [x] **Settings: CoachHelm** `/settings/coaching-intelligence` · **shared** — Old deep link;
  opens the CoachHelm section
- [x] **Team Hub** `/team-hub` · **shared** — Posts with read receipts, trip planning, tasks
  with completion, shared documents, this week's RSVPs (`TeamHub` coach view,
  2026-09-30; the Fairway page was player-only until its retirement on
  2026-11-14)
- [ ] **Announcements** `/announcements` · old address, **shared** — Fairway's team news.
  Not a page any more: `next.config.mjs` sends both roles to Team Hub, and
  Clubhouse also shows announcements inside Messages
- [x] **CoachHelm** `/coachhelm` · **shared** — The program pulse, each player's top signal,
  and Assign as focus or Dismiss (`CoachHelm`, 2026-09-30; spec
  `phone/coachhelm.md`; the coach's Brief below is a different screen)
- [ ] **CoachHelm Brief** `/intelligence` · old address, **coach** — Fairway's AI brief. A
  coach lands on CoachHelm (`?player=` and the Ask view carry over). A player
  gets the coach-only state
- [ ] **Ask CoachHelm** `/coachhelm/chat` · old address, **shared** — A coach lands on
  CoachHelm's Ask (`/coachhelm?view=ask`, which is **shared**), a player on
  CoachHelm
- [ ] **Genome compare** `/coachhelm/genome/compare` · old address, **coach** — A coach lands
  on Stats. A player gets the coach-only state
- [ ] **Game Fingerprint** `/players/[playerId]/game` · old address, **coach** — With
  `/game/print`. A coach lands on that player's Stats game tab
  (`/stats?player=&tab=game`). A player gets the coach-only state
- [ ] **Genome** `/players/[playerId]/genome` · old address, **coach** — Same as Game
  Fingerprint
- [x] **Recruiting HQ** `/recruiting` · **coach** — Prospects from watchlist to commitment
- [x] **Qualifiers** `/qualifiers` · **shared** — Set up and run team qualifiers that decide
  lineups. `/[id]` is **shared**. `/new`, `/[id]/edit` and `/[id]/selection`
  are **coach** only; a player gets CH-09311
- [ ] **Tournaments** `/tournaments` · **shared** — Season home, event desk, review, history,
  compare and the link inbox (P016). `/[id]` is **shared** (the coach's event
  desk, the player's own line). These are **coach** only: `/new`, `/compare`,
  `/history`, `/links`, `/[id]/edit`, `/[id]/lineup` and `/[id]/live`. Wired behind
  `golf_tournaments_v1`, off in production; unticked until the flag is on
- [ ] **Travel** `/travel` · old address, **shared** — `next.config.mjs` sends both roles
  to Team Hub's Travel tab
- [ ] **Tasks** `/tasks` · old address, **shared** — `next.config.mjs` sends both roles to
  Team Hub's Tasks tab
- [ ] **Documents** `/documents` · old address, **shared** — `next.config.mjs` sends both
  roles to Team Hub
- [x] **Rounds** `/rounds` · **shared** — Every team round: scores and per-round stats, by
  month or by player (`TeamRounds`; opens `/rounds/[id]`, whose review has the
  coach's note)
- [ ] **Round review** `/rounds/[id]/review` · old address, **shared** — `next.config.mjs`
  sends both roles to `/rounds/[id]`, the round's review, which is **shared**.
  `/rounds/course/[key]` is **shared** too; a coach reads one player there with
  `?player=`
- [ ] **Courses** `/courses` · old address, **shared** — No Clubhouse course library
  (GAP-R-12). Both roles land on Home
- [ ] **Team info** `/team` · old address, **shared** — A coach lands on Settings' Team
  section, a player on Settings' Golf section
- [x] **What's New** `/whats-new` · **coach** — The team's activity over the past 7 days
  (search palette only)
- [x] **Live** `/live` · **coach** — Who is on the course right now, hole by hole: groups,
  a filter and sort, and a player's round in a sheet or panel (opens from Home's
  Live now card, Calendar, Qualifiers and Rounds; not in the sidebar)

## Players

- [x] **My stats** `/stats` · **shared** — Their scoring, rounds, game detail, development
  and focus areas
- [x] **Calendar** `/calendar` · **shared** — Team schedule with RSVPs; teammates' classes
  stay private
- [ ] **Practice** `/practice` · **shared** — What to do at practice: their next practice (focus,
  their group, the stop on now and the next two), this week, coming up and past
  plans; only published plans (P017; with `/plan/[planId]`). Unticked for the
  same reason as the coach's line above
- [x] **Messages** `/messages` · **shared** — Chat with coaches and teammates; announcements
  with acknowledge and tasks
- [x] **Settings** `/settings` · **shared** — Account, notifications, preferences, joining a
  team
- [x] **Settings: notifications** `/settings/notifications` · **shared** — Old deep link;
  opens the Notifications section
- [x] **Settings: CoachHelm** `/settings/coaching-intelligence` · **shared** — Old deep link;
  opens the CoachHelm section
- [x] **Home** `/` · **shared** — Their day: next event with a countdown, the latest round,
  scoring and the parts of the game (`PlayerHome`, 2026-09-30; spec
  `design/handoff/Player - Home.html`, phone `phone/home-player.md`)
- [x] **CoachHelm** `/coachhelm` · **shared** — Their AI coach (`YourWeek`; a coach at the
  same address gets the team board): one thing to work on this week, then the
  other things worth knowing and what is working (2026-09-30; spec
  `phone/coachhelm.md`). Standing and Deep dive (`?view=standing|deep-dive`,
  2026-10-01) are **player** views; Ask (`?view=ask`) is **shared**. Development
  is Stats' Development tab
- [x] **My rounds** `/rounds` · **shared** — Their round history and each round's detail
  (with `/rounds/[id]`), and their history at one course (with
  `/rounds/course/[key]`: the hole map, how it plays for them, the average round
  and compare two rounds; `CoursePage`, P-7, 2026-10-25; reached from a round's
  review, the library's By course headers and round setup; a coach reads one
  player with `?player=`)
- [x] **Round entry** `/rounds/new` · **player** — Hole-by-hole or shot-by-shot scoring
  during a round (with `/rounds/continue/[id]`, also **player**; a coach on
  either gets CH-11390, over the round engine,
  2026-09-30; a submit that could not reach the server lands on Round recovery
  below; spec `design/handoff/Player - Rounds.html`, phone `phone/rounds.md`)
- [x] **Round recovery** `/rounds/recover` · **player** — The rounds this device holds that
  the server may not: restore, sync again or discard (`RoundRecover`, swap audit
  F-02; Fairway's recovery ported, no board; phone `phone/rounds.md`)
- [ ] **Round review** `/rounds/[id]/review` · old address, **shared** — `next.config.mjs`
  sends both roles to `/rounds/[id]`
- [x] **Team Hub** `/team-hub` · **shared** — Their team at a glance: RSVPs, announcements to
  acknowledge, trips, tasks, documents (`TeamHub`, 2026-09-30; spec
  `phone/team-hub.md`)
- [x] **Qualifiers** `/qualifiers` · **shared** — Their team's qualifiers, read-only, the
  ones they're entered in first: standings with their row marked, and the squad
  once confirmed (with `/[id]`). "My Qualifiers" (`/my-qualifiers`) was retired
  on 11 Nov 2026 (owner): players have one Qualifiers page, and the old address
  opens it
- [ ] **Tournaments** `/tournaments` · **shared** — Their team's events and their own line
  (P016; with `/[id]`, also **shared**; the other Tournaments pages are coach
  only and show a player the coach-only notice). Wired behind `golf_tournaments_v1`, off in production;
  the player view is a placeholder until held file 4
- [x] **Roster** `/roster` · **shared** — Their teammates, read-only: the coach's cards, list
  and phone rows with name, class and handicap, nothing to open (`TeamRoster`,
  2026-10-01; no scores, notes, requests or actions, so a card is not a control)
- [ ] **Team info** `/team` · old address, **shared** — A player lands on Settings' Golf
  section
- [ ] **Announcements** `/announcements` · old address, **shared** — `next.config.mjs` sends
  both roles to Team Hub; announcements also show inside Messages
- [x] **Classes** `/classes` · **player** — Their class schedule by term, synced to the
  calendar so coaches see when they're busy (`Classes`, 2026-09-30; spec
  `phone/classes.md`, boards `Player - Classes.html` and its Mobile board)
- [ ] **Courses** `/courses` · old address, **shared** — No Clubhouse course library; lands
  on Home

## Front door (signed out)

Not dashboard routes, so not in `CH_REBUILT_ROUTES` and not ticked here. They
rendered Clubhouse only with `golf_clubhouse_front_door` on, which stayed off at
turn-on (STATUS.md, step 5); since 2026-11-14 (#2527) the flag is gone and every
one of them draws Clubhouse. Built by 2026-10-19 (D-77); the checklist is
`screens/auth.md` and the manifest is `config/clubhouse/pages/P015-auth.json`
(join and staff invite live outside the `(auth)` group, so the manifest does not
list them; they are labelled in `config/clubhouse/other-routes.json`).

Each has a label too, because some are reached by one role only:

- **Sign in** `/golf/login` · **signed-out**
- **Welcome** `/golf/welcome` · **shared** (just signed up; a signed-out
  visitor is sent to sign in)
- **Sign up** `/golf/signup` · **signed-out** (picks coach or player)
- **Player sign-up** `/golf/player` · **player**
- **Reset password** `/golf/reset-password` · **signed-out** (phone
  `phone/reset-password.md`)
- **New coach** `/golf/coach` · **coach** (phone `phone/coach-onboarding.md`)
- **Waiting for approval** `/golf/coach/pending` · **coach** (phone
  `phone/coach-pending.md`)
- **Demo** `/golf/demo` · **signed-out** (phone `phone/demo-entry.md`)
- **Join a team** `/golf/join` · **signed-out** (anyone can enter a code)
- **Join a team (with a code)** `/golf/join/[code]` · **player** (phone
  `phone/join-team.md`)
- **Staff invite** `/golf/staff/join/[token]` · **coach** (phone
  `phone/staff-invite.md`)
- **Forgot password** `/golf/forgot-password` · old address, **signed-out**: it
  sends a signed-out visitor to `/golf/login?view=forgot`. A signed-in visitor
  still gets an old Fairway-era page there
