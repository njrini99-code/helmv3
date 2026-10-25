# 2026-10-23 — The press and the keys (Clubhouse A+ WP-14)

## 2026-10-23 — One press controller, a pressed look everywhere (B6)

```text
Design package: none (Clubhouse A+ handoff, section 4.18, B6)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: a device pass at 60Hz (every quick tap flashes, no scroll does)
```

### Changed

- `lib/press.ts` is one controller. The control under the finger (a
  button, link, `[role=button]` or `[data-ch-pressable]`) carries
  `data-ch-pressed`: a finger's press shows after 70ms, a tap that lifts
  sooner still shows it, every press shows it for at least 90ms, and a
  move past 10px or a cancel drops it. It runs with motion off too (a
  state, not a movement); the button scale (A12) folds into it.
- Every pressed style in the stylesheets reads `:is(:active,
  [data-ch-pressed])` (186 selectors; the same specificity), so quick taps
  on glass show.
- Track's choice tiles and rows, Hub's picks and chips and Stats' filter
  chips gain a pressed look: the row-press tint over their own fill.

### Why

- Taps of 40 to 80ms often ended before the 50ms row delay, and these
  controls had no pressed look at all.

### Verification

- New `press-controller.test.tsx` (a 40ms tap shows for 90ms, a 20px move
  never sets it, cancel drops it, motion off still marks) and
  `pressed-sweep.test.ts`. WebKit: a held Track key carries the attribute
  and drops it on release.

## 2026-10-23 — The danger key (CONS-1)

```text
Design package: none (Clubhouse A+ handoff, section 4.18, CONS-1)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `.ch-btn--danger` draws from tokens (`--ch-danger-fill-top`, `-bottom`,
  `-ring`, `-hover`, `-press`, `-ink`), lightens under the pointer and
  deepens while pressed; at night its ring is a light coral.
- A danger Button warns as it is pressed, by default. Two keys that
  silenced it with no reason (Staff, a Rounds entry discard) now warn.
  Seven confirm keys stay silent and say why: their warning came with the
  question (D-70), so a second would double it.

### Why

- The red key was literals with no hover or pressed state, and ten keys
  turned its haptic off with no reason given.

### Verification

- `controls-consistency.test.tsx` (warns by default; no hex in its rules)
  and `buttons-ast.test.ts` (a silenced danger key says why).

## 2026-10-23 — Haptic grammar, busy keys, one Button (CONS-25, CONS-3, CONS-2)

```text
Design package: none (Clubhouse A+ handoff, section 4.18, CONS-2, CONS-3,
  CONS-25)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: 49 raw ch-btn sites outside rounds/track (ratcheted); sites
  that need an aria-label, ref or 16px icon on Button wait for it
```

### Changed

- CONS-25: `commit` is held for a sheet settling, a shot logged and
  pull-to-refresh. A retry is a press; finishing onboarding and the
  welcome's Continue are a success.
- CONS-3: 24 keys whose label turns to "…ing…" say `busy`, so they keep
  their light and width, set aria-busy and take no second press. A key
  that shared a pending flag with its pair keeps it as `disabled`.
- CONS-2: rounds/track's keys move onto `ui/Button` (19 of 26; the rest
  need a prop Button does not take yet). A danger key's hand-fired warning
  went with it (Button warns).

### Why

- The same states were drawn three ways, and a commit buzz meant six
  different things.

### Verification

- New `haptic-grammar.test.ts`, `button-busy.test.ts` (TypeScript AST) and
  `buttons.test.ts` (per-file ratchet). The full Clubhouse and static
  suites pass (5,771).
