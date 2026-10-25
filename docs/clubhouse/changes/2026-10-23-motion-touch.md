# 2026-10-23 — Motion and touch (Clubhouse A+ WP-3)

## 2026-10-23 — A dialog's dim fades with its panel and follows a drag (A9)

```text
Design package: none (Clubhouse A+ handoff, section 5, A9)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- Every `::backdrop` fades by `opacity: var(--ch-scrim-a)` with a transition,
  never the `ch-fade` keyframe. `useDialogLifetime` holds it at 0 while the
  panel waits to rise, fades it in as the panel rises, clears it over the
  exit's own duration and curve, and turns it round from where it stood when
  the dialog is reopened mid-exit.
- `useSheetDrag` sets it from how far the sheet is out (`chScrimAt`): half way
  down is half as dark, and a spring back brings it back on the panel's
  spring.
- The `[data-closing]::backdrop … reverse` rule is gone. Reduced motion keeps
  its 1ms floor.

### Why

- Closing a dialog dropped the dim in one frame (a finished animation switched
  to reverse jumps to its end), and a dragged sheet left it fully dark.

### Verification

- New `scrim-follows-sheet.test.tsx`: no `::backdrop` animates or reverses,
  every fading one reads `--ch-scrim-a`, and a 400px sheet dragged 100px
  leaves it at 0.75.
- `audit-a11y-motion.test.tsx`: the scrim is 0 while the rise is held and 1
  after.

## 2026-10-23 — The Stats busy dim holds off 150ms (A11)

```text
Design package: none (Clubhouse A+ handoff, section 5, A11)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `.ch-st[aria-busy='true']` and the phone's figures dim only after `--ch-dur-
  busy-delay` (150ms); leaving busy clears at once. The token is pinned in
  `motion-durations-pinned.test.ts` and named in the rules and the checklist.

### Why

- A fast window switch flickered the whole page.

### Verification

- New `stats-busy-delay.test.ts`.

## 2026-10-23 — A finger's press waits before a button shrinks (A12)

```text
Design package: none (Clubhouse A+ handoff, section 5, A12)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `useChPress`: a touch press shrinks the button after 70ms; a move past 10px
  or a cancel before then never shrinks it; a tap that lifts sooner still
  shows its press for 90ms. Mouse and pen press at once.

### Why

- A scroll that started on a button shrank it until the browser cancelled the
  press.

### Verification

- New `lib/__tests__/press-delay.test.tsx`.

## 2026-10-23 — Held pages dropped after a round is written (A21)

```text
Design package: none (Clubhouse A+ handoff, section 5, A21)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `invalidatePrefetchTabs()` forgets the section pages fetched ahead and
  shown. It runs after a round is submitted, discarded, or its type changed.
  The round submit also revalidates `/golf/dashboard/roster`.

### Why

- Rounds, Stats or Roster could serve a page held from before the submit for
  up to five minutes, without the new round.

### Verification

- New `shell/__tests__/prefetch-invalidate.test.ts`. `npm run build` was not
  run for the one-line change to the `round-submit.ts` server action.

## 2026-10-23 — A row's page is fetched on touch-down (A13)

```text
Design package: none (Clubhouse A+ handoff, section 5, A13)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `usePressPrefetch` fetches a row's push target whole as the finger lands
  (`prefetchOnPress`), once per fresh window, and not when saving data or
  offline. Wired on the Rounds library cards, the Stats player list, qualifier
  rows and Roster's View insights. Roster, Messages and Calendar rows open in
  place (a peek or a thread), so they have no page to fetch.

### Why

- Opening a row stopped at the loading boundary, so a skeleton slid in first.

### Verification

- New `shell/__tests__/prefetch-on-press.test.tsx`.
