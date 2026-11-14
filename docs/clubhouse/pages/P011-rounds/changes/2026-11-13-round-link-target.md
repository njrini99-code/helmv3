# 2026-11-13 — A round's link is 24 tall

## 2026-11-13 — The Rounds list's round links reach 24 without moving the row

```text
Design package: none (audit fix, 13 Nov 2026: F-0018)
PR/commit:      agent/ch-look-phone-type
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `rounds.css` `.ch-trd-open`: `padding-block: 4px` with `margin-block: -4px`.
  The link's box is 27 tall (it measured 19); the row keeps its height and the
  name does not move.

### Why

- F-0018 (WCAG 2.5.8, desktop 24). The row was already the target (the link's
  `::after` covers the positioned row), so this satisfies the scan of the link
  itself rather than changing what a click reaches.

### Verification

- `src/clubhouse/__tests__/target-size-css.test.ts` (failed first).
- Not yet seen in a browser; the lead checks the rendered page.
