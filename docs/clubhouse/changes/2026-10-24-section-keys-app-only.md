# 2026-10-24 — Cmd 1 to 9 only in the app

## 2026-10-24 — A browser keeps Cmd or Ctrl 1 to 9 for its tabs; the iOS app keeps the section keys

```text
Design package: none (Clubhouse A+ Round 1, S3 item 2; owner decision 13)
PR/commit:      agent/aplus-s3
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `interpretKey` binds Cmd or Ctrl and 1 to 9 only when the context says the
  keys are free (`digits`). CommandLayer passes `isNativeApp()`
  (src/lib/utils/capacitor.ts): in the iOS app the digits go to the sidebar's
  sections as before; in a browser the key is not ours, nothing is prevented,
  and the browser switches its tab.
- The shortcuts sheet draws the digit beside a section's G letter only in the
  app.
- Cmd N stays unbound everywhere.

### Why

- Cmd 1 to 9 is tab switching in every desktop browser, and taking it broke
  that (#2361 follow-up review). The app has no tabs, so there the keys are
  free.

### Verification

- shortcuts.test: nothing bound in a browser with either modifier; Cmd N unbound
  in the app and the browser; the app cases as before.
- command-layer.test: in a browser, Cmd 2, Ctrl 6 and Cmd N are not prevented
  and push nothing, and the sheet shows no digit; in the app, the digit goes to
  the section and the sheet draws it.
