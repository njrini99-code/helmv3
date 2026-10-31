# 2026-10-30 — Home: From your coach separators

## 2026-10-30 — No line ends in a stranded dot (F-0074)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0074; fix plan
                PR 9)
PR/commit:      claude/audit-fix-09-messages-calendar-craft (#2420)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- CoachAsks.tsx: each separator dot leads the part after it inside its nowrap
  span, with a plain space between parts, so a wrap moves "· 4 tasks due"
  whole.

### Verification

- screens/home/__tests__/coach-asks.test.tsx: red on main, green after.
