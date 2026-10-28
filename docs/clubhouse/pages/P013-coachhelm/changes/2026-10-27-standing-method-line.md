# 2026-10-27 — Polish pass: CoachHelm Standing

## 2026-10-27 — The Standing hero's method line says "measured against"

```text
Design package: none (production polish pass before launch; doctrine in .claude/rules/clubhouse.md)
PR/commit:      agent/clubhouse-polish
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Under the hero's headline, "Every stat, strokes gained included, is against the
  Tour" read as a result (every stat is behind). It is a method note and now says
  "is measured against the Tour" (`screens/coachhelm/views/Standing.tsx`).

### Why

- The line sat under "Ahead of the Tour on 0 of 19 stats", where the old wording
  doubled the bad news.

### Verification

- `__tests__/coachhelm-standing.test.tsx` (60 pass). WebKit at 1280.
