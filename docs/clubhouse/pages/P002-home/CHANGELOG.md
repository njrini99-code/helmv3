# P002 — Home: changelog

## 2026-10-08 — the player peek (P003-C1)

The shared PlayerPeek: the phone's Latest rounds rows peek at the player on a hold, from the board's row when the player has one, else from the round (`roundPeek`). No new reads.

## 2026-10-08 — premium pass: findings D3, D4, D5

- D3: a leaderboard row is a table row (a `div` with `role="row"`). The player's name is the link to their stats, and its `::after` covers the row, so the whole row still opens it. The row draws the focus ring (`:has(:focus-visible)`), and assistive tech now hears a row with a link in it, not a row that is a link.
- D4: players on the same season average, to the tenth, share a place with a T, and the next place counts them all: 1, T2, T2, 4 (`leaderPlaces`). An early read has no place yet ("—"); the loader already sorts early reads last.
- D5: on the phone, a part that didn't load keeps its section and the same head as the others (Up next, Team scoring, Latest rounds: a title over the rule), at one rhythm. Up next's failed section keeps 18px below the page notice.
- D8: the phone date line is no longer tracked: 13px, weight 500, 0.01em, the values P001 D5 sets for the shell's eyebrow. D2 was already fixed: the stack overlaps by 4px (aesthetic audit H-1), so no initials are clipped.
- Not changed: D6. With the Day card the coach's desktop columns end about 90px apart in the preview, not 300px. P002-A1, the alternative fix, is on the not-building list.

## 2026-10-08 — premium pass: the sunset on the day's rail

"Later today" carries today's sunset at the team's place (the global light's `sunTimes` and `useLightPlace`) while it is still ahead, with when the light turns golden; a champagne mark on the rail and a sunset glyph. Nothing after sunset.

## 2026-10-08 — premium pass: trend sparkline in the phone's Latest rounds (P002-C2)

Each latest round on the coach's phone carries its player's last rounds as a 64x18 bare FormLine between the player and the score (from the leaderboard rows Home already loads; three rounds or more). It is decorative beside the figures (the trend itself lives in Stats), and absent when the leaderboard read failed.

## 2026-10-08 — premium pass: the coach's phone Home is the day (concept board 1)

The coach's phone Home opens on one living green card for the next thing that matters (`screens/home/DayCard.tsx`, owner-approved phone concept board 1, "The day, not a dashboard"); desktop keeps its dashboard, and the player's phone keeps Up next.

- The card holds the event under way ("Now · until 5:00 PM") or next ("Next up · 3:30 PM") with its time chip, the invitees (28px coins that no longer clip their initials, P002 D2) and "5 of 6 going · Eli hasn't replied". Once today's events are over and rounds came in today, it becomes the day's recap, each round opening its card. A live round has no read on Home yet, so that phase isn't drawn.
- Actions are the coach's and prefill Messages only (D2-7): Nudge the people who haven't replied, or Message the invitees when everyone has. Directions is a plain Apple Maps link, only for competitions and travel with a place (no maps API, D1-2).
- "Later today" replaces Today when the day has events: the rest of today on the same rail (the card's event and what is over left out), then the week's next competition. A slot is ready for the sunset row from the global light.
- "Since you last looked": chips for rounds posted since this device last showed Home and for new replies to the card's event, kept on the device only; nothing on a first visit.
- The loader adds `awaiting` (who hasn't replied, id and name) and `inviteeIds` to the coach's events, null when replies didn't load; the player's Home strips both. Latest rounds carry their `date`.
- The gap under the hero is one 34px step (P002 D7).

## 2026-10-08 — premium pass: the brief loses the AI glyph (D1)

The phone hero's brief is deterministic (`homeSubline`), so it no longer wears the Sparkles glyph that reads as model output; the line stands alone. The owner declined the "Why this line" sheet (P002-C1: "Take this out").

## 2026-10-08 — Copy: typographic apostrophes

Home writes its apostrophes as ’ on desktop and the phone: the no-team pages
(CH-2307, CH-2313), the empty leaderboard (CH-2304), the phone's hole-by-hole
lines (CH-2203, CH-2303) and its empty week (CH-2309), "Theo’s stats", the
scorecard's name, the team scoring chart's label and the coach brief's line
("Eli hasn’t posted a round in 9 days"). The catalog quotes them as shown.

## 2026-10-08 — Coach Home on the phone: the board as drawn; coach and player match

The coach's phone Home now matches its "Mobile v2" board where the port had
drifted, and the coach's and the player's share one set of rules:

- section titles (Today, This week, Latest rounds) are the Ledger's phone
  heading, the bold condensed sans in forest ink; they were the old 17px black,
  because the board styled h3s and the page's titles are h2s;
- This week draws today as the solid green key and a competition day as a soft
  green tint with its trophy; the board's rules put the classes on the key,
  the strip puts them on the day, so they never applied;
- Today's rows and the latest rounds sit on the section's edge (the time at the
  edge, as the board sets it) between soft seams, and tint on press;
- the sheet is the canvas' own parchment, so a short page has no seam where
  the darker sheet used to end;
- the week's notice sits on the sheet under the greeting, outside the green
  card (as the player's), and the coach's first run opens on the page intro;
- every control answers a press (CH-1606): Up next deepens, the week's keys
  and rows tint, the quick event types shrink, Add event darkens, Calendar and
  Team stats dim;
- the date is the page intro's 12px eyebrow (the phone text floor) on both
  roles, 10px above the greeting as the kit's PageIntro sets it.

The skeleton's phone hero and the date's new line move together: skeleton to
page stays within half a pixel for both roles. On desktop, the leaderboard's
notice now sits 18px under its head's rule (it touched it). Measured in WebKit
as an iPhone at 390 wide.

## 2026-10-08 — Player Home on the phone: every tap answers; the skeleton is the reader's own

Measured in WebKit as an iPhone at 390 wide (touch, no hover), every control on
the player's phone Home now answers a press, with no tap flash:

- Up next deepens its green (a large card answers with a tint, never a scale,
  CH-1606); a day in the week strip tints its key, today's green key deepens;
- Today's rows, the latest round's pager and its keys tint a beat after the
  finger lands (the CH-1606 delay, so a scroll that starts on them never
  flashes), and the pager's keys shrink as every button does;
- the Scoring window switch glides (36 frames over about 300ms) and lands in
  one frame with reduced motion.

The route skeleton's phone hero follows the shell's role (SkeletonPhoneHero):
the player's has no brief, its Up next card sits under the greeting with the two
keys under it, and the coach's draws the brief as three lines over the coach's
shorter card. Skeleton to page now moves nothing by more than half a pixel for
either role (it was 61px for the player's card and 20px for the coach's).

## 2026-10-08 — Home's states: one notice for several failed reads, and the framed first run

Fixes from the states audit, on desktop and the phone, for both roles:

- when two or more of Home's reads fail, the page says so once, under the head
  (CH-1209): "Some of this page didn’t load", naming the parts ("This week’s
  schedule, recent rounds and the leaderboard didn’t load"), with one Try
  again. Each failed part keeps only its notice's title under its heading, with
  no button of its own. One failed read keeps its own notice and Try again, as
  before. The player's latest round and scoring read the same rounds, so the
  notice names them by their sections ("your latest round and your scoring");
- on the coach's phone the week's notice (CH-2201) is out of the green Up next
  card, on the sheet under the greeting, as on the player's;
- the first-run pages (CH-2308, CH-2312) open under the loaded page's framed
  head on desktop (the double rule, the engraved date, the greeting in forest
  ink, set where the loaded Home sets them), and the coach's phone first run
  opens on the Ledger's page intro, as the player's does;
- the notices' titles end without a full stop and use the curly apostrophe of
  the page notice beside them.

New tests: home.test › CH-1209 (several and one), the phone's CH-1209 and
CH-2201 outside the card, CH-2308's framed head; player-home.test › CH-1209 on
desktop and the phone.

## 2026-10-08 — Player Home on the phone: the Mobile clubhouse pass

The player's phone Home follows the same board as the coach's (round 3, "fewer
containers, one feature card"), carried to `m-player-home.jsx`:

- the page is the chassis' parchment sheet from the greeting to the tab bar;
- Up next with its countdown stays the one green feature card; Message coach
  and Post a round under it are the shared buttons, Post a round the primary;
- This week, My latest round, Scoring and Your game sit flush under engraved
  double rules, their titles in the bold condensed sans. No white cards: the
  latest round's GIR, putts and SG are the Ledger's figure row between
  hairlines, Scoring's four figures sit two by two between hairlines, and the
  four parts of the game are divided by soft rules. The scorecard keeps its
  green board and the window picker its well;
- the week strip draws today as the solid green key and a competition day as
  a soft green tint with its flag, as the board does; Today's rows sit on the
  section's edge and tint on press;
- the first-run page opens on the Ledger's page intro (the date under the
  double rule, the greeting in the bold sans).

Fixed: when the week didn't load (CH-2201) its notice sat inside the green
card and took the card's ivory ink, so its words were invisible; it now sits
on the sheet. Home's phone skeleton (CH-2401, shared with the coach) draws the
new page: the parchment, the date and greeting lines, the brief's lines, the
green card and the first section under its rule, its hero held at 386px
between the coach's (388) and the player's (382), so the first section lands
within 3px. Desktop is unchanged.

## 2026-10-08 — Coach Home on the phone: the Mobile clubhouse pass

Phone Home now follows the owner's "Coach - Home - Mobile v2" board
(`m-clubhouse.css`, ported in order so its third round wins):

- the green chassis bar over the parchment sheet;
- the greeting in the bold 31px sans in forest ink, with the brief under it;
- Up next as the screen's one green feature card;
- Today, the team's scoring, This week and Latest rounds flush under engraved
  double rules, with rows on seams instead of white cards.

The board's own hero drew the bar and the sheet's lip; in the app the shell's
phone chassis draws both, so the hero here is the sheet itself.

## 2026-10-07 — A leaderboard row answers the press

On desktop a leaderboard row keeps its Ledger tint and sliding chevron on hover,
and a press now deepens the tint (`--ch-ledger-row-press`) and nudges the
chevron 2px on over the press beat, easing back over quick. Before, the press
tint was masked by the hover rule. The row never lifts or scales; CH-2602 now
says so and is referenced in `Leaderboard.tsx`. CH-2601's reduced-motion wording
is corrected: paging is instant, not a fade. Frame-sampled in WebKit at 1440
(tint 180ms, chevron 260ms).

## 2026-10-07 — Home on the Ledger

On desktop, the week and the latest round no longer share a lit sheet. They sit
on the canvas, split by a soft hairline column. The leaderboard is rows on the
canvas, aligned to the head's edge, with soft seams and a quiet hover tint. Its
heading sits over the engraved rule. The section headings ("This week", "Latest
round", "Leaderboard") are in the heavy sans. The scorecard keeps its green
board, and the week strip keeps its well. On the player's Home, Scoring runs on
from the week with no card, at the head's edge. "Your game" is four figures on
the canvas divided by soft rules, not four cards, and the up-next board keeps
its green. The phone is unchanged.

## 2026-10-07 — Home in the framed page head

Desktop Home's greeting block is the framed page head instead of the green
canopy: the date as an engraved line, "Good morning" as the heavy sans title in
forest ink, the brief, and the actions on the right. The loading screen draws
the same head line for line (183px at 1440).

## 2026-10-07 — Loading holds the loaded page

Desktop Home loading draws on the canopy, with the title block in the loaded
grid: the actions sit beside the brief and the serif greeting's line is 71px.
The sheet panes hold 623px. Measured in WebKit at 1440: the title, sheet and
leaderboard tops don't move when the page lands.

## 2026-10-07 — Figures drawn, not stated

Owner: no bare numbers. Each Scoring figure is now drawn against a reference
that is real:

- **Average:** the current window's average beside the previous window's, as two
  marks on one track.
- **Strokes gained:** a bar from a zero tick.
- **Under par:** one mark per round, red under par and pale green at par.

The latest round's GIR, Putts and SG (desktop and phone) carry small drawings
(`RoundViz.tsx`): greens hit out of those played, putts against two on every
green (36), and strokes gained from zero. Each drawing sits in its caption's dd,
so every figure stays one dt with its value and caption dd pair.

## 2026-10-07 — Home on the canopy

Desktop Home moves from the green band card onto the shared canopy: a serif
greeting, the brief in larger type, and the actions set level with the brief.
Section titles (This week, Latest round, Leaderboard, Scoring, Your game) and
the phone hero greeting are set in the display serif.

## 2026-10-06 — Desktop hero band, leaderboard and scoreboard

Desktop Home, coach and player, verified in Safari 27 at 1440×1000.

- **Hero band:** the page opens on a deep green band, the desktop twin of the
  phone hero. It has ivory type, a mint date, on-dark actions set at the right
  and a faint drifting contour pattern; the drift is off with reduced motion or
  Animations off. The week sheet follows the band and is never tucked under it.
- **Recent rounds (coach):** the latest-round pane closes with Recent rounds, a
  picker over the same rounds as the pager, so the pane no longer ends in empty
  space.
- **Leaderboard:** now one reading sheet:
  - a quiet column-label row instead of a header well, and seams between
    players;
  - podium position keys, with the leader's in green, and a state dot before
    each form word;
  - the season average as each row's figure;
  - a tinted hover with a sliding chevron instead of a card-in-card hover.
- **Scorecards:** both the desktop and the phone scorecard use the new green
  scoreboard.
- **Contrast:** stronger text in the week strip and scorecard.

## 2026-10-06 — Premium materials pass

Player Home premium pass (owner, Safari 27 desktop and iPhone emulation). The
CoachHelm brief line is removed. Up next opens the latest-round pane, and the
week, latest round and Scoring join in one surface with engraved seams. The
today key in the desktop week strip is a frosted, higher-contrast key. "By part
of the game" becomes "Your game" with more space above it; the legs drop their
icon tiles and show a full-width trend line with an Improving/Steady/Slipping
caption. Score marks, the countdown well, hero actions and the scorecard well
use the shared materials. All Home radii are on the scale.

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
and owner visual acceptance remain open in [POPUP_AUDIT](../../POPUP_AUDIT.md).

<!-- clubhouse:release-audit:start -->
## 2026-10-06 — Smoothness repair

LatestRound passes the reduced preference through chSwap, eliminating the
retained fade when motion is disabled.

See [repair evidence](../../SMOOTHNESS_AUDIT.md).
Normal styling and approved handoffs remain unchanged. Physical-device
verification and durable writes are still pending.

## 2026-10-06 — Whole-app release audit

Reconciled page purpose, design acceptance, contract status, wiring and
verification against the current flagged implementation. Indexed 13 mapped
actions and 2 overlay/control call sites in the [all-page
audit](../../ALL_PAGE_AUDIT.md#p002-home). Approved handoffs and contract IDs
are preserved; runtime gaps stay explicit.
<!-- clubhouse:release-audit:end -->

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification
log and decisions).

## 2026-10-06 — Motion import path moves to `motion/react`

```text
PR/commit:      #2153 (agent/deps-ui-upgrade)
Design package: none; no visual or behavior change
Contract IDs:   none
Data impact:    none
Held items:     none
```

Dependency upgrade only. `framer-motion` 13 is replaced by the `motion` 14
package, so this page's animation imports change from `framer-motion` to
`motion/react`. The animation API, durations, curves and reduced-motion gating
are unchanged; Motion 14 only removed internal compatibility APIs this tree
never used.

## 2026-10-02 — Partial data keeps its meaning

The Codebase Design plugin review found relative day labels using the viewer's
clock, partial invitee identities paired with a complete Going count, and
missing sand/par data converted into confident figures. Home now uses its team
timezone, suppresses an unresolvable paired attendance count, and includes only
recorded par/sand values in those figures. A common par line requires all shown
rounds to agree. Known names and available totals remain visible.

Verification: 132 targeted data/consumer tests pass with one worker, including
traveling timezones, unresolved identities and missing par/sand values. These
are mocked-read tests; no migration or customer-data repair was performed.

## 2026-10-01 — Safari Home and truthful event timing

Branch: `codex/clubhouse-design-fidelity`. Owner approved showing dates for
all-day events instead of a midnight countdown. Both player layouts follow that
rule; timed countdowns reserve their four wells before hydration and use roomier
padding. Shared surface depth and the compact header mark follow the supplied
mobile boards.

Data repairs: Home now uses Calendar's literal all-day dates and inclusive
spans, retains events active today, includes multi-day events starting before
this week, and reads every event page instead of silently stopping at 500.
Neutral strokes gained no longer produce a false loss claim. No event writes or
schema changes. Regression coverage is in `home-data-completeness.test.ts`,
`home-reads.test.ts` and `player-home.test.tsx`. Synthetic WebKit and local
mocked reads verify these contracts; no customer database was touched.

## 2026-10-01 — Aesthetic audit: the stacked coins clear their initials, the latest round's stats follow its scorecard

```text
PR/commit:      agent/swap-audit (#2111): 4e01c43d8
Design package: none (owner's aesthetic audit guide, 2026-10-01)
Contract IDs:   none new
Actions:        none
Data impact:    none; visual only
Held items:     none
```

- **Issue.** (1) The phone's avatar stack overlapped 7px, so the last stroke of
  four coach initials ran under the next coin (measured 1.6 to 3.3px; "TM" read
  "TN"). (2) The latest round's stats row was pinned to the sheet's bottom,
  171px (coach) and 234px (player) under the scorecard at 1440x1000, 38% and 46%
  of the column, because the week beside it runs longer.
- **Fix.** `home.css`: the stack overlaps 4px; `.ch-h-round__foot` has
  `margin-top: 4px` instead of `auto`.
- **Not done, on purpose.** The space under the stats is still there (it moved
  to the bottom of the sheet); filling it is new content. The conflict triangle
  on the timeline is icon-only (Q-150). The "Latest round" move is design
  judgment and one rule to revert.
- **Contrast pass (`d4367ee`).** The week strip's weekday labels measured 4.1:1
  (UX360 sampled 3.7:1): `.ch-h-day__d` uses secondary ink. The segmented Last 5
  and Last 20 labels take the shared fix below.
- **Verification.** Before and after at 375, 390, 430 and 1440, coach and
  player; the geometry report shows "initials under next coin: TM, SA, AL, JO"
  before and none after. Not tested: a real iPhone.

## 2026-10-01 — Page performance: Home reads in fewer round trips, and its skeleton is the page's height

```text
PR/commit:      agent/swap-audit (7dd8bb3d2, 19a20054b)
Design package: none (no visual change once loaded)
Contract IDs:   none new (CH-2401 behaviour unchanged)
Actions:        none
Data impact:    none; same figures, same reads, in fewer round trips (`loadCoachHome`, `loadPlayerHome`)
Held items:     none
```

- **Issue.** The coach's Home read in four round trips, five when the week's
  events have replies to read: the team's timezone, then the roster, the chat
  and the week's events, then the replies, then the season's rounds (which
  waited for the whole week), then the newest rounds' holes. The player's took
  three. The route skeleton's head was 69 px against 189 loaded (it had no
  sentence and no actions), its sheet 209 against 423, so the leaderboard
  landed 334 px lower than it was drawn.
- **Fix.** The timezone, the roster, the chat and the week's events start
  together (the events are asked for over one window wide enough for any
  timezone and cut to the week in code); the replies start as soon as the
  events are back and the season's rounds as soon as the roster's ids are, so a
  coach's Home is three round trips and a player's two (`home-reads.test.ts`
  pins both, and that the events are read once). The skeleton's head is its
  four lines (date, greeting, two-line sentence, the two actions), its sheet
  panes the loaded height and the leaderboard's heading its two lines and
  button: measured against the loaded page, the head, the sheet and the
  leaderboard's top land within 1 px (the head was 120 px short and the
  leaderboard landed 362 px lower than drawn). A tap on the leaderboard or the
  next-event card shows the page's hairline while the page loads
  (`LinkPending`).
- **Not done, on purpose.** Nothing is cached across requests or users. The
  route skeleton serves both roles and draws the coach's sheet, so a player's
  loaded sheet is 128 px taller than it. The phone's skeleton hero is 22 px
  (coach) or 36 px (player) taller than the loaded one (the lead's design,
  measured, not changed). A tap into Home shows its page no earlier than about
  350 ms whatever the server time, because React holds a Suspense reveal
  until 300 ms after the skeleton committed; that is the shell's
  (PROGRESS.md, "Stats and home").
- **Checked.** `home-reads.test.ts`, `home.test.tsx`, `player-home.test.tsx`,
  `player-home-phone.test.tsx`, `stats-geometry.test.tsx` (the skeleton's head);
  measured with `npm run clubhouse:perf` (PROGRESS.md, "Page performance
  (2026-10-01)": cold server time 172 to 148 ms coach, 129 to 116 player at
  1280 on build `082214d1d`, inside the player's spread; 6 to 4 and 6 to 5
  round trips on a cold load on `169f17833`).

## 2026-10-01 — "vs. previous 10" compares the same players (Q-112)

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none (no visual change)
Contract IDs:   none new
Actions:        none
Data impact:    none; `teamForm` (scoring, greens, putts)
Held items:     none
```

- **Issue.** The team's change pooled every player's newest ten against the
  previous ten of only the players who had one, so a player with no earlier
  rounds moved the trend by joining.
- **Fix.** Each change compares the window's rounds of the players who also
  have a previous ten against that ten; the figure itself still reads the
  whole window (owner, 2026-10-01).
- **Checked.** `home.test.tsx` (the §10-1 case now reads 0, not +3.3).

## 2026-10-01 — The coach's team line is a day a point; a change of "0.0" is plain on both Homes

```text
PR/commit:      agent/swap-audit
Data impact:    none
```

- **Issue.** The coach phone's team scoring line drew a five-round moving
  average over every round in the window (about seventy points) and read as
  noise. A change that rounds to zero ("0.0" putts) was painted amber, and a
  strokes gained of "0.0" green, on both Homes.
- **Fix.** `teamForm` draws the team's average on each of its last ten round
  days (as Stats' scoring trend does), so the line has at most ten points. One
  `changeTone` (`lib/format`) paints a change or a signed figure green or amber
  only when it does not round to zero at the places it is shown with; the coach
  strip, the player's scoring figures, the leg pills (a plain pill at "0.0"),
  the latest round's SG and the desktop leaderboard and latest round use it.
- **Checked.** home.test (the daily line, the zero tones) and
  player-home-phone.test; the real coach Home at 390px.

## 2026-10-01 — The player's phone to the board: spacing, the scoring card, Today

```text
PR/commit:      agent/swap-audit
Data impact:    none
```

- **Issue.** The owner: the phone looked the same, with plain numbers and no
  spacing. The hero's brief sat hard against Up next and the greeting against
  the date: base.css zeroes every heading's and paragraph's margin, a
  one-class rule loses that, and a two-selector rule only ties it, so the
  order the stylesheets loaded in decided. Scoring and the parts of the game
  carried the desktop's in-card 20px title and caption, the window picker was
  a small desktop chip whose own labels were greyed by the caption rule, Today
  was a full section with a Calendar link and dimmed rows, the chart repeated
  one date under rounds posted on the same day, crammed ten ticks into the
  axis, and marked no round under par when the window mixed pars.
- **Fix.** Margins now carry enough specificity to win in any order. Scoring
  and By part of the game have their 17px title and one-line meta above the
  card; the card opens on the full-width Last 5 / 10 / 20 picker (all three,
  as the board does), then the line, the four 26px figures (11.5px captions,
  italic green note). Today is a label inside This week with Now / Next on
  the row and past rows in full ink. The chart labels each date once,
  keeps about six whole-stroke ticks, and marks a round against its own par.
  Up next reads "Up next · Qualifier" and a competition day draws a flag.
  The latest round's figures take the board's ruled strip.
- **Checked.** player-home-phone.test (18 cases: the axis and tick helpers, the
  change tones, the picker, Today's marks, the margin rules), player-home.test
  and the clubhouse suite; the preview route and the demo player compared
  with the board at 390px, section by section.

## 2026-09-30 — The Tour is the only benchmark (Q-88): no D1 anywhere

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

- **Issue.** The player Home's four parts of the game drew a D1 mark and "D1 60" under each bar.
- **Fix.** The mark is the Tour's average from `golf_pga_standards.pga_tour_value` for the team's own tour ("Tour 66"); a stat the tour has no value for (fairways, scrambling overall, putts per round) still draws no mark. `ChPlayerLeg.d1` is `bench`, `d1Error` is `benchError`, and the read is logged as `tourBenchmarks`.
- **Checked.** strokes-gained.test and player-home.test; a mutation back to "D1" is caught.

## 2026-09-30 — The player's strokes gained says vs Tour, not vs D1

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

- **Issue.** The player Home said "Per round vs D1" and "strokes gained vs D1". Stored strokes gained is measured against the Tour; there is no D1 value (Q-88). The figure is the season's, and the legs' header said "Last 10 rounds".
- **Fix.** "Season, per round vs Tour" and "Last 10 rounds · strokes gained this season vs Tour · D1 marks the stats" (the women's Tour baseline for a women's team; `ChPlayerHome.tour`).
- **Checked.** strokes-gained.test (2 cases), mutations caught for the label.

## 2026-09-30 — Latest round opens its review (Clickables); Latest rounds links to Team stats (Clickables gap 6)

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

### Latest round opens its review (Clickables)

- **Issue.** Home's latest round linked to Stats, though the round review now exists.
- **Fix.** Open recap (desktop), Round recap (coach phone) and the player's phone card open the round's review, falling back to Stats when the review is not rebuilt for the viewer.
- **Checked.** home and player-home 94/94, 3 of 4 mutations caught (the fourth is equivalent today).

### Latest rounds links to Team stats (Clickables gap 6)

- **Issue.** The coach phone Home's Latest rounds header had no way on (the board's "All").
- **Fix.** It links to Team stats, only when rounds are listed (a coach has no rounds library, Q-79).
- **Checked.** home 58/58, 2 of 2 mutations caught.

## 2026-09-30 — Page docs; every contract proven by a test; two fixes

```text
Design package: design/handoff/ v2 (Coach - Home, Player - Home, and their phone boards)
PR/commit:      agent/clubhouse (this commit)
Contract IDs:   20101 to 22401 (60 on this page: 42 from the catalog, 18 new behaviour contracts without a code)
Actions:        13 (ACT-P002-*)
Data impact:    none
Held items:     none
```

### Changed

- The six page docs, the manifest's roles (coach and player), design files, tests and 13 actions, and the 18 behaviour contracts (the two Homes opening, links out, the clock, an unknown timezone, which Home a role gets, the team from the session, the player's own rounds only, a player's week naming no one, Message coach finding the coach, each role's own controls, Try again, the haptic grammar, the countdown's timer, the phone Home, loaders that never throw, failures reported, the tests).
- `home.test.tsx` now renders the real dashboard page for both roles (only the session, the flag and the request-scoped team resolvers are faked) and `player-home.test.tsx` covers what the player's loader reads and whom it names. Existing tests carry the new IDs in their titles; no assertion was weakened.
- The catalog and checklist headers name both roles.

### Fixed

- A stored team timezone that is not a real zone threw a `RangeError` in `homeClock` and failed the whole page. It now reads as Eastern, like a missing one, and is logged as `clubhouse.home.timezone` (20618). The test failed before the fix.
- The player's countdown was named "Starts in 1 days" for a screen reader. It now says "1 day" (21807). The expected string in the existing test changed to match, on purpose.

### Why

- D-62 and D-69: every page copies the Messages gold standard and answers every category, and Permission has to be real now that Home serves two roles from one address.

### Verification

- `npx vitest run` on `home.test.tsx` and `player-home.test.tsx` 90/90; `npm run -s typecheck:fast` exit 0; `npx eslint` on the changed files exit 0; 57 mutation checks, each failing the test that guards it (VERIFY.md).

## 2026-09-30 — Message coach finds the team's creating coach

```text
PR/commit: c7810ccf4
Contract IDs: 20805 (documented here)
```

### Changed

- `golf_teams.created_by` is a `golf_coaches.id`, not a user id (true of all ten live teams), so the lookup always fell back to whichever coach of the organisation came first. `coachFor` now matches it against `golf_coaches.id` and returns that coach's `user_id`.
- A loader test that a player's week names no teammates, only a count.

## 2026-09-30 — Player Home

```text
PR/commit: 4c7b2e8fc
Contract IDs: CH-2215 to CH-2217, CH-2310 to CH-2313 (new catalog rows); CH-2309 extended
```

### Changed

- `PlayerHome`, `PlayerHomePhone`, `PlayerGame` and `Countdown`, from `loadPlayerHome`, on the owner's `Player - Home.html` and `Player - Home - Mobile.html` (spec `phone/home-player.md`). The player's own rounds only; the week through `loadHomeWeek`, now shared with Coach Home along with `homeClock` and `latestWithHoles`.
- Message coach opens the coach's thread through a new Messages deep link, `?user=` (CH-7001). `/golf/dashboard` is now rebuilt for players.
- Gaps against the boards logged as Q-69.

## 2026-09-30 — v2 phone and first-run page

### Changed

- `HomePhone` on the owner's v2 phone board (spec `phone/home.md`): the hero, Up next, Today, the team's scoring form, This week and Latest rounds, each round opening its card in a sheet. The loader gains `phone`. New catalog rows CH-2211 to CH-2214, CH-2308 and CH-2309; gaps logged as Q-66.
- The v2 first-run page empty state on desktop and phone (CH-2308, D-71).

## 2026-09-29 — Fidelity pass and desktop build

### Changed

- Coach Home on `Coach Home v3`: the week and the latest round in one sheet, the leaderboard, and the full state catalog (CH-22xx to CH-28xx). The fidelity pass (D-17) added the brief under the greeting, Message team and New event (D-4), the agenda's invitee details and "5 of 6 confirmed", "No rounds 9 days", the Full roster arrow and the player stats link, compared side by side at 1280px.
