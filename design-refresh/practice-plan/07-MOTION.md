# 07 · Motion: CoachHelm practice plans (lane 6)

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 51 rows).

One row per interaction. Values are read off the design page's code (`redesign/coachhelm-practice.html`, the `A()`, `press()`, `arrive()`, `revealVz()`, `buildArt()`, `flyInto()`, `drainUndo()`, `edgeFlash()`, `okRing()` functions and the CSS transitions), not from memory. Where this file and `COACHHELM_PRACTICE_PLAN.md` §7 or 04 disagree, this file wins.

Curve tokens (app `tokens.css`, page name in brackets):

| Token | Value | Use |
|---|---|---|
| `--ch-ease` (`EASE`) | `cubic-bezier(.22,1,.36,1)` | fades, rises, press, colour |
| `--ch-ease-spring` (`SPRING`) | `cubic-bezier(.34,1.3,.64,1)`, slight overshoot, settles by the end of its duration | card settle, check pop, Told faces, banner, folder squash, switch thumb |
| `--ch-ease-spring-smooth` (`SMOOTH`) | `linear(0,.0418,.136,.2508,.3677,.477,.5739,.657,.7266,.7839,.8303,.8675,.8971,.9204,.9387,.953,.964,.9725,.9791,.9841,.988,.9909,.9931,.9948,.9961,.9971,.9978,.9983,.9988,1)`, no overshoot, settles at 100% of its duration | push, sheet up, height opens and folds, page into folder, drill fan |
| `--ch-dur-press` / `-quick` / `-base` | 110 / 180 / 260ms | press down, colour cross-fades, most arrivals |

Reduce Motion rule for every row (SHARED-6), as the page implements it in `A()`: a keyframe set that only changes opacity runs as a linear crossfade of `CH_FADE_MS` from `lib/motion.ts` (180ms today, Nick's 24 Oct call, pinned by `reduced-motion.test.tsx`; leave the test alone, and the page now uses 180ms to match); any set that moves, scales or resizes jumps to its end state. CSS transitions drop to 0.001ms. Loops (breathe, shimmer, sweep, spinner) stop. Timers (Undo ring, typing pace) keep their time, because they are not motion.

All motion is transform and opacity, except height on arrivals and folds (the FLIP-height exception in `clubhouse:css`). Nothing animates on re-render, scroll, or when data refreshes.

Clips: `node capture/capture.mjs --motion <ID>` writes `screenshots/clips/<ID>__{design,app}[__rm].webm`. "Frame" in the Check column is the moment to pause both clips on.

## Ask, phone and Mac

| ID | Screen | Trigger | Element(s) | Property | From → to | Duration | Curve | Delay / stagger | Interruptible | Reduce Motion | Haptic | Check |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-ASK-01 | S-ASK.thread | Send tapped (or Return) | coach bubble `.msg-me` | height; opacity, translateY | 0 → content height; 0 → 1, 6px → 0 | 260 | height SMOOTH; fade EASE | none | no, it is a new row | bubble appears; `CH_FADE_MS` fade | none | frame at 130ms: bubble half height, half opacity |
| M-ASK-02 | S-ASK.steps | a `data-progress` part arrives | step row `.st` | height; opacity, translateY | 0 → row (32); 0 → 1, 6px → 0 | 260 | SMOOTH; EASE | one row per part, as it arrives; never a timed stagger | no | row appears; `CH_FADE_MS` fade | none | row height 32 at 260ms |
| M-ASK-03 | S-ASK.steps | step is active | dot `.st .ic i`; label `.st .l` | transform; opacity | dot scale 1 → .6 → 1 (`@keyframes breathe`); label opacity 1 → .55 → 1 (`@keyframes shim`) | dot 1.2s loop; label 1.9s loop | ease-in-out | none | stops the moment the step finishes | static dot, no shimmer | none | dot at scale .6 at 600ms |
| M-ASK-04 | S-ASK.steps | step finishes | check `.ok`; fact line `.f` | stroke-dashoffset; opacity, translateY | 1 → 0; 0 → 1, 6px → 0 | check 240; fact 260 | EASE | fact starts with the check | no | check and fact crossfade `CH_FADE_MS` | none | check fully drawn at 240ms |
| M-ASK-05 | S-ASK.read-pictures | the read's envelope lands | skeleton → picture `.vz`; bars `.b`, `i.m`, `.bx i`; day `.d.on`; event `.d.ev`; drill cards `.dc` | opacity; transform | skeleton/picture crossfade 0 → 1; bars scaleX 0 → 1 (origin left); day scale .86 → 1 with opacity .4 → 1; event opacity .3 → 1; cards translateX(0) rotate(0) → their fan (±84px, ±5°) | crossfade 260; bars 360; day 360; event 260; fan 462 | crossfade EASE; bars EASE; day SPRING; fan SMOOTH | event 120 after the day; every bar grows together (no stagger) | no | picture appears whole; `CH_FADE_MS` fade | none | bars at full width at 360ms; fan open at 462ms |
| M-ASK-06 | S-ASK.intake | chip tapped | chip `.qo` | transform; background-color, color | scale 1 → .97 → 1; well → accent fill, ink → ivory | press 390 total (110 down, 280 back); colour 180 | EASE | none | a second tap retargets from the current scale | fill changes at once | none | frame at 110ms: scale .97; fill done by 180 |
| M-ASK-07 | S-ASK.intake-folded | Build the plan pressed | intake card; coach bubble | card opacity then height; bubble as M-ASK-01 | card 1 → 0, then height → 0; bubble 0 → content | card fade 160 then height 260; bubble 260 | fade EASE; height SMOOTH | bubble starts as the card's height starts | no, the turn is sent | card disappears; bubble `CH_FADE_MS` fade | none | at 160ms card is invisible, height still full |
| M-ASK-08 | S-ASK.steps | turn ends (500ms after the last step) | rows `.rows`; header text; chevron | height, opacity; text; rotate | rows height → 0 and 1 → 0; header to "6 steps · 9s"; chevron 0 → −90° | 260 | SMOOTH | none | tapping the header while folding reopens from the current height | rows hide at once; header swaps with a `CH_FADE_MS` fade | none | rows gone at 260ms |
| M-ASK-09 | S-ASK.plan-card | each `practice-plan-block` part arrives | skeleton row → block `.blk`; write head ring | ring moves to the row; time `.tm` opacity; place, drills, Why `.bs .sl .why .rout` opacity, translateY | ring on; time 0 → 1; rest 0 → 1, 6px → 0 | ring 220 hold; time 200; rest 260 after the title finishes | EASE | blocks land one by one as parts arrive; the page shows 500ms before the first and 260ms between (server pacing, not a stagger) | Stop ends the stream; landed blocks stay | each block appears filled; no ring travel | none | block 3 frame: title complete, rest at mid rise |
| M-ASK-10 | S-ASK.plan-card | block title arrives | title `.btt` with caret | characters revealed | 0 → full title | per character max(8, round(300 / length)) ms, about 300ms a title | linear | none | no | full title at once | none | title complete about 300ms after it starts |
| M-ASK-11 | S-ASK.plan-card | a block lands | day strip segment `.strip i` | transform | scaleX 0 → 1, origin left | 360 | EASE | with its block | no | segment appears at full width | none | segment full at 360ms |
| M-ASK-12 | S-ASK.plan-card | last block written and checked | "Writing…" line `.building`; card `.art`; foot `.foot`; prose; refine chips | opacity; transform; height | building 1 → 0; card scale .98 → 1; foot, prose, chips arrive (M-ASK-01 shape) | building 160; settle 260; arrivals 260 | building EASE; settle SPRING; arrivals SMOOTH/EASE | foot with the settle; prose 350 after | no | building fades `CH_FADE_MS`; no scale; arrivals `CH_FADE_MS` fades | none | settle overshoot visible at about 160ms (scale ≈1.005) |
| M-ASK-13 | S-ASK.block-sheet, S-ASK.swap, S-ASK.evidence, S-FMT.upload-sheet, S-BLD.new-sheet | block, chip or button tapped; Done, Cancel or scrim tap | sheet `.psheet`; scrim `.scrimx` | transform; opacity | up: translateY(105%) → 0; scrim 0 → 1. Down: 0 → 105%; scrim 1 → 0 | up 462; scrim 280; down 280 | up SMOOTH; down EASE | none | follows the finger when dragged; release hands velocity to the spring; a tap on the scrim mid-rise reverses from the current position | sheet crossfades in `CH_FADE_MS`, no travel | none | sheet top at rest by 462ms |
| M-ASK-14 | S-ASK.swap | a drill option chosen | station line `.sline`; "Changed" chip; mix bar | opacity | old name 1 → 0; new name 0 → 1; chip arrives with it; mix bar .3 → 1 | 120 out; 180 in; mix 260 | EASE | in after out | no | same (already a crossfade) | none | at `CH_FADE_MS` old name gone |
| M-ASK-15 | S-ASK.block-sheet | stepper − or + | length value `.len`; block row | opacity | .3 → 1; row .4 → 1 | 120; 180 | EASE | none | each tap restarts from the current opacity | same | none | value readable by 120 |
| M-ASK-16 | S-ASK.full-plan, S-FMT.see | Open the full plan; Back | outgoing view; incoming layer | transform, filter | in: layer translateX(100%) → 0; base 0 → −24% (`CH_UNDERLAY_SHIFT` 0.24) and brightness 1 → 0.9. Back reverses it | 462 | SMOOTH | none | back mid-push reverses from the current position; the edge swipe tracks the finger | crossfade `CH_FADE_MS`, no slide | none | at 231ms layer at about 18% (SMOOTH is front-loaded) |
| M-ASK-17 | S-ASK.save-to | Save to row tapped | folder list `.flist` | height; opacity, translateY | 0 → list; 0 → 1, 6px → 0 | 260 | SMOOTH; EASE | none | a second tap folds it back from the current height | list appears; `CH_FADE_MS` fade | none | list open at 260ms |
| M-ASK-18 | S-ASK.save-to | New folder tapped; Create | New folder row → field `.inp`; caret; new folder row | opacity; caret blink | row .4 → 1; caret blink; created row .3 → 1, then list folds (M-ASK-17 reversed: opacity 160 then height 260) | 180; blink 1s loop; fold 160 + 260 | EASE; fold SMOOTH | none | Escape closes the field at once | no blink; fades `CH_FADE_MS` | none | field visible by 180ms |
| M-ASK-19 | S-ASK.saved, S-ASK.published, S-FMT.set | Save draft, Publish, Use this format pressed | buttons → capsule `.cap`; sweep `.sw2` | opacity, transform; sweep translateX | capsule .5 → 1 and scale .98 → 1; sweep loops left to right | capsule 280; sweep 900 loop | SMOOTH; sweep linear | none | buttons lock on the first tap | capsule appears; no sweep | none | capsule at rest 280ms |
| M-ASK-20 | S-ASK.saved, S-ASK.published | write succeeds | page token `.fdoc` into folder `[data-f]`; folder; count `.cnt` | transform, opacity; transform; opacity | page from the button: opacity 0 → 1, scale 1.1 → 1.04 (lift 14px at 20%) → .85 at the arc top (36px above, 60%) → .4 at the folder, opacity → 0. Folder scale(1,1) → (1.08,.94) → (1,1). Count .2 → 1 | flight 462; squash 300; count 180 | flight SMOOTH; squash SPRING; count EASE | squash and count start when the flight lands | no | no flight; folder fades .4 → 1 in `CH_FADE_MS`; count changes | none | flight landing frame at 462ms: folder at 1.08 × .94 |
| M-ASK-21 | S-ASK.saved, S-ASK.published | flight lands | card edge ring (inset 2px accent at 60%) | opacity | 1 → 0 | 900 | EASE | once | no | not shown | none | ring at half by about 200ms (EASE is front-loaded) |
| M-ASK-22 | S-ASK.saved, S-ASK.published, S-FMT.set | receipt appears | check `.ok`; ring | transform, opacity | check scale 0 → 1, opacity 0 → 1; ring scale 1 → 1.9, opacity .55 → 0 | check 300; ring 620 | check SPRING; ring EASE | ring starts with the check | no | check appears; ring not shown | none | ring gone at 620ms |
| M-ASK-23 | S-ASK.saved, S-ASK.published, S-FMT.set | receipt appears | Undo ring `.rg` | stroke-dashoffset | 0 → 1 (full → empty) | 8000 | linear | none | Undo cancels it; leaving the thread keeps the timer server-side (02 §7.3) | same: it is a timer | none | ring half empty at 4000ms; Undo fades 200ms at 8000 |
| M-ASK-24 | S-ASK.published, S-ASK.saved | the proposal card becomes the receipt | card height; content | height; opacity | old height → new; content .4 → 1 | height 360; content 260 | height SMOOTH; content EASE | none | no | height jumps; content crossfades `CH_FADE_MS` | none | card at new height by 360ms |
| M-ASK-25 | S-ASK.published | each notice is delivered (after Undo closes) | "Told" row; each face `.p`; Seen line | opacity; transform | row 0 → 1; face scale 0 → 1; Seen 0 → 1 | row 200; face 300; Seen 180 | row EASE; face SPRING | faces 90ms apart in delivery order, tracking real deliveries; not an entrance stagger | no | all faces appear at once | none | 11 faces: last face lands at 90 × 10 + 300 = 1200ms |
| M-ASK-26 | S-ASKD.pane-v2 | refine sent ("Make it 2 hours") | pane body `.pb`; version label; meta | opacity | body 1 → 0 then new body 0 → 1; "1 of 2" → "2 of 2" | out 120; in 180 | EASE | in after out | arrows move between versions with the same crossfade | same | none | at `CH_FADE_MS` body blank |
| M-ASK-27 | every button and tappable card | pointer down; up | `.btn-p .btn-s .btn-g .qo` and cards that open | transform | scale 1 → .97 (down), → 1 (up) | down 110; up 280 | EASE | none | release mid-press returns from the current scale | no scale | none | frame at 110ms: scale .97 |
| M-ASK-28 | S-ASK.publish-confirm | Team chat switch toggled | thumb `.sw::after`; track | transform; background-color; scale while held | translateX 0 → 17; track `--sw-track` → `--sw-on`; held thumb scale 1.2 × 1 (origin toward travel) | thumb 260; track 260; held 110 | thumb SPRING; track EASE | none | a tap mid-travel retargets from the current position | thumb jumps; colour changes at once | none | thumb at 17px by 260ms, small overshoot near 150ms |
| M-ASK-29 | S-ASK.toast | Save draft… in the Mac pane footer | toast `.toast` | opacity, transform | in: 0 → 1, translate(-50%, 8px) → (-50%, 0); out: 1 → 0 | in 260; out 200 after 2200 hold | EASE | none | a second toast replaces the first | toast fades in and out `CH_FADE_MS` | none | toast at rest by 260ms |
| M-ASK-30 | S-ASKD.pane | plan writes on the Mac | pane rows `.drow`; strip; compact card meta | as M-ASK-02 for rows, M-ASK-11 for strip; pane scrolls to the new row | as those rows | 260 / 360; scroll smooth | as those rows | one row per part as it arrives | Stop ends the stream | rows appear; scroll jumps | none | row 3 visible with strip segment 3 |
| M-ASK-31 | S-ASKD.thread (segmented in the desk bar) and every segmented control | segment tapped | thumb `.seg .thumb`; labels | transform; font-weight crossfade | translateX to the new segment | 360 | SPRING | none | retargets from the current position | thumb jumps | none | thumb at rest by 360ms |

## Plan format

| ID | Screen | Trigger | Element(s) | Property | From → to | Duration | Curve | Delay / stagger | Interruptible | Reduce Motion | Haptic | Check |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-FMT-01 | S-FMT.upload-sheet | Upload a plan; Choose file | sheet; option rows | as M-ASK-13; option press M-ASK-27; picked row replaces the options | as those rows | 462 / 280; press 390 | SMOOTH / EASE | picked row shows 800 before the sheet closes | as M-ASK-13 | as those rows | none | picked file row visible before close |
| M-FMT-02 | S-FMT.reading | file picked | scan line over the page `.smp` | transform, opacity | translateY(−22px) opacity 0 → 0 at 10% opacity 1 → 206px at 90% → 228px opacity 0 | 1500, one pass | linear | while the first read runs | no | no scan line | none | line mid-page at 750ms |
| M-FMT-03 | S-FMT.reading → S-FMT.found | each section is found | section outlines `.smp [data-r]` ring; tags `.tagr` | opacity | 0 → 1 | 260 | EASE | all sections at once; no stagger | no | outlines and tags appear at once | none | all five outlines on in the same frame |
| M-FMT-04 | S-FMT.set | Use this format | capsule M-ASK-19; receipt M-ASK-22; Undo ring M-ASK-23 | as those rows | | | | | | as those rows | none | receipt check at 300ms |
| M-FMT-05 | S-FMT.see | See Thursday in it | push M-ASK-16 | as M-ASK-16 | | 462 | SMOOTH | | as M-ASK-16 | crossfade `CH_FADE_MS` | none | as M-ASK-16 |

## Builder

| ID | Screen | Trigger | Element(s) | Property | From → to | Duration | Curve | Delay / stagger | Interruptible | Reduce Motion | Haptic | Check |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-BLD-01 | S-BLD.helper → S-BLD.ghosts | Fill the draft | helper card `.feat`; folded helper line; empty block; ghost rows | opacity, height; opacity | card 1 → 0 and height → 52; line 0 → 1; empty block 1 → 0; each ghost arrives (M-ASK-02 shape) | card 260; line 180; empty 160; ghosts 260 | EASE (card); SMOOTH heights | ghosts one by one as parts arrive | Stop ends it; kept nothing | card swaps for the line; ghosts appear; `CH_FADE_MS` fades | none | helper at 52 high by 260ms |
| M-BLD-02 | S-BLD.kept, S-BLDD.board | Keep (one block) | ghost block | press M-ASK-27; opacity; outline → card shadow | .7 → 1; dashed accent ring → card shadow | press 390; 260 | EASE | none | no | outline swaps for the shadow at once | none | solid at 260ms |
| M-BLD-03 | S-BLD.new-sheet | New plan | sheet M-ASK-13 | as M-ASK-13 | | 462 / 280 | SMOOTH / EASE | | as M-ASK-13 | crossfade `CH_FADE_MS` | none | as M-ASK-13 |
| M-BLD-04 | S-BLDD.board | Keep all | every ghost; Keep all bar text | as M-BLD-02, all at once; bar text crossfade | .7 → 1; text 0 → 1 | 260; text 180 | EASE | all at once, no stagger | no | at once | none | every block solid in one frame |

## Player

| ID | Screen | Trigger | Element(s) | Property | From → to | Duration | Curve | Delay / stagger | Interruptible | Reduce Motion | Haptic | Check |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-PLY-01 | S-PLY.notify | push delivered (lock screen drawing; in-app bell banner in the app) | banner | transform, opacity | translateY(−160%) → 0; opacity 0 → 1 | 504 | SPRING | none | swipe up dismisses from the current position | banner fades in `CH_FADE_MS` in place | system default for the push; none in-app | banner at rest by 504ms |
| M-PLY-02 | S-PLY.practice | banner tapped | banner; lock screen; Practice page; stop rows | opacity, transform; opacity | banner scale 1 → 1.04, opacity → 0; lock screen 1 → 0; stop check `.ok` scale 0 → 1; rows arrive | banner 260; lock 280; check 300; rows 260 | EASE; check SPRING | none | no | crossfades `CH_FADE_MS` | none | Practice page fully shown by 280ms |

## Never animate on this lane

- Count-ups of any figure (minutes, counts, percentages, "Told 11", "Seen by 4 of 9"). Numbers change in place.
- Entrance staggers. Blocks, steps and ghosts arrive when their part arrives; the class timeline bars, strokes gained bars and putting bars grow together. The one timed sequence is Told (M-ASK-25), because it tracks real deliveries 90ms apart in arrival order.
- Re-render motion: refetches, version arrows and theme changes swap content without travel.
- Blur, glass or parallax on scroll. The phone dock's glass is static.
- Width, top, left or margin transitions (`clubhouse:css` fails them). Heights only on arrivals and folds.
- The green bar, tab bar and desktop sidebar. They never move.

## Interrupt cases worth a test

1. Stop pressed while block 3 is writing: blocks 1 and 2 stay, block 3 shows the stopped dash, nothing is saved, and Save and Publish are absent.
2. Back pressed at 200ms into the full-plan push: the push reverses from the current position, no jump.
3. Sheet dragged down halfway and released slowly: it returns up on the spring; released fast, it closes on the 280ms ease.
4. Chip tapped twice within 110ms: one press, the second retargets; the fill ends in the right state.
5. Undo at 7.9s on Publish: no push, bell or chat post is ever sent (fake timers, 08 PP5). At 8.1s Undo is gone.
6. Team chat switch tapped twice mid-travel: the thumb retargets and ends at the second state.
7. Save draft tapped twice: one capsule, one write (the button locks on the first tap).
8. The coach leaves the thread during the 8s window: the deferred send still fires once, server-side.
9. Reduce Motion switched on mid-scene: the next animation follows the Reduce Motion column; nothing running is left half-way.

## Completeness pass, 4 Nov 2026

Two tables, in this file's columns. The first gives a row to the 20 IDs above that had none. The second covers the S-PRC.* screens (05's section of this name): N-00's moves mapped onto the package tokens (N-00 §5's `chSpring('settle')` becomes SPRING 300ms for small settles; `chSpring('smooth')` becomes SMOOTH). Haptics follow coachhelm 07: `press` on taps, `select` on steps and snaps, `commit` on a drop, `success` on a landed publish, `warning` on a failed write.

### IDs that had no row

| ID | Screen | Trigger | Element(s) | Property | From → to | Duration | Curve | Delay / stagger | Interruptible | Reduce Motion | Haptic | Check |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-CP-01 | S-ASK.why | Why tapped on a block | Why panel under the block | height; opacity | 0 → content; 0 → 1 | 260; 180 | SMOOTH; EASE | none | a second tap folds it from the current height | panel appears; `CH_FADE_MS` | none | open at 260ms |
| M-CP-02 | S-ASK.refine | refine chip tapped | chip press M-ASK-27; the plan card's changed blocks | as M-ASK-09 to M-ASK-11 for the changed blocks only; version arrow text swaps | as those rows | as those rows | as those rows | blocks as their parts arrive | Stop keeps version 1 | as those rows | none | version label "2 of 2" at the last block |
| M-CP-03 | S-ASK.failed | the write fails | capsule → receipt row; amber glyph | opacity | capsule 1 → 0; receipt 0 → 1 | 180; 260 | EASE | receipt after the capsule | Try again runs M-ASK-19 | `CH_FADE_MS` | `warning` | amber glyph at 260ms |
| M-CP-04 | S-ASK.undone | Undo tapped inside 8s | page flies back out of the folder; receipt line | transform, opacity | reverse of M-ASK-21; line 0 → 1 | 280; line 180 | EASE | line after the flight | no | page fades; line `CH_FADE_MS` | `press` | "Removed. Nothing was saved." at 460ms |
| M-CP-05 | S-ASK.cancelled | Cancel on the confirm card | card body | opacity | 1 → .6 | 200 | EASE | none | no | `CH_FADE_MS` | none | .6 at 200ms |
| M-CP-06 | S-ASK.share-pdf | Share PDF tapped | the system print sheet | none of ours | system | system | system | none | system | system | `press` | the print sheet opens; nothing of ours moves |
| M-CP-07 | S-ASKD.steps | as M-ASK-02 to M-ASK-04 on the Mac | step rows | as M-ASK-02 to M-ASK-04 | as those rows | 260 | SMOOTH; EASE | as parts arrive | as those rows | as those rows | none | as M-ASK-02 |
| M-CP-08 | S-ASKD.intake | as M-ASK-06 and M-ASK-07 on the Mac | intake card; chips | as M-ASK-06, M-ASK-07 | as those rows | as those rows | as those rows | none | as those rows | as those rows | none | as M-ASK-07 |
| M-CP-09 | S-ASKD.publish | Publish… in the pane footer | confirm card in the pane | opacity, translateY | 0 → 1; 6px → 0 | 260 | EASE | none | Cancel reverses | `CH_FADE_MS` | none | card at rest 260ms |
| M-CP-10 | S-BLDD.inspector | a block selected on the board | inspector content | opacity | old 1 → 0, new 0 → 1 | 180 | EASE | crossfade | a new selection restarts it | `CH_FADE_MS` | none | new content at 180ms |
| M-CP-11 | S-DOC.list-draft | save lands (the row appears in Documents on its next load) | row | none | appears in place | none | none | none | n/a | none | none | no motion on a refetch (Never animate) |
| M-CP-12 | S-DOC.list-shared | publish lands | row chip Draft → Published | none | swaps in place | none | none | none | n/a | none | none | no motion on a refetch |
| M-CP-13 | S-DOC.sheet-coach | open from Documents or Practice | the plan page | push M-ASK-16 | as M-ASK-16 | 462 | SMOOTH | none | as M-ASK-16 | crossfade `CH_FADE_MS` | none | as M-ASK-16 |
| M-CP-14 | S-DOC.sheet-player | open from the banner, bell, Home line or Documents | the plan page | push M-ASK-16 | as M-ASK-16 | 462 | SMOOTH | none | as M-ASK-16 | crossfade | none | as M-ASK-16 |
| M-CP-15 | S-DOC.print-coach | Print | print page | none (print media) | none | none | none | none | n/a | none | `press` | nothing animates in `@media print` |
| M-CP-16 | S-DOC.print-player | Share PDF or Print (player) | print page | none | none | none | none | none | n/a | none | `press` | as M-CP-15 |
| M-CP-17 | S-FMT.empty | Practice › Plan format opened | screen | push M-ASK-16 | as M-ASK-16 | 462 | SMOOTH | none | as M-ASK-16 | crossfade | none | as M-ASK-16 |
| M-CP-18 | S-FMT.undone | Undo on S-FMT.set | receipt → neutral line; "Here's your format" card returns | opacity | 1 → 0; 0 → 1 | 180; 260 | EASE | line after the receipt | no | `CH_FADE_MS` | `press` | card back at 440ms |
| M-CP-19 | S-PLY.plan | Open the plan on S-PLY.practice | plan page | push M-ASK-16 | as M-ASK-16 | 462 | SMOOTH | none | as M-ASK-16 | crossfade | none | as M-ASK-16 |
| M-CP-20 | S-PLY.docs | Documents opened | rows | none | none | none | none | none | n/a | none | none | rows render in place; no entrance stagger |

### S-PRC.* screens

| ID | Screen | Trigger | Element(s) | Property | From → to | Duration | Curve | Delay / stagger | Interruptible | Reduce Motion | Haptic | Check |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-PRC-01 | S-PRC.home, S-PRC.drills, S-PRC.groups, S-PRC.templates | Segmented link tapped | thumb; page content | thumb as M-ASK-31; content crossfade | thumb to the new segment; content 0 → 1 | 360; 180 | SPRING; EASE | none | retargets | thumb jumps; content `CH_FADE_MS` | `press` | thumb at rest 360ms |
| M-PRC-02 | S-PRC.week | Previous or Next week | tile row | transform, opacity | translateX(±24px) → 0, opacity 0 → 1 | 260 | EASE | none | a second tap retargets | crossfade | `press` | tiles at rest 260ms |
| M-PRC-03 | S-PRC.past | "Past plans (12)" tapped | list | height; opacity | 0 → content; 0 → 1 | 260 | SMOOTH; EASE | none | a second tap folds from the current height | appears; `CH_FADE_MS` | `press` | open at 260ms |
| M-PRC-04 | S-PRC.plan, S-PRC.drill, S-PRC.print | open a plan, drill or print studio | pushed page | as M-ASK-16 | as M-ASK-16 | 462 | SMOOTH | none | back reverses from the current position | crossfade | none | as M-ASK-16 |
| M-PRC-05 | S-PRC.new-pick, S-PRC.copy-past, S-PRC.template-pick, S-PRC.bld-block-sheet, S-PRC.bld-split-sheet, S-PRC.drill-new, S-PRC.publish-sheet, S-PRC.republish-sheet, S-PRC.seen-sheet, S-PRC.group-sheet, S-PRC.docs-move | sheet opens or closes | sheet; scrim | as M-ASK-13 | as M-ASK-13 | up 462; down 280 | SMOOTH / EASE | none | drag tracks the finger; slow release returns | crossfade | none | as M-ASK-13 |
| M-PRC-06 | S-PRC.new-pick → S-BLD.new-sheet | a practice picked | sheet step 1 → step 2 | transform, opacity | step 1 translateX 0 → −24%, step 2 100% → 0 | 462 | SMOOTH | none | Back reverses | crossfade | `press` | step 2 at rest 462ms |
| M-PRC-07 | S-PRC.bld-add-menu, S-PRC.bld-block-menu, S-PRC.template-menu, S-PRC.share-menu, S-PRC.docs-plan-menu | menu opens | menu | opacity, scale | 0 → 1; .96 → 1 from the button | 180 | EASE | none | tap outside closes at once | opacity only | `press` | menu at rest 180ms |
| M-PRC-08 | S-PRC.bld-blocks | a block added from the menu | new card; cards below | height; opacity, translateY | 0 → card; 0 → 1, 6px → 0; cards below move with the height | 260 | SMOOTH; EASE | none | no | appears; `CH_FADE_MS` | `press` | card at 260ms |
| M-PRC-09 | S-PRC.bld-block-menu | Duplicate | copy card under the original | as M-PRC-08 | as M-PRC-08 | 260 | SMOOTH; EASE | none | no | as M-PRC-08 | `press` | as M-PRC-08 |
| M-PRC-10 | S-PRC.bld-delete-undo | Delete | card; cards below; toast | card opacity 1 → 0 then height → 0; toast translateY(16px) → 0, opacity 0 → 1 | card 180 then 260; toast 260 | EASE; SMOOTH; toast EASE | height after the fade | Undo mid-collapse reverses from the current height | card disappears; toast `CH_FADE_MS` | `press` | gap closed at 440ms |
| M-PRC-11 | S-PRC.bld-delete-undo | Undo in the toast | card returns at its index; toast | reverse of M-PRC-10 | | 260 | SMOOTH | none | no | appears | `press` | card at rest 260ms |
| M-PRC-12 | S-PRC.bld-delete-undo | the 8s ring | ring `.rg` | stroke-dashoffset | full → empty | 8000 | linear | none | Undo cancels | same: a timer | none | as M-ASK-23 |
| M-PRC-13 | S-PRC.bld-reorder | long press 450ms (phone) or grip drag (desktop) | lifted card | transform; shadow | scale 1 → 1.02; shadow card → pop | 180 | EASE | none | release drops | no lift scale; outline ring shows the lifted card | `select` at lift | lifted at 180ms |
| M-PRC-14 | S-PRC.bld-reorder | drag passes a card | the passed card | transform | translateY by one card height (FLIP) | 300 | SPRING | none | retargets each pass | moves at once | none | passed card at rest 300ms |
| M-PRC-15 | S-PRC.bld-reorder | drop, or Alt+Up/Down | dropped card; times | transform | to its slot, scale → 1; times swap in place | 300 | SPRING | none | no | at once | `commit` | at rest 300ms; times change with no count-up |
| M-PRC-16 | S-PRC.bld-time-sheet | stepper or edge drag by 5 min | card height; cards below; ribbon text | height | to the new length | 260 | SMOOTH | none | each step retargets | at once | `select` per step | card height at 260ms |
| M-PRC-17 | S-PRC.bld-rotation | chip dropped on a cell, or Space | the two chips | transform | swap (FLIP) | 462 | SMOOTH | none | a new drag retargets | swap at once | `commit` | both at rest 462ms |
| M-PRC-18 | S-PRC.bld-ribbon | total passes the practice's end | over segment; line colour | opacity | 0 → 1; colour secondary → loss | 180 | EASE | none | reverses if back under | `CH_FADE_MS` | none (no haptic for a warning) | over segment at 180ms |
| M-PRC-19 | S-PRC.bld-blocks, S-PRC.bld-groups, S-PRC.bld-drills, S-PRC.bld-review | step bar tapped | thumb; step content | thumb M-ASK-31; content crossfade | | 360; 180 | SPRING; EASE | none | retargets | thumb jumps; content `CH_FADE_MS` | `press` | step content at 180ms |
| M-PRC-20 | S-PRC.bld-save-status | save state changes | status text | opacity | old 1 → 0, new 0 → 1 | 180 | EASE | none | the newest state wins | `CH_FADE_MS` | `warning` on Couldn't save only | text at 180ms |
| M-PRC-21 | S-PRC.bld-stale | another coach saved first | alert | opacity, scale | 0 → 1; .96 → 1 | 260 | EASE | none | no | opacity only | `warning` | alert at 260ms |
| M-PRC-22 | S-PRC.bld-move-player | avatar dropped in a column, or 1 to 6 | avatar; column counts | transform | to the column (FLIP); counts swap in place | 462 | SMOOTH | none | retargets | at once | `commit` | at rest 462ms |
| M-PRC-23 | S-PRC.bld-split-sheet | Split | avatars | transform | each to its new column, all at once (no stagger) | 462 | SMOOTH | all together | no | at once | `commit` | all at rest 462ms |
| M-PRC-24 | S-PRC.drill-bank-sheet | drill picked for a slot | drill row → slot | opacity | slot drill text 0 → 1; sheet closes as M-ASK-13 | 180; 280 | EASE | sheet after the pick | no | crossfade | `press` | slot filled at 180ms |
| M-PRC-25 | S-PRC.drill-new | Save | sheet closes; toast CH-17016 | as M-ASK-13; toast as M-PRC-10 | | 280; 260 | EASE | toast after the sheet | no | crossfade | `success` | toast at 540ms |
| M-PRC-26 | S-PRC.publish-sheet → S-PRC.published-toast | Publish | button → capsule; sheet closes; toast with Undo | capsule M-ASK-19; sheet M-ASK-13; toast as M-PRC-10 | | 280; 280; 260 | SMOOTH; EASE | toast after the sheet | Undo inside 8s | crossfades | `success` when the write lands | toast at rest after 560ms |
| M-PRC-27 | S-PRC.published-toast | the 8s ring | ring | as M-ASK-23, counted to the server's `release_at` | | remaining of 8000 | linear | none | Undo cancels | same: a timer | none | ring at the server's time left |
| M-PRC-28 | S-PRC.takedown, S-PRC.plan (delete) | confirm pressed | chip and actions | opacity | swap in place | 180 | EASE | none | no | `CH_FADE_MS` | `warning` (destructive) | chip "Taken down" at 180ms |
| M-PRC-29 | S-PRC.run | turn ends | lit stop moves to the next row; countdown | the ring and fill move to the next row; text swaps | opacity | 260 | EASE | none | n/a | at once | `select` | next stop lit at 260ms |
| M-PRC-30 | S-PRC.ply-home, S-PRC.home | pull to refresh | the app's shell pull indicator | as the shell | as the shell | as the shell | as the shell | none | release cancels | indicator only | none | content swaps with no motion |
| M-PRC-31 | S-PRC.link-states | a dead link lands on Practice home | message card | opacity | 0 → 1 | 180 | EASE | after the page | n/a | `CH_FADE_MS` | none | card at 180ms |

Never animate on S-PRC.*: the week's "Team time" total, the ribbon minutes, "Seen by N", counts in tiles and folders (numbers change in place); refetches from Realtime (`use-plan-live.ts`) swap content without travel.
