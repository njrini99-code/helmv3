# 2026-10-27 — Polish pass: Home

## 2026-10-27 — The hero subline never opens a line on a dot

```text
Design package: none (production polish pass;
                doctrine in .claude/rules/clubhouse.md)
PR/commit:      agent/clubhouse-polish
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Hero subline: a no-break space ahead of a title's dot keeps "· Pinehurst No. 2"
  from opening a line (`screens/home/model.ts` homeSubline). The phone queue and
  "From your coach" fixes this pass first carried are dropped: the visual pass
  (#2390) fixed the same spots.

### Why

- A line that starts with "·" reads as broken.

### Verification

- `__tests__/logic.test.ts`, `__tests__/home.test.tsx`.
