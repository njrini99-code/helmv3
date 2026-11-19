# Shell separator face — Changelog

## 2026-11-18 — The middle dot gets room on both sides (L-091)

```text
Design package: none
PR/commit: agent/clubhouse-polish-fixes (#2586)
Contract IDs: none
Actions: none
Data impact: none (type only)
Held items: none
```

Instrument Sans draws its middle dot with no side bearings, so every "A · B"
line in Clubhouse set the dot against
its words (3px gaps at 14px). Two one-glyph faces (`src/clubhouse/lib/fonts/`,
about 1.4 KB each, weights 400 and 700)
hold that dot with 170 units of bearing per side; they load through
`next/font/local` with `unicode-range: U+00B7` and
sit first in `--ch-font-sans`, so only the dot changes. Measured in Playwright
WebKit on a static page: about 6px each
side at 14px. Not yet seen in the app (dev server held off) or in Safari.
