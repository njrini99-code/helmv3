# 2026-11-15 — coachhelm

## 2026-11-15 — Ask: the tray paints the page, the jump key is the one glass

```text
Design package: clubhouse-handoff/prod-audit-2026-11-15/CLUBHOUSE-PROD-AUDIT-FINAL.md; MOTION-AND-VISUAL.md 4.1 and 4.5
PR/commit:      claude/project-thread-d9q2qs
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The phone composer tray has no separate fill and no hard rule (ASK-P-13); the
  thread fades into it with the page's own wash, as on the desktop.
  `--ch-phone-composer-bg` is deleted.
- The jump key and the locked banner read `--ch-glass-blur` and
  `--ch-glass-saturate`, so Reduce Transparency flattens them (OVL-20).

### Why

- The production audit's rows (Nov 15), fixed to its specs, with Nick's
  MOTION-AND-VISUAL.md winning where the two differ.

### Verification

- Unit: the CSS suite (ratchets, glass, page colour).
- Before and after screenshots at 393 and 1440, light and dark, Chromium (tier
  C), in the PR.
