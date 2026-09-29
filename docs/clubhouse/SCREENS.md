# Clubhouse screens

Every GolfHelm screen live in production on the old Fairway UI, and whether
Clubhouse has rebuilt it. Tick a screen when its route is added to
`CH_REBUILT_ROUTES` (`src/clubhouse/shell/nav.ts`), which is when it reaches the
`desktop` gate in `PROGRESS.md`. `npm run clubhouse:check` fails if a ticked
screen isn't rebuilt, or a rebuilt route isn't ticked. Routes are under
`/golf/dashboard`. Redirect-only legacy links (`/alerts`, `/insights`,
`/patterns`, `/development`, `/my-development`, `/my-game-profile`,
`/my-standing`, `/analytics/coachhelm`, `/hub`) and `/dev/haptics` aren't
screens and aren't listed.

Mobile designs are tracked per screen in `PROGRESS.md` (the `phone-spec` and
`phone` gates).

## Coaches

- [x] **Home** `/` — Morning view of the program: the week ahead, who needs attention, the leaderboard, latest rounds
- [x] **Roster** `/roster` — The team: player cards and list, join requests, invites, coach notes
- [ ] **Roster detail** `/roster/[id]` — One player's roster record
- [x] **Team stats** `/stats` — Team figures, strokes gained by leg per player, trends, putting, season bests, export (also the player drill-down, `?player=`)
- [x] **Team stats, old link** `/stats/team` — The old nav's Team stats address; opens the rebuilt Team stats in place (players are sent to their own stats)
- [x] **Calendar** `/calendar` — Practices, qualifiers, tournaments, travel and meetings; week, month and agenda; attendance, overlaps, files
- [x] **Messages** `/messages` — Direct and group chat with players and coaches, plus team announcements
- [x] **Settings** `/settings` — Account, notifications, team and invite code, CoachHelm settings, preferences
- [x] **Settings: notifications** `/settings/notifications` — Old deep link; opens the Notifications section
- [x] **Settings: CoachHelm** `/settings/coaching-intelligence` — Old deep link; opens the CoachHelm section
- [ ] **Announcements** `/announcements` — Team news with read acknowledgements (Clubhouse has them inside Messages)
- [ ] **CoachHelm Brief** `/intelligence` — AI coaching brief: signals, patterns, predictions and focus areas across the team
- [ ] **Ask CoachHelm** `/coachhelm/chat` — Chat with the AI about the program, grounded in rounds and schedule
- [ ] **Genome compare** `/coachhelm/genome/compare` — Two players' skill profiles side by side, biggest differences ranked
- [ ] **Game Fingerprint** `/players/[id]/game` — One player's deep dive: where strokes are lost and gained (printable at `/game/print`)
- [ ] **Genome** `/players/[id]/genome` — One player's skill profile against a baseline, with a one-line verdict
- [ ] **Recruiting HQ** `/recruiting` — Prospects from watchlist to commitment
- [ ] **Qualifiers** `/qualifiers` — Set up and run team qualifiers that decide lineups (with `/new`, `/[id]`, `/[id]/edit`)
- [ ] **Travel** `/travel` — Tournament trips: itineraries and logistics, linked from Calendar events
- [ ] **Tasks** `/tasks` — Assign tasks to players and track completion live
- [ ] **Documents** `/documents` — Team files and resources (Calendar can already attach them)
- [ ] **Rounds** `/rounds` — Every team round: scores and per-round stats (with `/rounds/[id]`)
- [ ] **Round review** `/rounds/[id]/review` — AI analysis of one round: grade, scoring mix, 18-hole filmstrip
- [ ] **Courses** `/courses` — Course library: courses, tee sets, home courses
- [ ] **Team info** `/team` — Team details, settings and roster information
- [ ] **What's New** `/whats-new` — The team's activity over the past 7 days (search palette only)

## Players

- [x] **My stats** `/stats` — Their scoring, rounds, game detail, development and focus areas
- [x] **Calendar** `/calendar` — Team schedule with RSVPs; teammates' classes stay private
- [x] **Messages** `/messages` — Chat with coaches and teammates; announcements with acknowledge and tasks
- [x] **Settings** `/settings` — Account, notifications, preferences, joining a team
- [x] **Settings: notifications** `/settings/notifications` — Old deep link; opens the Notifications section
- [x] **Settings: CoachHelm** `/settings/coaching-intelligence` — Old deep link; opens the CoachHelm section
- [ ] **Home** `/` — Their day: next event, recent rounds, what the coach asked for
- [ ] **CoachHelm** `/coachhelm` — Their AI coach: Game, Plan (development), Profile and Standing views
- [ ] **My rounds** `/rounds` — Their round history and each round's detail (with `/rounds/[id]`)
- [ ] **Round entry** `/rounds/new` — Hole-by-hole or shot-by-shot scoring during a round (with `/rounds/continue/[id]`, `/rounds/recover`)
- [ ] **Round review** `/rounds/[id]/review` — AI analysis of a round they played
- [ ] **Team Hub** `/team-hub` — Their team at a glance: tasks, announcements, travel, classes, teammates
- [ ] **My Qualifiers** `/my-qualifiers` — Their qualifier rounds and where they stand
- [ ] **Roster** `/roster` — Their teammates
- [ ] **Team info** `/team` — Team details
- [ ] **Announcements** `/announcements` — Team news from the coaches (Clubhouse has them inside Messages)
- [ ] **Classes** `/classes` — Their class schedule by term, synced to the calendar so coaches see when they're busy
- [ ] **Courses** `/courses` — Course library and tee sets
