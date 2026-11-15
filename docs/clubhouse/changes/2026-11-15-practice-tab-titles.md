# 2026-11-15 — Practice (shared route)

## 2026-11-15 — A plan's and a drill's tab say their name

```text
Design package: none (production audit 2026-11-15, GAP-R-08)
PR/commit:      claude/project-thread-7ygzj3 (the follow-up to #2538)
Contract IDs:   none
Actions:        none
Data impact:    none (reads only; no new query: the page's own read is shared with its title)
Held items:     none
```

### Changed

- The plan page, the drill page and the print page name the tab, the history and the app switcher after the plan or
  drill ("Tuesday short game", "Print · Tuesday short game", "Ladder putting"), as each page's heading already does,
  instead of "Practice plan" or "Drill" on every one (`generateMetadata` in the three `page.tsx` files,
  `practicePlanTitle` and `practiceDrillTitle` in `src/clubhouse/routes/practice.tsx`).
- The plan and drill loaders are wrapped in React `cache()`, so the title and the page share one read per request.
- A plan or drill that can't be read keeps the generic name; the page says why, as before. A player only ever reads
  their own plan, through the same loader the page uses.

### Why

- GAP-R-08: three open plans showed three tabs all called "Practice plan".

### Verification

- `src/clubhouse/routes/__tests__/practice-titles.test.ts` (coach, player, fallbacks, drill, and that each page uses
  the shared loader), with `practice-unavailable.test.ts`.
