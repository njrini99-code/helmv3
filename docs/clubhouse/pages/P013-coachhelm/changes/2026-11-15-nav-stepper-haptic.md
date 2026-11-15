# P013 — Changelog

## 2026-11-15 — The plan block sheet's length stepper ticks the selection haptic

```text
Design package: MOTION-AND-VISUAL.md section 3.10 (owner, 15 Nov 2026)
PR/commit: claude/project-thread-10vtd2 (worker E1, nav)
Contract IDs: D-70
Actions: none
Data impact: none
Held items: none
```

### Changed

- `screens/coachhelm/plan/PlanCard.tsx`: Shorter and Longer in a plan block's sheet each fire `haptic('select')` through `lib/haptics.ts`, as every other stepper does (the practice builder's `Stepper` already did). Nothing visible changes.

### Why

- 3.10 lists "Stepper change: select". This was the one Clubhouse stepper that was silent.

### Verification

- Unit: `screens/coachhelm/plan/__tests__/plan-card-stepper-haptic.test.tsx` (one select per step), `__tests__/haptic-grammar.test.ts`. The tick itself is native only; a device check (D) is owed with the rest of 3.10.
