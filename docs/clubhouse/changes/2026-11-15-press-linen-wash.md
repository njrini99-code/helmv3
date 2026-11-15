# Shared press — Changelog

## 2026-11-15 — Press and hover: the linen wash, the 50 ms delay in script, a button down on ease-out

```text
Design package: MOTION-AND-VISUAL.md section 3.8 (owner, 15 Nov 2026), with 3.1 and 3.2; production audit 2026-11-15 S3.11 and its MOT- press rows (older; 3.8 wins where they differ)
PR/commit: claude/project-thread-10vtd2 (worker D, press)
Contract IDs: D-64, CH-1606, A12, B6
Actions: none
Data impact: none
Held items: the hover-out beat on rows whose base rule fades at quick (180 ms); the focus ring colour (green-600, spec green-500); the menu item wash (overlays thread)
```

### Changed

- `lib/press.ts`: a finger's press waits 50 ms (was 70) and every press shows for at least the press beat, 110 ms (was 90), so a tap shorter than 50 ms still flashes. The delay lives here only. A button (and now the shared chip, `.ch-pill`) goes to 0.97 over press on ease-out (was the iOS curve) and back over release on the iOS curve, no overshoot. A pressed row, option or menu row (anything that does not scale) runs its background to the wash over press on ease-out and fades it back over release (280 ms) on the iOS curve, from wherever it had got to; a CSS transition the mark starts on the background is cancelled so the tween is the only one. It runs under Reduce Motion (a colour, not a movement) and flips with Animations off.
- `styles/tokens.css`: `--ch-sel`, the wash, beside `--ch-press-wash`: `var(--ch-bg-selected, #ebe4d2)` by day and `var(--ch-bg-selected, #2c322d)` at night, so the selected linen has one value (the fallbacks go once the ivory thread's `--ch-bg-selected` lands). `--ch-dur-press-delay` is deleted (3.2).
- Every Clubhouse stylesheet but the overlay ones: the 54 `transition-delay: var(--ch-dur-press-delay)` uses and three CoachHelm file-card press delays are gone (lib/press.ts marks the row after 50 ms instead). Every `[data-ch-pressed]` and `:active` rule that drew the green row tint (`--ch-ledger-row-press`) or an ink wash (`--ch-press-wash`, `--ch-press-well`, `--ch-bg-hover`, `--ch-bg-subtle`, literal ink and green mixes on rows) now draws `var(--ch-sel)`: 249 declarations in 34 stylesheets. Shared rows: `.ch-lgr__row` and `.ch-group__row` (`styles/ui.css`), the segmented option and the date and time field's days and rows (`styles/controls.css`).
- Desk hover: the row and nav-list hover rules that drew `--ch-ledger-row-hover` (or an ink wash) draw the wash at once (`transition-duration: 0s`), 42 declarations in 21 stylesheets; they fade out on the row's own background beat, 110 ms on the shared ledger row.
- Tests: `lib/__tests__/press-wash.test.tsx` (new, fake timers: the 50 ms delay, the 110 ms flash of a short tap, a move and a cancel never pressing, the wash in and out beats, Reduce Motion and Animations off, a button never washing). Pins updated with a 3.8 note in `motion.test.tsx`, `press-delay.test.tsx`, `press-controller.test.tsx`, `shell-reach-css.test.ts`, `rail-announcements-row.test.ts`; `dark-ink-guard.test.ts` counts `--ch-sel` among the tints that go dark at night.

### Why

- 3.8 replaces S3's "opacity .7 on rows" and the green row tint with Apple's own row highlight: opacity on ivory reads as disabled, and the wash reads as selected. 3.2 moves the press delay out of CSS so a scroll that starts on a row never presses it.

### Verification

- Unit (vitest): press-wash, press-delay, press-controller, motion, motion-gate, motion-vocabulary, motion-durations-pinned, motion-physics, pressed-sweep, selected-state, dark-ink-guard, shell-reach-css, focus-ring-css and the page tests that read pressed CSS. Engine tier: none run in a browser here; W (Playwright WebKit) for the wash colour and D (a real iPhone) for the feel of the 50 ms delay are owed.
- Press to see it: Settings (a row), the More sheet's rows, a Ledger row on Stats, Messages' inbox rows, the date field's days, a segmented option; on a desk, hover a Roster row or a Calendar agenda row.
