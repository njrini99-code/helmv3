# 2026-10-23 — Phone render fixes (Clubhouse A+ WP-6)

## 2026-10-23 — The switcher's chevron never crosses its name (A22)

```text
Design package: none (Clubhouse A+ handoff, section 5, A22)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The section switcher forgets a name's width while the name is not drawn
  (its bar hidden behind a page's own bar, or no font yet). The chevron and
  dot land where they belong when it shows again, instead of gliding in from
  the left edge across the first letters. A real width change still glides.

### Why

- Coming back to a screen that uses the shell's title replayed a 0.46s slide
  from 0 over the title.

### Verification

- New `section-switch-tail.test.tsx`: widths 64, 0, 64, then 40 glide once,
  from +24px; it fails without the fix.

## 2026-10-23 — Only characters the font draws (A23)

```text
Design package: none (Clubhouse A+ handoff, section 5, A23)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- "two-putting" and "18-hole" use a plain hyphen in a no-wrap span (new
  `.ch-nowrap`); Instrument Sans has no non-breaking hyphen.
- Qualifier moves draw chevron icons, not "▲"/"▼". "View insights" and
  "Deep dive" draw an arrow icon. The Track's Left and Right choices are
  words. The approach ladder says "26 ft", not "26′". A clipped gauge end
  says ">+3" or "<−3", not "≥".
- A failed sign-out says "Couldn’t sign you out", "Check your connection and
  try again.", with Try again, the same in Settings and the More sheet.
- Straight apostrophes in the shell's toasts and offline banner are curly.
- Kept on purpose: the "→" grammar inside a shot's line and a CoachHelm path
  (strings also read aloud; Apple's system font draws it), and the ⌘ and ↵
  key hints. Splitting the arrow grammar into icons is a later pass.

### Why

- A character outside the latin subset falls back to another font, or shows
  a missing-glyph box.

### Verification

- New `glyph-subset.test.ts`: the allowlist is the served font's own
  character map, with the kept characters named by file; a CSS-wide U+2011
  guard. `copy-apostrophes.test.ts` now covers every screen folder, the shell
  and ui.

## 2026-10-23 — Nothing wraps or clips at 390px (A24)

```text
Design package: none (Clubhouse A+ handoff, section 5, A24)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- Trip card: the place has its own line (two at most) and the dates their
  own; a date or a time keeps its spaces as U+00A0, so "Mon 3 Nov" and
  "12:00 PM" never break inside.
- Hub strip on the phone: a 28px fade and snap to a figure. The phone tabs
  scroll sideways 16px apart instead of packing at 4px, and a tab's figure
  sits 4px after its name.
- Rounds: the season's Putts column is wider on the phone, so its line is
  two lines, not three.
- Round card on the phone: short leg labels ("Off tee", "Around") with the
  full names for a screen reader, and the values on one baseline.

### Why

- "Documents Tasks" read as one word, "Mon ·" and "12:00 PM" split, and the
  SG values sat at different heights.

### Verification

- Render tests in `hub-redesign.test.tsx` and `round-card.test.tsx`, and
  `render-must-fixes-css.test.ts`. WebKit at 390 on `hub-player`, `rounds`
  and `round` (screenshots in the store); the round card's five values sit
  within 1px. Not done: 320px and device checks.

## 2026-10-23 — Render must-fixes (A29)

```text
Design package: none (Clubhouse A+ handoff, section 5, A29)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: Player KPI gauges (owner call)
```

### Changed

- Track, phone: "yards to the pin" takes its own line under the figure,
  clear of the hole drawing's tee disc.
- Text fields: no resize grip on a touch screen; they grow with what is
  typed where WebKit supports `field-sizing`.
- Left alone: the Track's action bar already pads for the home indicator.
  The player's KPI gauges sit in their own row under the captions by the
  Ledger figure-row design (the empty third cell keeps the seams aligned);
  moving them under the values is the owner's call. The desktop "Add focus
  area" wrap, the review chart label and the "+2" tone go to B14.

### Why

- The distance words ran into the disc at 390px; a phone showed a desktop
  grip on the qualifier form.

### Verification

- `render-must-fixes-css.test.ts`. WebKit at 390 on `track`, before and
  after (screenshots in the store).
