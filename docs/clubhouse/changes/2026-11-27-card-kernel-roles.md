## 2026-11-27

- **Card kernel** (`ui/Card.tsx`, `styles/card.css`):
  - The kernel's type reads the nine roles only. The eyebrow, meta, unit and footer read the footnote role. The default metric figure reads the title role (22/600) in place of the 28px step. A pressable card's button reset reads the body role. Tabular figures come from `.ch-num`, with no local `font-variant-numeric`.
  - The bottom gutter goes only under the kernel's own parts, so a page's content moved onto a card keeps its own padding.
  - `as` draws a card that is not a control as an `li`, `article` or `div`, and `hidden` marks a page's own skeleton card. The pass-through props from the Rounds and Messages rollout (`id`, `labelledBy`, `live`, `role`, `busy`, `code`) are carried here as well. A loading card draws as its `as` element, a section by default.
- **Sheet stops** (`lib/sheet-drag.ts`): the pinned footer is found before the settle callback that clears it. This fixes an unhandled "before initialization" error in tests. A sheet's release transition rides the iOS curve, `--ch-ease-ios`, replacing a retired token.
