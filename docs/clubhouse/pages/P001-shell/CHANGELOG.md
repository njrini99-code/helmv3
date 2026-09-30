# P001 — Shell: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions).

## 2026-09-30 — V2 page docs; every hand contract proven by a test

```text
Contract IDs:   10102, 10301, 10801, 10802, 10901, 11301, 11401, 11402, 11901, 12301, 12401 (new, no catalog code)
Actions:        7 (ACT-P001-*)
Data impact:    none
```

### Changed

- The six page docs, the manifest's actions, and 11 behaviour contracts, each named by a test.
- New tests: 10102 with 10802 (the frame, and the notice for a role's unbuilt route), 10301 (the bell
  re-reads on open), 11301 (Mark all read rolls back), 10901 (success toast and haptic; a switch shows
  no toast), 11402 (toast Retry), 11401 (route Try again), 12301 (failures reported), and
  `gate.test.ts` for 10801.
- `useAction`'s doc comment said a success fires the commit haptic; it fires success (D-70). Fixed.

### Verification

- `npx vitest run src/clubhouse/__tests__/shell.test.tsx src/clubhouse/__tests__/gate.test.ts`: 42/42.
  11301 and 10102/10802 fail with their code broken (checked, restored).

## 2026-09-29 — v2 foundation

- v2 motion (D-64), haptics (D-70), the page empty state (D-71) and navigation (D-66) for every page.

## 2026-09-30 — toasts inside an open dialog

- CH-1812: a toast raised while a dialog or sheet is open renders inside it, so it is seen, announced and its Retry can be tapped. A modal dialog makes the rest of the page inert and the top layer paints over it; checked in headless Chromium and WebKit (a top-layer popover outside the dialog is inert too, so it is not a fix). Found by the Calendar contract pass; it had disabled every in-dialog Retry on every page.
- The More sheet follows v2 `MoreM`; sign-out is shared with Settings (CH-1002).
