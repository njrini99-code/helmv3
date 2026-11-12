# 2026-11-10 — shared foundation

## 2026-11-10 — One card, one page colour, notices in a card, and four primitive fixes

```text
Design package: design-refresh/ (DESIGN_LANGUAGE.md 2, 4 and 9), design/handoff/depth.css
PR/commit:      agent/clubhouse-release-train (#2497)
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- tokens.css: one card recipe, `--ch-elevation-card` (name for a card:
  `--ch-card-shadow`). Its three drops are depth.css's sheet (contact
  `1px 2px .06`, near `6px 14px -6px .12`, ambient `22px 40px -22px .22`), with
  the card's own ring (`--ch-card-ring`) and a lit top edge. The older names
  (`--ch-elevation-reading`, `--ch-elevation-lifted`, `--ch-card-shadow-flat`,
  `--ch-crh-card-shadow`) now read it, so a page shows one kind of card.
- tokens.css: one feature card. `--ch-feature-bg` is flat `--ch-green-800` (no
  radial light). `--ch-elevation-feature` and `--ch-feature-shadow` are one green
  cast with no ring and no white edge.
- ui/Surface.tsx: reads the one recipe; new `variant="feature"`.
- tokens.css and shell.css: one flat page colour. `--ch-workspace` and
  `--ch-bg-page` take `--ch-grouped-bg`'s value by day (#f2f0e9); the phone-only
  page colour is gone; a pushed phone screen and both canvases read
  `--ch-grouped-bg`; the desktop canvas loses its left green gradient and its
  mist layer. At night the page and workspace are #0e120f.
- ui/Notices.tsx and shell.css: a notice the phone page holds directly draws the
  one card itself (`data-ch-bare`), with the page gutter when it starts at the
  screen's edge. Inside a card it is flush, as before. Try again is the regular
  36pt key (44pt reach on the phone).
- ui/Avatar.tsx: a coin under 22px shows one initial at half its width; under
  14px none.
- ui/PhoneBar.tsx: the back link measures its room to the title as drawn, so a
  pushed page's parent name shows where it fits. shell/nav.ts: the stand-in bars
  for the practice plan and plan format say "Practice", as their pages do.
- shell/quick-chat/useQcMotion.ts: the pour origin comes from the panel's
  offsets (`pourOrigin`), never its transformed rect.
- shell.css and controls.css: 18 declarations a later same-selector rule always
  overrode, and one duplicated rule, are removed.

### Why

- Two design reviews (10 Nov 2026) found most screens short for the same shared
  reasons: two card shadows under one name, three page colours, failure text on
  the page, clipped initials in small coins, "Back" in place of the parent's
  name.
- Owner's standing rule: "Depth: lit faces, soft contact and ambient shadows,
  restrained. design/handoff/depth.css is the reference." The 5 Nov "lifted"
  card went past depth.css; the design pages' flat value sat under it.
- DESIGN_LANGUAGE law 1 (text lives on a surface), law 2 (the page is one flat
  colour) and section 9 (feature card flat; failed states inside the card).

### Not changed, and why

- The large title stays forest ink (owner decision 4, 24 Oct). The design pages
  draw ink, and the lane spec (classes-roster-home 06, line 54) records that as
  "can't match: shared title colour". No newer owner word was found.
- The phone bar's CoachHelm key keeps its label (code note: owner, 5 Nov, "a
  wheel alone and a shortcut were no way in"), which is newer than the 31 Oct
  quick chat design that draws a round icon key.
- `--ch-bg-page` at night stays #111512: the 0.12 hairline reads 1.328 on
  #0e120f and `contrast-tokens.test.ts` holds 1.33 on that token.

### Verification

- New tests: `styles/__tests__/depth.test.ts`, `styles/__tests__/page-colour.test.ts`,
  `ui/__tests__/notice-place.test.tsx`, `ui/__tests__/phone-bar-back-label.test.tsx`,
  `shell/quick-chat/__tests__/pour-origin.test.ts`, small-coin cases in
  `ui/__tests__/Avatar.test.tsx`, `preview/__tests__/cast.test.ts`.
- WebKit captures before and after at 390x844 and 1440x900, light, were made in
  a scratch folder and are not filed in the screenshot store.
