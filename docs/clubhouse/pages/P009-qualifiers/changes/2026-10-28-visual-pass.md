# 2026-10-28 — Visual pass: the board's lines, the move mark and one rank rule

## 2026-10-28 — Visual pass: the board's lines, the move mark and one rank rule

```text
Design package: visual-pass-2026-10-28 (RUBRIC.md,
                premium-research/team-tabs.md, components-shell.md)
PR/commit:      visual-pass-2026-10-28
Contract IDs:   none new
Actions:        none
Data impact:    none (CSS and one header string)
Held items:     the inline move mark and the color-mix() dashes want a look in
                Safari on an iPhone
```

### Changed

- The move mark (SVG chevron and count) no longer wraps the chevron above the
  number on the list's live card and the phone board: the mark is one inline,
  no-wrap group.
- The board's top-score line is champagne (brass label, brass dashes at 75%);
  the travel cut stays quiet ink. On the green live card the line uses
  champagne-300 instead of mint.
- The header and the caption state the same rule: "Complete cards first, then
  total to par" (the header said "Full cards first").
- Qualifier pills are 30px, the shared pill's desktop height (36 on the phone).
- Board numbers, names, plates, section titles and round sums scale with iPhone
  Text Size (`calc(N * var(--ch-type-k))` instead of raw px). Fixed-size coins
  and plates keep their boxes.
- The phone board's Play link sits 4px under the row.

### Verification

- stylelint (clubhouse config) and eslint on the touched files: exit 0.
- `scripts/test.sh` with the page's tests: qualifier suites pass.
- Before/after: /home/claude/vp/before, before-states-G2 and after-G2
  (qualifiers, qualifier at 393 and 1280, light and dark).
