## 2026-11-15 — The ivory page, ivory cards, chart contrast and one system (production audit, look rows)

```text
Design package: clubhouse-handoff/prod-audit-2026-11-15/CLUBHOUSE-PROD-AUDIT-FINAL.md (specs S1.1 to S2.8, Batch 0 item 8, Batch 1, Batch 5); design-refresh/DESIGN_LANGUAGE.md (rewritten)
PR/commit: branch claude/project-thread-d9q2qs (QUEUE look-01 to look-03)
Contract IDs: none changed
Actions: none changed
Data impact: none
Held items: Nick's open calls: red for scores (PL-HOME-05), Wave 3 designs F and J
```

### Changed

- The page is the ivory light over a deeper linen again (Nick, 15 Nov: "Bring the ivory gradient back", "Ivory cards, deeper page"): one `--ch-page-paint` (`--ch-light-canvas`, `--ch-light-paper`, `--ch-workspace` #e8e3d5) for the phone page, pushed screens, crash screens and every page copy in a push; the desktop canvas keeps its sidebar bleed and mist. `--ch-bg-page` #e8e3d5 / #111512, `--ch-grouped-bg` names the linen.
- Cards are ivory paper `--ch-card-bg` #faf7ef / #212722 (1.20:1 / 1.18:1 on the page); tiles and wells #f1ede2; raised #fcfaf5 / #2c322d. Every near-white surface is gone (#fffefb, #fdfbf7, the raised gradients, the secondary key's and controls' lit white rims). Sticky bars are transparent at rest and paint the paper over the linen once content is under them.
- Ink: tertiary and placeholder `--ch-ink-500` #55524b / #c4bdad; control border #85817a / #807b6e (3:1 on card and page); the switch off-ring and chart track rings use it. Accent text reads `--ch-accent-ink` (the dark accent fill was 2.5:1 as text).
- Charts: gridlines `--ch-separator-chart` dashed 2 4, mean and par rules `--ch-chart-zero`, qualifying line `--ch-chart-gilt`, tracks and par segments ringed so a fill meets 3:1, the shared line with one dot on the newest round and a card-colour halo.
- One toggle, the Practice style: `Segmented` has no weights; the 11 Nov "filter" weight, its CSS and 27 call sites are gone, and page paints of `.ch-seg__b:not(.is-on)` were deleted.
- Solid keys: the primary key is `--ch-primary-bg` with one shadow; hover and press step the fill. The four-stop gradients are deleted.
- Three elevations: card, raised and overlay per S1.5 to S1.5c. Bubbles, badges, pills and bubblets are flat; three dead elevation tokens deleted.
- Container radii on 8, 12, 16, 20 and full: the Quick chat and Ask panels (26 and 32) and bubbles (19) take 20, and their tokens are deleted. Meta is 14 on a desktop board (never larger than body), 15 on phone. The 650 weight is 600. One definition of `--ch-phone-bar-bg`.
- Player Home: under par is one colour in the scoring chart (the dots match the labels), the interim for PL-HOME-05.
- The design system: DESIGN_LANGUAGE.md rewritten (law 2, colour, surfaces and elevation, the one toggle, keys, charts, banned list, open calls) with token tables generated from tokens.css by `scripts/clubhouse/design-language.mjs`; `clubhouse:check` fails on drift.

### Why

- Nick's 15 Nov calls and the production audit: near-white covered 25 to 73% of phone screens, cards sat 1.09:1 on the page, chart tracks and gridlines were under 3:1, and two toggle looks, gradient keys and dozens of elevations made the app read as assembled rather than designed.

### Verification

- Unit: the style, token, contrast, page-colour, depth, elevation, toggle, hairline and group-tone tests; the new raw-colour ratchet and design-language tests.
- Before and after screenshots, phone 393 and desktop 1440, light and dark, Chromium (tier C), with near-white coverage per screen; listed in the PR.
