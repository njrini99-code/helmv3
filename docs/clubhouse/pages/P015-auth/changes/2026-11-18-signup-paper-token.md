# P015 Auth — Changelog

## 2026-11-18 — The pane reads its paper from a token

```text
Design package: none
PR/commit: agent/onboard-pane-paper-token
Contract IDs: P015 D1
Actions: none
Data impact: none
Held items: none
```

### Changed

- `onboard.css`: the desktop and phone `.ch-ox-stage` rules paint
  `var(--ch-ox-grain), var(--ch-signup-paper)` in place of the same gradient
  written out twice. What the pane looks like is unchanged on both sizes and in
  the dark theme.

### Why

- The raw-colour ratchet on `main` (145 > 144 after #2530).

### Verification

- `auth-phone-pane-ivory.test.ts` still finds the phone rule equal to the
  desktop rule; `raw-colour.test.ts` passes with the baseline at 139.
