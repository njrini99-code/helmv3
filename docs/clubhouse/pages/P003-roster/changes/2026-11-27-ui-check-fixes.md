# P003 — Changelog

## 2026-11-27 — Roster names, Sort and the Rds header say what they show

```text
Design package: none (design lab governance, dsx-09 UI check findings)
PR/commit: #2659, claude/project-thread-13od9x
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- A player's name in the desk table is named by its own words (the name and the line under it) and described
  "Shows in the panel", in place of a label that left the line out.
- Sort is named "Sort: Scoring avg", as drawn; the Rds header is "Rds, rounds this season".
- The phone's join-request row keeps its words apart in its name (a space that does not draw). Its avatars and
  count badge still trip axe's rule, so the roster entry stays in known-axe.json.

### Why

- The Clubhouse UI check (`e2e/clubhouse-ui-check.spec.ts`, axe on WCAG 2.2 A and AA) found it. WCAG 2.5.3
  Label in Name: a control's spoken name holds the words drawn on it, so a Voice Control user can say what they see.

### Verification

- `e2e/clubhouse-ui-check/known-axe.json` lost the entry; the UI check passes on WebKit iPhone 17 Pro (W) and
  Chromium 1440x900 (C), fixtures. Nothing visible moves except as noted.
