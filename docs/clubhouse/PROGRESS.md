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
| Foundation | (shell, tokens, primitives) | done | doing | doing | doing | doing | done | todo | doing | doing | doing | todo |
| Home | /golf/dashboard | done | doing | doing | doing | doing | doing | todo | todo | doing | doing | todo |
| Roster | /golf/dashboard/roster | done | done | done | doing | doing | doing | todo | doing | doing | doing | todo |
| Stats (team) | /golf/dashboard/stats | done | done | done | doing | doing | doing | todo | doing | doing | doing | todo |
| Stats (player) | /golf/dashboard/stats?player= (coach), /golf/dashboard/stats (player) | done | done | done | doing | doing | doing | todo | doing | doing | doing | todo |
| Calendar | /golf/dashboard/calendar (coach and player) | done | done | done | doing | doing | doing | todo | doing | doing | doing | todo |
| Messages | /golf/dashboard/messages (coach and player) | done | done | done | doing | doing | done | todo | doing | doing | doing | todo |
| Settings | /golf/dashboard/settings (coach and player) | done | doing | doing | doing | doing | doing | todo | doing | doing | doing | todo |
| CoachHelm | /golf/dashboard/coachhelm | blocked (still in design) | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo |
| Rounds, Practice, Lineups, Events, Scouting | various | blocked (no design yet) | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo |
| Player app (all screens) | /golf/dashboard (player role) | blocked (no design yet) | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo |
<!-- clubhouse:screens:end -->

## Decisions

- D-1 (2026-09-29): Parallel and flag-gated. Coaches and players both get Clubhouse where a screen is rebuilt for their role (Stats, Calendar and Messages have player versions with the permissions players already have); every other route shows the not-rebuilt notice with a link back.
- D-2 (2026-09-29): Light theme only. The handoff's chart colours are tuned for light paper, and dark mode is not designed.
- D-3 (2026-09-29): Phone navigation is a bottom tab bar in the ivory-pass style, with a selection haptic on tab change. Superseded by D-40 (2026-09-29): the tab bar is now the owner's ivory glass design, with role-specific tabs.
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
- D-40 (2026-09-29, owner; answers Q-40, Q-41, Q-42): Phone tab bar. Coaches get the design's five tabs, Home, Helm, Rounds, Stats and More, in the design's ivory glass style. This supersedes D-3. Messages, Roster and Calendar open from More, and the Messages unread badge rolls up onto More. Helm and Rounds show the not-rebuilt notice until those screens exist; Qualifiers opens from the Rounds tab once it has a phone build. Players keep today's tabs (Home, Calendar, Messages, My stats, More) in the new ivory style until a player tab design exists.
- D-41 (2026-09-29, owner; answers Q-43): More stays today's sheet (CH-1802), with Settings in it, until the owner designs a More screen. The "‹ More" back link on a page opened from More returns to wherever the user came from.
- D-42 (2026-09-29, owner; answers Q-46): Red means under par, the pin flag, or a destructive action (Leave group, Delete conversation and the danger buttons). `design/handoff/README.md` and `.claude/rules/clubhouse.md` both say so (the rules line applied by the lead on the owner's answer).
- D-43 (2026-09-29, owner; answers Q-44, Q-45, Q-47): The Safari bar is browser chrome and is dropped; the tab bar, composers and sheet footers pad by the safe-area insets. Phone avatars are one neutral coin (#E9E3D3 with #5A4E36 initials), on the phone only, as `--ch-*` tokens; desktop keeps its five tones. Pull to refresh and the push soft ask wait for a design.
- D-44 (2026-09-29, owner; answers Q-48): Announcements stay on the phone: the section above Today in the Inbox, the announcement as a pushed screen, and an Announcement choice in a coach's New message.
- D-45 (2026-09-29, owner; answers Q-49, Q-50, Q-51): New groups. A coach names the group before it is created (CH-7104). Coaches can be added to a new group (the broadcast, then `addGolfGroupMember`). Quick groups are Whole team and Seniors; the travel squad is hidden.
- D-46 (2026-09-29, owner; answers Q-52): The Unread chip counts conversations, not messages.
- D-47 (2026-09-29, owner; answers Q-54, Q-56, Q-61, Q-62): Details controls with a backend. Schedule opens the Calendar editor (`?new=1`), for coaches only, without invitees. Mute lasts until it is turned off. Add member is wired for the group's creator, on desktop and phone. The creator still can't leave their group.
- D-48 (2026-09-29, owner; answers Q-53, Q-55, Q-57, Q-58, Q-59, Q-60, Q-63): Details controls without a backend. A new read-only action lists a conversation's files. Call, in-thread Search, Pinned, "Only coaches can post", Edit and Delete conversation are hidden until a backend exists.
- D-49 (2026-09-29, owner; answers Q-64): No event card in a thread; every group uses the people mark; the six stored reactions only; "Admin" marks the creator only; coaches keep View stats in a player's direct details; the drawn message icon on the other person in a direct thread's Details goes back to that thread.

## Open owner questions

- Q-1 Roster status: decided 2026-09-29, add a separate availability field. The migration `supabase/migrations/20260929120000_golf_team_members_availability.sql` is written and stays unapplied: the owner is not applying migrations (2026-09-29). The Roster pill stays read-only.
- Q-2 Navigation: decided 2026-09-29, Practice and Events stay hidden until each has its own design.
- Q-3 Phone specs: decided 2026-09-29 (D-22). The owner's mobile designs in `design/handoff/mobile/` are the phone specs; the drafts in `docs/clubhouse/phone/` only matter for pages without one, and still need approval.
- Q-4 Rollout: decided 2026-09-29, the flag stays off in production; the owner does a live pass on a Vercel preview with real coach and player accounts first.

From the owner's phone shell and Messages design (2026-09-29; `phone/foundation.md`, `phone/messages.md`). All answered by the owner on 2026-09-29, each by accepting or refining the recommendation; the answer is the decision named.

- Q-40 answered 2026-09-29 (D-40). Phone tab contents. The design has Home, Helm, Rounds, Stats and More, with no player set; D-3 as built has coach Home, Calendar, Messages, Roster, More and player Home, Calendar, Messages, My stats, More. Recommended: the design's five as the coach target, with Helm and Rounds each taking a rebuilt screen's place until they are rebuilt, and the player keeping today's set until the player app is designed. Trade-off: for a while the coach bar isn't the drawing. The alternative, the drawing now, puts two "not rebuilt" tabs in the bar.
- Q-41 answered 2026-09-29 (D-40). Tab bar style. The design is an ivory glass bar with the active tab in green and a green badge; D-3 is a green bar with the ivory pass. Recommended: the design, which supersedes D-3's style. Trade-off: the built `.ch-tabbar` is restyled, and the phone loses the green frame.
- Q-42 answered 2026-09-29 (D-40). Messages under More. Recommended: as drawn, with the unread badge rolled up onto More and shown on the Messages row. Trade-off: Messages, the screen players use most, is one tap deeper.
- Q-43 answered 2026-09-29 (D-41). More as a screen, and Settings. "‹ More" makes More a pushed stack, not today's sheet (CH-1802), but it isn't drawn (`m.css` has `.m-me` and `.m-more` only), and the phone top bar has no Settings gear. Recommended: ask for a More board; until then keep the sheet, and put Settings in it. Trade-off: the Inbox's "‹ More" back link has nothing to go back to until More exists.
- Q-44 answered 2026-09-29 (D-43). The Safari bar. Recommended: drop it (it is browser chrome) and pad the tab bar, composers and sheet footers by the home-indicator inset (capture 90). Trade-off: none in the app.
- Q-45 answered 2026-09-29 (D-43). Phone avatars. The design uses one neutral (#E9E3D3 on #5A4E36); Clubhouse coins have five tones. Recommended: the single neutral on the phone only, with the two colours added to the design system as tokens. Trade-off: a player's coin looks different on phone and desktop.
- Q-46 answered 2026-09-29 (D-42). Red for destructive actions. The design colours Leave group and Delete conversation `--ch-danger-600`, the under-par red. Recommended: allow red for destructive actions, as desktop's danger buttons already do, and write that exception into the doctrine. Trade-off: red is no longer exclusive to scoring.
- Q-47 answered 2026-09-29 (D-43). Pull to refresh and the push soft ask. Neither is drawn. Recommended: both keep waiting. Trade-off: none for Messages, whose list is realtime.
- Q-48 answered 2026-09-29 (D-44). Announcements (D-16) are not in the phone design: not in the Inbox and not in New message. Recommended: keep them. Announcements go above Today, the announcement pane opens as a pushed screen, and coaches get an Announcement choice in New message. Trade-off: the phone gains UI nobody drew. Dropping them leaves players unable to acknowledge on the phone.
- Q-49 answered 2026-09-29 (D-45). Naming a new group. The design says "You can name it after sending", but no rename action exists and broadcasts need a title. Recommended: ask for the name before creating (CH-7104) until a rename action exists. Trade-off: a field that isn't drawn.
- Q-50 answered 2026-09-29 (D-45). Coaches in a new group. The design lets a coach add the assistant coach, but `createGolfTeamBroadcast` adds players only. Recommended: create the group, then add the chosen coaches with `addGolfGroupMember`, in one flow using existing actions. Trade-off: two writes, and a new "group created, coach not added" state.
- Q-51 answered 2026-09-29 (D-45). Quick groups. Recommended: Whole team (all players, plus coaches if Q-50 says yes) and Seniors (from `graduation_year`); hide the travel squad until you choose its source (the next competition's invitees, or the itinerary's room list). Trade-off: one of the three drawn rows is missing.
- Q-52 answered 2026-09-29 (D-46). The unread chip's count. The design adds up messages (4); desktop counts conversations (2). Recommended: conversations, the thing the chip filters. Trade-off: the number differs from the drawing.
- Q-53 answered 2026-09-29 (D-48). Call. Recommended: hide it. Phone numbers aren't loaded, players' numbers are minors' PII, and a call means nothing in a group. Trade-off: a drawn tile is missing.
- Q-54 answered 2026-09-29 (D-47). Schedule. Recommended: for coaches, open the Calendar editor (`?new=1`) without invitees, since no prefill exists; hide it for players. Trade-off: the coach picks the people again.
- Q-55 answered 2026-09-29 (D-48). Search inside a thread. Recommended: hide it until `searchGolfMessages` takes a conversation (a change to the action; no migration). Trade-off: search stays team-wide, in the Inbox.
- Q-56 answered 2026-09-29 (D-47). Mute. The design has one switch; desktop offers 8 hours, a week, or until turned back on. Recommended: the switch and the tile mean "until I turn it back on". Trade-off: timed mutes are desktop-only.
- Q-57 answered 2026-09-29 (D-48). Pinned. Recommended: hide it until a pin action exists, plus a migration so coaches can pin other people's messages (the update policy is sender-only). Trade-off: a drawn panel is missing.
- Q-58 answered 2026-09-29 (D-48). Files list. Recommended: write a read-only action for a conversation's files (RLS already allows it; no migration), so Files ships with the phone. Trade-off: a new server surface to build and review. The alternative is to hide it.
- Q-59 answered 2026-09-29 (D-48). "Only coaches can post". Recommended: hide it, and write no migration unless you want the feature. Trade-off: a drawn switch is missing.
- Q-60 answered 2026-09-29 (D-48). Edit group. Recommended: hide it until what Edit covers is drawn and a rename action exists. Trade-off: a drawn button is missing.
- Q-61 answered 2026-09-29 (D-47). Add member. Recommended: wire the existing `getGolfGroupAddCandidates` and `addGolfGroupMember` for the group's creator, on desktop too, because the component is shared. Trade-off: desktop gains a control its handoff doesn't show.
- Q-62 answered 2026-09-29 (D-47). Leave group for the group's creator. The design shows it; desktop hides it. Recommended: keep the desktop rule, because nobody else could manage the group. Trade-off: differs from the drawing.
- Q-63 answered 2026-09-29 (D-48). Delete conversation. Recommended: hide it. There is no delete policy and no defined meaning (for you only, or for both). Trade-off: a drawn row is missing.
- Q-64 answered 2026-09-29 (D-49). Design details with no backend. Recommended: leave out the event card in a thread (no writer, and 0 such rows); show every group with the people mark (no group type); keep the six stored reactions (no check); mark only the creator as "Admin"; keep desktop's View stats for coaches in a player's direct details, which the design leaves out; keep the drawn message icon on the other person in a direct thread's Details, where a tap goes back to that thread. Trade-off: small differences from the drawing.

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
- Messages (phone design, 2026-09-29): checked against the code and production. Only SELECT statements were run, and only aggregates were read: no names and no message text. Every production message is `kind = 'text'` (215); none is pinned, none replies to another, and none has a payload. There are 13 attachments and 0 poll or RSVP responses. The design's items without a backend are these, each waiting on the question named:
  - Call: phone numbers aren't loaded and are minors' PII (Q-53).
  - Pinned: the columns exist but nothing writes them, and the update policy is sender-only (Q-57).
  - The Files list: needs a conversation-level read (Q-58).
  - Search inside a thread: the action is team-wide and capped at 50 results (Q-55).
  - "Only coaches can post": no column or policy (Q-59).
  - Edit group, and naming a group after sending: no rename action (Q-60, Q-49).
  - Delete conversation: no delete policy on `golf_conversations` (Q-63).
  - The event card in a thread: no writer (Q-64).
  - A group icon by type: no column (Q-64).
  - The check reaction: not one of the six stored reactions (Q-64).
  - The travel squad: no membership source (Q-51).
  - Assistant coaches in a new group: broadcasts add players only (Q-50).
  - "Admin" on a coach who didn't create the group (Q-64).
  - Schedule: can't prefill invitees (Q-54).

  Add member has existing actions that desktop doesn't use yet (Q-61).
- Phone shell (2026-09-29): `m.css` styles a More screen (`.m-me`, `.m-more`) that no board draws (Q-43). The design has no player tab bar (Q-40). The top-bar glass `rgb(247 245 239 / .9)` and the phone avatar colours have no `--ch-*` token yet; they go into the design system first (Q-45).

## Verification log

<!-- Append: date, screen, gate, what ran, result. -->
- 2026-09-29 · Stats (team, player) · desktop, wired: typecheck 0, eslint 0 errors, clubhouse:check clean, vitest 16/16. Preview at 924, 1280 and 1400px against stats-team-01..05 and stats-player-01..14; states empty, loading, early, self. No console errors.
- 2026-09-29 · Calendar · desktop, wired: typecheck 0, eslint 0 errors, clubhouse:check clean, vitest 21/21. Preview at 924, 1280 and 1400px against calendar-01..12 (week, day, month, agenda, event, overlap, attendance, editor); player view; states failed, partial, loading. No console errors.
- 2026-09-29 · Messages · desktop: typecheck 0, eslint 0 errors, clubhouse:check clean, vitest 21/21. Preview at 924, 1280 and 1400px against messages-01..04 (team thread, direct, group details, new group validation); send, react, edit, delete and attachments driven through the preview; states empty, failed. No console errors.
- 2026-09-29 · Fidelity pass (Home, Stats team, Calendar, Messages, shell) · desktop: rendered each handoff prototype and our preview side by side at 1280px and fixed what differed. Home subline, Message team and New event, agenda invitee details, "First tee 8:42 · 5 of 6 confirmed", "No rounds 9 days", the Full roster arrow and the stats link; the notifications bell; the sidebar readiness bar; team putting rings at the handoff's size; Longest putt made; Calendar "Checked"; the Messages typing avatar. typecheck 0, vitest logic 32/32, preview states bell empty, failed and filter. No console errors.
- 2026-09-29 · Settings · desktop: built from the design system at 1280px (coach: account, notifications, team, CoachHelm, preferences; player: account, golf profile, notifications); preview states player, noteam, failed, partial, assistant, failwrites, loading. Fixed a live bug found on the way: `push_announcements` was stripped on save and read as off (test added). typecheck 0.
- 2026-09-29 · Settings and shell · catalog: 76 Settings and 14 shell tests, each named by its number; clubhouse:check enforces the catalog. Found and fixed on the way: every Clubhouse toast rendered outside the Clubhouse root and so had no background; the browser's own email bubble covered ours; the photo coin lost its initials while the name was empty.
- 2026-09-29 · Stats (team) · old link: `/stats/team` opens the rebuilt Team stats for coaches. Compared the design project's `Stats.html`, `stats.jsx`, `stats.css`, `cal.css`, `depth.css`, `sidebar.css` and the colour and elevation tokens with `design/handoff/`: identical apart from the Qualifiers nav item (not built, owner). 
- 2026-09-29 · Foundation, Messages · phone-spec: the owner's `Messages Mobile.html` was served over http and every board and state was rendered at 390 × 844 @2x (`messages-00..22`, plus `messages-90`, derived without the Safari bar). This was redone after ccbd33465 changed the avatars. The preview was captured at 390px for coach and player (`messages-preview-*`) on a dev server on :3104, stopped afterwards. No page errors. Wrote `phone/foundation.md` and `phone/messages.md` as approved specs. The gate stays `doing` until Q-40 to Q-64 are answered.
- 2026-09-29 · Foundation, Messages · phone-spec done: the owner answered Q-40 to Q-64 (D-40 to D-49). The specs cite the decisions, each checklist's third box is ticked, and the doctrine now allows red for destructive actions (D-42). `clubhouse:check` exit 0.
