# P001 — Changelog

## 2026-11-27 — What's new rows are named by their own words

```text
Design package: none (design lab governance, dsx-09 UI check findings)
PR/commit: #2659, claude/project-thread-13od9x
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- A What's new row drops its separate label and is named by what it shows (time, title, player, kind and the
  sentence under it), with a space between the player line and the sentence.

### Why

- The Clubhouse UI check (`e2e/clubhouse-ui-check.spec.ts`, axe on WCAG 2.2 A and AA) found it. WCAG 2.5.3
  Label in Name: a control's spoken name holds the words drawn on it, so a Voice Control user can say what they see.

### Verification

- `e2e/clubhouse-ui-check/known-axe.json` lost the entry; the UI check passes on WebKit iPhone 17 Pro (W) and
  Chromium 1440x900 (C), fixtures. Nothing visible moves except as noted.
