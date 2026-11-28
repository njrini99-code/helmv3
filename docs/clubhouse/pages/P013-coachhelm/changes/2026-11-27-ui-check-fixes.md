# P013 — Changelog

## 2026-11-27 — Team hole stations keep their words apart

```text
Design package: none (design lab governance, dsx-09 UI check findings)
PR/commit: #2659, claude/project-thread-13od9x
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- A station on the team hole (`TeamHole`) puts a space between its short name and its figure, so its drawn words
  read "Tee 0.0", not "Tee0.0", and match its name.

### Why

- The Clubhouse UI check (`e2e/clubhouse-ui-check.spec.ts`, axe on WCAG 2.2 A and AA) found it. WCAG 2.5.3
  Label in Name: a control's spoken name holds the words drawn on it, so a Voice Control user can say what they see.

### Verification

- `e2e/clubhouse-ui-check/known-axe.json` lost the entry; the UI check passes on WebKit iPhone 17 Pro (W) and
  Chromium 1440x900 (C), fixtures. Nothing visible moves except as noted.
