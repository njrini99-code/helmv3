# Shared navigation guard — Changelog

## 2026-11-18 — A double tap navigates once, whatever the second tap lands on

```text
Design package: none
PR/commit: agent/clubhouse-motion-fixes
Contract IDs: F-0026 (extended)
Actions: none
Data impact: none
Held items: none
```

### Changed

- `lib/nav-once.ts`: one shared hold for the navigation under way. It starts
  when a same-origin link's click reaches the link (a click a peek hold or a
  swipe row swallowed starts nothing) or when `usePushOnce` pushes, and while it
  holds, every link and button in Clubhouse drops its activation at window
  capture (`preventDefault` and `stopPropagation`, so neither Next's Link nor a
  React `onClick` runs). It ends when the address changes, but not before 350 ms
  from the first tap (the double-tap window) nor while a phone push is still
  sliding (`CH_PUSH_MS`); a navigation that never lands lets go after a second.
  A hash or the page already showing holds nothing. A pushed page's Back stays
  live, so a Back can still reverse a push in flight (`takeRunningPush`).
- `shell/__tests__/nav-once.test.tsx`: the case "another link is not held back"
  encoded the old per-address guard and is replaced on purpose by "another link
  or a button is held back while the first is on its way", plus cases for the
  fast commit, the lapse, a hash, a swallowed click, Back, and a push in code.

### Why

- Clubhouse audit 2026-11-18 (P1): the old guard was per address and let go the
  moment the address changed (about 80 ms after the tap on a prefetched page),
  so the second tap of a double tap landed on the page the first had opened: a
  rounds row's second tap opened the course page, and Home's Message team pushed
  two history entries.

### Verification

- `shell/__tests__/nav-once.test.tsx` (11 cases); the Stats and shell suites
  that push through `usePushOnce` still pass.
