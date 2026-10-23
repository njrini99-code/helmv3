# 2026-10-23 — The putt prompt's counter on the type scale

## 2026-10-23 — The putt prompt's counter on the type scale (mot-08)

```text
Design package: none
PR/commit: branch claude/coachhelm-round-prompts (#2357)
Contract IDs: CH-11960
Actions: none
Data impact: none
Held items: none
```

### Changed

- The putt prompt's counter line (`.ch-rt-ask__s`) is 13px, up from 12.5px.
  Weight, line height and colour are unchanged.

### Why

- The 11-size type scale (mot-08) and this text landed side by side, and
  12.5px is not one of the steps; look-feel-pass-css.test.ts failed on main.

### Verification

- look-feel-pass-css.test.ts pins the 11 steps and passes.
