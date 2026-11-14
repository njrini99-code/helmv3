# 2026-11-13 — rounds

## 2026-11-13 — The team rounds book labels its rows with reused formatters and skips off-screen groups (F-0010)

```text
Design package: none (owner's browser audit, finding F-0010, S2 motion; Rounds 133 ms with 2 gaps over 50 ms at 4x CPU)
PR/commit:      agent/ch-look-speed
Contract IDs:   none changed (every label reads as it did)
Actions:        none
Data impact:    none
Held items:     the frame-gap measurement on a device
```

### Changed

- `monthLabel`, `shortDay` and the rest of `rounds/parts.tsx`'s date labels
  read the shared per-zone formatter cache (`lib/zone-format.ts`). A season of
  rounds built about four formatters a row (the month the round falls in, its
  short day for the row and again for its link's label); it builds one of each
  kind now.
- Desktop team rounds book: each month's or player's group
  (`.ch-trd-tbl > [role='rowgroup'][aria-labelledby]`) draws only near the
  screen, keeping the height it last drew (`content-visibility: auto`). The
  table's header group is not one of them. Everything a row draws sits inside
  its own box (the tint, the hairline above it, the inset focus ring), so
  the containment clips nothing; the player library's desktop Ledger is
  untouched (auditor #12).

### Verification

- `screens/rounds/__tests__/team-rounds-first-render.test.ts` (new): no
  formatter is built after the first rows however many rounds follow; labels
  unchanged; the group rule and its intrinsic size; the header group has no
  such rule. The first and the rule tests fail on the previous sources.

### Not measured

- The 133 ms gap needs the device or a Chromium trace run. Not done:
  `RoundReview` still builds a formatter per label (the review page, not this
  book), and each round row still calls `usePressPrefetch` (a closure, not
  layout work).
