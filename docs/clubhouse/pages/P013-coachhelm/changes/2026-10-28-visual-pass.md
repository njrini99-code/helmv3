# 2026-10-28 — CoachHelm: visual pass (contrast, honest controls, Ask status)

## 2026-10-28 — Pre-deploy visual pass, area H

```text
Design package: none (visual-pass-2026-10-28 RUBRIC.md, P013 premium checklist;
                recheck-2026-10-24 G1 row 10, G3 findings 8, G4 rows 77 and 88)
PR/commit:      visual-pass-2026-10-28
Contract IDs:   CH-13850, CH-13309, CH-13206 (presentation only)
Actions:        none
Data impact:    none
Held items:     thread controls' touch press and the unused breathing-ring rule
                (coachhelm-thread.css, PR #2383, requested); the shimmer and the
                settle-in on a real iPhone (Safari)
```

### Changed

- Hero titles: the player's Deep dive sentence (`.ch-hd-hero h2`) and the
  Standing hero (`.ch-hs-hero h2`) use `--ch-forest-800`, which turns to
  `#cfe6d7` at night. They used the field green, 1.36:1 on the dark page (the
  Deep dive sentence was all but invisible at night).
- Ask, while CoachHelm works: the shimmering current step is the status. The
  wheel no longer breathes a ring, and the ticking "Working · 12s" line is gone
  (Stop stays on desktop). The time it took is still said once on the finished
  line ("Read 3 players · 14s"), and the browser no longer re-renders the turn
  five times a second to count it.
- Ask, streamed text settles in: while an answer streams, each new paragraph or
  list fades in on the base beat (opacity only, nothing moves). A finished or
  reloaded answer draws still, so there is no first-paint motion; Animations off
  zeroes it. The rule lives in `coachhelm-thread.css`, beside the turn fade.
- Course plan: "Send to {name}" (Send icon) is now "Message {name}" (message
  icon). It opens Messages with the plan written in and the coach presses Send
  there (D2-7), so the button no longer says more than it does.
- "Since you were last here": the quiet line (CH-13309) and the gaps-only line
  (CH-13206) carry an underlined "What’s new" link. Before, the only way in from
  the commonest state was the palette.
- The focus card's evidence ledger: a comparison row ("Tour 0.3") splits into
  its label and its figure, so the Tour's figure sits right-aligned in the same
  column as the read's own ("Eli 1.1") instead of one left-aligned string. A
  comparison written in other words stays one line.
- Deep dive: an out-of-date read's firmness word keeps the tertiary ink. It was
  in the disabled ink (2.1:1) on a live row; the stance word already says
  "Out of date".
- Type: the player-list count, the Deep dive measure badge and the profile
  count pill moved off raw px onto the 12 and 13 step roles (they follow iPhone
  Text Size now); the Deep dive's 44px figure scales with `--ch-type-k`.

- Ask thread: every hover-only control (icon buttons, follow-up pills, chips,
  the toggle, the steps button) now shows the same look while a finger holds it.
  The unused breathing ring on the wheel is removed.

### Verification

- `coachhelm-thread-ui.test` (CH-13850: no "Working" line, no breathing ring,
  the current step carries the shimmer; a finished answer has no
  `data-streaming`), `coachhelm-course-plan.test` (Message Ava),
  `coachhelm.test` (CH-13309 carries the What's new link; CH-13802 the
  Tour's figure in the figure column),
  `look-feel-pass-css.test` (raw font counts lowered for coachhelm.css,
  coachhelm-dive.css; coachhelm-profile.css removed from the allowlist).
- Screenshots (Chromium, 393 and 1280, light and dark): Deep dive and Standing
  hero, Ask working and answer, the opened course plan, the quiet pulse line.
- Needs an iPhone: the shimmer and the settle-in in Safari.
