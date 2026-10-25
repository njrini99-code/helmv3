# 2026-10-25 — Live rounds (P-6): the qualifier page stops re-reading on every autosave

## 2026-10-25 — A five-second gap, and the push channel (slices 0 and 3)

```text
Design package: build plan P-6 section 8.14 and 8.1 (handoff 4.34.6)
PR/commit:      claude/clubhouse-live-rounds (slices 0 and 3)
Contract IDs:   none new
Actions:        none
Data impact:    none to the qualifier loader. With held migration 20261025050100 applied the page also joins the team's
                coach topic (golf-live:coach:<team>) as the signed-in coach; nothing else changes
Held items:     docs/clubhouse/held/data/live-rounds-realtime.md
```

### Changed

- `useLiveStandings` (qualifiers/live.ts): `recompute_golf_round_totals` updates `golf_rounds` about 37 times per autosave,
  so every watching page re-read on every autosave of every player. A change now re-reads the page only when the round's
  `updated_at` or status is new, and two re-reads are never closer than five seconds (the 800 ms debounce stays).
- With the push migration applied, the page joins the coach topic as well; a message about this qualifier re-reads the page
  through the same gate, and while that channel is up the `golf_rounds` feed no longer re-reads the page (it keeps the Live
  label honest). If the channel is not there or drops, the `golf_rounds` feed does the work as before.

### Why

- Without it every autosave on a qualifier day refreshes every coach's page.

### Verification

- `screens/qualifiers/__tests__/live-refresh-gate.test.ts`, `screens/qualifiers/__tests__/live-push.test.tsx` and the
  existing `qualifiers.test.tsx` (90304). The live standings still come from the loader.
