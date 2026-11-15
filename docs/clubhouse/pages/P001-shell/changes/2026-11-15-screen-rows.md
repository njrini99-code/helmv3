## 2026-11-15 — Shell: the 20px lip and a stable gutter

```text
Design package: clubhouse-handoff/prod-audit-2026-11-15/CLUBHOUSE-PROD-AUDIT-FINAL.md; MOTION-AND-VISUAL.md 4.1 and 4.5
PR/commit:      claude/project-thread-d9q2qs
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The sheet's lip under the bar, the section strip and pull-to-refresh is 20px, the sheet radius (`--ch-radius-xl`, MOTION-AND-VISUAL 4.1 and 4.5). The audit's CHROME-P-09 asked to drop the lip; Nick's spec keeps it.
- The desktop canvas keeps a stable scrollbar gutter, so the page never shifts sideways (SYS-09).

### Why

- The production audit's rows (Nov 15), fixed to its specs, with Nick's MOTION-AND-VISUAL.md winning where the two differ.

### Verification

- Unit: the CSS suite.
- Before and after screenshots at 393 and 1440, light and dark, Chromium (tier C), in the PR.
