# P013 CoachHelm — 2026-11-15

## 2026-11-15 — Practice tells a failed read from a plan that is gone (GAP-S-03, GAP-S-07, GAP-S-16, GAP-S-21, GAP-S-28, GAP-S-37)

```text
Design package: none (Nov 15 gap pass, GAP-PASS-FINDINGS.md)
PR/commit:      claude/project-thread-pryzf0
Contract IDs:   130691 (CH-13286)
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `src/clubhouse/routes/practice.tsx`, `data/practice-plan.ts` and
  `data/practice-home.ts`:
  - A plan, drill or library read that fails draws "{Plan} didn’t load" (the
    danger page state with Try again).
  - Only a read that answered with no row is "This plan isn’t here"
    (`ClubhouseNotFound`, back to Practice).
  - A malformed id goes straight to not-found, without a query (GAP-S-21).
- Parts that fail on their own say so where they go (CH-13286):
  - The team's plan format, on a plan: "Your plan format didn’t load", and the
    plan is shown in the standard format for now.
  - On Plan format (`screens/coachhelm/plan/format/PlanFormat.tsx`): "Your
    format didn’t load". Use this format waits, and the published count is
    left out rather than shown as 0.
  - A picked template, in New plan (`NewPlanSheet.tsx`): "Your template didn’t
    load".
  - Part of the drill bank, in the builder: "Some drills didn’t load".
- `practice/format/loading.tsx` draws a Plan format-shaped skeleton
  (`PlanFormatSkeleton`) instead of a generic one (GAP-S-16).

### Why

- GAP-S-03 (P0): a plan whose read failed was drawn as deleted.
- GAP-S-07 and GAP-S-37: a failed format or template read silently became the
  standard format or a blank start.

### Verification

- `src/clubhouse/data/__tests__/practice-plan-failed-reads.test.ts` passes.
