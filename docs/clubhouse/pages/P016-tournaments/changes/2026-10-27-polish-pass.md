# 2026-10-27 — Polish pass: Tournaments

## 2026-10-27 — The trend's lines keep their margins

```text
Design package: none (production polish pass);
                phone board design/handoff/tour-m.jsx
PR/commit:      agent/clubhouse-polish
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none (golf_tournaments_v1 stays off in production;
                see below)
```

### Changed

- The trend's subtitle, key and note had their margins zeroed by `.ch-root p`
  (base.css outranks a one-class rule), so the note touched the bar labels and the
  key touched the axis. The rules now carry two classes
  (`styles/tournaments-review.css`), and the note stands 12px under the key.
- The phone back, the History toggles and the trend key's styling this pass first
  carried are dropped: the visual pass (#2395) fixed the same spots.

### Why

- A rule the base reset silently outranks does nothing.

### Verification

- All Tournaments tests pass. WebKit at 390 and 1280.

### Not changed (owner)

- Five views are still the base's placeholders ("… isn't built yet"): Lineup, Link
  rounds, Live round, Edit event and the player's view. "Build lineup", "Edit
  lineup" and "Follow live" lead to them. `golf_tournaments_v1` is off in
  production; it should stay off until those views are built.
