# Fidelity audit: Classes / Roster / Home and Stats

Repo `helmv3` at main `062f8a2`, read-only. Lanes: classes-roster-home (flag `clubhouse_classes_roster_home_v1`, `data-ch-crh="on"`) and stats-home + stats-shots (flag `clubhouse_stats_redesign_v1`, `statsRedesignEnabled()` in `src/clubhouse/gate.ts:112`, prop `shs`). Both flags are off in production and on in preview, so every "reachable" below means reachable in preview, or in production once the flag is turned on.

Design references: `design-refresh/classes-roster-home/` (04-FIDELITY-SPEC, 05-SCREENS, 06-SCREEN-SPECS, 08-ACCEPTANCE, SUBSURFACES, `redesign/clubhouse-phone-redesign.html`); `design-refresh/stats-home/` (04, 05, 06, 08, `redesign/stats-phone.css`); `design-refresh/stats-and-home-phone.html`.

Prior lanes are not repeated here: CRH-1..35 (`lanes/crh.md`), STATS-1..19 (`lanes/stats.md`), QA-1..18 (`lanes/qa-staging.md`). Where a finding builds on one of those, it says "extends".

Paths below are relative to `src/clubhouse/` unless they start with `src/app/` or `design-refresh/`.

## Subpage inventory

| lane | subpage/state | phone/desktop | file:line | design ref | status |
|---|---|---|---|---|---|
| CRH | Classes, player, default | phone | `screens/classes/ClassesView.tsx:397` (crh branch) | clubhouse-phone-redesign.html Classes; SUBSURFACES Classes | matches (extends CRH-14, CRH-15, CRH-18, CRH-26, CRH-27, CRH-33) |
| CRH | Classes + menu (Add class / Import schedule) | phone | `screens/classes/ClassesView.tsx:576-583` (MenuSheet) | SUBSURFACES "+ menu" | matches |
| CRH | Classes term card | phone | `screens/classes/ClassesCrh.tsx:65` (TermCard) | 06 term card | matches (extends CRH-18, CRH-35) |
| CRH | Classes today ribbon | phone | `screens/classes/ClassesCrh.tsx:215` (TodayCard) | 06 day ribbon | drifts (CRH-15, CRH-16, CRH-27) |
| CRH | Classes overlaps card | phone | `screens/classes/ClassesCrh.tsx:254` (OverlapsCardCrh) | SUBSURFACES overlaps | matches |
| CRH | Class detail sheet, 90% detent | phone | `screens/classes/ClassDetail.tsx:132` (`detent={crh ? 0.9 : undefined}`) | SUBSURFACES class detail 90% | matches |
| CRH | Exam sheet, class form, import steps, delete confirm | phone | `screens/classes/ClassesView.tsx` (sheets opened from the crh branch) | SUBSURFACES | matches (structure; legacy forms reused per SUBSURFACES) |
| CRH | Classes long names | phone | `src/app/clubhouse-preview/[screen]/page.tsx:352` (PREVIEW_CLASSES_LONG) | 08 long state | matches |
| CRH | Classes loading | phone | `src/app/clubhouse-preview/[screen]/page.tsx:345`; `screens/classes/ClassesSkeleton.tsx` | 08 loading | matches |
| CRH | Classes empty / failed / partial / mixed | phone | `src/app/clubhouse-preview/[screen]/page.tsx:352` | 08 states | matches |
| CRH | Classes, coach | phone + desktop | `src/app/golf/(dashboard)/dashboard/classes/loading.tsx` (coach branch is legacy) | design is player-only | missing in design (coach keeps legacy page) |
| CRH | Classes desktop binders | desktop | `screens/classes/ClassesView.tsx` | 06 desktop | drifts (CRH-28) |
| CRH | Roster coach, default | phone | `screens/roster/RosterPhoneCrh.tsx:166` | clubhouse-phone-redesign.html Roster | matches (extends CRH-13, CRH-24, CRH-25) |
| CRH | Roster leaders scroller | phone | `screens/roster/RosterPhoneCrh.tsx` (leaders) | 06 leaders | drifts (CRH-13, CRH-24) |
| CRH | Roster join requests row + sheet, 62% detent | phone | `screens/roster/RosterPhoneCrh.tsx:468-488` | SUBSURFACES requests 62% | matches (extends CRH-34) |
| CRH | Roster player profile push | phone | `screens/roster/RosterPhoneCrh.tsx:~290`; `screens/roster/RosterProfileCrh.tsx:62-71` ("Plan 1:1") | design phone profile | matches |
| CRH | Roster player actions sheet | phone | `screens/roster/RosterPhoneCrh.tsx:544` (PlayerActionsCrh) | SUBSURFACES actions | matches |
| CRH | Roster discard confirm | phone | `screens/roster/RosterPhoneCrh.tsx:~316` | SUBSURFACES confirm | matches |
| CRH | Roster invite sheet / email invites | phone | `src/app/clubhouse-preview/[screen]/page.tsx:196` (`invite-email`, `&invite=1`) | SUBSURFACES invite | matches |
| CRH | Roster early read ("Early read · N rounds") | phone | `screens/roster/format.ts:63`; preview `:397` | 08 early | matches |
| CRH | Roster long / big text / no requests / one request | phone | `src/app/clubhouse-preview/[screen]/page.tsx:196,397-405` | 08 states | matches |
| CRH | Roster empty / failed / partial / availability (injured, away) | phone | `src/app/clubhouse-preview/[screen]/page.tsx:196` | 08 states | matches |
| CRH | Roster, player view | phone | `screens/roster/TeamRosterPhoneCrh.tsx:27` | design player roster | drifts (CRH-30) |
| CRH | Roster desktop head + context line | desktop | `screens/roster/Roster.tsx:572-598` | 06:551; 03-DATA-CHECKS:290 | matches (copy is the 03:290 decision, "Team average 73.0 over the season.") |
| CRH | Roster desktop "Needs a look" strip removed | desktop | `screens/roster/Roster.tsx:645` (`!crh`) | 06:551 "removed" | matches |
| CRH | Roster desktop peek ("Schedule 1:1", "Open full profile") | desktop | `screens/roster/RosterPeek.tsx:198,293` | 06 7.12 | matches |
| CRH | Roster desktop toolbar | desktop | `screens/roster/Roster.tsx` | 06:551 | drifts (QA-13) |
| CRH | Coach Home hero + waiting on you | phone | `screens/home/HomePhone.tsx` | 06 Home | drifts (CRH-5, CRH-17) |
| CRH | Coach Home form / day card | phone | `screens/home/HomePhone.tsx:374` (Form) | 06 Home | matches |
| CRH | Coach Home today + class line sheet | phone | `screens/home/HomePhone.tsx` | 06 Today | drifts (CRH-2, CRH-29) |
| CRH | Coach Home live now / since you last looked | phone | `screens/home/HomePhone.tsx` | 06 | drifts (CRH-6) |
| CRH | Coach Home team scoring | phone | `screens/home/HomePhone.tsx` | 06 | drifts (CRH-7, CRH-21) |
| CRH | Coach Home the team's game | phone | `screens/home/HomePhone.tsx` | 06 | drifts (CRH-3, CRH-8..10, CRH-20, CRH-32) |
| CRH | Coach Home this week strip | phone | `screens/home/HomePhone.tsx:437` (WeekStrip) | 06 | drifts (CRH-4, CRH-11, CRH-12, CRH-23) |
| CRH | Coach Home latest rounds + round sheet 74% | phone | `screens/home/HomePhone.tsx:507,639,649` | SUBSURFACES round sheet 74% | drifts (CRH-1, CRH-22) |
| CRH | Coach Home failed | phone | `screens/home/HomePhone.tsx:477` (CrhFailedCard) | 08 failed | matches |
| CRH | Coach Home first run / empty / events only / no rounds / loading | phone | `screens/home/CoachHome.tsx:184-190`; `src/app/clubhouse-preview/[screen]/page.tsx:282` | 08 states | matches (CRH-5 in first run) |
| CRH | Coach Home desktop (next, agenda, rounds, board) | desktop | `screens/home/HomeDeskCrh.tsx:23,72,105,133`; `screens/home/CoachHome.tsx:59` | 06 desktop | drifts (CRH-31, QA-12) |
| CRH | Player Home | phone | `screens/home/PlayerHomePhone.tsx:52` | not in 04 (coach only) | missing in code (CRH-19); bar change tied to Stats flag (FID-CRH-1) |
| STATS | S-STATS My stats summary | phone | `screens/stats/StatsPlayerPhoneShs.tsx:203` | stats-and-home-phone.html renderStats | drifts (FID-STATS-1, -6, -7) |
| STATS | S-STATS.stuck sticky window switch | phone | `screens/stats/StatsPlayerPhoneShs.tsx:223`; `styles/stats-redesign.css:41-47` | stats-phone.css:357 | drifts (FID-STATS-8; STATS-5, STATS-18) |
| STATS | S-STATS.window | phone | `screens/stats/StatsPlayerPhoneShs.tsx:225` (WindowSwitch) | 05 | matches |
| STATS | S-STATS.custom range | phone | `screens/stats/StatsPlayerPhoneShs.tsx:223` (`is-custom`) | 05 | matches |
| STATS | S-STATS.filter sheet | phone | `screens/stats/StatsPlayerPhoneShs.tsx:226` (StatsFilter) | 06:143 | drifts (FID-STATS-8) |
| STATS | S-STATS.switcher (coach "Player stats ⌄") | phone | `screens/stats/StatsPlayerPhoneShs.tsx:201` | 08 #47 | missing in code (FID-STATS-11) |
| STATS | S-STATS.coach head | phone | `screens/stats/StatsPlayerPhoneShs.tsx:207-220` | 08 #47 | drifts (STATS-1) |
| STATS | S-STATS.scoring feature card + detail | phone | `screens/stats/StatsPlayerPhoneShs.tsx:369`, `:823` | 06:64-78; 08 #10 | drifts (FID-STATS-10; STATS-6, STATS-12) |
| STATS | S-STATS.scrub (scoring chart slider) | phone | `screens/stats/StatsPlayerPhoneShs.tsx` (ScoringCard) | 05 | matches |
| STATS | What changed card | phone | `screens/stats/StatsPlayerPhoneShs.tsx:259,438-447` | stats-and-home-phone.html | drifts (FID-STATS-2) |
| STATS | S-STATS.sg card + detail | phone | `screens/stats/StatsPlayerPhoneShs.tsx:520,937-1032` | 05 | matches |
| STATS | S-STATS.sg-pin | phone | `screens/stats/StatsPlayerPhoneShs.tsx` (SG detail) | 05 | matches |
| STATS | S-STATS.how (how SG works) | phone | `screens/stats/StatsPlayerPhoneShs.tsx` | 05 | matches |
| STATS | S-STATS.tee / approach / short / putting details (`#gm-*`) | phone | `screens/stats/detail-route.ts`; `screens/stats/StatsPlayer.tsx:409` (GameDetail) | 05 | drifts (STATS-2, -3, -9, -10, -11, -14, -15) |
| STATS | S-STATS.rounds detail | phone | `screens/stats/StatsPlayerPhoneShs.tsx:1040` | 05 | drifts (STATS-17) |
| STATS | S-STATS.round (open a round) | phone | `screens/stats/StatsPlayerPhoneShs.tsx:1032`; `shell/nav.ts:364-365` | 05 | drifts (FID-STATS-5) |
| STATS | S-STATS.goals card + detail | phone | `screens/stats/StatsPlayerPhoneShs.tsx:726,1099-1162` | stats-and-home-phone.html:1295-1297 | drifts (FID-STATS-3) |
| STATS | first run (no rounds) | phone | `screens/stats/StatsPlayerPhoneShs.tsx:223,236` | stats-and-home-phone.html:1157 | drifts (FID-STATS-9) |
| STATS | early read ("From N rounds.") | phone | `screens/stats/StatsPlayerPhoneShs.tsx:237-240` | stats-and-home-phone.html FEWNOTE | matches |
| STATS | no shots (SG needs three rounds) | phone | `screens/stats/StatsPlayerPhoneShs.tsx:242-245` | 05 | matches |
| STATS | filter empty | phone | `screens/stats/StatsPlayerPhoneShs.tsx:231-234` | 05 | matches |
| STATS | loading | phone | `screens/stats/ShsSkeleton.tsx` | 06 skeleton | drifts (STATS-16) |
| STATS | detail loading (cold `#sd-*`, `?tab=`) | phone | `screens/stats/detail-route.ts`; `screens/stats/StatsPlayer.tsx:95` | 08 CP-129 | matches |
| STATS | failed (CH-5201) + Try again (S-ALL.retry) | phone | `screens/stats/StatsPlayerPhoneShs.tsx:324-354`; `screens/stats/StatsPlayer.tsx:234,255` | 08 #100 | drifts (FID-STATS-4; STATS-7) |
| STATS | big text | phone | `screens/stats/StatsPlayerPhoneShs.tsx:89-99,137` | 06 XXL | matches |
| STATS | S-TEAMSTATS summary | phone | `screens/stats/StatsTeamPhoneShs.tsx:193` | 06:754-766 | drifts (FID-STATS-1, -6) |
| STATS | S-TEAMSTATS.filter | phone | `screens/stats/StatsTeamPhoneShs.tsx` | 05 | matches |
| STATS | S-TEAMSTATS.tscore detail | phone | `screens/stats/StatsTeamPhoneShs.tsx:371` | stats-and-home-phone.html:1353 | drifts (FID-STATS-12) |
| STATS | The round card | phone | `screens/stats/StatsTeamPhoneShs.tsx:340` | stats-and-home-phone.html:1355,1360 | drifts (FID-STATS-12) |
| STATS | S-TEAMSTATS.tgame detail | phone | `screens/stats/StatsTeamPhoneShs.tsx` (TeamGameDetail) | 08 #55 | matches (readout without range is sanctioned by 08 #55; STATS-4) |
| STATS | S-TEAMSTATS.tplayers detail | phone | `screens/stats/StatsTeamPhoneShs.tsx` | 05 | drifts (STATS-13) |
| STATS | S-TEAMSTATS.pin / peek | phone | `screens/stats/StatsTeamPhoneShs.tsx` | 05 | matches |
| STATS | S-TEAMSTATS.player (open a player) | phone | `screens/stats/StatsPlayer.tsx:232,253` | 08 #47 | drifts (FID-STATS-11) |
| STATS | team failed (CH-4201) | phone | `screens/stats/StatsTeamPhoneShs.tsx:239-266` | 08 #100 | drifts (FID-STATS-4) |
| STATS | team big text | phone | `screens/stats/StatsTeamPhoneShs.tsx:124` | 06 XXL | drifts (FID-STATS-13) |
| STATS | Team stats as a player | phone | `routes/stats.tsx` (player always own profile) | 08 SHARED-11 | matches (unreachable for player by design) |
| STATS | S-HOMEGAME Your game card | phone | `screens/home/PlayerGame.tsx:456-495`; `screens/home/PlayerHomePhone.tsx` | 05:44; stats-and-home-phone.html:1383-1389 | drifts (FID-STATS-14, -15, -16) |
| STATS | S-HOMEGAME.leg (opens `#gm-*`) | phone | `screens/home/PlayerGame.tsx:451,504-508` | 05 | drifts (FID-STATS-15) |
| STATS | Your game no rounds (CH-2311) / cache failed (CH-2216) | phone | `screens/home/PlayerGame.tsx:473-486` | 08 #102, #104 | drifts (FID-STATS-15) |
| STATS | Player Home green top | phone | `screens/home/PlayerHomePhone.tsx:52`; `styles/stats-redesign.css:2012-2039` | stats-and-home-phone.html:1389; 04:175 | drifts (FID-STATS-16) |
| STATS | Stats desktop (player + team tabs) | desktop | `screens/stats/StatsPlayer.tsx:95` (desktopTabOfHash) | not redrawn by stats-home | drifts (STATS-19, QA-14) |

Rows: 80 (CRH 39, STATS 41).

## Feature checklist

| lane | claimed feature (source §) | built | real data | reachable | works | flag | evidence |
|---|---|---|---|---|---|---|---|
| CRH | Classes + menu with Add class / Import schedule (SUBSURFACES) | yes | yes | yes | yes | crh | `screens/classes/ClassesView.tsx:576-583` |
| CRH | Class detail at 90% detent (SUBSURFACES) | yes | yes | yes | yes | crh | `screens/classes/ClassDetail.tsx:132` |
| CRH | Term card with now knob (04 §5) | yes | yes | yes | partly (CRH-18, CRH-35) | crh | `screens/classes/ClassesCrh.tsx:65` |
| CRH | Today ribbon 7 AM-5 PM (04 §5) | yes | yes | yes | partly (CRH-15, CRH-27) | crh | `screens/classes/ClassesCrh.tsx:215` |
| CRH | Overlaps card (04 §5) | yes | yes | yes | yes | crh | `screens/classes/ClassesCrh.tsx:254` |
| CRH | Long / loading / empty / failed states for Classes (08) | yes | fixtures + live | yes | yes | crh | `src/app/clubhouse-preview/[screen]/page.tsx:345-352` |
| CRH | Roster leaders with year colour (04 §6) | yes | yes | yes | partly (CRH-13) | crh | `screens/roster/RosterPhoneCrh.tsx` |
| CRH | Join requests sheet at 62% (SUBSURFACES) | yes | yes | yes | yes | crh | `screens/roster/RosterPhoneCrh.tsx:468-488` |
| CRH | Profile push with Plan 1:1 (04 §6) | yes | yes | yes | yes | crh | `screens/roster/RosterProfileCrh.tsx:62-71` |
| CRH | Player actions sheet and discard confirm (SUBSURFACES) | yes | yes | yes | yes | crh | `screens/roster/RosterPhoneCrh.tsx:316,544` |
| CRH | Early read label (03) | yes | yes | yes | yes | crh | `screens/roster/format.ts:63` |
| CRH | Desktop roster: Needs a look removed, peek labels (06:551, 7.12) | yes | yes | yes | yes | crh | `screens/roster/Roster.tsx:645`; `screens/roster/RosterPeek.tsx:198,293` |
| CRH | Coach Home form, week strip, latest rounds, round sheet 74% (04 §7) | yes | yes | yes | partly (CRH-1, -4, -11, -12, -22) | crh | `screens/home/HomePhone.tsx:374,437,507,639,649` |
| CRH | Coach Home failed card (08) | yes | yes | yes | yes | crh | `screens/home/HomePhone.tsx:477` |
| CRH | Coach Home desktop next / agenda / rounds / board (06) | yes | yes | yes | partly (CRH-31) | crh | `screens/home/HomeDeskCrh.tsx:23,72,105,133` |
| CRH | Player Home's bar changes with the lane (README) | partly | n/a | only with Stats flag on | no with crh alone | crh + shs | `styles/shell.css:4396`; `screens/home/PlayerHomePhone.tsx:52` (FID-CRH-1) |
| CRH | Player Home redesigned to cards | no | n/a | n/a | n/a | none | CRH-19 |
| STATS | Sticky window switch with Custom segment (05 S-STATS.stuck/.custom) | yes | yes | yes | yes | shs | `screens/stats/StatsPlayerPhoneShs.tsx:223-229` |
| STATS | Filter button 40x40 r14 in the house segment well (06:143) | partly | yes | yes | yes | shs | `styles/stats-redesign.css:90-102` (FID-STATS-8) |
| STATS | Cards r18, padding 14 16 16, head 10 above body (06:64) | partly | n/a | yes | no (r16, 12, 8) | shs | `styles/stats-redesign.css:136-159` (FID-STATS-1) |
| STATS | Section names 700 22/28 wdth 92, 30pt below the card above (06:62,75) | partly | n/a | yes | no (600, wdth 96, 28pt) | shs | `styles/stats-redesign.css:125-131` (FID-STATS-6) |
| STATS | Flat feature card (08 #10, 06:65, fixed 4 Nov) | yes | yes | yes | yes | shs | `styles/stats-redesign.css:241` |
| STATS | Scoring chart legend "Par 72" (design :1165) | partly | yes | yes | no ("Par") | shs | `screens/stats/StatsPlayerPhoneShs.tsx:428-430` (FID-STATS-10) |
| STATS | What changed sentence (design renderStats) | yes | yes | yes | no (grammar) | shs | `screens/stats/StatsPlayerPhoneShs.tsx:438-447` (FID-STATS-2) |
| STATS | SG card, detail, pin, how (05) | yes | yes | yes | yes | shs | `screens/stats/StatsPlayerPhoneShs.tsx:520,937-1032` |
| STATS | Game legs details by `#gm-*` hash (05) | yes | yes | yes | yes (see STATS-2..15) | shs | `screens/stats/detail-route.ts` |
| STATS | Rounds detail and opening a round (05 .rounds/.round) | yes | yes | yes | partly (Back target) | shs | `screens/stats/StatsPlayerPhoneShs.tsx:1032,1040`; `shell/nav.ts:364-365` (FID-STATS-5) |
| STATS | Goals detail with hero and status pill (design :1295) | partly | yes | yes | no hero | shs | `screens/stats/StatsPlayerPhoneShs.tsx:1099-1162` (FID-STATS-3) |
| STATS | First run draws no window switch (design :1157) | no | n/a | yes | no | shs | `screens/stats/StatsPlayerPhoneShs.tsx:223` (FID-STATS-9) |
| STATS | Early read and no-shots notes (05) | yes | yes | yes | yes | shs | `screens/stats/StatsPlayerPhoneShs.tsx:237-245` |
| STATS | Try again shows skeleton, then lands; second tap ignored (08 #100) | partly | yes | yes | no skeleton | shs | `screens/stats/StatsPlayerPhoneShs.tsx:324-354`; `screens/stats/StatsTeamPhoneShs.tsx:239-266` (FID-STATS-4) |
| STATS | Coach bar "Player stats ⌄" switcher; detail back "‹ Player stats" (08 #47) | partly | yes | yes | no switcher | shs | `screens/stats/StatsPlayerPhoneShs.tsx:153,201` (FID-STATS-11) |
| STATS | Team summary: scoring, the round, team game, players (06:754) | yes | yes | coach only | partly | shs | `screens/stats/StatsTeamPhoneShs.tsx:193,340` (FID-STATS-12) |
| STATS | Team scoring detail caption with window (design :1353) | partly | yes | yes | no window label | shs | `screens/stats/StatsTeamPhoneShs.tsx:371` (FID-STATS-12) |
| STATS | Team "loses the least" sentence (08 #57) | yes | yes | yes | yes | shs | `screens/stats/StatsTeamPhoneShs.tsx:48-52` |
| STATS | Team follows Text Size live (06 XXL) | partly | n/a | yes | no live update | shs | `screens/stats/StatsTeamPhoneShs.tsx:44-46,124` (FID-STATS-13) |
| STATS | Team route never reaches a player (SHARED-11) | yes | yes | n/a | yes | shs | `routes/stats.tsx` |
| STATS | Your game card under the greeting (05:44) | partly | yes | yes | placed low | shs | `screens/home/PlayerHomePhone.tsx` (FID-STATS-16) |
| STATS | Your game legs open `#gm-*` (05 S-HOMEGAME.leg) | yes | yes | yes | yes | shs | `screens/home/PlayerGame.tsx:451,504` |
| STATS | Your game few-rounds footnote "From N rounds." (design :1383) | partly | yes | yes | no lead | shs | `screens/home/PlayerGame.tsx:461-466` (FID-STATS-15) |
| STATS | No rounds beats failed on Your game (08 #104) | no | yes | yes | no | shs | `screens/home/PlayerGame.tsx:473-486` (FID-STATS-15) |
| STATS | Player Home greeting with avatar and next event (design :1389, 04:175) | partly | n/a | yes | no avatar or subline | shs | `screens/home/PlayerHomePhone.tsx:52`; `styles/stats-redesign.css:2012-2039` (FID-STATS-16) |
| BOTH | Shipped to production | no | n/a | preview only | n/a | both flags false in production | `gate.ts:112`; lane flag config |

Claimed features: 43. Not fully built or not working as claimed: 25 (rows marked partly / no in "built" or "works").

## Findings

### FID-STATS-1 Every Stats card is radius 16 with 12pt top padding and an 8pt head gap; design is 18 / 14 / 10
- Severity: P1
- Where: My stats and Team stats, every summary and detail card, phone, light and dark
- File: `styles/stats-redesign.css:136-145` (`.ch-shs-card`), `:146` (`.ch-shs-card.is-flushb`), `:152-159` (`.ch-shs-ah`)
- What's wrong: `.ch-shs-card` is `border-radius: var(--ch-radius-lg)` (16px) and `padding: 12px 16px 16px`. Design is radius 18 and padding 14 16 16. `.is-flushb` is `12px 0 4px`; design `.card.air.flushb` is `14px 0 4px`. `.ch-shs-ah` is `gap: 4px 8px; margin-bottom: 8px`; design is `gap: 4px 10px; margin-bottom: 10px`. Each card is 2px tighter at the top, the title sits 2px closer to the body and the corners are 2px tighter, on every card on both pages.
- Should be: `design-refresh/stats-home/06-SCREEN-SPECS.md:64` ("radius 18, padding 14 16 16 16 ... 10pt above the body"); `04-FIDELITY-SPEC.md:219`; `redesign/stats-phone.css:365,366,398`
- Fix: Add `--ch-radius-card-lg: 18px` next to `--ch-radius-card` in `styles/tokens.css:531`, or set 18px in the lane's scope. Then use `padding: 14px 16px 16px`, `.is-flushb { padding: 14px 0 4px }`, and `.ch-shs-ah { gap: 4px 10px; margin-bottom: 10px }`. Leave the skeleton card head at 12 (`stats-phone.css:629`).
- Confidence: high

### FID-STATS-2 "What changed" sentence has wrong grammar and raw metric labels
- Severity: P1
- Where: My stats, What changed card and Scoring detail "against" section, phone, light and dark, player and coach
- File: `screens/stats/StatsPlayerPhoneShs.tsx:438-447` (change sentence builder); subjects from `lib/data/stats-figures.ts:166-170`
- What's wrong: The verb is chosen by `l.subject.startsWith('Putts') || l.subject.endsWith('s') ? 'are' : 'is'`, and the subject is the raw figure label. The subjects are 'Scoring avg', 'Greens in regulation', 'Fairways hit' and 'Putts per round', so the card prints "Greens in regulation is up 5.6 pts", "Fairways hit is down ..." and "Scoring avg is down 1.2", with the clipped label "avg" in a sentence. The tail is cut from the first line's words with `/than (.*)$/`, which gives ", against previous 10." with no article. The code comment at :438 also shows "the previous 10". The design writes full sentences: "Your scoring average is X lower than the N rounds before. Greens are up ...".
- Should be: `design-refresh/stats-and-home-phone.html` renderStats What changed copy; 06 "sentence case, full words"
- Fix: Give each figure a sentence noun and number in `stats-figures.ts` (for example `{ noun: 'greens in regulation', plural: true }`, `{ noun: 'your scoring average', plural: false }`) and choose the verb from that. Write the tail from the window count ("than the 10 rounds before") instead of a regex over another line's words.
- Confidence: high

### FID-STATS-3 Goals detail has no hero, and the coach empty state points to a section that isn't there
- Severity: P1
- Where: My stats > Goals and focus areas detail (`#sd-goals`), phone, light and dark, player and coach
- File: `screens/stats/StatsPlayerPhoneShs.tsx:1099-1162` (`GoalsDetail`), `:1106` (meta), `:1134` (Focus areas meta), `:1136` (coach empty body)
- What's wrong: The design opens the detail with `dHero(m, 'Scoring average · goal is under 75 this season', <pill On track | X to go>)`. The code goes straight to the "Goals this season" card with no `DetailHero`, unlike every other Stats detail. The Goals card meta is `plural(n, 'goal')` and the Focus areas meta is "N active · N waiting on ...". The design has no meta on Goals and "From your coach" on Focus areas. The coach's empty Focus areas body says "Add one from a weak section above.", but nothing is above it on this page: the detail holds only the two cards.
- Should be: `design-refresh/stats-and-home-phone.html:1295-1297`; 06 detail hero `.d-hero` (06:194)
- Fix: Render `<DetailHero figure={...} caption={`${goal metric} · goal is ${target}`} chips={<ShsPill tone={onTrack ? 'gain' : 'flat'}>...</ShsPill>} />` from the first active goal (the same component as the SG detail, `:937`). Use meta "From your coach" on Focus areas for the player. Change the coach empty copy so it points to the summary's sections ("Add one from a leg on the Stats page."), or add the focus action here.
- Confidence: high

### FID-STATS-4 Try again shows no skeleton and has no busy state you can see; it stays dead if the refresh brings back the same data (extends STATS-7)
- Severity: P1
- Where: My stats failed (CH-5201) and Team stats failed (CH-4201), phone, light and dark
- File: `screens/stats/StatsPlayerPhoneShs.tsx:324-354` (`FailedCard`); `screens/stats/StatsTeamPhoneShs.tsx:239-266` (`TeamFailedCard`); `screens/stats/StatsPlayer.tsx:234,255` (`onRetry={() => router.refresh()}`)
- What's wrong: A tap sets `busy` and calls `router.refresh()`. The failed card stays on screen, and the only change is `aria-disabled`, which has no visual. No skeleton is drawn. `busy` is cleared only by `useEffect(() => setBusy(false), [seen])`, so if the refresh returns props that are referentially equal, or the RSC request fails, the button stays disabled with no feedback. The criterion says Try again shows the skeleton, then the page lands with no animation.
- Should be: `design-refresh/stats-home/08-ACCEPTANCE.md:158` (#100, S-ALL.retry, M-STATS-25); 08 CP-147
- Fix: Wrap the refresh in `useTransition` (`startTransition(() => router.refresh())`). While `isPending`, render `ShsSkeleton` (it already exists for loading) in place of the sheet. Clear busy when the transition ends, not when the data identity changes. Use the ui `Button` `loading` state per STATS-7.
- Confidence: high

### FID-STATS-5 Back from a round opened in Stats goes to the Rounds list (player) or team Stats (coach)
- Severity: P1
- Where: My stats > Rounds detail, SG detail round trend > a round > Back, phone, player and coach
- File: `shell/nav.ts:364-365` (round page `top`); `shell/phone-chrome.tsx:401-405` (`parent ? router.push(parent)`); round links `screens/stats/StatsPlayerPhoneShs.tsx:1032` (`rebuiltHref('/golf/dashboard/rounds/<id>')`)
- What's wrong: The round page's top bar has a fixed parent. For a player it reads "‹ Rounds" and pushes `/golf/dashboard/rounds`. For a coach it reads "‹ Stats" and pushes `/golf/dashboard/stats` without `?player=` or the `#sd-rounds` hash. A player who opens a round from Stats lands on a different tab's list. A coach who opens one from a player's Stats lands on team Stats and loses the player, the window and the scroll position.
- Should be: 05 S-STATS.round, and 08 deep-link criteria ("Back returns, scroll restored"; 08 test list `stats-summary-cards.test.tsx`, `stats-deep-links.e2e`)
- Fix: When the round is opened from Stats, pass a `from` param (or use `history.back()` when `document.referrer` / the client history entry is the Stats URL). Have `nav.ts` read it: back label "My stats" or "Player stats", parent = the full Stats URL with `?player=`, the window and the `#sd-*` hash.
- Confidence: high

### FID-STATS-6 Section names are weight 600, wdth 96 and 28pt below the card above; design is 700, wdth 92 and 30pt
- Severity: P2
- Where: My stats and Team stats section names (Overview, Your game, Rounds, Development; Team game, Players), phone, light and dark
- File: `styles/stats-redesign.css:125-131` (`.ch-shs-sech`)
- What's wrong: `font: var(--ch-type-22-strong)` is 600 22/28. Design is 700 22/28. `font-variation-settings: 'wdth' 96`; design is wdth 92. `margin: 16px 2px 0`; design is `18px 2px 0`, so the name sits 28pt below the card above instead of 30.
- Should be: `design-refresh/stats-home/06-SCREEN-SPECS.md:62,75`; `04-FIDELITY-SPEC.md:139,215`; `stats-phone.css:363`
- Fix: `font: 700 calc(22 * var(--ch-type-k))/calc(28 * var(--ch-type-k)) var(--ch-font-sans); font-variation-settings: 'wdth' 92; margin: 18px 2px 0;`. 04:139 proposed a new token. The `--ch-type-section` that exists (`tokens.css:358`) is 600 20/25, which is another value, so add `--ch-type-section-lg` instead of reusing it.
- Confidence: high

### FID-STATS-7 All condensed figures use wdth 96; the spec sets wdth 92 everywhere
- Severity: P2
- Where: Stats feature figure, summary and cell figures, Home leg figures and greeting, phone, light and dark
- File: `styles/stats-redesign.css` (8 rules with `'wdth' 96`, for example `:128`, `:2036`, `:2131-2134` `.ch-shs-leg__v`; 0 rules with 92)
- What's wrong: Every condensed setting in the lane is `'wdth' 96`, which matches the house `--ch-wdth-display` (`tokens.css:348`). Every design row (hero 40, summary 34, tile 28, cell 24, section 22, greeting 22) specifies wdth 92, so figures render visibly wider than the design. Wide figures are what push "−5.7"-style values toward the chevron at large Text Size.
- Should be: `design-refresh/stats-home/04-FIDELITY-SPEC.md:139,150-155,175`; `06-SCREEN-SPECS.md:11,75-111`
- Fix: Add `--ch-wdth-figure: 'wdth' 92` to `tokens.css` and use it in those 8 rules. If wdth 96 was a deliberate house choice, record it in DECISIONS and update 06.
- Confidence: high (values); medium on whether 96 was intended (no decision found)

### FID-STATS-8 Window switch bar, filter button and sheet bottom are each off by 2 to 8px
- Severity: P2
- Where: My stats and Team stats, sticky switch and page bottom, phone, light and dark
- File: `styles/stats-redesign.css:41-47` (`.ch-shs .ch-shs-ctl`), `:90-102` (`.ch-shs-ctl .ch-sf__open`), `:119-123` (`.ch-shs-sheet`)
- What's wrong: The switch bar padding is `2px edge 8px`; design is `2px 16px 10px`. The filter button is `border-radius: var(--ch-radius-md)` (12px) on a flat `--ch-well-bg` with no shadow; design is radius 14 on the segment well `--seg` with `--seg-sh`, matching the segmented control beside it. The sheet's bottom padding is 48px; design is 56.
- Should be: `stats-phone.css:357,361,590`; `06-SCREEN-SPECS.md:123,143,194,258` ("Sheet bottom padding 56")
- Fix: `.ch-shs-ctl { padding: 2px var(--ch-page-x-phone) 10px }`; `.ch-sf__open { border-radius: 14px; background: <the WindowSwitch track background>; box-shadow: <its inset shadow> }` (reuse the WindowSwitch track's tokens so the two read as one control); `.ch-shs-sheet { padding-bottom: 56px }`.
- Confidence: high

### FID-STATS-9 First run (no rounds) still shows the window switch and filter
- Severity: P2
- Where: My stats with no rounds (first-run card), phone, player and coach
- File: `screens/stats/StatsPlayerPhoneShs.tsx:223-229` (switch rendered for every state), `:236` (`FirstRunCard`)
- What's wrong: The design's `S.data==='none'` branch draws the bar, then the sheet with the empty card and Development. It has no `winCtl`. The code renders `.ch-shs-ctl` unconditionally, so a player with no rounds sees "Last 10 / Season / ..." segments and a filter that change nothing.
- Should be: `design-refresh/stats-and-home-phone.html:1157` (renderStats `none` branch) against `:1158-1159` (normal branch)
- Fix: Wrap the `.ch-shs-ctl` block in `{!firstRun && (...)}`. Keep it for `noRounds` under a filter, where switching the window can bring rounds back.
- Confidence: high

### FID-STATS-10 Scoring chart legend reads "Par" without the par value
- Severity: P2
- Where: My stats Scoring feature card legend, phone, light and dark
- File: `screens/stats/StatsPlayerPhoneShs.tsx:428-430` (legend `<i className="lp" />Par`)
- What's wrong: The legend says "Par". The design says "Par ${P}" ("Par 72"), so the dashed line is labelled with its value.
- Should be: `design-refresh/stats-and-home-phone.html:1165`
- Fix: `Par {par}` when `par != null` (the same `par` already passed to `Ribbon` at `:823`). Hide the legend item when par is null.
- Confidence: high

### FID-STATS-11 Coach player Stats has no "Player stats ⌄" switcher, and Team always goes back to team Stats
- Severity: P2
- Where: Stats `?player=`, coach, phone
- File: `screens/stats/StatsPlayerPhoneShs.tsx:201` (`PhoneTop title="Player stats" back={{ label: 'Team', ... }}`); `screens/stats/StatsPlayer.tsx:232,253` (`onBackToTeam={() => go(null, data.filter)}`)
- What's wrong: The bar is a plain title with a "‹ Team" back. The criterion says the bar reads "Player stats ⌄", a switcher to move between players. `onBackToTeam` always pushes team Stats, so a coach who came from Roster's profile, a Home "team's game" name or an Ask link is sent to team Stats, not back where they came from.
- Should be: `design-refresh/stats-home/08-ACCEPTANCE.md:81` (#47, 04 §8)
- Fix: Give `PhoneTop` a title menu (the same pattern as the PhoneTop switcher used where `start` is set) listing the roster's active players. Make Back use `router.back()` when the previous entry is in the app, and fall back to team Stats only on a cold load.
- Confidence: medium (the switcher's exact menu isn't drawn in the design; the label is in 08)

### FID-STATS-12 Team "The round" meta and Team scoring hero caption drop the comparison and window words
- Severity: P2
- Where: Team stats summary (The round) and Team scoring detail (`#sd-team-score`), coach, phone
- File: `screens/stats/StatsTeamPhoneShs.tsx:340` (`meta={windowDays(data)}`), `:371` (`caption={['Team scoring average', toPar(data)]...}`)
- What's wrong: The round meta is always the window ("Last 10 days"). The design shows "vs the N before" when there is a previous window, and the window only when there isn't. The hero caption reads "Team scoring average · +2.1 to par". The design adds the window: "Team scoring average · +2.1 to par · Last 10 round days".
- Should be: `design-refresh/stats-and-home-phone.html:1353,1355,1360`
- Fix: `meta={data.prev ? `vs the ${data.prevDays} before` : windowDays(data)}` (use the previous-window count the delta chip already reads). Append `windowDays(data)` to the caption array.
- Confidence: high (copy); medium on the field name for the previous-window count

### FID-STATS-13 Team stats reads Text Size once and never updates
- Severity: P2
- Where: Team stats, big-text layout, coach, phone
- File: `screens/stats/StatsTeamPhoneShs.tsx:44-46` (`bigText()`), `:124` (`useEffect(() => setBig(bigText()), [])`)
- What's wrong: The player page uses `useBigText()` with a `MutationObserver` (`StatsPlayerPhoneShs.tsx:89-99`), so changing Text Size while the page is open moves it to the big layout. The team page reads `--ch-type-scale` once on mount, so it stays in the wrong layout until it is reloaded.
- Should be: 06 XXL layout rules (same as My stats, 06:754 "Same card system as My stats")
- Fix: Export `useBigText` from `StatsPlayerPhoneShs.tsx` (or move it to `ui/`) and use it in `StatsTeamPhoneShs.tsx` in place of `bigText()` + `useEffect`.
- Confidence: high

### FID-STATS-14 Your game card paddings are 2px short in four places
- Severity: P2
- Where: Player Home > Your game, phone, light and dark
- File: `styles/stats-redesign.css:2049-2056` (`.ch-shs-yg__h`), `:2087-2097` (`.ch-shs-yg__none`), `:2098` (`.ch-shs-leg`), `:2222-2226` (`.ch-shs-leg__n`), `:2227-2232` (`.ch-shs-yg__foot`)
- What's wrong: The header is `12px 16px 12px`; design card head is 14 at top. The leg is `12px 16px 16px`; design `.cb` is `14px 16px 16px`. The leg note margin-top is 8px; design `.leg .cnt` is 10px. The footnote is `12px 16px 12px`; design `.cn` is `12px 16px 14px`. The empty body is `12px 16px 16px` with a 4px gap and the body at line-height 20. The design is `.cb` 14 16 16 plus `.cb-empty` 6 0 4, and the body at 15/21.
- Should be: `stats-phone.css:107,109,315,653-655`; `design-refresh/stats-home/08-ACCEPTANCE.md:162` (#102: "400 15/21")
- Fix: Set these values: head padding-top 14, leg padding `14px 16px 16px`, note margin-top 10, foot padding-bottom 14, empty body `padding: 14px 16px 16px` with an inner `padding: 6px 0 4px`, and span `line-height: calc(21 * var(--ch-type-k))`.
- Confidence: high

### FID-STATS-15 Your game: few-rounds note lacks its lead, failed hides the empty body, and the pill adds "SG"
- Severity: P2
- Where: Player Home > Your game in the early, no-rounds + cache-failed and normal states, phone
- File: `screens/home/PlayerGame.tsx:461-466` (footnote), `:473-486` (`cacheError` with `!any`), `:508` (`{formatSigned(g.sg)} SG`)
- What's wrong: The early-read footnote starts "Each figure shows with an early-read tag ...". The design's `few` note starts "From 2 rounds." (`From N rounds.`), like the Stats early note. With no rounds and a cache error, the code shows the CH-2216 notice and returns `null` for the body. The criterion says the empty body wins. The leg pill reads "−0.9 SG". The design pill is the figure alone, and the meaning is in the header ("Strokes gained vs Tour") and the aria-label, which `:504` already carries.
- Should be: `design-refresh/stats-and-home-phone.html:1383` (`few:'From 2 rounds. ...'`); `design-refresh/stats-home/08-ACCEPTANCE.md:164` (#104)
- Fix: Prefix the early footnote with `From ${plural(rounds, 'round')}.` in bold. When `!any`, always render the CH-2311 body and drop the notice. Render `<ShsPill tone={tone}>{formatSigned(g.sg)}</ShsPill>`.
- Confidence: high

### FID-STATS-16 Player Home green top has no avatar or next-event line, and Your game sits far below it (extends CRH-19)
- Severity: P2
- Where: Player Home, top and first sections, phone, light and dark
- File: `screens/home/PlayerHomePhone.tsx:52` and the section order after it (Up next, actions, asks, live, since, week, today and latest round before `YourGameCard`); `styles/stats-redesign.css:2012-2039` (`.ch-shs-hero-top`)
- What's wrong: The design's `.who` row is a 40pt avatar, the greeting "Good afternoon, Jonah" at 600 22/1.2, −0.015em, wdth 92, and the next-event line "Practice at 3:30 · Lonnie Poole range". The code draws a date line and the greeting at `--ch-type-22-strong` (22/28), wdth 96, −0.01em, with no avatar and no event line. 05 places S-HOMEGAME "under the greeting". The code renders it after up to eight other sections, so on a busy day it is off the first screen.
- Should be: `design-refresh/stats-and-home-phone.html:1389`; `design-refresh/stats-home/04-FIDELITY-SPEC.md:175`; `05-SCREENS.md:44`
- Fix: Render `<Avatar size="md">` and a second line from the next event `PlayerHomePhone` already loads for Up next (`{title} at {time} · {place}`). Use `line-height: 1.2; letter-spacing: -0.015em; wdth 92`. Move `<YourGameCard>` directly under the hero, or record the order in DECISIONS if Up next is meant to lead.
- Confidence: high (values); placement needs a decision

### FID-CRH-1 Player Home's bar only changes when the Stats flag is also on (extends CRH-19)
- Severity: P2
- Where: Player Home, phone top bar, light and dark, crh on with stats-redesign off
- File: `styles/shell.css:4396` (`.ch-root[data-ch-crh='on'][data-phone-hero]:has(.ch-hm[data-ch-crh='on'], [data-ch-hero-flat]) .ch-topbar`); `screens/home/PlayerHomePhone.tsx:52` (`data-ch-hero-flat={shs ? '' : undefined}`)
- What's wrong: The `--ch-frame` bar applies when a `.ch-hm` has `data-ch-crh='on'` (coach Home only) or when `[data-ch-hero-flat]` is present. Player Home sets the latter only when `shs` is true. With the lane's flag on and the Stats flag off, the player's top bar keeps the old radial hero while the coach's and every other crh tab's bar is flat. The lane README says the player Home's bar changes with the lane.
- Should be: `design-refresh/classes-roster-home/README.md` (bar change covers player Home); 04 §2 bar
- Fix: Set `data-ch-crh={crh ? 'on' : undefined}` on the player's `main.ch-hm` (pass `crh` the way `HomePhone` gets it), so the `:has(.ch-hm[data-ch-crh='on'])` branch matches. Keep `data-ch-hero-flat` for the green hero under Stats.
- Confidence: medium (the case only exists while the two flags differ; both are on in preview)

## Decisions needed

- Condensed width: the lane uses the house `'wdth' 96`; every stats-home spec row says 92 (FID-STATS-7). Either change the 8 rules or record 96 as house and update 06.
- Player Home order: S-HOMEGAME "under the greeting" (05:44) against the current order with Up next first (FID-STATS-16).
- Coach Back from a player's Stats: always team Stats (current) against back to where the coach came from (FID-STATS-11). The round page Back target needs the same call (FID-STATS-5).
- Coach Classes: design covers players only, and coaches keep the legacy page. Confirm this is intended scope.
