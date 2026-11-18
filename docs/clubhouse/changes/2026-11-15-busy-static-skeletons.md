# Shared loading — Changelog

## 2026-11-15 — One wait for every load: 150 ms delay, 300 ms static skeleton

```text
Design package: MOTION-AND-VISUAL.md sections 3.9 (Loading) and 3.12 (the shimmer and pulse on skeletons); production audit 2026-11-15 S4.4, MOT-01, A-13, H393-063, P1-56 (GAP-H-06), P1-57 (GAP-H-07)
PR/commit: claude/project-thread-10vtd2 (worker B): d1886d5bf, 277108145, f0705313b, ef4a75307
Contract IDs: D-64
Actions: none
Data impact: none
Held items: --ch-dur-shimmer stays, retiring, until the CoachHelm wheel's turn, the thread's step dot and the Classes scan are retokened (worker C)
```

### Changed

- `lib/use-busy.ts` (new): `useBusy(pending)` returns `idle`, `skeleton` or
  `ready`. Nothing is drawn for the first 150 ms (`CH_BUSY.delay`); a skeleton
  once shown stays at least 300 ms (`CH_BUSY.min`); a request that ends within
  150 ms never shows one. `useBusyReveal` fades the content in over the quick
  beat (180 ms, opacity only) when it replaces a skeleton, and not at all with
  Animations off.
- Skeletons are static and shaped like the content. Deleted: the shared sheen
  (`.ch-skel::before`, `ch-shimmer-x`), the desktop ledger breathe
  (`ch-skel-breathe`), Stats' sheen and skeleton fade (`ch-shs-sheen`,
  `ch-shs-skelin`, `.ch-shs-is-loading`), the Messages pulses (`ch-inb-pulse`,
  `ch-msv-skel`), CoachHelm Your week's sheen (`ch-hf-shim`) and the Team
  board's (`ch-htb-shim`, H393-063), with their Reduce Motion and Animations off
  overrides. `--ch-dur-skeleton` is deleted.
- A route skeleton's frame (bar, title, strip) is in the first frame; its grey
  blocks wait the 150 ms busy delay (`ch-busy-wait`, a 0 s animation delayed by
  `--ch-dur-busy-delay`, `styles/shell.css`), so a page that lands sooner swaps
  with no grey at all. A skeleton chained from the route's own, or one shown by
  `useBusy`, does not wait again.
- In-page waits use the full contract: the Stats window change, every CoachHelm
  view switch (Board, Team, Ask, Your week, Standing, Deep dive) and Ask's chat
  switch keep `aria-busy` from the tap (taps stop at once) and dim through
  `data-ch-busy='skeleton'` only after the delay, held 300 ms.
- CoachHelm Your week (P1-56): spreads the switch's settle and gets the shared
  busy rule on its cards. The player's Ask tab (P1-57) goes through
  `useViewSwitch` on Your week, the views and Ask itself, so it takes the
  selection on the tap and the page dims as for any view.

Counts in the files touched (motion gate): `@keyframes` 180 to 173 in all
Clubhouse CSS, `infinite` loops 38 to 31, retiring-token uses down 8.

Screens whose loading changed: every route skeleton (static blocks after 150
ms), Stats team and player (window change), Messages inbox and thread skeletons,
CoachHelm Board, Team, Ask, Your week, Standing and Deep dive (switch dim).

### Why

- 3.9: a wait shorter than 150 ms should show nothing, and a skeleton should not
  flash. 3.12 deletes the shimmer and the pulse: the working dots are the one
  loop. The audit found a blank or a flash on in-page waits and shimmer loops on
  skeletons (A-13, H393-063), and Your week and the player's Ask tab outside the
  switch (P1-56, P1-57).

### Verification

- Unit (vitest): use-busy (11, fake timers), states, audit-a11y-motion,
  stats-busy-delay, stats-player, stats-team, view-switch-boundary,
  coachhelm-ask, coachhelm-views, coachhelm, sub-tabs, player-file, team-sweep,
  chips-tabs, and motion-gate, motion-vocabulary, motion-durations-pinned,
  motion-physics. `tsgo --noEmit` clean.
- Not run: browser lanes, `next build`. Engine tier for any feel claim: D (real
  iPhone) still owed.
