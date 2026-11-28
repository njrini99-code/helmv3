# P011 — Changelog

## 2026-11-27 — Live hydration and a frozen clock

```text
Design package: none (design lab governance, dsx-09 UI check findings)
PR/commit: #2659, claude/project-thread-13od9x
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- A Live lane (`live/PlayerLane.tsx`) waits for hydration before it says how fresh it is. A lane given a time on the
  server (the preview's frozen clock) named a quiet lane's last update as a time of day in the server's zone, and
  the reader's browser drew another, so React threw a hydration error. Production never passed a time to the server
  render, so readers saw no change.
- Live rows keep their spoken sentence ("Priya Shah, 3 under par through 11, ..."); it opens with the drawn name,
  but axe wants every drawn shorthand ("Qualifier · R2 · 12 · Par 3 −3 thru 11") inside it, so that entry stays.

### Why

- The Clubhouse UI check (`e2e/clubhouse-ui-check.spec.ts`, axe on WCAG 2.2 A and AA) found it. WCAG 2.5.3
  Label in Name: a control's spoken name holds the words drawn on it, so a Voice Control user can say what they see.

### Verification

- `e2e/clubhouse-ui-check/known-axe.json` lost the entry; the UI check passes on WebKit iPhone 17 Pro (W) and
  Chromium 1440x900 (C), fixtures. Nothing visible moves except as noted.
