# P002 — Changelog

## 2026-11-27 — Waiting-on-you tiles and leader names

```text
Design package: none (design lab governance, dsx-09 UI check findings)
PR/commit: #2659, claude/project-thread-13od9x
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The desk's waiting-on-you tiles (`CoachQueueCards`) are named "1 join request, Review": the count, the words
  and the verb drawn on the tile, kept apart by spaces that do not draw.
- A leader's name in the team leaders card (`.ch-ph-leg__who`) carries a quiet green underline
  (`--ch-green-rule`), darkening on hover, so it reads as a link by more than its colour (WCAG 1.4.1, axe
  link-in-text-block).

### Why

- The Clubhouse UI check (`e2e/clubhouse-ui-check.spec.ts`, axe on WCAG 2.2 A and AA) found it. WCAG 2.5.3
  Label in Name: a control's spoken name holds the words drawn on it, so a Voice Control user can say what they see.

### Verification

- `e2e/clubhouse-ui-check/known-axe.json` lost the entry; the UI check passes on WebKit iPhone 17 Pro (W) and
  Chromium 1440x900 (C), fixtures. Nothing visible moves except as noted.
