# P013 — Changelog

## 2026-11-15 — the Ask question is an insert; burst streaming has no fade

```text
Design package: none (MOTION-AND-VISUAL 3.5, 3.12)
PR/commit:      worker E2 "lists": 8b7f1e5a9, b755e0785
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     D-tier check of a sent question owed
```

### Changed

- `chat/Thread.tsx`: a sent question rises 8px with opacity over 260 ms on the
  iOS curve, and the column glides to make room over the same beat; the send
  spring is gone. `ask-flight.ts` uses `settle` in place of `pop` and `lift`.
- `chat/Prose.tsx`: smooth streaming (`reveal.ts`) keeps its per-word release
  and fade; burst mode paints each flush with no fade (spec 3.5: the per-burst
  fade was decoration). There is no wait light to turn off.

### Why

- Spec 3.5 (insert; CoachHelm answer) and 3.12 (retired springs).

### Verification

- `chat/__tests__/prose-lead.test.tsx` (three new streaming cases),
  `reveal.test.ts`, `ask-read-previews`, `thread-cards` pass. jsdom only.
