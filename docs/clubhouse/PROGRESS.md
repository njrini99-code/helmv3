# Clubhouse progress

The from-scratch GolfHelm UI. Code: `src/clubhouse/`. Spec: `design/handoff/`
(desktop, owner-approved). Flag: `golf_clubhouse_ui` (production off). Rules:
`.claude/rules/clubhouse.md`. Adding a new design: `README.md`. Enforcement: `npm run clubhouse:check`, which
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
| `phone-spec` | `docs/clubhouse/phone/<screen>.md` is approved: it maps the owner's mobile design in `design/handoff/mobile/`, or is a draft the owner approved (`MOBILE.md`) |
| `phone` | The phone design is built at 390px, with safe areas and the bottom tab bar, and checked on a real iPhone through `npm run ios:dev` |
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

## Where we left off (2026-09-29)

All eight built pages (shell, Home, Roster, Stats team and player, Calendar,
Messages, Settings) carry the full state catalog, with tests, a11y scans and
the build green. PR #2102 is a draft, current with `main` and mergeable. CI
runs in full only when it is marked ready for review (an owner call: about 55
runner-minutes).

Starting the next session:

1. Work in `/Users/ricknini/worktrees/helmv3/clubhouse` on `agent/clubhouse`;
   `git status` should be clean.
2. New desktop designs: follow `README.md`. New mobile designs: follow
   `MOBILE.md`. Build the foundation (tab bar, top bar, sheets) before any
   page's phone version.
3. The screen-by-screen checklist is `SCREENS.md`. Waiting on designs: CoachHelm, Rounds, Practice, Lineups, Events,
   Scouting, the player app, the phone foundation (push prompt, pull to
   refresh), and each page's mobile design.
4. Nothing gets applied: no migrations, no deploys, the flag stays off
   (owner, 2026-09-29). Work that needs a schema change is written as a
   migration and left unapplied. Open for the owner: marking #2102 ready for
   review, and the live pass on a Vercel preview (Q-4).

## Screens

<!-- clubhouse:screens:start -->
| Screen | Route | spec | desktop | wired | states | error-tracking | phone-spec | phone | motion | accessibility | performance | verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Foundation | (shell, tokens, primitives) | done | doing | doing | doing | doing | doing | todo | doing | doing | doing | todo |
| Home | /golf/dashboard | done | doing | doing | doing | doing | doing | todo | todo | doing | doing | todo |
| Roster | /golf/dashboard/roster | done | done | done | doing | doing | done | todo | doing | doing | doing | todo |
| Stats (team) | /golf/dashboard/stats | done | done | done | doing | doing | doing | todo | doing | doing | doing | todo |
| Stats (player) | /golf/dashboard/stats?player= (coach), /golf/dashboard/stats (player) | done | done | done | doing | doing | doing | todo | doing | doing | doing | todo |
| Calendar | /golf/dashboard/calendar (coach and player) | done | done | done | doing | doing | doing | todo | doing | doing | doing | todo |
| Messages | /golf/dashboard/messages (coach and player) | done | done | done | doing | doing | doing | todo | doing | doing | doing | todo |
| Settings | /golf/dashboard/settings (coach and player) | done | doing | doing | doing | doing | doing | todo | doing | doing | doing | todo |
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
- D-18 (2026-09-29): Settings is one page with a section rail (owner). The handoff has no Settings screen, so it is built strictly from the design system: Surface cards, Inset, PopoverPanel, FormField, Select, Switch, Segmented; the selected section is a flat green tint (owner). Both notification stores stay, shown as "Email and push" and "CoachHelm updates" (owner). Only preferences Clubhouse honours are shown: animations (now wired to every Clubhouse transition) and haptics; theme waits for the dark theme (owner). Coaching intelligence is the CoachHelm section (owner). Writes keep the current tables and actions; new: a typed "delete" to delete an account, a confirm before a new invite code, and blank organization fields can now be cleared.
- D-19 (2026-09-29): The bell and every menu use the design system's PopoverPanel (strong glass, 14px radius, 34px items).
- D-20 (2026-09-29): Every error, empty, loading, confirm, motion, haptic and accessibility state has a catalog number (`docs/clubhouse/catalog/`, CH- plus four digits: page, then kind). The number is on the element as `data-ch-code`, each enforced row is forced in a test named by it, and `clubhouse:check` fails when code, catalog and tests disagree. Not sent to Sentry or the Bridge yet (owner). Pages are catalogued one at a time, each reviewed before the next (owner: go slow).
- D-21 (2026-09-29): Pages after the first eight get two-digit catalog page numbers (`CH-09001`), in the order their catalogs are started, so existing numbers never change (owner). A catalog file without a page number fails `clubhouse:check`.
- D-22 (2026-09-29): Phone is iPhone only (portrait, light). The owner supplies mobile designs in `design/handoff/mobile/`; a page's design there is its approved phone spec and replaces the draft in `docs/clubhouse/phone/`. Pages without one keep their draft, which still needs approval. Device testing goes through `npm run ios:dev` (a dev-only `CAP_SERVER_URL`; the committed native config stays production, pinned by a test) (owner). Built before any design: the swipe-back guard in the Clubhouse shell, and push-token teardown on Clubhouse sign-out. The push soft ask and pull to refresh wait for the foundation design.
- D-23 (2026-09-29): The old Team stats address `/stats/team` renders the rebuilt Team stats in place, never a redirect (a `redirect()` from a conditional branch crashed `/stats` in production, #310), with the Clubhouse stats skeleton as its `loading.tsx`. It is a coach page: players are sent to their own stats, as before. The design project's `Stats.html` adds a Qualifiers item to the sidebar; Qualifiers is still in design, so the nav is unchanged (owner).
- D-7 (2026-09-29): Errors reuse the existing pipeline (`logError`, `logServerError`, chunk and stale-action recovery) with a Clubhouse view and voice. The messages coaches see say what failed and what to do next, and never show raw server text.
- D-50 (2026-09-29, owner, Q-30): On the phone, Roster lives under More, per the foundation decision (D-40 onward): the design's five-tab ivory bar for coaches, and More stays a sheet.
- D-51 (2026-09-29, owner, Q-31): The Roster phone profile shows real fields only (hometown, high school, class of, jersey when set, member since). No migration is written for captain, major, bio or home course. Birthday is never collected.
- D-52 (2026-09-29, owner, Q-32): Plan 1:1 opens the Calendar new-event editor with that player invited, through a new Calendar seed `?new=1&with=<playerId>`.
- D-53 (2026-09-29, owner, Q-33): "All N" rounds opens the player's Stats on the Rounds tab for the season (`stats?player=<id>&window=season&tab=rounds`). StatsPlayer takes a `tab` URL parameter.
- D-54 (2026-09-29, owner, Q-34): The profile's ⋯ opens an action sheet (View stats, then Remove from team with the CH-3501 confirm). The top bar's invite button opens the existing Invite players sheet. There is still no invite by email.
- D-55 (2026-09-29, owner, Q-35): Approve all runs the existing approve action one request at a time, through `useAction`. It names every request that failed and says how many were added.
- D-56 (2026-09-29, owner, Q-36): On the phone, the profile keeps the coach's note after About and drops Development counts. Export, search, the status filter, the layout toggle, the Needs-a-look chips and the Handicap and Rounds sorts stay desktop only.
- D-57 (2026-09-29, owner, Q-37): A form sparkline shows from 3 rounds, the same threshold as desktop and every other page.
- D-58 (2026-09-29, owner, Q-38): The phone's Inactive section lists `status = inactive` members, with their form as the note, and the profile adds "Inactive" to its identity line.
- D-59 (2026-09-29, owner, Q-39): The phone's Name sort is by last name, as on desktop.

## Open owner questions

- Q-1 Roster status: decided 2026-09-29, add a separate availability field. The migration `supabase/migrations/20260929120000_golf_team_members_availability.sql` is written and stays unapplied: the owner is not applying migrations (2026-09-29). The Roster pill stays read-only.
- Q-2 Navigation: decided 2026-09-29, Practice and Events stay hidden until each has its own design.
- Q-3 Phone specs: decided 2026-09-29 (D-22). The owner's mobile designs in `design/handoff/mobile/` are the phone specs; the drafts in `docs/clubhouse/phone/` only matter for pages without one, and still need approval.
- Q-4 Rollout: decided 2026-09-29, the flag stays off in production; the owner does a live pass on a Vercel preview with real coach and player accounts first.
- Q-30 Roster phone, where Roster lives: answered 2026-09-29 (D-50). Roster lives under More, per the foundation decision (D-40 onward).
- Q-31 Roster phone, fields with no column: answered 2026-09-29 (D-51). Real fields only, no migration, and birthday is never collected.
- Q-32 Roster phone, Plan 1:1: answered 2026-09-29 (D-52). It opens the Calendar new-event editor with that player invited, via `?new=1&with=<playerId>`.
- Q-33 Roster phone, "All N" rounds: answered 2026-09-29 (D-53). It opens Stats on the Rounds tab for the season.
- Q-34 Roster phone, ⋯ and invite targets: answered 2026-09-29 (D-54). ⋯ opens an action sheet, and invite opens the existing Invite players sheet.
- Q-35 Roster phone, Approve all: answered 2026-09-29 (D-55). It loops the existing approve action, names every failure and counts the successes.
- Q-36 Roster phone, desktop-only features: answered 2026-09-29 (D-56). The coach's note stays on the phone, and the rest stays on desktop.
- Q-37 Roster phone, sparkline threshold: answered 2026-09-29 (D-57). 3 rounds.
- Q-38 Roster phone, Inactive: answered 2026-09-29 (D-58). Inactive is labelled on the phone.
- Q-39 Roster phone, name sort: answered 2026-09-29 (D-59). By last name.

## Data gaps (shown honestly, never invented)

- Home: the prototype's weather and "Week 7 of 12" have no source (golf teams have no season start or end dates). They are omitted until one exists.
- Home: the prototype's "Open recap" needs a single-round screen, which isn't rebuilt. The link opens the player's stats and says so.
- Shell: the top-bar search (⌘K) needs its own spec. It is not rendered until then, so there is no dead control.
- Shell: Practice and Events are in the design's navigation but have no route. They are hidden until the owner decides what they point to.
- Roster: the design's Captain role, major, birthday, home course and "about" line have no columns. Real fields are shown instead: hometown, high school, class and jersey. A migration for captain, major and bio can be written once you decide which you want (birthdays are minors' PII).
- Roster: owner, 2026-09-29: cards show no jersey number (the handoff has none; Captain waits for a column); the layout toggle and the panel order follow the handoff (the panel sits after the cards when there is no room beside them).
- Roster: invite-by-email has no server action. The invite sheet offers the join code, a copy button and the native share sheet for the join link.
- Roster: "Schedule 1:1" and "View insights" wait for Calendar and CoachHelm. They are hidden until then.
- Roster (phone), 2026-09-29, owner design `Roster Mobile.html`. The owner answered Q-30 to Q-39 (D-50 to D-59).
  - The design's Captain chip, major, About prose, home course and birthday have no columns, and none is added (D-51). Birthday is minors' PII. The profile shows hometown, high school, class, jersey when set, and member since.
  - Live data: no member has a jersey number, 12 of 106 players have a high school, and 90 have a hometown.
  - The inactive row note ("Medical · wrist") needs the unapplied Q-1 availability migration.
  - Plan 1:1: the Calendar editor couldn't be seeded with a single invitee, and a new event invited every player. It gains `with=<playerId>` (D-52).
  - "All N" rounds: the player's Stats Rounds tab couldn't be opened from the URL. StatsPlayer gains `tab=rounds`, and `window=season` matches Roster's count (D-53).
  - "Approve all" has no bulk action. It loops the existing one (D-55; live: 0 pending requests on any team).
  - Invite by email still has no action. The ⋯ menu's contents aren't drawn.
  - The join code is drawn in tracked mono. It maps to the desktop treatment (Instrument Sans).
  - Sparkline threshold: 3 rounds, as on every page (D-57).

- Stats (player), 2026-09-29 fidelity: the strokes gained by leg chart is the design system's StrokesGainedRoute (it had been bars), the Rounds count is the design system's tab pill, and a coach reads "Stats › name" in the top bar. The scoring chart's "Season best" marker and "Par 72" meta wait for season-best and course-par data per window.
- Stats: the prototype's PredictionCard, "vs tour" figures and D1 benchmarks for fairways and putts per round have no source. They are omitted, and D1 shows only where `golf_pga_standards` has the metric.
- Calendar: "Print week" and "Duplicate" are not built. "Checked" in Sources is the time the server read the data.

- Settings: theme (light, dark, system), display density, date format, score display and distance units aren't shown; Clubhouse doesn't honour them yet (light only until the dark theme). The current app's controls keep working with the flag off.
- Settings: the comparison weights stay hidden, as in the current app.
- Messages: threaded replies and a shared-files list in details have no backend. They are not shown.
- Messages: the thread header's search icon is not built; message search is team-wide (`searchGolfMessages` takes no conversation) and lives in the rail. The typing indicator shows an avatar in direct threads only, because the realtime hook reports that someone is typing, not who.

## Verification log

<!-- Append: date, screen, gate, what ran, result. -->
- 2026-09-29 · Stats (team, player) · desktop, wired: typecheck 0, eslint 0 errors, clubhouse:check clean, vitest 16/16. Preview at 924, 1280 and 1400px against stats-team-01..05 and stats-player-01..14; states empty, loading, early, self. No console errors.
- 2026-09-29 · Calendar · desktop, wired: typecheck 0, eslint 0 errors, clubhouse:check clean, vitest 21/21. Preview at 924, 1280 and 1400px against calendar-01..12 (week, day, month, agenda, event, overlap, attendance, editor); player view; states failed, partial, loading. No console errors.
- 2026-09-29 · Messages · desktop: typecheck 0, eslint 0 errors, clubhouse:check clean, vitest 21/21. Preview at 924, 1280 and 1400px against messages-01..04 (team thread, direct, group details, new group validation); send, react, edit, delete and attachments driven through the preview; states empty, failed. No console errors.
- 2026-09-29 · Fidelity pass (Home, Stats team, Calendar, Messages, shell) · desktop: rendered each handoff prototype and our preview side by side at 1280px and fixed what differed. Home subline, Message team and New event, agenda invitee details, "First tee 8:42 · 5 of 6 confirmed", "No rounds 9 days", the Full roster arrow and the stats link; the notifications bell; the sidebar readiness bar; team putting rings at the handoff's size; Longest putt made; Calendar "Checked"; the Messages typing avatar. typecheck 0, vitest logic 32/32, preview states bell empty, failed and filter. No console errors.
- 2026-09-29 · Settings · desktop: built from the design system at 1280px (coach: account, notifications, team, CoachHelm, preferences; player: account, golf profile, notifications); preview states player, noteam, failed, partial, assistant, failwrites, loading. Fixed a live bug found on the way: `push_announcements` was stripped on save and read as off (test added). typecheck 0.
- 2026-09-29 · Settings and shell · catalog: 76 Settings and 14 shell tests, each named by its number; clubhouse:check enforces the catalog. Found and fixed on the way: every Clubhouse toast rendered outside the Clubhouse root and so had no background; the browser's own email bubble covered ours; the photo coin lost its initials while the name was empty.
- 2026-09-29 · Roster · phone-spec, still `doing`: `phone/roster.md` rewritten from the owner's design. The three boards were rendered at 390 × 844, and 14 states were captured (sorts, inactive, long names, sheet with two and five requests, profile top and About, captain, early read, inactive). The current preview was captured at 390px (default, player open, invite, list, empty, failed, partial, loading). The gate stays `doing` because Q-31 to Q-39 are open and the decided foundation (D-40 onward) isn't on this branch yet. Later the same day, the spec was updated with the owner's foundation answers: five coach tabs with Roster under More, More still a sheet, red for destructive actions, no Safari bar, neutral phone avatars, and pull to refresh waiting for a design.
- 2026-09-29 · Roster · phone-spec, done: the owner answered Q-30 to Q-39 (D-50 to D-59), and the foundation is decided (D-40 onward). Every phone-spec box in `screens/roster.md` is checked. clubhouse:check is clean.
- 2026-09-29 · Roster · phone build, the parts that don't depend on the shell (the `phone` gate stays `todo` until the foundation lands and a device pass is done). Built: RosterPhone, RosterPhoneRow and RosterProfile (`useChPhone`, `?player=` in the URL), the phone skeleton, the Calendar 1:1 seed (D-52), the Stats `tab` parameter (D-53), and the Approve all loop (D-55, CH-3007). CH-3806 is catalogued. typecheck 0; eslint 0 on the changed files; `npx vitest run src/clubhouse` 295/295; clubhouse:check clean. `clubhouse:a11y` on :3106 is clean for roster (14 pages at 1280 and 390, including the phone profile and its menu), calendar (20; the known 390px week target-size remains) and stats-player (14). Preview at 390 × 844 compared with the design captures: list, inactive, SG sort, profile, About, early read, inactive profile, loading and failed. No console errors.
- 2026-09-29 · Stats (team) · old link: `/stats/team` opens the rebuilt Team stats for coaches. Compared the design project's `Stats.html`, `stats.jsx`, `stats.css`, `cal.css`, `depth.css`, `sidebar.css` and the colour and elevation tokens with `design/handoff/`: identical apart from the Qualifiers nav item (not built, owner). 
