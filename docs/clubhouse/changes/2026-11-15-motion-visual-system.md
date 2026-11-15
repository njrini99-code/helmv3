## 2026-11-15 — The visual half of the motion and visual system (4.1 to 4.8)

```text
Design package: clubhouse-handoff/launch-readiness-2026-11-15/MOTION-AND-VISUAL.md (sections 4.1 to 4.8, build steps 6 and 7); design-refresh/DESIGN_LANGUAGE.md
PR/commit: branch claude/project-thread-d9q2qs (QUEUE look-01 to look-03)
Contract IDs: none changed
Actions: none changed
Data impact: none
Held items: section 3 (motion), desktop keyboard behaviour and 4.9 layouts are other threads' work; calls A and C wait for Nick
```

### Changed

- The bar material (4.1): one glass, `color-mix(in oklab, var(--ch-workspace) 78%, transparent)` under `blur(20px) saturate(140%)`, in both themes; the message-only variants, the dark and phone overrides are gone. Increase Contrast and Reduce Transparency still turn it into the solid page.
- The Practice style (4.2): every segmented control is a capsule well with a capsule thumb 3px in (`--ch-seg-inset`), at 44 for a page-level toggle on the phone, 36 on the desktop and inside a card, and 32 in a dense card; the off label is secondary ink at 600. Page-level overrides of its size, gap and radius (Home, Stats, Calendar, Tournaments) are deleted.
- Type (4.3): nine roles on `--ch-type-k`, large title 30/36 700 (34/41 on the phone), title 22/28 600, headline 16/22 (17/22), body 15/22 (17/24), callout 14/20 500 (15/20), footnote 13/18 500, caption 12/16 500, the hero figure 56 (44) and the row figure 15/20 (17/22), both 600. The older named roles (serif, display, label, eyebrow, meta, row, section, bar and card titles, the 52 hero, the 40 and 44 figures) were mapped onto the nine at all 657 of their reads and deleted, and the lossless numeric steps (13 medium, 12 medium, 22 strong) read their role. Desktop page titles take the large title; card hero titles take the title. Every big figure is 600 (was 500).
- Radii (4.5): five steps, 8, 12, 16, 20 and full, at 586 declarations in 52 stylesheets; the 209 raw `999px` read `--ch-radius-full`. Three shapes stay outside the steps on purpose: the bogey square's 4 (a square must not read as a circle), and a message bubble's 18 with its 6 corner (the spec's own bubble).
- Elevation (4.6): card and raised, plus the `rgb(28 25 18 / 0.24)` scrim; every other elevation token is an alias of one of the two, or none (strips, controls); the floating elevation is deleted. Thirteen private drop shadows on cards, heroes, pins and avatars take the card or raised elevation or keep only their ring, and Home's coach form card is flat ivory instead of a white gradient.
- Desktop (4.8): the sidebar is 232 wide on the green frame, its current item the ivory pill on green (the phone strip's).
- `stylelint.clubhouse.config.mjs` (build step 7): raw radii, raw shadows, raw durations and curves outside tokens.css and motion.css, and keyframes outside motion.css, counted per file by `npm run clubhouse:css` into `config/clubhouse/css-ratchet.json`. Against main: raw radii 219 to 5, raw shadows 1,214 to 1,199, hex colours 608 to 579; durations (209) and keyframes (188) are ceilings for the motion work. `npm run clubhouse:css` reports no findings.

### Why

- Nick's MOTION-AND-VISUAL.md (15 Nov), sections 4.1 to 4.8: one material, one toggle, nine type roles, five radii, three elevations. Where it differs from the production audit (the hero figure's weight, the bubble radius) it wins.

### Verification

- Unit: the type role, type scale, radius, elevation, glass, segmented, spacing and longhand ratchets; the design-language generator now prints each role's phone value.
- Before and after screenshots, phone 393 and desktop 1440, light and dark, Chromium (tier C), in the PR.
