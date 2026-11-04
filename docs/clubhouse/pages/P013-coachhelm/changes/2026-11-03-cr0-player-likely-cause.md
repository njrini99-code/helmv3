# 2026-11-03 — CoachHelm: a likely cause stays out of the player's Deep dive

## 2026-11-03 — CR0: drivers, reason and cause sentence leave the player's row (S-DIVE.why)

```text
Design package: design-refresh/coachhelm-read/ (CR0; 06 S-DIVE.why, W-READ-1)
PR/commit:      agent/cr0-player-leak (#2444)
Contract IDs:   CH-13982
Actions:        none
Data impact:    none (shaper only; stored insights unchanged)
Held items:     none
```

### Changed

- data/coachhelm-dive-shape.ts: `diagnosisFor` takes the viewer's role and
  returns null for a player when the cause is not an observed sequence, so the
  two arms that make the guess, their counts and the confidence reason never
  reach the client.
- `toChDeepInsight` drops the generator's causal sentences from the player's
  `base.why` when the Why line is not traced for them. The view already left
  them out when drawing; now they leave the payload too.

### Why

- A player saw "Not traced yet" above the numbers behind the guess. The owner's
  call is that an inferred cause is the coach's alone.

### Verification

- coachhelm-dive.test CR0 cases: the player's serialized row has no drivers, cause
  sentence or reason; the coach's row keeps them, base untouched. Two tests
  that pinned the player seeing drivers on a likely cause were changed to pin
  their absence; the observed path now carries their driver assertions.
