# 2026-10-30 — Team Hub: the coach’s second wave starts with the clock

## 2026-10-30 — The coach’s second read wave starts as soon as the clock read lands (F-0033)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0033; fix plan
                PR 7)
PR/commit:      claude/audit-fix-07-speed (#2418)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- data/hub.ts: coachSecondWave() starts from clockRead instead of after the
  first wave settles, so the second wave overlaps the first.

### Verification

- hub-waves.test (new): red on main, green after.
