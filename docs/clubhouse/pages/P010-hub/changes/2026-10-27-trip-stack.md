# 2026-10-27 — Polish pass: Team Hub

## 2026-10-27 — Travelers' initials stay readable

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

- The trip card's travelers overlapped 8px, which covered the second letter of
  each coin ("TM" read "TN", "EB" read "EE"). They overlap 2px, so the rings
  just touch (`styles/hub.css` `.ch-hw-stack i`).

### Why

- Initials are how a coach tells the coins apart.

### Verification

- WebKit at 390 and 1280: TM SA AL EB PN read correctly.
