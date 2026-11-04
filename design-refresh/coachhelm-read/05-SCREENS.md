# 05. CoachHelm read: screen inventory

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 31 rows).

Every screen, subscreen, pushed page, sheet, menu, popover and inline state the read can put on screen. The IDs here are the ones 06, 07, 08 and `capture/capture.mjs` use. Where this file and `04-FIDELITY-SPEC.md` disagree, this file wins.

Design page: https://claude.ai/artifact/SUL5hLtah5MmBd2dkU8mTK (version 5, 3 Nov). Local copy: `redesign/coachhelm-read.html`. Every anchor below works on both: paste it after the URL or after the file name.

## How the design anchors work

```
#<screen>-<read>-<viewer>-<phone|desk>-<light|dark>[-reduce][-xxl][-w430][-<state>][-shot]
```

- `screen`: `board`, `read`, `where`, `why`, `sure`, `moved`, `rounds`, `do`, `assigned`. Every name but `board` opens the read and scrolls to that card.
- `read`: `approach` (Priya, a likely cause), `penalties` (Eli, a counted path), `putts` (Jonah, not traced yet and counting down).
- `viewer`: `coach` or `player`.
- `state`: one of the 18 page states in the studio's State menu: `loading`, `assigning`, `proposed`, `declined`, `noassign`, `stale`, `dismissed`, `more`, `notthis`, `answered`, `answerfail`, `allrounds`, `notrend`, `partfail`, `failed`, `gone`, `nopool`, `long`. Leave it out for the normal read.
- `shot` frames the device alone at the app's size (390×844, 430×932 with `-w430`, 1440×900 on desktop), which is what `capture.mjs` shoots.
- Six more states are drawn as cards in the page's "Every state a read can be in" gallery, each with its own anchor: `#state-out-of-date`, `#state-not-enough-yet-count-down`, `#state-not-traced-a-shot-tag-is-thin-data-gap`, `#state-cleared`, `#state-contradicted-coach-only-for-a-day`, `#state-under-review`, `#state-didn-t-load-one-part`. Each card has a "See it on the phone" link where the phone draws it too.

Examples: `#read-approach-coach-phone-light-more-shot` (the More sheet), `#board-putts-player-phone-dark-loading` (board skeleton), `#read-approach-coach-desk-light-more-shot` (desktop popover).

## How the app gets there

Preview route (added by PR 1, 02 §3.9):

```
/clubhouse-preview/coachhelm-read?q=approach|penalties|putts&viewer=coach|player&screen=read|board&state=<state>[&text=xxl]
```

The page states and the preview states share names except three: the design's `nopool` is the preview's `teampooloff`, the design's `partfail` is the preview's `roundsfailed`, and the design's `notthis`, `answered`, `answerfail`, `more`, `allrounds`, `notrend` and `dismissed` are new preview states marked "add" below (the PR that builds each screen adds its state to the 02 §3.9 list: CR2 for the phone states, CR3 for the desktop More, CR4 for the board's dismissed). In the real app the read is `/golf/dashboard/coachhelm?view=read&player=<id>&insight=<id>` for a coach and `?view=read&insight=<id>` for a player, behind `coachhelm_read_v1`.

## Screen table

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| `S-DIVE.why` | inline section (fix only) | Today's Deep dive, Why section | Not drawn: a fix to today's screen | `/clubhouse-preview/coachhelm-views?view=deep-dive&state=engine&q=in-slope`, player viewer | Player must see no arm counts for a likely cause; coach unchanged | CR0 |
| `S-READ-BOARD` | card on a host board | Host board loads (coach player page, player CoachHelm) (fixed 4 Nov: the Team inspector hosts the shared read sheet, not this card; Lenses keeps its own feature card, see Completeness pass) | https://claude.ai/artifact/SUL5hLtah5MmBd2dkU8mTK#board-approach-coach-phone-light-shot | `?screen=board&q=approach&viewer=coach` | Both. Coach: "{first} · {area}", tier word Counted, Likely or Not traced. Player: "{area}", tier word Seen in your shots, Where or Not traced, no count on a likely line | CR4 |
| `S-READ-BOARD.actions` | inline row under the card | Under `S-READ-BOARD`, coach only | …#board-approach-coach-phone-light-shot (row under the card) | `?screen=board` | Coach: Assign as focus and More. Player: absent from the DOM | CR4 |
| `S-READ-BOARD.dismissed` | inline state | Coach taps More, then Dismiss this read | …#board-approach-coach-phone-light-dismissed-shot | `?screen=board&state=dismissed` (add) | Coach only | CR4 |
| `S-READ-BOARD.loading` | inline state | Host board while the feed loads | …#board-approach-coach-phone-light-loading-shot | `?screen=board&state=loading` | Both. Only the card and its action row are this lane's; the host's own list loads on its own | CR4 |
| `S-READ` | push (full page) | Tap anywhere on `S-READ-BOARD` (one tab stop, Enter or Space) | …#read-approach-coach-phone-light-shot | `?screen=read&q=approach&viewer=coach` | Both. Back label: player's first name for a coach, "CoachHelm" for a player. Bar title: the area | CR1 shell, CR2 cards |
| `S-READ.head` | card (feature, first on the page) | Top of `S-READ` | …#read-approach-coach-phone-light-shot | `?screen=read` | Both. Player sees "You" in the ladder and no cause line | CR1 |
| `S-READ.where` | card | Second card on `S-READ` | …#where-approach-coach-phone-light-shot | `?screen=read`, scroll to `[data-ch-hr-card="where"]` | Both while `READ_CALLS.playerFunnel` is true. Observed counts only | CR2 |
| `S-READ.why` | card | Third card | …#why-approach-coach-phone-light-shot | `[data-ch-hr-card="why"]` | Coach: three-step stepper, both arms, verdict. Player: two steps, verdict "Not traced yet.", no `arms`, `verdict`, `range` or `rung` in the payload | CR2 |
| `S-READ.sure` | card | Fourth card | …#sure-approach-coach-phone-light-shot | `[data-ch-hr-card="sure"]` | Coach: Sample against its target, rung and range in a "Coach only" well. Player: Sample count with no target, no well | CR2 |
| `S-READ.sure.corrections` | inline row at the foot of How sure | Foot of `S-READ.sure`, when `coachhelm_corrections_v1` is on | …#sure-approach-coach-phone-light-shot | `[data-ch-hr-card="sure"]` | Coach chips: Not this, Wrong cause, Already on it, Show later, Good read. Player chips: Not this, Good read | CR2 |
| `S-READ.sure.reasons` | inline expand | Tap Not this | …#sure-approach-coach-phone-light-notthis-shot | `&state=notthis` (add) | Both. Reasons: It's wrong, Not important, Already known, No reason | CR2 |
| `S-READ.sure.answered` | inline state | Pick a reason, or tap any other chip | …#sure-approach-coach-phone-light-answered-shot | `&state=answered` (add) | Both. "Your answer: Not this, it's wrong." with Change | CR2 |
| `S-READ.sure.answerfail` | inline state | The answer write fails | …#sure-approach-coach-phone-light-answerfail-shot | `&state=answerfail` (add) | Both. "That answer didn't save. Try again." (CH-13971) | CR2 |
| `S-READ.moved` | card | Fifth card | …#moved-approach-coach-phone-light-shot | `[data-ch-hr-card="moved"]` | Coach on the design page; the player sees the same card when a trend is stored (01 rules: own figures only) | CR2 |
| `S-READ.moved.notrend` | inline state | Read has no stored movement | …#moved-approach-coach-phone-light-notrend-shot | `&state=notrend` (add) | Both. "No trend yet" (CH-13383 wording), no chart | CR2 |
| `S-READ.rounds` | card | Sixth card | …#rounds-approach-coach-phone-light-shot | `[data-ch-hr-card="rounds"]` | Coach on the design page; a player sees their own rounds | CR2 |
| `S-READ.rounds-all` | inline expand | Tap "Show all 9" | …#rounds-approach-coach-phone-light-allrounds-shot | `&state=allrounds` (add) | Both. Expands in place, newest 8 at most, "Show fewer" folds it | CR2 |
| `S-READ.do` | card | Last card | …#do-approach-coach-phone-light-shot | `[data-ch-hr-card="do"]` | Coach: Assign as focus, More, Message. Player: drill and targets, no Assign in the DOM | CR2 |
| `S-READ.assigning` | inline state | Coach taps Assign as focus | …#do-approach-coach-phone-light-assigning-shot | `&state=assigning` (add) | Coach only. Button shows a spinner and "Assigning…" (CH-13403 wording) | CR2 |
| `S-READ.assigned` | inline state | Assign write succeeds | …#assigned-approach-coach-phone-light-shot | `&state=assigned` | Coach only. "Assigned as Priya's focus" with a drawn tick | CR2 |
| `S-READ.proposed` | inline state | Player hasn't accepted yet | …#do-approach-coach-phone-light-proposed-shot | `&state=proposed` | Coach only. "Assigned as {first}'s focus" plus "{first} sees it as a proposal and accepts it to start." (CH-13601) | CR2 |
| `S-READ.declined` | inline state | Player declined the focus | …#do-approach-coach-phone-light-declined-shot | `&state=declined` | Coach only. "{first} declined this as a focus. Propose again sends it back as a new proposal." (CH-13907) | CR2 |
| `S-READ.noassign` | inline state | Focus writes unavailable | …#do-approach-coach-phone-light-noassign-shot | `&state=failwrites` | Coach only. CH-13207 sentence; Dismiss still works | CR2 |
| `S-READ.dismissed` | inline state | Coach taps More, then Dismiss this read | …#read-approach-coach-phone-light-dismissed-shot | `&state=dismissed` (add) | Coach only. Notice at the top with Undo (CH-13901), stance chip reads Dismissed | CR2 |
| `S-READ.more` | sheet (action sheet, hugs content, 8pt from the edges) | Tap the ⋯ button on the green bar | …#read-approach-coach-phone-light-more-shot | `&state=more` (add) | Coach: Dismiss this read (red), Message {first}, Ask CoachHelm about this, Copy a link to this read, Cancel. Player: Ask and Copy, Cancel. Ask shows only once `askAboutReadHref` exists (fixed 4 Nov: matches the link chips in 06 §10 and 08 S-READ.do 5) | CR2 |
| `S-READ.copied` | toast | Copy a link to this read | Not drawn. Build rule: today's Clubhouse toast, "Link copied", 2.4s | none | Both | CR2 |
| `S-READ.stale` | inline state (headline) | The player has a round newer than the read | …#read-approach-coach-phone-light-stale-shot, gallery `#state-out-of-date` | `&state=stale` | Both. Stance chip "Out of date", title greys, CH-13903 sentence, no Assign (CH-13906) | CR5 |
| `S-READ.countdown` | inline state (Why) | Read not traced yet, counting down | …#why-putts-coach-phone-light-shot, gallery `#state-not-enough-yet-count-down` | `?q=putts&state=countdown` | Both. Ten segments, "Nothing new is asked. It fills as Jonah plays." (player: "as you play") | CR2 |
| `S-READ.gap` | inline state (Why) | A shot tag is too thin to trace | Gallery `#state-not-traced-a-shot-tag-is-thin-data-gap` | `&state=gap` (add) | Both. A ring 4 of 14 filled (have plus still needed); only for reads with a shot path | CR2 |
| `S-READ.cleared` | inline state | The recheck cleared the read | Gallery `#state-cleared` | `&state=cleared` | Both. "Cleared {date}" with the recheck's numbers, no actions | CR5 |
| `S-READ.contradicted` | inline state | A newer round goes against the read | Gallery `#state-contradicted-coach-only-for-a-day` | `&state=contradicted` | Coach at once, player after a day | CR5 |
| `S-READ.underreview` | inline state | Coach marked Wrong cause | Gallery `#state-under-review` | `&state=underreview` | Both. A chip on the headline | CR5 |
| `S-READ.partfail` | inline state | One part of the read failed to load | …#read-approach-coach-phone-light-partfail-shot, gallery `#state-didn-t-load-one-part` | `&state=roundsfailed` | Both. Banner under the headline (CH-13208) plus the notice inside the Rounds card (CH-13281) | CR2 |
| `S-READ.loading` | inline state (whole page) | Opening the read while it loads | …#read-approach-coach-phone-light-loading-shot | `&state=loading` | Both. Card outlines at final heights in final order | CR1 |
| `S-READ.failed` | inline state (whole page) | The read fails to load | …#read-penalties-coach-phone-light-failed-shot | `&state=failed` | Both. "This read didn't load", Try again, CH-13866 (fixed 4 Nov wiring: CH-13860 is taken in the catalog) | CR1 |
| `S-READ.gone` | inline state (whole page) | The read was cleared or dismissed after the link was made | …#read-approach-coach-phone-light-gone-shot | `&state=gone` | Both. "This read is no longer open", Back to {first} or CoachHelm, CH-13861 | CR1 |
| `S-READ.nopool` | inline state (ladder) | No team pool line, or `READ_CALLS.teamPoolOnLadder` off | …#read-approach-coach-phone-light-nopool-shot | `&state=teampooloff` | Both. Ladder shows the player and the Tour only | CR1 |
| `S-READ.long` | inline state | Longest real name and a long title | …#read-putts-coach-phone-light-long-shot | `&state=long` | Both. Names wrap, never truncate | CR5 |
| `S-READ-DESK` | screen (desktop, three columns) | Same link on a window 1180pt wide or more | …#read-approach-coach-desk-light-shot | `?screen=read` at 1440×900 and 1280×800 | Both. Crumbs show the player's name for a coach only | CR3 |
| `S-READ-DESK.rail` | column | Left column of `S-READ-DESK` | …#read-approach-coach-desk-light-shot | same | Coach: Priya, Eli, Jonah switcher, tier words on rows. Player: own reads, no switcher, no tier word | CR3 |
| `S-READ-DESK.more` | popover (250pt, top right) | Click ⋯ in the glass bar | …#read-approach-coach-desk-light-more-shot | `&state=more` (add) | Coach: Dismiss this read, Copy a link, Close. Player: Copy a link, Close | CR3 |
| `S-READ-DESK.jump` | inline state (ring) | A jump link or a rail row scrolls to a card | Studio Play buttons, desktop | none (motion only) | Both | CR5 |

The plan's other preview states each map to a row above and need no new screen: `noladder` (headline without the ladder), `nofunnel` (Where absent), `funnelstopped` and `funnelunparsed` (Where variants), `eli-likely` and `legacy` and `loadfailed` (Why variants), `nodrill` and `nostrokes` (Do variants), `themesfailed` and `plansfailed` (notices inside Moved and Do), `verdict` and `duplicate` (Do variants), `words` (pictures off), `off`, `notonteam`, `scopefailed` (today's route screens). Each is listed in its parent's matrix.

## State matrices

Every capture writes light and dark, so dark is a column of every row, not a row of its own. "Capture state" is the `--state` value for `capture.mjs`; each one fixes the read, viewer, width and Text Size (see the table at the end). "Not drawn" means the design page doesn't draw it and the rule says what to build.

### S-DIVE.why

| Row | Drawn? | Capture state | Rule |
|---|---|---|---|
| Default (player, likely cause) | Not drawn | `player` (app only) | "Not traced yet", no arm count or percentage |
| Coach | Not drawn | `default` (app only) | Pixel-equal to 75b4956 |
| Everything else | Not drawn | none | Today's Deep dive, unchanged |

### S-READ-BOARD

| Row | Drawn? | Capture state | Rule |
|---|---|---|---|
| Default | `#board-approach-coach-phone-light-shot` | `default` | Feature card with headline, hero, ladder, cause line, worth, footer, Open row |
| Counted, coach | `#board-penalties-coach-phone-light-shot` | `penalties` | Tier chip "Counted" in gain |
| Count-down, coach | `#board-putts-coach-phone-light-shot` | `putts` | Tier chip "Not traced", no worth anchor |
| Player | `#board-approach-player-phone-light-shot` | `player` | "{area}" kicker, "You" in the ladder, no count on the cause line |
| Loading | `#board-approach-coach-phone-light-loading-shot` | `loading` | Feature outline 330pt, action row outline 46pt, both at final size, pulse stops under Reduce Motion |
| Empty | n/a | none | No open read means no card; the host shows its own empty state |
| Error | Not drawn | `failed` (app) | The host's error; the card is absent, never half-drawn |
| Long text | `#board-putts-coach-phone-light-long-shot` | `long` | Title wraps to as many lines as it needs; hero number stays on one line |
| Lots of items | n/a | none | One card per view (02 §6.1); other reads live in the host's list |
| One item | = default | `default` | Same card |
| Stale | `#board-approach-coach-phone-light-stale-shot` | `stale` | Chip "Out of date", title in secondary ink |
| XXL | `#board-approach-coach-phone-light-xxl-shot` | `xxl` | Card grows; ladder labels move under the track; nothing clips |
| Reduce Motion | `#board-approach-coach-phone-light-reduce-shot` | `reduce` | Same picture; press has no scale, push becomes a `CH_FADE_MS` fade |
| Phone 390 | = default | `default` | 16pt page edge |
| Phone 430 | `#board-approach-coach-phone-light-w430-shot` | `w430` | 20pt page edge |
| Desktop 1280 | Not drawn as a board card | none | The desktop opens straight into `S-READ-DESK` |

### S-READ-BOARD.actions and .dismissed

| Row | Drawn? | Capture state | Rule |
|---|---|---|---|
| Default (coach) | `#board-approach-coach-phone-light-shot` | `default` | Assign as focus (primary, fills) and More (ghost) side by side, 10pt apart |
| Player | `#board-approach-player-phone-light-shot` | `player` | Row absent from the DOM |
| Dismissed | `#board-approach-coach-phone-light-dismissed-shot` | `dismissed` | The card is replaced by the notice "Insight dismissed. It no longer shows on your board or on Priya's. Undo brings it back." with Undo |
| Assigned | Not drawn on the board | `assigned` (app) | The row becomes the same Assigned chip as `S-READ.assigned` |
| Stale | `#board-approach-coach-phone-light-stale-shot` | `stale` | No Assign; More still offers Dismiss |
| XXL, 430, dark, Reduce Motion | as `S-READ-BOARD` | `xxl`, `w430`, `reduce` | Buttons grow taller, labels never truncate |

### S-READ (the pushed page and its bar)

| Row | Drawn? | Capture state | Rule |
|---|---|---|---|
| Default | `#read-approach-coach-phone-light-shot` | `default` | Green bar (44 + 48 + lip), then cards in the 05 order, 20pt apart |
| Counted | `#read-penalties-coach-phone-light-shot` | `penalties` | Bar title "Course and scoring" |
| Count-down | `#read-putts-coach-phone-light-shot` | `putts` | Bar title "Putting" |
| Player | `#read-approach-player-phone-light-shot` | `player` | Back label "CoachHelm"; ⋯ opens the player sheet |
| Loading | `#read-approach-coach-phone-light-loading-shot` | `loading` | Bar drawn in full; four outlines: 360 (feature), 250, 270, 240 |
| Empty | n/a | none | A read always has a headline; an absent card is left out |
| Error | `#read-penalties-coach-phone-light-failed-shot` | `failed` | One card, CH-13866 (fixed 4 Nov wiring: CH-13860 is taken in the catalog), Try again |
| Gone | `#read-approach-coach-phone-light-gone-shot` | `gone` | One card, CH-13861, Back |
| Part failed | `#read-approach-coach-phone-light-partfail-shot` | `partfail` | One banner under the headline, the failing card keeps its own notice |
| Long text | `#read-putts-coach-phone-light-long-shot` | `long` | Back label "Alexandria" fits; bar title stays one line, centred, ellipsis only if it would hit the back label |
| Lots of items | `#read-approach-coach-phone-light-allrounds-shot` | `allrounds` | Rounds card grows to 8 rows; the page scrolls, the bar stays put |
| One item | Not drawn | none | One round, one step, one hole: each card shows the one it has, no "Show all" |
| Stale | `#read-approach-coach-phone-light-stale-shot` | `stale` | See `S-READ.stale` |
| XXL | `#read-approach-coach-phone-light-xxl-shot` | `xxl` | Everything grows; bar title and back label follow Text Size |
| Reduce Motion | `#read-approach-coach-phone-light-reduce-shot` | `reduce` | Same picture |
| Phone 430 | `#read-approach-coach-phone-light-w430-shot` | `w430` | 20pt edge, bar padding 20pt |
| Desktop 1280 | see `S-READ-DESK` | none | |

### S-READ.head

| Row | Drawn? | Capture state | Rule |
|---|---|---|---|
| Default | `#read-approach-coach-phone-light-shot` | `default` | Kicker, stance chip, headline, lede, hero, ladder with Team pool and Tour, worth, footer |
| Counted | `#read-penalties-coach-phone-light-shot` | `penalties` | Hero "1.1", ladder with team pool 0.6 and Tour 0.3 |
| Count-down | `#read-putts-coach-phone-light-shot` | `putts` | Ladder compares Downhill to Level; worth has no anchor |
| Player | `#read-approach-player-phone-light-shot` | `player` | "You 43%" |
| No team pool | `#read-approach-coach-phone-light-nopool-shot` | `nopool` | Two marks: the player and the Tour |
| No ladder | Not drawn | `noladder` (app) | Hero and lede only; no empty SVG |
| Stale | `#read-approach-coach-phone-light-stale-shot` | `stale` | "Out of date" chip, title and hero in `--f-ink-2`, CH-13903 sentence under a hairline |
| Dismissed | `#read-approach-coach-phone-light-dismissed-shot` | `dismissed` | Chip reads "Dismissed" |
| Assigned | `#assigned-approach-coach-phone-light-shot` | `assigned` | Chip reads "Assigned" |
| Long text | `#read-putts-coach-phone-light-long-shot` | `long` | Title wraps; ladder labels split when closer than 76 units |
| XXL | `#read-approach-coach-phone-light-xxl-shot` | `xxl` | Ladder text capped at 1.2× and moves under the track; margins grow with it |
| Dark, 430, Reduce Motion | as `S-READ` | `w430`, `reduce` | Ladder draws at final size under Reduce Motion |

### S-READ.where

| Row | Drawn? | Capture state | Rule |
|---|---|---|---|
| Default | `#where-approach-coach-phone-light-shot` | `default` | Three steps 28, 16, 12, then the words-only Miss shape row |
| Counted | `#where-penalties-coach-phone-light-shot` | `penalties` | Eli's steps |
| Count-down | `#where-putts-coach-phone-light-shot` | `putts` | Jonah's steps |
| Player | `#where-approach-player-phone-light-shot` | `player` | Same counts, "you" voice |
| No narrowing | Not drawn | `nofunnel` (app) | Card absent |
| Stopped | Not drawn | `funnelstopped` (app) | Ends on the last passed step with "Not narrowed further: …"; footer count line absent |
| Unparsed | Not drawn | `funnelunparsed` (app) | Statement shown, no bar |
| Loading, error | inherit `S-READ` | `loading`, `failed` | |
| Long text | `#where-putts-coach-phone-light-long-shot` | `long` | Step label wraps; the count stays on the first line, right aligned |
| One step | Not drawn | none | One bar at full length in loss fill |
| XXL | `#where-approach-coach-phone-light-xxl-shot` | `xxl` | Bars stay 12pt; text grows |
| Dark, 430, Reduce Motion | `-dark`, `-w430`, `-reduce` | `w430`, `reduce` | Bars at final length under Reduce Motion |

### S-READ.why

| Row | Drawn? | Capture state | Rule |
|---|---|---|---|
| Likely, coach | `#why-approach-coach-phone-light-shot` | `default` | Stepper of three, two dot rows, verdict with the slice, chip "Likely" |
| Counted | `#why-penalties-coach-phone-light-shot` | `penalties` | Path of nodes, hole chips, cost line, chip "Counted" |
| Count-down | `#why-putts-coach-phone-light-shot` | `putts` | Ten segments, six filled |
| Player, likely | `#why-approach-player-phone-light-shot` | `player` | Two-step stepper, verdict "Not traced yet." |
| Data gap | Gallery `#state-not-traced-a-shot-tag-is-thin-data-gap` | `gap` | A ring 4 of 14 filled |
| Shot records not read | Not drawn | `loadfailed` (app) | "Shot records could not be read this run" in the card |
| Legacy | Not drawn | `legacy` (app) | Today's drivers list in this card's markup |
| Eli likely | Not drawn | `eli-likely` (app) | Same as the likely row with Eli's arms |
| Long, XXL | `-long`, `-xxl` | `long`, `xxl` | Dots wrap to more rows; path labels wrap under their node |
| Dark, 430, Reduce Motion | `-dark`, `-w430`, `-reduce` | `w430`, `reduce` | Marks at final size |

### S-READ.sure and its corrections row

| Row | Drawn? | Capture state | Rule |
|---|---|---|---|
| Default | `#sure-approach-coach-phone-light-shot` | `default` | "Solid read", three bars, checked list, Coach only well, corrections row |
| Player | `#sure-approach-player-phone-light-shot` | `player` | Sample "28 approaches", no well, two chips |
| Recent not measured | Not drawn | none (unit test) | Recent row absent |
| Not this, picking why | `#sure-approach-coach-phone-light-notthis-shot` | `notthis` | Not this selected; reasons inline on a well |
| Answer saved | `#sure-approach-coach-phone-light-answered-shot` | `answered` | Chips replaced by "Your answer: …" and Change |
| Answer didn't save | `#sure-approach-coach-phone-light-answerfail-shot` | `answerfail` | Notice CH-13971 with Try again; chips stay |
| Corrections off | Not drawn | none | Row absent when `coachhelm_corrections_v1` is off |
| Long, XXL | `-long`, `-xxl` | `long`, `xxl` | Chips wrap to more lines; counts wrap under the label |
| Dark, 430, Reduce Motion | `-dark`, `-w430`, `-reduce` | `w430`, `reduce` | |

### S-READ.moved

| Row | Drawn? | Capture state | Rule |
|---|---|---|---|
| Default | `#moved-approach-coach-phone-light-shot` | `default` | Slope chart Before to Now, dashed Tour line, change sentence, trend chip |
| Counted | `#moved-penalties-coach-phone-light-shot` | `penalties` | Course management theme |
| No trend | `#moved-approach-coach-phone-light-notrend-shot` | `notrend` | "No trend yet", no chart |
| Themes failed | Not drawn | `themesfailed` (app) | Notice inside the card |
| Long, XXL | `-long`, `-xxl` | `long`, `xxl` | Trend chip wraps after the area, never inside "· Slipping" |
| Dark, 430, Reduce Motion | `-dark`, `-w430`, `-reduce` | `w430`, `reduce` | |

### S-READ.rounds and S-READ.rounds-all

| Row | Drawn? | Capture state | Rule |
|---|---|---|---|
| Default | `#rounds-approach-coach-phone-light-shot` | `default` | Four rows, then "Show all 9" |
| All open | `#rounds-approach-coach-phone-light-allrounds-shot` | `allrounds` | Eight rows ("Show newest 8 of 9"), then "Show fewer" |
| Rounds failed | `#read-approach-coach-phone-light-partfail-shot` | `partfail` | CH-13281 notice inside the card, Try again |
| One round | Not drawn | none | One row, no Show all |
| Long, XXL | `-long`, `-xxl` | `long`, `xxl` | Course name wraps; score stays right |
| Dark, 430, Reduce Motion | `-dark`, `-w430`, `-reduce` | `w430`, `reduce` | Expand is instant under Reduce Motion |

### S-READ.do and its focus states

| Row | Drawn? | Capture state | Rule |
|---|---|---|---|
| Default (coach) | `#do-approach-coach-phone-light-shot` | `default` | Drill tile, two target tiles, plan line, Assign as focus and More, link chips |
| Player | `#do-approach-player-phone-light-shot` | `player` | No Assign, no More, plan line "Your coach can make it one." when no plan |
| Assigning | `#do-approach-coach-phone-light-assigning-shot` | `assigning` | Spinner, "Assigning…", button disabled |
| Assigned | `#assigned-approach-coach-phone-light-shot` | `assigned` | Tick draws, chip "Assigned as Priya's focus" |
| Proposed | `#do-approach-coach-phone-light-proposed-shot` | `proposed` | Assigned chip plus the proposal sentence |
| Declined | `#do-approach-coach-phone-light-declined-shot` | `declined` | Notice plus "Propose again" |
| Not offered | `#do-approach-coach-phone-light-noassign-shot` | `noassign` | CH-13207 notice, Dismiss still in More |
| Stale | `#do-approach-coach-phone-light-stale-shot` | `stale` | CH-13906 sentence, no Assign |
| Dismissed | `#read-approach-coach-phone-light-dismissed-shot` | `dismissed` | Notice at the page top with Undo |
| No drill | Not drawn | `nodrill` (app) | "No drill assigned." |
| No strokes | Not drawn | `nostrokes` (app) | Worth tile absent |
| Plans failed | Not drawn | `plansfailed` (app) | Notice in place of the plan line |
| Duplicate | Not drawn | `duplicate` (app) | Assigned chip plus today's toast |
| Write failed | Not drawn | `verdict` and `failwrites` (app) | CH-13001 notice under the button |
| Long, XXL | `-long`, `-xxl` | `long`, `xxl` | Drill name wraps; buttons grow taller |
| Dark, 430, Reduce Motion | `-dark`, `-w430`, `-reduce` | `w430`, `reduce` | Tick shown without drawing under Reduce Motion |

### S-READ.more (phone action sheet)

| Row | Drawn? | Capture state | Rule |
|---|---|---|---|
| Coach | `#read-approach-coach-phone-light-more-shot` | `more` | Title row (the read's title), four actions, Cancel group 8pt below |
| Player | `#read-approach-player-phone-light-more-shot` | `player-more` | Title row, Ask and Copy, Cancel |
| Long text | Not drawn (one state at a time on the page) | none | Title row wraps to two lines, then ellipsis |
| XXL | `#read-approach-coach-phone-light-xxl-more-shot` | `xxl-more` | Rows grow from 57pt |
| Dark | `-dark-more` | `more` | Sheet groups on 94% card with 20px blur |
| Reduce Motion | `-reduce-more` | `more` | `CH_FADE_MS` fade in and out, no travel |
| 430 | `-w430-more` | `w430-more` | 8pt inset on every width |
| Desktop | see `S-READ-DESK.more` | | |

### S-READ-DESK, .rail, .more, .jump

| Row | Drawn? | Capture state | Rule |
|---|---|---|---|
| Default, coach | `#read-approach-coach-desk-light-shot` | `desk` | 232 sidebar, 58 glass bar, columns 250 / fill / 320 |
| Player | `#read-approach-player-desk-light-shot` | `desk-player` | No switcher, crumbs without a name, no Message |
| Counted, count-down | `#read-penalties-coach-desk-light-shot`, `#read-putts-coach-desk-light-shot` | `desk-penalties`, `desk-putts` | Rail row moves to its group |
| More open | `#read-approach-coach-desk-light-more-shot` | `desk-more` | Popover 250pt under the ⋯ button |
| Loading | `#read-approach-coach-desk-light-loading-shot` | `desk-loading` | Rail stays; middle and right columns show outlines |
| Failed, gone | `-failed`, `-gone` | `desk-failed`, `desk-gone` | One card in the middle column; right column empty |
| Part failed | `#read-approach-coach-desk-light-partfail-shot` | `desk-partfail` | Banner at the top of the middle column |
| Long text | `#read-putts-coach-desk-light-long-shot` | `desk-long` | Crumbs and rail rows wrap; glass bar stays 58pt with the crumb truncating first |
| Lots of reads | Not drawn | none | Rail groups grow; the column scrolls on its own; cleared reads collapse to "N more cleared" after 3 |
| XXL | Not drawn | none | Desktop follows the browser's text size; the columns stay and rows grow |
| Dark | `-dark` | `desk` | |
| Reduce Motion | `-reduce` | `desk` | Rail swap is a `CH_FADE_MS` fade |
| 1280 | Not drawn (same layout as 1440) | `desk-1280` (app only) | Three columns from 1180pt; no horizontal scroll at 1280 and 1024 |

## Capture states

`capture.mjs --state` takes these. Each fixes the read, the viewer, the width, Text Size and the page state, so the file name `<ID>__<state>__<design|app>__<light|dark>.png` says everything.

| State | Read | Viewer | Width | Text Size | Page state |
|---|---|---|---|---|---|
| `default` | approach | coach | 390 | default | normal |
| `penalties` | penalties | coach | 390 | default | normal |
| `putts` | putts | coach | 390 | default | normal |
| `player` | approach | player | 390 | default | normal |
| `player-penalties` | penalties | player | 390 | default | normal |
| `player-putts` | putts | player | 390 | default | normal |
| `w430` | approach | coach | 430 | default | normal |
| `xxl` | approach | coach | 390 | XXL (1.353) | normal |
| `reduce` | approach | coach | 390 | default | normal, Reduce Motion |
| `loading` … `long` | approach (putts for `long`, penalties for `failed`) | coach | 390 | default | the page state of the same name |
| `player-more` | approach | player | 390 | default | more |
| `xxl-more`, `w430-more` | as named | coach | as named | as named | more |
| `gap`, `cleared`, `contradicted`, `underreview` | approach | coach | gallery card on the design side, 390 on the app side | default | the gallery state |
| `desk`, `desk-player`, `desk-penalties`, `desk-putts`, `desk-more`, `desk-loading`, `desk-failed`, `desk-gone`, `desk-partfail`, `desk-long` | as named | as named | 1440×900 | default | as named |
| `desk-1280` | approach | coach | 1280×800 | default | normal (app only) |
| `noladder`, `nofunnel`, `funnelstopped`, `funnelunparsed`, `legacy`, `loadfailed`, `eli-likely`, `nodrill`, `nostrokes`, `themesfailed`, `plansfailed`, `duplicate`, `verdict`, `failwrites`, `words` | approach (penalties for `eli-likely`) | coach | 390 | default | app only: the design side is skipped and listed |

## Completeness pass, 4 Nov 2026

Added after a front-to-back check of every ID against states, sizes, entry points, flags and the handoffs to Team, Lenses, Ask, Practice and Messages. Same shapes as above. Rows fixed in place carry `(fixed 4 Nov: ...)`; the log is in `lane-reports/coachhelm-read.md`.

### New inventory rows

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| `S-READ.notyours` | inline state (whole page) | A player opens a read link for another player's insight, or a coach opens one for a player not on their team | Not drawn | add `&state=notyours` | Both | CR1 |
| `S-READ.off` | flag off | Any read link with `coachhelm_read_v1` off | today's Deep dive | `?view=deep-dive` (today's) | Both | CR1 |

### S-READ.notyours

| Row | Drawn? | Capture state | Rule |
|---|---|---|---|
| Player | Not drawn | add `notyours` | The `S-READ.gone` error card in player words ("This read is no longer open" / "Your open reads are on your CoachHelm.", CH-13861) with Back to CoachHelm. Nothing of the other player loads: the route checks scope before the read query. |
| Coach, player not on team | Not drawn | `notonteam` | Today's not-on-team screen (CH-13311), as 08 S-READ.loading/.failed/.gone 5 already says. |

### S-READ (added rows)

| Row | Drawn? | Capture state | Rule |
|---|---|---|---|
| 821 to 1179 | Not drawn | add `w1024` | The desktop shell with two columns: rail and middle; the right column moves under the middle (as 06 §13). Breakpoint for three columns is 1180, the same as Team and Lenses. |
| Deep link, cold start | Not drawn | add `cold` | The page opens with no underlay. Back goes to the back label's place: the player's file for a coach (Lenses `playerFileHref` with its flag on, today's player page off), CoachHelm for a player. No push animation on first paint. |
| Notification | Not drawn | n/a | Today's insight notification lands on the board (`insight-notifier.ts:119`), not on this page; the read opens from the board as usual. |
| From Team | Not drawn | n/a | "Open the full read" in the Team read sheet pushes this page; Back returns to Team with the sheet closed and scroll kept. Back label stays the player's first name (Read 06 §14, settled). |
| From Lenses | Not drawn | n/a | "Open the full read" in the Lenses evidence sheet, or the file's All reads row with the read flag on, pushes this page; Back returns to the file at the same scroll. |
| Pull to refresh | Not drawn | n/a | Today's pull to refresh on the route; refreshed figures swap in place; charts that drew once don't draw again. |
| Scroll restore | Not drawn | n/a | Back from the round review (M-READ-26) returns to the same card and scroll. |
| Two devices | Not drawn | n/a | Assigned elsewhere: next load shows `assigned` or `proposed`; a second Assign is not sent. Dismissed elsewhere: next load shows `gone`. |
| Deleted mid-session | Not drawn | n/a | A write on a read that is gone answers with the gone card in place of the page. |
| 1 Aug rollover | Not drawn | n/a | Read windows are "last {n} rounds" and don't reset. Counts labelled "this season" reset on 1 Aug and read "—" until the first new-season round. |
| Timezone | Not drawn | n/a | Round dates are date-only and show as stored; "as of {date}" is the read's stored date. |
| Keyboard and screen reader | Not drawn | n/a | Tab order: back, title, bar buttons, then cards top to bottom; the board card is one tab stop (Enter or Space). Esc closes More and the desktop popover; focus returns to ⋯. VoiceOver reads each card's title first. |
| Share and print | Not drawn | n/a | Share is "Copy a link to this read" only. No print styles. |
| Offline | Not drawn | n/a | The page keeps what loaded; writes fail with today's CH-13001 toast; no stale chip unless the read is stale. |

### S-READ-BOARD (added rows)

| Row | Drawn? | Capture state | Rule |
|---|---|---|---|
| Hosts | n/a | n/a | Coach player page and the player's CoachHelm with `coachhelm_read_v1` on. With `coachhelm_player_file_v1` also on, the Lenses feature card is the top read on those boards and this card is not drawn (call for Nick, see report). Not drawn in Team. |
| Flag off | today's | n/a | Today's board card, byte for byte. |
| Player | Drawn | `player` | No action row in the DOM. |
| XXL | Not drawn | add `board-xxl` | Card grows, title wraps without a cap. |

### S-DIVE.why (added rows)

| Row | Drawn? | Capture state | Rule |
|---|---|---|---|
| Flag off | n/a | `engine` | CR0 ships with `coachhelm_read_v1` off too: it fixes today's Deep dive for every player. |
| Coach | n/a | `engine`, coach viewer | Unchanged. |

### S-READ.do (added rows)

| Row | Drawn? | Capture state | Rule |
|---|---|---|---|
| Message | Drawn | `default` | Opens today's compose to that player with no prefill. |
| Ask | Not drawn | n/a | "Ask CoachHelm about this" chip absent until Ask exports `askAboutReadHref` and its flag is on. |
| Add to practice | Not drawn | n/a | Absent until Practice exports `practicePlanHref` and `golf_practice_plans` is on (`coachhelm_practice_plans_v1` for CoachHelm plans). |
| Double submit | Live | `assigning` | A second tap while in flight does nothing; one write, one success feedback. |

### S-READ.cleared, .contradicted, .underreview (added rows)

| Row | Drawn? | Capture state | Rule |
|---|---|---|---|
| Cleared, flag | Gallery | `cleared` | Needs `coachhelm_recheck_v1`; with it off a cleared read opens as `gone`. |
| Contradicted, player before a day | Not drawn | add `contradicted-player-early` | The player sees the read as plain open, no Contradicted chip, until `COACH_FIRST_MS` passes. |
| Under review, coach | Gallery (player words) | `underreview` | Coach: chip only; their own answer shows in the corrections row. Player: chip plus "Your coach is checking this read. It stays visible but is not on your focus." |
