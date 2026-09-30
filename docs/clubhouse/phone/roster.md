# Phone design: Roster (coach)

Status: approved (owner design, design/handoff/mobile/Roster Mobile.html, m-roster.jsx)

The owner's iPhone design replaces the earlier draft (D-22). It has three
boards: the roster list, the player profile and the join requests sheet. This
file maps each element to the Roster code that already runs on desktop: the
components in `src/clubhouse/screens/roster/`, the loader
`src/clubhouse/data/roster.ts` (`ChRoster`), the route branch in
`src/app/golf/(dashboard)/dashboard/roster/page.tsx`, and the catalog
`docs/clubhouse/catalog/roster.md` (3xxx). Nothing here is built yet. The open
owner questions Q-30 to Q-39 were answered on 2026-09-29 and are recorded as
D-50 to D-59 in `PROGRESS.md`. The answers are listed at the end.

The page sits inside the phone foundation (`docs/clubhouse/phone/foundation.md`,
owned by the Messages phone work). Where Roster depends on the shell, this
file lists what it needs and does not specify the shell itself.

The owner decided the foundation on 2026-09-29. The Messages phone work
records it as D-40 onward on `agent/clubhouse-messages-mobile`. Roster
references these answers and does not ask them again:

- **Tab bar:** coaches get the design's five tabs (Home, Helm, Rounds, Stats,
  More) in ivory glass. Roster lives under More, as drawn.
- **More:** More stays today's sheet (CH-1802) until a More screen is
  designed.
- **Red:** red is allowed for destructive actions, so Remove from team is a
  red button.
- **Chrome and avatars:** the Safari bar is dropped. Phone avatars use one
  neutral colour, which the foundation adds as tokens.
- **Not yet:** pull to refresh waits for a design, so Roster doesn't build
  it.

## Sources and captures

- Design: `design/handoff/mobile/Roster Mobile.html`, `m-roster.jsx`, the shared
  phone shell (`m-shell.jsx`, `m.css`, `qual-mobile.css`, `ios-frame.jsx`),
  `../qual.css`, and sample data `../roster-data.js`. It was served over http
  from `design/handoff/`. The page asks for `ch2-data.js`, `home-data.js` and
  `coachhelm2.css`, which are not in the handoff. They return 404s, and Roster
  doesn't use them.
- The design captures were taken at 390 × 844, with each board rendered alone in
  a 390 × 844 `IOSDevice`. They are kept in the session scratchpad
  (`scratchpad/roster-mobile/`) and are not committed:
  - `roster-01-list-sort-avg`, `02-list-inactive`, `03-list-sort-sg` and `04-list-sort-name`
  - `05-list-long-name`, where the sample names were lengthened to test truncation
  - `06-requests-sheet`, `07-requests-sheet-many` (five requests) and `14-requests-sheet-many-code` (the same, scrolled to the code)
  - `08-profile`, `09-profile-about`, `10-profile-captain`, `11-profile-early-read`, `12-profile-inactive` and `13-profile-long-name`
- The current preview at 390 × 844 (`/clubhouse-preview/roster`) is in the same folder:
  - `roster-15-preview-top` and `16-preview-full`
  - `17-preview-player-open` and `18-preview-player-open-full`, where the desktop panel falls below the cards
  - `19-preview-invite`, where `Modal` is already a bottom sheet
  - `20-preview-list-view`
  - `21-preview-empty`, `22-preview-failed`, `23-preview-partial` and `24-preview-loading`

  Today the phone gets the desktop page reflowed. The player panel lands under
  eight tall face cards, and the join requests take the first screen.
- The `MSafari` bar drawn in every frame is the browser's own chrome, not app UI.
  It is dropped (owner, foundation).

## Structure on the phone

The phone and desktop versions differ in structure, not just layout. The
build therefore adds phone components next to the desktop ones in
`src/clubhouse/screens/roster/` and chooses between them with `useChPhone()`
(MOBILE.md step 2):

| Phone piece | New or reused | Replaces on desktop |
| --- | --- | --- |
| `RosterPhone`: the list screen | new | header, toolbar, face cards and table |
| `RosterPhoneRow`: one player row | new | `ch-rs-face` and `ch-rs-row` |
| `RosterProfile`: the pushed player screen | new, reusing `CoachNote` (D-56) | `RosterPeek` side panel |
| `RosterRequestsSheet`: the join requests sheet | new view; the approve and decline logic moves out of `RosterRequests` into a shared hook so both views use it | the inline `RosterRequests` card |
| `InviteModal` | reused as is (`Modal` is already a bottom sheet under 820px) | same |
| Remove confirm | reused `Modal` (CH-3501, CH-3402) | same |
| `FormLine`, `Avatar`, `Segmented`, `Button`, `InlineNotice`, `EmptyState`, `SectionBoundary`, `useAction`, `haptic` | reused | same |

- **The profile is a pushed screen whose state lives in the URL**
  (`/golf/dashboard/roster?player=<id>`), as Calendar does (D-8). The iOS edge
  swipe and the Back button then return to the list. If it were only
  component state, as in the design's prototype, an edge swipe would leave
  Roster altogether.
- **The requests list is lifted into the page.** The banner's count and names
  must follow optimistic approvals. Today `RosterRequests` keeps that list in
  its own local state.
- **Loading.** `loading.tsx` renders on the server, where `useChPhone()` is
  false. The phone skeleton (list rows) is therefore switched in with CSS
  under `@media (max-width: 820px)` inside `RosterSkeleton`, not through the
  hook.

## Build status (2026-09-29)

Built on the phone foundation (D-40 to D-43, merged from
`agent/clubhouse-messages-mobile`). `Roster` picks `RosterPhone` with
`useChPhone()`.

- **List** (`RosterPhone`, `RosterPhoneRow`):
  - `PhoneTop` (`‹ More` via `useBackFromMore`, title Roster, invite as a `PhoneIconAction`)
  - kicker and the large title
  - the join requests banner (CH-3203 in its slot)
  - Avg, SG and Name sort (Name by last name), the Active list, then Inactive
  - rows with a note, a spark from 3 rounds, average and handicap (CH-3806)
- **Profile** (`RosterProfile`): a `PhoneScreen` with a `PhoneBar` (`‹ Roster`,
  ⋯), kept in the history by `usePhoneStackHistory`, so the iOS edge swipe pops
  it (CH-1906). A `?player=` link opens it once. It has:
  - identity, marked Inactive when the player is inactive
  - Message, which opens the Messages deep link
  - Plan 1:1, which opens `calendar?new=1&with=`
  - figures, the trend, recent rounds with "All N"
  - About with real fields only, and the coach's note
- **Sheets** (`ui/Modal`, a bottom sheet on the phone):
  - the join requests sheet: cards, Approve all with CH-3403 in flight and CH-3007 on partial failure, and the team code with Copy
  - the ⋯ action sheet: View stats, and Remove from team in red (D-42) behind the CH-3501 confirm
- **Loading:** the phone skeleton, switched in CSS.
- **Other pages:** the Calendar 1:1 seed (D-52) and the Stats `tab` parameter
  (D-53).

Not yet:
- pull to refresh, which waits for a design (D-43)
- drag to dismiss on sheets, which `ui/Modal` doesn't have
- the browser pass at 390 × 844 and the device pass

## Screen 1: Roster list

| Element in the design | Component | Data or action | Notes and gaps |
| --- | --- | --- | --- |
| Top bar: back "‹ More", title "Roster", trailing user-plus "Invite players" | foundation top bar | none | The trailing action replaces the bell on this screen. Roster lives under More (owner, foundation). While More stays a sheet, "‹ More" behaves exactly as the foundation specifies for screens reached from More, as the Messages inbox does. Roster adds nothing of its own. |
| Kicker "Varsity · 7 active" | `RosterPhone` header | `teamName`; count of `players` with `status === 'active'` | The desktop kicker adds `season`, which the design drops. `teamError` shows "Your team", as on desktop. |
| Large title "Roster" | `RosterPhone` header | none | Desktop's "Your players." headline and team-average line are not drawn. |
| Banner "2 join requests" + "Grace Liu, Owen Park" + chevron | `RosterPhone` banner, opening `RosterRequestsSheet` | `requests.length`, the first two `requests[].name`, then "and N more" | "1 join request" in the singular. Hidden when there are no requests. When `requestsError` is set, it becomes the CH-3203 notice in the same slot, and a crash is contained by `SectionBoundary roster.requests` (CH-3204). |
| "Sort by" + segmented Avg · SG · Name | `Segmented` (`size="sm"`, label "Sort players") | client sort of `players`: Avg is `avg` ascending, nulls last (as desktop); SG is `sgPerRound` descending, nulls last (new sort key, no new data); Name is by last name, as on desktop (D-59) | The sort applies inside each section. Desktop's Handicap and Rounds sorts are not on the phone (D-56). |
| Active section: rows in a panel | `RosterPhoneRow` in `SectionBoundary roster.list` (CH-3205) | `players` where `status === 'active'` | Each row is one button (see Accessibility). |
| Row avatar, 40 with a champagne ring | `Avatar size={40}` | `name` | The fill and initials use the foundation's one neutral phone avatar tokens (owner). The ring is `--ch-champagne-500` at 30%, as drawn. |
| Row name + "Captain" chip | row | `name` | **No captain column.** The chip is not shown (data gap, D-51). Long names truncate with an ellipsis (capture 05). |
| Row subline "Senior · Improving", tinted amber or green | row | `classYear` · a note: `attention.text` when set (amber `--ch-chart-loss` for `warning`, green `--ch-chart-gain` for `positive`, the same rules as desktop); otherwise `form` as a word (Improving, Steady, Slipping); for `early`, "Early read · N rounds", or "No rounds this season" when `rounds === 0` | The sample's "Medical · wrist" is an availability note, which has no column: the Q-1 migration is unapplied. |
| Row sparkline, 48 × 20 | `FormLine` (`earlyBelow={3}`) | `trend` (up to 7 18-hole scores, oldest first) | It is drawn at 3 or more rounds, which matches the design's `trend.length > 2` and every other page (D-57). Below 3 there is no line, and the subline says "Early read". The design's spark has no mean line and no fill, so the build adds a bare option to `FormLine` for row size. |
| Row figures "70.9" / "+0.8 hcp" | row | `formatFixed(avg)`; `formatHcp(handicap)` + " hcp" | "—" when null (for example when `statsError` is set, CH-3202). |
| "Inactive" heading and panel | `RosterPhone` | `players` where `status === 'inactive'` | Hidden when there are none. In the database, `inactive` means the member has lost team access (Q-1), not that they are injured (D-58). |
| Pull to refresh | none | none | Not built: it waits for a design (owner, foundation). Each notice's Try again still refreshes the page. |

The phone list also carries these states from the page:

| State | Code |
| --- | --- |
| The roster didn't load | CH-3201 |
| Season stats didn't load (a notice under the banner) | CH-3202 |
| No players yet: the empty state with Invite players | CH-3301 |
| Loading (phone skeleton) | CH-3401 |

## Screen 2: Player profile (pushed)

| Element in the design | Component | Data or action | Notes and gaps |
| --- | --- | --- | --- |
| Top bar: back "‹ Roster", no title, trailing ⋯ "More actions" | foundation top bar | none | ⋯ opens an action sheet with View stats, then Remove from team (D-54). It waits for the foundation's action sheet. |
| Avatar 64 with a green ring | `Avatar size={64}` | `name` | The fill and initials use the neutral phone avatar tokens. The ring is `--ch-green-600` over a `--ch-bg-page` gap. |
| Name, 24px | `RosterProfile` | `name` | Long names wrap to two lines (capture 13). |
| "Sophomore · Class of 2029 · Captain", in green | `RosterProfile` | `classYear` · `Class of ${gradYear}` | **No captain column** (D-51). For an inactive player, "Inactive" is added (D-58). |
| "Charlotte, NC · Business" | `RosterProfile` | `hometown` · `highSchool` (each only when set) | **No major column** (D-51). |
| Message button | `Button` | links to `/golf/dashboard/messages?player=<id>`: the Messages deep link that exists today opens or starts the direct thread, and shows CH-7001 when the player has no account | Desktop links the plain inbox; the phone uses the deep link. Built through `rebuiltHref`. |
| Plan 1:1 button | `Button` | Links to `/golf/dashboard/calendar?new=1&with=<playerId>` (D-52). The new seed opens the editor as a meeting with only that player invited | Before D-52, `?new=1` opened a practice with every active player invited. A player the Calendar doesn't list (inactive, or no longer on the team) opens the editor with nobody invited, never the whole team. |
| Figures: Scoring avg · Handicap · SG / round | `RosterProfile` `dl` | `avg`, `handicap`, `sgPerRound` | SG is green for gains and amber for losses, and "—" under 3 SG rounds (`MIN_SG_ROUNDS`). Desktop's fourth figure, Rounds, is dropped here; the count moves to "All N". |
| "Scoring trend", "Last N rounds", full-width line, legend (first · note · last) | `FormLine` at full width | `trend`; the note is `attention.text` or the form word | Under 3 rounds, "Early read" shows instead of the design's two-point line (capture 11). With no rounds, it shows CH-3305. |
| "Recent rounds" rows: flag, course, date, score, to par | `RosterProfile` | `recent` (3 rows: `course`, `date`, `score`, `toPar`) | To par uses `formatToPar`. Red is used only under par (`is-under`), and even par shows E. |
| "All 21" | link | `rounds` (18-hole countable rounds this season) | Links to `/golf/dashboard/stats?player=<id>&window=season&tab=rounds` (D-53). The season window counts the same 18-hole rounds. |
| About: a line of prose, then Home course, Birthday, Member | `RosterProfile` facts | Real fields only: Hometown (`hometown`), High school (`highSchool`), Class of (`gradYear`), Jersey (`jersey`, only when set), Member (`joined`, "Since Aug 2025") | **There are no columns for about, home course or birthday.** They are never invented, and birthday is never proposed, because it is minors' PII (D-51). In live data no member has a jersey number, 12 of 106 players have a high school, and 90 have a hometown. |
| (not drawn) coach's note, Development counts | none | `coachNote`, `setIntent`; `focusAreas`, `goals` | The coach's note stays, after About, and Development counts are dropped (D-56). |
| Crash containment | `SectionBoundary roster.peek` (CH-3206) | none | Same surface tag. |

## Screen 3: Join requests sheet

| Element in the design | Component | Data or action | Notes and gaps |
| --- | --- | --- | --- |
| Grab handle, title "Join requests", "2 waiting · Varsity", close | foundation sheet | `requests.length`, `teamName` | Drags to dismiss, closes from the scrim, and blocks the swipe-back gesture while open. |
| Request card: avatar 44, name, "Freshman · Class of 2030" | `RosterRequestsSheet` | `requests[].name`, plus the class label and graduation year | The loader joins these into one `meta` string. At build, `ChJoinRequest` gains structured `classYear`, `gradYear` and `requestedAgo` (additive, same read). |
| "hcp" well with "7.2" | `RosterRequestsSheet` | `formatHcp(handicap)` | Shows "—" when the handicap is null. |
| Clock + "Requested yesterday" | `RosterRequestsSheet` | `requestedAgo`, computed on the server from `created_at`, as today | none |
| Decline · Approve (with a check icon) | `Button` × 2 | `rejectJoinRequest` and `acceptJoinRequest` through `useAction` (CH-3003, CH-3002), optimistic, as today | The request comes back to the list if the action fails. |
| Footer "Approve all 2" | `Button variant="primary" size="lg"` | `acceptJoinRequest` for each request in turn, through `useAction('roster.approveAll')` (D-55) | Names every request that failed and says how many were added (CH-3007). |
| Team code well "FINLEY-26" + Copy | `.ch-well-soft` + `Button size="sm"` | `joinCode`; copy through the `InviteModal` copy path (success CH-3703, failure CH-3006) | Uses the desktop type (Instrument Sans, tabular, 0.02em), not the design's tracked mono, per doctrine. When `teamError` is set it shows CH-3207; with no code, CH-3304. |
| "Players join with this code. Approved players see the team calendar and messages." | `RosterRequestsSheet` | none | True today: approval makes them a team member, which gives them the calendar and team chat. |
| Invite by email | none | **No action.** | Not offered. |

## Gestures and haptics

Haptics go only through `haptic()`. Outcome haptics come from `useAction`.

| Gesture | Result | Haptic |
| --- | --- | --- |
| Tap a player row | Push the profile (220ms slide) | `select` (CH-3701) |
| Back button, or an edge swipe from the profile | Pop to the list (URL back) | none (system) |
| Change the sort | Re-sort in place, with no animation | `select` (CH-3701) |
| Tap the join requests banner | Open the sheet (360ms rise) | `press` |
| Drag a sheet down past its threshold, or tap the scrim | Dismiss | `press` on a drag dismiss, as the More sheet does |
| Approve or Decline | The card leaves optimistically | `commit` on success, `error` on failure (`useAction`) |
| Approve all | Every card leaves | one `commit` at the end, or `error` when any failed (D-55) |
| Copy the join code | Toast "Join code copied" | `success`, or `error` (CH-3703, CH-3006) |
| Share the invite link | Native share sheet | none (OS) |
| ⋯, then Remove from team | Confirm sheet (CH-3501). The Remove button is red, since red is allowed for destructive actions (owner, foundation). Decline on a join request stays neutral, as drawn: the player can ask again | `warning` on the destructive button, then `commit` or `error` from `useAction` (CH-3001), as in the foundation's grammar |
| Message, Plan 1:1 | Navigate | `press` (secondary buttons pass `feel="press"`) |
| Pull to refresh | Not built: it waits for a design (owner, foundation) | none |

There is no long press. The row menu that desktop hides behind ⋯ is reached
from the profile's ⋯ on the phone, so every desktop affordance still has a
tap path.

## Motion

- Push and pop use a 220ms slide. This replaces the desktop panel's 16px
  slide-in (CH-3601) on the phone.
- Sheets rise in 360ms and follow the finger.
- Reduced motion swaps both for fades.
- Rows press to 0.985.
- The design's sort and approval transitions add no motion beyond this.

## Catalog on the phone

Every 3xxx number still holds on the phone. Where each one lands:

| Codes | Where on the phone |
| --- | --- |
| CH-3001, 3501, 3402 | ⋯ → Remove from team, confirm sheet |
| CH-3002, 3003 | Requests sheet |
| CH-3004, 3101, 3209 | Profile coach's note (D-56) |
| CH-3005 | Desktop only (D-56) |
| CH-3006, 3703, 3207, 3304 | Requests sheet code well and Invite sheet |
| CH-3201, 3202, 3301, 3401 | List screen |
| CH-3203, 3204 | Banner slot |
| CH-3205 | List |
| CH-3206 | Profile |
| CH-3208 | Desktop only; the phone drops Development counts (D-56) |
| CH-3302, 3303 | Desktop only (the phone has no search and no status filter) |
| CH-3305 | Profile trend |
| CH-3601, 3602 | Replaced by push, pop and row press on the phone |
| CH-3701, 3702 | 3701: rows and sort; 3702 only with Export |
| CH-3801 | The desktop table only; phone rows are a list of buttons |
| CH-3802 | Status as a word: on the phone this is the section heading and the profile line |
| CH-3803 | Esc on desktop; the phone uses Back |
| CH-3804, 3805 | Unchanged (the a11y scan already runs at 390px) |

Proposed phone-only numbers are added to the catalog at build, together with
their code and tests. `clubhouse:check` fails a catalogued number that isn't
used yet:

| Number | Kind | What |
| --- | --- | --- |
| CH-3007 | toast | Approve all: some approvals failed. It names who, and those requests stay listed. **Catalogued**: `useJoinRequests`, roster.test |
| CH-3403 | loading | Approve all in flight: the footer reads "Approving" and can't be pressed again |
| CH-3603 | motion | Profile push and pop |
| CH-3604 | motion | Sheet rise and drag |
| CH-3806 | a11y | A row reads as one button: name, class, note, average and handicap |

## Accessibility

- Each row is a `button` whose accessible name is "Jonah Okafor, Sophomore,
  scoring up 2.1, average 74.1, handicap 3.9". The sparkline is `aria-hidden`
  inside the row.
- The sections are headed lists.
- The sheet is `role="dialog"`, `aria-modal`, with `data-state="open"` for the
  swipe-back guard. Focus moves in on open and returns on close.
- Touch targets are at least 44px. The sort segments are 44px high on the
  phone, even though the design draws them at 34.

## Tokens

Raw colours in the design map to Clubhouse tokens. The design system's names
map one to one: `--green-700` becomes `--ch-green-700`, `--chart-gain` becomes
`--ch-chart-gain`, `--dp-sheet-bg` becomes `--ch-sheet-bg`, `.dp-well-soft`
becomes `.ch-well-soft`, `--shadow-sm` becomes `--ch-shadow-sm`, and so on.

| Design value | Token |
| --- | --- |
| `#EDF4EF` (banner, Message button, flag well) | `--ch-green-50` |
| `rgb(21 90 57 / .12–.24)` (rings) | `--ch-green-600` at that alpha |
| `#fff` (banner icon) | `--ch-ivory-0` |
| `#F7FAF7` (About well) | `--ch-green-50` over `--ch-bg-surface` (no new token) |
| `#12110E` (profile ink) | `--ch-ink-950` |
| `#55524B` | `--ch-ink-600` |
| `rgb(176 149 96 / .3)` (row avatar ring) | `--ch-champagne-500` at 30% |
| `#F4F2EA` (sheet footer) | `--ch-ivory-100` |
| `#F4F1E8` (Captain chip text) | `--ch-ivory-100`; the chip itself is not built |
| `.qm .fw-avatar` neutral (`#E9E3D3`, `#5A4E36`) | the foundation's neutral phone avatar tokens (owner) |
| Scrim, grab, close button, top bar and tab bar glass | the foundation's |
| `--font-mono` on the join code | `--ch-font-sans` with tabular numbers (doctrine) |

## Needs from the foundation

The foundation is decided (owner, 2026-09-29; D-40 onward on the Messages
phone branch). Roster's phone build starts once it is built. From it, Roster
needs:

1. **The coach tab bar** (Home, Helm, Rounds, Stats, More, ivory glass),
   with Roster under More, and the More tab active on Roster and its profile.
   - Roster leaves the tab list in `nav.ts` and joins the More sheet.
   - The `joinRequests` count needs a home: a badge on the More tab, as
     drawn, and on Roster's row in the More sheet.
2. **The "‹ More" link on screens reached from the More sheet,** shared with
   the Messages inbox. More stays a sheet until a More screen is designed.
3. **A top bar** with a back label, a centred title (or none), and one
   trailing action. On pushed screens the bell does not show.
4. **A sheet primitive.** It needs:
   - a grab handle and drag to dismiss (`Modal`'s phone variant has no drag)
   - a title with a subtitle and a close button
   - a scrolling body, with a footer pinned above the home indicator
   - `data-state="open"` for the swipe-back guard
5. **An action-sheet form of `Menu`,** for ⋯.
6. **The push and pop transition** (220ms).
7. **The neutral phone avatar tokens.**
8. **Toasts above the tab bar** (shell.css does this today).

## Owner answers (Q-30 to Q-39, 2026-09-29)

| Question | Answer | Decision |
| --- | --- | --- |
| Q-30 Where does Roster live on the phone? | Under More, per the foundation decision (the five-tab ivory bar, D-40 onward). More stays a sheet | D-50 |
| Q-31 Fields with no column | Real fields only, with no migration. Birthday is never collected | D-51 |
| Q-32 Plan 1:1 | The Calendar new-event editor with that player invited, via `?new=1&with=<playerId>` | D-52 |
| Q-33 "All N" rounds | Stats on the Rounds tab for the season (`window=season&tab=rounds`) | D-53 |
| Q-34 ⋯ and the invite button | ⋯ opens an action sheet (View stats, Remove from team). Invite opens the existing Invite players sheet | D-54 |
| Q-35 Approve all | Loops the existing approve action one request at a time, through `useAction`. It names every failure and says how many were added | D-55 |
| Q-36 Desktop features not drawn | The coach's note stays on the profile. Development counts, Export, search, filters, the layout toggle, Needs-a-look chips and the Handicap and Rounds sorts stay desktop only | D-56 |
| Q-37 Sparkline threshold | 3 rounds | D-57 |
| Q-38 Inactive | Listed under Inactive and labelled on the profile | D-58 |
| Q-39 Name sort | By last name | D-59 |
