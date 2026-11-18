# Shared tokens — Changelog

## 2026-11-18 — Sign up's pane paper is a named token

```text
Design package: none
PR/commit: agent/onboard-pane-paper-token
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `styles/tokens.css`: `--ch-signup-paper`, the opaque ivory stationery of sign
  up's question pane (P015 D1). Same value as before; it now has a name.

### Why

- #2530 copied the desktop pane's three literal colours into the phone rule, so
  `onboard.css` held 145 literal colours over its baseline of 144 and the
  raw-colour ratchet failed on `main`. Naming the paper once removes six.

### Verification

- `RAW_COLOUR_UPDATE=1` lowered `onboard.css` to 139; `raw-colour.test.ts`,
  `auth-phone-pane-ivory.test.ts` and `src/clubhouse/__tests__/` pass.
