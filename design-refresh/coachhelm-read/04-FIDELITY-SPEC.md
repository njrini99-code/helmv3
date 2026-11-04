# CoachHelm read: fidelity spec

> Superseded in detail by `05-SCREENS.md` (every screen and state, with links), `06-SCREEN-SPECS.md` (per-screen values), `07-MOTION.md` (every motion row) and `08-ACCEPTANCE.md` (pass/fail checks). Where they differ from this file, they win; 06 §14 lists the three corrections.

Every number the build has to hit, read off the design page (`redesign/coachhelm-read.html`, its CSS and its script), not by eye. Where this file and the page differ, the page wins; where the page and `DESIGN_LANGUAGE.md` differ, the language wins and the PR says so.

Names: the design page calls the screen container `.ph` and every card class below lives under it. In the build the prefix is `.ch-hr-` (checked free in `src/clubhouse/styles`; `.ch-rd-` is taken by Rounds). So `.ph .feat` becomes `.ch-hr-feat`, `.ph .fbar` becomes `.ch-hr-fbar`, and so on. Sizes are CSS px at the default Text Size; anything written `× k` follows iPhone Text Size through the app's existing `--ch-type-scale` (k = 1 at the default, 1.353 at XXL, `lib/dynamic-type.ts` MAX_SCALE).

## 1. Colour tokens

The read uses the shared Clubhouse tokens from PR 1. No new colour token is added; the table maps the design page's names to them.

| Design page | Light | Dark | Use |
|---|---|---|---|
| `--bg` | #F2F0E9 | #0E120F | Page |
| `--card` | #FFFEFB | #191E1A | Cards |
| `--well` | #F6F4EE | #141815 | Inset panels, chips, the verdict box |
| `--ink` / `--ink-2` / `--ink-3` | #1C1B18 / #46433D / #5F5C55 | #F1ECDF / #D0C9B8 / #ADA697 | Text, secondary, tertiary and chevrons |
| `--gain` / `--loss` | #14613D / #9A5700 | #7CC79B / #E7AE57 | Gain and loss figures as text |
| `--gain-fill` / `--loss-fill` / `--neutral-fill` | #1F6B45 / #B86F0C / #6B675F | #4FA877 / #E09A35 / #A39D90 | Bars, dots, path nodes |
| `--track` | #EBE5D8 | #2C322D | Bar tracks, empty dots, stepper |
| `--accent` | #155A39 | #7CC79B | Assign button, links |
| `--feat` | #0B3A25 | #123D29 | The one feature card per view |
| `--f-ink` / `--f-ink-2` | #F4F1E8 / #D3D9CB | same | Text on the feature card |
| `--f-gain` / `--f-loss` | #8FD3AA / #EDB867 | same | Chips and ladder marks on the feature card |
| `--f-track` | rgb(244 241 232 / .18) | same | Ladder track on the feature card |
| `--sep` / `--ring` | ink at 10% / 7% | ink at 10% / white 6% | Hairlines, card rings |

Amber is losses only; green is gains and the accent. No colour carries meaning alone: every bar, dot and mark has its number written next to it.

## 2. Contrast (WCAG 2.1, computed from the tokens)

All text pairs clear 4.9:1 in both themes. Script and output: `capture/contrast.py`, `capture/contrast-table.txt`. The two feature-card chips were tightened in this polish (tint 16–18% down to 12%) to get there.

| Pair | Light | Dark |
|---|---|---|
| Body text on card | 17.08 | 14.34 |
| Secondary text on card | 9.77 | 10.25 |
| Tertiary text and chevrons on card | 6.61 | 6.99 |
| Secondary on well | 8.96 | 10.87 |
| Tertiary on page | 5.85 | 7.80 |
| Loss figures on card | 5.57 | 8.53 |
| Gain figures and accent links on card | 7.42 / 8.15 | 8.45 |
| Assign button label (#F6F1E3 light, #0E120F dark, on accent) | 7.29 | 9.44 |
| Feature card ink / secondary | 11.30 / 8.84 | 10.78 / 8.44 |
| Stance chip on feature (amber over 12% amber tint) | 5.61 | 5.35 |
| Counted chip on feature (green over 12% green tint) | 5.64 | 5.38 |
| Tier chip on feature (ink over 12% ink tint) | 8.09 | 7.71 |

Bars and dots are graphics (3:1 against their track): loss fill on track 3.15 light, 5.52 dark; neutral fill on track 4.49 light, 4.86 dark; gain fill on track 5.15 light, 4.50 dark. The empty track itself is only 1.24 / 1.29 against the card, which is fine because the count is always written beside it; never let a bar's value depend on seeing the track. The PR's contrast test (PR 12's) runs these pairs on the built CSS.

## 3. Type

Instrument Sans for everything (the serif on today's Deep dive titles goes; it's on the banned list). Tabular numbers on every figure.

| Role | Size × k | Weight | Line | Notes |
|---|---|---|---|---|
| Phone bar title (`ptitle`) | 17 | 600 | 1 | Centred, nowrap |
| Back label | 17 | 400 | 1 | `--champ` on the green bar; player's first name for a coach, "CoachHelm" for a player |
| Large title (Board context) | 30 | 600 | 1.1 | wdth 88, −0.03em |
| Feature headline (`feat h3`) | 23 | 600 | 1.18 | −0.018em |
| Feature lede | 15 | 400 | 1.42 | `--f-ink-2` |
| Hero number (`hero b`) | 44 | 500 | 0.9 | wdth 92, −0.04em, nowrap, never wraps inside ("23 pts" stays one line) |
| Hero note (`hero span`) | 14 | 400 | 1.3 | Wraps under the number when it can't fit 150px beside it |
| Card title (`ch h4`) | 17 | 600 | 1.3 | Inside the card |
| Card meta (right of title) | 14 | 400 | 1.3 | `--ink-2` |
| Rows | 16 / 14 | 500 / 400 | 1.3 / 1.35 | Title / subline |
| Funnel step head | 15 | 500 | 1.25 | Count 600, nowrap |
| Funnel step note | 14 | 400 | 1.35 | |
| Chips (stance, tier, obs, coach-only) | 12–12.5 | 600 | 1 | Fixed size, do not scale |
| Ladder labels (SVG) | 12.5 × min(k, 1.2) | 400 / 600 | value on a second line at 1.15em | Capped at 1.2 so the marks don't collide |
| Feature footer | 13.5 | 400 | 1.3 | Wraps; date moves to its own line |
| Drill title / body | 16 / 15 | 600 / 400 | 1.3 / 1.45 | |
| Target tiles | 13 / 17 | 400 / 600 | | Label / value |

## 4. Layout and spacing

Phone (390 and 430):
- Page edge 16 (20 on 430). Cards stack with a 20 gap (`sheet` gap 20, bottom padding 60).
- Green bar exactly as today: 44 top inset, 48 bar, 18 rounded tab into the page. Nothing in it changes except the back label and title on the read.
- Card: radius 16, ring 1px `--ring` plus `--shadow`, header padding 16/16/12, body padding 0/16/16.
- Feature card: radius 16, padding 18/16/16, soft radial light top right at 7% white, shadow 0 10 24 −14 at 55% deep green. One per view (the summary on the Board, the headline on the read).
- Assign button: min height 46, radius 13, full width beside Dismiss on the Board.
- Rows: min height 52, padding 10/16, hairline from 16 in.
- Tap targets: every control 44 or larger (back, more, rows, buttons, hole chips 36 high inside a 44 row).

Desktop (1440 × 900 shot; the page draws it at 1180 × 820 inline):
- Today's sidebar (232) and glass top bar (58, 78% card with 24px blur) unchanged.
- Body: three columns, 250 / flexible / 320, gap 20, padding 22/24. Each column scrolls on its own; cards keep their natural height (no squashing).
- Left: the player's reads grouped by area (empty groups hidden), header with the open-read count; a coach gets a player switcher on top (segmented, 34 high).
- Middle: the headline feature card, then Where it shows up, Why CoachHelm thinks so, What to do.
- Right: How sure, How it has moved, The rounds behind it.
- Ladder max width 340, slope chart max width 300, so labels stay near 14px.
- Top bar breadcrumb "CoachHelm › Priya Natarajan › Approach" for a coach, "CoachHelm › Approach" for a player. Buttons: Ask about this read, and Message Priya (coach only).

## 5. Each card

Board summary card (feature card on the Board): area and player first name (coach), stance chip, headline, lede, hero number and note, ladder, cause line with tier chip, worth line ("Worth about 0.6 a round, closed to the team average" and "estimated"; with no stored anchor it reads "Worth about 0.3 strokes a round"; name the method only when it is strokes gained), footer with count, rounds, firmness and "Through Oct 24", then "Open the read" row with a chevron. The whole card is the tap target. Assign and Dismiss sit under it for a coach.

Read page, top to bottom:
1. Headline (feature card): same as the summary without the Open row and the cause line.
2. Where it shows up: badge "Observed, not a cause". One step per stored narrowing step: label, count right, 12-high bar on track with radius 6, note under. The last step that has a bar is amber; earlier steps neutral. The miss shape is not a bar: it is a words-only last row, "Miss shape · 9 of 12 short, 8 of 11 right", because the two directions are counted on different denominators. Footer: "Each step only shows when its count clears the engine's floor." plus how many passed.
3. Why CoachHelm thinks so: stepper of three (two for a player: "Not traced yet", "Seen in your shots"), 6 high, gap 4; labels under. Then one of: both arms as dot rows (14px dots, gap 5; filled amber for the misses) with a verdict box (a likely cause shows its slice alone, "Misses gather on long par 4s · 12 of 16", never a miss shape inside it); the shot path (38px nodes joined by 2px lines, the hit node amber) with up to five hole chips and "On average a penalty hole cost about 1.4 strokes (across 14)" under it; or the count-down meter (ten 10-high segments, "6 of the 10 missed downhill putts it needs, over 3 rounds") with the line "Nothing new is asked. It fills as Jonah plays." (player: "as you play"). Path icons come from a fixed word-to-icon map (driver, iron, wedge, water, OB, bunker, green); any word not in the map gets a plain dot.
4. How sure: the word ("Solid read"), three bars (Sample, Recent, Shot record), 8 high, each with its count right-aligned in words. A coach sees the sample against its target ("28 of the 30 approaches it needs"); a player sees the sample alone ("28 approaches"). Recent reads "Most rounds in the last 45 days" and is drawn only when the read stores `factors_measured`; otherwise the row is left out. Shot record names what is thin ("26 of 28 holes. Miss direction is thin"). Then the checked list with green ticks, and for a coach only the claim rung and range in a well with a "Coach only" chip.
5. How it has moved: header meta "Last change". Slope chart from the stored from and to values, labelled "Before" and "Now" (no dates: only the two values are stored), against the Tour line (dashed), the change in amber or green words, the category trend chip split as "Approach strokes gained −0.42 a round · Slipping" where the part after the dot never breaks.
6. The rounds behind it: up to four rows then "Show all 9" (or "Show newest 8 of N" when more than 8 rounds back the read, because the stored list holds 8). Each row: date and course, a dot per counted hole (or "Counted in the read"), score and to-par, chevron.
7. What to do: drill tile (40 icon well, title, minutes and level, body), two target tiles (Worth, Starts from), Assign as focus (coach) and Message, the plan line. After Assign the two tiles stay as they are (no focus verdict and no target, since these metrics have no grading criterion) and the plan line reads "Focus area · Active · from this read."

Ladder: when the team pool line is on, its tick reads "Team pool"; never pair that tick with the words "team average" in the same card unless the worth anchor is the team average.

## 6. States

Each state reads in its own words, never as a blank card or a zero. Shown on the page under "Every state a read can be in".

| State | What draws |
|---|---|
| Likely (Priya, approach) | Both arms as dots, verdict, "Likely" chip; a player sees "Not traced yet" instead (Q3) |
| Counted (Eli, penalties) | Path, holes, rounds with hole dots, "Counted" chip |
| Not traced, count-down (Jonah, putts) | Count-down meter "6 of 10" missed downhill putts, "Nothing new is asked. It fills as Jonah plays." |
| Not traced, data gap | Ring 4 of 14 and "4 tagged, 10 more to go. Tag it when you enter the round. Nothing else changes." Only for reads with a shot path to trace |
| No narrowing stored | Where it shows up is not drawn |
| No team pool line | Ladder shows player and Tour only |
| No strokes estimate | Worth line not drawn; Do's Worth tile hidden |
| No trend yet | "No trend yet" (CH-13383), no chart |
| Out of date | Stance "Out of date" with today's CH-13903 sentence |
| Assigned | Assign becomes "Assigned as Priya's focus" with a drawn tick; the stance chip reads Assigned; Worth and Starts from tiles stay, no verdict or target |
| Loading | `ReadSkeleton`: the card outlines at their real heights, no shimmer under Reduce Motion |
| Failed | Today's route error card, unchanged |
| Flag off | Every read link goes to today's Deep dive; nothing else changes |

## 7. Taps

| Tap | Result |
|---|---|
| Board summary card | Press 0.97, then push the read (462ms) |
| Back | Pop to where you came from |
| Funnel, dots, path, holes | Nothing; they are read-only pictures |
| Hole chip | Opens that round's review at that hole (today's round review link) |
| Round row | Opens the round review |
| Show all 9 / Show newest 8 of N | Expands in place to the stored rounds (8 at most), no navigation |
| Assign as focus | Press 0.97, spinner in the button, then the assigned chip with the tick drawn (360ms) |
| Message Priya | Today's composer to that player, no prefill (02 §4.6; corrected in 06 §14) |
| Ask about this read | The Ask lane's entry with this read attached |
| Desktop rail row / player switcher | Swaps the middle and right columns with a 260ms crossfade, no slide |

## 8. Motion

All from `DESIGN_LANGUAGE.md` §8. Transform and opacity only. No entrance staggers, no count-ups.

| Move | Duration | Curve | What moves |
|---|---|---|---|
| Press (card, buttons, switcher) | 110 down, 280 up | `--ch-ease` cubic-bezier(.22,1,.36,1) | Scale 0.97 |
| Push to the read | 462 | `--ch-ease-spring-smooth` (the `linear()` spring on the page) | Read slides 100% → 0; Board slides back under a black layer going 0 → 10% (the "dim to 0.9"), read casts −12 0 30 −18 at 40% black. The page draws −30%; the app's shared `CH_UNDERLAY_SHIFT` is 24%. Use the shared constant and list it under Can't match (02-PLAN.md §7.1) |
| Pop | 462 | same | Reverse |
| Funnel bars | 360 once, when first scrolled into view | `--ch-ease` | `scaleX` from 0 at the left edge to the step's share |
| Ladder band, dots, path nodes and lines | 360 once, in view | `--ch-ease` | Opacity and scale from 0.4 (dots), 0.7 (nodes); lines `scaleX` from the left |
| Tick on Assigned | 360 | `--ch-ease` | Stroke draw |
| Jump to a card (desktop rail, deep links) | Scroll, then a 900ms ring | `--ch-ease` | An inset 2px green ring fades in and out over the card |
| Rail swap (desktop) | 260 | crossfade, `--ch-ease` | Opacity only |

Never on re-render: a chart that already drew does not draw again when data refreshes or the theme changes.

Reduce Motion: nothing travels. The push becomes an opacity crossfade of `CH_FADE_MS` (180ms today; the page draws 120; see the note below), the dim layer is not drawn, bars and dots appear at their final size, presses don't scale, the ring shows without fading. The page applies this both from the system setting and from its own Reduce Motion switch.

Cross-lane note: settled on 3 Nov by the package rule (DECISIONS, SHARED-6). Every Reduce Motion crossfade uses `CH_FADE_MS` from `lib/motion.ts`, 180ms today, pinned by `reduced-motion.test.tsx`, as Lenses does. See 07.

## 9. Can't match as drawn (known now)

02-PLAN.md §10 has the full list of 16 with a fix for each. The ones that change what you see:

- The design page's ladder and slope chart are SVG with a 300-unit viewBox. In the app they should be the same SVG (not a chart library) so labels stay type, not pixels.
- Team pool needs `coachhelm_team_pool_v1`. It's off, so the built ladder shows the player and the Tour until it's turned on after the first deploy (call 3, built as default).
- The rounds' per-hole dots need `event_strokes` with a round id; where an event has no round id the row reads "Counted in the read" with no dots.
- No new series is drawn on How it has moved: only the stored from and to values exist.

## 10. The side-by-side check (acceptance)

Every PR in this lane is accepted only when this passes:
1. `node capture/capture.mjs design --out screenshots/after` (once; already in the package).
2. On the branch, with the dev server on 3100: `node capture/capture.mjs app --out screenshots/built`. It needs the preview `/clubhouse-preview/coachhelm-read?q=<read>&viewer=<viewer>&screen=<read|board>` (02-PLAN.md §3.9) with the hooks in 02-PLAN.md §8 (`data-ch-hr-page`, `data-ch-hr-card`, `data-ch-hr-open`).
3. `node capture/capture.mjs compare --a screenshots/built --b screenshots/after --out screenshots/compare`, then look at every pair: layout, sizes, colours, type, copy, chips, states, light and dark, 390, 430 and XXL, and desktop 1440.
4. `node capture/capture.mjs --motion all` for every 07 row, design and app, normal and Reduce Motion. Per screen ID, `node capture/capture.mjs --id <ID> --state <state>` gives the pair; 08 Part 3 is the full check.
5. Put the compares and clips in the PR, plus anything under "Can't match as drawn" with two options each.

`--lean` runs light theme, 390 and desktop only, for quick checks between commits. The full run is for the PR.
