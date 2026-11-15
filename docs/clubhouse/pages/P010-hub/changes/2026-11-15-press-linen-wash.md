# P010 — Changelog

## 2026-11-15 — Press: the linen wash and no CSS press delay (MOTION-AND-VISUAL 3.8)

```text
Design package: MOTION-AND-VISUAL.md section 3.8 (owner, 15 Nov 2026); shared entry docs/clubhouse/changes/2026-11-15-press-linen-wash.md
PR/commit: claude/project-thread-10vtd2 (worker D, press)
Contract IDs: D-64, CH-1606
Actions: none
Data impact: none
Held items: none
```

### Changed

- `styles/hub.css`: 1 pressed rule(s) lose their CSS press delay; 6 pressed rule(s) draw the wash; 3 desk hover rule(s) draw the wash at once.
- A pressed row, option or menu row on this page now takes the one linen wash (`--ch-sel`) in place of the green row tint or an ink wash: in over 110 ms, out over 280 ms on the iOS curve (`lib/press.ts`), after the 50 ms touch delay, and a tap shorter than that still flashes it for 110 ms. On a desk, a row's hover is the same wash, at once.

### Why

- 3.8: Apple's own row highlight. Opacity or a green tint on ivory reads as disabled or chosen; the wash reads as selected. The press delay lives in `lib/press.ts` (3.2), so a scroll that starts on a row never presses it.

### Verification

- Unit: pressed-sweep, selected-state, dark-ink-guard, motion-gate (counts only fall) and the shared press tests. Engine tier: no browser run here; W for the colour and D (a real iPhone) for the feel are owed.
- Press to see it: Team Hub on the phone: press a feed row, a file row, an RSVP key, Read by or a pick chip; on a desk, hover a file row, an RSVP list row or a ledger row.
