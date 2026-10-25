# 2026-10-24 — The phone bar and strip take the page edge

## 2026-10-24 — 20px on large phones, as the page (decision 5)

```text
Design package: none (review of #2361, decision 5 confirmed by the owner)
PR/commit:      agent/clubhouse-aplus-phase2
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The phone top bar's leading padding and the section strip's padding and
  scroll snap read `--ch-page-x-phone`: 16px, and 20px from 414px wide. They
  had kept 16 while the page moved to 20, a 4px step on Plus and Pro Max.

### Verification

- `phone-edge-bars.test.ts`; `page-spacing`, `spacing-scale` and
  `shell-reach-css` still pass. Owed: a look on a large iPhone.
