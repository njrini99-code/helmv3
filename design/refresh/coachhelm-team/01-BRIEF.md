# CoachHelm Team (the hole): brief

## The problem (Nick, Oct 31)

The coach's CoachHelm board shows one top read per player, picked by a pill strip. A lot of what CoachHelm already knows never reaches a coach: the loader asks for one read a player (`getTopInsightsForPlayers` with `limit: 1`), and the team pieces that are built (Monday brief, team patterns, track record) sit behind flags that are off. Nick's first look at a redesign was "That's not very good, it's just a copy of production." Version 2, the golf hole, he called "I love this. Fix the white space in the desktop version. Other than let's polish and rip it."

## What changes

1. The team board is a golf hole. One green feature card shows the team's strokes to Tour this season across the four places on a hole (tee, approach, short game, putting), each sized by what it costs, with each player standing where they lose most.
2. Tap a spot to see who loses it (bars against Tour, team average dashed) and every open read about that spot from every player. A fifth tab, Course, holds the reads with no spot on the hole and the team's scoring history by week and by course.
3. Every open read per player shows, up to the Board's caps (3 needs work, 1 working), instead of one, in CoachHelm's own order.
4. The huddle plots ball striking against scoring for every player, with a line from their first 10 rounds this season to now for players with 20 or more rounds.
5. The roster shows every player with a four-bar finger-print, season total and open reads.
6. This week stories, Working on and the track record use pieces that are already built (Monday brief, pulse, focus areas, track record).
7. A read opens in a sheet with its ladder, evidence, drill and Assign as focus, which still only proposes a focus the player accepts.

## Screens

- Coach, phone: the Team board with its Course tab, the read sheet, the player sheet, the course sheet, the story viewer.
- Coach, desktop: two columns that end level (the hole and the spot card on the left; This week, Working on and the huddle in a rail), then roster and track record. Read, player, course and story open in an inspector on the right.
- Data states: loading, early season, no rounds yet, a failed source, long names.

## What must not change

- The green phone top bar and the desktop sidebar with glass top bar.
- What shot tracking collects. This is a view of existing data only.
- The CoachHelm evidence rule. Every read keeps its evidence and its strict bar; nothing shows a number it can't stand behind.
- Assign as focus still creates a proposal the player accepts.
- No accent left-border cards anywhere.
- The other lanes' screens: the read page (lane 2), Ask (lane 3), the coach and player view (Lenses), practice plan creation. This board links to them.
- Prep only: no deploys, no migrations, no flag flips. Build behind the team board flag named in `02-PLAN.md`, off in prod.

## Calls, settled

1. Open CoachHelm on the hole, named Team. Default: yes, built that way. One constant flips it (spec 8 Z).
2. A fifth tab, Course, beside the four spots, for course management, scoring and pressure reads (20 of 68 open reads on staging) plus the team's scoring history: week by week this season, every course played, and the team against Tour on par 3s, 4s and 5s, penalties, doubles and the first hole. Nick, Oct 31: "I like having 5th tab with course stuff like reads and perf history and the 4 open reads are good". Spec 4 (Course tab, Course sheet) and 8 U, X, Y.
3. Show every open read per player, up to 3 needs work and 1 working (4). No extra query; only reads actually drawn count as shown. Nick: "the 4 open reads are good".

The earlier call to turn on the Monday brief, team patterns and track record is gone: their flags are already on in production and preview. The old board's layout hid them.

Nick, Oct 31: "Handle any other questions they have." Every later design call is decided in this package as a default he can flip, listed in `README.md` under "Defaults Nick can flip".

Also decided in this lane: one shared read sheet with Lenses, and the app's own words and rounding throughout (spec 8).

## Done when

- Every state in `04-FIDELITY-SPEC.md` section 5 exists on a preview route and matches the page side by side: phone, larger phone, XXL, desktop at 1280, 1440 and 1728, light and dark.
- Every tap in section 6 does what it says, with the named hooks.
- Every motion in section 7 matches on the clips, and Reduce Motion is a 180ms fade.
- Every figure on screen comes from a source in `03-DATA-CHECKS.md`, or is hidden.
- Typecheck, lint and the existing CoachHelm tests pass.
