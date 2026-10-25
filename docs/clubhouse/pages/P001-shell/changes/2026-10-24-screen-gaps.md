# 2026-10-24 — Screen gaps (Clubhouse A+ lane D)

## 2026-10-24 — Route and section failures say what to do (B10.3)

```text
Design package: none (Clubhouse A+ handoff, B10.3)
PR/commit:      agent/aplus-lane-d
Contract IDs:   CH-1204, CH-1206, CH-1209, CH-1210
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The route error's busy and unknown bodies, the page notice, the section-group
  notice and ClubhouseRouteError's message use the shared failure templates
  (`FAILURE_COPY`): nothing reported, no guessed cause.

### Why

- The cross-page entry, docs/clubhouse/changes/2026-10-24-screen-gaps.md.

### Verification

- shell.test › CH-1204, CH-1206; states.test › CH-1210; error-copy.test.ts.
