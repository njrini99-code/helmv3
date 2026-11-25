# 2026-11-24 — The desk page title: 40px in the forest ink

```text
Design package: owner feedback 2026-11-24 ("just black and small and basic")
PR/commit: agent/clubhouse-desk-title
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

## Changed

- Every desktop page title (the large title role, `--ch-type-large-title`)
  goes from 30/36 to 40/46, and from the near-black primary ink to the
  forest title ink (`--ch-title-ink`, the phone large title's colour).
  Revises D16 (19 Nov) on size and colour; the compact head's height,
  hairline and inline actions stay. Phone sizes are unchanged.
- Settings' head gets the line above the title that Roster has (team and
  season, 15px primary ink); its meta line keeps role and email.
- The page is ivory at every hour (owner, 24 Nov 2026: "It's supposed to be
  an ivory... there's no ambient light"). `--ch-light-canvas` was a 14% glow
  in a 420px band that fell to 0% after dark and turned moon-blue, leaving
  bare grey linen. It is now an always-on warm ivory (`--ch-light-ivory`,
  #fffaf0) over the whole page: 45% at night, up to 60% under a high sun or
  at golden hour, softening to 18% at the bottom. The paper wash no longer
  cools at night. Light mode only; phone and desktop share it. The peak stays
  under the ivory card, so cards still lift off the page.
