# 2026-10-23 — How you play's window key on the type scale

## 2026-10-23 — How you play's window key on the type scale (mot-08)

```text
Design package: none
PR/commit: branch claude/coachhelm-round-prompts (#2357)
Contract IDs: CH-13915
Actions: none
Data impact: none
Held items: none
```

### Changed

- Standing's How you play window key (`.ch-hg-lede__k`) is 12px, down from
  12.5px. Weight, line height and colour are unchanged.

### Why

- The 11-size type scale (mot-08) and this text landed side by side, and
  12.5px is not one of the steps; look-feel-pass-css.test.ts failed on main.

### Verification

- look-feel-pass-css.test.ts pins the 11 steps and passes.
