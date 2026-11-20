# Clubhouse shared — Changelog

## 2026-11-20 — Overlay and component craft (premium plan, batch 5)

```text
Design package: premium plan 2026-11-19, batch 5 (4.32, LOOK, CC)
PR/commit: agent/clubhouse-components-b5
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- C2: one overlay paper token, `--ch-overlay-bg`, for the popover,
  the centred dialog and the team switcher, in place of three literal
  #faf8f2. At night it is the raised surface.
- LOOK-06: a dialog's close is a 32px round key with a 17px glyph,
  reached at 44 x 44.
- 4.32.3: the shared Tooltip is the ink plate (`--ch-tip-*`), dark by
  day and light at night; its key caps are outlined in the plate's
  ink.
- CC-6: keys draw a real outline when focused, not a box-shadow ring.
  In forced colours every focus is the system ring, and controls and
  surfaces drawn only by shadow get a real edge.
- M2: 46 literal white "lit rims" are gone from page stylesheets. Six
  stay, where their declaration also holds a raw drop shadow that
  needs a depth token first.
- Mat1, CC-1: one bar material, `--ch-glass-filter`, for every blur.
  The new-round dock's 1.7x blur and 170% saturation and onboarding's
  0.7x are gone. `glass-recipe.test.ts` guards it.
- POP-08: a toast is one width (360px) on desktop, so a stack never
  jumps between widths.
- New primitives, each from a named recipe (Radix Themes, shadcn/ui,
  UIKit):
  - `ui/Field`: label, help, error and counter, joined by
    aria-describedby; no role="alert".
  - `ui/Stepper`: a spinbutton between − and +.
  - `ui/ChoiceGroup`: a fieldset of radio rows.
  - `ui/ConfirmAction`: an alert dialog, Cancel first and focused,
    with the action named by its verb.
- Decisions applied as recommended, each in its own commit so it can
  be reverted on its own:
  - 12, D4: menu glyphs in ink; green only on the checked row.
  - 13, D5: desktop dialog footers untinted, with no rule.
  - 14, OQ-59: key glyphs 16; large keys on the headline role (16px,
    600); radius 12 kept.

### Not done

- The Button face (an opacity layer for hover and press on every
  variant). Six page stylesheets use a key's `::before` for their own
  effects, so it needs a per-screen visual pass. It is left for the
  next batch.
- The new primitives are not yet adopted by screens: the practice
  builder's own stepper and the forms move to them screen by screen.
