# Motion report: shell motion, nine phone pages, 2026-11-07

Verdict: **FAIL on one criterion, P1.** Zero dropped frames at 1x is not met
on most interactions. The other criteria pass.

## Environment

| | |
| --- | --- |
| Commit | df4ce2b513 for the lab; 3d00b766b4 for the label proof |
| Build | local production, Turbopack, Preview flags on |
| Device | Mac, 120 Hz display, charging; no iPhone run |
| Viewport | 390x844, scale 3 |
| Network | local server to the staging database |
| Data | staging demo team, coach and player roles |

## Instruments

| Instrument | State | Used for |
| --- | --- | --- |
| Chromium CDP trace | AVAILABLE | Frames, gaps, long tasks, 1x and 4x |
| Playwright WebKit | AVAILABLE | Labels, heights, what animates |
| Web Inspector Timelines | NOT USED | |
| Real iPhone + Animation Hitches | NOT USED | Needs the cable |

The lab uses Chromium because frame traces and CPU throttling need CDP, which
Safari does not have. Its frame counts say nothing about Safari's frame rate.

## Scenario

Home, CoachHelm, Calendar, Messages, Team Hub, Roster, Stats, Rounds and
Qualifiers. Each page: a push and its pop, a sheet where one opens, a segment
tap. Coach on staging. Choosing these nine pages is an assumption.

## Results at 1x

Baseline is `nine-before-fixes`, on the same build setup. Some interactions were
not reached in that run, so they have no before figure.

| Interaction | Before | After | Smoothness | Tap ms |
| --- | --- | --- | --- | --- |
| Messages open | 97/133 | 16/114 | 9 | 30 |
| Calendar segment | 43/91 | 4/56 | 1 | 15 |
| Rounds segment | 45/94 | 10/57 | 5 | 22 |
| Rounds open | 32/175 | 10/126 | 6 | 89 |
| Qualifiers pill | 22/47 | 0/22 | 0 | - |
| Roster open | 13/63 | 8/61 | 4 | 34 |
| CoachHelm open | 31/182 | 33/185 | 2 | 25 |
| Team Hub tab | - | 23/75 | 3 | 23 |
| Calendar close | 21/80 | 21/111 | 2 | - |
| Home to Calendar | - | 11/159 | 9 | 77 |

Before and After are frames the harness counts dropped, over frames wanted. It
counts a partial frame as dropped, which is strict. Smoothness is Chrome's own
count of frames that affect smoothness. The control animation is 0/121 and 0.

- Interactions at zero dropped: 5 of 36.
- Gaps over 50 ms: 0 of 36 (2 before).
- Layout-property animation: none (5 interactions before).
- Tap to first moving frame: 35 of 36 under 100 ms. Team Hub to Calendar read
  118 traced. Three focused runs read 101, 81, 81.
- Rounds open with tracing off: 90, 95, 92 ms. Under the bar, with little
  margin,
  on a Mac.
- Reduce Motion: no positional motion, nothing over 180 ms, on all nine.
- 4x: mostly D, because of React commits in the slide's first frames.

The lab's gap count changed during this work. Idle time after an animation ended
counted as a gap, which produced a false 130 ms on CoachHelm's close. A frame
that
wants no update now ends the run. Before figures use the older count.

## Segmented labels, WebKit, every frame of a glide

| Page | Light before | Light after | Dark after |
| --- | --- | --- | --- |
| Roster | 1.34 | 7.54 | 6.18 |
| Rounds | 1.34 | 7.54 | 6.19 |
| Stats | 1.33 | 7.56 | 6.19 |
| Player Home | 1.19 | 1.22 in one frame | 6.18 |

Each figure is the worst contrast, reading each label against the ground under
most of its text. Player Home in light has one 13 ms frame at the crossing.
While
the pill is over part of a label, some glyphs sit on each ground.

Player Home segments are now 44 tall. No coach Home on staging draws a segment.

## Findings

| # | Error | Effect | Confidence | Fix |
| --- | --- | --- | --- | --- |
| 1 | Page dim used `filter` | Repaint each frame | High | Overlay opacity |
| 2 | `height` animated | Layout each frame | High | Removed |
| 3 | Clone in the tap frame | Late press state | High | Next frame |
| 4 | Width animated on the pill | Main thread drawing | High | Translate only |
| 5 | Thread opened by frame loop | 97/133 dropped | High | Rest at open |
| 6 | Label ink on a fixed delay | 1.3:1 for 100 ms | High | At the crossing |

## Left open

- Most remaining drops are React drawing the new page during the slide's first
  frames (long tasks of 18 to 40 ms). Reaching zero needs a structural change.
- The pill's width lands in one step at the tap. The bar asked for translate and
  width; an animated width kept the main thread drawing. The owner's call.
- No Safari frame timing and no iPhone run. Traces are in
  `~/clubhouse-audit/runs/tonight/motion/`.
