# 2026-11-13 — Sign-in footer links 44 each way

## 2026-11-13 — "Create an account" and "Terms" reach 44 x 44 on the phone

```text
Design package: none (audit fix, 13 Nov 2026: F-0023)
PR/commit:      agent/ch-look-phone-type
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The main cause was the phone type scale (F-0014,
  `docs/clubhouse/changes/2026-11-13-phone-type-floor-and-week-strip.md`):
  `ThemeScript` stamped 0.824 on `/golf/login`, so the footer drew small and its
  hit areas measured 112 x 42 and 43 x 44. At scale 1 both clear 44.
- Hardened so they hold at any size, in `auth.css`:
  - `.ch-au-legal a` ("Privacy", "Terms"): `min-width: 44px` with the word
    centred.
  - "Create an account" `::after`: `inset: min(-14px, calc(50% - 22px)) -8px`,
    so the hit area is 44 tall around the line, or 14 past a taller line.
    Nothing visible moves.

### Why

- F-0023 (TO-01, phone 44 x 44).

### Verification

- `src/clubhouse/__tests__/target-size-css.test.ts` and
  `src/components/golf/theme/__tests__/ThemeScript.test.tsx` (failed first).
- Not yet seen in a browser; the lead checks the rendered page.
