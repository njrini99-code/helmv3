# Clubhouse changelog

## 2026-10-21 — The player peek opens CoachHelm

The player peek (CH-1832, `ui/PlayerPeek.tsx`) adds a fourth action,
CoachHelm, opening the player's deep dive
(`/golf/dashboard/coachhelm?view=deep-dive&player=`, `coachHelmPlayerHref`);
it is not drawn while CoachHelm isn't rebuilt for coaches. Every page that
wraps a name in `PlayerPeek` gets it (Coach Home spec B §3).

## 2026-10-21 — Goals styles

`styles/goals.css` holds the Set a goal sheet's form, the suggested-goals rail
and a goal's state line and coach controls (P005). It is imported by the
components that use it, not by `stats.css`.

## 2026-10-21 — A fitted hover card is never wider than its cell

`PeekTarget` with `within` (the team stats grid's player cell) opened no narrower
than 288px, so in a cell under 288px (the grid allows 200px) the card spilled over
the next column and covered the figures it was fitted to protect. It is now the
cell's width up to 328px (`hoverCardWidth` in `ui/Peek.tsx`), its keys wrap in a
narrow cell and its text wraps (`styles/ui.css`, `.ch-hovercard--fit`).

## 2026-10-21 — Component catalog stops recording CSS line numbers

```text
Design package: none
PR/commit:      claude/catalog-no-line
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `component-catalog.json` tokens no longer carry `line`. Any stylesheet edit
  shifted every later token's line, so each Clubhouse PR that landed made the
  committed catalog stale on every other open PR. Nothing read the field.

## 2026-10-21 — Name the rollback deployment (doc-45)

```text
Design package: none
PR/commit:      claude/clubhouse-rollback-named
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `STATUS.md` names today's production deployment and its promote-back
  target, and says to re-read both on the day of turn-on.

## 2026-10-21 — One hydration guard for text boxes

`useHydrationGuard` (`lib/use-hydration-guard.ts`) makes a box read-only until
React has hydrated it, so text typed into server HTML is not reset. Settings
`Field` and `FieldRow` use it, and now so do the reset and gate boxes (P015).
The sign-in email and password do not: page-load autofill skips a read-only box.

## 2026-10-21 — Settings boxes wait for hydration (WebKit journeys)

Text typed into a Settings box before React hydrated it was wiped when the
controlled value was applied, so a name typed straight after load was lost
(the nightly WebKit journey). Settings `Field` and `FieldRow` are read-only
until hydrated, and look normal meanwhile (`styles/controls.css`,
`data-ch-hydrating`). `useHydrated` moved to `lib/use-hydrated.ts`.

## 2026-10-21 — Teammates read through the profile function (S4)

No visible change. From the 2026-10-16 security review. A player could read a
teammate's whole `golf_players` row (email, phone, gpa, school, hometown,
state). The qualifier leaders, the qualifier form, the player roster and the
messages now read teammates' names through `readGolfPlayerProfiles`
(`src/lib/golf/player-profiles.ts`, the `golf_player_profiles` function):
display columns only. Until the function is applied the read falls back to the
table, so nothing changes on screen; the policy change that closes the hole
stays held (`supabase/migrations/HELD.md`).

## 2026-10-21 — Sign-out drops the offline copies (security review S2)

No visible change. From the 2026-10-16 security review. The service worker kept
every signed-in API response and golf dashboard page, keyed by address alone,
and nothing cleared them at sign-out: offline, the next person on a shared phone
could be shown the last person's roster and notes. `chEndSession`
(`lib/sign-out.ts`) now deletes the worker's page and API caches with the
session (`src/lib/offline/private-caches.ts`, also called by every Fairway
sign-out and the idle timeout), and the worker no longer caches API responses at
all (`public/sw.js`). A player's own unsynced rounds on the device are kept, as
before.

## 2026-10-20 — Stats visuals: ties by the head of the run

- `lib/stats-signal.ts` `rankWithTies`: a tie run now holds only the players
  within one standard error of its first player, not of the neighbor before
  them. Chaining neighbors let a smooth spread join everyone into T1. First
  used by the team ranked dot plot (P004).

## 2026-10-20 — Stats visuals: a hole floor and an eagle fill token

- `lib/stats-signal.ts`: a `holes` floor (shows from 1, early read under 30)
  and `earlyTag(n, unit)` for a unit other than rounds ("Early read · 24
  holes"). First used by the scoring mix (P005).
- `styles/tokens.css`: `--ch-score-eagle-fill` in the light and dark blocks,
  the deeper red of eagle or better as a fill.

## 2026-10-20 — No serif face is loaded

`lib/fonts.ts` still declared Instrument Serif (normal and italic), so every
Clubhouse page preloaded two serif files that nothing drew: titles moved to the
sans on 2026-10-07 and `--ch-font-serif` resolves to it (`tokens.css`), and no
selector names `--ch-font-instrument-serif` (premium pass audit P011 D14). The
face and its variable are gone; Instrument Sans, JetBrains Mono and Norican
stay. Nothing on screen changes. The original change (draft PR #2207) counted
four WebKit font preloads before and two after on the player home preview; that
was before Norican joined, and the count was not re-taken in this replay.

## 2026-10-20 — Server errors carry ui=clubhouse too

No visible change. Release review blocker 5: only the browser tagged a
Clubhouse session `ui=clubhouse`, so a canary's server errors could not be told
from Fairway's. When `isClubhouseFor` decides Clubhouse for a request
(`gate.ts`), it now sets the same tag, name and value, on Sentry's isolation
scope, which the server forks per request; a Sentry failure never changes the
decision (`__tests__/gate-sentry-tag.test.ts`). The saved search, the alert
steps and the baseline are in STATUS.md "Monitoring".

## 2026-10-20 — Stats visuals: area scrubbing in the pin hook

- `lib/use-chart-pin.ts`: `useChartPin(count, axis, inset)` returns `area`, the
  pointer handlers for a chart drawn as one surface: a mouse reads the nearest
  column, a finger scrubs after about 8 px of mostly sideways travel
  (`touch-action: pan-y` keeps a vertical swipe scrolling, and a cancel clears),
  the end of a drag keeps the last column pinned, a tap or click toggles the
  nearest. First used by the trend of rounds (P005).

## 2026-10-20 — Honest deltas (stats visuals 2)

- `lib/stats-signal.ts`: `meanSe`, `changeSe` and `halvesChange`, the
  standard error of a window and of a change, beside `deltaTone` and
  `deltaWords`. `data/stats-weight.ts` gains `windowChangeSe` (per-18 values,
  a nine-hole round as half) and `data/round-scope.ts` `recordedPutts`.
- `ui/FormLine.tsx`: green or amber only past one standard error of the
  halves' change, neutral otherwise; its comment now says lower scores sit
  higher. Roster (P003) and the home leaderboard use it, so their form lines
  turn neutral where the change is inside its error.
- `data/season.ts` `formStatus`: Improving or Slipping only past one standard
  error, Steady otherwise. It drives the roster's and leaderboard's form word.
- `lib/sg.ts` `sgTint`: `color-mix` of `--ch-chart-gain` and
  `--ch-chart-loss` in place of literal rgb values, so the tint follows dark
  mode.
- `styles/stats.css`: neutral fills for the gauge and the Overview tracks,
  the phone "No clear change" line and the Overview change line's colours.

## 2026-10-20 — Stats visuals: the signal and pin helpers

- `lib/stats-signal.ts` and `lib/use-chart-pin.ts` (shared, no page owns them):
  sample floors per stat, standard errors from the player's own or the pooled
  spread, the tone of a change (color only past one standard error), Wilson
  intervals, a trailing mean and ties in a ranking; and the one hover,
  tap-to-pin and arrow-key behavior the stats charts share. First used by
  strokes gained by leg (P005); the later stats pieces build on them. Decisions
  are in the project's stats-visuals files.
- `styles/stats.css`: `.ch-sv-*` (readout line, whisker, hollow early mark,
  "needs" text), stats-owned.

## 2026-10-19 — A toast in a dialog no longer covers its Save on desktop

- CH-1812's in-dialog toast stack sat bottom right on desktop, over a dialog's
  footer: after Publish, the "Published" toast covered the Edit event dialog's
  Save changes and took its clicks (found by the write journeys on a production
  build). Inside a dialog the toasts now sit at the top on desktop as they
  already did on the phone (ui.css), pinned by a shell test.

## 2026-10-19 — Date fields drop this year's year

- ui/DateField shows a date in the current year as "Tue 22 Sep" (iOS's habit),
  and keeps the year for any other year. Two half-width fields on the phone
  (qualifier start and end) no longer cut the date to "Tue 22 Sep 20…". The
  value, the month grid's day names and typing are unchanged; the server render
  keeps the year (the year is read on the client, so no time zone is guessed).

## 2026-10-19 — The iPad tier of the shell

`shell.css` (end block "W4c tablet tier"): between 821 and 1180px the sidebar is
208px (was 240px) and the page gutter 28px (was 40px), and the next-event card
in the sidebar narrows with it. An iPad portrait with the sidebar open went from
a 586px canvas to 618px, a 1024px Pro from 776px to 808px; the folded rail and
everything from 1181px up are unchanged. Page-level tablet fixes are in each
page's own changelog. Lane W4c.

## 2026-10-19 — Hero tone titles follow the iPhone's text size

`hero-tones.css` (shared): the scorecard and board tone titles (34px and 30px)
are set in `calc(N * var(--ch-type-k))`, and their radii sit on the scale. Lane
W4b.

## 2026-10-19 — Complete and elevate: shared pieces

The shared primitives behind the complete-and-elevate pass
([COMPLETION_PLAN_2026-10-18.md](COMPLETION_PLAN_2026-10-18.md)); each page's
own changelog says what changed on it.

- **Date and time fields** (`ui/DateField.tsx`, `ui/TimeField.tsx`, with
  `ui/PickerHost.tsx` and `ui/date-time.ts` underneath) replace every native
  date and time input. Values are unchanged (`yyyy-mm-dd`, `HH:mm`); the field
  reads "Thu 15 Oct 2026" and "3:30 PM". Phone: a sheet with a month grid or a
  snapping 15-minute list. Desktop: a popover under the field that stays
  typable ("10/15", "oct 15", "tomorrow", "fri", "3p", "1530"), with an inline
  note when it can't read the text. Out-of-range days and times are disabled;
  end pickers can't precede their start.
- **Busy buttons:** `Button busy` sets `aria-busy`, blocks a second press and
  keeps the lit look, so a primary that is saving no longer turns into the
  grey unavailable one.
- **Roving focus** (`ui/use-roving.ts`): arrow keys, Home and End inside every
  hand-built choice group; one tab stop per group.
- **Desktop command layer** (`shell/command/**`, `ui/Tooltip.tsx`,
  `ui/ContextMenu.tsx`): the palette on ⌘K, G-then-letter navigation with a
  plate that shows where each letter goes, `?` for the shortcuts sheet,
  tooltips with shortcut hints on icon buttons, and right-click menus that
  mirror each row's own actions. Desktop only; nothing fires while typing.
- **Waiting pages** (`ui/States.tsx`, `ui/EmptyShape.tsx`): an empty section
  draws the shape of what will fill it (the real rules and alignment, no
  invented content) under one sentence and one action. First run, filtered
  empty, no permission and failure read as different states.
- **Motion:** the live duration set is written into the rules and the
  checklist and pinned by `__tests__/motion-durations-pinned.test.ts`.

## 2026-10-18 — First run: the empty team and the new player

Coach Home's first run keys on players and rounds, not events, so adding an
event keeps "Invite players" on screen; a player with events and no rounds
gets one calm block instead of three empty ones. One name for joining ("team
code", "invite link"), and the coach copy says what is true: code and link
joins are instant, only Settings requests need approval. Every "go invite"
button reads "Invite players" and opens the invite sheet. Empty heads drop
zero counts; the qualifier form stops a coach with no roster before the
fields; phone sign-up has "Already a member? Sign in"; team Stats with no
rounds no longer crashes on desktop (`StatsTeamFirstRun` is a client
component). Shot card (owner): raised result keys, miss squares, putt chips
and quick picks; the blocked Next shot button names what is missing instead
of a line above it. Preview: Home `?state=eventsonly` and `?state=norounds`,
player Home `?state=norounds`.

## 2026-10-18 — On the course: tracking and the round review

Tracking: the Undo-shot and Discard-round confirms keep their button ink and
sit on their own row; the save line stays on one line; a missed putt offers
2–12 ft quick picks and 44px miss chips; once every hole is in, "Review and
post" is the shot review's footer primary (the top note's button is
secondary); short phones compact the hole hero so the putt result is on the
first screen; the screen stays awake while tracking (`track/use-wake-lock.ts`,
silent where unsupported). Round review: Fairway and GIR marks fold into Out
and In rows on narrow widths, the dark GIR dot reads at 5:1, distances never
break from their unit, one "Par" casing, score names instead of shot counts,
and the player reads "what you wrote" about their own notes.

## 2026-10-18 — Premium details: edges, presses, figures and fallbacks

`ui.css`: buttons carry their inline padding as `--ch-btn-pad-x` (14, sm 11,
lg 20, icon 0); `controls.css` adds `.ch-btn--flush-start` / `--flush-end`,
which cancel it so a ghost button's label sits on the column edge (Home card
link, Stats Filter and Export, Delete all classes). `ui/point-span.tsx`
`withPointSpan` opens the decimal point in hero figures (`.ch-num__pt`), so
"73.4" no longer reads "734" on Home, Rounds and Stats. Desktop coins under
about 35px get the phone's initials floor; BackLink's chevron draws at the
Clubhouse stroke (1.6). `shell.css`: the phone push bar's Back and text action
dim while pressed, and the dark hero's theme-color and html background take
the bar's `--ch-frame`. Also: dark coins on green cards, one icon per event
type on every week strip, chart labels at 11px or more on desktop, image
fallbacks for course and profile photos, and one filter-chip and search skin.

## 2026-10-18 — The player's side: privacy, asks and replies

A player sees a meeting only when they are on its invite list (own attendance
row), on Calendar, Home, the sidebar and Classes; when the invite reads fail,
meetings are hidden rather than shown (`screens/calendar/model.ts`
`playerSeesMeeting`, `data/attendance-counts.ts` `loadOwnRows` /
`loadInvitedCounts`). Player Home carries a quiet "From your coach" row
(replies, acknowledgements, tasks due) and every surface shows the player's own
reply ("You're going" / "Reply needed"). Players see their own class clashes.
Qualifier rounds to play link to setup; the squad result reads from the
player's own selection row; one handicap rule (`displayHandicap`); no role
labels for players; CoachHelm Decline holds with Undo; the player Roster names
the coaches.

## 2026-10-18 — One Optional tag; placeholders that read as hints

`controls.css` adds `.ch-field__opt`, the one "Optional" tag every form uses
(qualifier, class, Team Hub sheets), replacing the qualifier-only tag and the
"(optional)" label text. Placeholder ink is `--ch-ink-500`, and sample
placeholders start with "e.g.", so a hint never reads as a typed value.

## 2026-10-18 — Toasts that stay out of the way and keep their promises

`ui/Toast.tsx`: a toast can carry `onExpire`, run once when it closes without
its action (time out, dismiss, swipe, replace, overflow), so a deferred write
happens exactly when its Undo leaves the screen; Calendar's drag-move Undo uses
it, and an Undo pressed after the write says "Already saved. Drag it back to
undo." A `replace` key drops a live toast of the same kind (CH-1910), so
"Muted / Notifications back on / Muted" no longer stack. Devices with hover get
a Dismiss X, and Esc closes a toast that holds focus (CH-1817). `ui.css` and
`shell.css` lift the toast stack above the Messages composer by its measured
height (`--ch-ms-comp-h`), so a toast never sits on Send. Pending labels end
in "…" everywhere.

## 2026-10-18 — Dynamic Type reaches phone text

Phone text in the page sheets (messages, calendar, hub, home, qualifiers,
roster, classes, recruiting, rounds, setup, track, stats, CoachHelm) and the
shared sheets (`controls.css`, `ui.css`, `shell.css`: buttons, segments,
badges, field labels, sheet titles, page bar, top bar and section switch,
section strip, intro, zone sections) is set in `calc(N * var(--ch-type-k))`, so
it follows iOS Text Size up to XXL. Form fields keep the iOS 16px floor and
grow above it (`max(16px, calc(16 * var(--ch-type-k)))`, outranking the
`globals.css` guard). Figures, score marks, scorecards, chart text, avatars,
the bell count and the desktop sidebar stay fixed. Rendering at the default
size is pixel identical. The hub task ring's numeral no longer inherits the
task title's 15px, and the desktop event peek's kind label takes
`--ch-type-label-s`.

## 2026-10-18 — Focus rings that read; Animations off from the first frame

`ui.css`, `controls.css`, `settings.css`, `calendar.css`: the button, segment,
switch, slider, settings rail and week-day focus rings draw solid
`--ch-border-focus` where they drew 45 to 55% green, and their dark overrides
are gone (the token turns light green itself): 2.0 to 3.2:1 before, 5.2:1 or
more after, light and dark. `shell.css`, `stats.css`: on the green frame the
next-event card, the phone push bar's keys and the strokes-gained end row take
the champagne ring. `src/components/golf/theme/ThemeScript.tsx` (shared with
Fairway, dashboard paths only) marks `<html data-motion="off">` from the stored
Animations setting before hydration, `ClubhouseFrame` keeps it in step, and
`tokens.css` zeroes `--ch-dur-shimmer`, `--ch-dur-live` and `--ch-dur-sweep`
under motion off, so skeleton shimmer and live pulses hold still from the first
frame. `--ch-warning-600` is `#8a5a0c` (was `#94600e`), 4.7:1 or more on page
and inset.

## 2026-10-18 — One page-head line, head-coach identity, wave-3 copy

`tokens.css` adds `--ch-page-gutter` (the 40px `--ch-gutter`) and
`--ch-page-head-top` (34px). Every desktop page main takes them as its side and
top padding and keeps its own max width and centring; a head with no eyebrow
line, or a shorter one, adds that room to its top. At 1280 every full-head tab
title lands at the same place. `shell.css`: page-head buttons take the body's
10px radius. `data/shell.ts`: `ChShellData.viewerIsHeadCoach`, read from the
coach's own `golf_team_coach_staff` row in the shell's parallel batch (a failed
read is logged and the label falls back to "Coach"); the sidebar footer,
account sheet and desktop Settings say "Head coach" for a head coach.
`shell/NextEventCard` says "N of M going"; `ui/Ledger`'s chevron draws through
`Icon` (1.6 stroke); the CoachHelm program pulse
(`src/lib/coachhelm/v3/chat/program-pulse.ts`, shared with Fairway) says
"haven’t replied to" and "N of M replied".

## 2026-10-18 — Interaction review: focus, menus, phone fields, loading shapes

`shell.css`: page-head secondary keys keep the shared focus ring (their
hairline and hover ring skip `:focus-visible`, light and dark), and the phone
section switcher draws its ring inside the title row that clipped it.
`controls.css`: phone `.ch-input` fields are 44px tall (base 38px).
`ui/Menu.tsx`: a menu closed by a scroll while focus is in it returns focus to
its trigger instead of `<body>`. Page skeletons (Home, Stats, Rounds, Roster,
Qualifiers, Calendar, Classes) now match their loaded layout, so content lands
within a few pixels of where the skeleton drew it.

## 2026-10-18 — States polish: no-team actions, settings failure, one notice voice

No-team pages (Home, Roster, Calendar, Messages) offer Open team settings, as
Classes and Recruiting do (coaches to the Team section, players to Golf
profile). Settings' phone list says when every read failed (CH-8214, new).
Notice copy is unified on "Try again; the error has been reported.", and
Messages says "safe" like the rest. The phone bell's empty line matches the
desktop's. Calendar's View itinerary lands on the trip in Team Hub
(`?tab=travel&trip=`).

## 2026-10-17 — Figures in rows keep tabular digits

A page rule that sets type with the `font` shorthand resets
`font-variant-numeric`, so `.ch-num` lost its tabular digits wherever such a
rule styled the same element, and columns of scores, counts and times drifted
from row to row. The rules that style figures now set
`font-variant-numeric: tabular-nums` right after their `font`: about 310 rules
across the page sheets, plus the shared ones in `shell.css` (sidebar and dock
counts, the next-event line, the strip count), `ui.css` (`.ch-intro__eyebrow`,
`.ch-nine`, `.ch-fgr dd`) and `controls.css` (`.ch-pill`). Display numerals
(40px and up, and `.ch-serif-num`) stay proportional, as `base.css` intends. A
WebKit sweep of the preview screens at 390px and 1280px finds no small `.ch-num`
figure left proportional apart from the Classes term tile's week figure (a
display figure) and the Team Hub's message times.

## 2026-10-17 — New shadows use the depth tokens; the rail's small parts move by translate

The CSS quality gate (`npm run clubhouse:css`) found 18 new blur shadows
written as raw values. Each keeps its ring and inset layers and takes the
nearest depth token for the blur: Qualifiers' ledger cards, facts and board
`--ch-elevation-cast` (hover `--ch-elevation-overlay`), its hero
`--ch-elevation-board` (hover `-board-hover`), the CoachHelm dive rail and the
announcement section `--ch-elevation-reading-accent`, the standing and profile
dots `--ch-elevation-mark-ink`, the desktop modal `--ch-elevation-overlay`, the
rail toggle `--ch-elevation-on-frame` (hover and the name tip
`-on-frame-card-hover`). Dark mode now follows the tokens' dark values. On the
folding sidebar (P001), the toggle, the avatar and the name tip move by
`translate` instead of `left`, `margin` and `top`, so they never re-run layout;
their places are unchanged (toggle at 229px open and 45px folded, tip centred
on its row). The sidebar's width and the brand's track still animate layout:
an owner decision (STATUS.md).

## 2026-10-17 — Rail width token and the curtain follows a folded sidebar

`tokens.css` adds `--ch-rail-w` (56px), the sidebar folded to its icon rail
(P001). `lib/rail-cookie.ts` names the cookie that remembers the fold;
`lib/phone-hint.ts` reads it on the server (`railHint`), and `lib/handoff.ts`
draws the hand-off curtain's canvas edge at the rail when it is set.

## 2026-10-17 — Player RSVP counts come from a narrow function

`data/attendance-counts.ts` (new) calls
`golf_event_attendance_counts(p_event_ids)` (held migration 20261017102000) and
returns `ok` with invited, accepted, declined and pending per event, `missing`
when the function is not there yet (PGRST202 / 42883, so the caller keeps its
direct read), or `error`. The player paths of the shell (P001), Home (P002) and
Calendar (P006) use it, so once the migration narrows `golf_event_attendance` to
a player's own row their counts still hold and no teammate's reply reaches a
player's page. Team Hub (P010) needs no change: its player path reads only the
player's own invites (`invitedTo`), and `attendanceFor` runs on the coach path
only. The same batch writes two other held migrations with no Clubhouse code
change: 20261017100000 (Settings P008: the six later notification switches stop
being dropped by the `users` trigger) and 20261017101000 (Announcements P010:
the recipient and task coach policies are scoped to the announcement's team).
Tests: `src/clubhouse/__tests__/attendance-counts.test.ts` and the pgTAP suites
under `supabase/tests/rls/`.

## 2026-10-16 — The hand-off curtain holds first-sight motion

`lib/handoff.ts` sets `data-ch-handoff` on `<html>` while its curtain is up and
removes it with the curtain, so motion meant for the dashboard's first sight
(the sidebar brand's entrance, P001) holds until it can be seen.

## 2026-10-16 — A script face for the wordmark only

`lib/fonts.ts` adds Norican as `--ch-font-script`, preloaded, for the
sidebar's "Golfhelm" wordmark (P001) and nothing else: an owner-requested
exception to the sans-only type rule. It replaces Great Vibes, which was tried
first and was too thin at sidebar size.

## 2026-10-16 — No card or row has a green side bar

The owner's standing rule: never a card with a green side. Every remaining green
left-edge bar (`inset Npx 0 0 var(--ch-green...)` or the field green) is
removed, in three commits: the open read in Deep dive (`coachhelm-dive.css`),
the selected row in Messages in light and dark (`messages.css`), the CoachHelm
well (`coachhelm.css`), and the plaque hero's title (`hero-tones.css`, whose
title also loses the 14px of left padding that made room for the bar). The
selected rows keep their fill and raised shadow. CSS only; no visual check is
recorded.

## 2026-10-16 — Zone and game-detail summaries stick below the top bar

A zone summary (`.ch-zn__id`, `ui.css`) and a game-detail summary (`.ch-gm__id`,
`stats.css`) stuck at 24px, behind the sticky top bar. They now stick at the top
bar's height plus 24px. Desktop only; the zones are drawn on Round review (P011)
and Stats, and game detail is P005's.

## 2026-10-16 — The chosen segment of every switcher is a lit green chip

Owner, 2026-10-16: green, with more depth. Every segmented switcher now draws
its chosen segment the same way: a green chip lifted off its well, with the
light on its top edge, a contact shadow and a soft one under it, and ivory ink
with a hairline of shadow under the letters (`controls.css` `.ch-seg`, from the
new `--ch-seg-on-bg`, `--ch-seg-on-shadow` and `--ch-seg-on-ink` in
`tokens.css`, with a dark-mode shadow). Home, Roster, Calendar, Messages and
Rounds had their own greens or an ivory raised chip; those rules are gone and
the pages use the shared one. Phone and desktop alike. Checked in Chrome (Stats,
Roster, Messages, light and dark); not in Safari, and not on an iPhone.

## 2026-10-16 — One material for every desktop window; smooth wheel and no scrollbars everywhere

Owner, 2026-10-16 ("more premium and add same blur"; the course picker "still
looks vibe coded"; "get rid of the shimmer").

- **Desktop windows (`.ch-modal`, `styles/controls.css`).** Every window now
  takes one material, measured against the Claude and ChatGPT dialogs and
  Apple's sheets: the page behind dimmed with a light 8px blur, a solid panel
  with one hairline and one soft shadow on 20px corners, a 20px title, and the
  footer on the panel's surface over a hairline instead of a tinted bar; dark
  mode to match. It is a plain desktop query (above 820px): Safari matched
  nothing for a `not` of `prefers-reduced-transparency`. Phone sheets are
  unchanged.
- **A control in the window's head (`ui/Modal.tsx`).** `Modal` takes an
  `action`, drawn beside Close (the course picker's Add a course). Nothing else
  passes one yet.
- **Smooth wheel scrolling everywhere (`lib/smooth-scroll.ts`).** The canvas
  eased a wheel, but a list, a pane, a modal's body, a sheet and the sign-in
  screens scrolled in raw steps. One wheel listener, `useSmoothWheelEverywhere`
  (mounted in `ClubhouseFrame` and `AuthFrame`), eases whatever box the wheel is
  over, hands on to the box around it when one runs out of room, and never goes
  past a dialog or a box that contains its overscroll. Only a box that scrolls
  up and down keeps the wheel (`chScrollsVertically`), so a wide table in a
  sideways scroller no longer turns easing off under the pointer, and a sideways
  wheel stays native. The same rules as before: desktop, a notched wheel (a
  trackpad stays native), never with reduced motion or Animations off.
- **No scrollbars inside the app (`styles/base.css`).** With "always show scroll
  bars" (or a mouse) a long page took the bar's width and a short one gave it
  back, so switching between them moved the shell sideways (desktop Safari).
  Every scroller still scrolls by trackpad, wheel, touch and keyboard; forced
  colours bring the bars back. The themed thin scrollbar and its tokens' use
  here are gone.
- Verification: `smooth-scroll.test.ts` covers which box keeps the wheel, the
  hand-on to the box around it, the contained overscroll and the dialog edge.
  Not checked with a real wheel in Safari, or on an iPhone (the easing is
  desktop only).

## 2026-10-16 — The section switcher always shows in the phone's bar

Owner, testing the preview: on Stats the switcher at the top seemed to be gone.
A section page that draws its own large title (Stats, Roster, Rounds,
Qualifiers, Recruiting, Settings) hid the bar's "Stats ⌄" until that title
scrolled under the bar, and the large title opened the strip instead. The
bar's title now shows on every section page, as on Home and Calendar; the
large title stays as the page's heading, with no chevron, and opens nothing.
A pushed page still keeps its bar title back until its own large title tucks.
The switch-time "quiet" title, which only kept the bar's name out of the way
of a page that would hide it, is gone with it (`shell.css`, `section-switch`,
`TopBar`, `large-title`, `ClubhouseFrame`).

## 2026-10-16 — Held pages dated truthfully; Back to Stats lands in place

From the code review of PR #2195 (`use-prefetch-tabs.ts`, `lib/pop-mark.ts`,
`lib/use-painted.ts`, `section-switch.tsx`, `SectionStrip.tsx`).

- **How old a held page is.** Next answers a full prefetch from what a
  navigation showed (its back/forward cache) for 300s from the showing,
  without asking the server (next 16.3, `segment-cache/cache.js`), and a
  refresh empties that cache. The hook now records when each page was shown as
  well as fetched, so a page shown after its fetch is not taken for new 300s
  after the fetch. The document's first page is dated at the load, a refreshed
  page keeps the time of its refresh once it is left (it was reset to the time
  it was next asked for), and a section dropped from the last two visited keeps
  its date. Probed first (WebKit, 700ms latency): after a refresh, Stats was
  fetched from the server again and showed a team renamed 120s earlier at once,
  so a refresh still drops every held page.
- **Save for later.** A held page reached from outside the strip's sections is
  refreshed in place whatever its age: Save for later lands on the rounds
  library (a player tab) from the round, and its save does not revalidate. A
  Back is left as it was. A tap during the refresh wins: Next drops a refresh a
  navigation overtakes (WebKit, 700ms latency, a second tap 200, 600 and 900ms
  after the first: 3 of 3 ended on it).
- **Back to Stats.** A page brought back by Back or Forward renders all of it
  in its first frame (`useArrivalPainted`), so its scroll lands where it was
  left; with only its first screen rendered, it drew clamped for two frames,
  then jumped. That frame pays the full render again. The Back mark moved from
  RouteFrame to `lib/pop-mark.ts`, which both read.
- **Phone only.** The tabs are fetched ahead only at phone width; the strip's
  hook ran on desktop too.
- **A switch cut short.** An address reached another way (Back, a link) clears
  what a switch left standing (the quiet title, the arrival).

## 2026-10-16 — Going back to a section is instant too

The last two sections other than the tabs that were visited (Roster, Settings,
…) are fetched whole once they are left, like the tabs, so going back to one
shows the page at once and brings it up to date in place past 30s
(`use-prefetch-tabs.ts`). The tabs are fetched as soon as the first page has
painted instead of at the first idle moment. Measured (WebKit, local production
build, 700ms added to page requests): Roster revisited after Calendar, no
skeleton (2 of 2); a tab tapped about 0.6s after load, no skeleton; at about
1.1s, while that first fetch is still in flight, the skeleton shows and the page
follows at 586ms. A first visit to a section still shows its skeleton.

## 2026-10-16 — Signing out switches the phone's pushes off first, and Back cannot return

From the security review of PR #2195. Sign-out now waits, up to 1.5s, for this
phone's push token to be switched off before the session ends: started and not
waited for, the sign-out could win, the server action refused the signed-out
caller and a shared phone kept the last person's notifications. The login page
then replaces the current page (`location.replace`, a full page load, which
drops the router's cache and the phone tabs fetched whole ahead), and a
Clubhouse page Safari restores from its back-forward cache loads again instead
of showing what it held.

## 2026-10-16 — A switch to a phone tab shows the page, not its skeleton first

Every section switch drew twice: the route's skeleton at once, then the page
when the server answered (360–580ms later on the local stack, WebKit). The 30s
router cache that let a revisit render at once (native-feel P0-2, 10-08) was
removed app-wide on 10-13 (#2189) because Fairway, Baseball and Lift Lab served
stale pages, and a default prefetch stops at a dynamic page's skeleton.

The phone tabs (coach: Home, CoachHelm, Calendar, Stats; player: Home,
CoachHelm, Rounds, Team Hub) are now fetched whole ahead of a tap
(`use-prefetch-tabs.ts`, a full prefetch, which Next holds for its static stale
time, 300s) on the shell's first idle moment and after every arrival. A switch
shows the held page at once. If it was fetched more than 30s ago, it is
refreshed in place once it has painted (`router.refresh()`, no skeleton), so
what settles on screen is never more than 30s old. A refresh drops every page
Next held, so the other tabs are fetched again when idle. The owner chose this
over a 30s expiry (2026-10-16): with a real network an expired tab was slower
than today. next.config.mjs is unchanged (comment only). Measured (WebKit, local
production build, phone, 700ms added to every page request): tab switches 10s
and 45s after the last fetch show the page with no skeleton; at 45s one refresh
request follows and the page updates in place (a team renamed in the database:
the held name at 265ms, the new one at 1,117ms). A tap within about a second of
the app loading, while the first fetch is still in flight, can still show the
skeleton. Other sections (Roster, Settings, Recruiting, …) still show their
skeleton first.

## 2026-10-16 — Back returns a page to where it was left, in WebKit too

RouteFrame marks a Back (popstate) so the page it returns to goes back to where
it was left. Its listener was registered after the router's, and React commits a
Back inside the router's listener, so the frame read the mark before it was set
and opened every returned page at its top (WebKit, Stats → player → Back: 1 of 6
runs restored). The mark is now set in the capture phase, ahead of the router:
4 of 4 runs return to the place.

## 2026-10-16 — A long page can render its lower part after the first paint

`useArrivalPainted` (`lib/use-painted.ts`) is false while a page reached by
navigating renders its first frame and true once that frame is on screen, so a
switch's commit renders only what is seen. A render that hydrates is true from
the start, so the server's HTML still matches. Phone Stats uses it for the
sections below its first screen (P004).

## 2026-10-15 — Ink that holds at night, and Calendar's past steps back

Overnight polish. Dark mode drew ivory and forest ink from palette steps
that flip at night, so ink on a green fill or a pale tint went dark on dark
(Roster's Active filter, Messages' selected thread and All filter, Round's
figures, the Stats tape, the sidebar's selected plate). Two token families
carry the day value in light and a light value at night: `--ch-on-fill-*`
(ivory on a fill; 95 rules) and `--ch-forest-*` (forest ink on the page or a
pale tint; 52 rules). Ink on a fill that stays light keeps the palette step.
Light renders as before. The sidebar plate has its own night material
(`--ch-nav-well-*`). Stats' trend stage keeps the day palette at night, and
the calendar plates use the stage ink. Home's form label outranks the
Ledger heading ink (light, 1.2:1). Calendar: ended events step back and are
announced as ended, and past time takes a wash (P006). Phone Stats: a
malformed figures list stays in its section (P004).

## 2026-10-14 — A dialog can open on its first field

`Modal` takes `initialFocus`, a selector inside the sheet that takes focus as
it opens instead of the heading. Calendar's New event uses it on desktop for
its title field (P006, audit A-14); every other dialog still opens on its
heading.

## 2026-10-14 — Browser network text is never shown as a reason; a pushed screen returns focus to a top-bar opener

`friendlyReason` (lib/friendly-reason.ts) returns nothing for a browser's own
wording for a request that got no answer (Safari's "Load failed", "Failed to
fetch", "NetworkError…", "Could not connect to the server", abort and timeout
texts), so the caller's hint shows instead (`isRawBrowserFailure`). A
`PhoneScreen` opened from the shell's top bar (inert while the screen is up)
now gives focus back to its opener a frame after it pops, when nothing else
took it (P007 audit A-28).

## 2026-10-14 — Sign out ends in one request

Signing out refreshed the dashboard under the jump to login (a server action
that clears the active team re-renders the page). It is now one request to a
sign-out route that ends the session and clears the team together, with no
re-render (P008).

## 2026-10-14 — Log in from the home page goes straight to the sign in

The tap on Log in painted the dashboard skeleton before the sign in, and at
dusk or night the sign in opened on the daytime still before its sky drew. The
sign-in route no longer reads the request, and the still takes the hour's light
until the course draws (P015).

## 2026-10-14 — Old addresses reach their Clubhouse screen

Found on the Simulator: every old address Clubhouse moved (Tasks,
Announcements, Team, Intelligence, Courses, What's new, Documents, Travel, a
player's page, CoachHelm chat and genome, a round's review) stood on "hasn't
been rebuilt yet". Their layouts redirect, but under the dashboard's loading
boundary the redirect arrives in the stream and fires only when the segment
renders, and the frame dropped the segment for a page that isn't rebuilt. The
frame now renders an aliased segment hidden behind that page
(`CH_ALIASED_ROUTES`, guarded against every route that calls
redirectToClubhouse), so the redirect fires. Team Hub's "Assistant coach
joined" update and task push links were the visible cases.

The Calendar and Home key shortcuts no longer throw on a key sent to the
document (TypeError on the Simulator).

## 2026-10-14 — The bell drop lands on its cards, without the creep

Owner: "Notifications motion was trash". Measured on the Simulator: the first
open of a visit started on the skeleton and swapped the feed in about 400ms
into the drop (cards jumped 29px, frames of 30-59ms), and every open took
827ms, the last 300ms creeping the veil's final few dozen pixels.
- On the phone the feed is read once the page settles (requestIdleCallback),
  so the first open lands on its cards; opening still reads it again.
- The drop and veil arrive on the reveal spring cut at 1% and rescaled to land
  without a step: about 660ms.

## 2026-10-14 — Bell drop, page intro and settings rows from the Simulator audit

- The bell's drop keeps its list a scroller at every length
  (`.ch-bst__scroll::before`), so a pan on a short list no longer scrolls the
  page under it (WebKit hands a pan on a non-scrolling box to the document).
- `.ch-intro__row` wraps, so a page title and its view switch never push the
  switch off a phone under Safari's larger page text (Calendar's List was cut).
- Phone settings rows keep label words whole; the summary ellipsizes first
  (P008).
- The event editor's free-time lanes place the time on a tap, not on touch
  (P006).

## 2026-10-14 — Contrast and targets from the Simulator audit

A rendered-pixel contrast sweep of every phone section in both themes (iPhone 17
Pro Simulator, Safari 26.5). (A target-size scan flagged 30-32px icon buttons;
their 44px touch areas already exist as `::after` under `pointer: coarse`.)

- **The Ledger eyebrow** (tokens.css `--ch-ledger-eyebrow`, #7a6b3f to #6e6038):
  4.25:1 on the page and 4.4:1 as drawn on the canvas; now 5:1 or better on the
  canvas, the page and cards. Same gilt brown, one step deeper.
- **Muted ink on green** (tokens.css `--ch-on-green-ink-muted`, alpha 0.72 to
  0.8): the Team Hub "Latest" card's meta and CoachHelm's focus head drew at
  4.1:1 at the light end of the green gradients; now 4.5:1 or better there,
  still a step under the soft ink.
- **Dates and times in the dark theme** (controls.css): WebKit draws a date or
  time value in its own part, which globals.css paints a fixed warm-900 for
  Fairway, so the New event sheet's date and times looked empty on the dark
  field. A Clubhouse field's value now takes the field's ink.

## 2026-10-13 — Section switches: fade through, one bar change, warm inbox

Measured on a real iPhone (WebDriverAgent driving the signed-in preview,
Instruments' Animation Hitches recording): section switches dropped no frames,
so the choppy feel was the switch's design, not jank.

- **A fade through, not a crossfade** (tokens.css, base.css): screenshots 0.35s
  after a tap showed the old page and the new skeleton faded through each other
  into a washed-out double image on every switch. The old page now clears in
  120ms, the new page fades in over 220ms after a 90ms gap, and a route skeleton
  waits for the old page to have gone (the 300ms hold plus the 120ms fade)
  instead of fading in through it.
- **One change to the top bar** (section-switch `switching`, TopBar, shell.css):
  the title changes on the tap, as before, and the old section's buttons and
  mark now step back with it; the new page brings its own. Before, the title
  changed first and the buttons (the bell, the page's +) swapped a beat later
  when the page arrived. The address changes when the route's skeleton commits,
  so the bar's buttons also wait while that skeleton is on screen (checked on
  the phone: the shell's bell no longer shows before the page's own button).
- **A warm inbox** (shell/use-warm-inbox.ts): the shell fills Messages' session
  cache once it is idle, so the first visit paints the list at once instead of a
  second skeleton for about three seconds while the browser loads it; the list
  still refreshes silently. Skipped when warm, with Data Saver on or offline.

## 2026-10-13 — Popups: one sheet rise, one backdrop, one exit

Measured in the Popup Lab (headless WebKit, 402px, dev build). Sheets on the
phone rose three ways and sat on five
different tints; they now share one motion and one material.

- **One backdrop** (`--ch-scrim`, tokens.css): every sheet, dialog and drawer on
  the native top layer (Modal, the
  Settings and Recruiting sheets and action sheets, the Ask sheet, CoachHelm's
  History drawer) sits on the same
  solid wash, rgb(20 20 18 / 0.36), and its night value in dark mode. Before:
  0.32, 0.42 and 0.45, with three dark
  values. No blur: a full-screen blur re-blurs the page on every frame of a
  WebKit open.
- **One rise**: every phone sheet rises on the smooth spring (462ms, no
  overshoot), as Modal, the bell and the
  account sheet already did. The Settings and Recruiting sheets and action
  sheets took the 260ms ease-out; the Ask
  sheet popped like a desktop dialog (fade and scale) although it is a bottom
  sheet; the History drawer slid in
  on the ease-out. All eight Popup Lab sheets now read `ch-rise 462ms` on the
  same `linear()` curve.
- **One exit** (`useDialogLifetime`): a sheet or drawer closed by Close, Esc or
  its scrim leaves on the same smooth
  spring it rose on, from rest (370 to 450ms by its height), as a thrown one
  already did at the throw's speed and as
  the bell and the account sheet do. Before: a 260ms ease-out that started at
  full speed. A centred desktop dialog
  keeps its 260ms fade and settle; the backdrop clears over 260ms either way.
- **Left as they are, on purpose**: popovers and menus (`CH_POP`, 180ms: small,
  anchored, quick by design); the bell's drop (the reveal spring's slight
  landing give); Peek's deeper tint (a focus preview, not a sheet); the round's
  submit screen and course view, which cover the round on their own greens.

## 2026-10-12 — Motion audit: every phone transition on the compositor or out of its frames

Measured in headless WebKit at 402px on the dev build (the preview pages are 404
in production builds), frame by
frame, against an inventory of every Clubhouse motion. The rule found:
framer's `x`, `y` and `scale` run on the main thread, so any render work during
the move stutters it, while
`transform` and `opacity` (CSS, WAAPI, or framer given a transform string) keep
moving on the compositor.

- **Pushed screens and the page beneath** (`PhoneScreen`, `PhoneUnderlay`,
  CH-1610, CH-1618): the screen slides
  by a transform string and the page draws back by WAAPI `translate`, on the
  same smooth spring, from wherever each
  is when interrupted. A 50ms stall 96ms into a thread's pop was a visible
  hitch; it no longer holds the slide.
- **Back pop** (`playPop`): the copy of the leaving page leaves out what lies
  below the window (`cloneInView`,
  tested), so it is cloned and laid out only as far as the screen reaches: about
  half the time on long pages.
- **Account sheet** (CH-1802): the page under it goes inert once the sheet has
  settled and comes back once it has
  left, not mid-slide (a full style pass, 6 to 20ms a frame); focus returns to
  the title after the exit too.
- **Peek** (phone): a solid tint behind the card instead of a full-screen blur
  fading in and out.
- **Settings sections** (CH-8609) and the **peek card**: transform strings, so
  they run on the compositor.
- **Skeletons** (phone): the sheen is its own layer slid by transform; the
  shared sweep repainted every block on
  every frame while a page loaded.
- **Popovers, menus, content swaps, Settings panels, the offline banner, the
  Saved tick and the roster peek**: the
  shared presets (`CH_POP`, `chSwap`, `CH_ROUTE`) and these one-offs move by
  transform strings, on the compositor
  with their fade. Same distances and timing.
- **Segmented view switches** (`Segmented redraws`: Calendar's views, Rounds'
  grouping, the team roster's sort,
  Messages' filter, a player's rounds shown): the chip moves in the tap's frame
  and the view renders after it as a
  transition, so the chip starts about 40ms sooner (WebKit, dev). Stats' window
  switch keeps its own loading.
- **Bell** (fix): its portal waits for hydration; the always-rendered drop made
  the server and client HTML differ.
- **Checked and left as they are** (measured): the overlay scroll lock (0 to 3ms
  a frame), the `:has()` rules (no
  measurable style cost), the notification stacks' fan (no frame over 13ms),
  Modal's CSS rise and the dialog exit
  (already on the compositor), the page crossfade and push/pop view transitions,
  the strip's root attribute (no
  measurable style cost), and the small colour and shadow fades on controls
  (small repaints). Tried and dropped:
  rendering a sheet's or a pushed screen's body a frame after its frame; it
  started the motion 10 to 30ms sooner on
  the dev build but loses the body being there when the sheet opens. Toasts keep
  framer's y (their swipe and reflow).

## 2026-10-12 — Phone navigation: the section strip; notifications as stacks

Owner-approved from interactive prototypes (no owner board; spec in
`docs/clubhouse/phone/section-strip.md`).

- **No tab bar.** The phone's floating tab bar and the More sheet's section
  rows are gone; the page runs to the bottom edge (`--ch-tabbar-h` is 0).
  The section's name in the green top bar is the switcher (`SectionTrigger`,
  CH-1816): tap it, pull the bar down, or swipe the bar sideways on a
  section's own page. A pull draws the strip out under the finger; a swipe
  moves the title with resistance, commits past 56pt or a flick, and never
  wraps. Large titles carry a chevron and open it too.
- **The strip** (`SectionStrip`, CH-1808): every section the role has (the old
  tabs first, the sidebar's order, then Settings), then an Account pill. It
  slides out from under the bar on the smooth spring in the bar's green with
  its own sheet lip; the current section is centred on an ivory plate that
  glides (`layoutId`, settle spring); counts sit on their pills and the closed
  title carries a dot. Tapping the current section pops pushed screens or
  scrolls to the top (CH-1907).
- **Account sheet** (`AccountSheet`, CH-1802, once the More sheet): who you
  are, the coach's team switch, Help and Sign out.
- **Back links.** Pages that said "‹ More" are section roots now: their bars
  show the switcher (`PhoneTop start`), and `phonePushedTop` returns null for
  them. Pages below a section still push.
- **Notifications** (`BellStacks`, CH-1811): on the phone the bell drops a
  green veil from under the bar and the feed as lock-screen stacks: unread by
  kind (newest stack first), everything read folded into Earlier. Tap a stack
  to fan it out (one at a time); swipe a card left, or a stack's ×, to mark it
  read; Mark all read in the head. The rules are `notification-stacks.ts`
  (tested). The veil pours down by transform only and the stacks land on the
  new `reveal` spring (D-64's reveal duration, no bounce); they leave on
  smooth at the speed they were thrown. The feed starts loading on touch-down.
- **Smooth in WebKit** (measured in Safari at 402px, dev build): the drop stays
  rendered, hidden and inert, so opening it only moves it; no body scroll lock
  (it re-laid out the whole page in the first frame; touch-action holds the page
  instead); no backdrop blur on the veil, cards or edges (the veil is solid
  green, the cards solid ivory); no scale; an unchanged feed keeps its identity
  and the stacks are memoized, so a refresh mid-drop re-renders nothing. First
  frame about 40ms to about 20ms; every frame after it 11 to 15ms.
- **The Ask CoachHelm key** is off the phone top bar (desktop keeps it).
- Haptics: `select` when the section changes and when a stack fans; opening the
  strip is silent; the account pill ticks as the More button did.

## 2026-10-12 — Router cache back to Next's default

The app-wide 30s dynamic stale time (`experimental.staleTimes`, native-feel
audit P0-2) is removed from `next.config.mjs`. It applied to every product, so
Fairway, Baseball and Lift Lab could show a page up to 30s old on a revisit.
Clubhouse tab revisits go back to the server again (the route skeleton shows)
until a Clubhouse-scoped cache exists. `shell/use-prefetch-tabs.ts` comment
updated.

## 2026-10-11 — Route errors name the page that failed

`RouteErrorView` (`ui/Notices.tsx`) takes the boundary's `route`. For a load
or unknown failure (CH-1205, CH-1206) the title names the page: its nav item,
else its first dashboard segment as words (`routeErrorLabel`), for example
"Rounds didn’t load" for `/golf/dashboard/rounds/[id]`. Home and routes
outside the dashboard keep the fixed titles; the other kinds keep their copy,
and the CH codes are unchanged. `RouteErrorBoundary` passes its `route` prop
through; no `error.tsx` file changed.

## 2026-10-11 — Cold loading frame agrees with the gate

With a team allowlist (`HELM_CLUBHOUSE_TEAMS`), the `/golf` loading boundary
painted Clubhouse's frame before the team was known, so a team outside the
allowlist saw Clubhouse flash and then swap to Fairway.
`clubhouseLoadingFrame()` in `gate.ts` now answers for that boundary: Fairway
with the flag off, Clubhouse with the flag on and no allowlist, and a neutral
frame otherwise. No visible change with the flag off or with no allowlist.

## 2026-10-11 — Depth from tokens and transform-only motion across the premium pass

The `clubhouse:css` gate found 57 raw outer blur shadows and layout transitions
in the premium-pass CSS. Fixed at the source, light and
dark:

- **New elevation tokens** (`styles/tokens.css`, both themes), each drop-only so
  the caller keeps its own ring or inset edge:
  `--ch-elevation-mark-warn` (amber glow under a loss bar),
  `--ch-elevation-mark-ink` (a small neutral drop under a mark, number or
  dot), `--ch-elevation-plate` (a long faint drop under a gold-ringed reading
  plate), `--ch-elevation-pill-on` (the selected green
  segment pill), `--ch-elevation-face` and `--ch-elevation-face-hover` (the
  roster's portrait cards, the drift follows the light).
- **Shadows by role:** deep-green stages (Home's team form, the round review's
  stage and hero, the team stats strokes-gained table) use
  `--ch-elevation-feature`; tip cards `--ch-elevation-overlay`; green marks
  `--ch-elevation-mark`; the Messages composer
  `--ch-elevation-floating`, the ready Send `--ch-green-raised-shadow`; the
  roster's selected portrait `--ch-elevation-choice-hover`.
  Affects calendar, classes, CoachHelm, home, hub, messages, qualifiers,
  recruiting, roster, rounds, stats and `ui/Zone` (the
  zone number and reading plate). Small differences in blur and opacity against
  the old literals; rings and inset material unchanged.
- **Motion without relayout:** fills scale or slide on transform; dots, ticks,
  tips and coins move by `translate` in container units on
  a still, full-width track (the track is the size container, so it never
  overflows its chart). Applies to the Hub read bar, the
  qualifiers and roster spreads, the round review and library tips, and the
  player stats zones. The Hub RSVP split and the stats mix
  and fairway strip glide on flex-grow. Not gliding any more: the classes
  timetable bar, and the strokes-gained bars on the round review
  and player stats (sized inline; tests read that width).

## 2026-10-10 — Three depth tokens for the rounds pass

Shared pieces for the rounds library and new-round pass (P011's log has the
screens). Not yet reviewed by the owner.

- **`--ch-elevation-board`**, **`--ch-elevation-board-hover`** and
  **`--ch-elevation-mark`** (`styles/tokens.css`, light and dark): drop-only
  depth for a field-green board hung on the page (a scorecard nine, the round
  strip, a row's Out/In/Tot, a step deeper on hover) and a small glow under a
  lit
  data mark (the best round's dot, the putts bar, a hit green). The caller keeps
  its own ring or inset edge.
- The rounds season chart also uses `useInViewOnce` (`lib/use-in-view.ts`) to
  raise its bars from the par line, and the season chart and the new-round nine
  boards draw with the existing `--ch-stage-*` tokens.

## 2026-10-10 — Premium polish across the app: baseline control feel, line breaks, radius tokens, one contrast fix

Found by scanning every main preview screen in WebKit (contrast, controls with
no transition, tap sizes, radii, heading sizes), then fixed
where the cause was shared:

- **Controls ease between states everywhere.** 24 buttons, inputs and links
  across Messages, Recruiting, Hub, Home, Stats and the round
  review had no transition at all. `styles/base.css` now gives every control a
  zero-specificity baseline (background, colour, border,
  shadow and opacity over `--ch-dur-quick`); a component's own transition still
  wins. Transform is left out because drags and scrubs set
  it every frame. After the change the scan finds none on 14 of 16 screens.
- **Lines break well.** Headings use `text-wrap: balance` and running text
  `pretty`, app-wide.
- **Radius tokens.** 37 `9px` and `11px` corner literals (not on the
  5/7/10/14/20 scale) are `--ch-radius-md`.
- **Contrast.** White on the grey bogey segment of the scoring mix was 3.4:1; it
  is a darker grey (5.3:1).
- Scan result otherwise: no text under 4.5:1 outside dark-gradient panels the
  scanner cannot read, headings on a consistent 44/30/19/15 scale.

## 2026-10-10 — one Zone for player stats and the round review, stage tokens, and micro motion

Audit of the stats and round-review work, then fixes (owner: "create cool micro
animations, look for inefficiencies and non cohesion"):

- **One zone, not two.** `ui/Zone.tsx` (`Zones`, `Zone`, `ZoneBlock`, `ZoneBig`,
  `ZoneNote`) and its `.ch-zn*` rules in `styles/ui.css`
  replace the two copies that had grown in `stats.css` (`.ch-z*`) and
  `rounds.css` (`.ch-rz*`), which had already drifted apart (the
  round review had the plate, the gold-ringed number and the depth; the stats
  page did not). Both pages now read as one family. About
  560 lines of duplicated CSS are gone.
- **Flat grounds.** The review's soft ivory gradients on its bands are gone:
  `tokens.css` records that large soft gradients band on
  8-bit screens (owner, 2026-10-06). Gradients stay only where they are drawn on
  purpose (the deep-green stage, bars, figures).
- **Stage tokens.** `--ch-stage-bg`, `-line`, `-gold`, `-red`, `-ink`,
  `-ink-soft`, `-rule` in `tokens.css` replace the hex values
  repeated through the review's SVGs.
- **Micro motion**, all from the `--ch-dur-*` tokens so Animations off and
  reduced motion make every one instant (a delay is zeroed
  for reduced motion): lengths glide to a new value when a window, filter or
  hole changes (bars, tracks, mix, fairway strip, focus
  rails); a stage's line draws once the first time it scrolls into view
  (`lib/use-in-view.ts`); a picked hole's shots draw in the
  order they were hit; a hole's reading settles in; rows warm and the marks lift
  under the pointer; the scrub card fades rather than
  vanishing. No count-ups, no first-paint staggers.
- **Efficiency.** The player Overview is memoised, so a focus sheet or a
  transition no longer recomputes its seven zones.

## 2026-10-08 — the selected sidebar row is an ivory plate; secondary text one step darker

Owner review (not yet signed off):

- **Sidebar:** the open row's plate (`--ch-nav-well-bg`, `--ch-nav-well-shadow`
  in
  `styles/tokens.css`) is ivory with green text and icon, where it had been a
  dark
  well. `NavPlate` still glides it between rows.
- **Text:** in the light theme `--ch-text-secondary` is ink-700 and
  `--ch-text-tertiary` ink-600 (they were ink-600 and ink-500), one step darker
  everywhere the shared tokens are used. This landed with the Calendar details
  panel commit (`3ae8479b7`, P006's log) and is recorded here because the tokens
  are
  shared.

## 2026-10-08 — Two scoring tokens for numerals on the feature green

A shared token change for the shot screen's hole strip (P011's log has the
screen). Not yet reviewed by the owner.

- **`--ch-score-under-on-green`** (`styles/tokens.css`): a bare under-par
  numeral on the feature green, lifted so it
  holds 4.5:1 on green-900 and on a played chip's faint ivory wash (the same red
  the qualifiers board uses for its
  to-par text). **`--ch-score-under-on-ivory`**: the same numeral on an ivory
  chip that sits on the green. Both
  surfaces stay the same at night, so neither is redefined in the dark block.
  Red still means under par only (D-42).

## 2026-10-08 — The Ask sheet's @ picker offers the stats alone

- `styles/shell.css`. The composer's mention key is now named "Mention a player
  or stat" (P013 changelog, the cmdk
  picker), so the Ask sheet's rule that hides it (the sheet has no roster to
  mention from) follows the new name.
- `shell/AskSheetBody.tsx`. The sheet passes `roster={false}`: typing `@` in it
  opens the picker with the stats
  CoachHelm can read and no Players group, rather than "No active players" for a
  team that has players (desktop showed
  that line before; the phone opened no picker). The list is capped to the room
  inside the sheet's panel, which clips
  its overflow, so a short sheet never cuts it off.

## 2026-10-08 — Phone: large titles collapse into the bar; flat More sheet

From the owner's cardless, native-feeling phone pass. A shared shell change; no
page's own files change. Not yet reviewed by the owner.

- **Large titles** (`shell/large-title.tsx`, `shell/TopBar.tsx`,
  `styles/shell.css`). A phone page that opens with its own large title no
  longer names itself twice. While the large title is in view the bar's title is
  hidden; once it scrolls up under the bar, the bar's title fades in over 180ms
  (`--ch-dur-quick`, opacity and a 3px rise). It fades out again on the way back
  down. Reduced motion and Animations off swap it at once. The large titles are
  listed once, in `CH_LARGE_TITLES`: Roster, Recruiting, Qualifiers and My
  qualifiers, CoachHelm, Team stats and Rounds, plus Settings, whose bar title
  is now visible (`screens/settings/phone/SettingsPhone.tsx`) so it appears once
  the large title tucks. A page can opt in with `data-ch-large-title`. A CSS
  `:has()` on the same list hides the bar's title from the first paint of a
  loaded page. Settings', Recruiting's, Roster's and Rounds' skeletons mark
  their title block (`RosterSkeleton.tsx`, `RoundsSkeleton.tsx`); on the others
  the bar shows its title while the skeleton is up and fades it out as the page
  lands. One IntersectionObserver on the title marks the bar
  `data-large-title="tucked"`. Pages without a large title keep their bar title:
  Messages, Calendar (its month is content), Round, Qualifier, Player stats and
  Classes. The green hero's bar is unchanged. The bar's title stays in the
  accessibility tree and remains the focus target.
- **Scroll edge** (`styles/shell.css`). The bar casts a soft frame-green shade
  onto the sheet below it only once content has scrolled under it
  (`data-scrolled`). It is drawn on `::before`, because `::after` is the sheet's
  lip. There is none on the hero's green.
- **More sheet** (`styles/shell.css`). The sheet's lists and the "who you are"
  row are native inset grouped rows: a rounded tint of the sheet with no shadow,
  hairlines inset to the label, and plain icons instead of tiles. The current
  page and the current team keep their green icon. The sheet itself is
  unchanged.
- Phone only (`max-width: 820px`); desktop markup and styles are untouched.
  WebKit at 390px, 2026-10-08, with this CSS and the watcher injected into the
  running preview: the collapse was checked on 8 screens and the no-title case
  on 6, plus the More sheet open (coach, two-team coach and player), reduced
  motion, and desktop at 1280.

## 2026-10-08 — Native phone navigation: cached tabs, steady bars, push and pop

From the native-feel audit (docs/clubhouse/NATIVE_FEEL_PERF_AUDIT_2026-10-08.md,
P0-2, P0-3, P1-1, P1-2). Not yet reviewed by the owner.

- **Router cache and prefetch** (`next.config.mjs`,
  `shell/use-prefetch-tabs.ts`). `experimental.staleTimes` keeps a visited
  dynamic page for 30s and a prefetched loading shell for 180s, so a revisited
  tab renders from memory. This is app-wide, Fairway included: a revisit can
  show data up to 30s old until a mutation refreshes it. The phone tab bar
  prefetches its tab routes once the shell is idle, but not with Data Saver on
  or offline.
- **Steady bars** (`styles/shell.css`). The top bar and tab bar have their own
  view-transition names, with no animation. They no longer fade with the page,
  and the page's snapshots no longer draw over them.
- **No skeleton flash** (`shell/RouteFrame.tsx`, `styles/base.css`,
  `styles/tokens.css`). A tab change onto a route skeleton keeps the old page up
  for 300ms (`--ch-dur-vt-hold`) and keeps the skeleton hidden for the same
  time. A page that arrives sooner replaces the old page directly. CH-1619's
  fade over the skeleton now runs only after the skeleton has shown and the
  crossfade has ended, so there is only ever one fade at a time. A hard load,
  reduced motion and Animations off still show the skeleton at once. This
  reverses F-37's 0ms delay, but only for in-app navigations.
- **Push and pop** (`lib/nav-motion.ts`, `styles/shell.css`). On a phone, a
  drill-in (a More row, or a link into a detail) pushes: the new page slides in
  from the right edge on the smooth spring (462ms) while the old one draws back
  by 30%. A link up a level pops the same way in reverse. React commits a Back
  synchronously, without a view transition, so Back from a pushed page draws its
  own pop: a copy of the leaving page slides off to the right edge over the page
  beneath, which comes in from −30%. The pop is skipped after an iOS edge swipe,
  with reduced motion or Animations off, and on desktop. A tab change still
  crossfades.
- **More leaves first** (`shell/TabBar.tsx`). A row that navigates hides the
  sheet and its scrim in the same tap, so neither appears in the page
  transition.
- **Pushed screens pop on the spring** (`shell/PhoneScreen.tsx`,
  `shell/phone-chrome.tsx`; CH-1610, CH-1618). A pushed screen and the page
  beneath it now return on the smooth spring, not the 260ms ease-out. The pop
  had read as a 183ms jump; it now clears in about 350ms. The underlay shift
  stays at the owner-approved 24%.
- **Hover card honors reduced motion** (`ui/Peek.tsx`, CH-1831). The desktop
  hover card's 4px rise now swaps in instantly under reduced motion or
  Animations off, like the phone peek already did.

## 2026-10-08 — Premium pass backlog: one light, peeks, the Ask sheet, a dock

Approved by the owner on 2026-10-08 (owner review;
docs/clubhouse/PREMIUM_PASS_AUDIT.md). Each page's part is in its own log.

- **The global light** (`lib/light.ts`, `lib/sun.ts`, `shell/light.tsx`). One
  sun for the whole app, from the time of day and the team's course location
  (CH-8320, held migration) or its time zone. It lights the frame and the
  materials, never data.
- **Peeks** (`ui/Peek.tsx`, `ui/PlayerPeek.tsx`). Hover on desktop, hold on the
  phone, a player's card from data the page already has.
- **The Ask sheet and the thumb dock** (`shell/AskSheet.tsx`,
  `shell/AskSheetBody.tsx`, `shell/Dock.tsx`), plus deep links
  (`lib/deep-link.ts`, `shell/DeepLinks.tsx`).
- **Dynamic Type** (`lib/dynamic-type.ts`). Type scales with the text size
  setting.
- **Dialogs and bars** (`lib/dialog-lifetime.ts`, `ui/Modal.tsx`,
  `ui/PhoneBar.tsx`). A bar can leave the heading to its page (one h1 per
  screen). The frame, sidebar, tab bar and top bar take the light, and pad for
  the tab bar only while it shows.
- **Route errors** (`shell/ClubhouseRouteError.tsx`). The preview routes get the
  shell's error view; a stale chunk recovers through the existing recovery
  coordinator.

## 2026-10-08 — A switch that stretches, trackpads left alone, a steady bar

Approved by the owner on 2026-10-08 (the shell's part is in P001's log).

- **The switch** (`controls.css`, `ui/Switch.tsx`; P001 CH-1620). Held, a
  switch's thumb stretches about a fifth of its width toward where it would
  travel, as UISwitch's does, and settles round as it slides across. It grows
  from the edge it rests on, on the scale property, so nothing reflows. The
  track is a size container, so Settings' larger switch finds its edge without
  a rule of its own. A disabled or saving switch stays round; so does every
  switch with reduced motion or Animations off. WebKit, 2026-10-08: 19 to 22.8px
  wide and back (27 to 32.4px in Settings), the far edge still to the pixel.
- **Smooth scrolling** (`lib/smooth-scroll.ts`; P001 CH-1621). On a Mac a
  trackpad gesture scrolls the desktop canvas natively, on its own momentum; a
  notched wheel still eases. The first wheel event of a gesture decides: whole
  pixels or a sideways part mean a trackpad, fractional line steps a wheel. A
  glide a wheel started stops where it is when the fingers take over. Other
  platforms ease every wheel, as before.
- **The scroll lock** (`lib/overlay-scroll.ts`; P001 CH-1618). The body is
  clipped rather than hidden while a sheet or a pushed screen is up, and the
  phone's canvas is left alone, so the sticky top bar stays on screen over a
  page scrolled down. Before, it left the screen until the overlay closed.
- **Haptics** (`lib/haptics.ts`). The medium tap's grammar adds the app's pull
  to refresh at its trigger (P001 CH-1709).

## 2026-10-08 — The kit for pages, a search field with its own reach, choices that answer a press

- **The Ledger kit** (`ui/Ledger.tsx`) is ready for the phone pages:
  `LedgerRow`, `FigureRow`, `FeatureCard`, `PageIntro` and `LedgerList` take
  `className`, `code` (as `data-ch-code`) and `label` (the accessible name,
  where ARIA allows one: a plain row's on its list item, a plain feature card's
  as a named group). `FeatureCard` takes `onClick` (a button); a `LedgerRow`
  with both `href` and `onClick` runs the click as the link is followed;
  `PageIntro` takes `level={2}` for an intro under a phone bar that already
  holds the h1. What already rendered renders the same.
- **The search field** (`ui/SearchField.tsx`, `controls.css`) carries its own
  reach on the phone (P001 CH-1815): 36px drawn, 44px to the finger, its input
  and clear key above the reach, and 16px text so iOS doesn't zoom the page on
  focus. Every `SearchField` gets it without a rule of its own (checked in
  Rounds and Recruiting at 390); Recruiting's and Qualifiers' own reach rules
  are now redundant.
- **Choices answer a press** (P001 CH-1617): a segmented option or a pill that
  isn't on takes the press tint over the press beat, after the 50ms delay a
  UIKit cell waits; nothing scales. The kit's feature card, as a link or a
  button, answers with a shade over its green instead of a 0.985 scale (cards
  never scale, owner 2026-10-01).
- **`PhoneBarParts`** takes `heading={false}`, for the shell's stand-in bar
  (P001 CH-1402).

## 2026-10-08 — The shell's own states join the family

- **The bell:** its empty ("You’re all caught up", "Nothing of this kind") is
  the shared section empty at the rows' inset, not a centred block of its own.
  When its list doesn't load, the panel's head no longer says "3 unread" or
  offers Mark all read beside "Notifications didn’t load"; the bell keeps its
  count.
- **Not rebuilt:** the placeholder for a route not rebuilt yet is the page
  empty's anatomy (an hourglass medallion, Back to Home), no longer a white
  card.
- **The route error's way back** goes where the route's error boundary says
  (`homePath`) and is named for it: Back to Home, or Back to Rounds after a
  round crashes. It always went to Home before.
- **On-green notice inks** are tokens, `--ch-notice-on-green-ink` and
  `--ch-notice-on-green-body`, so a notice on the green takes them instead of
  copying the colours.

## 2026-10-08 — Springs, thrown sheets and the gestures iOS has

Motion gains real springs on D-64's durations. This is a lead decision under the
owner's full-auto brief, which the owner confirmed on 2026-10-08.

- `CH_SPRINGS` in `lib/motion.ts`: `smooth` (base, bounce 0) for anchored parts,
  and `settle` (base, bounce 0.1, about 0.15% past the mark) for a free part
  arriving.
- `chSpring` hands framer the same spring as stiffness and damping. framer 13
  drops the velocity of a spring given as a duration and a bounce, so this is
  what lets a retarget or a throw keep its speed.
- `chSpringCurve` samples the spring for Web Animations and CSS:
  `--ch-ease-spring-smooth` and `--ch-dur-spring-smooth`, behind `@supports`,
  with the Animations-off zero. The phone `Modal` sheet now rises on it
  (`controls.css`), as More and the bell do. The pages' own sheets keep their
  ease-out until their owners adopt it.

Reduced motion and Animations off stay instant.

- **Sheets** (`lib/sheet-drag.ts`, every phone sheet), CH-1611. Pulled up, a
  sheet gives like a rubber band over a floor of its own colour. Let go, it
  springs back from the speed it was moving. Thrown back up hard, it carries on
  a little past its open position over the same floor, and a finger can catch it
  on the way. The coach chat's history drawer and the sidebar plate hold at
  their mark instead (`hold`): sent at it too fast to stop there, they start
  slower rather than pass it. It drags from its body once that is at the top and
  the first move is down, and the row a drag started on doesn't open. A throw
  carries its speed into the close (`takeSheetFling`, then
  `lib/dialog-lifetime.ts` or the sheet's exit). A dialog sheet closed without a
  throw keeps the base ease-out; More and the bell leave on the spring either
  way.
- **Toasts** (`ui/Toast.tsx`), CH-1614. Held, a toast's clock stops; let go, it
  stays at least 1.5 seconds. Thrown toward its edge past 40px or on a flick, it
  goes on at the throw's speed and fades.
- **The segmented pill and swaps.** The pill (CH-1615) and a swap's incoming
  copy (CH-1616) arrive on the settle spring.
- **Slider scrub** (CH-1708). A finger scrubbing a slider warms the Taptic
  Engine as it lands, ticks each step it crosses, and lets the engine idle on
  release (`hapticScrub`).
- **Row press tint** (CH-1606). A row's tint waits `--ch-dur-press-delay`
  (50ms), so a scroll that starts on a row never flashes it. It also holds with
  reduced motion.
- **iOS Back** (CH-1908). A Back that iOS animated itself is not animated again
  (`lib/ua-pop.ts`).
- **The iOS shell** sets `CADisableMinimumFrameDurationOnPhone`, so native
  layers (scrolling, the edge swipe) can run at 120Hz on ProMotion iPhones.
  WebKit page rendering in the WebView stays near 60fps (WebKit bug 294338).

## 2026-10-08 — Empty, failed and loading states, one family

The states audit (2026-10-07) found three empty-state anatomies, a pink boxed
notice in the flush Ledger, a route error in a white card and skeletons drawn
as filled cards. The shared layer (`ui/States.tsx`, `ui/Notices.tsx`,
`ui/RefreshNotice.tsx`, `ui/Retry.tsx`, `ui/SectionBoundary.tsx` and their
blocks in `styles/shell.css`) now draws one family:

- **Section empty:** a flush line, left-aligned to the section's edge: an
  optional glyph in the forest ink, the title, one sentence and the action
  under them. No well, no centring.
- **Page empty:** in the Ledger it sits under the framed head with measured air
  (72px above, 88px below) instead of a viewport's height, so the action stays
  above the fold. Its title is the ledger ink everywhere, the phone included.
- **Notice:** no pink box and no stripe. It sits between the section's own
  engraved rules with no fill and no ring, its icon on the heading's edge; the
  icon and title are in the danger ink and the body in the secondary ink. (A
  2px danger stripe at its left was dropped the same day: our design guidance
  avoids side stripes.) Try again sits beside the words in a full-width notice,
  and under them in anything narrower than 640px (a rail, a half column) and on
  the phone. A notice on a dark or floating surface is restyled through
  `--ch-notice-ink`, `--ch-notice-body` and `--ch-notice-fill`
  (`--ch-notice-rule` stays declared but is no longer drawn); on the
  FeatureCard it already takes the ivory inks.
- **Several failed parts (CH-1209):** `PageNotice` and `PageRefreshNotice` say
  it once under the page head with one Try again. Each failed part's notice
  takes `covered` and keeps only its title. Pages adopt it as they are next
  touched.
- **Several crashed sections (CH-1210):** a `SectionGroup` around a page's
  rendered tree, with `SectionGroupNotice` under its head. Each failing
  `SectionBoundary` inside it registers itself; at two or more, one notice
  ("Some of this page couldn’t be shown") names them in reading order, its one
  Try again tries them all again, and each crashed section keeps only its
  title. It lives in the browser only, so server HTML and hydration are
  unchanged; without a group a crash keeps its own notice, as before.
- **Route error:** the page empty in a brick danger tone, with no card. Try
  again (or Reload) comes first, Back to Home sits beside it, and the reference
  is a quiet caption.
- **A page whose one read failed (CH-1211):** `EmptyState size="page"
  tone="danger"` draws the route error's anatomy under the page's own head, as
  an alert, with Try again first (it re-runs the page) and the offline line
  (CH-1905) when there is no connection. The offline handling is one hook now,
  `useOfflineRetry` in `ui/Retry.tsx`, shared with the notice.
- **PageIntro eyebrow:** 12px instead of 11px (`styles/ui.css`), the F09 phone
  text floor.
- **Skeletons:** a shade deeper, about 1.2:1 on the workspace. On desktop Ledger
  pages a fluid placeholder 56px or taller is a rule with two lines of type, not
  a filled card; `shape="solid"` keeps a real object filled. New shared shapes:
  `SkelLine`, `SkelRows` and `SkelRule`.
- **Copy:** a state's title renders without a trailing full stop
  (`stateTitle`). The shared components' own copy uses curly apostrophes.

The six decisions behind this are recorded in P001 DESIGN.md as lead decisions
under the owner's full-auto brief, which the owner confirmed on 2026-10-08.

## 2026-10-08 — The phone chassis, and no serif anywhere

The owner approved carrying the Coach Home "Mobile clubhouse pass" board to
every phone screen.

**Phone chassis (`shell.css`).** The bar under the status bar is the frame's
green, with ivory type. The page is the parchment sheet (`--ch-workspace`),
and its top corners round into the green where it meets the bar, as on the
board. Pushed screens' bars follow.

**No serif.** The title tokens (`--ch-type-serif-*`) now resolve to the heavy
sans (600), and `--ch-font-serif` points at the sans. This follows the owner's
2026-10-07 choice of bold sans titles and the Clubhouse doctrine. Digits that
SerifText set apart take the title's own size and weight.

## 2026-10-07 — A page can own a second surface (`implementation.also`)

A page manifest's `implementation` takes an optional `also`: further paths the
page owns beside its root, loader, route and styles. The changelog gate, the
registry's path check and PAGE.md's Related block read it. P015 (Auth) uses it
for sign up and onboarding (`screens/onboard`, `data/onboard.ts`,
`routes/onboard.tsx`, `onboard.css` and `onboard-tokens.css`): until now
`onboard.css` was gated as a shared piece in this log, and the screens were
gated nowhere. Tests: changelog-gate, registry and docs-index.

## 2026-10-07 — Rows press with a tint; the motion notes say what runs

Every flush Ledger row a coach can open now answers a press with
`--ch-ledger-row-press` over the press beat, never a scale (Home, Qualifiers,
Rounds, Classes, CoachHelm, Recruiting, Calendar's agenda, Stats' grid, Team
Hub's files, Settings' rail and links), as the shell's CH-1606 describes.
Content that used to swap in one frame now settles in through the shared `Swap`:
Calendar's views and periods, Roster's layouts, Recruiting's stage, a desktop
Messages thread and Team stats' leg grid. The motion comments in
`styles/tokens.css` and `lib/motion.ts` no longer describe the staggered
first-paint reveal as live or say every tappable shrinks. No values changed.

## 2026-10-07 — An unavailable key is unlit

A disabled primary key (Save changes before an edit, Continue before a step is
complete) is now drawn unlit: the same shape pressed into the paper, its word
engraved, matching Sign in (CH-15607). It used to be a 42% fade of the green.
A key in flight (`aria-busy`) stays lit, since it is working rather than
unavailable.

## 2026-10-07 — Hover belongs to a pointer

On a touch screen a tap used to leave a row's tint, a card's lift or a key's
hover face behind until the next tap elsewhere. 168 hover-only rules across 24
stylesheets now sit inside `@media (hover: hover)`, so they apply only where a
pointer can hover. This includes a trackpad on an iPad, but not a finger on an
iPhone. Press (`:active`), keyboard focus and selected states are untouched,
and a selector that mixes hover with focus or press stays where it was. The
hover shadows that moved are now depth tokens (`--ch-elevation-*-hover`).

## 2026-10-07 — Motion: swaps, tabs and keys that glide

A shared `Swap` (`ui/Swap.tsx`) runs a content swap inside a fixed frame:

- **Settle:** the new content fades in with a 6px rise (base) while the old
  fades out (quick).
- **Slide:** the new content moves 12px in the direction of travel.

The leaving copy is hidden from assistive tech and focus at once. Nothing
animates on first paint, and reduced motion or Animations off swaps instantly.
It runs on:

- the profile's and Team Hub's tab panels;
- Team stats' trend measure;
- a round's hole stepping;
- each figure's value when the window changes (inline).

Tabs answer on the press: the underline moves first and the panel renders just
behind it (`useDeferredValue`). The primary and secondary keys' hover now glides
between faces (one gradient twice the key's height, sliding on
`background-position`) instead of snapping, since a gradient itself cannot be
transitioned.

## 2026-10-07 — The Ledger: sections flush on the canvas

The owner asked for pages that are flush and less card-heavy, and chose the
Ledger over one sheet per page or quieter cards. Inside the framed workspace on
desktop (`main[data-canopy]`, 821px and wider), a section is now a heading over
an engraved rule on the canvas, not a card. A real object keeps its material:
the green scoreboards, wells, form fields, the composer, dialogs, segmented
controls and chips.

- **Shared rules (`shell.css`):** inside a framed page a `.ch-sheet` loses its
  fill, shadow and radius. The serif type tokens map to the heavy sans
  (doctrine: no serif), and section headings take forest ink.
- **Tokens:** `--ch-ledger-rule`, `--ch-ledger-rule-soft`, `--ch-ledger-ink`,
  `--ch-ledger-eyebrow` and `--ch-ledger-row-hover`.
- **Components (`ui/Section.tsx`):** `Section` (heading, caption, actions and a
  flush body over the rule) and `BackLink` (the way back above a sub-screen's
  page head).

Sub-screens take the same framed page head as the main pages, with a back link
above it. The phone is unchanged.

## 2026-10-07 — Framed workspace and page head

The shell and every main page's head now follow the owner's Coach Home handoff
(the "Coach - Home" design bundle). The frame and sidebar are the frame green
(`--ch-shell` is `--ch-frame`), the brand sits in its own panel, and the
selected row is an ivory plate with a fine edge. The desktop canvas is a warmer
parchment (`--ch-workspace`) with a faint green bleed along its left edge, a
soft green mist at the top left and a fine frame edge
(`--ch-elevation-framed`).

The green canopy band is gone. `main[data-canopy]` now opts a page into the
framed page head: a double hairline above, one below, a small engraved date or
section line, a heavy 44px sans title in forest ink with a letterpress edge, one
sentence, and the actions on the right. Home, CoachHelm, Team stats, Roster,
Qualifiers, Calendar, Team Hub, Recruiting and Settings use it, and their
loading screens hold the same head heights (measured in WebKit at 1440 and
1100), so nothing moves when the data lands. The shared `PageHero` component
renders the head for Team stats and takes a tone for the header lab
(`/clubhouse-preview/header-lab`). The phone is unchanged.

## 2026-10-07 — Digits in serif headings sit with the words

The digits that `SerifText` sets in the sans inside a serif heading
(`.ch-serif-num`) used tabular figures at weight 500. Every 1 was padded to a
full figure width, so "Penalty strokes: 1.1 per round" read like typewriter
digits, heavier than the serif around them. They now use proportional lining
figures at the serif's weight (400). Tables and figure columns keep their own
tabular figures.

## 2026-10-07 — One green for the primary action

The primary button (`.ch-btn--primary`) was a second, brighter green (#1a6542)
beside the field green of the sidebar selection, the canopy and the scoreboard;
the owner's rule is one green. It is now the field green, with a faint lift at
its top edge, and its words are the warm on-green ink with the small engraved
shadow, never pure white. Hover and press step darker within the same hue.

## 2026-10-07 — Contrast after the darker page tone

The accessibility audit found text that fell under 4.5:1 once the page and wells
darkened. The loss amber (`--ch-chart-loss`) is now #865608 (5.1:1 on the page
tone, 4.7:1 on a soft well), and inside a well it takes the darker on-tint
amber. Rounds' unplayed hole numbers and the Classes timeline labels use the
muted on-green ink, and the labels go up to the 12px floor. The player stats
miss map's counts are darker. `clubhouse:a11y` is clean on Rounds, Classes and
both stats pages. The component catalog is regenerated.

## 2026-10-07 — Digits in serif headings, phone text floor

Display-serif headings that come from data set their digits in the sans
(`SerifText`, `.ch-serif-num`): the serif's 1 has no flag, so 11 read as ll.
This covers CoachHelm's insight and deep-dive titles, Team Hub's announcement
and trip names, and the live qualifier's name. The Standing and Deep dive counts
inside serif headlines use the same sans figures. New captions under 12px (the
Rounds range ends and date day, the Roster figure labels) are raised to 12px,
the phone text floor.

## 2026-10-07 — More contrast

The owner said there wasn't a lot of contrast. The desktop's secondary and
tertiary inks move one step darker, to the phone's values
(`--ch-ink-600` `#46433d`, `--ch-ink-500` `#5f5c55`). Reading sheets are
brighter (`#fdfbf7`) and
their edge ring firmer, at 0.085 at rest and 0.1 on hover.

## 2026-10-07 — No banding: solid sheets, no canvas wash

The owner saw the ivory as grainy in its gradients. Large, gentle ivory
gradients band on 8-bit displays, so reading sheets (`--ch-sheet-bg`) are now
solid ivory; their lit top edge remains the elevation's inset highlight. The
canvas wash is removed. Small keys and wells keep their gradients, because they
are too short to band.

## 2026-10-07 — Classic direction: ivory shell, canopy, serif titles

Owner direction, live in review: aim for a Masters, old-money look; an ivory
sidebar with green only on the selected row ("way too much green"); and one
green throughout ("it's not even the same green"). The owner noted the overall
direction may be revisited later.

- **Shell:** the sidebar and the frame around the canvas are ivory
  (`--ch-shell`). The selected row is a green key in `--ch-field-green`, and the
  brand uses the green golf mark with a serif wordmark. The next-event card is a
  light sheet.
- **Canopy (`main[data-canopy]`, desktop):**
  - The page's title block paints an edge-to-edge field in the one Clubhouse
    green, closed by a fine gilt rule. There's no box: the fill is a spread
    box-shadow clipped at the title block's lower edge, so it ends where the
    title does on every page.
  - The title is ivory with an engraved shadow.
  - On scroll the title folds away and the top bar settles from clear-on-green
    to the ivory glass (scroll-driven; off with reduced motion or Animations
    off).
  - Researched against Apple Sports, Health and Journal navigation fields.
- **Serif titles:** Instrument Serif (`--ch-font-serif`, `--ch-type-serif-*`)
  sets page and section titles only. Data, controls and body text stay sans.
- **Scoreboard:** shares the one green.

## 2026-10-06 — Tone, type and scoreboard (owner direction)

Owner direction, given live while reviewing in Safari. The page is a slightly
deeper ivory, about midway between the earlier ivory and the darker trial, with
a faint green-and-champagne light across its top. Cards return to a light ivory
that stands off it ("too much white", then "make the cards lighter", then
"somewhere in between").

- **Display type:** relaxed everywhere. The width axis goes from 88 to 96 and
  the tightest tracking eases to -0.026em, after the owner called the display
  type "too compact".
- **Wells:** a step darker with a crisper edge. Muted text inside any well steps
  up one ink, so dates and scores never sit ivory on ivory.
- **New scoreboard material (`.ch-scoreboard`):** scorecards are set on a deep
  green board with ivory numerals. Board finishes for the marks: a red disc
  under par, a ringed disc for eagle, an ivory outline over par, and a solid
  ivory tile for double or worse.
- **Type on green:** the hero band and scoreboard set type in a warm ivory
  (`--ch-on-green-ink`) with a soft engraved shadow, never white (owner: "more
  ivory and text depth").
- **Shadows and radii:** this pass's component shadows are now tokens, and the
  shared nine table radius is on the scale.

## 2026-10-06 — Premium materials, seams, radius scale and smooth scroll

Owner-directed pass on shared materials, verified in Safari 27 (desktop 1440 and
iPhone emulation). Reading surfaces regain a layered light: a lit top edge, a
contact shadow and a soft ambient shadow. Dark and branded surfaces use a
shadow-only cast. New on-dark materials (raised, well, control) serve the green
hero. Joins inside one surface use an engraved seam, an ink line beside a lit
line (`--ch-seam-x`, `--ch-seam-y`), in place of faint hairlines. Score marks
(birdie, eagle, bogey, double) share one raised construction with an edge and
depth. The secondary button ring is softer with a firmer lift. The phone tab bar
floats as a glass capsule above the safe area.

Radii snap to the scale (owner choice): wells and segmented tracks 14px, sheets
20px, raised chips 10px; inner pieces are concentric (track radius less its
padding). Sidebar brand, nav item and next-event radii follow.

Desktop canvas scrolling eases mouse-wheel steps (Lenis, `CH_SCROLL_DUR`); touch
pointers, phone layouts, reduced motion and Animations off keep native scroll.
Route changes and Back restoration jump instantly; in-page jumps ease. Safari
audit on player Home: no console errors, no failed requests, viewport and safe
areas correct, no off-scale radii left on the page.

## 2026-10-06 — Shared component playground

Added a development-only workspace for original/candidate shared components,
real phone/desktop frame sizes, long-content stress, local visual tuning and
CSS proposal export. Modal/menu keyboard behavior and reduced-motion samples
remain shared. No production tokens or page designs are changed. The gallery
can be framed only by the same origin in development. Open Props, GUI Challenges
and Radix Themes are documented as the three reference priorities. Stylelint
adds invalid-color, calc-operator and keyframe-priority checks.

## 2026-10-06 — Quality tooling and scoped agent guidance

Clubhouse agents now follow its own tokens and exemplars. The premium profile
covers all 15 page families; an optional reviewer checks implementation details.
Dedicated Chromium/WebKit checks exercise normal and reduced motion, keyboard
contracts, popup bounds and accessibility. Reviewed external visual baselines,
a CSS regression guard and a raw-capture performance budget reader support
repeatable audits. Next DevTools MCP and React DevTools are pinned; setup and
evidence limits are documented in [QUALITY_TOOLING](QUALITY_TOOLING.md).
This entry changes tooling, not page appearance or release acceptance.

## 2026-10-06 — Owner rejects excessive card depth

The owner described the large stacked shadows as looking poor and artificially
styled. The shared depth ladder now uses quiet contact shadows for reading
cards, shallow controls, a small floating lift and stronger separation only for
menus/sheets. Settings form groups have no drop shadow. Home and Recruiting
card overrides use the same reading token, including Home’s hero and nested
next-event card. Broad 44/52px reading-card shadows
and stacked bubble shadows are removed. Existing layout, colors, typography,
focus indication and data behavior remain intact. This updates the October 2
depth direction; earlier audit entries below record that prior review.

Before/after normal-content captures are in page VERIFY logs. Physical-device
and owner visual acceptance remain open in [POPUP_AUDIT](POPUP_AUDIT.md).

## 2026-10-06 — Popup layout and native-layer repairs

Reading-destination headings no longer wear the global control outline; shared
buttons use their existing rounded focus treatment. Settings form/list sheets
initially focus their heading. Calendar custom popovers and the desktop team
listbox are height-bounded. These changes preserve keyboard access.

Menus inside native dialogs now receive pointer input in the same top layer.
Tall menus are bounded and scroll above keyboard space. Modal descriptions are
announced, long headings/descriptions wrap and scroll without hiding footers,
and Settings/Recruiting phone bars reserve space for their actions. Tall action
sheets remain reachable on short screens. Full source inventory and browser
evidence are in [POPUP_AUDIT](POPUP_AUDIT.md).

Every Clubhouse change with the issue it fixed, newest first. Each page's own
changelog (`docs/clubhouse/pages/<page>/CHANGELOG.md`) has the detail; decisions
and the full verification log are in `docs/clubhouse/PROGRESS.md`. Nothing here
is in production: Clubhouse is behind a flag that is off.

## 2026-10-06 — Motion and streaming repairs

Settings replaces the sequential exit/entrance with immediate outgoing removal
and one 260ms incoming transition. OS reduced motion and Animations off use
zero-duration shared JavaScript transitions, including Home rounds, Roster
peek, Stats/segmented indicators, menus, team switch, offline notices, toasts
and Settings feedback. Approved normal-motion tokens and layouts are preserved.

CoachHelm schedules streaming follow-scroll once per browser frame, cancels
superseded work and respects the reader's position. It scrolls instantly while
streaming and when motion is disabled; sending otherwise retains smooth scroll.

Desktop WebKit fixture switches settled in 274–315ms normally (previously
550–562ms) and 45–48ms with OS reduced motion (previously 497–531ms), three
trials each. These include development overhead, not device FPS or production
INP. Before/after captures are logged on the affected page VERIFY records.

A paired Chromium 4x-CPU scroll probe covered Home, Stats, round Track, round
Setup and onboarding Account: 20 trials, 60 frames each, with filters enabled
and diagnostically disabled. Both had 16.7ms medians, 16.7–16.8ms p95 and zero
frames over 33ms. A pure buildTurns benchmark (200 messages, 100 trials) had
0.175ms median and 0.781ms p95. Neither supports a speculative glass removal
or parser cache. Physical Safari/iPhone traces, VoiceOver, keyboard and durable
writes remain release checks; the Mac is locked.

## 2026-10-06 — Smoothness source audit and stable appearance subscriptions

The audit targets the current Clubhouse source on main, selected by the
Clubhouse flags in preview/development. The older agent/clubhouse checkout
still contains navigation and dismissal behavior repaired in the October 1–2
passes. SMOOTHNESS_AUDIT.md separates these versions and inventories all
15 page families using their existing contracts, catalogs and runtime owners.

The shared appearance store now hydrates once and compares stored values before
notifying. Mounting another consumer no longer rerenders unchanged subscribers;
same-tab updates and cross-tab changes still propagate, and a storage clear
restores defaults. This changes no appearance, motion timing or server data.
Focused regression evidence and remaining runtime checks are in the audit.

## 2026-10-06 — Motion import path moves to `motion/react`

Dependency upgrade (`framer-motion` 13 to `motion` 14). The shared pieces that
animate (`lib/motion.ts`, `ui/Menu.tsx`, `ui/Segmented.tsx`, `ui/Toast.tsx`)
import from `motion/react` instead of `framer-motion`. The API is the same, so
durations, curves, the press and reduced-motion gating are unchanged, and
nothing renders differently.

## 2026-10-06 — Complete page documentation and fixture audit

Updated all 15 page families and their catalogs, phone specs and checklists
with source ownership, current evidence and explicit device/release gaps.
ALL_PAGE_AUDIT.md records the 305 state cases, 60 WebKit base renders,
24 onboarding renders and measured Settings reduced-motion mismatch.
The screenshot log now ignores generated galleries; its regression first
failed and then passed. Production settings and approved handoffs are intact.

## 2026-10-06 — Premium audit, complete catalog and focus repair

Added the complete component/style catalog, a repeatable material declaration
inventory and the read-only clubhouse-design-reviewer. Recorded all 15 page
families and 383 local synthetic renders in
[PREMIUM_AUDIT.md](PREMIUM_AUDIT.md).
Shared opt-in keyboard alternatives now reveal in document flow; ordinary
screen-reader labels remain hidden. Message quotes and desktop Game detail
observe live Animations off as well as OS reduced motion. No production flag,
database or deployment changed.

## 2026-10-02 — Floating cards and stationary overlay backgrounds

The owner rejected striped, outlined cards and unstable pull-up screens. Shared
surfaces now use stronger soft elevation, with decorative rails and frame rings
removed across Messages, Hub, Stats, Roster, Classes, Qualifiers and CoachHelm.
Focus outlines and meaningful selected/chart states remain.

Nested and exiting overlays hold one reference-counted scroll lock, preserving
the underlying page position and returning focus without scrolling. Modal close
animation runs before the native dialog releases its lock. Drag events follow
one primary pointer and cancel cleanly; nested dialogs have unique title IDs.
The welcome also protects its text from background trees and removes blur.

## 2026-10-02 — Installed plugins find concrete flow and data gaps

The owner requested Apple Messages display and behavior with the existing
green/ivory palette. Phone threads now group their bubbles, use direct-chat
width, insert a newline with Return, and preserve selected-message context.
Quoted replies carry the existing parent relationship through send, optimistic
state and Retry; the server validates conversation access. The Supabase plugin
guides this existing-schema integration; no migration is added.

Frontend Design Premium and Shiro preserve the supplied visual direction while
checking shared ownership, phone geometry and feedback. Intuitive Software
Design reviews Roster, Stats and Hub tasks; Codebase Design reviews Home's read
seam. Root DESIGN.md and UI_OWNERSHIP.md point to existing handoffs and runtime
owners. They do not replace the page contracts or generate a second CSS system.
The plugin auditor's scope is declared in premium-ui.json.

Corrections: repeated Sign in sends one request, failed attempts can retry,
round controls reach 44px, qualifier names wrap, stats filters reach 44px and
roster profile spacing/material follows its list. Hub exposes per-object saves,
allows independent writes, retains a post until acknowledgment confirms, and
rolls back to the last confirmed state. Home uses the team clock and avoids
invented par, sand-save and incomplete attendance figures. Shared scrollbars
retain native scrolling and restore defaults under forced colors.

The scoped static plugin auditor cannot resolve custom React Button/Form
semantics or inherited CSS. Its remaining detections are reviewed against the
canonical owners and browser evidence; strict automated compliance is not
claimed. Local fixture behavior, layout and regression tests provide bounded
evidence. Physical iPhone frame rate, human usability and live-account
persistence remain unverified. No merge, production deploy or flag change.

## 2026-10-01 — Safari design fidelity and restored surface depth

Branch: `codex/clubhouse-design-fidelity`. Owner reference: Coach home dashboard
redesign (5)/(6), existing auth handoff, and the supplied Safari photo. The
current feedback supersedes the darker flat phone treatment and clubhouse-only
phone camera. Shared sheets, content wells and Messages bubbles regain graded
ivory/green faces, upper highlights, contact shadows and restrained ambient
depth. The mobile canvas remains warm ivory with the existing readable type
floors. The Home header uses the compact GolfHelm mark on a 32px medallion.
Named page snapshots use a simultaneous 180ms crossfade without the old arrival
delay, including browsers without transition-class selectors. Browser edges read
current tokens and create a missing theme-color tag, replacing a stale darker
beige.

Home, Auth and eight secondary page passes are logged in their page changelogs.
Shared CSS and several secondary page styles remain outside the semantic
knowledge map; page manifests and their design/verification documents cover
them. Home and Auth behavior paths are now mapped to their existing features.
Physical iPhone frame rate and the owner's deployed preview are unverified;
local WebKit evidence is filed under `.helm/screenshots/clubhouse/`.

Verification: targeted component/data suites, scoped ESLint, TypeScript,
Clubhouse contracts, knowledge checks, screenshot validation and Markdown
ratchet pass. The full production build exits 0: compiled successfully,
TypeScript completed, all 181 static pages generated and route table emitted.

## 2026-10-01 (aesthetic audit)

| Page | Issue | Fix |
| --- | --- | --- |
| All phone pages | **Secondary and tertiary text read as one gray (aesthetic audit M-L1).** Tertiary was raised to hold 4.5:1 on the darker page and sat 1.1 contrast points under secondary. | `tokens.css` phone block: `--ch-ink-600` is `#46433d` (9.3 against 6.3). Q-147. |
| All pages | **Search, input and textarea placeholders measured 2.8:1 on the phone page (M-L3).** | `controls.css`: they use `--ch-text-tertiary`. Q-147. |
| All phone pages | **A 30px coin drew its initials at 10.2px (M-T1).** | `ui.css`: the phone's 12px floor, with a 42% rule for a coin too small for it. Q-147. |
| Messages | **Unread rows barely differed from read ones (M-L2).** | Unread name 700, unread preview `--ch-ink-700`. |
| Home | **Stacked coins hid their initials (H-1); the latest round's stats floated 171px to 234px below its scorecard (H-2).** | Overlap 4px; the footer follows the scorecard. |
| Rounds | **The shot screen kept desktop gutters on a phone (S-1): a container query on its own container never ran.** | `.ch-rt-q` is the container; the phone's 12px padding applies and the strip bleeds. |
| Calendar | **Events sharing a column showed "Sh..." (C-1); audience coins hid their initials (C-2).** | Shared blocks wrap their title and keep the start time; overlap 5px. |
| CoachHelm | **A two-line metric label ran at line-height 1.0 (CH-1).** | 1.3. |
| Segmented controls, Home, Calendar, Rounds | **Contrast sweep (X-1 to X-4): unselected segmented labels 4.1:1, Home weekday labels 4.1:1, class and busy event times 3.6:1 and 4.0:1, the shot strip's par labels 3.8:1 and its option notes 3.2:1.** | Secondary ink on the segmented label and the weekday label; the event time keeps its color; the strip labels 0.66 and the option notes tertiary. Past-event fade: Q-152. |
| Qualifiers | Audited, no defect found. | None. |

Findings, evidence and the owner questions (Q-148 to Q-152) are in
`AESTHETIC_AUDIT.md`.

## 2026-10-01 (shared pieces, backfilled from the history)

The changelog gate now holds a shared piece (a file under `src/clubhouse/ui`,
`lib` or `styles` that no page owns) to this log. These changed on the branch
with no entry or sha here; each row is read from its commit.

| Shared piece | Issue | Fix |
| --- | --- | --- |
| `styles/*` (page phone blocks), Home links | **Phone text under 12px, wide chart axis text, and Home's links under 44px (audit F09, Q-141).** `0595983ff` | A 12px floor in each stylesheet's phone block; chart axis text readable; the links hit at 44px. |
| `lib/format.ts`, `styles/home.css` | **A change that rounds to zero read as a gain or loss on Home.** `21d75dfdf` | It is plain on both Homes. |
| `lib/session-state.ts` | **Kept screen state drew over a streamed part while it hydrated (Qualifiers review S1).** `c331f404a` | It draws the default until the part hydrates. |
| `lib/use-action.ts`, `lib/motion.ts`, `lib/press.ts`, `lib/reduced-motion.ts`, `lib/track.ts`, `ui/States.tsx`, `ui/Toast.tsx` | **Contract codes (P001, P007) named at their implementation.** `9cd0c284d`, `a5701f290` | Comments and tags only; no behavior. |

## 2026-10-01 (CI on PR #2111)

| Page | Issue | Fix |
| --- | --- | --- |
| Roster | **Lint ratchet up by one (`react-hooks/exhaustive-deps`, 59 to 60).** The effect that restores the saved view called `setView` with an empty dependency list. | `setView` is listed. It is `useChSessionState`'s `useState` setter, so its identity never changes and the effect still runs once: no behaviour change, the warning count is back to baseline. |
| Dashboard layout (Fairway and Clubhouse) | **Two layout tests failed: `dashboard-layout-onboarding-retry.test.ts`.** `0dfa3ee47` moved the coach's team lookup to `dashboard-request-cache.ts`, which calls the three-way `resolveCoachActiveTeam`; the test's `resolve-team` mock only had `resolveCoachActiveTeamId`, so the layout threw. The test read the throw as "still waiting", which is why it looked like a timing failure. | The mock adds `resolveCoachActiveTeam` returning `{ status: 'ok', teamId: 'team-1' }`, the same team the old mock pinned. Assertions unchanged; 5 of 5 pass. Found by catching the rejected render, not by loosening the wait. |
| E2E seed | **Review Gate ast-grep `helmv3-no-service-role-key`.** `e2e/helpers/clubhouse-local-seed.ts` read `SUPABASE_SERVICE_ROLE_KEY` from the environment directly. | It reads through `tryGetSecretKey()` (`src/lib/supabase/keys.mjs`), the repo's one sanctioned reader. The helper still refuses any URL that isn't localhost, so the key can only ever reach a local stack. |
| Perf harness | **CodeQL `js/file-system-race` (two) and `js/http-to-file-access` (one)** in local-only scripts. | `perf-measure.mjs`: the seed file is created exclusively (`flag: 'wx'`), so two runs can't both write it; the production-reference scan reads size and contents from one open file descriptor, so the file checked is the file read. `perf-fetch-trace.cjs` writing request timings to a file is the script's purpose (local stack only, opt-in by `HELM_PERF_TRACE_FILE`); that alert is dismissed as won't-fix, the same as `scripts/schema.mjs`. |
| Page docs (all 15) | **Markdown lint up by 32 (MD060, table column style).** The new `## Screenshots` table in every VERIFY.md and the template used a `\|---\|---\|` divider row, which the "compact" table style rejects (two violations a table). | The divider is `\| --- \| --- \|`, as in every other Clubhouse table; MD060 is back to the baseline. The rule wasn't relaxed and the baseline wasn't raised. |
| Perf harness | **CodeQL still flagged `js/file-system-race` twice after the first fix.** An `existsSync` before the exclusive create still read as a check-then-act, and the scan still `stat`ed a path before opening it. | The seed file is claimed first with an exclusive open (a second run fails before seeding anything; a failed seed removes the claim), and the scan takes each entry's type from the directory listing, so no path is stat'ed and then opened. |
| Docs tooling | **CodeQL on the new docs scripts (four alerts).** `shots.mjs` escaped `\|` in table cells without escaping `\\` first (the same bug as F-26) and checked a screenshot exists before stat-ing it; `changelog-gate.mjs` and `docs-index.mjs` used alternations whose anchors bound to one branch only. | Cells escape backslashes first; the screenshot is stat-ed once and that result is reused; "is a test file" and "is an audit or plan doc" are plain checks (`includes`, `endsWith`) with no ambiguous anchors. Same answers; the 58 script tests pass. |
| Home (test) | **`player-home-phone.test.tsx` failed on CI shard 3.** It pinned the player-only `opacity: 1` override for past rows, which Q-152 (`b359c0414`, owner kept) made unnecessary: no past row is dimmed on either Home now. | The test asserts the same contract in its new form: no `.is-past` row rule sets an opacity, and the time steps back through the shared rule. 19 of 19 pass. |
| Docs tooling | **CodeQL `js/file-system-race` at `shots.mjs` `log`.** VERIFY.md and each manifest were checked for existence, then read and written. | One `readIfPresent` read (null on ENOENT) replaces each check-then-read. |

## 2026-09-30

| Page | Issue | Fix |
| --- | --- | --- |
| Stats | **Last 10 ended at 1 Aug (Q-122).** | Reads across seasons. |
| Stats, Home | **Total-only rounds counted nowhere (Q-123).** | Scores only. |
| Team Hub | **Large teams' RSVP and task counts were cut at 1000 rows (swap audit F-21).** The attendance and task-assignment reads asked PostgREST for 2000 and 5000 rows; it returns at most 1000, silently. | Both reads page through every row (`fetchAllRowsResult`, ordered by id). Test `hub-paged-reads.test.ts`. |
| Held migrations | **Lint and migration safety (F-22).** The availability constraint was added without `NOT VALID`; the document policy migration opened its own transaction inside the migration tool's; four files raised SQL lint by 182. | `NOT VALID` on the new column's constraint, no nested `begin`/`commit`, layout reformatted (squawk 0 issues, SQL lint back to baseline). Still held. |
| Rounds | **Queued rounds waited for a round screen (swap audit F-14).** Only the Fairway shell started the offline sync engine, so with Clubhouse on a round, hole or shot saved offline synced only while a round screen was open. | `shell/OfflineSync.tsx` starts the engine for the whole session (interval, reconnect, service-worker requests) and feeds the offline store; no UI. Test `offline-sync.test.tsx`. |
| Shell | **The full test suite failed in 8 files that draft CI never ran (F-15 to F-20).** The reduced-motion guard didn't know `useChReducedMotion`; `formatToPar` was declared twice; the mute actions weren't observed; the selection route had no error or loading state; three Fairway page tests drew Clubhouse (the flag is on in tests); four migrations lacked VERIFY/ROLLBACK lines. | Delegate registered; one `formatToPar` in `lib/golf` (Fairway output unchanged); mute actions wrapped and registered; boundaries added; tests pin the gate off; header comments added. `test:all` failures fixed and rerun green. |
| Docs | **The flag text said coach-only (F-13).** | `golf_clubhouse_ui` names both roles, and its cleanup plan requires every route in `SWAP_AUDIT.md` to have a destination and an observation window before Fairway is retired. |
| Stats (team) | **A team with only 9-hole rounds this season saw "No stats yet" (D-71).** The first-run page is for no round, but 9-hole rounds are left out at the default of 18 holes, so it told a team with rounds that none had been posted. | The first-run page is for no round of either length: a team with a 9-hole round in the window gets "No 18-hole rounds in this window yet" with the hint to choose 9 holes or Both in Filter. |
| Stats | **Stats could only be read through its three fixed windows, and left out every 9-hole round (owner: "make it 9 or 18").** A coach or player could not look at tournaments alone, a stretch of dates, a course or chosen rounds; 36 nine-hole rounds (5%) were never shown. | One round filter on the team and player pages, desktop and phone, kept in the address: round type, holes (18 by default, 9, or Both), time (the windows or a date range, which may reach before the season), course, and Only these / Exclude these, with removable chips, Clear and a count line. Every figure follows it: per-round figures per 18 holes (a nine-hole round counts as half), rates pooling the holes, early-read floors in whole rounds, bests listed by length. Nothing in the shared stats code was edited. |
| Recruiting | **Recruiting had no Clubhouse screen.** With Clubhouse on, a coach opening Recruiting got the existing page, styled for the old app, and the owner's approved boards (Q-87) were not built. | New page P014 at `/golf/dashboard/recruiting` (coach only), built from the boards on the existing server actions with no schema change: the header, the four-stage pipeline that filters the list, search over name, hometown, state, email and notes, three sorts, and each prospect's panel with Email and Call, notes and private documents (upload, open, remove). A stage is saved the moment it is picked and goes back with a Retry if it does not land (CH-14003); delete asks first (CH-14501). The phone is the boards' phone build: a pushed prospect, and the edit form, the stage picker and delete as sheets. In the coach's Team section after Roster. 53 catalog states (CH-14001 to CH-14914), each named by a test (motion is preview-checked); with the flag off the existing page is unchanged. |
| Stats (player) | **The player page showed a fraction of what the production page shows (owner: "scrambling, GIR, putting, all of it").** Four figures and two or three visuals an area; Game detail's shot-level figures counted a different set of rounds than the headline (a date preset, 9-hole rounds included). | `PARITY.md` lists every production figure and where Clubhouse shows it (or why not). Each Game detail section says which rounds it counts (the window's own 18-hole rounds, now what every figure reads) and gains a More detail disclosure; the Rounds tab gains score by round, personal bests and this window against the one before; the Overview table is the standing board (Tour values, a coach's team figures, floor notes). Approach proximity is now graded on the Tour's basis (every approach, 10 shots a range) and putt bands are cut as the calculator cuts them. 13 new catalog states (CH-5209 to CH-5212, CH-5311 to CH-5319). |
| Stats | **D1 benchmarks (Q-88).** Team and player Stats, and player Home, graded against D1 averages (GIR, putting bands, scrambling, proximity, par tiles, notes) and filled a women's team's gaps with the men's values. | The Tour is the only benchmark: every mark, column, note and figure reads the Tour's average (`golf_pga_standards.pga_tour_value`, the team's own tour, never the men's for a women's team), and a metric the tour has no value for shows nothing. A test renders every stats screen and fails on "D1", a division or college. |
| Stats (team) | **Strokes gained had no headline, read the last week, and its bars were clamped.** The figure row had no strokes gained; each leg card's headline and the trend's player list were the latest week's value (sorted by it too); the notes read a change as a level; the phone's leg bars clamped at 1.4 and the grid's tint at 1.2. | A sixth card leads the row, Team SG per round (the window's mean, a change chip against the previous 10, "vs Tour"; CH-4311, CH-4312). The leg cards, the list and its sort use the window's mean; the note reads "up about 1.0 a round since Aug 30". Bars scale to the data (the largest value rounded up, at least 1), and the phone adds a team total. |
| Stats (player) | **Strokes gained was thin and mislabelled.** The phone said "vs D1" (there is no D1 strokes gained), showed one SG number and none on its rounds; the desktop Rounds tab had the total only; the comparison table and the make-rate curve stopped short; the early-read banner counted rounds, not rounds with shots. | Every figure says "vs Tour". Phone: a Strokes gained panel (four legs and total) and each round's SG. Desktop: the four legs per round, SG rows in the comparison table (a coach sees the team's mean; a player no teammates), a change chip against the previous 10, bars on the data's scale, a banner for rounds without shots (CH-5308, CH-5309, CH-5310), and a make-rate curve out to 25+ feet with exact counts. |
| Home | **The player's strokes gained said "vs D1".** | "Season, per round vs Tour"; the legs' header says the strokes gained are the season's and D1 marks the stats. |
| Rounds | **A round's review had no strokes gained.** | A card under the figures, on desktop and the phone: the total and four legs on the round's own scale, "vs Tour"; a round without shots says so in one line (CH-11313). |
| Team Hub | **Phone tap targets.** On the phone the section tabs (40px tall, about 36px wide), the event rows (35px), Going / Maybe / Can't (30px), the icon buttons (32px) and the task tick (24px) were under Apple's 44pt minimum. | The tabs are 44 tall and at least 44 wide (the strip scrolls sideways, which would clip an invisible hit area); the event rows are at least 44 tall; the reply buttons, icon buttons and tick get an invisible 44 x 44 hit area (`hub.css`). |
| Rounds | **Round entry is routed.** A Clubhouse player opening /rounds/new or /rounds/continue/[id] got the not-rebuilt notice, and no New round, Start a round, Continue or Post a round control was drawn, so a player with the flag on could not start or continue a round. | Both addresses render Clubhouse's round entry over the round engine when the flag is on for the player (Fairway's client with it off), with a state for every engine outcome: recovery, a round already in progress, a start refused, a reload, a closed qualifier (Save as practice), failed saves and discards with Retry, offline, a slow submit. A Retry runs the round as it is now, never twice. Not seen in a browser or on a phone yet (P011 VERIFY). |
| Rounds | **Phone tap targets.** The review's previous and next hole (30px), the unfinished round's discard (38px), the shot screen's pills (36px) and setup's Back (34px) were under 44pt on the phone. | Each gets an invisible 44 x 44 hit area without changing how it is drawn (`rounds.css`, `rounds-track.css`, `rounds-setup.css`). Left as they are: the nine-across hole strip and the scorecard's hole cells (nine 44pt columns do not fit in 390pt, and the whole column picks the hole). |
| CoachHelm | **Phone tap targets.** The player rows in the phone list were 38px tall. | They are at least 44 tall (`coachhelm.css`). |
| Settings | **Phone screens (coach and player).** Settings on the phone was the desktop layout squeezed down. | The approved grouped-list design: sections push full screen, switch rows, bottom-sheet pickers, edit sheets with Cancel and Save (a discard question when closed with changes, CH-8509), the typed "delete" sheet (CH-8510), iOS action sheets, and the priority reorder by hold and drag. Desktop behaviour is unchanged (shared `hooks.ts`). Quiet mode's note corrected to what the code does. 56 phone tests. |
| Shell | **Phone sheets and the keyboard.** On the phone the keyboard covered the lower fields and the Save button of every bottom sheet with a text field (New event, Plan a trip, New announcement, notes, Add a course). The app never resizes for the keyboard, and only Messages and the Settings sheets lifted themselves. | Every sheet (`.ch-modal`) now sits on top of the keyboard while it is open, shrinks to the space above it and scrolls its body, so the focused field and the footer stay visible (`controls.css`, `--keyboard-height`). |
| Shell | **Phone tap targets reach 44 x 44.** The native-feel scan found controls under Apple's 44pt minimum on the phone: segmented controls drawn at 26px, small buttons at 30px, pills at 36px, 40px icon buttons and short text links (Team stats, Add, Message). | On the phone each of these controls gets an invisible hit area that reaches 44 x 44 around it, without changing how it is drawn (`controls.css`, zero specificity so a page's own hit area wins). |
| Shell | **Quick second taps.** A fast second tap on a control (a score stepper, a toggle) could be read by iOS as a double-tap zoom. | Buttons, links, tabs, switches, labels and selects use `touch-action: manipulation` and no long-press link preview; pinch zoom still works everywhere (`base.css`). |
| Shell | **Native-feel and phone-width scans.** The accessibility scan ran only at 1280 and 390px, never checked sideways scrolling, and stopped the whole run when one tap failed. | New `scripts/clubhouse/native.mjs` (tap targets under 44, text fields under 16px that iOS zooms into, sideways scroll, at 390 and 430px); `a11y.mjs` takes `CH_WIDTHS`, fails a phone page that scrolls sideways, and reports a failed tap instead of crashing. |
| Shell | **Old addresses open the rebuilt screens.** With Clubhouse on, notifications and bookmarks to /tasks, /announcements, /documents, /travel, /roster/[id] and /rounds/[id]/review opened Fairway pages inside Clubhouse. | Each route's layout sends the viewer to the rebuilt screen (Team Hub tabs, the player's Stats profile, /rounds/[id]) through `routes/alias.ts`, only when that screen is rebuilt for their role; flag off, nothing changes. |
| Shell | **The bell on phone tab roots (Clickables gap 1).** Tab roots that draw their own title (CoachHelm, the player's Rounds and Team Hub) hid the bell, so a player had no bell on three of four tabs. | `PhoneTop start` with no action puts the top bar in a `start` mode: the page title and the bell. |
| Shell | **Team Hub count for players (Clickables gap 3).** A player's Team Hub item had no count. | The sidebar and phone tab carry the current app's Team Hub count (unread announcements, tasks and trips), nothing when there are none. |
| Shell | **The gear opens the page's own settings (Clickables gap 20).** The coach's top-bar gear on CoachHelm and Team Hub opened the Settings home. | There it reads CoachHelm settings or Team Hub settings and opens that section (?section=coachhelm, ?section=team); elsewhere and for players it stays Settings. |
| Home | **Latest round opens its review (Clickables).** Home's latest round linked to Stats, though the round review now exists. | Open recap (desktop), Round recap (coach phone) and the player's phone card open the round's review, falling back to Stats when the review is not rebuilt for the viewer. |
| Home | **Latest rounds links to Team stats (Clickables gap 6).** The coach phone Home's Latest rounds header had no way on (the board's "All"). | It links to Team stats, only when rounds are listed (a coach has no rounds library, Q-79). |
| Roster | **Schedule 1:1 on desktop (Clickables gap 4).** The desktop Roster panel had no way to plan a 1:1, which the phone had. | Schedule 1:1 opens Calendar's editor with only that player invited (`calendar?new=1&with=<id>`, D-52). |
| Roster | **View insights in the row menu (Clickables gap 16).** The List view's row menu had no way to CoachHelm's read of a player. | The menu starts with View insights, which opens CoachHelm on that player (an id not on the board opens the most pressing player). |
| Stats (player) | **Schedule 1:1 in the hero (Clickables gap 4).** A coach on a player's Stats profile had no way to plan a 1:1. | Schedule 1:1 opens Calendar's editor with only that player invited (D-52). |
| Calendar | **Duplicate, Print and the jump panel's Close (Clickables gaps 9, 15, 21).** The board draws Duplicate, Print and a Close on the jump panel; none existed. | Event actions › Duplicate (coach) opens New event seeded from the event and publishes a new one; More › Print week (day, month or agenda by view) prints the view with the shell dropped; the jump panel has its own Close. |
| Calendar | **Compare schedules on a class (Clickables gap 17).** A coach looking at a player's class had no way to set it against the team's schedule. | A class's detail ends with Compare schedules: New event on the class's day with only its player invited, so Find a time compares the two. |
| Messages | **Right click opens reactions (Clickables gap 23).** On desktop a right click on a message did nothing. | It opens the message's reaction bar, as the React button does; the phone keeps its long press. |
| Team Hub | **Plan a trip in four steps, and a travelers audience (Clickables gaps 8 and 22).** Plan a trip was one form, with no link to the calendar event or who travels; New announcement could not reach a trip's travelers. | Four steps (Event, Travelers, Logistics, Itinerary) with Back and Next; the event fills name, place and day, its invitees are the travelers (written with explicit adds and removes); Publish saves the trip once, so a Retry writes only the travelers. New announcement offers "`<trip>` travelers · N". New states CH-10210, CH-10211, CH-10312, CH-10313. The class-clash line is not built (Q-84). |
| Team Hub | **Untick a done task (Clickables gap 18).** A player who ticked a task by accident could not undo it. | A tick on a done task opens it again through the new `uncompleteTask` (their own assignment back to pending, as the live RLS policy allows). Optimistic; a refusal leaves it done with CH-10011 and Retry. |
| Rounds | **Round entry states (Q-81).** The live round flow has four states the /rounds boards do not draw: a saved round to recover, a round already in progress on the same course and day, a reload, and a qualifier that closed during the round. | RecoveryDialog, InProgressConflictDialog, ReloadBanner and RoundErrorBanner, SaveAsPracticeSheet and the Save for later / Discard failure toasts, as Clubhouse components; Discard now asks first everywhere. Engine wiring waits on #2104 (stacked, Q-81). Preview /clubhouse-preview/entry. |
| Rounds | **A tap on a score picks the hole (Clickables gap 7).** In the round review's card only the hole number picked a hole. | A tap on a score picks that hole too, with the select haptic (pointer only; the hole number stays the keyboard control; Tot picks nothing). |
| Rounds | **Cancel on Add a course (Clickables gap 24).** Closing Add a course dropped the coach out of the course picker. | Cancel goes back to the picker it was opened from, as on the board (preview only until #2104). |
| CoachHelm | **Assign as focus on a strength (Clickables gap 12).** Assign was hidden on a strength, though the board draws it on Theo's card; contract 130806 had been written from the code, not the board. | CoachHelm offers Assign as focus on a strength (a keep-doing focus); 130806 is reworded (Q-80, kept by the owner). |

Earlier changes (2026-09-28 to 2026-09-30: the page builds, the contract passes
and their fixes) are listed in each page's changelog.
