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
| Roster | /golf/dashboard/roster | done | done | done | doing | doing | doing | todo | doing | doing | doing | todo |
| Stats (team) | /golf/dashboard/stats | done | done | done | doing | doing | doing | todo | doing | doing | doing | todo |
| Stats (player) | /golf/dashboard/stats?player= (coach), /golf/dashboard/stats (player) | done | done | done | doing | doing | doing | todo | doing | doing | doing | todo |
| Calendar | /golf/dashboard/calendar (coach and player) | done | done | done | doing | doing | doing | todo | doing | doing | doing | todo |
| Messages | /golf/dashboard/messages (coach and player) | done | done | done | doing | doing | doing | todo | doing | doing | doing | todo |
| Settings | /golf/dashboard/settings (coach and player) | done | doing | doing | doing | doing | doing | todo | doing | doing | doing | todo |
| Qualifiers | /golf/dashboard/qualifiers with /new, /[id], /[id]/edit (coach; list and detail also player), /golf/dashboard/my-qualifiers (player) | done | todo | todo | todo | todo | doing | todo | todo | todo | todo | todo |
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
- D-30 (2026-09-29, Q-5, Q-6): Qualifiers is one page for both roles. Players get a read-only list and detail of their team's qualifiers, with their own entries first, their row marked on the leaderboard, and the confirmed squad once the coach has committed it. Players get no create, edit, close, round-by-round or pick reasoning. `/my-qualifiers` renders the same list filtered to their entries, in place. Enter round waits for Round entry to be rebuilt (owner).
- D-31 (2026-09-29, Q-7): Closed means closed. Close and Reopen call `updateQualifierStatus`. The closed notice says players can't enter or submit rounds until the coach reopens it (the live `submit_round_atomic` rule), and Reopen shows on every completed qualifier. No migration (owner).
- D-32 (2026-09-29, Q-10, Q-11): Edit qualifier is built as the create form, prefilled, plus new server actions for squad size and picks and for adding or removing entrants. The selection workspace is not built, so there is no "Open selection workspace" or "Manage selections" until it is designed. The Selections card shows who is auto-qualifying now, and the confirmed squad read-only once `selection_state = 'selected'` (owner). What the workspace does: it is where a coach turns the leaderboard into the travel squad, by keeping the top finishers, choosing the coach's-pick players with a written reason, and confirming the squad so players are told.
- D-33 (2026-09-29, Q-8, Q-9, Q-12 to Q-15, Q-17 to Q-20): The recommendations in those questions are accepted as written (owner):
  - one server ranking (to par, then total strokes, then more rounds), with "Qualifying" while live;
  - spots from `selection_slots_total`;
  - a course per round with no date, and the per-round course and tee picker kept in the forms;
  - par per round from the tee or the rounds, and one par only when every round agrees;
  - round-by-round, teammates' scorecards and pick reasoning coach-only;
  - Qualifiers under Program, and Lineups hidden;
  - a static Live dot;
  - raw colours mapped to tokens, with two new ones;
  - every column fits at 924 and up;
  - the phone form keeps every web field.

  Q-16 stays open with the phone foundation.

## Open owner questions

- Q-1 Roster status: decided 2026-09-29, add a separate availability field. The migration `supabase/migrations/20260929120000_golf_team_members_availability.sql` is written and stays unapplied: the owner is not applying migrations (2026-09-29). The Roster pill stays read-only.
- Q-2 Navigation: decided 2026-09-29, Practice and Events stay hidden until each has its own design.
- Q-3 Phone specs: decided 2026-09-29 (D-22). The owner's mobile designs in `design/handoff/mobile/` are the phone specs; the drafts in `docs/clubhouse/phone/` only matter for pages without one, and still need approval.
- Q-4 Rollout: decided 2026-09-29, the flag stays off in production; the owner does a live pass on a Vercel preview with real coach and player accounts first.

Qualifiers (design `Qualifiers.html` and `Qualifiers Mobile.html`, dropped in 2026-09-29; map in `screens/qualifiers.md`). The owner answered every question except Q-16 on 2026-09-29 (D-30 to D-33). Each still shows the options as they were put.

- Q-5 (answered 2026-09-29, D-30) Player view (the design is coach-only):
  - Recommended: one page for both roles, like Calendar, built from the design system and reviewed by the owner, like Settings (D-18).
    - Players see the team's qualifiers, their own first, with their position, rounds and to-par.
    - The detail is read-only: facts, leaderboard with cut lines and their own row marked, course per round, scoring rules, and the confirmed squad once `selection_state = 'selected'`.
    - No Create, Edit, Close, selections, round-by-round or pick reasoning.
    - `/my-qualifiers` opens the same list filtered to their entries, rendered in place (D-23).
  - Trade-off: the player marks (the "You" row, their standing) are not drawn.
  - Alternative: coaches first, and players wait for a player design.
- Q-6 (answered 2026-09-29, D-30) The player's main action, entering a qualifier round (`/rounds/new?qualifier=`), isn't rebuilt, and `rebuiltHref` would hide it. With the flag on, `/rounds/new` already shows the not-rebuilt notice (`NotRebuilt`, CH-1301, a link back to Home), so today's flag-on players can't enter a round anywhere in Clubhouse.
  - Recommended: ship the read-only player view (Q-5) with the coach page, and add Enter round when Round entry is rebuilt.
  - Trade-off: players see their standing but enter rounds only with the flag off until then. That is no worse than the notice they get now.
  - Alternative: hold the player view until Round entry is rebuilt. Round entry has no design yet, so players would have no Qualifiers in Clubhouse until one is designed and built.
- Q-7 (answered 2026-09-29, D-31) Close and Reopen map to `updateQualifierStatus` (`completed`, `in_progress`). The design's closed notice says "Rounds already started can still be submitted". Live `submit_round_atomic` refuses every round linked to a completed qualifier, including a started one. The `golf.ts` comment says that refusal was removed on 2026-08-31; the feature doc says it stays.
  - Recommended: the copy follows the live rule: "Players can't enter or submit rounds until you reopen it."
  - Also recommended: Reopen shows on every completed qualifier. The design has it only right after a close; the feature doc requires a way back.
  - Trade-off: if started rounds should still submit after a close, that is a migration to write (unapplied) changing the RPC guard.
- Q-8 (answered 2026-09-29, D-33) Ranking, which disagrees in four places:
  - the design's code: rounds played, then to-par, then last round;
  - the design's caption: to-par, then fewer rounds pending;
  - `getQualifierLeaderboard`: to-par, then total strokes, then more rounds;
  - the workspace loader: entry aggregates; the RPC `get_qualifier_leaderboard`: gross total.
  - Recommended: one server ranking, the live action's. The leaderboard, cut lines, "Auto-qualifying now" and the workspace all use it, and the caption says exactly that. While a qualifier is live, "Locked" becomes "Qualifying", because nothing is locked before the last round. The "final-round scorecard playoff" stays rules text; it is not computed.
  - Trade-off: different from the drawn order and label.
- Q-9 (answered 2026-09-29, D-33) Spots: two columns hold it. `selection_slots_total` is what the create form writes and the workspace uses. Legacy `spots_available` is set on 8 of 18 live qualifiers and differs on 1.
  - Recommended: show `selection_slots_total` everywhere.
  - Trade-off: that one qualifier shows a different number from the old page.
- Q-10 (answered 2026-09-29, D-32) Selection workspace: "Open selection workspace" and "Manage selections" lead to an undrawn screen. Today it is the Fairway `/coachhelm/qualifying/[id]`, and its four actions exist (open → scoring → closed → selected, coach picks need reasoning).
  - Recommended: build it in Clubhouse from the design system, as the Selections card grown into a panel: advance state, pick, reasoning, confirm. It needs an owner review.
  - Trade-off: an undrawn surface.
  - Alternative: hide the button until a design exists. Coaches then can't commit a squad in Clubhouse.
- Q-11 (answered 2026-09-29, D-32) Edit qualifier is not drawn (the prototype only toasts).
  - Recommended: the create form, prefilled, at `/qualifiers/[id]/edit`, over `updateGolfQualifierDetails` and `setQualifierRoundCourses`.
  - Also recommended: new server actions to change squad size and picks, and to add or remove entrants. RLS already allows both; no migration is needed.
  - Trade-off: two new actions to write and review.
- Q-12 (answered 2026-09-29, D-33) Course and date per round: the detail draws a course and a date for each round. `golf_qualifier_round_courses` has course and tee but no date, and only 7 of 18 live qualifiers have rows. The design's create form has one free-text course.
  - Recommended: show a round's course when set, else the qualifier's, with no per-round date. The create and edit forms keep today's per-round course and tee picker, which gives the par and the round setup defaults.
  - Trade-off: a field the design doesn't draw.
  - Alternative: a migration adding a round date (written, unapplied).
- Q-13 (answered 2026-09-29, D-33) Par ("Par 72"): the qualifier has no par, and `course_id` is null on all 18.
  - Recommended: par per round from the assigned tee's `total_par` (all 22 round-course rows have one), else from submitted rounds (`total_score − score_to_par`). Show one par only when every round agrees, else "—".
  - Trade-off: 7 live qualifiers mix pars and will show no single par.
- Q-14 (answered 2026-09-29, D-33) Player visibility: RLS lets active players read teammates' rounds and holes, and `coach_reasoning` once selected. Today's UI shows players neither round-by-round nor selections.
  - Recommended: keep round-by-round, teammates' scorecards and the pick reasoning coach-only (the stricter rule wins, as in D-10). Players see totals, their own scorecards and, per Q-5, the confirmed squad without reasoning.
  - Trade-off: tightening RLS to match would be a separate migration.
- Q-15 (answered 2026-09-29, D-33) Navigation: the design's sidebar has Lineups under Team and Qualifiers under Program (medal icon). Clubhouse today points Lineups at `/qualifiers`.
  - Recommended: add Qualifiers under Program once it's rebuilt, and hide Lineups until it has its own design (as Q-2).
  - Trade-off: coaches lose the Lineups label they use now.
  - Player navigation gets Qualifiers only with Q-5 and Q-6.
- Q-16 (open: decided with the phone foundation by `messages-mobile`) Phone home for Qualifiers: the tab bar, top bar, More and sheets belong to the foundation spec (owned by `messages-mobile`, from the owner's `m-shell.jsx` and `m.css`); `qual-mobile.jsx` carries an older copy of that shell. The page-level question is which tab owns Qualifiers. The boards mark Rounds active.
  - Recommended: Qualifiers sits under the Rounds tab, as drawn, once the foundation's tab set is approved.
  - Trade-off: it depends on the foundation keeping a Rounds tab.
  - Alternative: Qualifiers is reached from More.
- Q-17 (answered 2026-09-29, D-33) Live pulse: `.qf-pulse` runs a 1.6s infinite pulse on "Live". The doctrine allows 90, 150, 220 and 360ms, and cause and effect only.
  - Recommended: a static dot.
  - Trade-off: a quieter live cue.
  - Alternative: one 360ms pulse when a realtime update lands.
- Q-18 (answered 2026-09-29, D-33) Raw colours need `--ch-*` tokens:
  - `#EDF4EF` (pressed pill, opened row) → `--ch-bg-selected` (#EEF5F0, one step off);
  - `#F5F9F6` (opened-row tray) → a new `--ch-green-25`;
  - `#EFE6D2` with its `rgb(110 84 36 / .14)` ring (one-round box) → a new `--ch-champagne-100`, or `--ch-warning-100`;
  - `rgb(21 90 57 / .28 and .4)` (pill ring, cut line) → green-600 alpha tokens;
  - `rgb(28 25 18 / .07)` → `--ch-border-hairline`.
  - Recommended: map to existing tokens where they are within a step, and add the two new ones through `design/handoff/design-system/`.
  - Trade-off: a design-system change.
- Q-19 (answered 2026-09-29, D-33) Fit at 1280 and 924: the drawn leaderboard (720px minimum) and round-by-round tables scroll inside their panels. That hides Status, the chevron, Total and To par at both widths, and the Dates fact truncates ("Sep 22 – Oc…").
  - Recommended: fit every column without horizontal scroll at 924 and up (narrower columns; Avg moves into the opened row) and let the Dates fact wrap.
  - Trade-off: the geometry departs from the drawn reference.
- Q-20 (answered 2026-09-29, D-33) Phone gaps:
  - The form has no scoring rules field, help text or error states, although the board says "Same fields as the web form".
  - The detail has no Close or Reopen, no round-by-round, and no confirmed squad or reasoning.
  - Recommended: the phone form keeps every web field and its inline errors. Close and Reopen sit behind Edit as a sheet action. Round-by-round stays desktop-only, because the player sheet covers per-round scores. The completed detail adds the confirmed squad above the leaderboard.
  - Trade-off: additions not drawn on the phone boards.

## Data gaps (shown honestly, never invented)

- Home: the prototype's weather and "Week 7 of 12" have no source (golf teams have no season start or end dates). They are omitted until one exists.
- Home: the prototype's "Open recap" needs a single-round screen, which isn't rebuilt. The link opens the player's stats and says so.
- Shell: the top-bar search (⌘K) needs its own spec. It is not rendered until then, so there is no dead control.
- Shell: Practice and Events are in the design's navigation but have no route. They are hidden until the owner decides what they point to.
- Roster: the design's Captain role, major, birthday, home course and "about" line have no columns. Real fields are shown instead: hometown, high school, class and jersey. A migration for captain, major and bio can be written once you decide which you want (birthdays are minors' PII).
- Roster: owner, 2026-09-29: cards show no jersey number (the handoff has none; Captain waits for a column); the layout toggle and the panel order follow the handoff (the panel sits after the cards when there is no room beside them).
- Roster: invite-by-email has no server action. The invite sheet offers the join code, a copy button and the native share sheet for the join link.
- Roster: "Schedule 1:1" and "View insights" wait for Calendar and CoachHelm. They are hidden until then.

- Stats (player), 2026-09-29 fidelity: the strokes gained by leg chart is the design system's StrokesGainedRoute (it had been bars), the Rounds count is the design system's tab pill, and a coach reads "Stats › name" in the top bar. The scoring chart's "Season best" marker and "Par 72" meta wait for season-best and course-par data per window.
- Stats: the prototype's PredictionCard, "vs tour" figures and D1 benchmarks for fairways and putts per round have no source. They are omitted, and D1 shows only where `golf_pga_standards` has the metric.
- Calendar: "Print week" and "Duplicate" are not built. "Checked" in Sources is the time the server read the data.

- Settings: theme (light, dark, system), display density, date format, score display and distance units aren't shown; Clubhouse doesn't honour them yet (light only until the dark theme). The current app's controls keep working with the flag off.
- Settings: the comparison weights stay hidden, as in the current app.
- Messages: threaded replies and a shared-files list in details have no backend. They are not shown.
- Messages: the thread header's search icon is not built; message search is team-wide (`searchGolfMessages` takes no conversation) and lives in the rail. The typing indicator shows an avatar in direct threads only, because the realtime hook reports that someone is typing, not who.

- Qualifiers (live counts, 2026-09-29):
  - No per-round date column exists (Q-12).
  - No qualifier par exists (Q-13).
  - Of 215 completed qualifier rounds, 19 aren't 18 holes. Proposed: Avg is shown only over 18-hole rounds, and says so when some are excluded.
  - 14 rounds have no hole rows and 33 have fewer than 18 scored. Proposed: the scorecard says there's no hole-by-hole card instead of drawing blanks.
  - The entry deadline is metadata and never enforced. Proposed: the form's help text ("When players must confirm in") becomes "Shown to players; entry stays open until you close it".
  - "Selection opens once the first round is submitted" is not automatic. `selection_state` moves only when the coach advances it (13 of 18 live qualifiers are still `open`).

## Verification log

<!-- Append: date, screen, gate, what ran, result. -->
- 2026-09-29 · Stats (team, player) · desktop, wired: typecheck 0, eslint 0 errors, clubhouse:check clean, vitest 16/16. Preview at 924, 1280 and 1400px against stats-team-01..05 and stats-player-01..14; states empty, loading, early, self. No console errors.
- 2026-09-29 · Calendar · desktop, wired: typecheck 0, eslint 0 errors, clubhouse:check clean, vitest 21/21. Preview at 924, 1280 and 1400px against calendar-01..12 (week, day, month, agenda, event, overlap, attendance, editor); player view; states failed, partial, loading. No console errors.
- 2026-09-29 · Messages · desktop: typecheck 0, eslint 0 errors, clubhouse:check clean, vitest 21/21. Preview at 924, 1280 and 1400px against messages-01..04 (team thread, direct, group details, new group validation); send, react, edit, delete and attachments driven through the preview; states empty, failed. No console errors.
- 2026-09-29 · Fidelity pass (Home, Stats team, Calendar, Messages, shell) · desktop: rendered each handoff prototype and our preview side by side at 1280px and fixed what differed. Home subline, Message team and New event, agenda invitee details, "First tee 8:42 · 5 of 6 confirmed", "No rounds 9 days", the Full roster arrow and the stats link; the notifications bell; the sidebar readiness bar; team putting rings at the handoff's size; Longest putt made; Calendar "Checked"; the Messages typing avatar. typecheck 0, vitest logic 32/32, preview states bell empty, failed and filter. No console errors.
- 2026-09-29 · Settings · desktop: built from the design system at 1280px (coach: account, notifications, team, CoachHelm, preferences; player: account, golf profile, notifications); preview states player, noteam, failed, partial, assistant, failwrites, loading. Fixed a live bug found on the way: `push_announcements` was stripped on save and read as off (test added). typecheck 0.
- 2026-09-29 · Settings and shell · catalog: 76 Settings and 14 shell tests, each named by its number; clubhouse:check enforces the catalog. Found and fixed on the way: every Clubhouse toast rendered outside the Clubhouse root and so had no background; the browser's own email bubble covered ours; the photo coin lost its initials while the name was empty.
- 2026-09-29 · Stats (team) · old link: `/stats/team` opens the rebuilt Team stats for coaches. Compared the design project's `Stats.html`, `stats.jsx`, `stats.css`, `cal.css`, `depth.css`, `sidebar.css` and the colour and elevation tokens with `design/handoff/`: identical apart from the Qualifiers nav item (not built, owner). 
- 2026-09-29 · Qualifiers · spec (doing), phone-spec (doing).
  - Rendered `Qualifiers.html` headless at 1280 and 924: 21 states each (list, filters, no match, live, scorecard, closed, reopened, upcoming, completed, create, validation, created).
  - Rendered `Qualifiers Mobile.html` at 390 × 844: 11 states, plus the five boards as drawn.
  - The only console warning is a missing React key inside the bundle's `RoundStrip`. Captures are kept outside the repo.
  - Checked read-only against the live schema: columns, CHECK constraints, RLS on the four qualifier tables and on `golf_rounds` and `golf_holes`, and aggregate counts with no names.
  - The design system was not compared with the design project (no DesignSync access in this session).
