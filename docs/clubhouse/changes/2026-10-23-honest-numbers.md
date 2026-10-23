# 2026-10-23 — Honest numbers (Clubhouse A+ WP-1)

Phase 1 of the Clubhouse A+ handoff, work package 1: the figures, tones and
trend words agree with the data they are drawn from.

## 2026-10-23 — Zero is no change (A2)

```text
Design package: none (Clubhouse A+ handoff, section 5, A2)
PR/commit: branch agent/clubhouse-aplus-wp1
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- Every gain or loss tone comes from `changeTone` in `lib/format.ts`, asked
  with the digits the screen prints. A change that shows as 0.0 is neutral ink
  with no arrow on Stats (team and player, desktop and phone), Roster, the
  round review and Home. About 30 sites tested `>= 0` themselves and painted
  "+0.0" green.
- Two small forms beside it: `changeInk` (the `ch-gain` / `ch-loss` text
  classes) and `changeVerdict` (`good` / `bad` for a figure's `tone` prop).
- `sgTint` takes the digits too; a zero cell is clear, unlike a no-data cell.
- The team tape's par dial and the figure gauge use the same zero test as the
  "E" they print, so the word and the tone can't disagree near zero.

### Why

- A user read a gain where nothing changed (F-54 already said so; most
  screens bypassed it).

### Verification

- `lib/__tests__/change-tone-zero.test.ts`: values that round to zero are
  untoned in all three forms; `sgTint` keeps zero apart from no data.
- `__tests__/no-raw-sign-tone.test.ts`: no screen, shell or ui file tests a
  sign to pick a gain or loss tone (bar geometry may still test the sign).
