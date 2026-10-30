# Clubhouse audit hand-back · run 2026-10-29-720962bc4 (lean)

**Overall C- · Phone C- · Desktop C-** (74 findings; S0 5, S1 11).

**Five lowest screens:**
- P010 Team Hub (desktop) D: F-0002: Roster and Team Hub still call this the 2025-26 season
- P007 Messages (desktop) D: F-0003: A player's private message to Coach is posted to the whole Team Channel
- P011 Rounds, Live and shot tracking (phone) D: F-0005: Section numbers on Stats and Round review fall under 3:1 in dark
- P005 Stats (player profile) (desktop) D: F-0005: Section numbers on Stats and Round review fall under 3:1 in dark
- P003 Roster (desktop) D: F-0002: Roster and Team Hub still call this the 2025-26 season

**Ten fixes that move the grade most:**
1. F-0002 (S0, S) Roster and Team Hub still call this the 2025-26 season
2. F-0005 (S0, S) Section numbers on Stats and Round review fall under 3:1 in dark
3. F-0001 (S0, S) The bell tells the player an event starts at 2:00 PM when it starts at 10:00 AM Eastern
4. F-0044 (S2, S) Many desktop controls show no focus ring when tabbed to
5. F-0004 (S0, M) Start conversation with one player closes the sheet and opens nothing
6. F-0022 (S2, M) Desktop links, chips, inputs and drag handles under 24 px
7. F-0035 (S2, S) The eyebrow and date ink sits just under 4.5:1 on desktop
8. F-0003 (S0, M) A player's private message to Coach is posted to the whole Team Channel
9. F-0017 (S2, S) Tapping a second segment while the pill is still gliding makes it jump instead of turning
10. F-0021 (S2, M) Phone fields, selects and secondary buttons have hit areas of 20–43 pt instead of 44

**Blocks the first deploy:** F-0001 The bell tells the player an event starts at 2:00 PM when it starts at 10:00 AM Eastern; F-0003 A player's private message to Coach is posted to the whole Team Channel. **Blocks the flag flip:** 25 findings (fix packets 01+).

**Top ideas:** RSVP from the Up next card · Resume round on Home while a round is open · Compact offline pill on the shot screen · Warm the five roster players' stats from Home · Show the cached thread list first on a cold open · Acknowledge from Home's "Waiting on you" · Keep Week on the phone Calendar control · Taller drill-in rows on the phone CoachHelm read

**Environment:** Preview https://helmv3-di47g3o0g-nick-rinis-projects.vercel.app (main 720962b, staging ybmwektreyrwjscxlogv, Preview flag set). Local dev for fixtures (Development flag set). Mac: M4, 16 GB, 100 Hz display (no 120 Hz). Run kept to two agents at a time for memory. Staging side effects: the demo player's Team Channel thread was marked read by viewing it in P1; a player DM test landed in the Team Channel (all demo accounts) and was deleted.

**Not tested:** Drafts no grader judged: 0 of 277 (listed in p9-grade/orphan-drafts.json); they are not graded and not in findings.jsonl. Lean scope (Nick, Oct 29): sizes se/max/mba13/others, contrast-more, colour-vision and Reduce Motion sweep variants, long-content swaps, most fixture states (105 of 144 daily states; other families none), full motion catalogue (16 MOT ids measured), desktop motion, 50-loop heap, slow-network suite, journeys beyond the write script, CoachHelm Ask (0 of 3 prompts), calibration round, second grading pass, skeptic. Hand test (T3): skipped by Nick. Motion is capped below A+. Simulator: T2b Capacitor shell not run; on-screen keyboard not raised by script; safariTouchDrag hung; rotation not proved (Xcode 27 renamed the Simulator app); no reference captures (ref/). Staging accounts that do not exist: assistant coach (SH-26), dual-role login (SH-27), teamless pass (SH-25): fixtures only, not run in lean. Not pressed by rule: never-click list, Settings rows that save on change, poll (would go to the Team Channel), task edit (no control), Confirm squad, Post round.