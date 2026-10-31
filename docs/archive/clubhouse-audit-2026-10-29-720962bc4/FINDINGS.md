# Clubhouse audit findings, run 2026-10-29-720962bc4 (lean)

74 findings, most severe first. Evidence paths are relative to the audit run folder (screenshots and traces are not in this PR; staging data only). Gates: blocks-deploy, blocks-flip, after.

## F-0001 · S0 · blocks-deploy · P001 · correctness
**The bell tells the player an event starts at 2:00 PM when it starts at 10:00 AM Eastern**

- **Screen:** Shell / bell panel / Event updated notice
- **Role:** player
- **Where:** phone-402 · light · WebKit (T1)
- **Standard:** CO-08 Dates and times right in the user's zone
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** After W-026 moved the hand-test event to Sat 31 Oct 10:00 AM-12:00 PM ET, the event sheet read 10:00 AM-12:00 PM Eastern, but the bell's 'Event updated' line read 2:00 PM (the UTC hour). Raised from the draft's S1: a wrong time shown as right.
- **Expected:** Every time in the bell renders in the viewer's zone through the same formatter the event sheet uses (Apple Calendar notifications always show local time).
- **Repro:** Coach moves an event; Sign in as the demo player; Open the bell; compare the Event updated time with the event sheet
- **Fix:** Store the start as an ISO instant in the notification payload and format it client-side with the lib/format.ts time helper in the viewer's zone, as the event sheet does.
- **Files:** src/clubhouse/shell/Bell*.tsx; lib/format.ts; src/lib/calendar/rsvp.ts:633-649
- **Effort:** S
- **Gate note:** Notification text is built server-side by formatEventDate in the shared src/lib/calendar/rsvp.ts with toLocaleTimeString and no timeZone, so it renders in UTC for every Fairway user today, flags or not. Fix: format with the team time zone.
- **Locations:** P001 bell panel (every page)
- **Evidence:** ev/P006/write-ht-player-pro.png; p2p3-lean/lean-coach/drafts.jsonl#D-lean-coach-0205; writes.jsonl#W-026
- **Source drafts:** D-lean-coach-0205
- **Graders:** B

## F-0002 · S0 · blocks-flip · P003 · correctness
**Roster and Team Hub still call this the 2025-26 season**

- **Screen:** Roster header; Team Hub header
- **Role:** coach
- **Where:** desktop-1440 · light · Chromium (T1)
- **Standard:** CO-08 seasons turn over on 1 August [Nick]
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** 29 Oct 2026: Roster 'Demo University Golf · 2025-26', Team Hub 'Demo University Golf · 2025-2…'; Tournaments 'This season · 2026–27'; Rounds 'Since August 1'. Hyphen on Roster, en dash on Tournaments.
- **Expected:** 2026–27 everywhere after 1 August 2026, en dash.
- **Repro:** Coach: open Roster, Team Hub, Tournaments; read each header
- **Fix:** Have both headers call the 1 August season helper Tournaments and Rounds use; format with an en dash.
- **Files:** src/clubhouse/screens/roster/*; src/clubhouse/screens/team-hub/*
- **Effort:** S

- **Locations:** P003 Roster header; P010 Team Hub header
- **Evidence:** p0-calibrate/ev/preview2-coach/roster.png; p0-calibrate/ev/preview2-coach/tournaments.png; ev/P003/roster__invite-1-mba15-light.png; ev/P010/team-hub__tab-ann-compose-1-mba15-light.png
- **Source drafts:** D-lead-0001
- **Graders:** B

## F-0003 · S0 · blocks-deploy · P007 · correctness
**A player's private message to Coach is posted to the whole Team Channel**

- **Screen:** Messages / New message / To: Coach
- **Role:** player
- **Where:** phone-402 · light · WebKit (T1) + desktop-1440 Chromium (coach list)
- **Standard:** CO-01
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** New message, To: Coach only, Send: bubble in 25 ms, then the message sat in the 6-member Team Channel. Undone (W-023 to W-025).
- **Expected:** A one-to-one thread with the coach (iMessage, Slack DM).
- **Repro:** Player on phone: Messages, New message, Coach only, type, Send; Open the Team Channel
- **Fix:** The direct-conversation resolver returns the existing conversation whose members include both users (the Team Channel). Match on an exact member set and kind=direct; create one when none matches.
- **Files:** src/clubhouse/screens/messages/*; src/clubhouse/screens/messages/Messages.tsx:306-320; src/app/actions/messages.ts:749
- **Effort:** M
- **Gate note:** Precaution: the DM start goes through the shared createGolfConversation server action. This run did not prove the fault is Clubhouse-only; a private message reaching a whole real team is data harm. Downgrade to blocks-flip only once a check shows Fairway direct messages resolve correctly.
- **Locations:** P007 New message (player, phone)
- **Evidence:** ev/P007/write-p-dm-typed.png; writes.jsonl#W-013; writes.jsonl#W-024
- **Source drafts:** D-lean-coach-0196
- **Graders:** B

## F-0004 · S0 · blocks-flip · P007 · correctness
**Start conversation with one player closes the sheet and opens nothing**

- **Screen:** Messages / New message / Direct / Start conversation
- **Role:** coach
- **Where:** desktop-1440 · light · Chromium (T1)
- **Standard:** CO-02 no dead control
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Spinner over 1.8 s, two server actions, sheet closes, no thread opens or lists. Twice. ?player= deep link also falls back to the Team Channel.
- **Expected:** The new DM opens with the composer focused (Slack desktop).
- **Repro:** Coach desktop: Messages, New message, Direct, a player, Start conversation
- **Fix:** Same resolver as F-a11y-006 (likely one root cause): return and route to the new conversation id; keep the sheet open with an inline error on failure.
- **Files:** src/clubhouse/screens/messages/*
- **Effort:** M

- **Locations:** P007 New message Direct (coach, desktop); P007 ?player= deep link
- **Evidence:** ev/P007/write-dm-pick.png; writes.jsonl#W-009
- **Source drafts:** D-lean-coach-0197
- **Graders:** B

## F-0005 · S0 · blocks-flip · P005 · contrast
**Section numbers on Stats and Round review fall under 3:1 in dark**

- **Screen:** Section numeral badges (span.ch-zn__n) in dark
- **Role:** coach, player
- **Where:** phone-402 dark WebKit (T1) + desktop-1440 dark Chromium (T1)
- **Standard:** CT-01; 06 §1 S0 'text under 3:1'
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** span.ch-zn__n 14 px/700: phone dark p5 2.9:1 (Lc 55.7), desktop dark p5 3.05 (worst 2.94), 8 hits. Light passes. Graded on p5 per CT: under 3:1 is S0 by 06 §1.
- **Expected:** ≥ 4.5:1 in both themes.
- **Repro:** Dark theme: a player's stats, read the '1' beside Strokes gained
- **Fix:** In dark use the light-on-green pairing for .ch-zn__n.
- **Files:** src/clubhouse/styles/*
- **Effort:** S

- **Locations:** P005 player stats (both roles); P011 round review
- **Evidence:** ev/P004/stats__player-8091da4b-last-5-mba15-dark.png; p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0008
- **Source drafts:** D-lean-coach-0055; D-lean-player-0008
- **Graders:** B

## F-0006 · S1 · blocks-flip · P011 · motion
**The drill-in push stalls once for 70–88 ms and drops about a fifth of its frames on a mid-tier phone**

- **Screen:** Rounds -> round (drill-in push)
- **Role:** player
- **Where:** phone-402 · light · Chromium touch 4x (C2, uncalibrated) trace; WebKit C1 geometry
- **Standard:** MO-03 Frame pacing
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** 4x: 20.0–20.8 % smoothness-affecting drops, one presented gap > 50 ms per run (69.8/70.6/88.3 ms); 1x: 2.2–8.2 % dropped, max gap 30–40 ms. Spring geometry clean (RMS 0.05 % WebKit, t95 245 ms).
- **Expected:** 0 % dropped at 1x, <= 5 % worst 1 s at 4x, no presented gap over 50 ms (MO-03; UIKit push).
- **Repro:** Demo player, phone 402, Chromium 4x CPU; Rounds -> tap the first round; trace() the push
- **Fix:** lib/nav-motion.ts: take the copy layer (holdForPush/pageLayer) before the tap frame ends and defer the new page's non-visible work until the spring settles; find the long task in the 4x trace's commit frame.
- **Files:** src/clubhouse/lib/nav-motion.ts
- **Effort:** M

- **Locations:** P011 round push (graded also under P001 shell push)
- **Evidence:** p6-motion/lean-motion/rows/MOT-03.jsonl; ev/motion/MOT-03/C2-4x-r1-trace.json; ev/motion/MOT-03/C2-4x-r3-trace.json; p6-motion/lean-motion/trace-smoothness.json
- **Source drafts:** D-lean-motion-0001
- **Graders:** A

## F-0007 · S1 · blocks-flip · P006 · motion
**Switching Calendar between Day and Month animates the page height, so everything below reflows for 180 ms**

- **Screen:** Calendar / Day <-> Month view switch
- **Role:** player
- **Where:** phone-402 · light · WebKit C1 + Chromium C2
- **Standard:** MO-02 Compositor-only properties
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** div.ch-swap transition: height 0.18 s; #ch-content/main.ch-calm boxes change 11 (Chromium) / 14 (WebKit) frames in a row; one 1x run with a 140 ms presented gap.
- **Expected:** transform/opacity only; the view swaps at once (MO-02, MO-09, MOT-65).
- **Repro:** Demo player, phone; Calendar; Tap Month, then Day
- **Fix:** ui/Swap.tsx:83-96: drop the height transition for Calendar views (swap at once) or clip a fixed-height wrapper and move content with transform.
- **Files:** src/clubhouse/ui/Swap.tsx
- **Effort:** S

- **Locations:** P006 week strip / month grid; every ui/Swap block frame (others unmeasured)
- **Evidence:** p6-motion/lean-motion/rows/MOT-65.jsonl; ev/motion/MOT-65/C1-webkit-r1-geometry.json; ev/motion/MOT-65/C2-r2-trace.json; ev/motion/MOT-65/C1-day-to-month-strip.png
- **Source drafts:** D-lean-motion-0002
- **Graders:** A

## F-0008 · S1 · blocks-flip · P001 · motion
**Switching section from the strip stalls once for 50–79 ms on a mid-tier phone**

- **Screen:** Section strip / section switch
- **Role:** player
- **Where:** phone-402 · Chromium C2 4x trace
- **Standard:** MO-03 Frame pacing
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** 4x: 11.5–17.6 % smoothness-affecting drops, one presented gap > 50 ms per run; 1x 2.9–5.4 %, no gap > 50. Page swaps at once (MO-09 correct); plate settle RMS 0.09–0.49 %.
- **Expected:** <= 5 % worst 1 s at 4x, no presented gap over 50 ms (MO-03).
- **Repro:** Demo player, phone, 4x CPU; Rounds -> tap the title -> tap Messages
- **Fix:** Render the new section after the strip's close starts (startTransition) so the plate and strip keep compositor frames; find the long task in the switch frame.
- **Files:** src/clubhouse/shell/SectionStrip.tsx; src/clubhouse/lib/nav-motion.ts
- **Effort:** M

- **Locations:** P001 section strip, every section
- **Evidence:** p6-motion/lean-motion/trace-smoothness.json; ev/motion/MOT-06a/C2-4x-r3-trace.json; p6-motion/lean-motion/rows/MOT-06a.jsonl
- **Source drafts:** D-lean-motion-0009
- **Graders:** A

## F-0009 · S1 · blocks-flip · P010 · correctness
**The first click on a Team Hub row's More menu does nothing**

- **Screen:** Team Hub / Tasks and Travel / row More
- **Role:** coach
- **Where:** desktop-1440 · light · Chromium (T1)
- **Standard:** CO-02
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** 3 of 3 times, ~8 s after load and idle, the first click opened nothing 600 ms later; the second opened it (also W-018). S1 not S0: works on retry.
- **Expected:** Opens on the first click (Linear row menus).
- **Repro:** Coach desktop: Team Hub, Tasks, wait, click a row's More once
- **Fix:** Check whether the first pointerdown is consumed by an outside-click or focus handler on the Menu (opened and closed in one tick).
- **Files:** src/clubhouse/ui/Menu.tsx; src/clubhouse/screens/team-hub/*
- **Effort:** S

- **Locations:** P010 Tasks row More; P010 Travel row More
- **Evidence:** ev/P010/write-c-task-more.png; writes.jsonl#W-018
- **Source drafts:** D-lean-coach-0198
- **Graders:** B

## F-0010 · S1 · blocks-flip · P006 · correctness
**Editing only an event's place marks it 'moved', and a different event shows 'Was 9:00 AM'**

- **Screen:** Calendar week / event chips
- **Role:** coach
- **Where:** desktop-1440 · light · Chromium (T1)
- **Standard:** CO-01; CO-08
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Only AUDIT practice's location was edited (W-003); its chip read 'moved' and the never-edited hand-test chip showed 'Was 9:00 AM'. Raised from S2: players read this chip to decide when to show up.
- **Expected:** 'Moved' only when start or end changes, on that event.
- **Repro:** Coach: edit an event's location only; read every chip that day
- **Fix:** Compute 'moved' from a start/end diff; key the 'was' annotation by event id.
- **Files:** src/clubhouse/screens/calendar/*
- **Effort:** S

- **Locations:** P006 week chips
- **Evidence:** ev/P006/write-c-ev-more.png; writes.jsonl#W-003
- **Source drafts:** D-lean-coach-0201
- **Graders:** B

## F-0011 · S1 · blocks-flip · P011 · states
**Going offline mid-round hides Exit, Scorecard and three result chips until the golfer scrolls**

- **Screen:** Track / offline
- **Role:** player
- **Where:** phone-402 · light · WebKit (T1) · fixture (dev-build)
- **Standard:** ST-05
- **Confidence:** measured
- **Tier:** T1
- **Env:** fixture
- **Observed:** The 53 px banner covers Exit and Scorecard and pushes Green, Holed, Other under the bottom bar; after a 53 px scroll the banner covers holes 4-7.
- **Expected:** Every chip and exit reachable offline (CH-1901 intent).
- **Repro:** /clubhouse-preview/track at 402×874, go offline, try Exit and Green
- **Fix:** Expose the banner height as a CSS variable from OfflineBanner and subtract it in the track layout, or show a compact offline pill in the tracking header.
- **Files:** src/clubhouse/shell/OfflineBanner.tsx; src/clubhouse/screens/rounds/track/ShotEntry.tsx; src/clubhouse/styles/rounds-track.css
- **Effort:** S

- **Locations:** P011 track offline
- **Evidence:** ev/states/track-offline.png; ev/states/track-offline-hit.png; ev/states/track-offline-scrolled.png; ev/states/track-offline-hit.json
- **Source drafts:** D-lean-states-0001
- **Graders:** B

## F-0012 · S1 · blocks-flip · P011 · states
**When the live feed fails, Live says nobody is on the course**

- **Screen:** Live / failed
- **Role:** coach
- **Where:** phone-402 · light · WebKit (T1) · fixture
- **Standard:** ST-03
- **Confidence:** observed
- **Tier:** T1
- **Env:** fixture
- **Observed:** live?state=failed is pixel-identical to ?state=empty; no Try again; pill still 'Live · updated 1:03 AM'. Possibly fixture-only.
- **Expected:** InlineNotice CH-16604 with Try again (LiveView.tsx:51).
- **Repro:** /clubhouse-preview/live?state=failed vs ?state=empty
- **Fix:** Carry snapshot.error through the live hook so the notice branch renders.
- **Files:** src/clubhouse/screens/live/LiveView.tsx
- **Effort:** S

- **Locations:** P011 live failed
- **Evidence:** ev/states/live-failed.png; ev/states/live-empty.png
- **Source drafts:** D-lean-states-0002
- **Graders:** B

## F-0013 · S1 · blocks-flip · P011 · states
**If the qualifier list fails to load, setup looks as if there is no open qualifier**

- **Screen:** Round setup / qualifiers failed
- **Role:** player
- **Where:** phone-402 · fixture
- **Standard:** ST-03
- **Confidence:** observed
- **Tier:** T1
- **Env:** fixture
- **Observed:** qualifiersfailed and noqualifiers have identical main text; the Open qualifier card disappears silently. A player could start a qualifier round as Practice.
- **Expected:** Inline notice with Try again.
- **Repro:** /clubhouse-preview/setup?state=qualifiersfailed vs ?state=noqualifiers
- **Fix:** Render an InlineNotice with retry for qualifiers === null in RoundSetup.tsx.
- **Files:** src/clubhouse/screens/rounds/setup/RoundSetup.tsx
- **Effort:** S

- **Locations:** P011 setup
- **Evidence:** ev/states/setup-qualifiersfailed.png; ev/states/setup-noqualifiers.png; p4-states/lean-states/followup.json
- **Source drafts:** D-lean-states-0007
- **Graders:** B

## F-0014 · S1 · blocks-flip · P007 · speed
**The Messages list stays a skeleton for 14 s on a cold open**

- **Screen:** Messages list cold
- **Role:** coach
- **Where:** phone-402 · Chromium 4×, 1.6 Mbps
- **Standard:** SP / ST-05
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set; vercel.live loaded
- **Observed:** Content complete 14232 ms median (14297 worst), 3 runs; LCP 3.7 s lands on the title. Some may be preview-toolbar bandwidth.
- **Expected:** Threads within 2.5 s cold (iMessage shows cached threads at once).
- **Repro:** Cold, 4×, open /golf/dashboard/messages as coach
- **Fix:** Paint the conversation list from its first page before hydrating the auto-opened Team Channel thread.
- **Files:** src/clubhouse/screens/messages/Messages.tsx
- **Effort:** M

- **Locations:** P007 list cold
- **Evidence:** p7-perf/lean-speed/summary.json; p7-perf/lean-speed/DONE.md

- **Graders:** B

## F-0015 · S1 · blocks-flip · P005 · contrast
**The count on the profile's Rounds tab reads at 4.2:1 in dark**

- **Screen:** Profile Rounds tab count (desktop dark)
- **Role:** coach, player
- **Where:** desktop-1440 · dark
- **Standard:** CT-07 [Nick]
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** span.ch-tab-t__n 12 px/600 4.17:1, Lc 50.1, coach player page and My stats.
- **Expected:** Lc 75 at rest and hover.
- **Repro:** Desktop dark: a player's stats; read 'Rounds 10'
- **Fix:** Use the tab label ink for the count numeral in dark.
- **Files:** src/clubhouse/styles/controls.css
- **Effort:** S

- **Locations:** P005
- **Evidence:** ev/P004/stats__player-8091da4b-tab-rounds-mba15-dark.png
- **Source drafts:** D-lean-coach-0057; D-lean-player-0029
- **Graders:** B

## F-0016 · S1 · blocks-flip · P016 · a11y
**Tournaments compare has an axe critical: a role with the wrong children**

- **Screen:** Tournaments compare
- **Role:** coach
- **Where:** desktop-1440 light + dark
- **Standard:** AX-01 zero critical
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** aria-required-children (critical) on .ch-tour-cmp-body.
- **Expected:** Zero critical.
- **Repro:** axe on /tournaments/compare
- **Fix:** Drop the role on .ch-tour-cmp-body or give children the required roles.
- **Files:** src/clubhouse/screens/tournaments/*
- **Effort:** S

- **Locations:** P016 compare
- **Evidence:** ev/P016/tournaments-compare-mba15-light.png
- **Source drafts:** D-lean-coach-0146
- **Graders:** B

## F-0017 · S2 · after · P002 · motion
**Tapping a second segment while the pill is still gliding makes it jump instead of turning**

- **Screen:** Home / Last 5·10·20 segmented; every useSlidePlate
- **Role:** player
- **Where:** phone-402 · light · WebKit C1 + Chromium C2
- **Standard:** MO-08 Interruptible
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Retarget at 80 ms: one-frame steps 45–54 px (Chromium), 55–62 px (WebKit); reverse at 40 % first sample 9.7–12.7 px off trend (spec <= 2 px). Uninterrupted glide RMS 0.06–0.37 %, t95 204–211 ms.
- **Expected:** Retarget from the live position and velocity (02 §3a (a)(c)).
- **Repro:** Demo player, phone; Home -> Last 5/10/20; Tap Last 10, Last 20, Last 5 about 80 ms apart
- **Fix:** lib/slide-plate.ts: when a glide runs, read the plate's live box and velocity and start the new spring from there (chSpringCurve with velocity).
- **Files:** src/clubhouse/lib/slide-plate.ts; src/clubhouse/ui/Segmented.tsx
- **Effort:** S

- **Locations:** P002 Home window segmented; P006 Day/Month/List; P001 section strip plate (MOT-06a); P004/P005 window segmented (same component, unmeasured)
- **Evidence:** p6-motion/lean-motion/rows/MOT-42.jsonl; ev/motion/MOT-42/C1-webkit-retarget-r1.json; ev/motion/MOT-42/C2-chromium-retarget-r1.json
- **Source drafts:** D-lean-motion-0003
- **Graders:** A

## F-0018 · S2 · blocks-flip · P001 · motion
**With Reduce Motion on, sheets can no longer be dragged down and pushed pages can no longer be swiped back**

- **Screen:** Every Modal/FormSheet sheet; pushed pages (edge back)
- **Role:** player
- **Where:** phone-402 · Chromium touch lane, prefers-reduced-motion: reduce (C5)
- **Standard:** MO-10 Gestures still track under Reduce Motion
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** C5: sheet drag 120 px hold and 60 px at 0.6 px/ms moved 0 px; edge swipe 40 % hold moved 0 px. Pull to refresh still tracks.
- **Expected:** Reduce Motion changes how things settle, not whether the finger moves them (MO-10, Nick H19).
- **Repro:** Reduce Motion on; Calendar -> tap an event -> drag the sheet down; Rounds -> a round -> swipe from the left edge
- **Fix:** Keep useSheetDrag enabled under reduced motion (ui/Modal.tsx:56, ui/FormSheet.tsx:45, shell/AccountSheet.tsx:77, shell/AskSheetBody.tsx:55, coachhelm/chat/History.tsx:142) and make only the settle a 180 ms fade; let use-route-swipe track and replace the parallax with a fade.
- **Files:** src/clubhouse/ui/Modal.tsx; src/clubhouse/ui/FormSheet.tsx; src/clubhouse/shell/use-route-swipe.ts; src/clubhouse/shell/use-edge-swipe.ts
- **Effort:** M

- **Locations:** P001 pushed pages; P006 event sheet; every Modal/FormSheet (P003 invite, P007 compose, P010 compose, P013 Ask)
- **Evidence:** p6-motion/lean-motion/rows/MOT-22.jsonl; p6-motion/lean-motion/rows/MOT-05.jsonl; ev/motion/MOT-22/C5-drag-down-0.3-120-hold.json; ev/motion/MOT-05/C5-drag-0.3-0.4-hold.json
- **Source drafts:** D-lean-motion-0006
- **Graders:** A

## F-0019 · S2 · blocks-flip · P011 · motion
**Picking a shot result makes the shot card jump up 150 px in one frame**

- **Screen:** Track (shot screen) / result chip
- **Role:** player
- **Where:** phone-402 · fixture track · WebKit C1 + Chromium
- **Standard:** MO-13 / MOT-90 No layout shift of the card
- **Confidence:** measured
- **Tier:** T1
- **Env:** fixture (local dev, dev-build: shape only)
- **Observed:** .ch-rt-card top 552 -> 426 -> 401 px in two frames (height 242 -> 393); no animation on the card.
- **Expected:** Chip fills on quick 180; the card holds still (MOT-90).
- **Repro:** /clubhouse-preview/track (local dev); Tap Driver, then Fairway
- **Fix:** screens/rounds/track/ShotEntry.tsx: reserve the distance block's height from the start (visibility hidden) so the card's top stays put; presentation only.
- **Files:** src/clubhouse/screens/rounds/track/ShotEntry.tsx; src/clubhouse/styles/rounds-track.css
- **Effort:** S

- **Locations:** P011 Track result chips
- **Evidence:** p6-motion/lean-motion/rows/MOT-90.jsonl; ev/motion/MOT-90/C1-webkit-r1.json; ev/motion/MOT-90/C1-chromium-r1.json
- **Source drafts:** D-lean-motion-0007
- **Graders:** A

## F-0020 · S2 · blocks-flip · P011 · motion
**Recording a shot snaps the card 258 px with no transition, so the golfer can't see the shot land in the log**

- **Screen:** Track (shot screen) / Next shot
- **Role:** player
- **Where:** phone-402 · fixture track · WebKit C1 + Chromium
- **Standard:** MO-13 / MOT-91
- **Confidence:** measured
- **Tier:** T1
- **Env:** fixture (local dev, dev-build: shape only)
- **Observed:** Card moves 257.5–258.9 px, settles in 54–67 ms, 0 animations/transitions; one impact MEDIUM haptic (correct).
- **Expected:** Shot log entry eases in on base 260 ease-out; the card resets with no jump (MOT-91).
- **Repro:** /clubhouse-preview/track (local dev); Driver -> Fairway -> 140 -> Next shot
- **Fix:** Animate the new log row in (translateY 8 px + opacity, base 260 ease-out) and keep the card's top anchored so the reset is a content swap.
- **Files:** src/clubhouse/screens/rounds/track/ShotEntry.tsx
- **Effort:** S

- **Locations:** P011 Track Next shot
- **Evidence:** p6-motion/lean-motion/rows/MOT-91.jsonl; ev/motion/MOT-91/C1-webkit-r1.json; ev/motion/MOT-91/C1-chromium-r1.json
- **Source drafts:** D-lean-motion-0008
- **Graders:** A

## F-0021 · S2 · after · P001 · touch
**Phone fields, selects and secondary buttons have hit areas of 20–43 pt instead of 44**

- **Screen:** many (phone)
- **Role:** coach + player
- **Where:** phone-402 · light + dark · WebKit (T1); corroborated in T2a Simulator Safari for Messages and Rounds
- **Standard:** TO-01 hit area >= 44x44 (phone)
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** select 153x34 (P004); event title input 354x32, All day input 16x16, lane band 38x26 (P006 new event / week); search inputs 328x20 (P007, P009), 139x20 (P011); course pin input 160x24 (P008 team); button.ch-hl-since__b 196x32, Ask textarea 206x37, button.ch-hs-ld__why 370x36, a.ch-th-mention 83x20 (P013); a.ch-tour-home-feat__t 261x43, tab 37x44, selects 345x38 / 370x38 (P016).
- **Expected:** 44x44 pt incl. ::before/::after extenders (TO-01, Apple HIG).
- **Repro:** Open the listed screens on a 402 px phone; __chAudit.scan().smallTargets
- **Fix:** Make the visible field the target: put the input's padding on the input itself (min-height: 44px) or make the pill a <label> wrapping it; raise .ch-ed__title, selects and .ch-hl-since__b to min-height 44px; give tab and chip buttons an ::after inset to 44.
- **Files:** src/clubhouse/styles/controls.css
- **Effort:** M

- **Locations:** P004 window select; P006 new event title, All day, week lane band; P007 search; P008 settings team course pin; P009 search; P011 rounds search; P013 since button, Ask composer, why buttons, mentions; P016 home feature link, desktop tab, form selects
- **Evidence:** ev/P006/calendar__new-1-pro-light.png; ev/t2/player-messages-light.png; ev/P016/tournaments-new-pro-light.png; p8-sim/rows.jsonl; p2p3-lean/lean-coach/drafts.jsonl; p2p3-lean/lean-player/drafts.jsonl
- **Source drafts:** D-lean-coach-0036; D-lean-coach-0001; D-lean-coach-0002; D-lean-coach-0003; D-lean-coach-0070; D-lean-coach-0078; D-lean-coach-0117; D-lean-coach-0122; D-lean-coach-0123; D-lean-coach-0136; D-lean-coach-0137; D-lean-coach-0140; D-lean-coach-0141; D-lean-coach-0142; D-lean-player-0016
- **Graders:** A

## F-0022 · S2 · after · P001 · touch
**Desktop links, chips, inputs and drag handles under 24 px**

- **Screen:** many (desktop)
- **Role:** coach + player
- **Where:** desktop-1440 · light + dark · Chromium (T1)
- **Standard:** TO-01 hit area >= 24x24 (desktop)
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** a.ch-h-legs__who 45x16, a.ch-h-lb__go 163x20, Waiting-on-you buttons 19 tall (P002); search input 278x15 (P003); a.ch-lg__a 85x19, a.ch-tr__link 86x19 (P004/P005); month chips 90x16, ribbon 313x20, All day 16x16 (P006); search 265x15 (P007); coachhelm settings inputs 760x22 x7 (P008); search 318x15 (P009); .ch-hw-more 18 tall x4 (P010); round links 19 tall, search 218x15 (P011); mention 83x20, role link 72x16 (P013); compare thumb 22x22, divider 22x418 (P016).
- **Expected:** 24x24 CSS px or the 2.5.8 spacing exception (TO-01).
- **Repro:** Open the listed screens at 1440x932; __chAudit.scan().smallTargets
- **Fix:** min-height: 24px (28 for chips) on .ch-mo__ev/.ch-mo__ribbon, .ch-hw-more, .ch-tr__link; put the search field's padding on the input; widen .ch-tour-cmp-tl__thumb and the divider's hit area with an ::after to 24.
- **Files:** src/clubhouse/styles/calendar.css; src/clubhouse/styles/hub.css
- **Effort:** M

- **Locations:** P002; P003; P004; P005; P006; P007; P008; P009; P010; P011; P013; P016
- **Evidence:** ev/P002/home-mba15-light.png; ev/calendar/calendar~event=0e27cb7b-b5fa-4bdc-9f39-2c37ec31ddf9-mba15-light.png; p2p3-lean/lean-coach/drafts.jsonl; p2p3-lean/lean-player/drafts.jsonl
- **Source drafts:** D-lean-coach-0007; D-lean-coach-0008; D-lean-coach-0016; D-lean-coach-0046; D-lean-coach-0056; D-lean-coach-0066; D-lean-coach-0068; D-lean-coach-0069; D-lean-coach-0080; D-lean-coach-0081; D-lean-coach-0082; D-lean-coach-0083; D-lean-coach-0084; D-lean-coach-0085; D-lean-coach-0086; D-lean-coach-0099; D-lean-coach-0100; D-lean-coach-0101; D-lean-coach-0126; D-lean-coach-0128; D-lean-coach-0147; D-lean-coach-0148; D-lean-player-0017; D-lean-coach-0004
- **Graders:** A

## F-0023 · S2 · blocks-flip · P006 · touch
**Going shows as chosen about a second after the tap**

- **Screen:** Calendar / event sheet / RSVP
- **Role:** player
- **Where:** phone-402 · light · WebKit (T1)
- **Standard:** TO-02 feedback; SP write -> optimistic visible
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Going radio aria-checked 1037 ms after the tap; the toast followed; no optimistic selection.
- **Expected:** Selection visible within 100 ms (optimistic), rolled back on failure (TO-02, SP write row).
- **Repro:** Demo player, phone; Calendar -> AUDIT event -> tap Going
- **Fix:** Set the RSVP choice optimistically on press and roll back with the existing 'Couldn't send your reply' toast on failure.

- **Effort:** S

- **Locations:** P006 event sheet RSVP
- **Evidence:** p2p3-lean/lean-coach/drafts-manual.jsonl; writes.jsonl#W-012
- **Source drafts:** D-lean-coach-0199
- **Graders:** A; B

## F-0024 · S2 · after · P016 · craft
**Compare tags and a Team Hub caption are 11 px on the phone**

- **Screen:** Tournaments compare tags; Team Hub em
- **Role:** coach
- **Where:** phone-402 · light + dark · WebKit (T1)
- **Standard:** CR-03 phone text never under 12 px
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** span.ch-tour-cmp-tag / .is-b 11 px (P016 compare); em 11 px (P010 Team Hub).
- **Expected:** >= 12 px (CR-03).
- **Repro:** Open the screens at 402; __chAudit.scan().tinyText
- **Fix:** Move .ch-tour-cmp-tag and the Team Hub em to the 12 px step.
- **Files:** src/clubhouse/styles/hub.css
- **Effort:** S

- **Locations:** P010 Team Hub; P016 compare
- **Evidence:** ev/P016/tournaments-compare-pro-light.png; ev/P010/team-hub-pro-light.png; p2p3-lean/lean-coach/drafts.jsonl
- **Source drafts:** D-lean-coach-0097; D-lean-coach-0138; D-lean-coach-0139
- **Graders:** A

## F-0025 · S2 · after · P001 · correctness
**A mistyped address says the page 'hasn't been rebuilt yet' instead of 'We couldn't find that'**

- **Screen:** Shell / unknown address
- **Role:** coach, player
- **Where:** phone-402 WebKit (T1) + desktop-1440 Chromium (T1) · light
- **Standard:** CO-04
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** /golf/dashboard/audit-unknown-path-p1 (coach) and /golf/dashboard/zz-audit-unknown-path (player) render NotRebuilt.
- **Expected:** NotFound for any path not in the route list (04 §A).
- **Repro:** Sign in; Open /golf/dashboard/zz-anything
- **Fix:** In src/clubhouse/routes/alias.ts fall through to NotFound when the segment matches neither a Clubhouse route nor a known legacy route.
- **Files:** src/clubhouse/routes/alias.ts; src/clubhouse/shell/NotRebuilt.tsx
- **Effort:** S

- **Locations:** P001 unknown path (both roles)
- **Evidence:** ev/p1/coach/audit-unknown-path-p1-pro.png; ev/p1/player/zz-audit-unknown-path-pro.png
- **Source drafts:** D-p1-coach-0001; D-p1-player-0007
- **Graders:** B

## F-0026 · S2 · blocks-flip · P002 · correctness
**A quick double tap pushes the same page two or three times, so Back has to be pressed again**

- **Screen:** Home links; Stats segments; player stats Message
- **Role:** coach
- **Where:** phone-402 · light · WebKit (T1)
- **Standard:** CO-02 no duplicate action on double-tap
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Single press 1 navigation; fast double: Home 'Message' and 'Plan' 3, Stats 'Season', 'Qualifiers', 'Message Tyler' 2; 'Weekly Practice' duplicate layers. No duplicate writes; one Home read action fired twice.
- **Expected:** One navigation per intent (UIKit ignores taps during a push).
- **Repro:** Coach phone: Home, double-tap 'Message team', press Back
- **Fix:** Ignore a push to the same href while one is pending; use replace for window segment changes.
- **Files:** src/clubhouse/shell/*; src/clubhouse/ui/press.ts
- **Effort:** S

- **Locations:** P002 Home; P004 Stats team; P005 player stats
- **Evidence:** p2p3-lean/lean-coach/press/P002.jsonl; p2p3-lean/lean-coach/press/P004.jsonl
- **Source drafts:** D-lean-coach-0154; D-lean-coach-0155; D-lean-coach-0156; D-lean-coach-0157; D-lean-coach-0158; D-lean-coach-0159
- **Graders:** B

## F-0027 · S2 · after · P006 · states
**An RSVP made offline is refused rather than queued**

- **Screen:** Calendar / RSVP offline
- **Role:** player
- **Where:** phone-402 · light · WebKit (T1)
- **Standard:** ST-05
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Toast 'Couldn't send your reply… you're offline. Reconnect, then try again'; not sent on reconnect; no duplicate.
- **Expected:** Queue, show pending, send on reconnect.
- **Repro:** Player offline: tap Going
- **Fix:** Route RSVP through the offline write queue; show a pending tick.
- **Files:** src/clubhouse/screens/calendar/*; src/clubhouse/shell/OfflineBanner.tsx
- **Effort:** M

- **Locations:** P006 RSVP offline
- **Evidence:** ev/P006/write-p-rsvp-offline.png; writes.jsonl#W-012
- **Source drafts:** D-lean-coach-0200
- **Graders:** B

## F-0028 · S2 · after · P006 · states
**The event inspector squeezes a long title and place into a one-word-wide column**

- **Screen:** Calendar / event inspector (desktop)
- **Role:** coach
- **Where:** desktop-1440 · light · Chromium (T1)
- **Standard:** ST-06
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** 'Now at …' and Place wrapped at 4-6 characters a line beside 'Message players'.
- **Expected:** Value column takes remaining width; long tokens break with overflow-wrap.
- **Repro:** Desktop: select an event with a long title
- **Fix:** min-width: 0 and flex: 1 on the value cell; move 'Message players' below when narrow.
- **Files:** src/clubhouse/styles/calendar.css
- **Effort:** S

- **Locations:** P006 inspector
- **Evidence:** ev/P006/write-c-ev-more.png
- **Source drafts:** D-lean-coach-0202
- **Graders:** B

## F-0029 · S2 · after · P006 · speed
**Publishing an event takes 2.4 s, and the first of a session 5 to 14 s**

- **Screen:** Calendar / Publish
- **Role:** coach
- **Where:** desktop-1440 · light · Chromium (T1)
- **Standard:** SP write -> confirmed > 500 ms (D/F); 01 §3 cap
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** W-001: 'Still saving…', listed between 5.2 and 13.7 s. W-002: 2368 ms to the Published toast. The button does show Publishing… at once.
- **Expected:** Optimistic placement within 150 ms.
- **Repro:** Fresh coach session: Calendar, New event, Publish
- **Fix:** Place the event optimistically and close the sheet; move the cold-path work (likely notification fan-out) after the response.
- **Files:** src/clubhouse/screens/calendar/*
- **Effort:** M

- **Locations:** P006 publish
- **Evidence:** ev/P006/write-ev-after.png; writes.jsonl#W-001; writes.jsonl#W-002
- **Source drafts:** D-lean-coach-0204
- **Graders:** B

## F-0030 · S2 · after · P011 · states
**Team rounds empty states give the coach nothing to do**

- **Screen:** Team rounds / empty
- **Role:** coach
- **Where:** phone-402 · fixture
- **Standard:** ST-02
- **Confidence:** observed
- **Tier:** T1
- **Env:** fixture
- **Observed:** No-roster and no-rounds states have zero controls; Home's empty offers Invite players.
- **Expected:** Invite players / a roster link.
- **Repro:** /clubhouse-preview/team-rounds?state=noroster
- **Fix:** Add the EmptyState action in src/clubhouse/screens/rounds/TeamRounds.tsx.
- **Files:** src/clubhouse/screens/rounds/TeamRounds.tsx
- **Effort:** S

- **Locations:** P011 team rounds
- **Evidence:** ev/states/team-rounds-noroster.png; ev/states/team-rounds-empty.png
- **Source drafts:** D-lean-states-0003
- **Graders:** B

## F-0031 · S2 · after · P011 · contrast
**Ghost hole numbers on the idle Rounds card and the empty setup scorecard are exposed as text at 1.9-2.8:1**

- **Screen:** Rounds idle card hole grid; round setup scorecard placeholder
- **Role:** player
- **Where:** phone-402 WebKit + desktop-1440 Chromium · light + dark (T1)
- **Standard:** CT-03 / AX-02 decorative text hidden
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging) + fixture
- **Observed:** Idle card 1-18 at p5 1.89-1.92 (72 hits); setup scorecard placeholder 1-9 (b 12 px/600) at 2.81 (18 hits). Both are decorative placeholders in the screenshots (ev/rounds/rounds-pro-light.png, ev/rounds/rounds_new-mba15-light.png), so S2 as decoration, not an AA failure.
- **Expected:** aria-hidden and not counted as text, or ≥ 4.5:1.
- **Repro:** Player with no round: Rounds; then New round
- **Fix:** aria-hidden on both placeholder grids (rounds.css idle card, setup scorecard empty state).
- **Files:** src/clubhouse/styles/rounds.css; src/clubhouse/screens/rounds/setup/*
- **Effort:** S

- **Locations:** P011 rounds idle (phone); P011 setup scorecard placeholder (desktop)
- **Evidence:** ev/rounds/rounds-pro-light.png; ev/rounds/rounds_new-mba15-light.png; ev/states/rounds-idle.png
- **Source drafts:** D-lean-states-0004; D-lean-player-0007; D-lean-player-0006
- **Graders:** B

## F-0032 · S2 · after · P002 · speed
**Coach Home takes 5.7 s to paint its main content on a cold open**

- **Screen:** Coach Home cold
- **Role:** coach
- **Where:** phone-402 · Chromium 4×
- **Standard:** SP LCP cold
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set; vercel.live loaded
- **Observed:** LCP median 5748 ms (worst 5860), TBT 373; player Home 2368 ms.
- **Expected:** ≤ 2.5 s.
- **Repro:** Cold, 4×, open /golf/dashboard as coach
- **Fix:** Stream the slow coach-only Home section behind a SectionBoundary.

- **Effort:** M

- **Locations:** P002 coach Home
- **Evidence:** p7-perf/lean-speed/summary.json
- **Source drafts:** D-lean-speed-0001
- **Graders:** B

## F-0033 · S2 · after · P010 · speed
**Team Hub takes 6.4 s to paint on a cold open**

- **Screen:** Team Hub cold
- **Role:** coach
- **Where:** phone-402 · Chromium 4×
- **Standard:** SP LCP cold
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** LCP median 6432 ms; one warm run held a skeleton 3.2 s.
- **Expected:** ≤ 2.5 s.
- **Repro:** Cold, 4×, open Team Hub as coach
- **Fix:** Stream the announcement list; defer read-receipt aggregates.

- **Effort:** M

- **Locations:** P010 Team Hub
- **Evidence:** p7-perf/lean-speed/summary.json
- **Source drafts:** D-lean-speed-0002
- **Graders:** B

## F-0034 · S2 · after · P005 · speed
**Opening a player's stats from Home takes 2.3 s even when warm**

- **Screen:** Home -> player stats (warm)
- **Role:** coach
- **Where:** phone-402 · Chromium 4×
- **Standard:** SP warm content; R5 1350 ms
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Shell 135 ms, skeleton ~2 s, content 2317 ms median; My stats warm 239 ms.
- **Expected:** ≤ 700 ms.
- **Repro:** Coach Home, tap a player
- **Fix:** Prefetch the player read from Home rows or render the hero from row data.

- **Effort:** M

- **Locations:** P005 coach player page
- **Evidence:** p7-perf/lean-speed/summary.json
- **Source drafts:** D-lean-speed-0003
- **Graders:** B

## F-0035 · S2 · blocks-flip · P002 · contrast
**The eyebrow and date ink sits just under 4.5:1 on desktop**

- **Screen:** Eyebrows, dates and keys on the desktop paper surface
- **Role:** coach, player
- **Where:** desktop-1440 light (+ dark em); phone-402 dark em on the course page
- **Standard:** CT-03 (WCAG AA 1.4.3)
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Home date 4.33-4.43:1; Stats eyebrow 4.38; Rounds keys and review eyebrow 4.38-4.47; course em 4.24 dark / 4.36 light; Classes key 4.38; Tournaments keys 4.37-4.39. One token on one surface.
- **Expected:** ≥ 4.5:1 and Lc 60.
- **Repro:** Desktop light Home: sample the date
- **Fix:** Darken the eyebrow/meta ink token on the desktop paper background one step (aim ≥ 5:1).
- **Files:** src/clubhouse/styles/tokens.css
- **Effort:** S

- **Locations:** P002; P004; P011 (desktop + phone dark); P012; P016
- **Evidence:** ev/P002/home-mba15-light.png; ev/P011/rounds-98daf97c-mba15-light.png; p2p3-lean/lean-coach/rows/P002.jsonl
- **Source drafts:** D-lean-coach-0005; D-lean-coach-0043; D-lean-coach-0112; D-lean-coach-0113; D-lean-coach-0115; D-lean-coach-0116; D-lean-coach-0143; D-lean-coach-0144; D-lean-player-0020; D-lean-player-0023; D-lean-player-0026; D-lean-player-0027; D-lean-player-0028; D-lean-player-0030
- **Graders:** B

## F-0036 · S2 · after · P002 · contrast
**The 'N' shortcut hint on New event reads at 3.5:1 in dark**

- **Screen:** New event shortcut hint
- **Role:** coach
- **Where:** desktop-1440 · dark 3.49 (Home), light 3.99 (Calendar)
- **Standard:** CT-03
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** kbd.ch-btn__kbd 11 px 3.49:1 dark; 3.99:1 on Calendar.
- **Expected:** ≥ 4.5:1.
- **Repro:** Desktop dark Home: read the N
- **Fix:** Raise the kbd glyph colour on primary buttons.
- **Files:** src/clubhouse/styles/controls.css
- **Effort:** S

- **Locations:** P002; P006
- **Evidence:** ev/P002/home-mba15-dark.png; p2p3-lean/lean-coach/rows/P006.jsonl
- **Source drafts:** D-lean-coach-0009
- **Graders:** B

## F-0037 · S2 · after · P004 · contrast
**Chart callouts ('Best', '−5.4') on team stats read at 2.6-3.4:1**

- **Screen:** Team stats chart callouts
- **Role:** coach
- **Where:** desktop-1440 light + dark
- **Standard:** CT-01 / CR-15
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** 15 px/700 p5 3.43 (worst 2.6); 15 px/600 p5 4.48 (worst 2.94); same both themes.
- **Expected:** ≥ 4.5:1.
- **Repro:** Desktop Stats team: read the callouts
- **Fix:** Callout plate or halo in the chart surface colour, or full-strength ink.
- **Files:** src/clubhouse/screens/stats/*
- **Effort:** S

- **Locations:** P004 chart
- **Evidence:** ev/P004/stats-mba15-light.png; ev/P004/stats-mba15-dark.png
- **Source drafts:** D-lean-coach-0044; D-lean-coach-0045; D-lean-coach-0049; D-lean-coach-0050
- **Graders:** B

## F-0038 · S2 · after · P002 · contrast
**The struck-through 'was 10:00 AM' on a moved practice reads at 3.4:1**

- **Screen:** Player Home 'was' time (desktop)
- **Role:** player
- **Where:** desktop-1440 · light
- **Standard:** CT-03
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** s.ch-was 13 px 3.4:1 (Lc 53); dark Lc 36.3.
- **Expected:** ≥ 4.5:1: the old time is information.
- **Repro:** Player Home desktop with a moved event
- **Fix:** Meta ink for .ch-was, keep the strike.

- **Effort:** S

- **Locations:** P002
- **Evidence:** p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0022
- **Source drafts:** D-lean-player-0022
- **Graders:** B

## F-0039 · S2 · after · P006 · contrast
**Inspector meta on the desktop calendar reads at 3.7-4.0:1 in dark**

- **Screen:** Calendar inspector dark
- **Role:** player
- **Where:** desktop-1440 · dark
- **Standard:** CT-03
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** ch-in__nb 3.73:1, ch-in__at 4.03:1.
- **Expected:** ≥ 4.5:1.
- **Repro:** Desktop dark Calendar, a past day
- **Fix:** Dark meta token for the inspector.
- **Files:** src/clubhouse/styles/calendar.css
- **Effort:** S

- **Locations:** P006
- **Evidence:** p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0018
- **Source drafts:** D-lean-player-0018; D-lean-player-0019
- **Graders:** B

## F-0040 · S2 · blocks-flip · P009 · contrast
**Counts and meta on the Qualifiers list read at 3.7-3.8:1 in dark**

- **Screen:** Qualifiers list dark
- **Role:** coach, player
- **Where:** phone-402 dark + desktop-1440 dark
- **Standard:** CT-03
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** 13 px/600 at 3.71-3.78:1, qualifiers and my-qualifiers.
- **Expected:** ≥ 4.5:1.
- **Repro:** Dark: Qualifiers
- **Fix:** Dark meta token for filter counts and card meta.

- **Effort:** S

- **Locations:** P009
- **Evidence:** ev/P009/qualifiers-pro-dark.png; p2p3-lean/lean-coach/rows/P009.jsonl
- **Source drafts:** D-lean-coach-0087; D-lean-player-0024; D-lean-player-0025
- **Graders:** B

## F-0041 · S2 · blocks-flip · P001 · contrast
**Body text passes WCAG but misses the Lc 75 floor in 59 dark and 27 light styles**

- **Screen:** All families: body APCA
- **Role:** coach, player
- **Where:** phone + desktop · dark (59 styles), light (27)
- **Standard:** CT-01 floor Lc 75
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Dark: b Lc 62.1 (57×), topbar search Lc 66.5, crumb Lc 67.8, b.ch-num Lc 60.5. Light: span Lc 71.1, dd.ch-num.ch-loss Lc 69.1, button Lc 67.6.
- **Expected:** Lc 75 body both themes.
- **Repro:** measureContrast any family, dark
- **Fix:** Lift secondary body ink in dark one step and the shell crumb/search ink in both.
- **Files:** src/clubhouse/styles/tokens.css
- **Effort:** M

- **Locations:** every family
- **Evidence:** p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0031; p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0032
- **Source drafts:** D-lean-player-0031; D-lean-player-0032
- **Graders:** B

## F-0042 · S2 · after · P013 · a11y
**CoachHelm evidence panels scroll but can't be reached by keyboard**

- **Screen:** CoachHelm Ask thread
- **Role:** coach
- **Where:** phone-402 light + dark WebKit (T1)
- **Standard:** AX-01
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** axe scrollable-region-focusable (serious), 4 nodes (.ch-th-evidence).
- **Expected:** Zero serious.
- **Repro:** axe on an Ask thread
- **Fix:** tabindex=0 and aria-label on .ch-th-evidence.
- **Files:** src/clubhouse/screens/coachhelm/*
- **Effort:** S

- **Locations:** P013
- **Evidence:** ev/P013/coachhelm__view-ask-c-c1a1055f-pro-light.png
- **Source drafts:** D-lean-coach-0121
- **Graders:** B

## F-0043 · S2 · blocks-flip · P010 · contrast
**Team Hub and profile tab labels miss Nick's Lc 75 gate in dark**

- **Screen:** Desktop tabs and profile tabs in dark
- **Role:** player
- **Where:** desktop-1440 dark Chromium (T1) + phone-402 dark
- **Standard:** CT-07 profile hero and desktop tabs: Lc 75, no exceptions [Nick]
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Overlay-free rows: Team Hub 'Announcements' Lc 64.3 (WCAG 9.16) on mba15 dark (team-hub.jsonl line 20) and pro dark (line 4); Stats 'Overview' Lc 64.3-67.7, 'Game detail' Lc 64.3, 'Development' Lc 67.8 (stats.jsonl lines 66, 119). Light tab labels not flagged.
- **Expected:** Lc 75 at rest and hover in both themes; Lc 90 light for A.
- **Repro:** Desktop dark: Team Hub, then a player's stats; measure the tab labels
- **Fix:** Raise the unselected tab label ink in dark to the primary text step.
- **Files:** src/clubhouse/styles/controls.css
- **Effort:** S

- **Locations:** P010 Team Hub tabs; P005 profile tabs
- **Evidence:** p2p3-lean/lean-player/rows/team-hub.jsonl; p2p3-lean/lean-player/rows/stats.jsonl

- **Graders:** B

## F-0044 · S2 · blocks-flip · P001 · a11y
**Many desktop controls show no focus ring when tabbed to**

- **Screen:** Desktop Tab pass: top bar and in-page controls
- **Role:** coach
- **Where:** desktop-1440 · light · Chromium (T1)
- **Standard:** AX-07 / TO-08 focus visible at 3:1
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Coach Tab pass: sidebar links ringW 2, but Ask CoachHelm, Notifications, Settings, Previous/Next round, Open recap, Team stats, Full roster and player links ringW 0 with transparent ring colour (press/P002.jsonl line 25). lean-player's rows also contain stops with outline none and a transparent shadow (rows/calendar.jsonl line 94), so its 'every stop had a ring' does not clear these. A background-change focus style is possible; needs a focus screenshot.
- **Expected:** A visible ring ≥ 3:1 on every stop (Linear, Things for Mac).
- **Repro:** Coach desktop Home: Tab to the bell
- **Fix:** Apply the shared :focus-visible ring (the one sidebar links use) to .ch-btn--icon, top-bar actions and in-card links.
- **Files:** src/clubhouse/styles/controls.css; src/clubhouse/styles/shell.css
- **Effort:** S

- **Locations:** P001 top bar; P002; P004; P005; P006; P007; P011
- **Evidence:** p2p3-lean/lean-coach/press/P002.jsonl; p2p3-lean/lean-coach/press/P004.jsonl; p2p3-lean/lean-coach/press/P006.jsonl; p2p3-lean/lean-coach/press/P007.jsonl; p2p3-lean/lean-coach/press/P011.jsonl
- **Source drafts:** D-lean-coach-0160; D-lean-coach-0161; D-lean-coach-0162; D-lean-coach-0163; D-lean-coach-0164; D-lean-coach-0165; D-lean-coach-0166; D-lean-coach-0167; D-lean-coach-0168; D-lean-coach-0169; D-lean-coach-0170; D-lean-coach-0171; D-lean-coach-0172; D-lean-coach-0174; D-lean-coach-0175; D-lean-coach-0177; D-lean-coach-0178; D-lean-coach-0181; D-lean-coach-0182; D-lean-coach-0185; D-lean-coach-0186; D-lean-coach-0190; D-lean-coach-0191; D-lean-coach-0192; D-lean-coach-0193; D-lean-coach-0194
- **Graders:** B

## F-0045 · S2 · after · P011 · speed
**Discarding a round takes 3 s, assigning a task 1.8 s, starting a DM 1.8 s**

- **Screen:** Writes that take over 500 ms
- **Role:** coach, player
- **Where:** phone-402 WebKit (player) + desktop-1440 Chromium (coach)
- **Standard:** SP write -> confirmed > 500 ms D/F; 01 §3 cap: any interaction over 500 ms
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** W-015 Discard round: 3070 ms from confirm to Rounds, no toast (player phone). W-006 Assign task: 1820 ms to toast (coach desktop). W-004 announcement ≤ 2.2 s (coach desktop). W-009 Start conversation: spinner > 1.8 s (coach desktop). Optimistic writes elsewhere are 6-43 ms (W-005, W-010, W-013, W-023).
- **Expected:** Visible result ≤ 150 ms (optimistic), like the edit and ack paths already do.
- **Repro:** Player: start a practice round, Exit, Discard round, confirm; Coach desktop: Team Hub, assign a task
- **Fix:** Make discard, task assign and announcement post optimistic (navigate or insert first, reconcile after), as announcement edit already is.

- **Effort:** M

- **Locations:** P011 discard (phone); P010 task, announcement (desktop); P007 Start conversation (desktop)
- **Evidence:** writes.jsonl#W-015; writes.jsonl#W-006; writes.jsonl#W-004; writes.jsonl#W-009

- **Graders:** B

## F-0046 · S3 · after · P001 · motion
**On a section switch the strip row jumps sideways and the plate flies in from off-screen while the strip closes**

- **Screen:** Section strip / section switch
- **Role:** player
- **Where:** phone-402 · WebKit C1 + Chromium C2
- **Standard:** MO-13 Motion explains
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Plate x 150 -> −240 in the first frame (row recentres instantly), then glides 383 px back to the new pill.
- **Expected:** Plate glides old pill -> new pill with the row still (MOT-06a).
- **Repro:** Phone, Rounds -> tap the title -> tap Messages
- **Fix:** shell/SectionStrip.tsx: recentre the row after the strip closes, or start the plate from the old pill's post-scroll position.
- **Files:** src/clubhouse/shell/SectionStrip.tsx
- **Effort:** S

- **Locations:** P001 section strip
- **Evidence:** ev/motion/MOT-06a/C1-webkit-Messages-r1-geometry.json; ev/motion/MOT-06a/C2-chromium-r1-geometry.json
- **Source drafts:** D-lean-motion-0010
- **Graders:** A

## F-0047 · S3 · after · P006 · motion
**The Calendar now-pill pulse repaints on the main thread every frame**

- **Screen:** Calendar / now-line pill
- **Role:** player
- **Where:** phone-402 · Chromium trace (idle)
- **Standard:** MO-02 / MS-4 Idle loops compositor-only
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** ≈100 of ≈200 frames per 2 s PRESENTED_PARTIAL with has_main_animation from span.ch-now-pill (box-shadow keyframes, styles/calendar.css:3108).
- **Expected:** Idle loops on transform/opacity only (MS-4, MO-02).
- **Repro:** Calendar (Day, today); trace() 2 s idle
- **Fix:** styles/calendar.css:3108: pulse a pseudo-element ring's opacity/transform instead of box-shadow.
- **Files:** src/clubhouse/styles/calendar.css
- **Effort:** S

- **Locations:** P006 Calendar Day now-pill
- **Evidence:** ev/motion/MOT-67/C2-calendar-idle-strip-trace.json; p6-motion/lean-motion/trace-smoothness.json
- **Source drafts:** D-lean-motion-0013
- **Graders:** A

## F-0048 · S3 · after · P007 · touch
**The conversation 'Actions for…' button on phone can't be tapped**

- **Screen:** Messages / list / conversation actions
- **Role:** coach + player
- **Where:** phone-402 · light · WebKit (T1)
- **Standard:** TO-01 / CO-02 every control reachable
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Playwright WebKit tap timed out on 'Actions for Demo University Golf — Team Channel' in both press passes (coach and player); desktop click works.
- **Expected:** Every visible control takes a tap; hidden swipe actions are not in the tap order.
- **Repro:** Demo player, phone; Messages; Tap the row's actions button
- **Fix:** Check whether the button is covered by the row's swipe layer or sits off-screen behind it; if it is a swipe action, give it aria-hidden until revealed and add a long-press menu path.
- **Files:** src/clubhouse/screens/messages/MessagesView.tsx
- **Effort:** S

- **Locations:** P007 inbox row actions
- **Evidence:** p2p3-lean/lean-coach/press/P007.jsonl; p2p3-lean/lean-player/rows/messages.jsonl; p2p3-lean/lean-coach/DONE.md

- **Graders:** A

## F-0049 · S3 · after · P011 · touch
**On desktop New round, the sticky Start round footer covers the 'Not live' control when it is scrolled to**

- **Screen:** Rounds / New round setup
- **Role:** player
- **Where:** desktop-1440 · light · Chromium (T1)
- **Standard:** TO-06 scroll / focused control never hidden
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Press of 'Not live' failed: the sticky footer sat over it after scroll-into-view.
- **Expected:** scroll-padding-bottom equal to the footer height so scrolled-to controls clear it.
- **Repro:** Demo player at 1440; Rounds -> New round; Scroll 'Not live' into view
- **Fix:** Add scroll-padding-bottom: var(footer height) on the setup scroller.
- **Files:** src/clubhouse/screens/rounds
- **Effort:** S

- **Locations:** P011 /rounds/new
- **Evidence:** p2p3-lean/lean-player/rows/rounds.jsonl; p2p3-lean/lean-player/DONE.md

- **Graders:** A

## F-0050 · S3 · after · P005 · craft
**Stats chart labels are 11 px on the phone**

- **Screen:** Stats (player) / trend charts; Stats (team) line chart
- **Role:** coach + player
- **Where:** phone-402 · light + dark · WebKit (T1)
- **Standard:** CR-03 phone text never under 12 px
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** text.ch-sv-rt__t 11 px ('70', '80', 'Jun 9', '↑ Lower is better', 'Zero is the Tour') on 5 player stats tabs; text.ch-line__t 11 px on coach stats.
- **Expected:** >= 12 px (CR-03); Apple Health axis labels read at caption size with Dynamic Type.
- **Repro:** Stats on a 402 px phone; __chAudit.scan().tinyText
- **Fix:** Set .ch-sv-rt__t and .ch-line__t to the 12 px step token.
- **Files:** src/clubhouse/styles
- **Effort:** S

- **Locations:** P004 team stats line chart; P005 player stats (all tabs)
- **Evidence:** ev/stats/stats-pro-light.png; ev/stats/stats~tab=dev-pro-light.png; p2p3-lean/lean-player/drafts.jsonl
- **Source drafts:** D-lean-coach-0038; D-lean-coach-0039; D-lean-player-0033
- **Graders:** A

## F-0051 · S3 · after · P007 · craft
**The Announcements card on Messages pokes about 3 pt outside the page edge**

- **Screen:** Messages / list (player)
- **Role:** player
- **Where:** phone-402 · light + dark · T2a Simulator Safari + WebKit (T1)
- **Standard:** CR-01 phone page edge 16 px
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Card left edge ~13 pt, everything else 16 pt (ev/t2/player-messages-light.png); scan().edge 3.
- **Expected:** Cards align to --ch-page-x-phone (16 pt).
- **Repro:** Demo player, phone; Messages
- **Fix:** Drop the negative inline margin on the announcements digest card so it uses the page padding.
- **Files:** src/clubhouse/screens/messages
- **Effort:** S

- **Locations:** P007 Messages list
- **Evidence:** ev/t2/player-messages-light.png; p8-sim/rows.jsonl
- **Source drafts:** D-lean-player-0044
- **Graders:** A

## F-0052 · S3 · after · P007 · craft
**A conversation's last-message preview breaks into a three-line stack ('Coach:' / poll icon / 'staging check')**

- **Screen:** Messages / list
- **Role:** player
- **Where:** phone-402 · light · T2a Simulator Safari
- **Standard:** CR-13 handcrafted, not basic; CN-03 truncation
- **Confidence:** observed
- **Tier:** T2
- **Env:** preview (staging), Preview flag set
- **Observed:** Team Channel row shows 'Coach:' on one line, the poll glyph alone on the next, the text on a third; row height ~2.5x the Announcements row.
- **Expected:** One or two lines, sender, glyph and text inline, ellipsis at the end (iMessage, Slack iOS).
- **Repro:** Demo player, phone; Messages (Team Channel's last message is a poll)
- **Fix:** Render the preview as one inline run (sender, 13 px glyph, text) with -webkit-line-clamp: 2.
- **Files:** src/clubhouse/screens/messages/MessagesView.tsx
- **Effort:** S

- **Locations:** P007 inbox rows with a poll or attachment preview
- **Evidence:** ev/t2/player-messages-light.png

- **Graders:** A

## F-0053 · S3 · after · P006 · system
**Calendar calls the same view 'List' on the phone and 'Agenda' on desktop, and the phone has no Week**

- **Screen:** Calendar / view control
- **Role:** coach + player
- **Where:** phone-402 WebKit (T1) vs desktop-1440 Chromium (T1)
- **Standard:** SY-05 terminology; SY-04 parity
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Phone: Day / Month / List (ev/P006/calendar__view-month-pro-dark.png). Desktop: Day / Week / Month / Agenda (ev/calendar/calendar~event=…-mba15-light.png).
- **Expected:** One noun per view on both surfaces (SY-05); Apple Calendar iOS uses List on both.
- **Repro:** Calendar on a phone and at 1440
- **Fix:** Pick one label (List) for ?view=agenda/list on both surfaces.
- **Files:** src/clubhouse/screens/calendar
- **Effort:** S

- **Locations:** P006 phone and desktop view control
- **Evidence:** ev/P006/calendar__view-month-pro-dark.png; ev/calendar/calendar~event=0e27cb7b-b5fa-4bdc-9f39-2c37ec31ddf9-mba15-light.png; p6-motion/lean-motion/DONE.md

- **Graders:** A

## F-0054 · S3 · after · P016 · system
**The pushed New event page shows its title twice at rest: in the bar and as the large title**

- **Screen:** Tournaments / New event (pushed page)
- **Role:** coach
- **Where:** phone-402 · light · WebKit (T1)
- **Standard:** SY-03 iOS conventions (large title)
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Bar: '< Tournaments   New event'; page: eyebrow 'Tournaments' + large title 'New event' (ev/P016/tournaments-new-pro-light.png).
- **Expected:** Large title at rest, small bar title only after the large title scrolls under the bar (iOS navigation bar).
- **Repro:** Demo coach, phone; Tournaments -> New event
- **Fix:** Hide the bar title until the large title's IntersectionObserver reports it under the bar (the shell's large-title collapse), and drop the repeated eyebrow.
- **Files:** src/clubhouse/shell
- **Effort:** S

- **Locations:** P016 tournaments/new (other pushed pages unchecked)
- **Evidence:** ev/P016/tournaments-new-pro-light.png

- **Graders:** A

## F-0055 · S3 · after · P001 · speed
**Old addresses show a blank 'Opening…' canvas for up to 3.3 s**

- **Screen:** Shell / alias wait
- **Role:** player
- **Where:** phone-402 · light · WebKit (T1)
- **Standard:** CO-04 expected alias wait 2 s
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Blank-to-NotRebuilt 2176 / 2195 / 3280 ms (min / median / max, 7 landings).
- **Expected:** At most 2 s.
- **Repro:** Open /golf/dashboard/courses as the player
- **Fix:** Start the AliasWait timer once per address (src/clubhouse/shell/NotRebuilt.tsx:49-56).
- **Files:** src/clubhouse/shell/NotRebuilt.tsx
- **Effort:** S

- **Locations:** P001 alias wait
- **Evidence:** p1-crawl/p1-player/rows/courses--pro.json
- **Source drafts:** D-p1-player-0008
- **Graders:** B

## F-0056 · S3 · after · P001 · correctness
**A coach qualifying link opened by a player lands on a qualifier page with an empty heading**

- **Screen:** Shell / alias /coachhelm/qualifying/<id> as player
- **Role:** player
- **Where:** phone + desktop · light (T1)
- **Standard:** CO-04
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Lands on /golf/dashboard/qualifiers/<id> with h1 ''. No coach data seen; downgraded from S2.
- **Expected:** The player's qualifier view with its heading, or CH-1301.
- **Repro:** As the player open /golf/dashboard/coachhelm/qualifying/<id>
- **Fix:** Map the alias to the player qualifier route in src/clubhouse/routes/alias.ts and render the title before data lands.
- **Files:** src/clubhouse/routes/alias.ts
- **Effort:** S

- **Locations:** P001 alias qualifying
- **Evidence:** ev/p1/player/coachhelm_qualifying_0a0d1700-0000-4000-8000-0000000000a1-pro.png
- **Source drafts:** D-p1-player-0003
- **Graders:** B

## F-0057 · S3 · after · P006 · correctness
**Double-clicking a calendar event or day fires its reads twice and adds a navigation**

- **Screen:** Calendar week, month (desktop)
- **Role:** coach
- **Where:** desktop-1440 · light · Chromium (T1)
- **Standard:** CO-02
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Event: duplicate non-GETs on double; month day: 2 navs single, 3 double. Reads only.
- **Expected:** One open (Calendar for Mac).
- **Repro:** Coach desktop: Calendar, double-click an event
- **Fix:** Treat dblclick as one open; dedupe the inspector fetch per event id.
- **Files:** src/clubhouse/screens/calendar/*
- **Effort:** S

- **Locations:** P006 week event; P006 month day
- **Evidence:** p2p3-lean/lean-coach/press/P006.jsonl
- **Source drafts:** D-lean-coach-0180; D-lean-coach-0184; D-lean-coach-0188
- **Graders:** B

## F-0058 · S3 · after · P006 · a11y
**After cancelling or deleting an event, another event's menu or peek opens by itself**

- **Screen:** Calendar / after Cancel or Delete
- **Role:** coach
- **Where:** desktop-1440 · light · Chromium (T1)
- **Standard:** AX-03
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** After Cancel the top layer was the hand-test actions menu; after Delete, its peek (W-021).
- **Expected:** Focus returns to the day without opening anything.
- **Repro:** Desktop: cancel then delete an event
- **Fix:** Restore focus to the day cell when the opener is gone; never dispatch the next event's open action.
- **Files:** src/clubhouse/ui/Modal.tsx
- **Effort:** S

- **Locations:** P006 cancel; P006 delete
- **Evidence:** ev/P006/write-c-ev-cancelled.png; writes.jsonl#W-021
- **Source drafts:** D-lean-coach-0203
- **Graders:** B

## F-0059 · S3 · after · P001 · states
**The bell, + and compose buttons are missing from loading skeletons and pop in**

- **Screen:** Route skeletons
- **Role:** coach
- **Where:** phone-402 · fixture
- **Standard:** ST-01
- **Confidence:** observed
- **Tier:** T1
- **Env:** fixture
- **Observed:** Home, Rounds, Stats, Calendar, Messages loading states show only the title menu.
- **Expected:** Top bar stable across skeleton and content.
- **Repro:** /clubhouse-preview/stats?state=loading then /stats
- **Fix:** Keep the bell and route action slot in the frame top bar during the route skeleton (shell/ClubhouseFrame.tsx).
- **Files:** src/clubhouse/shell/ClubhouseFrame.tsx
- **Effort:** S

- **Locations:** P002; P004; P005; P006; P007; P011
- **Evidence:** ev/states/home-loading.png; ev/states/home-default.png; ev/states/stats-loading.png
- **Source drafts:** D-lean-states-0005
- **Graders:** B

## F-0060 · S3 · after · P011 · states
**Round review skeleton draws a pale hero where the loaded hero is dark green**

- **Screen:** Round review / loading
- **Role:** player
- **Where:** phone-402 · fixture
- **Standard:** ST-01
- **Confidence:** observed
- **Tier:** T1
- **Env:** fixture
- **Observed:** First block light grey; loaded hero dark green. Home's skeleton is green.
- **Expected:** Skeleton in the hero's tone.
- **Repro:** /clubhouse-preview/round?state=loading then /round
- **Fix:** Use the dark hero skeleton variant in RoundsSkeleton.tsx.
- **Files:** src/clubhouse/screens/rounds/RoundsSkeleton.tsx
- **Effort:** S

- **Locations:** P011 round loading
- **Evidence:** ev/states/round-loading.png; ev/states/round-default.png
- **Source drafts:** D-lean-states-0006
- **Graders:** B

## F-0061 · S3 · after · P005 · states
**Two failed reads say what happened but give no Try again button**

- **Screen:** Player page reads failed; Round review note failed
- **Role:** coach, player
- **Where:** phone-402 · fixture
- **Standard:** ST-03
- **Confidence:** observed
- **Tier:** T1
- **Env:** fixture
- **Observed:** player?readsfailed '…Try again in a moment.' with no button; round?notefailed '…Reload to try again.'
- **Expected:** A Try again control in place.
- **Repro:** /clubhouse-preview/player?state=readsfailed; /clubhouse-preview/round?state=notefailed
- **Fix:** Pass onRetry to the InlineNotice in both branches.

- **Effort:** S

- **Locations:** P005 readsfailed; P011 notefailed
- **Evidence:** ev/states/player-readsfailed.png; ev/states/round-notefailed.png

- **Graders:** B

## F-0062 · S3 · after · P001 · contrast
**Meta text and two big figures sit under Lc 60**

- **Screen:** All families: meta and large APCA
- **Role:** coach, player
- **Where:** phone + desktop · both themes
- **Standard:** CT-03 / CT-02 Lc 60
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** span Lc 47.1 (48×), identity meta Lc 58.1 / 56.9, s.ch-was Lc 36.3, znbig Lc 59.7 / 54.8 dark.
- **Expected:** Lc 60.
- **Repro:** measureContrast any family
- **Fix:** Same token pass as F-a11y-038.
- **Files:** src/clubhouse/styles/tokens.css
- **Effort:** S

- **Locations:** every family
- **Evidence:** p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0038; p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0039
- **Source drafts:** D-lean-player-0038; D-lean-player-0039; D-lean-player-0040
- **Graders:** B

## F-0063 · S3 · after · P005 · a11y
**Stats and Team Hub skip heading levels**

- **Screen:** Stats and Team Hub headings
- **Role:** player
- **Where:** phone + desktop · light
- **Standard:** AX-02
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** axe heading-order (moderate), 24 nodes.
- **Expected:** Levels increase by one.
- **Repro:** axe on My stats
- **Fix:** Insight titles as h3 under the section h2.

- **Effort:** S

- **Locations:** P004; P005; P010
- **Evidence:** p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0041
- **Source drafts:** D-lean-player-0041
- **Graders:** B

## F-0064 · S3 · after · P005 · a11y
**Two Stats sections share the same landmark name**

- **Screen:** My stats desktop
- **Role:** player
- **Where:** desktop-1440 · light
- **Standard:** AX-02
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** axe landmark-unique (moderate), 2 nodes.
- **Expected:** Unique names.
- **Repro:** axe on My stats desktop
- **Fix:** aria-labelledby each section's own heading.

- **Effort:** S

- **Locations:** P005
- **Evidence:** p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0042
- **Source drafts:** D-lean-player-0042
- **Graders:** B

## F-0065 · S3 · after · P001 · a11y
**'Skip to content' is still off screen right after Tab focuses it**

- **Screen:** Skip link desktop
- **Role:** player
- **Where:** desktop-1440 · light
- **Standard:** AX-02
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** a.ch-skip inView false on focus (calendar, home, messages, rounds, stats); may be its slide-in.
- **Expected:** Visible on focus within a frame.
- **Repro:** Desktop: Tab once
- **Fix:** Show .ch-skip on :focus-visible without a transition.
- **Files:** src/clubhouse/styles/shell.css
- **Effort:** S

- **Locations:** P001
- **Evidence:** p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0037; p2p3-lean/lean-coach/press/P002.jsonl
- **Source drafts:** D-lean-player-0037
- **Graders:** B

## F-0066 · S3 · after · P001 · correctness
**Coach-only addresses silently show the player's own view and keep the coach parameters**

- **Screen:** Coach routes opened by a player
- **Role:** player
- **Where:** phone + desktop · light
- **Standard:** CO-05
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** 33 routes stay put with coach params and show the player's own data; no leak.
- **Expected:** Redirect to the clean URL or a one-line notice.
- **Repro:** Player: /golf/dashboard/stats?player=<another id>
- **Fix:** router.replace stripping coach-only params on role mismatch.
- **Files:** src/clubhouse/routes/alias.ts
- **Effort:** S

- **Locations:** P001 role routing
- **Evidence:** p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0046
- **Source drafts:** D-lean-player-0046
- **Graders:** B

## F-0067 · S3 · blocks-flip · P005 · correctness
**The player hero mixes windows, and the 'better than previous 10' figure mirrors the SG value**

- **Screen:** Player hero (coach, Last 10)
- **Role:** coach
- **Where:** desktop-1440 · light
- **Standard:** CO-03
- **Confidence:** judgment
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Tyler Hayes, Last 10: 'SG / round −3.3' with '↗ +3.3 Better than previous 10' and 'What changed: +3.3 …', beside 'Rounds 2 · This season' and tab 'Rounds 10'. Equal size, opposite sign suggests a delta against an empty window. Investigate.
- **Expected:** Change only when the previous window has data; each figure labelled with its window (Apple Health).
- **Repro:** Coach: Stats, Tyler Hayes, Last 10
- **Fix:** Null the change when the previous window is below the minimum; label the Rounds figure's window.
- **Files:** src/clubhouse/screens/stats/*
- **Effort:** S

- **Locations:** P005 hero
- **Evidence:** ev/P004/stats__player-faced578-mba15-light.png

- **Graders:** B

## F-0068 · S3 · after · P009 · content
**A qualifier under the 'Active' heading is labelled 'Ended'**

- **Screen:** Qualifiers list
- **Role:** coach
- **Where:** phone-402 · light
- **Standard:** SY-05 one noun per state
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** 'Active' section (filter 'Active 1') holds 'Fall Invitational Qualifier' badged 'Ended · 5 rounds outstanding'; the player's setup still offers it as 'Open qualifier · Round 3 of 3 · Play'.
- **Expected:** One state word ('Waiting on 5 rounds').
- **Repro:** Coach: Qualifiers
- **Fix:** Rename the ended-with-outstanding badge, or give it its own group.
- **Files:** src/clubhouse/screens/qualifiers/*
- **Effort:** S

- **Locations:** P009
- **Evidence:** ev/P009/qualifiers-pro-light.png; ev/rounds/rounds_new-mba15-light.png

- **Graders:** B

## F-0069 · S3 · after · P013 · content
**Some headings and labels are cut off with no ellipsis**

- **Screen:** Clipped labels
- **Role:** coach, player
- **Where:** phone WebKit + desktop Chromium (T1)
- **Standard:** CN-03
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** Qualifier steps label, CoachHelm player-list heading, Ask composer label, 4 dt labels (CoachHelm/Stats desktop). S3: not screenshot-verified; scan also flags sr-only text.
- **Expected:** Ellipsis and a way to read it.
- **Repro:** scan() on the listed screens
- **Fix:** text-overflow: ellipsis on single-line labels; let headings wrap.

- **Effort:** S

- **Locations:** P009; P013; P005 (desktop)
- **Evidence:** ev/P009/qualifiers-86dad12b-selection-pro-light.png; ev/P013/coachhelm-pro-light.png
- **Source drafts:** D-lean-coach-0088; D-lean-coach-0118; D-lean-coach-0119; D-lean-player-0034
- **Graders:** B

## F-0070 · S3 · after · P013 · content
**One CoachHelm card says the same putting figure three ways**

- **Screen:** CoachHelm Board card
- **Role:** coach
- **Where:** phone-402 · light
- **Standard:** CN-02 / CN-04
- **Confidence:** observed
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** '35% vs PGA Tour make % avg 62.2', then '(95% range 23–48%) (PGA Tour ~62%)', then a 35% / 62.2% table; 'Owen' twice in one sentence.
- **Expected:** Number once, one comparison, one range (Claude iOS answer cards).
- **Repro:** Coach: CoachHelm Board, Owen Carter
- **Fix:** 'Owen makes 35 % from 5–10 ft over 14 rounds (likely 23–48 %). Tour players make 62 %.'
- **Files:** src/clubhouse/screens/coachhelm/*
- **Effort:** S

- **Locations:** P013
- **Evidence:** ev/P013/coachhelm-pro-light.png

- **Graders:** B

## F-0071 · S4 · after · P007 · motion
**Opening a conversation or an event sheet ticks a selection haptic**

- **Screen:** Messages / open a conversation; Calendar / open an event
- **Role:** player
- **Where:** phone-402 · T1 app lane (bridge spy, C10)
- **Standard:** MO-14 Haptics: none on plain navigation
- **Confidence:** measured
- **Tier:** T1 app
- **Env:** preview (staging), Preview flag set
- **Observed:** Inbox row -> thread: one select tick; Calendar event -> sheet: one select tick; round push: none.
- **Expected:** Zero haptics on plain navigation; select is for a selection change (D-70).
- **Repro:** App lane (bridge spy); Messages -> tap a conversation; Calendar -> tap an event
- **Fix:** Log it in 01 §6 as an owner choice, or drop haptic("select") at screens/messages/MessagesView.tsx:433 and screens/calendar/CalendarPhone.tsx:495.
- **Files:** src/clubhouse/screens/messages/MessagesView.tsx; src/clubhouse/screens/calendar/CalendarPhone.tsx
- **Effort:** S

- **Locations:** P007 thread open; P006 event open
- **Evidence:** p6-motion/lean-motion/rows/MOT-30.jsonl; p6-motion/lean-motion/rows/MOT-21.jsonl
- **Source drafts:** D-lean-motion-0012
- **Graders:** A

## F-0072 · S4 · after · P001 · touch
**Legacy :hover rules outside (hover: hover) ship in the CSS the phone loads**

- **Screen:** All phone screens (loaded CSS)
- **Role:** coach + player
- **Where:** phone-402 · WebKit (T1); corroborated in T2a Simulator Safari
- **Standard:** TO-03 hover styles only under (hover: hover)
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** 30+ rules (e.g. .baseball-auth-panel button:hover, .glass-card:hover, .group:hover .group-hover:*); no stuck hover in 162 tap checks.
- **Expected:** Every :hover inside @media (hover: hover) (TO-03).
- **Repro:** __chAudit.scan().hoverOnlyRisk
- **Fix:** Drop the legacy Fairway/baseball CSS from the Clubhouse bundle, or wrap the remaining :hover rules in @media (hover: hover).

- **Effort:** M

- **Locations:** every phone page
- **Evidence:** p8-sim/rows.jsonl; p2p3-lean/lean-player/DONE.md; p2p3-lean/lean-player/drafts.jsonl
- **Source drafts:** D-lean-coach-0153; D-lean-player-0036
- **Graders:** A

## F-0073 · S4 · after · P001 · craft
**Avatar initials are sized off the type scale**

- **Screen:** Avatars (Stats, Messages, Roster)
- **Role:** coach + player
- **Where:** phone-402 + desktop-1440 · both themes
- **Standard:** CR-02 type on the 11 steps
- **Confidence:** measured
- **Tier:** T1
- **Env:** preview (staging), Preview flag set
- **Observed:** span.ch-avatar at 9.24 px (desktop stats), 13.6 px (Messages, Roster), 16.32 px (Stats hero).
- **Expected:** Initials on the nearest step (11/13/17) per avatar size (CR-02).
- **Repro:** __chAudit.scan().offScale
- **Fix:** Map avatar sizes to step tokens in ui/Avatar instead of size × 0.34.
- **Files:** src/clubhouse/ui
- **Effort:** S

- **Locations:** P003 roster (desktop); P004/P005 stats; P007 messages
- **Evidence:** ev/stats/stats-pro-light.png; p2p3-lean/lean-player/drafts.jsonl; p2p3-lean/lean-coach/drafts.jsonl
- **Source drafts:** D-lean-coach-0040; D-lean-coach-0047; D-lean-coach-0071; D-lean-player-0043
- **Graders:** A

## F-0074 · S4 · after · P002 · craft
**'From your coach' summary wraps with a separator dot stranded at the end of the line**

- **Screen:** Home (player) / From your coach
- **Role:** player
- **Where:** phone-402 · dark · T2a Simulator Safari
- **Standard:** CR-06 rhythm / CR-13
- **Confidence:** observed
- **Tier:** T2
- **Env:** preview (staging), Preview flag set
- **Observed:** '5 replies · 1 to acknowledge ·' / '4 tasks due' (ev/t2/player-home-dark.png).
- **Expected:** Items wrap whole with their separator (no line-final dot).
- **Repro:** Demo player, phone, dark; Home
- **Fix:** Wrap each 'n thing' with its leading separator in a white-space: nowrap span.
- **Files:** src/clubhouse/screens/home
- **Effort:** S

- **Locations:** P002 player Home
- **Evidence:** ev/t2/player-home-dark.png

- **Graders:** A
