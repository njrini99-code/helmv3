# Clubhouse (cross-page) — Changelog

## 2026-11-28 — A held signal keeps the page it was sent from

```text
Design package: none
PR/commit:      agent/bridge-reliability-issues
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `lib/signal.ts`: a signal sent before the queue is configured keeps the
  address it was sent from. When the queue is configured on another address
  (a sign-in on the front door, then Home), it goes out under that address's
  page, not the page the shell configured. On the same address the shell's
  page still wins (it knows whose Stats these are).
- `lib/signal-page.ts`: `/golf/join…` and `/golf/staff/join/…` count under
  P015. The graph lists no page for them (outside the (auth) group), but
  their controls and codes are P015's, so counted anywhere else every one of
  their signals would read as wrong-page drift.

### Why

- A failed sign-in held until the dashboard configured would have counted
  under Home.

### Verification

- `signal.test.ts`: a tap held on `/golf/login` and configured on
  `/golf/dashboard` goes out under P015, the view after it under P002.
- `signal-page.test.ts`: the invitations map to P015.
