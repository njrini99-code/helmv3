# 2026-10-23 — Quiet refresh (Clubhouse A+ WP-8)

## 2026-10-23 — The page fetches again when the app comes back (A17)

```text
Design package: none (Clubhouse A+ handoff, section 5, A17)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: A15 splash and native canvas (iOS build, owner)
```

### Changed

- New `shell/use-quiet-refresh.ts`, mounted once in ClubhouseFrame. After a
  minute away (a tab shown again, the iPhone app brought to the front) or
  once the connection has been back for 2s, the page re-runs its server
  render. No spinner; the page on screen stays until the new one lands.
- Skipped while a dialog is open, a field has focus or a round is being
  scored, so nothing typed is lost.
- Left alone: A15 (the splash and native canvas colours). It changes the
  app-wide Capacitor config and launch screen that Fairway users see too,
  and ships only with an iOS build the owner approves.

### Why

- A coach opening the app in the morning saw last night's Home until they
  moved.

### Verification

- New `use-quiet-refresh.test.tsx` (30s away: none; 90s: one; online: one
  after 2s; a focused field, an open dialog or a round being scored: none).
  Not done: the device pass (background two minutes, change data elsewhere,
  return).
