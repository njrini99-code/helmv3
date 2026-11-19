# P010 Team Hub — Changelog

## 2026-11-18 — A due day outside the week carries its month

```text
Design package: none
PR/commit: agent/clubhouse-motion-fixes
Contract IDs: none (label wording only)
Actions: none
Data impact: none
Held items: none
```

### Changed

- `data/hub.ts` `formatters().due`: Today, Tomorrow and Yesterday as before; a
  day within a week either side keeps "Wed 22"; anything further out reads
  "Jul 22", the month and day, as `ago` in the same formatters and
  `lib/dates.ts` `relativeTime` already do past a week.

### Why

- Clubhouse audit 2026-11-18 (P1): a task due 22 July read "Overdue · Wed 22"
  in November, with no month.

### Verification

- `data/__tests__/hub-due-label.test.ts`; `hub.test.tsx` and
  `hub-redesign.test.tsx` still pass ("Overdue · Oct 10" fixture).
