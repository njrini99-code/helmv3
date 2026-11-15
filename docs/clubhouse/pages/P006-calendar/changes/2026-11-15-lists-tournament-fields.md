# P006 — Changelog

## 2026-11-15 — the tournament fields are still on first paint

```text
Design package: none (MOTION-AND-VISUAL 3.5)
PR/commit:      worker E2 "lists": b5e6d0c62
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `editor-tournament.tsx`: an editor that opens on a tournament shows its fields
  at once (the mount fade and its 50 ms delay are deleted); turning tracking on
  still fades them in over 180 ms.

### Why

- Spec 3.5: first paint is still.

### Verification

- `__tests__/calendar.test.tsx` and
  `tournaments/__tests__/link-rounds-reachable.test.tsx` pass. jsdom only.
