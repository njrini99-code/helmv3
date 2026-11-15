# P015 — Changelog

## 2026-11-15 — The handicap steppers tick the selection haptic

```text
Design package: MOTION-AND-VISUAL.md section 3.10 (owner, 15 Nov 2026)
PR/commit: claude/project-thread-10vtd2 (worker E1, nav)
Contract IDs: D-70
Actions: none
Data impact: none
Held items: none
```

### Changed

- `screens/onboard/Steps.tsx` (Your game): Lower and Higher on the handicap fire `haptic('select')` once a step through `lib/haptics.ts`; a press at either end of the scale, which changes nothing, stays silent. Nothing visible changes.

### Why

- 3.10 lists "Stepper change: select".

### Verification

- Unit: `__tests__/onboard.test.tsx` ("the handicap steppers tick the selection haptic…"), `__tests__/haptic-grammar.test.ts`. The tick itself is native only; a device check (D) is owed with the rest of 3.10.
