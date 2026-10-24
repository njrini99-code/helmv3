# 2026-10-24 — Review nits on #2361

## 2026-10-24 — Increase Contrast bar line, test tidy, the diff record

```text
Design package: none (review of #2361, nits)
PR/commit:      agent/clubhouse-aplus-phase2
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Under Increase Contrast the desktop top bar keeps its hairline at rest; the
  scroll-edge shade alone was too faint a boundary there.
- `elevation-tokens.test.ts`: two `RAW_DROP` lines re-indented.
- The type-roles note records that the WebKit computed-style diff ran;
  `fe519fe36`'s "still owed" predates it.

### Verification

- `scroll-edge.test.ts` (Increase Contrast case), `elevation-tokens`,
  `contrast-tokens`, `hairlines`; `clubhouse:css` clean.
