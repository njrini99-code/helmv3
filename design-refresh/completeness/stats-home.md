# Lane report: stats-home (completeness pass, 4 Nov 2026)

Lane: `pkg/design-refresh/stats-home/` (phone My stats, Team Stats, player Home "Your game"). Top-level `stats-and-home-phone.html` read only; it is byte-identical to `stats-home/redesign/stats-and-home-phone.html`.

Files changed (each has the pointer under its H1 and one `## Completeness pass, 4 Nov 2026` section at the end): `02-PLAN.md` (21 rows), `03-DATA-CHECKS.md` (10), `05-SCREENS.md` (60), `06-SCREEN-SPECS.md` (29), `07-MOTION.md` (36), `08-ACCEPTANCE.md` (41, CP-114 to CP-154). Also `capture/screens.json` (10 new IDs; `flagoff`, `w600`, `w820` on every ID; `practice` on S-STATS) and `capture/capture.mjs` (w600 and w820 viewports, the `lrow` selector, 15 new motion rows), so 05 and screens.json still agree. `node --check` passes; the JSON parses.

## 1. Matrix

"Before" is what 05 to 08 already stated. "Shared rows" means 05 CP's rows for every ID: flagoff, first-run, role, w820, keyboard, voiceover, one (fixed), long notes; 08 CP-114, 115, 122, 128, 138 to 144 check them.

| Item ID | Kind | States covered before | Gaps found | What I added |
|---|---|---|---|---|
| S-STATS | screen | default, loading, empty, failed, few, long, xxl, dark, reduce, 390, 430; lots/one/offline/desktop as one-liners | flag-off, first-run with no goals, filter or season empty, role, 431 to 820, keyboard/focus, VoiceOver, practice rounds, pull to refresh, double tap | 05 shared rows + S-STATS.filter-empty, .refresh; 03 practice, 1 Aug; 06 focus, names, 820; 08 CP-114, 122, 123, 125, 128, 132, 138 to 142, 150 |
| S-STATS.stuck | inline | parent's | flag-off, 820 | shared rows; CP-144 |
| S-STATS.window | inline | parent's | a window that needs a fetch, failure and offline rollback, window change before Back | S-STATS.updating; 07 M-STATS-33; CP-127, 150 |
| S-STATS.custom | inline | default row wrongly said Last 10; no motion | default rule, segment appear/clear motion | 05 per-ID row; 07 M-STATS-36; CP-147 |
| S-STATS.scrub | inline | parent's | one round (nothing to scrub), keyboard slider, VoiceOver | 05 per-ID; 06 one round, names; CP-126, 142 |
| S-STATS.filter | sheet (today's) | "unchanged" only | no 07 row, no 08 check, focus return | 07 M-STATS-30; CP-119, 146 |
| S-STATS.switcher | menu (today's) | "unchanged" only | no 07 row | 07 M-STATS-31; CP-121, 146 |
| S-STATS.scoring | push | drawn set; loading/failed/empty said "can't occur" | deep link while loading, failed, empty; one round chart | fixed 3 rows in place; S-STATS.detail-loading; CP-126, 129 |
| S-STATS.sg | push | as scoring | as scoring; Open a part had no motion row | fixed in place; 07 M-STATS-37 (instant swap, as the page's `push()` does); CP-148 |
| S-STATS.sg-pin | inline | drawn | VoiceOver (`aria-pressed`) | 06 names; CP-142 |
| S-STATS.how | inline | drawn | none beyond shared | shared rows |
| S-STATS.tee | push | as scoring | as scoring | fixed in place; CP-117 (named with the others) |
| S-STATS.approach | push | as scoring; no 08 check by ID | no 08 criterion, no 07 row by ID | fixed in place; 07 coverage table; CP-117 |
| S-STATS.short | push | as approach | as approach | as approach |
| S-STATS.putting | push | as approach | as approach | as approach |
| S-STATS.rounds | push | drawn, long | lots, return from a round (scroll and history doubling bug), removed round | S-STATS.return; 02 hook change; CP-130, 135, 137 |
| S-STATS.round | push (today's) | "unchanged" | no motion in or out, no Back rule | 07 M-STATS-28, 29; CP-121, 130, 145 |
| S-STATS.goals | push | drawn; empty opens | today's sheets inside, first run with no goals, deep link from `dev_plan_assigned` on a cold start | S-STATS.goals-sheets, .detail-loading; CP-122, 129, 133 |
| S-STATS.coach | screen variant | rule only | entry motion, Share, removed player, Message handoff | 07 coverage; S-STATS.share, .denied; CP-133, 134, 153 |
| S-TEAMSTATS | screen | as S-STATS (team) | flag-off, filter or season empty, player access | S-TEAMSTATS.filter-empty; S-STATS.denied; CP-123, 124, 134 |
| S-TEAMSTATS.filter | sheet (today's) | "unchanged" | as S-STATS.filter | M-STATS-30; CP-119 |
| S-TEAMSTATS.tscore | push | drawn; no 08 check by ID | no 08 criterion by ID | CP-118; fixed in place |
| S-TEAMSTATS.tgame | push | drawn; no 08 check by ID | as tscore | CP-118; fixed in place |
| S-TEAMSTATS.tplayers | push | drawn, long | lots (25, 40), removed player mid-session | 05 per-ID; CP-135, 137 |
| S-TEAMSTATS.pin | inline | drawn | VoiceOver | 06 names; CP-142 |
| S-TEAMSTATS.peek | sheet (today's) | "unchanged"; no 07 or 08 | motion, focus return, opens over the detail | M-STATS-30; CP-120 |
| S-TEAMSTATS.player | push (today's) | "unchanged" | motion out and back, return to detail, removed player | M-STATS-28, 29; CP-130, 137 |
| S-HOMEGAME | card | drawn set; desktop and offline rows were Stats text; one generic | desktop, offline, one round, season start, flag-off, boundary with Classes, Try again scope, press | fixed 3 rows in place; S-HOMEGAME.season-start; 05 per-ID; 07 M-HOME-02, 04; CP-116, 124, 126, 149 |
| S-HOMEGAME.leg | link | rule only | press, Back to Home, partial-failure leg, none (no links), flag-off | 05 per-ID; 07 M-HOME-02, 03; CP-149, 151 |
| S-ALL.retry | inline | drawn | Home retry is card only; failed deep link opens after retry | 05 per-ID; M-HOME-04; CP-129, 149 |
| S-STATS.filter-empty (new) | inline | none | everything | 05, 06, 07 M-STATS-35, 03, CP-123, 124 |
| S-TEAMSTATS.filter-empty (new) | inline | none | everything | as above |
| S-STATS.updating (new) | inline | none | everything | 05, 06, M-STATS-33, 35, CP-127 |
| S-STATS.detail-loading (new) | inline | none | everything | 05, 06, M-STATS-34, CP-129 |
| S-STATS.return (new) | inline | none | everything | 05, 02 hook, M-STATS-29, CP-130 |
| S-STATS.refresh (new) | inline (today's) | none | everything | 05, M-STATS-32, CP-132 |
| S-STATS.goals-sheets (new) | sheets (today's) | none | everything | 05, M-STATS-30, CP-133 |
| S-STATS.share (new) | sheet (today's) | none | everything | 05, M-STATS-30, CP-133 |
| S-STATS.denied (new) | inline | none | everything | 05, 03, CP-134 |
| S-HOMEGAME.season-start (new) | inline | none | everything | 05, 06, 03, CP-124 |

## 2. Gaps filled

74 distinct gaps, 197 added rows, 46 in-place fixes:
- 32 detail matrix rows in 05 said a detail "can't occur" while loading, failed or empty, and that deep links land on the summary. Fixed: loading shows the detail's bar plus a skeleton, then lands in place; failed keeps the hash and opens after Try again; empty lands on the summary, except Goals, which opens. This matters for the `dev_plan_assigned` push on a cold start.
- 3 S-HOMEGAME rows (desktop, offline, one) were copied from Stats text. 1 S-TEAMSTATS few row said "rounds" where it means round days.
- Press: 5 places in 07, 08 and 02 (see contradictions).
- 4a "visible Missed short" in 02 and 08 (now behind the flag).
- The wrong `00-shared/` path in 08 and 06.
- 02's `large-title` test line contradicted Override 3.

Biggest real bug caught: `useStatsDetail` would double the history (replace plus push again) when Back returns onto a `#sd-rounds` entry from the round page. The rule and test are in 02 CP and CP-130.

## 3. Handoffs

| From | To | Trigger | Context carried | Back | Other lane's flag off |
|---|---|---|---|---|---|
| Player Home leg (this lane) | S-STATS.<part> | tap a leg | `#gm-<part>`, Last 10 | Stats summary, then Home (section fade, M-HOME-03) | same flag, so it's consistent |
| S-STATS.rounds | today's round page | tap a row | round id | the detail at its scroll (S-STATS.return) | n/a |
| S-TEAMSTATS.tplayers | S-STATS.coach (`?player=`) | second tap on a pinned row | player id, window | Team players detail at its scroll | n/a |
| S-TEAMSTATS.tplayers | today's PlayerPeek | tap a Players row | player | closes to the row | n/a |
| S-STATS.coach | Messages | Message in the coach head | player id (today's link) | Stats | Messages flag off: today's Messages |
| Coach Home (Classes) | S-TEAMSTATS; S-STATS.sg over coach; S-STATS.coach | "Team stats", a leg name, the round sheet's "Player stats" | `?player=&tab=game` | Stats summary, then coach Home | either flag off: lands on a working Stats page (CP-152) |
| Roster profile, RoundReview, TeamRounds | S-STATS.rounds | All N rounds | `?player&window&tab=rounds` | summary, then source | n/a |
| Lenses "Open profile" | Roster profile, then above | menu | player | as Roster | Lenses off: today's |
| Ask read chip "Open in Stats" | S-STATS.coach, a part detail, or the player's own S-STATS | tap | existing `coachhelm-chat-links.ts` href | summary, then Ask | Ask off: today's Ask links, same targets |
| Push `dev_plan_assigned`, bell row | S-STATS.goals | notification | `?tab=dev` | summary | n/a |
| Push `round_submitted` (coach) | S-TEAMSTATS | notification | none | as today | n/a |
| Stats or Home | Ask, CoachHelm Read, Lenses | none drawn | nothing built (CP-153) | n/a | n/a |

Contradictions seen:
1. **Press.** This lane said cards never scale (CH-1606, 1 Oct). START_HERE's shared values (Press: 0.97 on tappable cards, rows wash), DESIGN_LANGUAGE's Summary to detail ("press 0.97") and Classes M-CRH-01 all scale cards. The shared table wins, so I fixed 07 M-STATS-16 and 17, the never-animate bullet, 08 criterion 83 and 02 Override 7. Cards now scale 0.97 and keep the drawn wash; rows and tiles only wash. BUILD_BRIEF PR 4b still says "No card scale on press", and its PR 12 says the opposite.
2. **Sparks.** Player Home's spark area grows once (Stats M-STATS-13, as drawn). Coach Home's sparks never grow (Classes 07 rule 4). Left as drawn; the two Homes will differ there.
3. **Who owns `PlayerHomePhone.tsx`.** Classes 02 says this lane owns it and `.ch-ph-leg`. This lane's 02 never named the file. I wrote the boundary into 05 (S-HOMEGAME boundary row) and CP-116: this lane owns the Your game card only. The hero, greeting and Up next are today's, plus PR 10's bar.
4. **No lane flag.** This lane had no flag, and START_HERE rule 1 requires one. I added `clubhouse_stats_redesign_v1` (02 CP).
5. **Practice rounds.** Classes 03 says `round_type` is never filtered today, so Stats likely counts practice rounds. SHARED-11 and DECISIONS keep them out. I wrote the rule into 03 CP and CP-125.

## 4. Needs a shared-file change

- **START_HERE §4 row 5** and **BUILD_BRIEF "PR 4a, 4b, 4c" / "PR 5" / "PR 6"**: add "Behind the new `clubhouse_stats_redesign_v1`, off in every environment; with it off, phone Stats, Team Stats and player Home's Your game render as main, Missed short included. No migration." Why: every other lane names its flag, and this one had none.
- **BUILD_BRIEF PR 4b**: replace "No card scale on press." with "Cards press at 0.97 with the pressed wash (START_HERE shared Press value); rows and tiles wash only." Why: it contradicts the shared table and BUILD_BRIEF's own PR 12.
- **DECISIONS, "Calls the design lane made"**: add "Stats | Practice rounds | Out of every average, SG and team figure by default, as on Roster and Home (SHARED-11); StatsFilter can still include them on purpose". Also add "Stats | Card press | 0.97 plus the wash, per the shared values; CH-1606 now covers rows only". Why: both change visible numbers or feel. If Nick reverses either, it changes in one place.
- **AGENT_KIT**: none.

## 5. Calls only Nick can make (my pick is built; each flips in one line)

1. Practice rounds out of My stats averages by default, if today counts them. Options: out (matches Roster and Home), or in (today). **Pick: out.**
2. Stats card press. Options: scale 0.97 plus the wash (shared values), or wash only (CH-1606). **Pick: 0.97 plus the wash.**
3. Missed short fix. Options: behind the flag (rule 1), or ship unflagged as a correctness fix. **Pick: behind the flag.**

## 6. START_HERE / BUILD_BRIEF check

- §4 row 5 lists PR 4a to 4c, 5 and 6. 4d (desktop tokens) is optional and is only opened if 02 conflict 19 is decided, so it's fine to leave out.
- Every 05 ID has a PR, or is marked "none (unchanged)" because it is today's component: S-STATS.filter, .switcher, .round, S-TEAMSTATS.filter, .peek, .player.
- The ten new IDs map to 4b, 4c, 5 and 6 in 02 CP's PR mapping and 08 CP-154. No screen is left without a PR.
- Order: PR 10 (Classes, step 4) lands before PR 6 (step 5), as the player Home re-shoot needs. No conflict.
