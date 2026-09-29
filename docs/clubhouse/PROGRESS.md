# Clubhouse progress

The from-scratch GolfHelm UI. Code: `src/clubhouse/`. Spec: `design/handoff/`
(desktop, owner-approved). Flag: `golf_clubhouse_ui` (production off). Rules:
`.claude/rules/clubhouse.md`. Enforcement: `npm run clubhouse:check`, which
also validates this file.

Nothing in `src/clubhouse/` imports or styles through Fairway. Shared
non-UI plumbing (session, Supabase loaders, the Capacitor haptics bridge) is
allowed.

## How a screen moves

A screen advances one gate at a time. Each gate is checked (`[x]`) only when
its evidence exists. The phone gates are separate from the desktop gates
because every screen gets its own native phone design, never a squeezed
desktop.

| Gate | Done when |
| --- | --- |
| `spec` | The desktop reference is identified, the data sources are mapped, and gaps are logged below |
| `desktop` | Built pixel-accurate against the reference screenshots at 924px and 1280px |
| `wired` | Every figure comes from a real loader, and null, zero and early-read states render distinctly |
| `states` | Empty, loading and failed-read states are designed and built, and they are distinct from each other. Every action goes through `useAction`, so a failure tells the coach what failed and what to do next, fires an error haptic and is reported to Sentry. Route errors render the Clubhouse error view |
| `error-tracking` | Server reads log through `chLogServer`, client crashes through `chReport` (tagged `ui=clubhouse` and `surface`), intents leave breadcrumbs, nothing is swallowed, and every failure path was forced once |
| `phone-spec` | A written native phone design (`docs/clubhouse/phone/<screen>.md`) is approved by the owner |
| `phone` | The phone design is built at 390px, with safe areas and the bottom tab bar |
| `motion` | Transitions, press and haptics are wired within the doctrine (90/150/220/360ms, 0.985 press, no count-ups or staggers) |
| `accessibility` | Keyboard path, landmarks and roles, chart text equivalents, announced status changes, AA contrast |
| `performance` | No server waterfall, client JS only on interactive islands, no layout shift after first paint |
| `verified` | typecheck, lint, tests and `clubhouse:check` are green, and a browser pass on desktop and phone is logged below |

Statuses are `todo`, `doing`, `blocked (reason)` and `done`.

Each screen past `spec` has a checklist at `docs/clubhouse/screens/<slug>.md`,
copied from `CHECKLIST_TEMPLATE.md`. It has one section per gate, and
`clubhouse:check` refuses a `done` gate while its section still has an
unchecked box. That checklist is the definition of pro quality for the
screen.

## Screens

<!-- clubhouse:screens:start -->
| Screen | Route | spec | desktop | wired | states | error-tracking | phone-spec | phone | motion | accessibility | performance | verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Foundation | (shell, tokens, primitives) | done | doing | doing | doing | doing | doing | todo | doing | doing | doing | todo |
| Home | /golf/dashboard | done | doing | doing | doing | doing | doing | todo | todo | doing | doing | todo |
| Roster | /golf/dashboard/roster | done | done | done | doing | doing | doing | todo | doing | doing | doing | todo |
| Stats (team) | /golf/dashboard/stats | done | done | done | doing | doing | doing | todo | doing | doing | doing | todo |
| Stats (player) | /golf/dashboard/stats?player= (coach), /golf/dashboard/stats (player) | done | done | done | doing | doing | doing | todo | doing | doing | doing | todo |
| Calendar | /golf/dashboard/calendar (coach and player) | done | done | done | doing | doing | doing | todo | doing | doing | doing | todo |
| Messages | /golf/dashboard/messages (coach and player) | done | done | done | doing | doing | doing | todo | doing | doing | doing | todo |
| CoachHelm | /golf/dashboard/coachhelm | blocked (still in design) | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo |
| Rounds, Practice, Lineups, Events, Scouting | various | blocked (no design yet) | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo |
| Player app (all screens) | /golf/dashboard (player role) | blocked (no design yet) | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo |
<!-- clubhouse:screens:end -->

## Decisions

- D-1 (2026-09-29): Parallel and flag-gated. Coaches and players both get Clubhouse where a screen is rebuilt for their role (Stats, Calendar and Messages have player versions with the permissions players already have); every other route shows the not-rebuilt notice with a link back.
- D-2 (2026-09-29): Light theme only. The handoff's chart colours are tuned for light paper, and dark mode is not designed.
- D-3 (2026-09-29): Phone navigation is a bottom tab bar in the ivory-pass style, with a selection haptic on tab change.
- D-4 (2026-09-29, revised the same day by the owner): Home has the screenshot's two actions as "Message team" (opens the team chat) and "New event" (opens the Calendar editor; N on Home). The README's "removed" note is superseded.
- D-5 (2026-09-29): Each screen gets a written phone design that the owner approves before it is built.
- D-6 (2026-09-29): Schema changes are written as migrations and never applied by an agent.
- D-8 (2026-09-29): Calendar state lives in the URL (`view`, `date`, `event`), not localStorage, so every view is linkable and the server renders the right window on first paint. Moving inside the loaded window is instant; moving past it loads the next window.
- D-9 (2026-09-29): Calendar overlaps are computed from the loaded events and classes (the same data the grid shows), not from the 14-day conflict inbox, so the panel, the grid badges and the editor always agree.
- D-10 (2026-09-29): Players never see a teammate's classes, not even as Busy. The handoff showed "Busy" blocks; the live privacy rule (`attributeClassEvents`) is stricter and wins.
- D-11 (2026-09-29): Calendar types are the database's (practice, qualifier, tournament, meeting, travel, other). The handoff's Workout type has no column value; workouts are practices until a migration adds one.
- D-12 (2026-09-29): Two calendar feeds (team and personal) instead of the handoff's three; the database has no competition-only feed. "Keep as is" on an overlap changes nothing and sends nothing, and says so.
- D-13 (2026-09-29): Messages keeps the existing realtime hooks and actions untouched; Clubhouse is a new view over them. The handoff's Announcement mode (urgent, acknowledge) has no backend and is not offered; coaches create named team groups instead.
- D-14 (2026-09-29): Reactions keep their stored values and render as icons (thumbs up, heart, laugh, party, surprised, thanks), because Clubhouse shows no emoji.
- D-15 (2026-09-29): Players start direct threads only, as in the current app. Group creation stays with coaches until the owner decides otherwise.
- D-16 (2026-09-29): Built the five follow-ups on existing backends. Event files (attach from Documents, remove with Undo); the coach's own busy time (add, view, remove; only they see it); message search through `searchGolfMessages`; per-conversation mute, which the message fan-out now honours (no email, push or bell while muted); announcements with acknowledgement and tasks, posted by coaches from New message.
- D-17 (2026-09-29): Fidelity pass against the handoff. The top-bar bell is the current app's notification feed (same actions, badge poll and read state) in Clubhouse styling. "Ready" is read as accepted RSVPs ("5 of 6 confirmed") on Home and in the sidebar card. Home's greeting subline states facts from the leaderboard (slipping form, no round in 7 days) and the week's next competition; it is absent when the rounds read failed. The latest round links to the player's stats, labelled as such, because no single-round recap is rebuilt.
- D-7 (2026-09-29): Errors reuse the existing pipeline (`logError`, `logServerError`, chunk and stale-action recovery) with a Clubhouse view and voice. The messages coaches see say what failed and what to do next, and never show raw server text.

## Open owner questions

- Q-1 Roster status: decided 2026-09-29, add a separate availability field. The migration `supabase/migrations/20260929120000_golf_team_members_availability.sql` is written and not applied (review, then `npm run db:apply`, then `npm run db:types`). The Roster pill stays read-only until the column exists.
- Q-2 Navigation: decided 2026-09-29, Practice and Events stay hidden until each has its own design.
- Q-3 Phone specs (`docs/clubhouse/phone/*.md`): the owner is reviewing them. Nothing phone-specific is built until each file says `Status: approved`.
- Q-4 Rollout: decided 2026-09-29, the flag stays off in production; the owner does a live pass on a Vercel preview with real coach and player accounts first.

## Data gaps (shown honestly, never invented)

- Home: the prototype's weather and "Week 7 of 12" have no source (golf teams have no season start or end dates). They are omitted until one exists.
- Home: the prototype's "Open recap" needs a single-round screen, which isn't rebuilt. The link opens the player's stats and says so.
- Shell: the top-bar search (⌘K) needs its own spec. It is not rendered until then, so there is no dead control.
- Shell: Practice and Events are in the design's navigation but have no route. They are hidden until the owner decides what they point to.
- Roster: the design's Captain role, major, birthday, home course and "about" line have no columns. Real fields are shown instead: hometown, high school, class and jersey. A migration for captain, major and bio can be written once you decide which you want (birthdays are minors' PII).
- Roster: invite-by-email has no server action. The invite sheet offers the join code, a copy button and the native share sheet for the join link.
- Roster: "Schedule 1:1" and "View insights" wait for Calendar and CoachHelm. They are hidden until then.

- Stats: the prototype's PredictionCard, "vs tour" figures and D1 benchmarks for fairways and putts per round have no source. They are omitted, and D1 shows only where `golf_pga_standards` has the metric.
- Calendar: "Print week" and "Duplicate" are not built. "Checked" in Sources is the time the server read the data.

- Messages: threaded replies and a shared-files list in details have no backend. They are not shown.
- Messages: the thread header's search icon is not built; message search is team-wide (`searchGolfMessages` takes no conversation) and lives in the rail. The typing indicator shows an avatar in direct threads only, because the realtime hook reports that someone is typing, not who.

## Verification log

<!-- Append: date, screen, gate, what ran, result. -->
- 2026-09-29 · Stats (team, player) · desktop, wired: typecheck 0, eslint 0 errors, clubhouse:check clean, vitest 16/16. Preview at 924, 1280 and 1400px against stats-team-01..05 and stats-player-01..14; states empty, loading, early, self. No console errors.
- 2026-09-29 · Calendar · desktop, wired: typecheck 0, eslint 0 errors, clubhouse:check clean, vitest 21/21. Preview at 924, 1280 and 1400px against calendar-01..12 (week, day, month, agenda, event, overlap, attendance, editor); player view; states failed, partial, loading. No console errors.
- 2026-09-29 · Messages · desktop: typecheck 0, eslint 0 errors, clubhouse:check clean, vitest 21/21. Preview at 924, 1280 and 1400px against messages-01..04 (team thread, direct, group details, new group validation); send, react, edit, delete and attachments driven through the preview; states empty, failed. No console errors.
- 2026-09-29 · Fidelity pass (Home, Stats team, Calendar, Messages, shell) · desktop: rendered each handoff prototype and our preview side by side at 1280px and fixed what differed. Home subline, Message team and New event, agenda invitee details, "First tee 8:42 · 5 of 6 confirmed", "No rounds 9 days", the Full roster arrow and the stats link; the notifications bell; the sidebar readiness bar; team putting rings at the handoff's size; Longest putt made; Calendar "Checked"; the Messages typing avatar. typecheck 0, vitest logic 32/32, preview states bell empty, failed and filter. No console errors.
