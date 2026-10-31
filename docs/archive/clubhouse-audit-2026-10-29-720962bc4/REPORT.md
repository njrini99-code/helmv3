# Clubhouse audit · run 2026-10-29-720962bc4 (lean)

**Overall C- (71.2) · Phone C- (71.5) · Desktop C- (70.6)**

74 findings: S0 5, S1 11, S2 29, S3 25, S4 4. Blocks deploy: 2. Blocks flip: 25.

Graded against Apple, hard on purpose. Lean scope: one pass by two graders on disjoint dimensions, no hand test. Grades are capped where evidence was thin (no evidence → C).

## Five lowest screens and what caps each
- **P010 Team Hub** (desktop) D 65: F-0002: Roster and Team Hub still call this the 2025-26 season
- **P007 Messages** (desktop) D 65: F-0003: A player's private message to Coach is posted to the whole Team Channel
- **P011 Rounds, Live and shot tracking** (phone) D 65: F-0005: Section numbers on Stats and Round review fall under 3:1 in dark
- **P005 Stats (player profile)** (desktop) D 65: F-0005: Section numbers on Stats and Round review fall under 3:1 in dark
- **P003 Roster** (desktop) D 65: F-0002: Roster and Team Hub still call this the 2025-26 season

## Ten fixes that move the grade most
1. **F-0002** S0 · S · P003: Roster and Team Hub still call this the 2025-26 season
2. **F-0005** S0 · S · P005: Section numbers on Stats and Round review fall under 3:1 in dark
3. **F-0001** S0 · S · P001: The bell tells the player an event starts at 2:00 PM when it starts at 10:00 AM Eastern
4. **F-0044** S2 · S · P001: Many desktop controls show no focus ring when tabbed to
5. **F-0004** S0 · M · P007: Start conversation with one player closes the sheet and opens nothing
6. **F-0022** S2 · M · P001: Desktop links, chips, inputs and drag handles under 24 px
7. **F-0035** S2 · S · P002: The eyebrow and date ink sits just under 4.5:1 on desktop
8. **F-0003** S0 · M · P007: A player's private message to Coach is posted to the whole Team Channel
9. **F-0017** S2 · S · P002: Tapping a second segment while the pill is still gliding makes it jump instead of turning
10. **F-0021** S2 · M · P001: Phone fields, selects and secondary buttons have hit areas of 20–43 pt instead of 44

## What blocks the first deploy
- F-0001 The bell tells the player an event starts at 2:00 PM when it starts at 10:00 AM Eastern. Notification text is built server-side by formatEventDate in the shared src/lib/calendar/rsvp.ts with toLocaleTimeString and no timeZone, so it renders in UTC for every Fairway user today, flags or not. Fix: format with the team time zone.
- F-0003 A player's private message to Coach is posted to the whole Team Channel. Precaution: the DM start goes through the shared createGolfConversation server action. This run did not prove the fault is Clubhouse-only; a private message reaching a whole real team is data harm. Downgrade to blocks-flip only once a check shows Fairway direct messages resolve correctly.

## What blocks the flag flip
- F-0002 S0 P003: Roster and Team Hub still call this the 2025-26 season
- F-0004 S0 P007: Start conversation with one player closes the sheet and opens nothing
- F-0005 S0 P005: Section numbers on Stats and Round review fall under 3:1 in dark
- F-0006 S1 P011: The drill-in push stalls once for 70–88 ms and drops about a fifth of its frames on a mid-tier phone
- F-0007 S1 P006: Switching Calendar between Day and Month animates the page height, so everything below reflows for 180 ms
- F-0008 S1 P001: Switching section from the strip stalls once for 50–79 ms on a mid-tier phone
- F-0009 S1 P010: The first click on a Team Hub row's More menu does nothing
- F-0010 S1 P006: Editing only an event's place marks it 'moved', and a different event shows 'Was 9:00 AM'
- F-0011 S1 P011: Going offline mid-round hides Exit, Scorecard and three result chips until the golfer scrolls
- F-0012 S1 P011: When the live feed fails, Live says nobody is on the course
- F-0013 S1 P011: If the qualifier list fails to load, setup looks as if there is no open qualifier
- F-0014 S1 P007: The Messages list stays a skeleton for 14 s on a cold open
- F-0015 S1 P005: The count on the profile's Rounds tab reads at 4.2:1 in dark
- F-0016 S1 P016: Tournaments compare has an axe critical: a role with the wrong children
- F-0018 S2 P001: With Reduce Motion on, sheets can no longer be dragged down and pushed pages can no longer be swiped back
- F-0019 S2 P011: Picking a shot result makes the shot card jump up 150 px in one frame
- F-0020 S2 P011: Recording a shot snaps the card 258 px with no transition, so the golfer can't see the shot land in the log
- F-0023 S2 P006: Going shows as chosen about a second after the tap
- F-0026 S2 P002: A quick double tap pushes the same page two or three times, so Back has to be pressed again
- F-0035 S2 P002: The eyebrow and date ink sits just under 4.5:1 on desktop
- F-0040 S2 P009: Counts and meta on the Qualifiers list read at 3.7-3.8:1 in dark
- F-0041 S2 P001: Body text passes WCAG but misses the Lc 75 floor in 59 dark and 27 light styles
- F-0043 S2 P010: Team Hub and profile tab labels miss Nick's Lc 75 gate in dark
- F-0044 S2 P001: Many desktop controls show no focus ring when tabbed to
- F-0067 S3 P005: The player hero mixes windows, and the 'better than previous 10' figure mirrors the SG value

## Family grades
| Family | Phone | Desktop |
|---|---|---|
| P001 Shell & navigation | D (65) | D (65) |
| P002 Home | B- (80.8) | C+ (77) |
| P003 Roster | D (65) | D (65) |
| P004 Stats (team) | C+ (77.3) | C+ (75.8) |
| P005 Stats (player profile) | D (65) | D (65) |
| P006 Calendar | C+ (77) | C (72.3) |
| P007 Messages | D (65) | D (65) |
| P008 Settings | C+ (77.1) | C+ (77.7) |
| P009 Qualifiers | C (74.9) | C (74.8) |
| P010 Team Hub | D (65) | D (65) |
| P011 Rounds, Live and shot tracking | D (65) | D (65) |
| P012 Classes (player) | C+ (76.6) | C (74.4) |
| P013 CoachHelm (Ask and Board) | C (75) | C+ (77.3) |
| P014 Recruiting (coach) | C+ (76.6) | C+ (77) |
| P015 Sign-in and onboarding | C+ (77.1) | C+ (77.7) |
| P016 Tournaments | C+ (75.9) | C (73.3) |

## Top ideas
- **I-01 RSVP from the Up next card** (Home › Up next card (player)): Going / Maybe / Can't as a three-way segmented under the countdown, using the event sheet's own RSVP action; the card stays the link to the event. *Job:* Player answers the next practice, several times a week per player. *Evidence:* RSVP today takes Home → Calendar → event sheet → choice (3 taps + a push); online RSVP shows in 1037 ms (writes.jsonl RSVP row; p2p3-lean/lean-coach/DONE.md); ev/t2/player-home-dark.png
- **I-02 Resume round on Home while a round is open** (Home, above Up next (player)): When rounds/continue has a round, Home shows one row "Hole 7 · Resume" that opens Track at the current hole; nothing when no round is open. *Job:* Golfer gets back into the round after a phone lock or app switch, every round, often several times. *Evidence:* /rounds shows "No round in progress" only on the Rounds tab (p2p3-lean/lean-player DONE.md); P1 could not reach rounds/continue without a live round
- **I-03 Compact offline pill on the shot screen** (Track › shot entry): Offline turns the full banner into a small pill in the top bar, so Exit, Scorecard and the result chips stay where the thumb expects; shots queue as today. *Job:* Logging shots on a course with patchy signal, every round on most courses. *Evidence:* F-0011 (banner hides Exit, Scorecard and three chips; ev/states/track-offline-hit.json)
- **I-04 Warm the five roster players' stats from Home** (Home leaderboard (coach)): Prefetch the player stats route for the visible leaderboard rows when Home is idle, so the tap opens in the warm-route time (~200 ms) instead of 2.3 s. *Job:* Coach checks one player after a round, daily in season. *Evidence:* Home → player stats 2317 ms warm vs other warm routes under 280 ms (p7-perf/lean-speed/summary.json, D-lean-speed-0003)
- **I-05 Show the cached thread list first on a cold open** (Messages list): Render the last-seen list from the client cache immediately, then reconcile; unread counts update in place. *Job:* Player or coach checks a reply, many times a day. *Evidence:* F-0014 (skeleton for 14 s cold, p7-perf)
- **I-06 Acknowledge from Home's "Waiting on you"** (Home › Waiting on you / From your coach row): The row expands in place to the announcement with its Acknowledge button; the Team Hub stays the full view. *Job:* Player clears the coach's posts that need an acknowledgement, weekly. *Evidence:* "1 to acknowledge" on Home routes to Team Hub ?tab=ann (P0 record, P1 coach/player rows)
- **I-07 Keep Week on the phone Calendar control** (Calendar phone segmented (Day / Month / List)): Add Week beside Day and Month, matching Home's This week strip and the desktop views, with the same glide. *Job:* Player plans the week of practice and travel, weekly. *Evidence:* lean-motion DONE.md: phone control is Day/Month/List, no Week; Home shows a week strip that opens Calendar on Day
- **I-08 Taller drill-in rows on the phone CoachHelm read** (CoachHelm › read card drill-in links): Turn the 19 px text links into 44 pt list rows with a chevron, same order and labels. *Job:* Coach opens the evidence behind a read between practices, daily for the coach. *Evidence:* grader A lowest unit: P013 phone touch D (rows 370×19)

## All findings
- **F-0001** S0 · blocks-deploy · P001 · correctness: The bell tells the player an event starts at 2:00 PM when it starts at 10:00 AM Eastern ([evidence](ev/P006/write-ht-player-pro.png))
- **F-0002** S0 · blocks-flip · P003 · correctness: Roster and Team Hub still call this the 2025-26 season ([evidence](p0-calibrate/ev/preview2-coach/roster.png))
- **F-0003** S0 · blocks-deploy · P007 · correctness: A player's private message to Coach is posted to the whole Team Channel ([evidence](ev/P007/write-p-dm-typed.png))
- **F-0004** S0 · blocks-flip · P007 · correctness: Start conversation with one player closes the sheet and opens nothing ([evidence](ev/P007/write-dm-pick.png))
- **F-0005** S0 · blocks-flip · P005 · contrast: Section numbers on Stats and Round review fall under 3:1 in dark ([evidence](ev/P004/stats__player-8091da4b-last-5-mba15-dark.png))
- **F-0006** S1 · blocks-flip · P011 · motion: The drill-in push stalls once for 70–88 ms and drops about a fifth of its frames on a mid-tier phone ([evidence](p6-motion/lean-motion/rows/MOT-03.jsonl))
- **F-0007** S1 · blocks-flip · P006 · motion: Switching Calendar between Day and Month animates the page height, so everything below reflows for 180 ms ([evidence](p6-motion/lean-motion/rows/MOT-65.jsonl))
- **F-0008** S1 · blocks-flip · P001 · motion: Switching section from the strip stalls once for 50–79 ms on a mid-tier phone ([evidence](p6-motion/lean-motion/trace-smoothness.json))
- **F-0009** S1 · blocks-flip · P010 · correctness: The first click on a Team Hub row's More menu does nothing ([evidence](ev/P010/write-c-task-more.png))
- **F-0010** S1 · blocks-flip · P006 · correctness: Editing only an event's place marks it 'moved', and a different event shows 'Was 9:00 AM' ([evidence](ev/P006/write-c-ev-more.png))
- **F-0011** S1 · blocks-flip · P011 · states: Going offline mid-round hides Exit, Scorecard and three result chips until the golfer scrolls ([evidence](ev/states/track-offline.png))
- **F-0012** S1 · blocks-flip · P011 · states: When the live feed fails, Live says nobody is on the course ([evidence](ev/states/live-failed.png))
- **F-0013** S1 · blocks-flip · P011 · states: If the qualifier list fails to load, setup looks as if there is no open qualifier ([evidence](ev/states/setup-qualifiersfailed.png))
- **F-0014** S1 · blocks-flip · P007 · speed: The Messages list stays a skeleton for 14 s on a cold open ([evidence](p7-perf/lean-speed/summary.json))
- **F-0015** S1 · blocks-flip · P005 · contrast: The count on the profile's Rounds tab reads at 4.2:1 in dark ([evidence](ev/P004/stats__player-8091da4b-tab-rounds-mba15-dark.png))
- **F-0016** S1 · blocks-flip · P016 · a11y: Tournaments compare has an axe critical: a role with the wrong children ([evidence](ev/P016/tournaments-compare-mba15-light.png))
- **F-0017** S2 · after · P002 · motion: Tapping a second segment while the pill is still gliding makes it jump instead of turning ([evidence](p6-motion/lean-motion/rows/MOT-42.jsonl))
- **F-0018** S2 · blocks-flip · P001 · motion: With Reduce Motion on, sheets can no longer be dragged down and pushed pages can no longer be swiped back ([evidence](p6-motion/lean-motion/rows/MOT-22.jsonl))
- **F-0019** S2 · blocks-flip · P011 · motion: Picking a shot result makes the shot card jump up 150 px in one frame ([evidence](p6-motion/lean-motion/rows/MOT-90.jsonl))
- **F-0020** S2 · blocks-flip · P011 · motion: Recording a shot snaps the card 258 px with no transition, so the golfer can't see the shot land in the log ([evidence](p6-motion/lean-motion/rows/MOT-91.jsonl))
- **F-0021** S2 · after · P001 · touch: Phone fields, selects and secondary buttons have hit areas of 20–43 pt instead of 44 ([evidence](ev/P006/calendar__new-1-pro-light.png))
- **F-0022** S2 · after · P001 · touch: Desktop links, chips, inputs and drag handles under 24 px ([evidence](ev/P002/home-mba15-light.png))
- **F-0023** S2 · blocks-flip · P006 · touch: Going shows as chosen about a second after the tap ([evidence](p2p3-lean/lean-coach/drafts-manual.jsonl))
- **F-0024** S2 · after · P016 · craft: Compare tags and a Team Hub caption are 11 px on the phone ([evidence](ev/P016/tournaments-compare-pro-light.png))
- **F-0025** S2 · after · P001 · correctness: A mistyped address says the page 'hasn't been rebuilt yet' instead of 'We couldn't find that' ([evidence](ev/p1/coach/audit-unknown-path-p1-pro.png))
- **F-0026** S2 · blocks-flip · P002 · correctness: A quick double tap pushes the same page two or three times, so Back has to be pressed again ([evidence](p2p3-lean/lean-coach/press/P002.jsonl))
- **F-0027** S2 · after · P006 · states: An RSVP made offline is refused rather than queued ([evidence](ev/P006/write-p-rsvp-offline.png))
- **F-0028** S2 · after · P006 · states: The event inspector squeezes a long title and place into a one-word-wide column ([evidence](ev/P006/write-c-ev-more.png))
- **F-0029** S2 · after · P006 · speed: Publishing an event takes 2.4 s, and the first of a session 5 to 14 s ([evidence](ev/P006/write-ev-after.png))
- **F-0030** S2 · after · P011 · states: Team rounds empty states give the coach nothing to do ([evidence](ev/states/team-rounds-noroster.png))
- **F-0031** S2 · after · P011 · contrast: Ghost hole numbers on the idle Rounds card and the empty setup scorecard are exposed as text at 1.9-2.8:1 ([evidence](ev/rounds/rounds-pro-light.png))
- **F-0032** S2 · after · P002 · speed: Coach Home takes 5.7 s to paint its main content on a cold open ([evidence](p7-perf/lean-speed/summary.json))
- **F-0033** S2 · after · P010 · speed: Team Hub takes 6.4 s to paint on a cold open ([evidence](p7-perf/lean-speed/summary.json))
- **F-0034** S2 · after · P005 · speed: Opening a player's stats from Home takes 2.3 s even when warm ([evidence](p7-perf/lean-speed/summary.json))
- **F-0035** S2 · blocks-flip · P002 · contrast: The eyebrow and date ink sits just under 4.5:1 on desktop ([evidence](ev/P002/home-mba15-light.png))
- **F-0036** S2 · after · P002 · contrast: The 'N' shortcut hint on New event reads at 3.5:1 in dark ([evidence](ev/P002/home-mba15-dark.png))
- **F-0037** S2 · after · P004 · contrast: Chart callouts ('Best', '−5.4') on team stats read at 2.6-3.4:1 ([evidence](ev/P004/stats-mba15-light.png))
- **F-0038** S2 · after · P002 · contrast: The struck-through 'was 10:00 AM' on a moved practice reads at 3.4:1 ([evidence](p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0022))
- **F-0039** S2 · after · P006 · contrast: Inspector meta on the desktop calendar reads at 3.7-4.0:1 in dark ([evidence](p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0018))
- **F-0040** S2 · blocks-flip · P009 · contrast: Counts and meta on the Qualifiers list read at 3.7-3.8:1 in dark ([evidence](ev/P009/qualifiers-pro-dark.png))
- **F-0041** S2 · blocks-flip · P001 · contrast: Body text passes WCAG but misses the Lc 75 floor in 59 dark and 27 light styles ([evidence](p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0031))
- **F-0042** S2 · after · P013 · a11y: CoachHelm evidence panels scroll but can't be reached by keyboard ([evidence](ev/P013/coachhelm__view-ask-c-c1a1055f-pro-light.png))
- **F-0043** S2 · blocks-flip · P010 · contrast: Team Hub and profile tab labels miss Nick's Lc 75 gate in dark ([evidence](p2p3-lean/lean-player/rows/team-hub.jsonl))
- **F-0044** S2 · blocks-flip · P001 · a11y: Many desktop controls show no focus ring when tabbed to ([evidence](p2p3-lean/lean-coach/press/P002.jsonl))
- **F-0045** S2 · after · P011 · speed: Discarding a round takes 3 s, assigning a task 1.8 s, starting a DM 1.8 s ([evidence](writes.jsonl#W-015))
- **F-0046** S3 · after · P001 · motion: On a section switch the strip row jumps sideways and the plate flies in from off-screen while the strip closes ([evidence](ev/motion/MOT-06a/C1-webkit-Messages-r1-geometry.json))
- **F-0047** S3 · after · P006 · motion: The Calendar now-pill pulse repaints on the main thread every frame ([evidence](ev/motion/MOT-67/C2-calendar-idle-strip-trace.json))
- **F-0048** S3 · after · P007 · touch: The conversation 'Actions for…' button on phone can't be tapped ([evidence](p2p3-lean/lean-coach/press/P007.jsonl))
- **F-0049** S3 · after · P011 · touch: On desktop New round, the sticky Start round footer covers the 'Not live' control when it is scrolled to ([evidence](p2p3-lean/lean-player/rows/rounds.jsonl))
- **F-0050** S3 · after · P005 · craft: Stats chart labels are 11 px on the phone ([evidence](ev/stats/stats-pro-light.png))
- **F-0051** S3 · after · P007 · craft: The Announcements card on Messages pokes about 3 pt outside the page edge ([evidence](ev/t2/player-messages-light.png))
- **F-0052** S3 · after · P007 · craft: A conversation's last-message preview breaks into a three-line stack ('Coach:' / poll icon / 'staging check') ([evidence](ev/t2/player-messages-light.png))
- **F-0053** S3 · after · P006 · system: Calendar calls the same view 'List' on the phone and 'Agenda' on desktop, and the phone has no Week ([evidence](ev/P006/calendar__view-month-pro-dark.png))
- **F-0054** S3 · after · P016 · system: The pushed New event page shows its title twice at rest: in the bar and as the large title ([evidence](ev/P016/tournaments-new-pro-light.png))
- **F-0055** S3 · after · P001 · speed: Old addresses show a blank 'Opening…' canvas for up to 3.3 s ([evidence](p1-crawl/p1-player/rows/courses--pro.json))
- **F-0056** S3 · after · P001 · correctness: A coach qualifying link opened by a player lands on a qualifier page with an empty heading ([evidence](ev/p1/player/coachhelm_qualifying_0a0d1700-0000-4000-8000-0000000000a1-pro.png))
- **F-0057** S3 · after · P006 · correctness: Double-clicking a calendar event or day fires its reads twice and adds a navigation ([evidence](p2p3-lean/lean-coach/press/P006.jsonl))
- **F-0058** S3 · after · P006 · a11y: After cancelling or deleting an event, another event's menu or peek opens by itself ([evidence](ev/P006/write-c-ev-cancelled.png))
- **F-0059** S3 · after · P001 · states: The bell, + and compose buttons are missing from loading skeletons and pop in ([evidence](ev/states/home-loading.png))
- **F-0060** S3 · after · P011 · states: Round review skeleton draws a pale hero where the loaded hero is dark green ([evidence](ev/states/round-loading.png))
- **F-0061** S3 · after · P005 · states: Two failed reads say what happened but give no Try again button ([evidence](ev/states/player-readsfailed.png))
- **F-0062** S3 · after · P001 · contrast: Meta text and two big figures sit under Lc 60 ([evidence](p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0038))
- **F-0063** S3 · after · P005 · a11y: Stats and Team Hub skip heading levels ([evidence](p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0041))
- **F-0064** S3 · after · P005 · a11y: Two Stats sections share the same landmark name ([evidence](p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0042))
- **F-0065** S3 · after · P001 · a11y: 'Skip to content' is still off screen right after Tab focuses it ([evidence](p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0037))
- **F-0066** S3 · after · P001 · correctness: Coach-only addresses silently show the player's own view and keep the coach parameters ([evidence](p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0046))
- **F-0067** S3 · blocks-flip · P005 · correctness: The player hero mixes windows, and the 'better than previous 10' figure mirrors the SG value ([evidence](ev/P004/stats__player-faced578-mba15-light.png))
- **F-0068** S3 · after · P009 · content: A qualifier under the 'Active' heading is labelled 'Ended' ([evidence](ev/P009/qualifiers-pro-light.png))
- **F-0069** S3 · after · P013 · content: Some headings and labels are cut off with no ellipsis ([evidence](ev/P009/qualifiers-86dad12b-selection-pro-light.png))
- **F-0070** S3 · after · P013 · content: One CoachHelm card says the same putting figure three ways ([evidence](ev/P013/coachhelm-pro-light.png))
- **F-0071** S4 · after · P007 · motion: Opening a conversation or an event sheet ticks a selection haptic ([evidence](p6-motion/lean-motion/rows/MOT-30.jsonl))
- **F-0072** S4 · after · P001 · touch: Legacy :hover rules outside (hover: hover) ship in the CSS the phone loads ([evidence](p8-sim/rows.jsonl))
- **F-0073** S4 · after · P001 · craft: Avatar initials are sized off the type scale ([evidence](ev/stats/stats-pro-light.png))
- **F-0074** S4 · after · P002 · craft: 'From your coach' summary wraps with a separator dot stranded at the end of the line ([evidence](ev/t2/player-home-dark.png))

## Not covered this run
- Drafts no grader judged: 0 of 277 (listed in p9-grade/orphan-drafts.json); they are not graded and not in findings.jsonl.
- Lean scope (Nick, Oct 29): sizes se/max/mba13/others, contrast-more, colour-vision and Reduce Motion sweep variants, long-content swaps, most fixture states (105 of 144 daily states; other families none), full motion catalogue (16 MOT ids measured), desktop motion, 50-loop heap, slow-network suite, journeys beyond the write script, CoachHelm Ask (0 of 3 prompts), calibration round, second grading pass, skeptic.
- Hand test (T3): skipped by Nick. Motion is capped below A+.
- Simulator: T2b Capacitor shell not run; on-screen keyboard not raised by script; safariTouchDrag hung; rotation not proved (Xcode 27 renamed the Simulator app); no reference captures (ref/).
- Staging accounts that do not exist: assistant coach (SH-26), dual-role login (SH-27), teamless pass (SH-25): fixtures only, not run in lean.
- Not pressed by rule: never-click list, Settings rows that save on change, poll (would go to the Team Channel), task edit (no control), Confirm squad, Post round.

## Environment notes
- Preview https://helmv3-di47g3o0g-nick-rinis-projects.vercel.app (main 720962b, staging ybmwektreyrwjscxlogv, Preview flag set). Local dev for fixtures (Development flag set).
- Mac: M4, 16 GB, 100 Hz display (no 120 Hz). Run kept to two agents at a time for memory.
- Staging side effects: the demo player's Team Channel thread was marked read by viewing it in P1; a player DM test landed in the Team Channel (all demo accounts) and was deleted.

Files: scorecard.json, findings.jsonl, ideas.jsonl, taste.md, fix-packets/. Nothing was fixed, merged or deployed to production by this run.