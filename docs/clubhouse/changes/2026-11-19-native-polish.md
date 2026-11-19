# Clubhouse shared — Changelog

## 2026-11-19 — Inert push, shared figure, desk history fade, carry, peek by hold

```text
Design package: none
PR/commit: agent/clubhouse-native-polish
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `lib/nav-motion.ts`: a tapped push and a Back's pop mark the incoming page
  `data-ch-arriving` for their 520 ms; the mark comes off when the push ends,
  a Back takes it or a finger grabs it (E-2). The desk's Back and Forward
  crossfade on the view-transition tokens, 120 ms out and 180 ms in, 180 ms
  each under Reduce Motion, none with Animations off (E-8, `playDeskHistory`).
- `lib/share-morph.ts` (new): the shared figure of a push. Two ghosts
  crossfade from the row's figure to the target's resting place on the push's
  own timing; any interruption ends it at once; with no target there is no
  flight (E-6). The motion rules and `motion-durations-pinned.test.ts` name
  it.
- `lib/carry.ts` (new): what a row shows, carried to the page it opens, for
  that page's skeleton (E-1).
- `lib/nav-once.ts`: `usePushOnce` calls the router with no second argument
  when no options are given.
- `ui/Peek.tsx`: the phone layout never opens the desk hover card; a hold
  still opens the press peek (E-4).

### Why

- Audit 2026-11-19 (Clubhouse overnight audit), batch 2: native and premium
  polish.

### Verification

- `lib/__tests__/share-morph.test.ts`,
  `lib/__tests__/desk-history-fade.test.ts`,
  `lib/__tests__/grab-push.test.ts`, `ui/__tests__/peek-fit.test.tsx`,
  `__tests__/motion-durations-pinned.test.ts`.
- `npm run clubhouse:check`. WebKit before and after numbers are in the PR body.
