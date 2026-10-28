# 2026-10-27 — Ask: the visual is styled, and stands in only for what it drew

## 2026-10-27 — Ask: visual artifact review must-fixes (PR 2379)

```text
Design package: design/handoff v3 (unchanged)
PR/commit:      branch fix/clubhouse-coach-must-fixes
Contract IDs:   CH-13853 (unchanged)
Actions:        none (show_visual is display only)
Data impact:    none
Held items:     none
```

### Changed

- The `.ch-th-va*` rules are back in `styles/coachhelm-thread.css`, on the
  current Clubhouse tokens. A token pass (6a51a084d) had removed the whole
  block, so the strokes gained visual drew as bare buttons and its bars (an
  inline width on an unstyled span) drew nothing. Every class the component
  uses has a rule again: the subtle plate with a hairline, 44px rows on the
  selected token with the shared focus ring, a 16px inset track, bars in the
  chart gain and loss inks, and one hairline zero line through every row (the
  `__axis` span). Only a selection moves anything (opacity, base beat).
- `visuals/compile.ts` refuses a title with a digit in it (`figure_in_text`),
  as it already dropped notes with one: the title is drawn as written, and
  every figure on screen comes from the reads.
- An artifact now names only the reads it draws in full (a leg or the total,
  and nothing else in the read). A read named alongside, such as a team rounds
  read, keeps its evidence block in the answer instead of being hidden behind a
  chart that never drew it.
- The evidence values (`.ch-th-bar__val`, `.ch-th-reads__v`) and the visual's
  value (`.ch-th-va__val`) keep tabular figures. Each rule sets the `font`
  shorthand, which resets the numeric variant, so the line stays with it.
- Dimmed bars sit at 0.75 opacity, which keeps every ink at 3:1 on the track.
- On a phone a long leg name wraps instead of clipping. With forced colours on,
  the plate, the tracks, the bars and the selected row stay drawn.
- A digit in any script (`\p{N}`, such as a full-width digit or a fraction)
  counts as a figure. A refused title may be retried once in words; any other
  refusal is answered in words.

### Why

- Review must-fixes on PR 2379: the visual had no styles, model text could put
  a figure on screen through the title, and evidence the chart never drew was
  hidden.

### Verification

- `coachhelm-visual-artifact-css.test.ts` pins every class the component uses,
  the bar's geometry and inks, the opacity-only motion and token-only values;
  the Clubhouse CSS ratchets pass. `compile.test.ts` covers the title refusal
  and the drawn-reads rule, including the thread keeping a team rounds block.
- No screenshots were taken in this change.
