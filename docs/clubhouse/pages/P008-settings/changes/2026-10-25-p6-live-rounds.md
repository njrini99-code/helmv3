# 2026-10-25 — Live rounds (P-6): the player's "Live rounds" group

## 2026-10-25 — Defaults for practice and qualifier rounds (slice 2)

```text
Design package: build plan P-6 section 4.6 (Settings)
PR/commit:      claude/clubhouse-live-rounds (slice 2)
Contract IDs:   CH-16661, CH-16662, CH-16664 (docs/clubhouse/catalog/live.md)
Actions:        setLivePrefs (src/app/golf/actions/round-live.ts)
Data impact:    one read of the player's own golf_round_live_prefs row, and an upsert of that row; both only once held
                migration 20261025050000 is applied. The settings loader and its writes are unchanged.
Held items:     docs/clubhouse/held/data/live-rounds.md
```

### Changed

- Golf profile (player), desktop and phone: a "Live rounds" group with two rows. Practice rounds is a menu of Not live,
  Coaches and Coaches and team (the default a new practice round starts at). Qualifier rounds reads Coaches, with the
  reason, because a qualifier is always shown to coaches. A refusal puts the menu back and toasts CH-16664.
- The group is not drawn until the live table exists.

### Why

- The sharing choice is made once and remembered, and round setup can still change it for one round.

### Verification

- `screens/settings/__tests__/LiveRounds.test.tsx`. No screenshots were captured (no browser was run here).
