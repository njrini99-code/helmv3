# Redesign UI sweep: every bug, ranked (6 Nov 2026)

Staging (QA site, demo team, desktop 1440x900) plus Nick's two iPhone screenshots, plus a code audit of every lane at main `062f8a2` (phone 390 and desktop 1440, light and dark). Full write-ups with measurements and spec references: `lanes/<lane>.md`. Screenshots: `screenshots/`. Fix prompt: `FIX_PROMPT.md`.

## Count by lane

| Lane | P0 | P1 | P2 | Total |
|---|---|---|---|---|
| Staging pass (cross-lane, real data) | 5 | 9 | 4 | 18 |
| Team view | 5 | 13 | 16 | 34 |
| Classes, Roster, Home | 5 | 13 | 17 | 35 |
| Ask | 2 | 9 | 17 | 28 |
| Quick chat | 0 | 9 | 14 | 23 |
| Practice plan creation, Practice tab, Documents | 1 | 15 | 17 | 33 |
| Messages | 0 | 5 | 14 | 19 |
| Root cause (Read) | 0 | 8 | 10 | 18 |
| Coach vs player | 1 | 8 | 11 | 20 |
| Stats | 1 | 8 | 10 | 19 |
| Motion across all lanes | 0 | 21 | 24 | 45 |
| Design fidelity and features: Team view, Root cause, Coach vs player, Brief | 0 | 14 | 27 | 41 |
| Design fidelity and features: Classes, Roster, Home, Stats | 0 | 5 | 12 | 17 |
| Design fidelity and features: Ask, Quick chat | 3 | 19 | 22 | 44 |
| Design fidelity and features: Practice, Documents, Messages | 2 | 13 | 24 | 39 |
| iPhone: shell, Classes, Roster, Home, Stats | 0 | 13 | 23 | 36 |
| iPhone: Team view, Root cause, Coach vs player | 1 | 12 | 16 | 29 |
| iPhone: Ask, Quick chat | 4 | 17 | 13 | 34 |
| iPhone: Practice, Documents, Messages | 0 | 15 | 25 | 40 |
| **All** | 30 | 226 | 316 | 572 |

## Why it looks vibe coded (fix these causes first; they explain most of the list)
- **SYS-1 Design-page CSS ported, not built.** Lanes copied the design HTML's CSS (private hex palettes, `overflow: visible`, fixed coordinates, fixed px widths, undefined `--ch-hf-*` tokens) instead of composing `src/clubhouse/ui`. Hand-drawn segmented controls, tabs, chips, close buttons, menus and sheets sit next to the real ones, so no two pages feel the same.
- **SYS-2 Data-driven geometry with no clamp, labels at fixed points.** Team hole halos `10 + |v|×22` (r≈96 in a 330-wide drawing), Stats green arcs, Root-cause arms (one dot per hole, up to 300), CVP sparkline and field dots. Circles cover text, labels collide and run off cards.
- **SYS-3 Cards inside cards, and legacy negative margins never reset.** The lane card rules were laid over the older cardless phone pass (`margin-inline: -12px; width: calc(100% + 24px)`), so rows sit 4px from card edges and inner cards run edge to edge with clipped shadows (Home, Ask, Team view rail, Messages).
- **SYS-4 Desktop layouts kept on phone, phone layouts shipped on desktop.** 2×2 grids at 147px columns (Home legs), 5-up chip rows, 300px fixed segmented controls; Plan format shows the phone bar on desktop at full 1100px width.
- **SYS-5 No shared page frame.** Team, Brief and Ask each have a different header, title size and switch position; empty sections stretch to equal heights with 100–200px of dead space; legends describe marks that aren't drawn; empty states are bare.
- **SYS-6 Type tokens inside SVG.** `--ch-type-*` scales with Text Size while the drawing doesn't, so chart text outgrows its padding.
- **SYS-7 The numbers disagree.** The same player shows 2, 3 and 10 rounds and +0.5 vs −6.1 strokes gained on different pages; gains and losses use the same colour; Ask ranks the team as a player and renders a failed chart as a placeholder table.
- **SYS-8 Nothing checked it.** Reviews compared code to the plan on fixtures; nobody looked at real-data-shaped values on a phone. The gate in PR 1 fixes that.

## Lane verdicts (where each stands vs a 10)
- **Team view: rebuild the hole figure and the right rail.** Clamp and auto-place the hole, rail rows on one Surface, one header with Brief/Ask. Then fix the rest.
- **Home: fix the cascade, then polish.** Reset the legacy rows and drop the nested cards; Team's game goes to one column on phone.
- **Ask and Quick chat: rebuild the answer surface.** Flat thread, one Surface per visual, real table fallback. Then the rail and composer.
- **Practice: rebuild the desktop page and Plan format shell to spec.** The phone bar must not show on desktop. Then fix the known save-after-reload/publish bug (`PlanCard.tsx:171`, `PlanTask.tsx:70`).
- **Messages: polish.** Fix avatars, the Announcements overhang and the empty rail, which lost its body text and New message (`MessagesView.tsx` ~737).
- **Root cause: fix the More sheet** (it uses the wrong component), dead taps and the arms cap.
- **Coach vs player: replace the private palette and hand-drawn controls with ui/.** Then fix the charts.
- **Stats: polish.** Clamp the green diagram and fix chart labels. It's the closest to the bar today.
- **Roster/Classes: polish.**
- **Also open from before:** the Ask request id ignores the team (`create-tools.ts:61`). Fix it in the Ask PR.

## Calls already made (don't stop to ask about these)
- Where a lane's specs disagree, `08-ACCEPTANCE.md` wins over 05/06, and the design still wins over both for looks.
- Team hole coins per station: 3, then "+N" (AC-HOLE-05).
- CoachHelm switch: Team / Brief / Ask, same labels on every view, placed where the desktop design puts it (glass top bar, next to the scope text); on phone under the LargeTitle. Brief uses LargeTitle like the others, not its 52px serif title.
- A failed read page uses the spec's error code (CH-13860); update the test.
- The read page's practice link ships in the Practice lane PR, wired to the real plan builder.
- Quick chat finishes its four designed tasks (event, message, qualifier, plan) with their designed visuals; every other request hands off to Ask with the text carried over. No generic unfinished card anywhere.
- Ask's dark accent: add the design's value as a named token in tokens.css used where the Ask design uses it; don't move the global accent.
- The Quick chat mic is in scope: build it on the browser's speech input where available and hide it where not.
- Drills in Ask are built fully behind their flag (the drill bank migration stays held); fix the README line that says they were already built.
- The Practice tab, plan builder, drill bank, groups, templates, print studio, Run view and Calendar Plan row are promised and must be built (FID-PRAC-1 stays P0). Build them fully behind their flag against the held N-00 migrations (010000 to 010800) and test them on a local database; don't run those migrations on staging or prod. List what needs each migration in your report.
- Plan format upload must write where held migration 20261026090300 will still allow it once applied, so applying it later breaks nothing (FID-PRAC-5).
- Pins stay device-only until Nick applies 20261031150000_golf_conversation_pins; build the synced path behind the flag and say so in the Messages PR.
- Stats condensed width is 92 ('wdth'), as every stats-home spec row says.
- Player Home: "Your game" sits right under the greeting, as the design puts it.
- Back always returns to where the user came from (a round opened from a player's Stats goes back to that player's Stats), like iOS.
- Coach Classes moves to the redesigned layout and components the player design uses, keeping the coach's actions; no coach sees a legacy page inside these lanes.
- An iPhone in landscape gets the phone layout: the phone shell test becomes width ≤820 OR (coarse pointer AND height ≤500), in one shared helper and the matching CSS media query.
- Story viewer: hold to pause with text selection, the loupe and the callout turned off and the board behind locked; swipe down to close, like iOS.
- Ask answers on phone: keep the avatar gutter only where the Ask phone design draws it at 390; below 390 the answer body and its visuals run full width with the mark on the turn header, so charts never collapse at 320 (MOB-ASK-9).
- Rotating a phone keeps the open screen, sheet, composer text and scroll position (follows from the landscape call above).
- Text Size is applied in the early theme script before first paint, so text never jumps.
- `theme-color` and the area above the phone bar are the frame green; the overscroll area below the page matches the page background, in light and dark.

## Screenshots
- `nick-phone-team-hole.png`: TEAM-1..11 (halos over labels, caption collision, chip wrap, dashed coin)
- `nick-phone-home.png`: CRH-1, CRH-3, CRH-4
- `qa-desk-ask-1..4.png`: QA-2..6
- `qa-desk-team-1..2.png`: QA-1, QA-7..9, TEAM-8
- `qa-desk-brief-1.png`: QA-10, QA-11
- `qa-desk-home-1..2.png`: QA-1, QA-12
- `qa-desk-roster-1.png`: QA-1, QA-13
- `qa-desk-stats-1..2.png`: QA-1, QA-14
- `qa-desk-practice-1.png`, `qa-desk-plan-format-1.png`: QA-15, QA-16
- `qa-desk-messages-1.png`: QA-17

## Staging pass (cross-lane, real data) (18) — `lanes/qa-staging.md`
- [P0] **QA-1 The same player has different numbers on different pages** — Roster, CoachHelm Team view, Stats, Home; desktop and phone; light and dark
- [P0] **QA-2 Ask: a failed chart renders as an empty "Read / Result" placeholder table** — Ask answer, desktop (and phone), light
- [P0] **QA-3 Ask: the team appears as a player row in "Scoring average, this season"** — Ask answer table, desktop, light
- [P0] **QA-15 Practice desktop: unfinished page** —
- [P0] **QA-16 Plan format desktop: phone layout shipped on desktop; back goes to the wrong page** —
- [P1] **QA-4 Ask: triple-nested cards** — Ask answer, desktop
- [P1] **QA-5 Ask: composer chip says "last 30 days" while the answer uses the season (96 days)** — Ask composer, desktop
- [P1] **QA-6 Ask: left rail "CoachHelm knows" heading with an empty list; first table column has a tinted stripe; "Table" toggle clipped under the sticky title** — Ask desktop
- [P1] **QA-7 Team view: gains and losses coloured the same** — Team view desktop
- [P1] **QA-8 Team view: This week and Working on show the same three items; This week cards are nested cards with a heavy 2px dark-green outline and grey bars that look like loading skeletons** — Team view desktop right rail
- [P1] **QA-9 Team view: dead space and empty legends** — Team view desktop
- [P1] **QA-10 Brief: contradicts Team view and uses a different page frame** — CoachHelm Brief desktop
- [P1] **QA-11 App: "A new version is available" bar is an unstyled black full-width strip over content** — all pages, desktop
- [P1] **QA-17 Messages desktop: wrong avatar, overhanging card, stray band** —
- [P2] **QA-12 Home desktop: dead space and unclear figures** —
- [P2] **QA-13 Roster desktop: three different toggle styles in one toolbar; Last 5 column reads as a skeleton** —
- [P2] **QA-14 Stats desktop: clipped and floating labels** —
- [P2] **QA-18 Staging demo data looks like test data (not a code fix)** —

## Team view (34) — `lanes/team.md`
- [P0] **TEAM-1 Station halo radius is uncapped, so real values draw circles bigger than the hole** — Team board, hole card, phone and desktop, light and dark
- [P0] **TEAM-2 Station labels sit at fixed points inside the halos** — Team hole, phone (`HOLE.v`) and desktop (`HOLE.h`), both themes
- [P0] **TEAM-3 "Around the green" runs off the card** — Team hole, phone, every Text Size (worst at XXL)
- [P0] **TEAM-4 The hole SVG draws outside its box (overflow visible plus negative margin)** — Team hole, phone and desktop
- [P0] **TEAM-5 The figure's 3-line caption collides with the hole** — Team hole header, phone 390 and 402, light and dark
- [P1] **TEAM-6 SVG labels use the --ch-type-* tokens, so they grow with Text Size while the drawing doesn't** — Team hole, huddle, course trend, finger-print; phone, at any Text Size above default
- [P1] **TEAM-7 Station tab row wraps "Short game" to two lines and misaligns the row** — Team hole chip row (`.stchips`), phone 390 and 402
- [P1] **TEAM-8 Gains are drawn as losses on the hole and in the chips** — Team hole and chip row, phone and desktop, light and dark
- [P1] **TEAM-9 Team-average mark lands at the far loss end for a gaining station** — Spot card bars and the player sheet bars, phone and desktop
- [P1] **TEAM-10 Rank words show on every station, including gains ("+2.5 a round · smallest")** — Spot card header meta, phone and desktop
- [P1] **TEAM-11 The hollow (early) coin is a dashed dark disc that reads as broken** — Team hole, early players (under 5 rounds), both themes
- [P1] **TEAM-12 Stations have no 44pt hit target** — Team hole, phone
- [P1] **TEAM-13 Roster totals are amber even when the player gains** — Roster card, phone and desktop
- [P1] **TEAM-14 Huddle quadrant label runs off the card with real data, and a coin sits on it** — Huddle card, phone and desktop
- [P1] **TEAM-15 Story viewer ignores safe areas: progress bar under the Dynamic Island, buttons under Safari's bar** — "This week" story viewer, phone (iOS Safari)
- [P1] **TEAM-16 Close buttons are 34×34 with no extra hit area** — Read, player, course and gone sheets, desktop inspector, story viewer
- [P1] **TEAM-17 Phone sheet content is inset 32px, double the spec** — Read, player and course sheets (ui/Modal), phone
- [P1] **TEAM-18 Desktop roster: the "Loses most" badge is wider than its column and overlaps the finger-print** — Roster card, desktop 1440, both themes
- [P2] **TEAM-19 Hidden sheet header still holds a focusable Close and the dialog's label "Details"** — Phone sheets (ui/Modal with `.ch-htb-sheet`)
- [P2] **TEAM-20 Under Reduce Motion the busy spinners stop** — Assign or Undo busy states in the sheets, phone and desktop
- [P2] **TEAM-21 Course sheet header shows a raw ISO date** — Course sheet (tap a course row), phone and desktop
- [P2] **TEAM-22 0.0 is painted green in bars and sheets** — Spot card bars, player sheet bars
- [P2] **TEAM-23 Hyphen as minus in story and comparison figures** — Story viewer (focus before and now), read-sheet comparison ladder
- [P2] **TEAM-24 Huddle's rotated axis label is as long as the plot at default size and spills past it when larger** — Huddle card, phone
- [P2] **TEAM-25 Huddle coins: 28px tap targets, and low-contrast edges in dark** — Huddle card, phone; dark theme
- [P2] **TEAM-26 Team against Tour grid is 3-up on phone and its cells wrap** — Course tab, phone 390
- [P2] **TEAM-27 Spot axis "Tour" label is not under the zero line** — Spot card and player sheet axis, phone 390
- [P2] **TEAM-28 Skeleton doesn't match the loaded frame (layout jump)** — Team board loading, phone and desktop
- [P2] **TEAM-29 Failure notices are missing their icon tile (only This week has it)** — Working on failed, Track record unavailable, hole failed, player with no rounds
- [P2] **TEAM-30 Course "Try again" is a bare inline text button with no height** — Course tab failed state
- [P2] **TEAM-31 The same station has two names on one card** — Team hole (label) vs chip row and spot header
- [P2] **TEAM-32 Story tile picture is invented for read and theme stories** — This week tiles, phone and desktop
- [P2] **TEAM-33 First-paint fly-in and trend draw-in conflict with the rubric** — Team hole first paint each session; Course tab trend
- [P2] **TEAM-34 Dead keyframe references (a drop-in trap)** — CSS only

## Classes, Roster, Home (35) — `lanes/crh.md`
- [P0] **CRH-1 Latest rounds rows have no inner inset (avatar ~4px from the card edge, score chip flush right)** — Coach Home phone, Latest rounds, light and dark
- [P0] **CRH-2 Today card rows on coach Home have the same 4px inset** — Coach Home phone, Today card (any day with events), light and dark
- [P0] **CRH-3 "The team's game" stays two columns on the phone, and every line wraps every two words** — Coach Home phone at 390 (and worse at 375, 340 or larger Text Size), light and dark
- [P0] **CRH-4 "This week" is a card nested in a card; the strip runs to the outer card's edges and the event line sits 2px from the edge** — Coach Home phone (also the coach first run with events, `CoachHome.tsx:201`), light and dark
- [P0] **CRH-5 Coach first-run Home: "Waiting on you" capsules are ivory text on the ivory page (1.01:1)** — Coach Home phone, first run (team with no players or rounds yet but with a join request or a reply waiting), light
- [P1] **CRH-6 "Since you last looked" is a card inside a card, and its rows are 4px from the inner card edge** — Coach Home phone, a day with events and changes since last visit, light and dark
- [P1] **CRH-7 Team scoring card: the sparkline runs edge to edge, there is an extra 16px above the title, and a stray rule sits at the bottom** — Coach Home phone, Team scoring, light and dark
- [P1] **CRH-8 Player names in "The team's game" are colour-only links on the phone** — Coach Home phone, The team's game, light and dark
- [P1] **CRH-9 The team's game name links are about 20px tall tap targets** — Coach Home phone, light and dark
- [P1] **CRH-10 The team's game notes and notices sit flush on the card edge** — Coach Home phone, The team's game; states "nobody ranked" (CH-2315), up-and-down figures failed (CH-2218), Tour marks failed (CH-2219)
- [P1] **CRH-11 The week strip's event dots are 2.17:1** — Coach and player Home phone (This week), Hub and Calendar strips (shared `ui/WeekStrip`), light (dark 2.39:1)
- [P1] **CRH-12 The week strip tile has a fixed 64px height that its own content overflows** — Every WeekStrip (Home phone, Hub, Calendar), worst at larger Text Size, light and dark
- [P1] **CRH-13 Leader cards and the profile's year chip never get their year colour** — Roster phone and desktop (leaders row), player profile head (year chip), light and dark
- [P1] **CRH-14 Binders after the first lose their tone ring and lift on the phone, and a pressed binder loses its tone fill** — Classes phone, Your classes deck, light and dark
- [P1] **CRH-15 Classes day-ribbon axis labels don't sit at their hours** — Classes phone, Today card on a day off ("No classes today", ribbon of the next class day), light and dark
- [P1] **CRH-16 The team-event block on the ribbon and the team row dot are 1.82:1** — Classes phone, Today card (ribbon and rows), light
- [P1] **CRH-17 Dark mode: a parchment double rule draws across the top of the coach Home green hero** — Coach Home phone, dark
- [P1] **CRH-18 Term card "Soon" stays two columns on the phone** — Classes phone, term card, light and dark
- [P2] **CRH-19 Player Home (phone) is still the pre-redesign ledger page** — Player Home phone, light and dark
- [P2] **CRH-20 The SG bars grow on every mount, at 280ms** — Coach Home phone and desktop, The team's game
- [P2] **CRH-21 "Team stats" can be a dead `#` link** — Coach Home phone and desktop, Team scoring head and failed cards
- [P2] **CRH-22 Latest rounds row type, coin and separators are off spec** — Coach Home phone, Latest rounds
- [P2] **CRH-23 This week: no Calendar link, and competition days lack the design's green tile** — Coach Home phone, This week
- [P2] **CRH-24 The leaders scroller cuts off the cards' lift shadow** — Roster phone, leaders row, light
- [P2] **CRH-25 Roster coin initials are 11px** — Roster phone, team card top-five coins and leader coins
- [P2] **CRH-26 Binder week tiles keep the old champagne "today" and grey "team" fills** — Classes phone and desktop, binders, light and dark
- [P2] **CRH-27 Ribbon: a class that is wholly before 7 AM or after 5 PM disappears** — Classes phone, Today card ribbon
- [P2] **CRH-28 Desktop binder hover replaces the tone ring with the generic card shadow** — Classes desktop, binders, hover
- [P2] **CRH-29 Coach Home Today time column is 48px with nowrap** — Coach Home phone, Today card, larger Text Size or "All day"
- [P2] **CRH-30 Player Roster: the sort bar sits above the Coaches card it doesn't sort** — Roster phone, player view
- [P2] **CRH-31 Desktop "The team's game" squeezes into four 148px columns at 821-1100** — Coach Home desktop, narrow windows or iPad landscape
- [P2] **CRH-32 "Names open that player's game on Stats" shows when names aren't links** — Coach Home phone, The team's game footer
- [P2] **CRH-33 The Classes deck is wrapped in `.ch-cl-deck` twice on the phone** — Classes phone
- [P2] **CRH-34 Join requests badge digit sits high in its pill** — Roster phone and desktop, Join requests row
- [P2] **CRH-35 The term card's "now" knob is a hard-coded colour** — Classes phone and desktop, term line

## Ask (28) — `lanes/ask.md`
- [P0] **ASK-1 Desktop artifact pane renders under the conversation as raw JSON** — thread with an opened artifact (draft plan, lineup, message), desktop 1440, light and dark
- [P0] **ASK-2 Composer hides under the iOS Safari keyboard** — thread and home composer, phone (iOS Safari 26), light and dark
- [P1] **ASK-3 Phone artifact push screen sits under the top bar, with two PhoneTops portalled into one slot** — artifact opened from the thread, phone 390, light and dark
- [P1] **ASK-4 Composition expand button sits on top of the card title** — answer with a composition visual (`.ch-th-cv`), phone and desktop, light and dark
- [P1] **ASK-5 Composition visuals are three cards deep inside the answer bubble** — answer with a composition visual, phone 390 (most visible) and desktop, light and dark
- [P1] **ASK-6 Citation popover is trapped under the next turn and runs off the right edge** — tapping a "read" chip in an answer, phone 390 and desktop, light and dark
- [P1] **ASK-7 Markdown in answers renders wrong: headings merge, numbered lists turn into bullets, code shows backticks** — any answer the model formats, phone and desktop, light and dark
- [P1] **ASK-8 Confirm card source line wraps into the 96px label column** — confirm card (evidence rows) before a write, phone 390 and desktop, light and dark
- [P1] **ASK-9 Capability icons on desktop Ask home fail contrast in dark mode (1.67:1)** — Ask home "What I can do" capability list (v1 desktop), desktop, dark
- [P1] **ASK-10 Home pulse rows are about 20px tap targets** — Ask home v2 "pulse" list, phone 390, light and dark
- [P1] **ASK-11 Long URLs and tokens in answer prose overflow the bubble** — answer with a long URL, file name or unbroken token, phone 390, light and dark
- [P2] **ASK-12 Phone dock has a 12px side edge and thread padding is fixed at 16** — thread and home, phone 390 and 430, light and dark
- [P2] **ASK-13 Safe-area band below the composer and an extra 20px of page scroll on home** — home and thread, phone (iOS with home indicator), light and dark
- [P2] **ASK-14 Error notice uses danger red for a failed answer** — thread when a turn fails, phone and desktop, light and dark
- [P2] **ASK-15 No jump-to-latest control, and auto-scroll scrolls the whole page** — long thread while streaming, phone and desktop
- [P2] **ASK-16 Desktop history rows: text pinned to the top of a 36px row** — conversation list panel, desktop 1440, light and dark
- [P2] **ASK-17 Hand-drawn buttons in the brief/quiz footer and the empty history state** — brief/quiz footer, empty conversation list, phone and desktop
- [P2] **ASK-18 "What it knows" panel misuses classes and has a 12px Remove link** — Ask settings, "What it knows", phone and desktop
- [P2] **ASK-19 Follow-up pills are 36px, and their ring disappears in dark** — suggested follow-ups under an answer, phone and desktop, dark
- [P2] **ASK-20 Version arrows are 28px and unstyled in the phone dock** — artifact with versions, desktop pane and phone push
- [P2] **ASK-21 Hole strip marks under par by colour only, with cells about 33px wide** — hole-strip visual in an answer, phone 390, light and dark, larger Text Size
- [P2] **ASK-22 Small type below the phone floor in the hole-strip header** — hole-strip header, phone
- [P2] **ASK-23 Quiz progress dots animate width** — brief/quiz, phone and desktop
- [P2] **ASK-24 Hard-coded colours in the user bubble with no dark override** — coach's own message bubble, dark
- [P2] **ASK-25 Live "Working" row shows a chevron that does nothing** — streaming answer, phone and desktop
- [P2] **ASK-26 Home greeting uses the device's clock, not the team's** — Ask home greeting, any, first paint
- [P2] **ASK-27 Confirm card primary capsule hit area is about 42px** — confirm card "Add/Send" while busy, phone
- [P2] **ASK-28 `.ch-ak-mark { all: unset }` removes the focus ring from tappable visuals** — hole strip, putt profile, season compare and miss pattern blocks, keyboard and VoiceOver

## Quick chat (23) — `lanes/quick-chat.md`
- [P1] **QC-1 Answers show raw markdown, and charts and evidence are silently dropped** — any assistant answer in the quick chat panel, phone and desktop, light and dark
- [P1] **QC-2 Dark-mode overrides never match, so plan-bar text drops to 1.65–2.92:1** — plan task bar, header buttons, tiles, composer, dark
- [P1] **QC-3 Failed, undone and cancelled receipts still show the green success disc** — task card after a failed save, an Undo, or a cancel, phone and desktop, light and dark
- [P1] **QC-4 Task header chip is unstyled text** — every task card header (Draft / Added / Not saved / Undone / Cancelled), phone and desktop, light and dark
- [P1] **QC-5 Calendar rail clips long events and overlaps existing blocks** — event task visual (add practice/meeting), phone and desktop, light and dark
- [P1] **QC-6 Composer placeholder is 2.33:1 in Safari** — composer empty, phone and desktop, light
- [P1] **QC-7 Stream errors have no Try again, and failed steps get a green check** — answer that fails mid-run, phone and desktop, light and dark
- [P1] **QC-8 Composer doesn't grow past one line** — typing a multi-line question, phone and desktop
- [P1] **QC-9 iOS keyboard pan pushes the phone panel's header off-screen** — panel open with the keyboard up, phone (iOS Safari)
- [P2] **QC-10 "Open full chat" button looks live but does nothing before the first send** — panel header, new chat with no message yet, phone and desktop
- [P2] **QC-11 Live pill has no failed state and sits 2px off centre** — Helm key live pill while a run is out, phone and desktop
- [P2] **QC-12 "Earlier today" row pops in and pushes the thread down** — reopening the panel after a task earlier today, phone and desktop
- [P2] **QC-13 Long words overflow message bubbles** — user bubble, message-draft visual, answers, phone 390
- [P2] **QC-14 Plan bar segment labels are cut mid-letter** — plan task visual with short blocks, phone 390
- [P2] **QC-15 Panel corner radius is 20 where the spec says 32 on phone and 26 on desktop** — panel, phone and desktop
- [P2] **QC-16 Desktop panel is a fixed 640px, taller than short windows** — panel, desktop with a window under about 720px tall (laptop with dock)
- [P2] **QC-17 Tone chips stay visible at 40% after a message is sent** — message task after Send, phone and desktop
- [P2] **QC-18 Cancelled task card has no visual change** — task card after Cancel, phone and desktop
- [P2] **QC-19 No scroll lock behind the phone scrim** — panel open, phone
- [P2] **QC-20 Escape is ignored while typing** — panel, desktop keyboard
- [P2] **QC-21 Reduce Transparency setting in the app is ignored** — panel with the in-app Reduce Transparency setting on
- [P2] **QC-22 Year coins use 11px type** — roster visual coins (SR/JR/SO/FR, "+3"), phone
- [P2] **QC-23 Preview has no error or failed-task fixture** — `/clubhouse-preview/*?qc=<state>`

## Practice plan creation, Practice tab, Documents (33) — `lanes/practice.md`
- [P0] **PP-1 The full plan prints a blank team, UTC times starting "now" and every player as "Player" on live data** — Ask → plan card → Open (full plan, the Sheet tab), phone and desktop, light and dark. Staging data, not previews.
- [P1] **PP-2 The plan card is a card nested inside the answer bubble** — Ask thread, plan card (writing, ready and saved states) and the intake card, phone and desktop, light and dark
- [P1] **PP-3 The practice plan page has no styles: 0 edge on phone, full-bleed on desktop, no title or Back** — `/golf/dashboard/practice/plan/[id]` (reached from "Edit in builder" and from saved plans), phone and desktop
- [P1] **PP-4 "Edit in builder" goes to a read-only print page, not a builder** — Full plan → overflow / dock "Edit in builder", phone and desktop
- [P1] **PP-5 Groups D–F draw an invisible disc: a white letter on no colour** — Plan sheet → Groups and Rotation, any plan with 4 or more groups, phone and desktop, light and dark
- [P1] **PP-6 The full plan dock fires Publish / Save draft even when saving is off, and drops the "Comes with the Practice tab" copy** — Full plan dock, teams without the Practice tab (`saveOn` false), phone and desktop
- [P1] **PP-7 On desktop a failed save shows nothing, and the Saved receipt with Undo is hidden** — Ask on desktop (≥821) with the plan pane open, save / publish / Undo
- [P1] **PP-8 The full plan title has no ellipsis and runs under the absolute "Ask" Back** — Full plan bar, long plan titles, phone (390) and the desktop pane (452)
- [P1] **PP-9 The full plan overlay ignores safe areas: the bar sits under the notch and the dock under the home bar** — Full plan, phone (notched devices, `viewportFit: cover` at `src/app/layout.tsx:105`), light and dark
- [P1] **PP-10 Drill fan cards overflow the card and collide with "+N more"** — Plan card read picture `dr` (drills), phone 390, live drill titles
- [P1] **PP-11 Evidence rows print raw numbers with a hyphen-minus and an unclamped bar width** — Plan card → Evidence sheet, live data, phone and desktop
- [P1] **PP-12 Block sheet Cancel keeps the edits** — Full plan → tap a block → FormSheet (minutes and reps steppers), phone and desktop
- [P1] **PP-13 The desktop pane opens only after writing finishes; meanwhile the card is a bare header** — Ask on desktop, while a plan is being written
- [P1] **PP-14 At 821–1100 the open pane squeezes the thread to about 140–400px** — Ask on desktop narrow (821–1100) with the plan pane open, light and dark
- [P1] **PP-15 PlanFormat Undo ignores failure and leaves the undone format's name as "Current format"** — Practice → Format (coachhelm-practice-format), after an upload → Undo
- [P1] **PP-16 PlanFormat draws its own green bar (a local copy of the shell bar)** — Practice → Format, phone
- [P2] **PP-17 Dark-mode drill-kind dots fall below 3:1** — Read pictures and the sheet, kind key (skill, pressure, random), dark
- [P2] **PP-18 Read-picture labels wrap instead of ellipsizing; cls axis labels collide and hang off the edge** — Plan card read pictures `sg`, `pd` and `cls`, phone
- [P2] **PP-19 The cal picture uses a fixed 5-column grid whatever the number of days** — Read picture `cal` (previews only, not produced live)
- [P2] **PP-20 Rotation grid and meta row don't adapt on phone** — Plan sheet, phone 390 and under 340
- [P2] **PP-21 11px type in the sheet and tags on phone** — Plan sheet group detail and tag row, and the plan date, phone
- [P2] **PP-22 Tap targets under 44 in the plan card and sheets** — Plan card refine chips, intake chips, the ask-in send button, source button, folder save row; phone
- [P2] **PP-23 "Saving…" sweep and the writing caret are static; the scan line has no CSS** — Plan card writing and saving states, and PlanFormat reading, light and dark
- [P2] **PP-24 Folder names lack ellipsis in the save rows and the folder strip** — Save to folder sheet, saved receipt, and the documents strip, phone
- [P2] **PP-25 Format page side padding stays 16 at ≥414** — Practice → Format, phone 414–430
- [P2] **PP-26 The intake's folded state is never drawn** — Ask thread after the intake questions are answered
- [P2] **PP-27 Refine chips are hard-coded and team-specific** — Plan card refine row, every plan
- [P2] **PP-28 Publish coins cap at 9 with no "+N"** — Publish confirm card (ConfirmCard), roster over 9
- [P2] **PP-29 Publish sample preview shows an empty green square for the app icon** — ConfirmCard → sample notification preview, light and dark
- [P2] **PP-30 The player practice page has no empty state and no desktop width** — coachhelm-practice-player, a player with no stops; desktop 1440
- [P2] **PP-31 The three upload options do the same thing; "Take a photo" doesn't open the camera** — Practice → Format → Upload choices, phone
- [P2] **PP-32 The full plan overlay has no focus trap, no Esc, and no scroll containment** — Full plan overlay, phone and desktop (keyboard)
- [P2] **PP-33 The folder-strip "flight" animation can't run on desktop** — Save to folder, desktop

## Messages (19) — `lanes/messages.md`
- [P1] **MSG-1 The phone inbox bar shows a compose key instead of the bell, plus a second New message key** — Messages inbox (root), phone, light and dark, coach and player
- [P1] **MSG-2 Reaction badges overlap the bubble above and run off-screen with several reactions** — Thread, any message with reactions inside a run, phone and desktop, light and dark
- [P1] **MSG-3 The phone composer is an opaque bar with a mismatched fade band, not the floating glass pill** — Thread composer, phone, light and dark, at rest and with the keyboard open
- [P1] **MSG-4 Group typing on phone names an arbitrary member when the typer is unknown** — Group thread, typing indicator, phone
- [P1] **MSG-5 Details shows "Leave" on the team channel for anyone who didn't create it** — Team channel → Details quick actions, phone (redesign), player and assistant coaches
- [P2] **MSG-6 Hold menu uses its own 768 phone breakpoint and fixed insets** — Long-press on a bubble (lift, reaction bar and menu), widths 768–820 and very tall bubbles, phone
- [P2] **MSG-7 Thread bar sizes are off spec on phone, and the team channel bar has no flag** — Thread bar (`.ch-msp-who`), phone, light and dark
- [P2] **MSG-8 The Unread filter still shows the Pinned card, and pinned unread conversations drop out of "Unread"** — Phone inbox → Segmented "Unread", light and dark
- [P2] **MSG-9 Pins decide "team" by title; rows decide by channel** — Phone inbox pins, any group whose title matches the team name
- [P2] **MSG-10 Desktop redesign still uses the old ThreadBelow, not the jump key** — Desktop thread, scrolled up with new messages, light and dark
- [P2] **MSG-11 The details column opens with a raw 462ms grid-template-columns transition** — Desktop thread → Details open and close
- [P2] **MSG-12 Photo tiles in Details have no loading or failure state** — Details → Photos grid, phone and desktop, slow or failed fetch
- [P2] **MSG-13 Tap targets under 44: hold menu rows and wrapped poll foot links** — Long-press menu, and poll card foot when the links wrap, phone
- [P2] **MSG-14 Four `.ch-msv-seeall` rules and two toast styles in one file** — Inbox "See all", toasts, phone and desktop
- [P2] **MSG-15 The reply quote is still the old elevated card** — Thread bubble with a reply quote, and the composer reply strip, light and dark
- [P2] **MSG-16 Own-reaction halo uses the page colour token from the old layout** — Thread, your own reaction chip, light and dark
- [P2] **MSG-17 Hard-coded ivory on the reaction chips of others' bubbles** — Reaction chips on others' bubbles, and the reaction sheet head, dark
- [P2] **MSG-18 The mute menu on phone floats at a fixed 40% top, detached from its row** — Inbox row hold → Mute, phone; Details → Mute, desktop near the right edge
- [P2] **MSG-19 Inbox skeleton uses inline raw sizes, including 9 and 11px bars** — Phone inbox loading

## Root cause (Read) (18) — `lanes/rootcause.md`
- [P1] **RC-1 The ⋯ "More" button opens an empty sheet for players** — Read page, player view, phone (bar ⋯) and desktop (deskbar ⋯), both themes
- [P1] **RC-2 The More sheet is the wrong component and is missing its actions** — Read page ⋯, phone and desktop
- [P1] **RC-3 Round rows show a chevron but can't be tapped** — "The rounds behind it" card, phone and desktop
- [P1] **RC-4 Rail player switcher popover is clipped by its own card** — Read page, desktop 1440 and 1180 to 1279, coach view
- [P1] **RC-5 Cause "arms" draw one 14px dot per hole, with no cap** — "Why CoachHelm thinks so", likely cause, coach, phone and desktop
- [P1] **RC-6 "How it has moved" prints hyphen-minus and drops the decimal** — Moved card slope labels, phone and desktop
- [P1] **RC-7 Desktop action bar overflows the middle column between 1180 and about 1280** — Read page desktop, window 1180 to 1279, with the 232 sidebar
- [P1] **RC-8 Benchmark ladder labels still collide when three marks are close** — Read headline and board summary ladder, phone and desktop
- [P2] **RC-9 Ladder text size is set by CSS that scales and overrides the SVG's own size** — Ladder, phone at Text Size above default
- [P2] **RC-10 Moved card: the "Now" label is a date and runs off the right edge; the line is always amber** — Moved card, phone and desktop
- [P2] **RC-11 Hole chips: no cap and about 30px tall** — Why card, counted cause
- [P2] **RC-12 Link chips are 36px with no hit area** — What to do card link row (Message, Ask), More sheet
- [P2] **RC-13 "Show newest 8 of N" shows all N** — Rounds card with more than 8 rounds
- [P2] **RC-14 Rounds subline has no hole dots** — Rounds card rows
- [P2] **RC-15 Not-traced meter: the spec's ring and ten segments are drawn as N segments** — Why card, not traced
- [P2] **RC-16 Phone loading skeleton has no bar, so it jumps on load** — Read page loading (Suspense fallback), phone
- [P2] **RC-17 Under Reduce Motion the Assign spinner runs at 1ms per turn** — What to do, "Assigning…"
- [P2] **RC-18 Hero figure tracking reset to 0** — Read headline and board summary

## Coach vs player (20) — `lanes/coach-vs-player.md`
- [P0] **CVP-1 The file's loading skeleton has no page edge, no top bar and no lens control, so the layout jumps on load** — Player file (coach and player lens), loading state, on phone and desktop, in light and dark
- [P1] **CVP-2 The phone page edge is 16px on 414–429px phones, where the token says 20px** — Player file, Your week and lenses, on phone at 414/428 wide (Plus/Max sizes), in light and dark
- [P1] **CVP-3 The "Goal" label on the goal sparkline collides with the latest point and can clip above the chart** — Player file, Goal block (coach and player lens), on phone and desktop, in light and dark
- [P1] **CVP-4 The correction and "why" buttons use undefined tokens, so their background and transition are dropped** — Player file, coach corrections (`.corr`) and "Why this" (`.cx__why`), on phone and desktop, in light and dark
- [P1] **CVP-5 The lens Segmented and the Your week tabs are fixed at 300px with nowrap labels, so long first names overflow** — Player file lens control ("As {first} sees it") and Your week header tabs, on phone and desktop, in light and dark
- [P1] **CVP-6 The sticky "Previewing X's screen" pill uses a magic 158px offset** — Player file, coach previewing the player lens, on phone, in light and dark
- [P1] **CVP-7 The plan stepper's undone ring is 1.24:1, and the dark check is 2.92:1** — Player file, focus or plan stepper (`.hs__s`), on phone and desktop, in light and dark
- [P1] **CVP-8 The file runs on a private hex palette that duplicates the app tokens** — All of the player file, in light and dark, including Increase Contrast
- [P1] **CVP-9 The "you" dot in the field strip is drawn 2px off its value, and dots are unclamped** — Player file, "Where you sit" field card (`.dots`), on phone and desktop, in light and dark
- [P2] **CVP-10 Strokes-gained bars are capped at ±1.0 with no overflow mark** — Player file, SG card (`.sg__row`), on phone and desktop
- [P2] **CVP-11 The SG row's fixed 108px label column wraps "Around the green"** — Player file, SG card, on phone, and on all sizes at large Text Size
- [P2] **CVP-12 The card body is inset 20px while the card title is inset 16px, and the coach line and track rows bleed back to 16px** — All player file cards, on phone and desktop
- [P2] **CVP-13 The IntentSheet "picks" are hand-drawn chip buttons for single-choice groups** — Player file, set-intent sheet (Aim, Alerts, note), on phone and desktop
- [P2] **CVP-14 The retry and more buttons in the player file are hand-drawn** — Player file, failed state, partial failure, and the desktop header "more" button
- [P2] **CVP-15 Three-across stat wells are nested inside cards on phone, and "Focuses assigned" wraps** — Player file, feature card comparison (`.feat__cmp`) and the three-tile row (`.tr3`), on phone, in light and dark
- [P2] **CVP-16 Off segments in the progress meter are 1.67:1 on the feature card** — Player file, feature card week progress (`.prog`), in light and dark
- [P2] **CVP-17 The fold animates height and margin-top** — Player file, expand/collapse sections, on phone and desktop
- [P2] **CVP-18 Feature cards and read rows put buttons inside role="button"; badge widths throw the titles out of line** — Player file, feature card and "read" rows, on phone and desktop
- [P2] **CVP-19 The Your week large title is hand-drawn instead of ui LargeTitle** — Your week, on phone and desktop
- [P2] **CVP-20 The Standing "behind" fill is a hard-coded amber gradient with no dark variant** — Standing view, the behind-the-gap bar, in dark

## Stats (19) — `lanes/stats.md`
- [P0] **STATS-1 Coach header on a player's Stats page sits 2px from the screen edge** — Stats, player opened by a coach (`?player=`), phone, light and dark
- [P1] **STATS-2 Green-reading diagram labels collide with arcs whose thickness comes from the data** — Stats, player Overview, short-game zone, Green diagram, desktop, light and dark
- [P1] **STATS-3 GIR% figure in the Green diagram is 1.10:1 in dark mode** — Stats, player Overview, Green diagram centre figure, desktop, dark
- [P1] **STATS-4 Team chart's "Mean" label sits at a fixed left position and collides with the first point and the line** — Stats, Team, Scoring feature card, phone, light and dark
- [P1] **STATS-5 Sticky Player/Team switch ignores the top safe area** — Stats, phone (Home-screen web app and iOS standalone), light and dark
- [P1] **STATS-6 Gain and loss pills on the green Scoring card use the paper tint, not the feature tint** — Stats, player and Team, Scoring feature card, phone, light and dark
- [P1] **STATS-7 Retry buttons and notices are hand-drawn instead of ui Button and InlineNotice** — Stats, player and Team, error and partial-failure states, phone, light and dark
- [P1] **STATS-8 Summary cards nest buttons and a slider inside a role="link" section** — Stats, player phone summary (Scoring, Rounds, Glance cards), phone, light and dark
- [P1] **STATS-9 SVG axis text uses a Text Size type token, so labels get bigger than the chart's padding** — Stats, Scoring feature chart (player and Team), phone, at Text Size XL and XXL
- [P2] **STATS-10 Glance tiles stay three across on phone, and "Scrambling" overflows at 340px** — Stats, player phone summary, "At a glance" card, phone 340–390, light and dark
- [P2] **STATS-11 "Needs 5 rounds" rail text is nowrap and runs into the next columns** — Stats, detail tables (thin-sample rows), phone, at large Text Size
- [P2] **STATS-12 Ribbon chart's reference label and figures share a fixed 40px gutter** — Stats, detail ribbon (SG over rounds, vs Tour or Mean), phone, at large Text Size
- [P2] **STATS-13 Team "Who gains and loses" truncates names in a fixed 104px column** — Stats, Team, gains-and-losses rows, phone, light and dark
- [P2] **STATS-14 Tee-direction stack: Left and Right fills are 1.18:1 apart** — Stats, player, Off the tee detail, direction stack, phone, light and dark
- [P2] **STATS-15 Score-mix bar uses raw px and weight 700, off the type scale** — Stats, Scoring detail (`GameDetail asDetail`), phone and desktop
- [P2] **STATS-16 Skeleton doesn't match the loaded layout (fixed heights; coach header missing)** — Stats, loading, phone, light and dark
- [P2] **STATS-17 Rounds ticker with a single round draws one full-width grey block** — Stats, player, Rounds card, partial state (1 round), phone
- [P2] **STATS-18 Sticky switch's scroll shadow is raw rgb with no dark value** — Stats, phone, dark
- [P2] **STATS-19 Desktop Stats still has around 50 raw px font declarations** — Stats desktop (Overview, Game detail, strokes-gained table), light and dark

## Motion across all lanes (45) — `lanes/motion.md`
- [P1] **MOT-01 The Reduce Motion floor turns every lane's CSS 180ms fade into a hard cut** — every screen under iOS Reduce Motion, phone and desktop, light and dark
- [P1] **MOT-02 Stats cards grow their bars, rings and marks the first time they scroll into view** — S-STATS / S-TEAMSTATS summary and detail cards, phone (SHS), light and dark
- [P1] **MOT-03 Team hole fly-in runs on first paint and hides the stations for up to about 2.2s** — S-TEAM.hole, first visit in a session, phone and desktop
- [P1] **MOT-04 Both Homes grow the team-legs bars on every mount** — Coach Home and Player Home (CRH on), phone and desktop
- [P1] **MOT-05 Team "Working on" proposed rows pop in with an overshoot on every mount** — S-TEAM.working, phone and desktop
- [P1] **MOT-06 Read "Where it shows up" bars, missed dots and path nodes draw in when scrolled into view** — S-READ.where, S-READ.why, phone and desktop
- [P1] **MOT-07 Stats glides SG bars, rank dots and team legs by `left`/`width`, re-rendering React every frame** — S-STATS SG legs, S-TEAMSTATS rank and legs, on a window change, phone and desktop
- [P1] **MOT-08 Player file lens fold animates `height` and `margin-top` for 462ms** — S-FILE.lens flip, phone and desktop
- [P1] **MOT-09 `ui/Swap` eases the frame's `height` on every swap; the lenses fire five at once** — S-FILE.lens and any `Swap` with the default `resize="ease"`, phone and desktop
- [P1] **MOT-10 Desktop sidebar fold animates `width`, `margin`, `padding` and `grid-template-columns`** — rail fold / unfold, desktop 1440, light and dark
- [P1] **MOT-11 Team story timer restarts a full 5200ms after a press-and-hold while the bar resumes mid-way** — S-TEAM.story, phone
- [P1] **MOT-12 Desktop Team inspector slides out empty** — S-TEAM.inspector close (× / Esc), desktop
- [P1] **MOT-13 Team sub-tab switches hard-cut on desktop, while Board, Ask and Standing crossfade** — CoachHelm sub-tabs Board ↔ Team ↔ Ask, desktop
- [P1] **MOT-14 Ask's phone artifact / full-plan push is a hand-rolled CSS slide, not the shell push** — S-ASK.full-plan, S-FMT.see, phone
- [P1] **MOT-15 Stats sticky window switch ignores the safe area, and its stuck shade is per-scroll React state** — S-STATS.stuck, phone (standalone or native shell with a notch)
- [P1] **MOT-16 Animations off doesn't stop the hard-coded loops in Quick chat, Ask, Read and the file** — Settings > Animations off, phone and desktop
- [P1] **MOT-17 `width` and `grid-template-rows` transitions in Ask's brief dots and Messages' poll composer** — S-ASK brief (dots), S-MSG.poll-composer (custom rows), phone and desktop
- [P1] **MOT-18 Lane spinners stop turning under Reduce Motion** — Assign / Proposing / live pill under iOS Reduce Motion
- [P1] **MOT-19 Team Course trend draws and staggers its dots, including on first paint from a deep link** — S-TEAM.course, phone and desktop; `?station=course`
- [P1] **MOT-20 Ask's Undo ring empties at once under Reduce Motion while Undo is still live** — S-ASK.saved / published receipt, Reduce Motion
- [P1] **MOT-21 Team station pulse ring scales the uncapped halo by 1.7, over the header and labels** — S-TEAM.hole station select, phone
- [P2] **MOT-22 Framer and WAAPI fades pass `reduced` as "duration 0" instead of the 180ms fade, and Animations off still fades** — Reduce Motion and Animations off, phone and desktop
- [P2] **MOT-23 Stats window crossfade clones the whole sheet DOM on every window tap** — S-STATS / S-TEAMSTATS window change, phone
- [P2] **MOT-24 The segmented thumb slides by a non-uniform scale and jumps under Reduce Motion** — any segment change with unequal widths ("Coach view" vs "As Eli sees it"), phone and desktop
- [P2] **MOT-25 Literal durations and easings across Ask, the file, Quick chat, Read and Messages** — listed below, all phone and desktop
- [P2] **MOT-26 Spring curves are played at durations they weren't sampled for** — listed below
- [P2] **MOT-27 Every lane writes its own skeleton shimmer; two lane skeletons skip the route hold and fade** — loading states, phone and desktop
- [P2] **MOT-28 Plan cards and Ask brief cards replay their entry on every mount** — Ask thread with a plan card or brief, reopened or reloaded, phone and desktop
- [P2] **MOT-29 Ask summary pills stagger by index** — S-ASK brief summary, phone and desktop
- [P2] **MOT-30 Press tints are missing or late on Roster face cards and Player-file rows** — phone, light and dark
- [P2] **MOT-31 Ask v2 and Practice plan controls have no press or hover states** — brief options `.opt`, receipt link `.lk`, confirm secondary, plan blocks, `.saverow`, folder rows `.fr`; phone and desktop
- [P2] **MOT-32 Read desktop "More" opens a centred dialog, not a popover from the ⋯** — S-READ-DESK.more, desktop
- [P2] **MOT-33 Ask's desktop artifact pane pushes the chat column in one frame** — S-ASKD.pane open / close, desktop
- [P2] **MOT-34 Team story viewer closes with no exit** — S-TEAM.story close (×, Done, last timer, story action), phone
- [P2] **MOT-35 Spec'd crossfades and opens that hard-cut** — listed below
- [P2] **MOT-36 Dead keyframe references in the Team CSS (ported design-page rules)** — n/a (dead or broken CSS)
- [P2] **MOT-37 Sheet exits run 260 CH_EASE where the lanes specify 280** — every `ui/Modal` / `ui/FormSheet` close, phone
- [P2] **MOT-38 Toast exit moves with framer `y`, on the main thread** — toast dismiss, phone and desktop
- [P2] **MOT-39 Overshooting springs on data marks and avatars** — seen-by faces arriving, roster coin hover, Team stations
- [P2] **MOT-40 Team rows scale on press, against the house rule that rows tint** — bar rows, read rows, roster rows, course rows, phone
- [P2] **MOT-41 Popovers with an entry but no exit (class awareness, Ask picker)** — class-awareness popover, Ask composer picker, phone and desktop
- [P2] **MOT-42 Read scroll shade sits at a fixed `top: 110px`** — S-READ phone, under the green bar, any Text Size or safe-area inset
- [P2] **MOT-43 Stats team "chosen leg" plate assumes 44px rows and drifts under Text Size** — S-TEAMSTATS legs, phone, at larger iPhone Text Size
- [P2] **MOT-44 Classes import scan travels a fixed 130px over a box of any height** — ImportSchedule "reading" state, phone and desktop
- [P2] **MOT-45 Quick chat step band keeps `will-change: transform` on for as long as a step runs** — S-RUN.steps active step, phone and desktop

## Design fidelity and features: Team view, Root cause, Coach vs player, Brief (41) — `lanes/fidelity-coachhelm.md`
- [P1] **FID-TEAM-1 No Try again anywhere on the Team view in production** — every failed part (Working on, Course, Spot, players/roster), phone|desktop, light|dark
- [P1] **FID-RC-1 Read summary card (S-READ-BOARD) only exists in the preview** — coach board / Team view / player board, phone|desktop
- [P1] **FID-RC-2 S-READ-BOARD actions row and dismissed state not built** — S-READ-BOARD.actions, S-READ-BOARD.dismissed, phone|desktop
- [P1] **FID-RC-3 Cleared, contradicted and under-review read states missing** — read page, phone|desktop
- [P1] **FID-CVP-1 S-LIST push from the board rows into the player file not built** — Team view players, Coach board players, phone|desktop
- [P1] **FID-TEAM-2 Switch reads "Board / Ask" once you are on Ask** — Ask view entered from the Team view, phone|desktop, light|dark
- [P1] **FID-TEAM-3 Desktop context line hidden; scope text and switch not in the glass bar** — Team view header, desktop, light|dark
- [P1] **FID-TEAM-4 Track record never shows its big figure** — Track record card, phone|desktop, light|dark
- [P1] **FID-TEAM-5 Read sheet says "Assigning… / Assigned as {first}'s focus"; design says propose** — Team read sheet / panel, propose action, phone|desktop
- [P1] **FID-TEAM-6 Story viewer does not pause on keyboard focus and has no focus trap** — Story viewer, phone, light|dark
- [P1] **FID-TEAM-7 Story action reloads the whole page instead of opening the read in place** — Story viewer / desk panel action, phone|desktop
- [P1] **FID-RC-4 Reads rail player switcher leaves the read page** — Reads rail, desktop, coach
- [P1] **FID-CVP-2 Your week feature card can show Accept / Decline for an unrelated proposal** — Player board S-BOARD.focus, phone|desktop
- [P1] **FID-CVP-3 Undoing an older dismissal does nothing visible** — Player file Reads card, dismissed row, phone|desktop
- [P2] **FID-TEAM-8 Context line says "1 players" and counts stale reads as open** — Team view header, phone
- [P2] **FID-TEAM-9 Team/Ask switch dimensions off spec** — switch, phone|desktop, light|dark
- [P2] **FID-TEAM-10 Desktop panel padding 20 vs 22; phone sheet bottom 48 vs 72** — desktop body, phone sheet
- [P2] **FID-TEAM-11 Course sheet missing story link and per-row delta** — Course sheet, phone|desktop
- [P2] **FID-TEAM-12 Story desk panel header has no coin** — Story desk panel, desktop
- [P2] **FID-TEAM-13 One-slot stations show only "+N", hiding every initial** — Hole, tee and short game with 2+ players
- [P2] **FID-TEAM-14 "No Tour figure for single holes" shows on every read without a Tour figure** — Read sheet
- [P2] **FID-TEAM-15 Read sheet "Ask about this" uses secondary, design says ghost; Modal titled "Details"** — Read sheet, phone
- [P2] **FID-TEAM-16 Spot rows include players with no figure; failed spot has no retry** — Spot card
- [P2] **FID-TEAM-17 Huddle draws missing stations on the Tour line** — Huddle chart
- [P2] **FID-TEAM-18 Rungs with no bar render an empty track** — Track record rungs
- [P2] **FID-TEAM-19 Team view and Your week main lack the view-switch enter hook** — Team view, Your week, phone|desktop
- [P2] **FID-TEAM-20 Course card renders both layouts into the DOM** — Course card, phone|desktop
- [P2] **FID-TEAM-21 Dead `.lt h2` rule** — header
- [P2] **FID-TEAM-22 Brief unreachable from the Team view** — Team view, phone|desktop
- [P2] **FID-TEAM-23 Brief frame differs from Team, and its skeleton jumps** — Brief, phone|desktop
- [P2] **FID-RC-5 Thrown feed uses CH-13866; spec says CH-13860** — Read page error
- [P2] **FID-RC-6 Part-failure banner only at 2+ failures, above the headline, middle sentence dropped** — Read page partial
- [P2] **FID-RC-7 Dismissed notice inside the Do card, and stance chip never says "Dismissed"** — Read page dismissed
- [P2] **FID-RC-8 How sure word in meta style, spec 20/1.1/600** — Read page How sure
- [P2] **FID-RC-9 Hand-drawn icon button** — Read page header
- [P2] **FID-RC-10 Practice link never wired** — Read page Do card
- [P2] **FID-CVP-4 File back label "Back"; spec "CoachHelm"** — Player file header, phone|desktop
- [P2] **FID-CVP-5 Lens Accept / Decline use disabled** — Player file lens, phone|desktop
- [P2] **FID-CVP-6 Your week feature card uses ProposalRow, not the designed buttons** — S-BOARD.focus
- [P2] **FID-CVP-7 Player board loading uses the old board skeleton** — Player board loading
- [P2] **FID-CVP-8 File rail drawn whenever roster is present, and dead `void isEarly`** — Player file desktop, player lens

## Design fidelity and features: Classes, Roster, Home, Stats (17) — `lanes/fidelity-crh-stats.md`
- [P1] **FID-STATS-1 Every Stats card is radius 16 with 12pt top padding and an 8pt head gap; design is 18 / 14 / 10** — My stats and Team stats, every summary and detail card, phone, light and dark
- [P1] **FID-STATS-2 "What changed" sentence has wrong grammar and raw metric labels** — My stats, What changed card and Scoring detail "against" section, phone, light and dark, player and coach
- [P1] **FID-STATS-3 Goals detail has no hero, and the coach empty state points to a section that isn't there** — My stats > Goals and focus areas detail (`#sd-goals`), phone, light and dark, player and coach
- [P1] **FID-STATS-4 Try again shows no skeleton and has no busy state you can see; it stays dead if the refresh brings back the same data (extends STATS-7)** — My stats failed (CH-5201) and Team stats failed (CH-4201), phone, light and dark
- [P1] **FID-STATS-5 Back from a round opened in Stats goes to the Rounds list (player) or team Stats (coach)** — My stats > Rounds detail, SG detail round trend > a round > Back, phone, player and coach
- [P2] **FID-STATS-6 Section names are weight 600, wdth 96 and 28pt below the card above; design is 700, wdth 92 and 30pt** — My stats and Team stats section names (Overview, Your game, Rounds, Development; Team game, Players), phone, light and dark
- [P2] **FID-STATS-7 All condensed figures use wdth 96; the spec sets wdth 92 everywhere** — Stats feature figure, summary and cell figures, Home leg figures and greeting, phone, light and dark
- [P2] **FID-STATS-8 Window switch bar, filter button and sheet bottom are each off by 2 to 8px** — My stats and Team stats, sticky switch and page bottom, phone, light and dark
- [P2] **FID-STATS-9 First run (no rounds) still shows the window switch and filter** — My stats with no rounds (first-run card), phone, player and coach
- [P2] **FID-STATS-10 Scoring chart legend reads "Par" without the par value** — My stats Scoring feature card legend, phone, light and dark
- [P2] **FID-STATS-11 Coach player Stats has no "Player stats ⌄" switcher, and Team always goes back to team Stats** — Stats `?player=`, coach, phone
- [P2] **FID-STATS-12 Team "The round" meta and Team scoring hero caption drop the comparison and window words** — Team stats summary (The round) and Team scoring detail (`#sd-team-score`), coach, phone
- [P2] **FID-STATS-13 Team stats reads Text Size once and never updates** — Team stats, big-text layout, coach, phone
- [P2] **FID-STATS-14 Your game card paddings are 2px short in four places** — Player Home > Your game, phone, light and dark
- [P2] **FID-STATS-15 Your game: few-rounds note lacks its lead, failed hides the empty body, and the pill adds "SG"** — Player Home > Your game in the early, no-rounds + cache-failed and normal states, phone
- [P2] **FID-STATS-16 Player Home green top has no avatar or next-event line, and Your game sits far below it (extends CRH-19)** — Player Home, top and first sections, phone, light and dark
- [P2] **FID-CRH-1 Player Home's bar only changes when the Stats flag is also on (extends CRH-19)** — Player Home, phone top bar, light and dark, crh on with stats-redesign off

## Design fidelity and features: Ask, Quick chat (44) — `lanes/fidelity-ask-qc.md`
- [P0] **FID-ASK-1 Every Ask create flow is a generic facts card: no draft visual, no Worked out pills, no date tile** — Ask confirm card, every flow (event, travel, qualifier, lineup, goal, note, block, break, term, availability, recruit), phone and desktop, light and dark
- [P0] **FID-ASK-2 Announcement, poll, task and drill flows promised for Ask are not built; board is text only** — Ask create flows f_annc, f_poll, f_task, f_drill, f_board, both, both themes
- [P0] **FID-ASK-3 No server writes `data-artifact`, so artifact cards, pane, versions and why popover never appear** — Ask artifact card and pane (player report, lineup, round recap), both, both themes
- [P1] **FID-ASK-4 Artifact pane footer has only "Edit in builder"; Save draft and Publish are missing** — Artifact pane footer, desktop, and artifact card actions, phone
- [P1] **FID-ASK-5 The Ask tab's message flow sends as the coach instead of handing off to the composer** — Ask message flow, both
- [P1] **FID-ASK-6 Player Ask can't be reached from the player's navigation** — Player CoachHelm tabs, both
- [P1] **FID-ASK-7 "Ask about this" opens a blank Ask: the `q` it sends is never read** — Team panels and Root cause, "Ask about this" into Ask, both
- [P1] **FID-ASK-8 The event landing surface says "Wednesday" for every event** — Confirm card landing surface, create_event, both
- [P1] **FID-ASK-9 The landing surface draws only the new row, with no real neighbouring rows** — Confirm card E-HS, every flow, both
- [P1] **FID-ASK-10 Ask's held receipt has no Open, and its failed receipt has no Try again** — Receipt held and failed, both
- [P1] **FID-ASK-11 Ask's Told row is a text line, with no coins or seen dots** — Receipt told, both, both themes
- [P1] **FID-ASK-12 Player out state: the composer is removed, and the card has the wrong copy and parts** — Player Ask, out of allowance, both, both themes
- [P1] **FID-ASK-13 The moment chip flips to "Added" only after the 8s hold, not at the receipt** — Confirm card header chip, moments cal, fold, focus and pub, both
- [P1] **FID-ASK-14 Player "Request more" sends at once, with no confirm, no ring and no told row** — Player request more, both
- [P1] **FID-ASK-15 The allowance meter stays green when low** — Player allowance low, both, both themes
- [P1] **FID-ASK-16 Miss pattern, putt profile and season compare are missing half their drawing** — Answer visuals, both, both themes
- [P1] **FID-QC-1 Every Quick chat task except event, message, qualifier and plan renders as an unfinished generic card** — Quick chat task card for trip, goal, note, block, break, term, availability, recruit, lineup and lock, both, both themes
- [P1] **FID-QC-2 A partial receipt shows as a full success** — Receipt partial, both
- [P1] **FID-QC-3 The Told row is text only, though the coin CSS is there** — Receipt told, both, both themes
- [P1] **FID-QC-4 Done steps keep their present-tense label and drop the fact** — Run steps, done, both
- [P1] **FID-QC-5 The composer has no + or mic button, though both are styled** — Panel composer, both
- [P1] **FID-QC-6 The qualifier told line is hard-coded, and its deadline is always empty** — Task qualifier, receipt and visual, both
- [P2] **FID-ASK-17 Read chip popover has no "Open in Stats" link** — Citation popover, both
- [P2] **FID-ASK-18 Brief card: no header icon tile, Skip and Next footer drifts, and folded "Change answers" never resends** — Practice plan brief, every question and folded, both
- [P2] **FID-ASK-19 The v2 thread still shows the old "Reading your program" placeholder before the first step** — Answer, awaiting, both
- [P2] **FID-ASK-20 The tool card skeleton swaps for the chart with no crossfade** — Tool card, both
- [P2] **FID-ASK-21 The confirm header falls back to raw action text for goal, note, lineup and task** — Confirm card header, those flows, both
- [P2] **FID-ASK-22 Answer card and steps spacing is off by 2px throughout** — Answer card, steps, both, both themes
- [P2] **FID-ASK-23 Confirm card geometry drifts on nine properties** — Confirm card, both, both themes
- [P2] **FID-ASK-24 Citation popover, sources and follow-up chip spacing drifts** — Read chip popover, sources, chips, user bubble, skeleton, both
- [P2] **FID-ASK-25 Artifact card, pane and brief spacing drifts** — Artifact card and pane, brief card, both
- [P2] **FID-ASK-26 Dark accent, card and bubble tokens don't match the Ask palette** — Every Ask surface, dark
- [P2] **FID-ASK-27 Home: the greeting is 28 not 26, gaps are 2px short, and player focus rows are always amber** — Ask home, coach and player, both, both themes
- [P2] **FID-ASK-28 The request-more email names the team, not the player who asked** — Player request more, server, n/a
- [P2] **FID-ASK-29 Meter and out card geometry** — Player allowance meter, out card, both
- [P2] **FID-ASK-30 The Knows panel error is styled as the allowance meter** — Knows panel error, desktop
- [P2] **FID-QC-7 The live pill is 2px off on radius and padding, with the wrong type step** — Live pill, both, both themes
- [P2] **FID-QC-8 The panel sheet body is 12px inset, not 14** — Panel body, both
- [P2] **FID-QC-9 The header padding, gap and mark tile don't match the spec** — Panel header, both
- [P2] **FID-QC-10 The request bubble and answer text are a half step too large** — Request bubble, answer text, both
- [P2] **FID-QC-11 Steps, step summary and task header spacing is 2px short** — Steps, steps summary, task card, both
- [P2] **FID-QC-12 "Stopped" bleeds into earlier finished turns** — Run stopped, a session with several turns, both
- [P2] **FID-QC-13 Coins are 24px with 11px type, and the plan segment ink is hard-coded** — Coins, plan bar, both, dark
- [P2] **FID-QC-14 The key's accent colours are hard-coded hex** — Key and anything using `--ch-qc-a-accent-text` outside the panel, both themes

## Design fidelity and features: Practice, Documents, Messages (39) — `lanes/fidelity-practice-msg.md`
- [P0] **FID-PRAC-1 Practice tab, builder, drill bank, groups, templates, print studio, Run view and Calendar Plan row do not exist** — all Practice routes, phone and desktop, light and dark
- [P0] **FID-PRAC-2 A plan in Documents cannot be opened** — Team Hub › Documents › Practice plans, plan row tap, phone and desktop, light and dark
- [P1] **FID-PRAC-3 The plan format is saved but never used** — Plan format set and see; Ask draft; plan sheet. Both platforms, both themes.
- [P1] **FID-PRAC-4 Undoing a new format deletes the old one** — Plan format, set → Undo, both platforms
- [P1] **FID-PRAC-5 Format upload is filed in "Practice plans" and each retry leaves a document behind** — Plan format, upload sheet → "Try another", both platforms
- [P1] **FID-PRAC-6 No Share PDF anywhere, and no Print in Ask's full plan** — Plan page bar; Ask full plan; Plan format "see" dock; player plan bar. Both platforms.
- [P1] **FID-PRAC-7 The player can't open the full plan, print it, or reach it from Documents** — Player plan page; player Documents; phone, both themes
- [P1] **FID-PRAC-8 Publish: team chat post has no link, Told row never shows, no Seen by** — Ask publish → published receipt; Team chat; Documents shared row. Both platforms.
- [P1] **FID-PRAC-9 Publish failed says "Nothing was saved." with no Try again, and the published Documents strip is missing** — Ask publish failed and published receipts, both platforms
- [P1] **FID-PRAC-10 Plan format on phone draws two green bars (extends PP-16)** — Plan format, phone ≤820, light and dark
- [P1] **FID-PRAC-11 The random drill kind is ochre in light and dark, not plum (corrects PP-17)** — Plan sheet rotation, kind legend and segments, both platforms, light and dark
- [P1] **FID-PRAC-12 Plan format and plan page check different flags** — /practice/format and /practice/plan/[id] routing
- [P1] **FID-PRAC-13 Plan format's error page sends "home" to a route that doesn't exist** — Plan format error state, both platforms
- [P1] **FID-PRAC-14 Documents plan rows look and act like files** — Team Hub › Documents › Practice plans rows (coach), both platforms, both themes
- [P1] **FID-MSG-1 Pins sync is built but held; pins live on one device** — Inbox pinned card, phone and desktop
- [P2] **FID-PRAC-15 Sheet headings drop the player count and total time** — Plan sheet Groups and Schedule headings, all surfaces
- [P2] **FID-PRAC-16 Sheet foot copy is wrong and the page count is hard-coded** — Plan sheet foot, all surfaces, print
- [P2] **FID-PRAC-17 Bring uses "×", Notes draws 3 lines, empty Bring shows a bare heading** — Plan sheet Bring and Notes, all surfaces
- [P2] **FID-PRAC-18 Why lines don't mark losses in amber** — Plan sheet `.pp-why` lines, both themes
- [P2] **FID-PRAC-19 Print margin and page size differ from spec; no repeating header** — Print, coach, desktop
- [P2] **FID-PRAC-20 Full plan sheet metrics drift on almost every rule** — Plan sheet (plan page, Ask full plan, print), phone and desktop, both themes
- [P2] **FID-PRAC-21 Plan format rows, hints and receipt drift** — Plan format empty, set and learn states, both platforms, both themes
- [P2] **FID-PRAC-22 Format "found" view shows 3 of 5 sections and no summary line; no More key** — Plan format found state, both platforms
- [P2] **FID-PRAC-23 Player plan stops and chips drift** — Player plan page, phone, light and dark
- [P2] **FID-PRAC-24 Group faces are 24 px and leave out the viewer** — Player plan group faces; Ask publish confirm coins. Both platforms.
- [P2] **FID-PRAC-25 Plan page loading and error aren't Clubhouse screens** — Plan page and Plan format loading and error, both platforms, both themes
- [P2] **FID-PRAC-26 Drill bank is capped at 20 and library drills all read as "skill"** — Ask draft, drill choices
- [P2] **FID-PRAC-27 "?from=coachhelm" is passed and ignored** — Ask full plan → Open plan page → Back, phone
- [P2] **FID-PRAC-28 Unnamed groups fall back to "Player"** — Plan sheet Groups, all surfaces
- [P2] **FID-MSG-2 Pinned card padding, radius and gaps drift** — Inbox pinned card, phone and desktop, both themes
- [P2] **FID-MSG-3 Pin faces: direct 64 with 22 initials, group 62** — Inbox pinned card faces, phone
- [P2] **FID-MSG-4 Group pins show a last-message bubblet** — Inbox pinned card, group pin, phone
- [P2] **FID-MSG-5 HelloCard face is 64, spec 72** — Fresh conversation (HelloCard), both platforms
- [P2] **FID-MSG-6 New message suggestion faces are 36, spec 32** — New message, phone, suggestion list
- [P2] **FID-MSG-7 "Players you haven't messaged" lists coaches too** — New message, desktop, empty search
- [P2] **FID-MSG-8 "Message the team" does the same as "Start a conversation" on phone** — Messages first run, coach, phone vs desktop
- [P2] **FID-MSG-9 Attach tiles use the wrong fills; the attach tokens don't exist** — Composer + attach sheet, both platforms, both themes
- [P2] **FID-MSG-10 Switch off-ring is #8e8a80, spec #8F8B81** — Mute and settings switches, off state, light
- [P2] **FID-MSG-11 First-run illustration has hard-coded colours** — Messages first run illustration, dark

## iPhone: shell, Classes, Roster, Home, Stats (36) — `lanes/mobile-shell-crh-stats.md`
- [P1] **MOB-SHELL-1 Modal and FormSheet keyboard rules never run in Safari, so Save sits under the keyboard** — any phone modal or FormSheet with a text field (ClassForm, GoalSheet, StatsFilter, roster edit sheets); all widths; any Text Size; light and dark; keyboard up
- [P1] **MOB-SHELL-2 The new-version bar on phone sits under the home indicator and covers the Resume pill and composers** — any phone page after a deploy; all widths; any Text Size; light and dark; keyboard down (and up: it then sits under the keyboard)
- [P1] **MOB-SHELL-3 The PhoneBar back label is never shortened and runs into the centred title** — any pushed PhoneScreen (Roster > player, Classes > class, Stats drill-downs); 320 at default Text Size; 375-390 from XL; light and dark
- [P1] **MOB-SHELL-4 Toasts land on top of the Resume round pill** — any phone page with an in-progress round (dock visible) after a save or delete toast; all widths; light and dark
- [P1] **MOB-SHELL-5 The offline banner sticks at the desktop top-bar height, under or below the phone bar** — any phone page while offline; all widths; standalone and Safari; light and dark
- [P1] **MOB-SHELL-6 Text Size jumps after hydration because the type scale is not set before paint** — every page on first load or reload, any Text Size above Large; all widths; light and dark
- [P1] **MOB-SHELL-7 Overscroll and status-area colour differ from the green bar and the page** — every phone page; top rubber band and bottom overscroll; Safari (status tint on ≤18) and standalone; light (and dark, with dark tokens)
- [P1] **MOB-SHELL-8 Landscape phones get the desktop sidebar shell** — any page at 844, 852 or 932 wide (iPhone 13-16 and Pro Max landscape); any Text Size; light and dark
- [P1] **MOB-SHELL-9 The home-screen icon renders on black because it is a transparent 512px logo** — Add to Home Screen, the iOS home screen and the app switcher
- [P1] **MOB-SHELL-10 The Resume pill's Discard X is a 36px target 4px from Resume** — the PhoneDock with a round in progress; all widths; light and dark
- [P1] **MOB-CRH-1 The roster player profile note box is in a screen that ignores the keyboard** — Roster > player profile (coach), coach note at the bottom; all widths; keyboard up
- [P1] **MOB-CRH-2 Home first-run quick-add chips are 32px with 6px gaps** — Home empty state (coach and player, first run); all widths; light and dark
- [P1] **MOB-STATS-1 The goal sheet's number pad has no minus key, so negative strokes-gained targets cannot be typed** — Stats > Set goal (coach and player); default metric `sg_putting`; keyboard up
- [P2] **MOB-STATS-2 The big-text layout misses XXL, so the window switch overflows under the filter at 320** — Stats (player), 320 wide at XXL; light and dark
- [P2] **MOB-STATS-3 The window switch fades its last segment even when that segment is selected** — Stats window switch with Custom selected, or the big-text layout; all widths; light and dark
- [P2] **MOB-STATS-4 Starting a scroll on the scoring chart flashes a readout and fires a haptic** — Stats scoring chart (coach and player); all widths
- [P2] **MOB-STATS-5 The leg-bars "open" link keeps its hover underline after a tap** — Stats leg bars (coach and player); all widths
- [P2] **MOB-SHELL-11 Smaller Text Sizes are ignored and Text Size is never re-read** — every page at xSmall, Small or Medium; also after changing Text Size with the app open
- [P2] **MOB-SHELL-12 Bar side padding stays at 16px when the page edge is 20px (≥414)** — Plus and Pro Max widths (414, 428, 430, 440) on top-level pages
- [P2] **MOB-SHELL-13 The route loading bar draws under the status bar in standalone** — route changes in standalone mode
- [P2] **MOB-SHELL-14 The bell count badge has an ivory ring on the green bar and fixed 11px text** — PhoneBar bell with unread items; light and dark
- [P2] **MOB-SHELL-15 The dock and toasts use 12px side edges** — phone pages with the dock or a toast; all widths
- [P2] **MOB-SHELL-16 Bell stack pills and drag handle are small, with 2px between hit areas** — bell stack (notification drop) on phone
- [P2] **MOB-SHELL-17 There is no pull to refresh in the home-screen web app** — standalone mode, all list pages
- [P2] **MOB-SHELL-18 iOS scroll indicators are hidden in every scroller** — all inner scrollers (sheets, section strip, tables, the landscape canvas)
- [P2] **MOB-SHELL-19 No launch image, and the manifest colours belong to another palette** — cold launch from the home screen
- [P2] **MOB-SHELL-20 The refresh-flag and hero edge colours differ from the surfaces they extend** — CRH pages with the refresh flag on; Home hero top
- [P2] **MOB-SHELL-21 The pushed-screen scroll lock can make Safari's toolbar jump** — Safari tab (not standalone) when a PhoneScreen pushes after scrolling
- [P2] **MOB-SHELL-22 The search field autocorrects and capitalises names** — Roster and TeamRoster search; keyboard up
- [P2] **MOB-CRH-3 The roster sheet scroller uses a fixed 20px edge on small phones** — roster profile sheet; widths below 414
- [P2] **MOB-CRH-4 The Classes sticky day header is the wrong colour and not full width** — Classes (phone, CRH flag on), while scrolling
- [P2] **MOB-CRH-5 The Home team scoring figure is a fixed 44px** — Home team form card (coach); any Text Size
- [P2] **MOB-CRH-6 The Home score row is fixed at 46px and clips at XXXL** — Home score rows; XXXL
- [P2] **MOB-CRH-7 Home's clash warning explains itself only on hover** — Player Home and coach Home (flag off), Today list, overlapping events
- [P2] **MOB-CRH-8 Return in ClassForm saves the whole form instead of moving to the next field** — Classes > New/Edit class; keyboard up
- [P2] **MOB-CRH-9 Short CRH pages show a two-tone band below the content** — CRH pages (Classes, Roster, Home) with little content

## iPhone: Team view, Root cause, Coach vs player (29) — `lanes/mobile-coachhelm.md`
- [P0] **MOB-TEAM-1 Team and file read sheets lose their height cap: tall sheets run off the bottom of the screen and can't scroll** — Team view on phone. Read, player, course and gone sheets ("Details"). Player file and Your week "This read" sheets. 320 and 375 at default size; every width at XXL. Light and dark.
- [P1] **MOB-CVP-1 Set-intent note is 15px, so Safari zooms on focus, the keyboard is never detected, and Save sits under the keyboard (extends CVP-13)** — Player file, set-intent sheet (IntentSheet), the "Only you see this" note. iPhone Safari and standalone, every width.
- [P1] **MOB-CVP-2 `.ch-hf` paints the sheet's `<dialog>`: square page-coloured corners behind the rounded sheet and a 48px band under it** — Player file read sheet, Your week read sheet, and the set-intent sheet, on phone. Light (#f2f0e9) and dark (#0e120f).
- [P1] **MOB-TEAM-2 Story viewer press-and-hold selects text and opens the loupe; vertical drags scroll the board behind and cancel the hold** — Team view, story viewer, at every phone width, in Safari and standalone.
- [P1] **MOB-TEAM-3 Story body has no overflow path: at 320x568 or XXL the Back / Next footer is pushed off the screen** — Story viewer at 320x568 (SE) at default size and at every width at XXL; worst on stories with the 18-hole grid.
- [P1] **MOB-TEAM-4 Spot and Player bar rows are 30px tap targets with 12px gaps** — Team view on phone, the Spot card rows and the player sheet bars ("tap a row to open the player").
- [P1] **MOB-TEAM-5 Spot row names truncate after about 7 characters** — Spot card on phone at 375 and 390. Worse at 320 and at XXL.
- [P1] **MOB-TEAM-6 At 320 the hole SVG shrinks to 0.81: station labels about 10.5px, coin initials about 9px, coins about 18px (extends TEAM-6)** — Team view, Hole card, 320 wide (SE 1st gen and Zoomed display), every Text Size.
- [P1] **MOB-TEAM-7 Phone landscape (844x390) gets the desktop Team layout, squeezed into about 486px** — Team view, iPhone landscape 844x390 (and 852 and 932 Pro Max).
- [P1] **MOB-TEAM-8 Desktop inspector in landscape ignores the right and bottom safe areas and has no scrim** — Team view, iPhone landscape 844x390 (desktop layout): the inspector opened from a station, row or story.
- [P1] **MOB-RC-1 Phone landscape (844x390) gives the Read page's middle column about 216px (extends RC-7)** — Read page (root cause), iPhone landscape 844x390, coach view.
- [P1] **MOB-CVP-3 Phone landscape (844x390): the desktop file header leaves the player's name about 50px** — Player file, iPhone landscape 844x390 (desktop layout).
- [P1] **MOB-TEAM-9 Coach Brief "Open" buttons are 30px tall** — Coach Brief on phone (`?view=brief`), Open reads and Working on rows.
- [P2] **MOB-TEAM-10 Read sheet correction chips are 36px; the 44px hit area exists only in the file's sheet** — Team view read sheet on phone ("Is this right?" chips and "Change").
- [P2] **MOB-RC-2 Read page correction chips and "Change" are 36px** — Read page on phone, the correction row.
- [P2] **MOB-TEAM-11 "Open the full read" and "Open {first}'s page" links are about 32px tall** — Team view phone sheets (read and player), the closing link.
- [P2] **MOB-TEAM-12 Story tiles snap flush against the card edge and chain overscroll to the page** — Team view, story tiles strip on phone.
- [P2] **MOB-TEAM-13 Course sheet rows: minimum column widths exceed the sheet at 320, so the value clips** — Team view, Course sheet, 320 wide, and 375 at XXL.
- [P2] **MOB-TEAM-14 Story action scrolls the Working card under the phone top bar** — Team view on phone, a story's "See what they're working on" action.
- [P2] **MOB-TEAM-15 Coach Brief section links land under the phone bar: scroll-margin is 72px, the bar is about 100px** — Coach Brief on phone, opened with `?section=` (week, patterns, working, record, goals).
- [P2] **MOB-TEAM-16 Coach Brief goal player names are 13px inline links about 18px tall** — Coach Brief on phone, Goals section, each player name.
- [P2] **MOB-TEAM-17 Chosen station resets to the biggest leak after going back from a player or read** — Team view on phone: pick a station, open a row's full page, then swipe back.
- [P2] **MOB-TEAM-18 The "+N" coin has a click handler but no role, focus or label, and is about 18–22px** — Team view hole, a station with more players than slots.
- [P2] **MOB-TEAM-19 Story tap-to-advance region has no `touch-action:manipulation`** — Story viewer, tapping the body to advance quickly.
- [P2] **MOB-CVP-4 Deep link to a file section scrolls it under the bar and the sticky lens control** — Player file on phone, opened with a section target (from Brief, a story or a notification).
- [P2] **MOB-CVP-5 Long read titles in the file's read rows are cut to one line on phone** — Player file and Your week read list on phone, 375 and below, and at XXL.
- [P2] **MOB-CVP-6 Card header meta truncates to a few characters at 320 and XXL** — Player file cards on phone, header right side ("Last 10 rounds" and similar).
- [P2] **MOB-CVP-7 File correction buttons and "Change" are 36px outside the sheet** — Player file page on phone (not the sheet): the "Is this right?" row on read cards.
- [P2] **MOB-CVP-8 File sheets carry `.ch-htb`, so the Team view's catch-all motion rules run inside them** — Player file and Your week read sheets, with Reduce Motion on.

## iPhone: Ask, Quick chat (34) — `lanes/mobile-ask-qc.md`
- [P0] **MOB-ASK-1 Answer bar chart track collapses to 6px at 320** — Ask v1 answer with a bars figure (e.g. "Who's hitting the most greens"), 320; 375 is degraded. Any Text Size, light and dark, keyboard down
- [P0] **MOB-ASK-2 SG anatomy diverging track is about 12px at 320** — Ask v1 strokes-gained anatomy answer, 320 (67px at 375). Default Text Size, light and dark
- [P0] **MOB-QC-1 Landscape iPhone opens the 640px desktop panel and focuses its field off screen (extends QC-16)** — Quick chat opened from the top-right key, landscape 844x390 and 932x430 (desktop branch), keyboard up
- [P0] **MOB-QC-2 Phone panel has no minimum height, so with the keyboard up in mini landscape the composer is clipped** — Quick chat, iPhone 12/13 mini landscape 812x375 (phone layout), keyboard up
- [P1] **MOB-ASK-3 Blue "send" return key inserts a newline on iPhone** — Ask composer, every phone width, keyboard up
- [P1] **MOB-ASK-4 Plan sheet inputs are 15px, so iOS zooms the page on focus** — Ask, practice plan card sheet: "Ask about this block", "Ask about this station" and the folder-name field. All widths, default Text Size (zoom happens below a computed 16px)
- [P1] **MOB-QC-3 Quick chat "New folder" field is 15px, so iOS zooms inside the glass panel** — Quick chat, plan task, new folder row, all phone widths, keyboard up
- [P1] **MOB-QC-4 Auto-scroll fires on every streamed token, smooth, with no stick-to-bottom check** — Quick chat body while an answer streams, all phone widths, with the user scrolled up to reread
- [P1] **MOB-QC-5 Swipe-to-close on the panel header never fires on touch** — Quick chat on phone, swiping up on the header to close, all widths
- [P1] **MOB-QC-6 Grab handle swipe zone is 36x5px and sits in the home-indicator gesture zone** — Quick chat on phone, bottom of the panel, all widths, portrait and standalone
- [P1] **MOB-QC-7 Phone panel ignores safe-area-inset-bottom and ends in the home-indicator zone** — Quick chat on phone, keyboard down, Face ID iPhones (375/390/430), Safari with the toolbar collapsed and standalone mode
- [P1] **MOB-ASK-5 Artifact push on phone has no edge-swipe back and no history entry** — Ask, opening an artifact (plan, report) from an answer on phone, all widths
- [P1] **MOB-ASK-6 Action-card Confirm button is clipped at 320 with XXL text** — Ask v1 confirm card (e.g. "Move Saturday Spring Preview Tournament"), 320, Text Size XXL (k≈1.353)
- [P1] **MOB-ASK-7 Action-card fact values break mid-word at 320 with XXL text** — Ask v1 confirm card facts ("Event: Saturday Spring Preview Tournament"), 320, XXL
- [P1] **MOB-ASK-8 Ranked list name column is about 52px at 320, so names break mid-word** — Ask v1 rank answer ("Who's improving most"), 320, default and XXL
- [P1] **MOB-ASK-9 Answer mark indent takes 48px of every phone answer** — Ask v1, every answer, 320/375
- [P1] **MOB-ASK-10 Keyboard-up phone chrome leaves about 170px of thread on an iPhone SE** — Ask, coach, 375x667 (SE 3), keyboard up, default Text Size; worse at XXL
- [P1] **MOB-ASK-11 The "+" menu blurs the composer, so the keyboard drops and comes back** — Ask composer on phone, keyboard up, tapping "+"
- [P1] **MOB-QC-8 Receipt row leaves the receipt text about 62px at 320 and about 23px at XXL** — Quick chat task receipt ("Added Wedge Distance Control (80-120 yards) to Tuesday" with Undo and Open), 320; XXL
- [P1] **MOB-QC-9 Phone panel sits under the notch in mini landscape** — Quick chat, iPhone 12/13 mini landscape 812x375 (phone layout), notch side either way
- [P1] **MOB-QC-10 Panel stays open across navigation, so "Looking at" changes mid-task** — Quick chat on phone, panel open, then Safari edge-swipe back or a link in an answer
- [P2] **MOB-ASK-12 Artifact push ignores the side insets in mini landscape** — Ask artifact push, 812x375 mini landscape (phone layout)
- [P2] **MOB-ASK-13 Phone composer placeholder wraps to two lines at 320** — Ask composer, first turn, 320; 375 at XXL
- [P2] **MOB-ASK-14 Chat settings sheet ignores its 0.62 detent** — Ask, Chat settings on phone, all widths
- [P2] **MOB-ASK-15 Scope line truncates the important part (the time window) at XXL** — Ask v2 scope line ("Demo University Golf · all players · last 30 days"), 320/375, XXL
- [P2] **MOB-ASK-16 Citation chip breaks the prose line spacing, and its hit area covers the lines above and below** — Ask v2 answer prose with citations, all widths, worse at XXL
- [P2] **MOB-QC-11 Undo and Open are 2px apart** — Quick chat receipt, all phone widths
- [P2] **MOB-QC-12 Tone and option chips' 44px hit areas overlap between wrapped rows** — Quick chat message-tone chips and question options, wrapping to two or more rows at 320/375, any Text Size
- [P2] **MOB-ASK-17 Plan sheet "Ask about…" field has no focus ring, a 28px send button and no return key behaviour** — Ask, practice plan card sheet, ask field, all widths, keyboard up
- [P2] **MOB-QC-13 VoiceOver reads streaming answers and typed titles letter by letter** — Quick chat with VoiceOver on, any width
- [P2] **MOB-ASK-18 role="log" over the streaming thread repeats announcements, with nested live steps** — Ask v1 with VoiceOver, while an answer streams
- [P2] **MOB-QC-14 The panel dialog is not modal for VoiceOver** — Quick chat with VoiceOver, phone
- [P2] **MOB-ASK-19 Artifact push is a dialog with no modality and no focus move** — Ask artifact push with VoiceOver, phone
- [P2] **MOB-ASK-20 Brief question options are announced as a radio group with no radios** — Ask v2 brief card questions with VoiceOver

## iPhone: Practice, Documents, Messages (40) — `lanes/mobile-practice-msg.md`
- [P1] **MOB-MSG-1 Opening a photo or file from Details is blocked as a pop-up in iPhone Safari** — Details > Photos / Files tiles, all widths, all Text Sizes, light and dark. Keyboard down.
- [P1] **MOB-MSG-2 There are no message actions on touch at ≥821 (iPhone landscape 844/932, iPad)** — thread, 844x390 and 932x430 landscape (desktop tree), any Text Size, light and dark.
- [P1] **MOB-MSG-3 Landscape iPhone gets the desktop composer, and rotating throws away composer state** — thread, 844x390, keyboard up, rotating between portrait and landscape. All Text Sizes.
- [P1] **MOB-MSG-4 About 34px of home-indicator padding stays above the keyboard in Mobile Safari (extends MSG-3)** — thread and New message, 320–430 portrait, keyboard up, Safari (not Capacitor). Light and dark.
- [P1] **MOB-MSG-5 The keyboard drops after every send on iPhone** — thread composer, all widths, keyboard up, Safari.
- [P1] **MOB-MSG-6 A long press while typing drops the keyboard under a lift measured with the keyboard up** — thread, 320–430, keyboard up, long press on a bubble.
- [P1] **MOB-MSG-7 The date pill sits at a fixed 74px, under the notch bar** — thread scroll, all portrait widths, all Text Sizes, light and dark.
- [P1] **MOB-MSG-8 At XXL the drag-for-times stops 13–20px short, so times stay clipped** — thread, drag left to show times, 320–430, largest non-AX and XXL, light and dark.
- [P1] **MOB-MSG-9 Pin speech bubbles overlap at 320 and 375** — inbox Pins card with 3 pins, 320, 375 and 390, default Text Size and up, light and dark.
- [P1] **MOB-MSG-10 The poll sheet's Cancel and Send scroll away under the Safari keyboard** — composer `+` > Poll, 320–430, keyboard up, Safari. All Text Sizes.
- [P1] **MOB-MSG-11 Details hosts Search but isn't keyboard-aware, and Search doesn't take focus** — Details > Search in conversation, 320–430, keyboard up, Safari.
- [P1] **MOB-MSG-12 Landscape 812 (phone tree) ignores the side safe areas** — thread, inbox and composer, 812x375 landscape (iPhone X/11 Pro/12-13 mini), all Text Sizes.
- [P1] **MOB-PRAC-1 Plan sheet times print "10:30 AM" in a 46px column and 40px rotation headers** — Practice plan sheet (coach), 320–430, default Text Size and up, light (the sheet is light only).
- [P1] **MOB-PRAC-2 Print on iPhone leaves a second plan sheet rendered under the app** — plan page > Print, iPhone Safari and the standalone home-screen app.
- [P1] **MOB-PRAC-3 "Ask about this block/station" is covered by the Safari keyboard** — plan card sheet (block / station) > Ask field, 320–430, keyboard up, Safari.
- [P2] **MOB-MSG-13 Thread side padding stays 12px at ≥414** — thread, 414/428/430, all Text Sizes.
- [P2] **MOB-MSG-14 The thread bar's name block overflows its fixed 44px at large Text Sizes** — thread bar, 320–430, largest non-AX and XXL.
- [P2] **MOB-MSG-15 Phone bubble column is 82% wide, the spec says 76%** — thread, all phone widths.
- [P2] **MOB-MSG-16 A double tap anywhere in the bubble stack likes the message, even on links, polls and images** — thread, all widths, touch.
- [P2] **MOB-MSG-17 New message and announcement fields lack phone keyboard hints, and Return does nothing** — New message (To, group Name) and New announcement (Title), 320–430, keyboard up.
- [P2] **MOB-MSG-18 The Search key leaves the keyboard over the results** — inbox search and conversation search, all widths, keyboard up.
- [P2] **MOB-MSG-19 A short inbox shows a band of a different colour below the list** — inbox with 0–4 conversations, 320–430, light and dark.
- [P2] **MOB-MSG-20 Announcement folds keep a hover tint after a tap** — inbox Announcements section, all phone widths, light and dark.
- [P2] **MOB-MSG-21 The attach menu sits under the bar on a 320 SE with the keyboard up, and tapping outside goes through** — composer `+` menu, 320x568, keyboard up (visual viewport ≈ 260px), all Text Sizes.
- [P2] **MOB-MSG-22 The photo picker can't send videos, and "File" opens the same iOS sheet** — composer `+` > Photos / File, iPhone.
- [P2] **MOB-MSG-23 A tapped photo leaves the app for a new Safari tab** — thread image attachment, all widths.
- [P2] **MOB-MSG-24 Opening a thread mounts 200 bubbles, each fetching signed attachment URLs** — a busy team thread, on cellular.
- [P2] **MOB-MSG-25 The inbox row's leading swipe fights Safari's back-swipe at the left edge** — inbox rows, Safari (not standalone), all widths.
- [P2] **MOB-MSG-26 Swipe-to-reply gives no feedback while dragging** — thread bubble, swipe right to reply, touch.
- [P2] **MOB-MSG-27 The jump-to-latest key doesn't re-check when the keyboard opens or the screen resizes** — thread, keyboard up or down while scrolled near the end.
- [P2] **MOB-MSG-28 Details "Files" jumps instead of scrolling smoothly** — Details, tapping the Files count, all widths.
- [P2] **MOB-PRAC-4 Player plan and Plan format keep a 16px edge at ≥414 and show a background seam (extends PP-25)** — player's plan view (`.ch-cpv-ply`) and Plan format (`.ch-cpv-fmt`), 414–430, light and dark.
- [P2] **MOB-PRAC-5 The player's plan view shows two titles** — player > Practice, all phone widths.
- [P2] **MOB-PRAC-6 "Now" and "Next" go stale on a long-open phone** — player's plan view, during practice, home-screen app resumed after minutes.
- [P2] **MOB-PRAC-7 Time columns overflow at XXL (`.drow` 46px, `.stop` 52px, `.blk` 54px)** — coach sheet, plan blocks and player stops, 320–430, largest non-AX and XXL.
- [P2] **MOB-PRAC-8 Bring and Notes stay two columns at 320** — plan sheet, 320 (and 375 at XXL).
- [P2] **MOB-PRAC-9 Plan format's "See … in it" link is small and wraps next to Undo** — Plan format, after changing the format, 320–430, all Text Sizes.
- [P2] **MOB-PRAC-10 Documents: desktop drop copy, a 32px ⋯ button and an 11px type tag on the phone** — Practice > Documents, 320–430, light and dark.
- [P2] **MOB-PRAC-11 The folder name field refocuses on every render and lacks keyboard hints** — plan builder > new / rename folder, keyboard up.
- [P2] **MOB-PRAC-12 Plan format's file input sits outside the modal sheet** — Plan format > upload a format file, all widths.
