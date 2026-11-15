# 2026-11-15 — qualifiers

## 2026-11-15 — Each Qualifiers address loads only its own screen, and the loaders start their reads earlier (MAC-11)

```text
Design package: none (production audit 2026-11-15, MAC-11, Batch 3 item 9)
PR/commit:      mot/load
Contract IDs:   none changed
Actions:        none
Data impact:    none (the same queries with the same filters and columns; only when they start changes)
Held items:     the after-build size per address and a time-to-first-byte trace (no build was run in this slice)
```

### Changed

- `routes/qualifiers.tsx` imports the four client screens (list, detail, form,
  selection) as types only. Each page under
  `app/golf/(dashboard)/dashboard/qualifiers/` imports only its own screen and
  hands it to the route (`screens={{ list }}`, `{{ form }}`, `{{ detail }}` or
  `{{ selection }}`). An App Router page loads every client component its
  server modules import on first paint, so before this change every
  Qualifiers address shipped all four screens (78 KB gzipped of the route's
  own JavaScript in the 2026-11-15 build). The route throws if a page does
  not hand over the screen its view needs.
- `data/qualifiers.ts`, `loadQualifierList`: the team's player profiles (the
  entrants' names) are read beside the qualifier list instead of after it.
  They depend only on the team.
- `data/qualifiers.ts`, `loadQualifierDetail`: the qualifier's entries, rounds
  and round courses start beside the qualifier read instead of after it. They
  need only the address's id and the viewer's team, and the check that
  follows requires the row to match both, so the queries are the same. A
  qualifier that is not shown (another team's, a test one, or missing) leaves
  them unread; each early read is marked handled so that return cannot raise
  an unhandled rejection.

### Why

- MAC-11 (first-load JavaScript per route) and the time-to-first-byte part of
  Batch 3 item 9: the list's chunk carried the detail, form and selection
  screens (the 2026-11-13 F-0010 entry named this as the larger saving), and
  both loaders waited on the qualifier read before starting reads that did
  not need it.

### Visible change

- None. The screens, figures and order are unchanged.

### Verification

- `src/clubhouse/__tests__/qualifiers.test.tsx`: every route test passes the
  screens; the selection page test now also asserts that the page hands over
  only `{ selection: QualifierSelection }`. 194 of 194 pass.
- `npm run typecheck:fast` and `npx eslint` on the changed files.
- Not measured: the per-address size after a build
  (`npm run clubhouse:js-budget -- --next <build>/.next --route /golf/dashboard/qualifiers`)
  and the server time saved.
