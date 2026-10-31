# Fix packet 02 · motion

8 findings, 6 block the flag flip.

## F-0006 · S1 · blocks-flip · P011
**The drill-in push stalls once for 70–88 ms and drops about a fifth of its frames on a mid-tier phone**

- Observed: 4x: 20.0–20.8 % smoothness-affecting drops, one presented gap > 50 ms per run (69.8/70.6/88.3 ms); 1x: 2.2–8.2 % dropped, max gap 30–40 ms. Spring geometry clean (RMS 0.05 % WebKit, t95 245 ms).
- Expected: 0 % dropped at 1x, <= 5 % worst 1 s at 4x, no presented gap over 50 ms (MO-03; UIKit push).
- Fix: lib/nav-motion.ts: take the copy layer (holdForPush/pageLayer) before the tap frame ends and defer the new page's non-visible work until the spring settles; find the long task in the 4x trace's commit frame.
- Files: src/clubhouse/lib/nav-motion.ts
- Evidence: p6-motion/lean-motion/rows/MOT-03.jsonl, ev/motion/MOT-03/C2-4x-r1-trace.json, ev/motion/MOT-03/C2-4x-r3-trace.json, p6-motion/lean-motion/trace-smoothness.json
- Acceptance: rerun the instrument named in the evidence; it must pass (MO-03 Frame pacing).

## F-0007 · S1 · blocks-flip · P006
**Switching Calendar between Day and Month animates the page height, so everything below reflows for 180 ms**

- Observed: div.ch-swap transition: height 0.18 s; #ch-content/main.ch-calm boxes change 11 (Chromium) / 14 (WebKit) frames in a row; one 1x run with a 140 ms presented gap.
- Expected: transform/opacity only; the view swaps at once (MO-02, MO-09, MOT-65).
- Fix: ui/Swap.tsx:83-96: drop the height transition for Calendar views (swap at once) or clip a fixed-height wrapper and move content with transform.
- Files: src/clubhouse/ui/Swap.tsx
- Evidence: p6-motion/lean-motion/rows/MOT-65.jsonl, ev/motion/MOT-65/C1-webkit-r1-geometry.json, ev/motion/MOT-65/C2-r2-trace.json, ev/motion/MOT-65/C1-day-to-month-strip.png
- Acceptance: rerun the instrument named in the evidence; it must pass (MO-02 Compositor-only properties).

## F-0008 · S1 · blocks-flip · P001
**Switching section from the strip stalls once for 50–79 ms on a mid-tier phone**

- Observed: 4x: 11.5–17.6 % smoothness-affecting drops, one presented gap > 50 ms per run; 1x 2.9–5.4 %, no gap > 50. Page swaps at once (MO-09 correct); plate settle RMS 0.09–0.49 %.
- Expected: <= 5 % worst 1 s at 4x, no presented gap over 50 ms (MO-03).
- Fix: Render the new section after the strip's close starts (startTransition) so the plate and strip keep compositor frames; find the long task in the switch frame.
- Files: src/clubhouse/shell/SectionStrip.tsx, src/clubhouse/lib/nav-motion.ts
- Evidence: p6-motion/lean-motion/trace-smoothness.json, ev/motion/MOT-06a/C2-4x-r3-trace.json, p6-motion/lean-motion/rows/MOT-06a.jsonl
- Acceptance: rerun the instrument named in the evidence; it must pass (MO-03 Frame pacing).

## F-0017 · S2 · after · P002
**Tapping a second segment while the pill is still gliding makes it jump instead of turning**

- Observed: Retarget at 80 ms: one-frame steps 45–54 px (Chromium), 55–62 px (WebKit); reverse at 40 % first sample 9.7–12.7 px off trend (spec <= 2 px). Uninterrupted glide RMS 0.06–0.37 %, t95 204–211 ms.
- Expected: Retarget from the live position and velocity (02 §3a (a)(c)).
- Fix: lib/slide-plate.ts: when a glide runs, read the plate's live box and velocity and start the new spring from there (chSpringCurve with velocity).
- Files: src/clubhouse/lib/slide-plate.ts, src/clubhouse/ui/Segmented.tsx
- Evidence: p6-motion/lean-motion/rows/MOT-42.jsonl, ev/motion/MOT-42/C1-webkit-retarget-r1.json, ev/motion/MOT-42/C2-chromium-retarget-r1.json
- Acceptance: rerun the instrument named in the evidence; it must pass (MO-08 Interruptible).

## F-0018 · S2 · blocks-flip · P001
**With Reduce Motion on, sheets can no longer be dragged down and pushed pages can no longer be swiped back**

- Observed: C5: sheet drag 120 px hold and 60 px at 0.6 px/ms moved 0 px; edge swipe 40 % hold moved 0 px. Pull to refresh still tracks.
- Expected: Reduce Motion changes how things settle, not whether the finger moves them (MO-10, Nick H19).
- Fix: Keep useSheetDrag enabled under reduced motion (ui/Modal.tsx:56, ui/FormSheet.tsx:45, shell/AccountSheet.tsx:77, shell/AskSheetBody.tsx:55, coachhelm/chat/History.tsx:142) and make only the settle a 180 ms fade; let use-route-swipe track and replace the parallax with a fade.
- Files: src/clubhouse/ui/Modal.tsx, src/clubhouse/ui/FormSheet.tsx, src/clubhouse/shell/use-route-swipe.ts, src/clubhouse/shell/use-edge-swipe.ts
- Evidence: p6-motion/lean-motion/rows/MOT-22.jsonl, p6-motion/lean-motion/rows/MOT-05.jsonl, ev/motion/MOT-22/C5-drag-down-0.3-120-hold.json, ev/motion/MOT-05/C5-drag-0.3-0.4-hold.json
- Acceptance: rerun the instrument named in the evidence; it must pass (MO-10 Gestures still track under Reduce Motion).

## F-0019 · S2 · blocks-flip · P011
**Picking a shot result makes the shot card jump up 150 px in one frame**

- Observed: .ch-rt-card top 552 -> 426 -> 401 px in two frames (height 242 -> 393); no animation on the card.
- Expected: Chip fills on quick 180; the card holds still (MOT-90).
- Fix: screens/rounds/track/ShotEntry.tsx: reserve the distance block's height from the start (visibility hidden) so the card's top stays put; presentation only.
- Files: src/clubhouse/screens/rounds/track/ShotEntry.tsx, src/clubhouse/styles/rounds-track.css
- Evidence: p6-motion/lean-motion/rows/MOT-90.jsonl, ev/motion/MOT-90/C1-webkit-r1.json, ev/motion/MOT-90/C1-chromium-r1.json
- Acceptance: rerun the instrument named in the evidence; it must pass (MO-13 / MOT-90 No layout shift of the card).

## F-0020 · S2 · blocks-flip · P011
**Recording a shot snaps the card 258 px with no transition, so the golfer can't see the shot land in the log**

- Observed: Card moves 257.5–258.9 px, settles in 54–67 ms, 0 animations/transitions; one impact MEDIUM haptic (correct).
- Expected: Shot log entry eases in on base 260 ease-out; the card resets with no jump (MOT-91).
- Fix: Animate the new log row in (translateY 8 px + opacity, base 260 ease-out) and keep the card's top anchored so the reset is a content swap.
- Files: src/clubhouse/screens/rounds/track/ShotEntry.tsx
- Evidence: p6-motion/lean-motion/rows/MOT-91.jsonl, ev/motion/MOT-91/C1-webkit-r1.json, ev/motion/MOT-91/C1-chromium-r1.json
- Acceptance: rerun the instrument named in the evidence; it must pass (MO-13 / MOT-91).

## F-0046 · S3 · after · P001
**On a section switch the strip row jumps sideways and the plate flies in from off-screen while the strip closes**

- Observed: Plate x 150 -> −240 in the first frame (row recentres instantly), then glides 383 px back to the new pill.
- Expected: Plate glides old pill -> new pill with the row still (MOT-06a).
- Fix: shell/SectionStrip.tsx: recentre the row after the strip closes, or start the plate from the old pill's post-scroll position.
- Files: src/clubhouse/shell/SectionStrip.tsx
- Evidence: ev/motion/MOT-06a/C1-webkit-Messages-r1-geometry.json, ev/motion/MOT-06a/C2-chromium-r1-geometry.json
- Acceptance: rerun the instrument named in the evidence; it must pass (MO-13 Motion explains).
