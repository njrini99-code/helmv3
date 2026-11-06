# Clubhouse redesign: production-ready UI, UX and motion (paste this whole message)

You are the Claude Code session on Nick's Mac working in `helmv3`. Nick (the owner) looked at the nine redesign lanes on staging tonight with real demo data on his iPhone and on desktop. His verdict: "Like a 2 and it needs to be a 10. The whole thing." His bar is Apple. Everything below gets fixed: the look, the UX, the motion, and the numbers. Nothing in this list is optional and nothing is "polish for later".

You do every fix yourself, end to end, one lane at a time, with CI on every PR. Work autonomously; don't stop to ask unless a rule below says to.

## Hard rules (never break)
1. `git checkout main && git pull` first. Every PR branches off fresh `main`. One lane (or one foundation step) per PR. Small PRs.
2. Open each PR **ready for review, not draft**, with the fix already pushed. CI skips drafts, and the Clubhouse quality workflow (`.github/workflows/clubhouse-quality.yml`) does not re-run on later pushes. After any follow-up push run `gh workflow run clubhouse-quality.yml --ref <branch>` and wait for it. Never merge on red or on a skipped check. If something goes red, fix it on that same PR before starting the next one.
3. No deploys, no migrations run on any hosted database (staging or prod; a local Supabase is fine for tests), no feature-flag flips, no prod. Don't change what shot tracking collects.
4. Build only from the app's own components and tokens: `src/clubhouse/ui/*` (Button, Segmented, Avatar, Badge, Surface, Section, States, EmptyShape, Modal, FormSheet, Menu, ContextMenu, WeekStrip, PhoneBar, ScrollRegion, DeltaChip, ScoreMark, LargeTitle, PageHero, Toast, Ledger, SearchField, Select, Tooltip, charts/*) and `src/clubhouse/styles/tokens.css`. No new hand-drawn controls, no new hex colours, no raw px font sizes, no copying CSS from `design-refresh/**/redesign*.css` or the design HTML. If a component is missing something, extend the component (with a test), don't fork it.
5. Owner rules: phone page edge `--ch-page-x-phone` (16px, 20px on ≥414); no accent left-border cards anywhere; text follows iPhone Text Size; keep the smooth scroll; red only for under-par, errors and destructive; U+2212 minus, `E` for even, `—` for no data; 44pt tap targets; contrast ≥4.5:1 text and ≥3:1 large text, icons and edges, in light AND dark.
6. Motion: transform and opacity only, durations and easings from tokens, every transition has a reduced-motion path (180ms fade, `CH_FADE_MS`), page-behind slide 24%. **No first-paint motion** (no fly-ins, draw-ins, count-ups or staggers on load). Motion answers the user's action. That is Nick's call and it settles TEAM-33.
7. **Acceptance = the design.** Nick was promised these pages would look like the design stills in `design-refresh/<lane>/` (`redesign/*.html`, `capture/`, `screenshots/`, plus `04-FIDELITY-SPEC.md`, `06-SCREEN-SPECS.md`, `07-MOTION.md`). A page is done only when the live page, at 390x844 and at 1440x900, matches its design still side by side: layout, spacing, type, colour, hierarchy, empty/loading/error states, and the motion in 07-MOTION.md (within rule 6). Anything that doesn't look premium is a bug even if it isn't listed below. Where a design still draws a one-off control instead of the app's real one, reach the same look with the real `ui/` component (extend it if needed) and say which in the PR. Render each design HTML in the same browser at the same sizes so the comparison is fair.
8. Before calling any fix done, look at it: capture before and after with `npm run clubhouse:shots` in **WebKit at 390x844 and Chromium at 1440x900, light and dark**, and for every phone screen also WebKit at 320x568 and 430x932, at the largest Text Size, and with the keyboard up on any screen with a field (if Xcode's iOS Simulator is on the Mac, check each lane in Simulator Safari on the smallest and largest iPhone, keyboard and home-screen mode included; otherwise simulate the keyboard by shrinking `visualViewport` in the test), on the fixture preview (`/clubhouse-preview/<screen>` with the stress states below) and, where you can sign in, on staging with the demo team. Compare every screen side by side with that lane's design reference in `design-refresh/<lane>/` (the `redesign/`, `capture/` and `screenshots/` folders and `04-FIDELITY-SPEC.md` / `06-SCREEN-SPECS.md`). If it doesn't match the design at both sizes, it isn't done. Put the before/after pairs in the PR body.
9. Every PR runs locally and passes before you push: `npm run test`, `npm run lint`, `npm run typecheck`, `npm run clubhouse:check`, `npm run clubhouse:css`, `npm run clubhouse:a11y`, `npm run clubhouse:quality`. Every bug fixed gets a test that would have caught it (unit, DOM or Playwright).
10. Step 0: check which commit the QA site (`helmv3-clubhouse-qa.vercel.app`) is built from. If it isn't current `main`, say so in your first PR body and in your report to Nick. Don't redeploy it yourself.
11. **Merge gate: side-by-side pictures on every PR.** Before a lane PR can merge, its body shows, for every screen it touches, one image per size (390x844 WebKit and 1440x900 Chromium) with three panels: design still | before | after. Show light, and dark where the design has a dark still. Most packages ship `design-refresh/<lane>/capture/capture.mjs`, which takes the design stills (`design`) and the matching app shots (`app`); use it, and `npm run clubhouse:shots` where it has no matching id, plus a small script that joins the PNGs (commit the script, not the images). Team view (`coachhelm-team`), Ask, Quick chat (`coachhelm`), Coach vs player (`coachhelm-lenses`) and Classes/Roster/Home ship no rendered stills yet, only the HTML, so run their `capture.mjs design` first. Nothing is called "done" or "matches the design" in a PR, a commit message or a report without those pictures, and if the after panel doesn't match the design panel, the PR stays open. Nick reviews the pictures, not your words.
12. **Be absurdly critical. Every subpage, every motion, every feature.** Nick's words: "Be absurdly critical", "Every subpage", "Every motion and transition", "Every feature you claimed to build".
    - Every subpage means each route, tab, segment, sheet, modal, menu, popover, drawer, detail view, editor, composer, row expansion and toast, in its empty, loading, error, partial, long-data and one-item states, on phone and desktop. Each one gets its side-by-side, not just the main page. The subpage inventory tables in `lanes/fidelity-*.md` list them; a subpage the design draws that the code doesn't render must be built.
    - Pixel fidelity: a 2px spacing miss, a different radius, a wrong weight, a wrong word or casing, an icon at the wrong size or stroke, a missing pressed or hover state is a bug. Fix it.
    - Every motion and transition in each lane's `07-MOTION.md` is built exactly (within rule 6), on every subpage, with its reduced-motion path. Every tap gets a pressed state. Nothing jump-cuts that the spec animates, and nothing animates that the spec doesn't.
    - Every feature the packages claim (02-PLAN, 05-SCREENS, 06-SCREEN-SPECS, 08-ACCEPTANCE) works end to end on real data and is reachable from the app's navigation. The feature checklist tables in `lanes/fidelity-*.md` mark what isn't. A stub, a fixture-only screen, a dead tap, a TODO or a placeholder is not done. Where a feature needs a held migration or a flag, build it fully behind that flag and list the migration in your report; don't run it.
    - When you finish a lane, re-read its `08-ACCEPTANCE.md` line by line and tick each item in the PR body with the picture that proves it.

## Why it looks vibe coded (fix these causes first; they explain most of the list)
- **SYS-1 Design-page CSS ported, not built.** Lanes copied the design HTML's CSS (private hex palettes, `overflow: visible`, fixed coordinates, fixed px widths, undefined `--ch-hf-*` tokens) instead of composing `src/clubhouse/ui`. Hand-drawn segmented controls, tabs, chips, close buttons, menus and sheets sit next to the real ones, so no two pages feel the same.
- **SYS-2 Data-driven geometry with no clamp, labels at fixed points.** Team hole halos `10 + |v|×22` (r≈96 in a 330-wide drawing), Stats green arcs, Root-cause arms (one dot per hole, up to 300), CVP sparkline and field dots. Circles cover text, labels collide and run off cards.
- **SYS-3 Cards inside cards, and legacy negative margins never reset.** The lane card rules were laid over the older cardless phone pass (`margin-inline: -12px; width: calc(100% + 24px)`), so rows sit 4px from card edges and inner cards run edge to edge with clipped shadows (Home, Ask, Team view rail, Messages).
- **SYS-4 Desktop layouts kept on phone, phone layouts shipped on desktop.** 2×2 grids at 147px columns (Home legs), 5-up chip rows, 300px fixed segmented controls; Plan format shows the phone bar on desktop at full 1100px width.
- **SYS-5 No shared page frame.** Team, Brief and Ask each have a different header, title size and switch position; empty sections stretch to equal heights with 100–200px of dead space; legends describe marks that aren't drawn; empty states are bare.
- **SYS-6 Type tokens inside SVG.** `--ch-type-*` scales with Text Size while the drawing doesn't, so chart text outgrows its padding.
- **SYS-7 The numbers disagree.** The same player shows 2, 3 and 10 rounds and +0.5 vs −6.1 strokes gained on different pages; gains and losses use the same colour; Ask ranks the team as a player and renders a failed chart as a placeholder table.
- **SYS-8 Nothing checked it.** Reviews compared code to the plan on fixtures; nobody looked at real-data-shaped values on a phone. The gate in PR 1 fixes that.

## PR order
**PR 1: Gate (land this first).** Extend `e2e/clubhouse-quality.spec.ts` (and fixtures in `src/clubhouse/preview/`) with stress states for every lane screen: the real staging values (−3.9, +2.5, +1.9, 0.0), long names ("Demo University Golf", "Saturday Spring Preview Tournament", "Wedge Distance Control (80-120 yards)"), zero data, one player, 300 holes, 40 messages. Then add assertions that run at 390x844 (WebKit) and 1440x900, light and dark, and fail the build when:
- an element's box leaves its nearest Surface/card (more than 0.5px), or text is clipped (scrollWidth > clientWidth without ellipsis);
- a Surface is nested inside a Surface;
- phone text is under 12px, or a tap target is under 44pt;
- axe contrast fails;
- a row's content sits less than 12px from its card edge;
- the page edge isn't `--ch-page-x-phone`.

Add `clubhouse:css` rules that fail on new hex colours outside tokens.css, `transition: all`, animated width/height/top/left, `overflow: visible` on chart SVG, and `margin-inline: -` inside `[data-ch-crh='on']` scopes. The gate must be red on today's `main` for TEAM-1, CRH-1, CRH-3 and CRH-4 (prove it in the PR body), then go green as each lane lands. Until a lane has landed, mark its known failures `test.fail` with the bug ID, never `skip`.

**PR 2: Shared primitives.**
- A `clampRadius`/`scaleToBox` helper and an SVG label placer that avoids collisions and keeps labels inside the viewBox (used by Team hole, Stats green, Root-cause arms, CVP charts).
- SVG text in fixed viewBox units, not type tokens.
- One CoachHelm/page header pattern (LargeTitle on phone, the desktop page hero) with the view switch always in the same place.
- Reset the legacy negative-margin rows under the lane scope.
- A Surface "no nested Surface" dev warning.

Tests for each.

**PR 3: Numbers (SYS-7, QA-1/2/3).** One windowed source for rounds and strokes gained across Roster, Team view, Stats and Home; every figure names its window; one sign convention and colour (green gains, amber losses); team excluded from player rankings; failed Ask visuals fall back to the data table or nothing. Add a cross-page consistency test on the demo team fixture.

**PR 4 onward: one lane per PR, worst first.** Team view → Home/Classes/Roster → Ask and Quick chat → Practice (Practice tab, Plan format, plan builder, Documents) → Messages → Root cause → Coach vs player → Stats → final motion check across all lanes. Each lane fixes **every** finding with that lane's prefixes below, including P2s: its own prefix (TEAM, CRH, ASK, QC, PP/PRAC, MSG, RC, CVP, STATS), its `FID-<LANE>-*` and `MOB-<LANE>-*` findings, its QA-* items, its `MOT-*` findings and every row of its subpage inventory, feature checklist and motion coverage table that isn't "matches"/"built". A lane with a lot to build (Practice: the tab, builder, drill bank, templates, print, Run view; Ask: the create flows and artifacts) may split into several small PRs in that order; the lane isn't done until all of them merge. PR 2 also lands every `MOB-SHELL-*` finding (the phone shell, tab bar, safe areas, keyboard handling, viewport and theme-color meta) and the motion fixes that live in shared code (for example MOT-01, the Reduce Motion floor that turns every fade into a cut). The final motion PR walks the whole coverage table on device size and fixes anything left. Where a lane's verdict says rebuild, rebuild that screen's layout from `ui/` components against its design reference, rather than patching CSS.

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

## Report back to Nick (short)
After each PR merges, reply with one line: lane, PR link, bug count fixed, and a before/after pair at 390 and 1440. When all lanes are in, send the full list of PRs and anything you couldn't fix, with the reason. Don't deploy; Nick decides that.

## The bug list
Step 0 as well: Nick attached `redesign-ui-sweep-2026-11-06.zip` with this message (check `~/Downloads` if it isn't next to the prompt; if you can't find it, ask Nick for it before PR 1). Unzip it into `design-refresh/` (it makes `design-refresh/redesign-ui-sweep-2026-11-06/`) and commit that folder in PR 1, so every later PR reads it from the repo. It holds:
- `lanes/<lane>.md`: the full write-up of every bug below (measurements, design values vs code values, spec references).
- `lanes/fidelity-*.md`: the subpage inventory, the feature checklist (what was promised vs what's built) and the pixel findings for each lane.
- `lanes/mobile-*.md`: the iPhone pass (320 to 430 wide, landscape, Text Size up to XXL, keyboard up, Safari toolbar, safe areas, home-screen mode).
- `lanes/motion.md`: the motion system rules every lane follows, and the coverage table of every interaction on every subpage.
- `FIX_PROMPT_FULL.md`: this prompt with every bug written out in full.
- `screenshots/`: Nick's phone shots, the staging desktop shots and the first side-by-sides.

Before each lane PR, read that lane's `lanes/*.md` files in full, including its rows in the fidelity inventory, feature checklist and motion coverage table. The index below is the checklist: every ID must be fixed, with its test, and named in the PR body. Where a write-up and the code disagree, trust the code you read, fix the real cause, and note it in the PR.


### Staging pass (cross-lane, real data) (18)
- **QA-1 The same player has different numbers on different pages** [P0] data selectors behind `screens/coachhelm/team/TeamBoard.tsx`
- **QA-2 Ask: a failed chart renders as an empty "Read / Result" placeholder table** [P0] Ask answer visual renderer
- **QA-3 Ask: the team appears as a player row in "Scoring average, this season"** [P0] Ask team tools
- **QA-15 Practice desktop: unfinished page** [P0]
- **QA-16 Plan format desktop: phone layout shipped on desktop; back goes to the wrong page** [P0]
- **QA-4 Ask: triple-nested cards** [P1] Ask answer card > visual card > stat card
- **QA-5 Ask: composer chip says "last 30 days" while the answer uses the season (96 days)** [P1]
- **QA-6 Ask: left rail "CoachHelm knows" heading with an empty list; first table column has a tinted stripe; "Table" toggle clipped under the sticky title** [P1]
- **QA-7 Team view: gains and losses coloured the same** [P1]
- **QA-8 Team view: This week and Working on show the same three items; This week cards are nested cards with a heavy 2px dark-green outline and grey bars that look like loading skeletons** [P1]
- **QA-9 Team view: dead space and empty legends** [P1]
- **QA-10 Brief: contradicts Team view and uses a different page frame** [P1]
- **QA-11 App: "A new version is available" bar is an unstyled black full-width strip over content** [P1]
- **QA-17 Messages desktop: wrong avatar, overhanging card, stray band** [P1]
- **QA-12 Home desktop: dead space and unclear figures** [P2]
- **QA-13 Roster desktop: three different toggle styles in one toolbar; Last 5 column reads as a skeleton** [P2]
- **QA-14 Stats desktop: clipped and floating labels** [P2]
- **QA-18 Staging demo data looks like test data (not a code fix)** [P2]

### Team view (34)
- **TEAM-1 Station halo radius is uncapped, so real values draw circles bigger than the hole** [P0] `src/clubhouse/screens/coachhelm/team/TeamHole.tsx:51`
- **TEAM-2 Station labels sit at fixed points inside the halos** [P0] `src/clubhouse/screens/coachhelm/team/hole-geometry.ts:47-50`
- **TEAM-3 "Around the green" runs off the card** [P0] `src/clubhouse/screens/coachhelm/team/hole-geometry.ts:49`
- **TEAM-4 The hole SVG draws outside its box (overflow visible plus negative margin)** [P0] `src/clubhouse/styles/coachhelm-team.css:212-214`
- **TEAM-5 The figure's 3-line caption collides with the hole** [P0] `src/clubhouse/screens/coachhelm/team/TeamBoard.tsx:73-80`
- **TEAM-6 SVG labels use the --ch-type-* tokens, so they grow with Text Size while the drawing doesn't** [P1] `coachhelm-team.css:301-304`
- **TEAM-7 Station tab row wraps "Short game" to two lines and misaligns the row** [P1] `src/clubhouse/screens/coachhelm/team/StationControl.tsx:24-29`; `coachhelm-team.css:330-353`
- **TEAM-8 Gains are drawn as losses on the hole and in the chips** [P1] `TeamHole.tsx:77-79`
- **TEAM-9 Team-average mark lands at the far loss end for a gaining station** [P1] `src/clubhouse/screens/coachhelm/team/SpotCard.tsx:42`; `panels.tsx:280`
- **TEAM-10 Rank words show on every station, including gains ("+2.5 a round · smallest")** [P1] `src/clubhouse/screens/coachhelm/team/SpotCard.tsx:14`
- **TEAM-11 The hollow (early) coin is a dashed dark disc that reads as broken** [P1] `coachhelm-team.css:323-329`
- **TEAM-12 Stations have no 44pt hit target** [P1] `TeamHole.tsx:61-86`
- **TEAM-13 Roster totals are amber even when the player gains** [P1] `src/clubhouse/screens/coachhelm/team/Cards.tsx:71`
- **TEAM-14 Huddle quadrant label runs off the card with real data, and a coin sits on it** [P1] `src/clubhouse/screens/coachhelm/team/Huddle.tsx:195-197`
- **TEAM-15 Story viewer ignores safe areas: progress bar under the Dynamic Island, buttons under Safari's bar** [P1] `coachhelm-team.css:1244-1256`
- **TEAM-16 Close buttons are 34×34 with no extra hit area** [P1] `coachhelm-team.css:1123-1133`
- **TEAM-17 Phone sheet content is inset 32px, double the spec** [P1] `coachhelm-team.css:1788-1790`
- **TEAM-18 Desktop roster: the "Loses most" badge is wider than its column and overlaps the finger-print** [P1] `src/clubhouse/screens/coachhelm/team/Cards.tsx:67`; `coachhelm-team.css:1634-1636`
- **TEAM-19 Hidden sheet header still holds a focusable Close and the dialog's label "Details"** [P2] `coachhelm-team.css:1781-1787`
- **TEAM-20 Under Reduce Motion the busy spinners stop** [P2] `coachhelm-team.css:1683-1690`
- **TEAM-21 Course sheet header shows a raw ISO date** [P2] `src/clubhouse/screens/coachhelm/team/panels.tsx:344`
- **TEAM-22 0.0 is painted green in bars and sheets** [P2] `SpotCard.tsx:36`
- **TEAM-23 Hyphen as minus in story and comparison figures** [P2] `Stories.tsx:73`, `:78`, `:81`
- **TEAM-24 Huddle's rotated axis label is as long as the plot at default size and spills past it when larger** [P2] `Huddle.tsx:201-203`
- **TEAM-25 Huddle coins: 28px tap targets, and low-contrast edges in dark** [P2] `Huddle.tsx:220`
- **TEAM-26 Team against Tour grid is 3-up on phone and its cells wrap** [P2] `coachhelm-team.css:684-713`
- **TEAM-27 Spot axis "Tour" label is not under the zero line** [P2] `coachhelm-team.css:459-468`
- **TEAM-28 Skeleton doesn't match the loaded frame (layout jump)** [P2] `TeamBoardSkeleton.tsx:35`
- **TEAM-29 Failure notices are missing their icon tile (only This week has it)** [P2] `Cards.tsx:118-127`, `:170-175`; `TeamBoard.tsx:257-267`; `panels.tsx:250-255`
- **TEAM-30 Course "Try again" is a bare inline text button with no height** [P2] `CourseCard.tsx:124`; `coachhelm-team.css:1768-1771`
- **TEAM-31 The same station has two names on one card** [P2] `hole-geometry.ts:101-102`
- **TEAM-32 Story tile picture is invented for read and theme stories** [P2] `Stories.tsx:38-44`
- **TEAM-33 First-paint fly-in and trend draw-in conflict with the rubric** [P2] `team-motion.ts:14-86`
- **TEAM-34 Dead keyframe references (a drop-in trap)** [P2] `coachhelm-team.css:531`

### Classes, Roster, Home (35)
- **CRH-1 Latest rounds rows have no inner inset (avatar ~4px from the card edge, score chip flush right)** [P0] `src/clubhouse/styles/home.css:3293-3296`
- **CRH-2 Today card rows on coach Home have the same 4px inset** [P0] `home.css:3264-3266`
- **CRH-3 "The team's game" stays two columns on the phone, and every line wraps every two words** [P0] `home.css:4740-4746`
- **CRH-4 "This week" is a card nested in a card; the strip runs to the outer card's edges and the event line sits 2px from the edge** [P0] `home.css:4972-4980`
- **CRH-5 Coach first-run Home: "Waiting on you" capsules are ivory text on the ivory page (1.01:1)** [P0] `screens/home/CoachHome.tsx:200` renders `<CoachQueue phone />` in `.ch-hm-body`, not in the green hero. The l
- **CRH-6 "Since you last looked" is a card inside a card, and its rows are 4px from the inner card edge** [P1] `home.css:5233-5238`
- **CRH-7 Team scoring card: the sparkline runs edge to edge, there is an extra 16px above the title, and a stray rule sits at the bottom** [P1] `home.css:1447-1451` and `:3145-3147`
- **CRH-8 Player names in "The team's game" are colour-only links on the phone** [P1] `home.css:4466-4472`
- **CRH-9 The team's game name links are about 20px tall tap targets** [P1] `home.css:4760-4762`
- **CRH-10 The team's game notes and notices sit flush on the card edge** [P1] `TeamLegs.tsx:214-245`
- **CRH-11 The week strip's event dots are 2.17:1** [P1] `src/clubhouse/styles/ui.css:2029-2034`
- **CRH-12 The week strip tile has a fixed 64px height that its own content overflows** [P1] `ui.css:1964-1971`
- **CRH-13 Leader cards and the profile's year chip never get their year colour** [P1] `roster.css:3824-3835` sets `--ch-rs-y` only for `:is(.ch-rs-mix, .ch-rs-mix__lg) [data-year=…]`. `RosterLeade
- **CRH-14 Binders after the first lose their tone ring and lift on the phone, and a pressed binder loses its tone fill** [P1] `classes.css:1644-1647`
- **CRH-15 Classes day-ribbon axis labels don't sit at their hours** [P1] `screens/classes/ClassesCrh.tsx:204-209`
- **CRH-16 The team-event block on the ribbon and the team row dot are 1.82:1** [P1] `classes.css:2996-2998`
- **CRH-17 Dark mode: a parchment double rule draws across the top of the coach Home green hero** [P1] `home.css:3652-3654`
- **CRH-18 Term card "Soon" stays two columns on the phone** [P1] `classes.css:2872-2879`
- **CRH-19 Player Home (phone) is still the pre-redesign ledger page** [P2] `screens/home/PlayerHomePhone.tsx`
- **CRH-20 The SG bars grow on every mount, at 280ms** [P2] `home.css:4806` and `:5340`
- **CRH-21 "Team stats" can be a dead `#` link** [P2] `HomePhone.tsx:117` and `:391`
- **CRH-22 Latest rounds row type, coin and separators are off spec** [P2] `HomePhone.tsx:543`
- **CRH-23 This week: no Calendar link, and competition days lack the design's green tile** [P2] `HomePhone.tsx:440-442`
- **CRH-24 The leaders scroller cuts off the cards' lift shadow** [P2] `roster.css:3018-3028`
- **CRH-25 Roster coin initials are 11px** [P2] `roster.css:2917` and `:2999`
- **CRH-26 Binder week tiles keep the old champagne "today" and grey "team" fills** [P2] `classes.css:2021-2036`
- **CRH-27 Ribbon: a class that is wholly before 7 AM or after 5 PM disappears** [P2] `ClassesCrh.tsx:182-186`
- **CRH-28 Desktop binder hover replaces the tone ring with the generic card shadow** [P2] `classes.css:360-364`
- **CRH-29 Coach Home Today time column is 48px with nowrap** [P2] `home.css:4657-4661`
- **CRH-30 Player Roster: the sort bar sits above the Coaches card it doesn't sort** [P2] `screens/roster/TeamRosterPhoneCrh.tsx:67-80`
- **CRH-31 Desktop "The team's game" squeezes into four 148px columns at 821-1100** [P2] `home.css:5370-5372`
- **CRH-32 "Names open that player's game on Stats" shows when names aren't links** [P2] `TeamLegs.tsx:212`
- **CRH-33 The Classes deck is wrapped in `.ch-cl-deck` twice on the phone** [P2] `ClassesView.tsx:475`
- **CRH-34 Join requests badge digit sits high in its pill** [P2] `roster.css:3084-3095` and `:3544-3555`
- **CRH-35 The term card's "now" knob is a hard-coded colour** [P2] `classes.css:2868`

### Ask (28)
- **ASK-1 Desktop artifact pane renders under the conversation as raw JSON** [P0] src/clubhouse/screens/coachhelm/chat/Ask.tsx:400; src/clubhouse/styles/coachhelm-ask-v2.css:134
- **ASK-2 Composer hides under the iOS Safari keyboard** [P0] src/clubhouse/styles/coachhelm-ask.css:892, :895
- **ASK-3 Phone artifact push screen sits under the top bar, with two PhoneTops portalled into one slot** [P1] src/clubhouse/styles/coachhelm-ask-v2.css:141
- **ASK-4 Composition expand button sits on top of the card title** [P1] src/clubhouse/styles/coachhelm-thread.css:1977–1995
- **ASK-5 Composition visuals are three cards deep inside the answer bubble** [P1] src/clubhouse/styles/coachhelm-ask-v2.css:18
- **ASK-6 Citation popover is trapped under the next turn and runs off the right edge** [P1] src/clubhouse/styles/coachhelm-ask-v2.css:18
- **ASK-7 Markdown in answers renders wrong: headings merge, numbered lists turn into bullets, code shows backticks** [P1] src/clubhouse/screens/coachhelm/data/coachhelm-chat-thread.ts:579
- **ASK-8 Confirm card source line wraps into the 96px label column** [P1] src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx:132–133; src/clubhouse/styles/coachhelm-ask-v2.css:
- **ASK-9 Capability icons on desktop Ask home fail contrast in dark mode (1.67:1)** [P1] src/clubhouse/styles/coachhelm-ask.css:1277, :1339
- **ASK-10 Home pulse rows are about 20px tap targets** [P1] src/clubhouse/styles/coachhelm-ask-v2.css
- **ASK-11 Long URLs and tokens in answer prose overflow the bubble** [P1] src/clubhouse/styles/coachhelm-thread.css:224
- **ASK-12 Phone dock has a 12px side edge and thread padding is fixed at 16** [P2] src/clubhouse/styles/coachhelm-ask.css:924–928
- **ASK-13 Safe-area band below the composer and an extra 20px of page scroll on home** [P2] src/clubhouse/styles/shell.css:1217
- **ASK-14 Error notice uses danger red for a failed answer** [P2] src/clubhouse/styles/coachhelm-thread.css:1021–1027
- **ASK-15 No jump-to-latest control, and auto-scroll scrolls the whole page** [P2] src/clubhouse/screens/coachhelm/chat/Thread.tsx
- **ASK-16 Desktop history rows: text pinned to the top of a 36px row** [P2] src/clubhouse/styles/coachhelm-ask.css:304–314
- **ASK-17 Hand-drawn buttons in the brief/quiz footer and the empty history state** [P2] src/clubhouse/styles/coachhelm-ask-v2.css:193
- **ASK-18 "What it knows" panel misuses classes and has a 12px Remove link** [P2] src/clubhouse/screens/coachhelm/chat/parts/KnowsPanel.tsx:72
- **ASK-19 Follow-up pills are 36px, and their ring disappears in dark** [P2] src/clubhouse/styles/coachhelm-thread.css:989–997
- **ASK-20 Version arrows are 28px and unstyled in the phone dock** [P2] src/clubhouse/styles/coachhelm-ask-v2.css:143–145
- **ASK-21 Hole strip marks under par by colour only, with cells about 33px wide** [P2] src/clubhouse/styles/coachhelm-ask-v2.css:169–173
- **ASK-22 Small type below the phone floor in the hole-strip header** [P2] src/clubhouse/styles/coachhelm-ask-v2.css
- **ASK-23 Quiz progress dots animate width** [P2] src/clubhouse/styles/coachhelm-ask-v2.css:179–181
- **ASK-24 Hard-coded colours in the user bubble with no dark override** [P2] src/clubhouse/styles/coachhelm-ask-v2.css:71
- **ASK-25 Live "Working" row shows a chevron that does nothing** [P2] src/clubhouse/screens/coachhelm/chat/parts/Steps.tsx
- **ASK-26 Home greeting uses the device's clock, not the team's** [P2] src/clubhouse/screens/coachhelm/chat/Home.tsx
- **ASK-27 Confirm card primary capsule hit area is about 42px** [P2] src/clubhouse/styles/coachhelm-ask-v2.css:101–103
- **ASK-28 `.ch-ak-mark { all: unset }` removes the focus ring from tappable visuals** [P2] src/clubhouse/styles/coachhelm-ask-v2.css

### Quick chat (23)
- **QC-1 Answers show raw markdown, and charts and evidence are silently dropped** [P1] src/clubhouse/shell/quick-chat/QuickChatSession.tsx:410
- **QC-2 Dark-mode overrides never match, so plan-bar text drops to 1.65–2.92:1** [P1] src/clubhouse/styles/quick-chat.css:172
- **QC-3 Failed, undone and cancelled receipts still show the green success disc** [P1] src/clubhouse/shell/quick-chat/TaskCard.tsx:253, :262
- **QC-4 Task header chip is unstyled text** [P1] src/clubhouse/shell/quick-chat/TaskCard.tsx:149–150, :159
- **QC-5 Calendar rail clips long events and overlaps existing blocks** [P1] src/clubhouse/shell/quick-chat/visuals/visuals.tsx:50
- **QC-6 Composer placeholder is 2.33:1 in Safari** [P1] src/clubhouse/styles/quick-chat.css:213–214
- **QC-7 Stream errors have no Try again, and failed steps get a green check** [P1] src/clubhouse/shell/quick-chat/QuickChatSession.tsx:296
- **QC-8 Composer doesn't grow past one line** [P1] src/clubhouse/shell/quick-chat/QuickChatSession.tsx:304–318
- **QC-9 iOS keyboard pan pushes the phone panel's header off-screen** [P1] src/clubhouse/shell/quick-chat/QuickChatSession.tsx:72–73
- **QC-10 "Open full chat" button looks live but does nothing before the first send** [P2] src/clubhouse/shell/quick-chat/QuickChatSession.tsx:224
- **QC-11 Live pill has no failed state and sits 2px off centre** [P2] src/clubhouse/shell/quick-chat/QuickChatProvider.tsx:125–135
- **QC-12 "Earlier today" row pops in and pushes the thread down** [P2] src/clubhouse/shell/quick-chat/QuickChatSession.tsx:252–266
- **QC-13 Long words overflow message bubbles** [P2] src/clubhouse/styles/quick-chat.css:73
- **QC-14 Plan bar segment labels are cut mid-letter** [P2] src/clubhouse/shell/quick-chat/visuals/PlanTask.tsx:115
- **QC-15 Panel corner radius is 20 where the spec says 32 on phone and 26 on desktop** [P2] src/clubhouse/styles/quick-chat.css:327, :329, :339, :340
- **QC-16 Desktop panel is a fixed 640px, taller than short windows** [P2] src/clubhouse/styles/quick-chat.css:340
- **QC-17 Tone chips stay visible at 40% after a message is sent** [P2] src/clubhouse/shell/quick-chat/task-motion.ts:82
- **QC-18 Cancelled task card has no visual change** [P2] src/clubhouse/shell/quick-chat/TaskCard.tsx:152
- **QC-19 No scroll lock behind the phone scrim** [P2] src/clubhouse/shell/quick-chat/QuickChatSession.tsx:210
- **QC-20 Escape is ignored while typing** [P2] src/clubhouse/shell/quick-chat/QuickChatSession.tsx:101–111
- **QC-21 Reduce Transparency setting in the app is ignored** [P2] src/clubhouse/styles/quick-chat.css:345
- **QC-22 Year coins use 11px type** [P2] src/clubhouse/styles/quick-chat.css:117, :123
- **QC-23 Preview has no error or failed-task fixture** [P2] src/clubhouse/preview/PreviewQuickChat.tsx:17

### Practice plan creation, Practice tab, Documents (33)
- **PP-1 The full plan prints a blank team, UTC times starting "now" and every player as "Player" on live data** [P0]  - `src/clubhouse/screens/coachhelm/plan/PlanCard.tsx:682-700`
- **PP-2 The plan card is a card nested inside the answer bubble** [P1]  - `src/clubhouse/screens/coachhelm/chat/parts/AnswerCard.tsx:90-91` - `src/clubhouse/styles/coachhelm-ask-v2.
- **PP-3 The practice plan page has no styles: 0 edge on phone, full-bleed on desktop, no title or Back** [P1]  - `src/clubhouse/routes/practice.tsx`
- **PP-4 "Edit in builder" goes to a read-only print page, not a builder** [P1]  - `src/clubhouse/screens/coachhelm/plan/PlanCard.tsx`
- **PP-5 Groups D–F draw an invisible disc: a white letter on no colour** [P1]  - `src/clubhouse/screens/coachhelm/plan/sheet/plan-sheet-model.ts`
- **PP-6 The full plan dock fires Publish / Save draft even when saving is off, and drops the "Comes with the Practice tab" copy** [P1] `src/clubhouse/screens/coachhelm/plan/PlanCard.tsx:721-735`
- **PP-7 On desktop a failed save shows nothing, and the Saved receipt with Undo is hidden** [P1]  - `src/clubhouse/screens/coachhelm/plan/PlanCard.tsx`
- **PP-8 The full plan title has no ellipsis and runs under the absolute "Ask" Back** [P1]  - `src/clubhouse/screens/coachhelm/plan/PlanCard.tsx:685-689`
- **PP-9 The full plan overlay ignores safe areas: the bar sits under the notch and the dock under the home bar** [P1] `src/clubhouse/styles/coachhelm-plan.css`: - `.ch-cpv-full{position:fixed;inset:0}` - `.fbar{min-height:56px}`
- **PP-10 Drill fan cards overflow the card and collide with "+N more"** [P1]  - `src/clubhouse/screens/coachhelm/plan/ReadPicture.tsx`
- **PP-11 Evidence rows print raw numbers with a hyphen-minus and an unclamped bar width** [P1]  - `src/lib/coachhelm/v3/chat/practice-draft.ts:90`
- **PP-12 Block sheet Cancel keeps the edits** [P1] `src/clubhouse/screens/coachhelm/plan/PlanCard.tsx`
- **PP-13 The desktop pane opens only after writing finishes; meanwhile the card is a bare header** [P1]  - `src/clubhouse/screens/coachhelm/plan/PlanCard.tsx:228-234`
- **PP-14 At 821–1100 the open pane squeezes the thread to about 140–400px** [P1] `src/clubhouse/styles/coachhelm-ask.css:1398-1408`
- **PP-15 PlanFormat Undo ignores failure and leaves the undone format's name as "Current format"** [P1] `src/clubhouse/screens/coachhelm/plan/format/PlanFormat.tsx`
- **PP-16 PlanFormat draws its own green bar (a local copy of the shell bar)** [P1]  - `src/clubhouse/screens/coachhelm/plan/format/PlanFormat.tsx`
- **PP-17 Dark-mode drill-kind dots fall below 3:1** [P2] `coachhelm-plan.css`
- **PP-18 Read-picture labels wrap instead of ellipsizing; cls axis labels collide and hang off the edge** [P2] `src/clubhouse/screens/coachhelm/plan/ReadPicture.tsx`: - `pd` labels are live `metric_label` in a fixed 64px
- **PP-19 The cal picture uses a fixed 5-column grid whatever the number of days** [P2] `ReadPicture.tsx` and `coachhelm-plan.css`
- **PP-20 Rotation grid and meta row don't adapt on phone** [P2] `src/clubhouse/screens/coachhelm/plan/sheet/PracticePlanSheet.tsx` and `coachhelm-plan.css`: - `.pp-rot` uses
- **PP-21 11px type in the sheet and tags on phone** [P2] `coachhelm-plan.css`: - `.ch-cp-sheet .gd` defined twice: line 6 is type-11-strong, line 29 is type-11
- **PP-22 Tap targets under 44 in the plan card and sheets** [P2] `coachhelm-plan.css`: - `.ch-cpv-sheet .ask-in button` 28×28 with no hit slop - `.refine button{min-height:36p
- **PP-23 "Saving…" sweep and the writing caret are static; the scan line has no CSS** [P2] `coachhelm-plan.css`: - `.sw2` and `.caret` have no animation; the only keyframes in the file are the old `ch-
- **PP-24 Folder names lack ellipsis in the save rows and the folder strip** [P2] `coachhelm-plan.css`
- **PP-25 Format page side padding stays 16 at ≥414** [P2] `coachhelm-plan.css`
- **PP-26 The intake's folded state is never drawn** [P2] `src/clubhouse/screens/coachhelm/plan/PlanIntake.tsx`
- **PP-27 Refine chips are hard-coded and team-specific** [P2] `PlanCard.tsx`
- **PP-28 Publish coins cap at 9 with no "+N"** [P2]  - `src/lib/coachhelm/v3/chat/practice-draft.ts:162` - `src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard
- **PP-29 Publish sample preview shows an empty green square for the app icon** [P2] `ConfirmCard.tsx`
- **PP-30 The player practice page has no empty state and no desktop width** [P2] `src/clubhouse/screens/coachhelm/plan/player/PlayerPractice.tsx`
- **PP-31 The three upload options do the same thing; "Take a photo" doesn't open the camera** [P2] `PlanFormat.tsx`
- **PP-32 The full plan overlay has no focus trap, no Esc, and no scroll containment** [P2] `coachhelm-plan.css`
- **PP-33 The folder-strip "flight" animation can't run on desktop** [P2] `PlanCard.tsx`

### Messages (19)
- **MSG-1 The phone inbox bar shows a compose key instead of the bell, plus a second New message key** [P1]  - `src/clubhouse/screens/messages/MessagesPhone.tsx:~177`
- **MSG-2 Reaction badges overlap the bubble above and run off-screen with several reactions** [P1]  - `src/clubhouse/styles/messages.css:5075-5086`
- **MSG-3 The phone composer is an opaque bar with a mismatched fade band, not the floating glass pill** [P1]  - `messages.css:2110-2121`: the old phone rule, `padding:8px 8px calc(8px + env(safe-area-inset-bottom))`, op
- **MSG-4 Group typing on phone names an arbitrary member when the typer is unknown** [P1] `MessagesPhone.tsx:683`
- **MSG-5 Details shows "Leave" on the team channel for anyone who didn't create it** [P1] `src/clubhouse/screens/messages/details-v2.tsx:151-156`
- **MSG-6 Hold menu uses its own 768 phone breakpoint and fixed insets** [P2] `src/clubhouse/screens/messages/hold-lift.tsx:50-55`
- **MSG-7 Thread bar sizes are off spec on phone, and the team channel bar has no flag** [P2] `MessagesPhone.tsx`
- **MSG-8 The Unread filter still shows the Pinned card, and pinned unread conversations drop out of "Unread"** [P2] `MessagesPhone.tsx:259-345`
- **MSG-9 Pins decide "team" by title; rows decide by channel** [P2] `MessagesPhone.tsx:337, 341`
- **MSG-10 Desktop redesign still uses the old ThreadBelow, not the jump key** [P2] `MessagesView.tsx:2239`
- **MSG-11 The details column opens with a raw 462ms grid-template-columns transition** [P2] `src/clubhouse/screens/messages/details-v2.tsx:337`
- **MSG-12 Photo tiles in Details have no loading or failure state** [P2] `details-v2.tsx:249`
- **MSG-13 Tap targets under 44: hold menu rows and wrapped poll foot links** [P2]  - `messages.css:4927-4935`
- **MSG-14 Four `.ch-msv-seeall` rules and two toast styles in one file** [P2]  - `messages.css:5300, 5333, 5431, 5438`
- **MSG-15 The reply quote is still the old elevated card** [P2] `messages.css:3049`
- **MSG-16 Own-reaction halo uses the page colour token from the old layout** [P2] `messages.css:5848`
- **MSG-17 Hard-coded ivory on the reaction chips of others' bubbles** [P2] `messages.css:805-807`
- **MSG-18 The mute menu on phone floats at a fixed 40% top, detached from its row** [P2]  - `messages.css:5288`
- **MSG-19 Inbox skeleton uses inline raw sizes, including 9 and 11px bars** [P2] `MessagesPhone.tsx:306-313`

### Root cause (Read) (18)
- **RC-1 The ⋯ "More" button opens an empty sheet for players** [P1] `src/clubhouse/screens/coachhelm/read/ReadPage.tsx:82`
- **RC-2 The More sheet is the wrong component and is missing its actions** [P1] `ReadPage.tsx:184-203`; Message link falls back to `href ?? '#'` at `:198`
- **RC-3 Round rows show a chevron but can't be tapped** [P1] `src/clubhouse/screens/coachhelm/read/cards.tsx:370-385`
- **RC-4 Rail player switcher popover is clipped by its own card** [P1] `src/clubhouse/screens/coachhelm/read/ReadsRail.tsx:328-340`
- **RC-5 Cause "arms" draw one 14px dot per hole, with no cap** [P1] `cards.tsx:151-155`
- **RC-6 "How it has moved" prints hyphen-minus and drops the decimal** [P1] `cards.tsx:296`
- **RC-7 Desktop action bar overflows the middle column between 1180 and about 1280** [P1] `ReadPage.tsx:142-156`
- **RC-8 Benchmark ladder labels still collide when three marks are close** [P1] `src/clubhouse/screens/coachhelm/read/ReadLadder.tsx:276-286`
- **RC-9 Ladder text size is set by CSS that scales and overrides the SVG's own size** [P2] `coachhelm-read.css:300-304`
- **RC-10 Moved card: the "Now" label is a date and runs off the right edge; the line is always amber** [P2] `cards.tsx:320-324`
- **RC-11 Hole chips: no cap and about 30px tall** [P2] `cards.tsx:186-199`
- **RC-12 Link chips are 36px with no hit area** [P2] `coachhelm-read.css:814-825`
- **RC-13 "Show newest 8 of N" shows all N** [P2] `cards.tsx:367`
- **RC-14 Rounds subline has no hole dots** [P2] `cards.tsx:377`
- **RC-15 Not-traced meter: the spec's ring and ten segments are drawn as N segments** [P2] `cards.tsx:205-211`
- **RC-16 Phone loading skeleton has no bar, so it jumps on load** [P2] `ReadPage.tsx:26-45`
- **RC-17 Under Reduce Motion the Assign spinner runs at 1ms per turn** [P2] `coachhelm-read.css:1101-1106`
- **RC-18 Hero figure tracking reset to 0** [P2] `coachhelm-read.css:1271-1273`

### Coach vs player (20)
- **CVP-1 The file's loading skeleton has no page edge, no top bar and no lens control, so the layout jumps on load** [P0] `src/clubhouse/screens/coachhelm/file/FileSkeleton.tsx`
- **CVP-2 The phone page edge is 16px on 414–429px phones, where the token says 20px** [P1] `src/clubhouse/styles/coachhelm-file.css:59-60`
- **CVP-3 The "Goal" label on the goal sparkline collides with the latest point and can clip above the chart** [P1] `src/clubhouse/screens/coachhelm/file/cards.tsx:273-314`
- **CVP-4 The correction and "why" buttons use undefined tokens, so their background and transition are dropped** [P1] `src/clubhouse/styles/coachhelm-file.css:245`
- **CVP-5 The lens Segmented and the Your week tabs are fixed at 300px with nowrap labels, so long first names overflow** [P1] `src/clubhouse/styles/coachhelm-file.css:304`
- **CVP-6 The sticky "Previewing X's screen" pill uses a magic 158px offset** [P1] `src/clubhouse/styles/coachhelm-file.css:224`
- **CVP-7 The plan stepper's undone ring is 1.24:1, and the dark check is 2.92:1** [P1] `src/clubhouse/styles/coachhelm-file.css:172-176`
- **CVP-8 The file runs on a private hex palette that duplicates the app tokens** [P1] `src/clubhouse/styles/coachhelm-file.css:3-30`
- **CVP-9 The "you" dot in the field strip is drawn 2px off its value, and dots are unclamped** [P1] `src/clubhouse/styles/coachhelm-file.css:210-211`
- **CVP-10 Strokes-gained bars are capped at ±1.0 with no overflow mark** [P2] `src/clubhouse/screens/coachhelm/file/cards.tsx:350-400`
- **CVP-11 The SG row's fixed 108px label column wraps "Around the green"** [P2] `src/clubhouse/styles/coachhelm-file.css:189, 198`
- **CVP-12 The card body is inset 20px while the card title is inset 16px, and the coach line and track rows bleed back to 16px** [P2] `src/clubhouse/styles/coachhelm-file.css:115`
- **CVP-13 The IntentSheet "picks" are hand-drawn chip buttons for single-choice groups** [P2] `src/clubhouse/screens/coachhelm/file/IntentSheet.tsx`
- **CVP-14 The retry and more buttons in the player file are hand-drawn** [P2] `src/clubhouse/screens/coachhelm/file/PlayerFile.tsx:106-118`
- **CVP-15 Three-across stat wells are nested inside cards on phone, and "Focuses assigned" wraps** [P2] `src/clubhouse/styles/coachhelm-file.css:133-137`
- **CVP-16 Off segments in the progress meter are 1.67:1 on the feature card** [P2] `src/clubhouse/styles/coachhelm-file.css:267`
- **CVP-17 The fold animates height and margin-top** [P2] `src/clubhouse/screens/coachhelm/file/PlayerFile.tsx:47-88`
- **CVP-18 Feature cards and read rows put buttons inside role="button"; badge widths throw the titles out of line** [P2] `src/clubhouse/screens/coachhelm/file/cards.tsx:47-133`
- **CVP-19 The Your week large title is hand-drawn instead of ui LargeTitle** [P2] `src/clubhouse/screens/coachhelm/file/YourWeek.tsx`
- **CVP-20 The Standing "behind" fill is a hard-coded amber gradient with no dark variant** [P2] `src/clubhouse/styles/coachhelm-standing.css:829`

### Stats (19)
- **STATS-1 Coach header on a player's Stats page sits 2px from the screen edge** [P0] `src/clubhouse/screens/stats/StatsPlayerPhoneShs.tsx:209-220`
- **STATS-2 Green-reading diagram labels collide with arcs whose thickness comes from the data** [P1] `src/clubhouse/screens/stats/OverviewZones.tsx:584-614`
- **STATS-3 GIR% figure in the Green diagram is 1.10:1 in dark mode** [P1] `src/clubhouse/screens/stats/OverviewZones.tsx:600`
- **STATS-4 Team chart's "Mean" label sits at a fixed left position and collides with the first point and the line** [P1] `src/clubhouse/screens/stats/ScoringFeatureChart.tsx:285-286`
- **STATS-5 Sticky Player/Team switch ignores the top safe area** [P1] `src/clubhouse/styles/stats-redesign.css:41-47`
- **STATS-6 Gain and loss pills on the green Scoring card use the paper tint, not the feature tint** [P1] `src/clubhouse/styles/stats-redesign.css:372-394`
- **STATS-7 Retry buttons and notices are hand-drawn instead of ui Button and InlineNotice** [P1] `src/clubhouse/screens/stats/StatsPlayerPhoneShs.tsx:324-354`
- **STATS-8 Summary cards nest buttons and a slider inside a role="link" section** [P1] `src/clubhouse/screens/stats/SummaryCard.tsx`
- **STATS-9 SVG axis text uses a Text Size type token, so labels get bigger than the chart's padding** [P1] `src/clubhouse/styles/stats-redesign.css:336-340`
- **STATS-10 Glance tiles stay three across on phone, and "Scrambling" overflows at 340px** [P2] `src/clubhouse/styles/stats-redesign.css:459-530`
- **STATS-11 "Needs 5 rounds" rail text is nowrap and runs into the next columns** [P2] `src/clubhouse/styles/stats-redesign.css:1657-1666`
- **STATS-12 Ribbon chart's reference label and figures share a fixed 40px gutter** [P2] `src/clubhouse/styles/stats-redesign.css:1176-1184`
- **STATS-13 Team "Who gains and loses" truncates names in a fixed 104px column** [P2] `src/clubhouse/styles/stats-redesign.css:1847-1855`
- **STATS-14 Tee-direction stack: Left and Right fills are 1.18:1 apart** [P2] `src/clubhouse/screens/stats/StatsPlayerPhoneShs.tsx:613-617, 633-646`
- **STATS-15 Score-mix bar uses raw px and weight 700, off the type scale** [P2] `src/clubhouse/styles/stats.css:7137-7139`
- **STATS-16 Skeleton doesn't match the loaded layout (fixed heights; coach header missing)** [P2] `src/clubhouse/screens/stats/ShsSkeleton.tsx`
- **STATS-17 Rounds ticker with a single round draws one full-width grey block** [P2] `src/clubhouse/screens/stats/MiniCharts.tsx`
- **STATS-18 Sticky switch's scroll shadow is raw rgb with no dark value** [P2] `src/clubhouse/styles/stats-redesign.css:1937-1948`
- **STATS-19 Desktop Stats still has around 50 raw px font declarations** [P2] `src/clubhouse/styles/stats.css`

### Motion across all lanes (45)
- **MOT-01 The Reduce Motion floor turns every lane's CSS 180ms fade into a hard cut** [P1] `src/clubhouse/styles/base.css:303-311`
- **MOT-02 Stats cards grow their bars, rings and marks the first time they scroll into view** [P1] `src/clubhouse/screens/stats/shs-motion.tsx:15-38`
- **MOT-03 Team hole fly-in runs on first paint and hides the stations for up to about 2.2s** [P1] `src/clubhouse/screens/coachhelm/team/team-motion.ts:13-90`
- **MOT-04 Both Homes grow the team-legs bars on every mount** [P1] `src/clubhouse/styles/home.css:4806` and `:5341`
- **MOT-05 Team "Working on" proposed rows pop in with an overshoot on every mount** [P1] `src/clubhouse/screens/coachhelm/team/Cards.tsx:143`
- **MOT-06 Read "Where it shows up" bars, missed dots and path nodes draw in when scrolled into view** [P1] `src/clubhouse/screens/coachhelm/read/cards.tsx:75-81`
- **MOT-07 Stats glides SG bars, rank dots and team legs by `left`/`width`, re-rendering React every frame** [P1]  - `src/clubhouse/screens/stats/SgBars.tsx:60-66`
- **MOT-08 Player file lens fold animates `height` and `margin-top` for 462ms** [P1] `src/clubhouse/screens/coachhelm/file/PlayerFile.tsx:46-90`
- **MOT-09 `ui/Swap` eases the frame's `height` on every swap; the lenses fire five at once** [P1] `src/clubhouse/ui/Swap.tsx:76-116`
- **MOT-10 Desktop sidebar fold animates `width`, `margin`, `padding` and `grid-template-columns`** [P1] `src/clubhouse/styles/shell.css:4047`
- **MOT-11 Team story timer restarts a full 5200ms after a press-and-hold while the bar resumes mid-way** [P1] `src/clubhouse/screens/coachhelm/team/Stories.tsx:124-129`
- **MOT-12 Desktop Team inspector slides out empty** [P1] `src/clubhouse/screens/coachhelm/team/TeamBoard.tsx:384-386`
- **MOT-13 Team sub-tab switches hard-cut on desktop, while Board, Ask and Standing crossfade** [P1] `src/clubhouse/screens/coachhelm/team/TeamBoard.tsx:360`
- **MOT-14 Ask's phone artifact / full-plan push is a hand-rolled CSS slide, not the shell push** [P1] `src/clubhouse/screens/coachhelm/chat/parts/Artifact.tsx:77`
- **MOT-15 Stats sticky window switch ignores the safe area, and its stuck shade is per-scroll React state** [P1] `src/clubhouse/styles/stats-redesign.css:41-47`
- **MOT-16 Animations off doesn't stop the hard-coded loops in Quick chat, Ask, Read and the file** [P1]  - Quick chat
- **MOT-17 `width` and `grid-template-rows` transitions in Ask's brief dots and Messages' poll composer** [P1] `src/clubhouse/styles/coachhelm-ask-v2.css:489`
- **MOT-18 Lane spinners stop turning under Reduce Motion** [P1]  - `src/clubhouse/styles/coachhelm-read.css:388`
- **MOT-19 Team Course trend draws and staggers its dots, including on first paint from a deep link** [P1] `src/clubhouse/screens/coachhelm/team/team-motion.ts:131-144`
- **MOT-20 Ask's Undo ring empties at once under Reduce Motion while Undo is still live** [P1] `src/clubhouse/styles/coachhelm-ask-v2.css:118`
- **MOT-21 Team station pulse ring scales the uncapped halo by 1.7, over the header and labels** [P1] `src/clubhouse/styles/coachhelm-team.css:285-300`
- **MOT-22 Framer and WAAPI fades pass `reduced` as "duration 0" instead of the 180ms fade, and Animations off still fades** [P2]  - `chTween(…, reduced)`
- **MOT-23 Stats window crossfade clones the whole sheet DOM on every window tap** [P2] `src/clubhouse/screens/stats/shs-motion.tsx:63-110`
- **MOT-24 The segmented thumb slides by a non-uniform scale and jumps under Reduce Motion** [P2] `src/clubhouse/lib/slide-plate.ts:62-68`
- **MOT-25 Literal durations and easings across Ask, the file, Quick chat, Read and Messages** [P2]  - `coachhelm-ask-v2.css:17,23,27,31,113`
- **MOT-26 Spring curves are played at durations they weren't sampled for** [P2]  - `coachhelm-ask-v2.css:27`
- **MOT-27 Every lane writes its own skeleton shimmer; two lane skeletons skip the route hold and fade** [P2]  - Cadences: Team `coachhelm-team.css:1423`
- **MOT-28 Plan cards and Ask brief cards replay their entry on every mount** [P2] `src/clubhouse/styles/coachhelm-plan.css:61-62`
- **MOT-29 Ask summary pills stagger by index** [P2] `src/clubhouse/styles/coachhelm-ask-v2.css:496`
- **MOT-30 Press tints are missing or late on Roster face cards and Player-file rows** [P2] `src/clubhouse/styles/roster.css:280-282`
- **MOT-31 Ask v2 and Practice plan controls have no press or hover states** [P2] `src/clubhouse/styles/coachhelm-ask-v2.css`
- **MOT-32 Read desktop "More" opens a centred dialog, not a popover from the ⋯** [P2] `src/clubhouse/screens/coachhelm/read/ReadPage.tsx:184-203`
- **MOT-33 Ask's desktop artifact pane pushes the chat column in one frame** [P2] `src/clubhouse/styles/coachhelm-ask-v2.css:134`
- **MOT-34 Team story viewer closes with no exit** [P2] `src/clubhouse/screens/coachhelm/team/Stories.tsx:118,163,286-291`
- **MOT-35 Spec'd crossfades and opens that hard-cut** [P2]  - `screens/coachhelm/plan/PlanCard.tsx:433`
- **MOT-36 Dead keyframe references in the Team CSS (ported design-page rules)** [P2] `src/clubhouse/styles/coachhelm-team.css`: - `:531` `animation: fadein`
- **MOT-37 Sheet exits run 260 CH_EASE where the lanes specify 280** [P2] `src/clubhouse/lib/dialog-lifetime.ts:164`
- **MOT-38 Toast exit moves with framer `y`, on the main thread** [P2] `src/clubhouse/ui/Toast.tsx:369`
- **MOT-39 Overshooting springs on data marks and avatars** [P2] `src/clubhouse/screens/messages/seen-by.tsx:112`
- **MOT-40 Team rows scale on press, against the house rule that rows tint** [P2] `src/clubhouse/styles/coachhelm-team.css:76-82`
- **MOT-41 Popovers with an entry but no exit (class awareness, Ask picker)** [P2] `src/clubhouse/styles/class-awareness.css:180-189`
- **MOT-42 Read scroll shade sits at a fixed `top: 110px`** [P2] `src/clubhouse/styles/coachhelm-read.css:122-126`
- **MOT-43 Stats team "chosen leg" plate assumes 44px rows and drifts under Text Size** [P2] `src/clubhouse/styles/stats.css:4733-4746`
- **MOT-44 Classes import scan travels a fixed 130px over a box of any height** [P2] `src/clubhouse/styles/classes.css:1015-1031`
- **MOT-45 Quick chat step band keeps `will-change: transform` on for as long as a step runs** [P2] `src/clubhouse/styles/quick-chat.css:90`

### Design fidelity and features: Team view, Root cause, Coach vs player, Brief (41)
- **FID-TEAM-1 No Try again anywhere on the Team view in production** [P1] routes/coachhelm.tsx:85
- **FID-RC-1 Read summary card (S-READ-BOARD) only exists in the preview** [P1] read/ReadSummaryCard.tsx
- **FID-RC-2 S-READ-BOARD actions row and dismissed state not built** [P1] read/ReadSummaryCard.tsx
- **FID-RC-3 Cleared, contradicted and under-review read states missing** [P1] read/ReadPage.tsx
- **FID-CVP-1 S-LIST push from the board rows into the player file not built** [P1] none on team/TeamBoard.tsx or CoachBoard.tsx; only file/PlayerFile.tsx:344 rail rows carry `data-ch-hf-open`
- **FID-TEAM-2 Switch reads "Board / Ask" once you are on Ask** [P1] chat/Ask.tsx:78, :343; chat/AskSkeleton.tsx:21
- **FID-TEAM-3 Desktop context line hidden; scope text and switch not in the glass bar** [P1] styles/shell.css:4387-4391
- **FID-TEAM-4 Track record never shows its big figure** [P1] team/Cards.tsx:186-189
- **FID-TEAM-5 Read sheet says "Assigning… / Assigned as {first}'s focus"; design says propose** [P1] team/panels.tsx ReadPanel
- **FID-TEAM-6 Story viewer does not pause on keyboard focus and has no focus trap** [P1] team/Stories.tsx StoryViewer
- **FID-TEAM-7 Story action reloads the whole page instead of opening the read in place** [P1] team/TeamBoard.tsx:194
- **FID-RC-4 Reads rail player switcher leaves the read page** [P1] read/ReadsRail.tsx:19-31
- **FID-CVP-2 Your week feature card can show Accept / Decline for an unrelated proposal** [P1] file/YourWeek.tsx:49
- **FID-CVP-3 Undoing an older dismissal does nothing visible** [P1] file/cards.tsx ReadsCard ~:440-470
- **FID-TEAM-8 Context line says "1 players" and counts stale reads as open** [P2] team/TeamBoard.tsx:199; data/coachhelm-team-shape.ts:168
- **FID-TEAM-9 Team/Ask switch dimensions off spec** [P2] ui/Segmented via styles/controls.css:4-37
- **FID-TEAM-10 Desktop panel padding 20 vs 22; phone sheet bottom 48 vs 72** [P2] styles/coachhelm-team.css:1708
- **FID-TEAM-11 Course sheet missing story link and per-row delta** [P2] team/panels.tsx CourseSheet
- **FID-TEAM-12 Story desk panel header has no coin** [P2] team/Stories.tsx:299-318
- **FID-TEAM-13 One-slot stations show only "+N", hiding every initial** [P2] team/hole-geometry.ts:52-64
- **FID-TEAM-14 "No Tour figure for single holes" shows on every read without a Tour figure** [P2] team/panels.tsx:68
- **FID-TEAM-15 Read sheet "Ask about this" uses secondary, design says ghost; Modal titled "Details"** [P2] team/panels.tsx ReadPanel; team/TeamBoard.tsx:380
- **FID-TEAM-16 Spot rows include players with no figure; failed spot has no retry** [P2] team/SpotCard.tsx
- **FID-TEAM-17 Huddle draws missing stations on the Tour line** [P2] team/Huddle.tsx:39-40
- **FID-TEAM-18 Rungs with no bar render an empty track** [P2] team/Cards.tsx RecordCard
- **FID-TEAM-19 Team view and Your week main lack the view-switch enter hook** [P2] team/TeamBoard.tsx:360; file/YourWeek.tsx:39, :68
- **FID-TEAM-20 Course card renders both layouts into the DOM** [P2] team/CourseCard.tsx; styles/coachhelm-team.css:1772
- **FID-TEAM-21 Dead `.lt h2` rule** [P2] styles/coachhelm-team.css:94
- **FID-TEAM-22 Brief unreachable from the Team view** [P2] routes/coachhelm.tsx:85
- **FID-TEAM-23 Brief frame differs from Team, and its skeleton jumps** [P2] views/CoachBrief.tsx:25-50; styles/coachhelm.css:55; routes/coachhelm.tsx:301-306
- **FID-RC-5 Thrown feed uses CH-13866; spec says CH-13860** [P2] read/ReadPage.tsx:91
- **FID-RC-6 Part-failure banner only at 2+ failures, above the headline, middle sentence dropped** [P2] read/ReadPage.tsx:107-118
- **FID-RC-7 Dismissed notice inside the Do card, and stance chip never says "Dismissed"** [P2] read/cards.tsx:33-70
- **FID-RC-8 How sure word in meta style, spec 20/1.1/600** [P2] read/cards.tsx
- **FID-RC-9 Hand-drawn icon button** [P2] read/ReadPage.tsx:153
- **FID-RC-10 Practice link never wired** [P2] read/ReadPage.tsx:126
- **FID-CVP-4 File back label "Back"; spec "CoachHelm"** [P2] file/PlayerFile.tsx:129, :329
- **FID-CVP-5 Lens Accept / Decline use disabled** [P2] file/PlayerFile.tsx:207-212
- **FID-CVP-6 Your week feature card uses ProposalRow, not the designed buttons** [P2] file/YourWeek.tsx:53-55
- **FID-CVP-7 Player board loading uses the old board skeleton** [P2] routes/coachhelm.tsx:336
- **FID-CVP-8 File rail drawn whenever roster is present, and dead `void isEarly`** [P2] file/PlayerFile.tsx:335, :270

### Design fidelity and features: Classes, Roster, Home, Stats (17)
- **FID-STATS-1 Every Stats card is radius 16 with 12pt top padding and an 8pt head gap; design is 18 / 14 / 10** [P1] `styles/stats-redesign.css:136-145`
- **FID-STATS-2 "What changed" sentence has wrong grammar and raw metric labels** [P1] `screens/stats/StatsPlayerPhoneShs.tsx:438-447`
- **FID-STATS-3 Goals detail has no hero, and the coach empty state points to a section that isn't there** [P1] `screens/stats/StatsPlayerPhoneShs.tsx:1099-1162`
- **FID-STATS-4 Try again shows no skeleton and has no busy state you can see; it stays dead if the refresh brings back the same data (extends STATS-7)** [P1] `screens/stats/StatsPlayerPhoneShs.tsx:324-354`
- **FID-STATS-5 Back from a round opened in Stats goes to the Rounds list (player) or team Stats (coach)** [P1] `shell/nav.ts:364-365`
- **FID-STATS-6 Section names are weight 600, wdth 96 and 28pt below the card above; design is 700, wdth 92 and 30pt** [P2] `styles/stats-redesign.css:125-131`
- **FID-STATS-7 All condensed figures use wdth 96; the spec sets wdth 92 everywhere** [P2] `styles/stats-redesign.css`
- **FID-STATS-8 Window switch bar, filter button and sheet bottom are each off by 2 to 8px** [P2] `styles/stats-redesign.css:41-47`
- **FID-STATS-9 First run (no rounds) still shows the window switch and filter** [P2] `screens/stats/StatsPlayerPhoneShs.tsx:223-229`
- **FID-STATS-10 Scoring chart legend reads "Par" without the par value** [P2] `screens/stats/StatsPlayerPhoneShs.tsx:428-430`
- **FID-STATS-11 Coach player Stats has no "Player stats ⌄" switcher, and Team always goes back to team Stats** [P2] `screens/stats/StatsPlayerPhoneShs.tsx:201`
- **FID-STATS-12 Team "The round" meta and Team scoring hero caption drop the comparison and window words** [P2] `screens/stats/StatsTeamPhoneShs.tsx:340`
- **FID-STATS-13 Team stats reads Text Size once and never updates** [P2] `screens/stats/StatsTeamPhoneShs.tsx:44-46`
- **FID-STATS-14 Your game card paddings are 2px short in four places** [P2] `styles/stats-redesign.css:2049-2056`
- **FID-STATS-15 Your game: few-rounds note lacks its lead, failed hides the empty body, and the pill adds "SG"** [P2] `screens/home/PlayerGame.tsx:461-466`
- **FID-STATS-16 Player Home green top has no avatar or next-event line, and Your game sits far below it (extends CRH-19)** [P2] `screens/home/PlayerHomePhone.tsx:52` and the section order after it
- **FID-CRH-1 Player Home's bar only changes when the Stats flag is also on (extends CRH-19)** [P2] `styles/shell.css:4396`

### Design fidelity and features: Ask, Quick chat (44)
- **FID-ASK-1 Every Ask create flow is a generic facts card: no draft visual, no Worked out pills, no date tile** [P0] src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx
- **FID-ASK-2 Announcement, poll, task and drill flows promised for Ask are not built; board is text only** [P0] src/lib/coachhelm/v3/chat/create-tools.ts:386-387
- **FID-ASK-3 No server writes `data-artifact`, so artifact cards, pane, versions and why popover never appear** [P0] src/clubhouse/screens/coachhelm/chat/parts/artifacts.ts:22
- **FID-ASK-4 Artifact pane footer has only "Edit in builder"; Save draft and Publish are missing** [P1] src/clubhouse/screens/coachhelm/chat/parts/Artifact.tsx:203-213
- **FID-ASK-5 The Ask tab's message flow sends as the coach instead of handing off to the composer** [P1] src/lib/coachhelm/v3/chat/create-tools.ts:355-375
- **FID-ASK-6 Player Ask can't be reached from the player's navigation** [P1] src/clubhouse/screens/coachhelm/coachhelm-views-shape.ts:16
- **FID-ASK-7 "Ask about this" opens a blank Ask: the `q` it sends is never read** [P1] src/clubhouse/screens/coachhelm/chat/ask-links.ts
- **FID-ASK-8 The event landing surface says "Wednesday" for every event** [P1] src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx:40
- **FID-ASK-9 The landing surface draws only the new row, with no real neighbouring rows** [P1] src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx:139-160
- **FID-ASK-10 Ask's held receipt has no Open, and its failed receipt has no Try again** [P1] src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx:249-268
- **FID-ASK-11 Ask's Told row is a text line, with no coins or seen dots** [P1] src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx:302-313
- **FID-ASK-12 Player out state: the composer is removed, and the card has the wrong copy and parts** [P1] src/clubhouse/screens/coachhelm/chat/Ask.tsx:379-391; src/clubhouse/screens/coachhelm/chat/parts/Allowance.tsx
- **FID-ASK-13 The moment chip flips to "Added" only after the 8s hold, not at the receipt** [P1] src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx:107
- **FID-ASK-14 Player "Request more" sends at once, with no confirm, no ring and no told row** [P1] src/clubhouse/screens/coachhelm/chat/parts/Allowance.tsx:36-66; src/app/golf/actions/coachhelm-ask-credits.ts:
- **FID-ASK-15 The allowance meter stays green when low** [P1] src/clubhouse/styles/coachhelm-ask-v2.css:220
- **FID-ASK-16 Miss pattern, putt profile and season compare are missing half their drawing** [P1] src/clubhouse/screens/coachhelm/chat/visual/blocks.tsx
- **FID-QC-1 Every Quick chat task except event, message, qualifier and plan renders as an unfinished generic card** [P1] src/clubhouse/shell/quick-chat/TaskCard.tsx:27-31
- **FID-QC-2 A partial receipt shows as a full success** [P1] src/clubhouse/shell/quick-chat/TaskCard.tsx:40-47
- **FID-QC-3 The Told row is text only, though the coin CSS is there** [P1] src/clubhouse/shell/quick-chat/TaskCard.tsx:245-249; src/clubhouse/styles/quick-chat.css:117-122, :233-234
- **FID-QC-4 Done steps keep their present-tense label and drop the fact** [P1] src/clubhouse/shell/quick-chat/QuickChatSession.tsx:385-395
- **FID-QC-5 The composer has no + or mic button, though both are styled** [P1] src/clubhouse/shell/quick-chat/QuickChatSession.tsx:303-328; src/clubhouse/styles/quick-chat.css:317-319, :333
- **FID-QC-6 The qualifier told line is hard-coded, and its deadline is always empty** [P1] src/clubhouse/shell/quick-chat/TaskCard.tsx:56
- **FID-ASK-17 Read chip popover has no "Open in Stats" link** [P2] src/clubhouse/screens/coachhelm/chat/parts/ReadChip.tsx
- **FID-ASK-18 Brief card: no header icon tile, Skip and Next footer drifts, and folded "Change answers" never resends** [P2] src/clubhouse/screens/coachhelm/chat/parts/BriefCard.tsx
- **FID-ASK-19 The v2 thread still shows the old "Reading your program" placeholder before the first step** [P2] src/clubhouse/screens/coachhelm/chat/Thread.tsx:299-309
- **FID-ASK-20 The tool card skeleton swaps for the chart with no crossfade** [P2] src/clubhouse/screens/coachhelm/chat/parts/ToolCard.tsx
- **FID-ASK-21 The confirm header falls back to raw action text for goal, note, lineup and task** [P2] src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx
- **FID-ASK-22 Answer card and steps spacing is off by 2px throughout** [P2] src/clubhouse/styles/coachhelm-ask-v2.css:15, :18, :26, :32
- **FID-ASK-23 Confirm card geometry drifts on nine properties** [P2] src/clubhouse/styles/coachhelm-ask-v2.css:86, :87, :91, :93, :98, :102, :106, :119
- **FID-ASK-24 Citation popover, sources and follow-up chip spacing drifts** [P2] src/clubhouse/styles/coachhelm-ask-v2.css:44, :59, :60, :65, :69, :71
- **FID-ASK-25 Artifact card, pane and brief spacing drifts** [P2] src/clubhouse/styles/coachhelm-ask-v2.css:126, :133, :135, :139, :140, :175, :182, :185, :194
- **FID-ASK-26 Dark accent, card and bubble tokens don't match the Ask palette** [P2] src/clubhouse/styles/tokens.css:1083
- **FID-ASK-27 Home: the greeting is 28 not 26, gaps are 2px short, and player focus rows are always amber** [P2] src/clubhouse/styles/coachhelm-ask-v2.css:268, :280, :292, :326; src/clubhouse/screens/coachhelm/chat/Home.tsx
- **FID-ASK-28 The request-more email names the team, not the player who asked** [P2] src/app/golf/actions/coachhelm-ask-credits.ts:55
- **FID-ASK-29 Meter and out card geometry** [P2] src/clubhouse/styles/coachhelm-ask-v2.css:197-229
- **FID-ASK-30 The Knows panel error is styled as the allowance meter** [P2] src/clubhouse/screens/coachhelm/chat/parts/KnowsPanel.tsx:76
- **FID-QC-7 The live pill is 2px off on radius and padding, with the wrong type step** [P2] src/clubhouse/styles/quick-chat.css:374
- **FID-QC-8 The panel sheet body is 12px inset, not 14** [P2] src/clubhouse/styles/quick-chat.css:332
- **FID-QC-9 The header padding, gap and mark tile don't match the spec** [P2] src/clubhouse/styles/quick-chat.css:52, :55, :57
- **FID-QC-10 The request bubble and answer text are a half step too large** [P2] src/clubhouse/styles/quick-chat.css:71, :72
- **FID-QC-11 Steps, step summary and task header spacing is 2px short** [P2] src/clubhouse/styles/quick-chat.css:74, :92, :95, :96, :101, :104
- **FID-QC-12 "Stopped" bleeds into earlier finished turns** [P2] src/clubhouse/shell/quick-chat/QuickChatSession.tsx:49
- **FID-QC-13 Coins are 24px with 11px type, and the plan segment ink is hard-coded** [P2] src/clubhouse/styles/quick-chat.css:117, :168, :172
- **FID-QC-14 The key's accent colours are hard-coded hex** [P2] src/clubhouse/styles/quick-chat.css:347-348

### Design fidelity and features: Practice, Documents, Messages (39)
- **FID-PRAC-1 Practice tab, builder, drill bank, groups, templates, print studio, Run view and Calendar Plan row do not exist** [P0] src/app/golf/(dashboard)/dashboard/practice/
- **FID-PRAC-2 A plan in Documents cannot be opened** [P0] src/clubhouse/data/hub.ts:905
- **FID-PRAC-3 The plan format is saved but never used** [P1] src/app/golf/actions/coachhelm-plan-format.ts:43
- **FID-PRAC-4 Undoing a new format deletes the old one** [P1] src/app/golf/actions/coachhelm-plan-format.ts:43
- **FID-PRAC-5 Format upload is filed in "Practice plans" and each retry leaves a document behind** [P1] src/clubhouse/screens/coachhelm/plan/format/PlanFormat.tsx:75
- **FID-PRAC-6 No Share PDF anywhere, and no Print in Ask's full plan** [P1] src/clubhouse/screens/coachhelm/plan/PlanPageActions.tsx
- **FID-PRAC-7 The player can't open the full plan, print it, or reach it from Documents** [P1] src/clubhouse/data/practice-plan.ts:97
- **FID-PRAC-8 Publish: team chat post has no link, Told row never shows, no Seen by** [P1] src/lib/coachhelm/v3/chat/practice-draft.ts:170
- **FID-PRAC-9 Publish failed says "Nothing was saved." with no Try again, and the published Documents strip is missing** [P1] src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx:279
- **FID-PRAC-10 Plan format on phone draws two green bars (extends PP-16)** [P1] src/clubhouse/screens/coachhelm/plan/format/PlanFormat.tsx:118-124
- **FID-PRAC-11 The random drill kind is ochre in light and dark, not plum (corrects PP-17)** [P1] src/clubhouse/styles/coachhelm-plan.css:103
- **FID-PRAC-12 Plan format and plan page check different flags** [P1] src/app/golf/(dashboard)/dashboard/practice/format/page.tsx:7
- **FID-PRAC-13 Plan format's error page sends "home" to a route that doesn't exist** [P1] src/app/golf/(dashboard)/dashboard/practice/format/error.tsx:20
- **FID-PRAC-14 Documents plan rows look and act like files** [P1] src/clubhouse/data/hub.ts:905
- **FID-MSG-1 Pins sync is built but held; pins live on one device** [P1] src/clubhouse/screens/messages/use-conversation-pins.ts:97, :119
- **FID-PRAC-15 Sheet headings drop the player count and total time** [P2] src/clubhouse/screens/coachhelm/plan/sheet/PracticePlanSheet.tsx
- **FID-PRAC-16 Sheet foot copy is wrong and the page count is hard-coded** [P2] src/clubhouse/screens/coachhelm/plan/sheet/PracticePlanSheet.tsx:122
- **FID-PRAC-17 Bring uses "×", Notes draws 3 lines, empty Bring shows a bare heading** [P2] src/clubhouse/screens/coachhelm/plan/sheet/plan-sheet-model.ts:89
- **FID-PRAC-18 Why lines don't mark losses in amber** [P2] src/clubhouse/screens/coachhelm/plan/sheet/PracticePlanSheet.tsx
- **FID-PRAC-19 Print margin and page size differ from spec; no repeating header** [P2] src/clubhouse/screens/coachhelm/plan/PrintPlan.tsx:14
- **FID-PRAC-20 Full plan sheet metrics drift on almost every rule** [P2] src/clubhouse/styles/coachhelm-plan.css:1-82 vs redesign/coachhelm-practice.html:904-974 - What's wrong
- **FID-PRAC-21 Plan format rows, hints and receipt drift** [P2] src/clubhouse/screens/coachhelm/plan/format/PlanFormat.tsx
- **FID-PRAC-22 Format "found" view shows 3 of 5 sections and no summary line; no More key** [P2] src/clubhouse/screens/coachhelm/plan/format/PlanFormat.tsx
- **FID-PRAC-23 Player plan stops and chips drift** [P2] src/clubhouse/screens/coachhelm/plan/player/PlayerPractice.tsx; src/clubhouse/styles/coachhelm-plan.css:1347-1
- **FID-PRAC-24 Group faces are 24 px and leave out the viewer** [P2] src/clubhouse/screens/coachhelm/plan/player/PlayerPractice.tsx:58
- **FID-PRAC-25 Plan page loading and error aren't Clubhouse screens** [P2] src/app/golf/(dashboard)/dashboard/practice/plan/[planId]/loading.tsx
- **FID-PRAC-26 Drill bank is capped at 20 and library drills all read as "skill"** [P2] src/lib/coachhelm/v3/chat/practice-reads.ts:24
- **FID-PRAC-27 "?from=coachhelm" is passed and ignored** [P2] src/clubhouse/screens/coachhelm/plan/PlanCard.tsx:395
- **FID-PRAC-28 Unnamed groups fall back to "Player"** [P2] src/clubhouse/screens/coachhelm/plan/sheet/plan-sheet-model.ts
- **FID-MSG-2 Pinned card padding, radius and gaps drift** [P2] src/clubhouse/styles/messages.css:4241-4330 - What's wrong
- **FID-MSG-3 Pin faces: direct 64 with 22 initials, group 62** [P2] src/clubhouse/screens/messages/MessagesPhone.tsx:339
- **FID-MSG-4 Group pins show a last-message bubblet** [P2] src/clubhouse/screens/messages/MessagesPhone.tsx:328
- **FID-MSG-5 HelloCard face is 64, spec 72** [P2] src/clubhouse/screens/messages/HelloCard.tsx:13
- **FID-MSG-6 New message suggestion faces are 36, spec 32** [P2] src/clubhouse/screens/messages/MessagesPhone.tsx:1435
- **FID-MSG-7 "Players you haven't messaged" lists coaches too** [P2] src/clubhouse/screens/messages/NewMessagePane.tsx:34
- **FID-MSG-8 "Message the team" does the same as "Start a conversation" on phone** [P2] src/clubhouse/screens/messages/MessagesPhone.tsx:319
- **FID-MSG-9 Attach tiles use the wrong fills; the attach tokens don't exist** [P2] src/clubhouse/styles/messages.css:4798-4810
- **FID-MSG-10 Switch off-ring is #8e8a80, spec #8F8B81** [P2] src/clubhouse/styles/tokens.css:683
- **FID-MSG-11 First-run illustration has hard-coded colours** [P2] src/clubhouse/screens/messages/MessagesFirstRun.tsx:26-28

### iPhone: shell, Classes, Roster, Home, Stats (36)
- **MOB-SHELL-1 Modal and FormSheet keyboard rules never run in Safari, so Save sits under the keyboard** [P1] `src/clubhouse/styles/controls.css:617-625`
- **MOB-SHELL-2 The new-version bar on phone sits under the home indicator and covers the Resume pill and composers** [P1] `src/components/providers/StaleDeploymentRecoveryScript.tsx:48`
- **MOB-SHELL-3 The PhoneBar back label is never shortened and runs into the centred title** [P1] `src/clubhouse/ui/PhoneBar.tsx`
- **MOB-SHELL-4 Toasts land on top of the Resume round pill** [P1] `src/clubhouse/styles/shell.css:1295-1299`
- **MOB-SHELL-5 The offline banner sticks at the desktop top-bar height, under or below the phone bar** [P1] `src/clubhouse/styles/shell.css:1842-1856`
- **MOB-SHELL-6 Text Size jumps after hydration because the type scale is not set before paint** [P1] `src/clubhouse/lib/dynamic-type.ts`
- **MOB-SHELL-7 Overscroll and status-area colour differ from the green bar and the page** [P1] `src/clubhouse/shell/ClubhouseFrame.tsx:307-353`
- **MOB-SHELL-8 Landscape phones get the desktop sidebar shell** [P1] `src/clubhouse/lib/use-phone.ts`
- **MOB-SHELL-9 The home-screen icon renders on black because it is a transparent 512px logo** [P1] `src/app/layout.tsx:64`
- **MOB-SHELL-10 The Resume pill's Discard X is a 36px target 4px from Resume** [P1] `src/clubhouse/styles/shell.css:2845-2850`
- **MOB-CRH-1 The roster player profile note box is in a screen that ignores the keyboard** [P1] `src/clubhouse/screens/roster/RosterPhoneCrh.tsx:274-296`
- **MOB-CRH-2 Home first-run quick-add chips are 32px with 6px gaps** [P1] `src/clubhouse/styles/home.css:1143-1162`
- **MOB-STATS-1 The goal sheet's number pad has no minus key, so negative strokes-gained targets cannot be typed** [P1] `src/clubhouse/screens/stats/GoalSheet.tsx:188-200`
- **MOB-STATS-2 The big-text layout misses XXL, so the window switch overflows under the filter at 320** [P2] `src/clubhouse/screens/stats/StatsPlayerPhoneShs.tsx:89-99`
- **MOB-STATS-3 The window switch fades its last segment even when that segment is selected** [P2] `src/clubhouse/styles/stats-redesign.css:59-65`
- **MOB-STATS-4 Starting a scroll on the scoring chart flashes a readout and fires a haptic** [P2] `src/clubhouse/screens/stats/ScoringFeatureChart.tsx:153-167`
- **MOB-STATS-5 The leg-bars "open" link keeps its hover underline after a tap** [P2] `src/clubhouse/styles/stats.css:7642`
- **MOB-SHELL-11 Smaller Text Sizes are ignored and Text Size is never re-read** [P2] `src/clubhouse/lib/dynamic-type.ts`
- **MOB-SHELL-12 Bar side padding stays at 16px when the page edge is 20px (≥414)** [P2] `src/clubhouse/styles/shell.css:1242`
- **MOB-SHELL-13 The route loading bar draws under the status bar in standalone** [P2] `src/clubhouse/styles/shell.css:2069-2073`
- **MOB-SHELL-14 The bell count badge has an ivory ring on the green bar and fixed 11px text** [P2] `src/clubhouse/styles/shell.css:1618-1630`
- **MOB-SHELL-15 The dock and toasts use 12px side edges** [P2] `src/clubhouse/styles/shell.css:2778-2790`
- **MOB-SHELL-16 Bell stack pills and drag handle are small, with 2px between hit areas** [P2] `src/clubhouse/styles/shell.css:3512-3600`
- **MOB-SHELL-17 There is no pull to refresh in the home-screen web app** [P2] `src/clubhouse/shell/PullToRefresh.tsx`
- **MOB-SHELL-18 iOS scroll indicators are hidden in every scroller** [P2] `src/clubhouse/styles/base.css`
- **MOB-SHELL-19 No launch image, and the manifest colours belong to another palette** [P2] `src/app/layout.tsx:67-70`
- **MOB-SHELL-20 The refresh-flag and hero edge colours differ from the surfaces they extend** [P2] `src/clubhouse/styles/shell.css:4360-4365`
- **MOB-SHELL-21 The pushed-screen scroll lock can make Safari's toolbar jump** [P2] `src/clubhouse/shell/PhoneScreen.tsx`
- **MOB-SHELL-22 The search field autocorrects and capitalises names** [P2] `src/clubhouse/ui/SearchField.tsx`
- **MOB-CRH-3 The roster sheet scroller uses a fixed 20px edge on small phones** [P2] `src/clubhouse/styles/roster.css:1404-1410`
- **MOB-CRH-4 The Classes sticky day header is the wrong colour and not full width** [P2] `src/clubhouse/styles/classes.css:2149-2157`
- **MOB-CRH-5 The Home team scoring figure is a fixed 44px** [P2] `src/clubhouse/styles/home.css:1414`
- **MOB-CRH-6 The Home score row is fixed at 46px and clips at XXXL** [P2] `src/clubhouse/styles/home.css:1593-1600`
- **MOB-CRH-7 Home's clash warning explains itself only on hover** [P2] `src/clubhouse/screens/home/HomePhone.tsx:318-320`
- **MOB-CRH-8 Return in ClassForm saves the whole form instead of moving to the next field** [P2] `src/clubhouse/screens/classes/ClassForm.tsx:167-168`
- **MOB-CRH-9 Short CRH pages show a two-tone band below the content** [P2] `src/clubhouse/styles/home.css:4515` and `classes.css:2733`

### iPhone: Team view, Root cause, Coach vs player (29)
- **MOB-TEAM-1 Team and file read sheets lose their height cap: tall sheets run off the bottom of the screen and can't scroll** [P0] src/clubhouse/styles/coachhelm-team.css:1805-1809
- **MOB-CVP-1 Set-intent note is 15px, so Safari zooms on focus, the keyboard is never detected, and Save sits under the keyboard (extends CVP-13)** [P1] src/clubhouse/styles/coachhelm-file.css:285
- **MOB-CVP-2 `.ch-hf` paints the sheet's `<dialog>`: square page-coloured corners behind the rounded sheet and a 48px band under it** [P1] src/clubhouse/styles/coachhelm-file.css:57
- **MOB-TEAM-2 Story viewer press-and-hold selects text and opens the loupe; vertical drags scroll the board behind and cancel the hold** [P1] src/clubhouse/screens/coachhelm/team/Stories.tsx:140-149
- **MOB-TEAM-3 Story body has no overflow path: at 320x568 or XXL the Back / Next footer is pushed off the screen** [P1] coachhelm-team.css:1303-1310
- **MOB-TEAM-4 Spot and Player bar rows are 30px tap targets with 12px gaps** [P1] coachhelm-team.css:397-406
- **MOB-TEAM-5 Spot row names truncate after about 7 characters** [P1] coachhelm-team.css:400-406
- **MOB-TEAM-6 At 320 the hole SVG shrinks to 0.81: station labels about 10.5px, coin initials about 9px, coins about 18px (extends TEAM-6)** [P1] src/clubhouse/screens/coachhelm/team/TeamHole.tsx:35
- **MOB-TEAM-7 Phone landscape (844x390) gets the desktop Team layout, squeezed into about 486px** [P1] src/clubhouse/lib/use-phone.ts
- **MOB-TEAM-8 Desktop inspector in landscape ignores the right and bottom safe areas and has no scrim** [P1] coachhelm-team.css:1645-1658, :1813-1817
- **MOB-RC-1 Phone landscape (844x390) gives the Read page's middle column about 216px (extends RC-7)** [P1] src/clubhouse/styles/coachhelm-read.css:1080-1100
- **MOB-CVP-3 Phone landscape (844x390): the desktop file header leaves the player's name about 50px** [P1] src/clubhouse/styles/coachhelm-file.css:293
- **MOB-TEAM-9 Coach Brief "Open" buttons are 30px tall** [P1] src/clubhouse/screens/coachhelm/views/CoachBrief.tsx:65
- **MOB-TEAM-10 Read sheet correction chips are 36px; the 44px hit area exists only in the file's sheet** [P2] src/clubhouse/styles/coachhelm.css:1833-1930
- **MOB-RC-2 Read page correction chips and "Change" are 36px** [P2] src/clubhouse/styles/coachhelm-read.css:947-1000
- **MOB-TEAM-11 "Open the full read" and "Open {first}'s page" links are about 32px tall** [P2] coachhelm-team.css:1206-1213
- **MOB-TEAM-12 Story tiles snap flush against the card edge and chain overscroll to the page** [P2] coachhelm-team.css:136-146
- **MOB-TEAM-13 Course sheet rows: minimum column widths exceed the sheet at 320, so the value clips** [P2] coachhelm-team.css:745-753
- **MOB-TEAM-14 Story action scrolls the Working card under the phone top bar** [P2] src/clubhouse/screens/coachhelm/team/TeamBoard.tsx:189-195
- **MOB-TEAM-15 Coach Brief section links land under the phone bar: scroll-margin is 72px, the bar is about 100px** [P2] src/clubhouse/styles/coachhelm-brief.css:114-116
- **MOB-TEAM-16 Coach Brief goal player names are 13px inline links about 18px tall** [P2] src/clubhouse/styles/coachhelm-brief.css:132-137
- **MOB-TEAM-17 Chosen station resets to the biggest leak after going back from a player or read** [P2] src/clubhouse/screens/coachhelm/team/TeamBoard.tsx:161
- **MOB-TEAM-18 The "+N" coin has a click handler but no role, focus or label, and is about 18–22px** [P2] src/clubhouse/screens/coachhelm/team/TeamHole.tsx:100
- **MOB-TEAM-19 Story tap-to-advance region has no `touch-action:manipulation`** [P2] src/clubhouse/screens/coachhelm/team/Stories.tsx:168
- **MOB-CVP-4 Deep link to a file section scrolls it under the bar and the sticky lens control** [P2] src/clubhouse/screens/coachhelm/file/PlayerFile.tsx:165-170
- **MOB-CVP-5 Long read titles in the file's read rows are cut to one line on phone** [P2] src/clubhouse/styles/coachhelm-file.css:289-291
- **MOB-CVP-6 Card header meta truncates to a few characters at 320 and XXL** [P2] src/clubhouse/styles/coachhelm-file.css:287-288
- **MOB-CVP-7 File correction buttons and "Change" are 36px outside the sheet** [P2] src/clubhouse/styles/coachhelm-file.css:245
- **MOB-CVP-8 File sheets carry `.ch-htb`, so the Team view's catch-all motion rules run inside them** [P2] PlayerFile.tsx:380 and YourWeek.tsx:109

### iPhone: Ask, Quick chat (34)
- **MOB-ASK-1 Answer bar chart track collapses to 6px at 320** [P0] src/clubhouse/styles/coachhelm-thread.css:488
- **MOB-ASK-2 SG anatomy diverging track is about 12px at 320** [P0] src/clubhouse/styles/coachhelm-thread.css:1545
- **MOB-QC-1 Landscape iPhone opens the 640px desktop panel and focuses its field off screen (extends QC-16)** [P0] src/clubhouse/shell/quick-chat/QuickChatSession.tsx:87
- **MOB-QC-2 Phone panel has no minimum height, so with the keyboard up in mini landscape the composer is clipped** [P0] src/clubhouse/shell/quick-chat/QuickChatSession.tsx:72–73
- **MOB-ASK-3 Blue "send" return key inserts a newline on iPhone** [P1] src/clubhouse/screens/coachhelm/chat/Composer.tsx:408
- **MOB-ASK-4 Plan sheet inputs are 15px, so iOS zooms the page on focus** [P1] src/clubhouse/styles/coachhelm-plan.css:474
- **MOB-QC-3 Quick chat "New folder" field is 15px, so iOS zooms inside the glass panel** [P1] src/clubhouse/styles/quick-chat.css:262
- **MOB-QC-4 Auto-scroll fires on every streamed token, smooth, with no stick-to-bottom check** [P1] src/clubhouse/shell/quick-chat/QuickChatSession.tsx:140–143
- **MOB-QC-5 Swipe-to-close on the panel header never fires on touch** [P1] src/clubhouse/shell/quick-chat/QuickChatSession.tsx:196–205
- **MOB-QC-6 Grab handle swipe zone is 36x5px and sits in the home-indicator gesture zone** [P1] src/clubhouse/shell/quick-chat/QuickChatSession.tsx:341
- **MOB-QC-7 Phone panel ignores safe-area-inset-bottom and ends in the home-indicator zone** [P1] src/clubhouse/shell/quick-chat/QuickChatSession.tsx:72–73
- **MOB-ASK-5 Artifact push on phone has no edge-swipe back and no history entry** [P1] src/clubhouse/screens/coachhelm/chat/parts/Artifact.tsx:75–85
- **MOB-ASK-6 Action-card Confirm button is clipped at 320 with XXL text** [P1] src/clubhouse/styles/coachhelm-thread.css:1206
- **MOB-ASK-7 Action-card fact values break mid-word at 320 with XXL text** [P1] src/clubhouse/styles/coachhelm-thread.css:1196
- **MOB-ASK-8 Ranked list name column is about 52px at 320, so names break mid-word** [P1] src/clubhouse/styles/coachhelm-thread.css:638
- **MOB-ASK-9 Answer mark indent takes 48px of every phone answer** [P1] src/clubhouse/styles/coachhelm-thread.css:90
- **MOB-ASK-10 Keyboard-up phone chrome leaves about 170px of thread on an iPhone SE** [P1] src/clubhouse/screens/coachhelm/chat/Ask.tsx:343–346
- **MOB-ASK-11 The "+" menu blurs the composer, so the keyboard drops and comes back** [P1] src/clubhouse/screens/coachhelm/chat/Composer.tsx:350–372
- **MOB-QC-8 Receipt row leaves the receipt text about 62px at 320 and about 23px at XXL** [P1] src/clubhouse/styles/quick-chat.css:192
- **MOB-QC-9 Phone panel sits under the notch in mini landscape** [P1] src/clubhouse/styles/quick-chat.css:339
- **MOB-QC-10 Panel stays open across navigation, so "Looking at" changes mid-task** [P1] src/clubhouse/shell/quick-chat/QuickChatProvider.tsx:31–81
- **MOB-ASK-12 Artifact push ignores the side insets in mini landscape** [P2] src/clubhouse/styles/coachhelm-ask-v2.css:141
- **MOB-ASK-13 Phone composer placeholder wraps to two lines at 320** [P2] src/clubhouse/screens/coachhelm/chat/Composer.tsx:348
- **MOB-ASK-14 Chat settings sheet ignores its 0.62 detent** [P2] src/clubhouse/screens/coachhelm/chat/Ask.tsx:336
- **MOB-ASK-15 Scope line truncates the important part (the time window) at XXL** [P2] src/clubhouse/styles/coachhelm-ask-v2.css:254–263
- **MOB-ASK-16 Citation chip breaks the prose line spacing, and its hit area covers the lines above and below** [P2] src/clubhouse/styles/coachhelm-ask-v2.css:41
- **MOB-QC-11 Undo and Open are 2px apart** [P2] src/clubhouse/styles/quick-chat.css:199
- **MOB-QC-12 Tone and option chips' 44px hit areas overlap between wrapped rows** [P2] src/clubhouse/styles/quick-chat.css:153–154
- **MOB-ASK-17 Plan sheet "Ask about…" field has no focus ring, a 28px send button and no return key behaviour** [P2] src/clubhouse/styles/coachhelm-plan.css:686–694
- **MOB-QC-13 VoiceOver reads streaming answers and typed titles letter by letter** [P2] src/clubhouse/shell/quick-chat/QuickChatSession.tsx:233
- **MOB-ASK-18 role="log" over the streaming thread repeats announcements, with nested live steps** [P2] src/clubhouse/screens/coachhelm/chat/Thread.tsx:189
- **MOB-QC-14 The panel dialog is not modal for VoiceOver** [P2] src/clubhouse/shell/quick-chat/QuickChatSession.tsx:212
- **MOB-ASK-19 Artifact push is a dialog with no modality and no focus move** [P2] src/clubhouse/screens/coachhelm/chat/parts/Artifact.tsx:77
- **MOB-ASK-20 Brief question options are announced as a radio group with no radios** [P2] src/clubhouse/screens/coachhelm/chat/parts/BriefCard.tsx:64

### iPhone: Practice, Documents, Messages (40)
- **MOB-MSG-1 Opening a photo or file from Details is blocked as a pop-up in iPhone Safari** [P1] src/clubhouse/screens/messages/files.ts:41-51
- **MOB-MSG-2 There are no message actions on touch at ≥821 (iPhone landscape 844/932, iPad)** [P1]  - src/clubhouse/screens/messages/MessagesView.tsx:1162
- **MOB-MSG-3 Landscape iPhone gets the desktop composer, and rotating throws away composer state** [P1]  - src/clubhouse/screens/messages/MessagesView.tsx:2078-2086
- **MOB-MSG-4 About 34px of home-indicator padding stays above the keyboard in Mobile Safari (extends MSG-3)** [P1] src/clubhouse/styles/messages.css:2110-2122
- **MOB-MSG-5 The keyboard drops after every send on iPhone** [P1]  - src/clubhouse/screens/messages/NotifyAnyway.tsx:97
- **MOB-MSG-6 A long press while typing drops the keyboard under a lift measured with the keyboard up** [P1] src/clubhouse/screens/messages/hold-lift.tsx:73-74
- **MOB-MSG-7 The date pill sits at a fixed 74px, under the notch bar** [P1] src/clubhouse/styles/messages.css:4518-4521
- **MOB-MSG-8 At XXL the drag-for-times stops 13–20px short, so times stay clipped** [P1]  - src/clubhouse/screens/messages/MessagesPhone.tsx:571
- **MOB-MSG-9 Pin speech bubbles overlap at 320 and 375** [P1] src/clubhouse/styles/messages.css:4241-4330
- **MOB-MSG-10 The poll sheet's Cancel and Send scroll away under the Safari keyboard** [P1] src/clubhouse/screens/messages/polls.tsx:657+
- **MOB-MSG-11 Details hosts Search but isn't keyboard-aware, and Search doesn't take focus** [P1] src/clubhouse/screens/messages/MessagesPhone.tsx:947
- **MOB-MSG-12 Landscape 812 (phone tree) ignores the side safe areas** [P1] src/clubhouse/styles/messages.css. There is no `safe-area-inset-left/right` anywhere; only bottom at :1357 and
- **MOB-PRAC-1 Plan sheet times print "10:30 AM" in a 46px column and 40px rotation headers** [P1]  - src/clubhouse/screens/coachhelm/plan/sheet/plan-sheet-model.ts:32
- **MOB-PRAC-2 Print on iPhone leaves a second plan sheet rendered under the app** [P1] src/clubhouse/screens/coachhelm/plan/PrintPlan.tsx
- **MOB-PRAC-3 "Ask about this block/station" is covered by the Safari keyboard** [P1] src/clubhouse/screens/coachhelm/plan/PlanCard.tsx:596-606, :639-650
- **MOB-MSG-13 Thread side padding stays 12px at ≥414** [P2] src/clubhouse/styles/messages.css:2034-2040
- **MOB-MSG-14 The thread bar's name block overflows its fixed 44px at large Text Sizes** [P2] src/clubhouse/styles/messages.css:1941-1983
- **MOB-MSG-15 Phone bubble column is 82% wide, the spec says 76%** [P2] src/clubhouse/styles/messages.css:2052-2053
- **MOB-MSG-16 A double tap anywhere in the bubble stack likes the message, even on links, polls and images** [P2] src/clubhouse/screens/messages/MessagesView.tsx:1222-1229
- **MOB-MSG-17 New message and announcement fields lack phone keyboard hints, and Return does nothing** [P2] src/clubhouse/screens/messages/MessagesPhone.tsx:1381-1388
- **MOB-MSG-18 The Search key leaves the keyboard over the results** [P2] src/clubhouse/ui/SearchField.tsx:34-35
- **MOB-MSG-19 A short inbox shows a band of a different colour below the list** [P2] src/clubhouse/styles/messages.css:4201
- **MOB-MSG-20 Announcement folds keep a hover tint after a tap** [P2] src/clubhouse/styles/messages.css:3284
- **MOB-MSG-21 The attach menu sits under the bar on a 320 SE with the keyboard up, and tapping outside goes through** [P2] src/clubhouse/screens/messages/ComposerPlusV2.tsx:27-37
- **MOB-MSG-22 The photo picker can't send videos, and "File" opens the same iOS sheet** [P2] src/clubhouse/screens/messages/ComposerPlusV2.tsx:88
- **MOB-MSG-23 A tapped photo leaves the app for a new Safari tab** [P2] src/clubhouse/screens/messages/MessagesView.tsx:918-943
- **MOB-MSG-24 Opening a thread mounts 200 bubbles, each fetching signed attachment URLs** [P2] src/hooks/golf/use-golf-messages.ts:783-793
- **MOB-MSG-25 The inbox row's leading swipe fights Safari's back-swipe at the left edge** [P2] src/clubhouse/ui/SwipeRow.tsx
- **MOB-MSG-26 Swipe-to-reply gives no feedback while dragging** [P2] src/clubhouse/screens/messages/MessagesView.tsx:1095-1101
- **MOB-MSG-27 The jump-to-latest key doesn't re-check when the keyboard opens or the screen resizes** [P2] src/clubhouse/screens/messages/thread-v2.tsx
- **MOB-MSG-28 Details "Files" jumps instead of scrolling smoothly** [P2] src/clubhouse/screens/messages/MessagesPhone.tsx:967
- **MOB-PRAC-4 Player plan and Plan format keep a 16px edge at ≥414 and show a background seam (extends PP-25)** [P2] src/clubhouse/styles/coachhelm-plan.css:1082-1086
- **MOB-PRAC-5 The player's plan view shows two titles** [P2] src/clubhouse/screens/coachhelm/plan/player/PlayerPractice.tsx
- **MOB-PRAC-6 "Now" and "Next" go stale on a long-open phone** [P2] src/clubhouse/data/practice-plan.ts:84-85
- **MOB-PRAC-7 Time columns overflow at XXL (`.drow` 46px, `.stop` 52px, `.blk` 54px)** [P2] src/clubhouse/styles/coachhelm-plan.css `.drow`
- **MOB-PRAC-8 Bring and Notes stay two columns at 320** [P2] src/clubhouse/styles/coachhelm-plan.css `.pp-two`
- **MOB-PRAC-9 Plan format's "See … in it" link is small and wraps next to Undo** [P2] src/clubhouse/styles/coachhelm-plan.css:1279-1292
- **MOB-PRAC-10 Documents: desktop drop copy, a 32px ⋯ button and an 11px type tag on the phone** [P2] src/clubhouse/screens/hub/parts.tsx:723
- **MOB-PRAC-11 The folder name field refocuses on every render and lacks keyboard hints** [P2] src/clubhouse/screens/coachhelm/plan/PlanCard.tsx:455-470
- **MOB-PRAC-12 Plan format's file input sits outside the modal sheet** [P2] src/clubhouse/screens/coachhelm/plan/format/PlanFormat.tsx
