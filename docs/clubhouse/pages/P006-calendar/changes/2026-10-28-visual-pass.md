# 2026-10-28 — Calendar: visual pass (contrast at night, block line fit)

## 2026-10-28 — The panel's plates and full class slots read at night; a block never pushes its time out

```text
Design package: none (Clubhouse visual pass 2026-10-28, area D; RUBRIC H8, H10, A+ handoff 4.15 F1, F1a, F1b, F1d, F5, F5a, F23)
PR/commit:      visual-pass-2026-10-28
Contract IDs:   none (visual only)
Actions:        none
Data impact:    none
Held items:     an iPhone look at the largest Text Size on the phone's unfolded day and the desktop week in Safari;
                the week strip's selected-day letter (ui.css, requested from the shared-UI owner);
                a popover flipped above its trigger still grows from top left (its placement is set in Calendar.tsx)
```

### Changed

- The panel's head plate keeps its event's colour at night but is drawn deep from the night tokens. Before, the meeting
  plate (ink-700) and the class, busy and overlap plates (info-600, champagne and amber mixed with ink-900) all turned
  pale in dark mode, and the ivory title on them measured 1.3 to 1.9:1. Now: ink 8.8:1, slate 6.8:1, champagne 6.5:1,
  amber 6.4:1; green and forest were already deep and are unchanged.
- The kind badge on a plate and the class plate's "Class" chip sit in a well darker than the plate (black at 0.22)
  instead of a lighter one (white at 0.18), which measured 3.75:1 on the champagne plate and 4.48:1 on the green one in
  light. Every plate's badge now holds 7.3:1 or more in both themes. The plate's kicker line is white at 0.88 (was 0.8;
  the dark green plate held 4.50:1 before the sky lit it).
- The class plate's course code ("STAT 201") is one key that never breaks across lines; before, a long owner line split
  it into "STAT" over "201" inside a broken box. It sits in the same darker well as the badge.
- A full class slot on the week grid (seven or more players) and the class card's slate band are drawn deep at night
  (info-600 at 35% into info-100): the ivory words were 1.9:1 on the pale night info-600, now 6.9:1 (who: 5.3:1).
- The panel's "Next" row hovers to a deeper green at night instead of fill-600, where its ivory measured 4.0:1.
- Event blocks count their lines from the type the CSS really draws: a title line of 18 and a time line of 16 at the
  default size, multiplied by the reader's text size (`screens/calendar/type-k.ts`, `--ch-type-k`). The count assumed
  15.6, so a 90-minute block took a third title line and pushed its time out of the bottom, and a larger Text Size cut
  it on every tall block. The class group block does the same (it counted 15 a line). At the default size the short
  threshold is still 40px; a 90-minute block (76px) now takes two title lines instead of three, with its time whole.
- The event editor's title hint reads the placeholder token again: the shared token was raised in this pass (5.3:1 on
  the raised sheet at night, was 4.27:1).
- The jump-to-date and people popovers grow from the trigger's corner (top left), and the class card from the corner
  beside its block (top left when it opens to the right, top right when to the left), instead of from their centre.
- The editor's All day switch reads the shared switch tokens (track, on and thumb), so its edge holds 3:1 in both
  themes like every other switch.
- The people picker's coins overlap by their 2px rings only (was 4px), so the M of "TM" is no longer cut.
- The phone's week-step chevrons (previous and next, beside the day's title under the strip) are 44pt targets (were
  30×30, RUBRIC H10). Each drawn chevron stays 30pt where it was and reaches 44 by 44 past its box, outward only so the
  two never overlap, so the header row does not grow.

### Why

- Nick, 2026-10-28: be hard on contrast in both themes. The dark plates were the worst failures left in the Calendar.

### Verification

- stylelint (calendar.css), eslint (views.tsx, class-group.tsx, type-k.ts), calendar-event-block, calendar-premium,
  calendar-parity, calendar-busy-css, motion-approved, contrast-tokens and calendar tests. Contrast computed from the tokens (WCAG 2, oklab mixes). Before and after
  captures in Chromium at 393 and 1280/1512, light and dark (`/home/claude/vp/before`, `/home/claude/vp/after-D`).
  Needs an iPhone look: the unfolded phone day at XXL Text Size, and Safari's `color-mix` on the plates.
