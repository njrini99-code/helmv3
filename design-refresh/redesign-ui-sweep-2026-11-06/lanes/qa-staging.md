# Staging pass (QA site, signed in as the head coach, real demo data)

Desktop 1440x900, light theme, Nov 5 2026 evening. Screenshots in `../screenshots/qa-desk-*.png`. Phone evidence comes from Nick's two iPhone screenshots (`nick-phone-*.png`); those bugs are in team.md (TEAM-1..11) and crh.md (CRH-1, 3, 4). Before relying on staging, confirm the QA deployment is built from current `main` (the Team view caption on staging may differ from main).

### QA-1 The same player has different numbers on different pages
- Severity: P0
- Where: Roster, CoachHelm Team view, Stats, Home; desktop and phone; light and dark
- File: data selectors behind `screens/coachhelm/team/TeamBoard.tsx` (team hole figures), `screens/roster/*` (Rds column), `screens/stats/*` (Who gains and loses), `screens/home/TeamLegs.tsx`
- What's wrong: Cole Bennett has 2 rounds on Roster, 3 rounds on Team view ("3 rounds with hole scores · average of 1 player") and 10 rounds on Stats. His strokes gained are tee +2.5, approach +1.9, putting −3.9, total +0.5 on Team view, but tee +1.0, approach −2.4, putting −4.8, total −6.1 on Stats. For the team, Home says approach −3.1 while Team view says approach +1.9. The coach can't trust any of it.
- Should be: one source and one window per figure across lanes. Every figure says its window ("last 10 rounds", "this season"), and the round count shown equals the rounds used. Gains and losses share one sign convention and one colour everywhere (green gains, amber losses).
- Fix: trace each page's figure to its selector. Make Team view and Roster use the same windowed SG/round-count helpers as Stats (the `round-history-shape` / stats data map, see `design-refresh/STATS_DATA_MAP.md`), or label the different window explicitly. Add a cross-page test: for the seeded demo team, the round count and the SG legs for one player match on Roster, Team view, Stats and Home for the same window. Do not change what shot tracking collects.
- Confidence: high (seen on staging, qa-desk-team-1, qa-desk-roster-1, qa-desk-stats-2, qa-desk-home-1)

### QA-2 Ask: a failed chart renders as an empty "Read / Result" placeholder table
- Severity: P0
- Where: Ask answer, desktop (and phone), light
- File: Ask answer visual renderer (`screens/coachhelm/ask*` visual/table block)
- What's wrong: under "Team strokes gained over 41 player rounds." the visual renders a table with headers Read and Result and one row whose value is the word "Read". It looks broken.
- Should be: a visual that can't render falls back to its real data table, or is left out with nothing in its place.
- Fix: validate the visual payload before render; on failure render the ui table from the tool's rows, else drop the block. Test with a malformed payload.
- Confidence: high (qa-desk-ask-2)

### QA-3 Ask: the team appears as a player row in "Scoring average, this season"
- Severity: P0
- Where: Ask answer table, desktop, light
- File: Ask team tools (`create-tools.ts` and the scoring-table tool)
- What's wrong: "Demo University Golf · 12 rounds" is ranked #5 among players, linking to `/golf/dashboard/stats?player=<team id>`.
- Should be: tables of players contain players only; the team appears as a separate reference row styled as such.
- Fix: filter rows whose id is the team id out of player rankings; render the team as a labelled reference line. Test.
- Confidence: high (qa-desk-ask-3/4)

### QA-4 Ask: triple-nested cards
- Severity: P1
- Where: Ask answer, desktop
- File: Ask answer card > visual card > stat card ("Active roster 7")
- What's wrong: a card inside a card inside a card, each with its own border, radius and shadow.
- Should be: DESIGN_LANGUAGE: one surface level per section; no card in card.
- Fix: answer body is unboxed text on the thread; visuals sit on one Surface; stat tiles are rows inside it, not cards.
- Confidence: high (qa-desk-ask-1)

### QA-5 Ask: composer chip says "last 30 days" while the answer uses the season (96 days)
- Severity: P1
- Where: Ask composer, desktop
- What's wrong: the context chip contradicts the answer's window.
- Fix: the chip shows the window the last answer used, from the same value.
- Confidence: high (qa-desk-ask-1)

### QA-6 Ask: left rail "CoachHelm knows" heading with an empty list; first table column has a tinted stripe; "Table" toggle clipped under the sticky title
- Severity: P1
- Where: Ask desktop
- Fix: hide the heading when the list is empty (or show an EmptyShape line); remove the first-column tint; give the sticky title a scroll-margin so controls are not clipped.
- Confidence: high (qa-desk-ask-1..4)

### QA-7 Team view: gains and losses coloured the same
- Severity: P1 (same as TEAM-8, confirmed on staging)
- Where: Team view desktop
- What's wrong: +2.5, +1.9, 0.0 and −3.9 are all amber in the chips and on the hole; "biggest leak" sits next to the only negative number; "+0.5 a round to Tour" doesn't say whether that's good or bad.
- Fix: as TEAM-8; header says "0.5 a round better than Tour" or "worse", in words.
- Confidence: high (qa-desk-team-1)

### QA-8 Team view: This week and Working on show the same three items; This week cards are nested cards with a heavy 2px dark-green outline and grey bars that look like loading skeletons
- Severity: P1
- Where: Team view desktop right rail
- What's wrong: duplicate content; the outline reads like the banned accent border; "0 new · 0 cleared · 0 contradicted · 0 out of date" (all zeros) wraps to two lines; Working on progress rings are empty circles.
- Fix: one list. Rows on the rail Surface (no inner cards, no 2px outline); progress drawn only when a value exists; hide the all-zero counts line.
- Confidence: high (qa-desk-team-1)

### QA-9 Team view: dead space and empty legends
- Severity: P1
- Where: Team view desktop
- What's wrong: the Putting panel's left column leaves ~200px empty; "Team average dashed" legend with no dashed mark drawn; "How often CoachHelm is right" shows five empty bars and a level literally named "Not enough yet" reading "Not enough yet · Not enough yet"; legend "Line: the target for that level" with no lines; "Re-check reads" floats outside any card; page title is small plain text while Brief has a 40px title.
- Fix: collapse empty panels to one line (EmptyShape); draw the legend's mark or drop the legend; one page header for all three CoachHelm views (see SYS-5).
- Confidence: high (qa-desk-team-2)

### QA-10 Brief: contradicts Team view and uses a different page frame
- Severity: P1
- Where: CoachHelm Brief desktop
- What's wrong: Brief says "No open reads this week · 0 countable rounds last week" while Team view's This week lists three reads; big "Coach / Brief" title with subtitle (Team view has a small team name); the Team/Brief/Ask switch moves position between views; a stray double rule at the top of the sheet; heavy drop shadows; rows have "Open" buttons here but the same rows on Team view aren't tappable.
- Fix: one CoachHelm header (title, switch in the same place); one data source for "this week"; same row component on both views.
- Confidence: high (qa-desk-brief-1)

### QA-11 App: "A new version is available" bar is an unstyled black full-width strip over content
- Severity: P1
- Where: all pages, desktop
- Fix: render with ui/Toast (or RefreshNotice) styling, inset, safe-area aware.
- Confidence: high (qa-desk-brief-1)

### QA-12 Home desktop: dead space and unclear figures
- Severity: P2
- What's wrong: This week card has ~150px empty under the strip and shows Sun 8's trophy but lists only Sat; hero event time "8:00 – 6:00 PM" drops AM; "+0.5" next to 75.7 with no meaning; "last 10 rounds" next to "59 rounds · May 29 – Sep 26"; Latest rounds ~100px empty under three rows; Leaderboard has no rank numbers; hero copy names the test player ("Audit has no 18-hole round").
- Fix: size cards to content (no stretched equal-height cards with empty bottoms); list every competition the strip marks; "8:00 AM – 6:00 PM"; label the delta ("+0.5 vs previous 10"); ranks on the leaderboard.
- Confidence: high (qa-desk-home-1/2)

### QA-13 Roster desktop: three different toggle styles in one toolbar; Last 5 column reads as a skeleton
- Severity: P2
- What's wrong: filter pills, an icon pair and a segmented sort control side by side; "Last 5" shows grey bars for players with too few rounds that look like loading; "Active" pill on every row while the filter is Active; Jackson shows "Class of 2026" where others show a year.
- Fix: one Segmented style for all three; "—" with a "Needs 3 rounds" tooltip in Last 5; hide the Status column when filtered to one status; year label from the same field for every player.
- Confidence: high (qa-desk-roster-1)

### QA-14 Stats desktop: clipped and floating labels
- Severity: P2
- What's wrong: the "Best" chart label is clipped at the top; player lines run off the bottom of the chart; "Filter" sits alone in a 90px band; Trend column mixes values with and without icons; "T1" shared by four players from −4.2 to −6.1 reads wrong without the legend; Season bests is one row in a large card.
- Fix: chart padding from label size; clamp lines to the plot; Filter inline with the window control; one Trend format; explain ties inline ("tied: ranges overlap").
- Confidence: high (qa-desk-stats-1/2)

### QA-15 Practice desktop: unfinished page
- Severity: P0
- What's wrong: seven identical "No practice" cards and 60% of the page empty; Saturday's tournament isn't on the week; the empty state's "Add a practice" goes to Calendar instead of the plan builder and duplicates New plan; no plans/Documents list.
- Fix: rebuild the Practice tab page to `design-refresh/practice-plan` 06-SCREEN-SPECS: week strip from ui/WeekStrip (events shown), plans list, one primary action.
- Confidence: high (qa-desk-practice-1)

### QA-16 Plan format desktop: phone layout shipped on desktop; back goes to the wrong page
- Severity: P0
- What's wrong: a dark-green phone bar (back + centred title) stacked under the app header; cards 14px from the page edge with no max width; an 1100px-wide "Upload a plan" button; "‹ Practice" links to /golf/dashboard/calendar.
- Fix: on desktop use the standard desktop page header and content width; PhoneBar only ≤820; back link to /golf/dashboard/practice. Test the href.
- Confidence: high (qa-desk-plan-format-1)

### QA-17 Messages desktop: wrong avatar, overhanging card, stray band
- Severity: P1
- What's wrong: Cole Bennett's 1:1 shows a group icon instead of his avatar; the Announcements card is wider than the conversation list (overhangs both edges with its own shadow) and truncates its title; three avatar styles in one list; a lighter band sits above the composer.
- Fix: ui/Avatar for 1:1s; Announcements as a row in the same list inset (or a Section header), no overhang; remove the band.
- Confidence: high (qa-desk-messages-1)

### QA-18 Staging demo data looks like test data (not a code fix)
- Severity: P2 (Nick's call)
- What's wrong: "Audit Testplayer", "QA test message", and many duplicate Ask chats show on every page Nick demos.
- Fix: none in code. Listed so Nick can decide whether to clean the demo team.
- Confidence: high

## Summary
1. QA-1: numbers for the same player disagree across Roster, Team view, Stats and Home.
2. QA-2/3: Ask shows a broken placeholder table and ranks the team as a player.
3. QA-15/16: Practice and Plan format are unfinished on desktop (phone layout, wrong back link).
4. QA-8/9/10: CoachHelm views duplicate content, contradict each other and use different page frames.
5. QA-4/17: cards nested in cards and overhanging cards (Ask, Messages).
