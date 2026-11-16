# 2026-11-15 — drag for times composites the list once the pan is sideways

## 2026-11-15 — The message list is promoted at the horizontal lock (MOT-03)

```text
Design package: none (production audit 2026-11-15, Batch 3 item 2, spec S4.2)
PR/commit:      mot/touch (51e62985f)
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     the hand test on the iPhone (D tier)
```

### Changed

- `screens/messages/use-thread-drag-times.ts`: `.ch-ms-msgs` gets `will-change:
  transform` once the sideways lock is confirmed, before its first move is
  drawn, and loses it when it has settled at rest. A scroll never promotes it.

### Why

- The whole message list was translated per finger move with no layer of its
  own, so each move could repaint it.

### Verification

- `screens/messages/__tests__/thread-drag-times.test.tsx`: no layer for a
  scroll; a layer from the lock through the settle; none once settled.
- Source and jsdom only; no browser or device run.
