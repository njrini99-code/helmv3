# 2026-11-13 — the read drawer says the read's own rounds, and which way is better

## 2026-11-13 — Direction from the registry when a read has none; the read's rounds in the header

```text
Design package: none (coach audit, 13 Nov 2026, §3a read drawer)
PR/commit:      agent/coach-fix-shell
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The comparison's "Higher/Lower is better" uses the read's stored polarity,
  else the metric registry's (`getMetricDirection`). Braeden's "Putts Made
  5-10 ft" is stored with no polarity and drew "Lower is better".
- The drawer's header names the read's own rounds and start (`evidence.span`,
  "37 rounds since Feb 27": the engine's `rounds_n`, else the rounds it names; a
  lifetime read gives no start). It had said "last 10 rounds", the player's
  board count. A read with no count keeps the board's.

### Not a code fault

- The full read's "none of them can be listed" on staging: the Test Copy's
  read names 37 rounds that exist but belong to the original Guilford team's
  Braeden (another player id). The copy did not remap `source_round_ids`; the
  list is correct to leave them out. Belongs with the staging data clean-up (K).
