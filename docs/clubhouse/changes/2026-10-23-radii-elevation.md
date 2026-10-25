# 2026-10-23 — Corners, hairlines, elevation and stacking (Clubhouse A+ WP-12)

## 2026-10-23 — Card and sheet radii, device hairlines (B3, CONS-4, CONS-32)

```text
Design package: none (Clubhouse A+ handoff, section 4.18, B3, CONS-4, CONS-32)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: hairline alpha and a Retina device check; CONS-4 icon 15 to 16
  and lg weight 600; CONS-32 row heights 66/72 to 58 (owner)
```

### Changed

- Tokens `--ch-radius-card` (16, X-4) and `--ch-radius-sheet` (20, X-3).
  Surface's card takes the card radius and a new `--ch-elevation-card`
  (its old shadow, unchanged).
- 86 raw radii that equal a token now use it (no pixel moved).
- The seven bottom sheets' top corners are the sheet radius: More, the
  CoachHelm asks sheet, the phone modal, Settings, Recruiting, the course
  view and the auth panel (were 22, 24, 26 and 28).
- `--ch-hairline-w`: 98 separator borders use it. On a 2x or 3x screen it
  is 0.5px, one device pixel as iOS draws it; Increase Contrast keeps 1px.
  The line colour is unchanged.
- Button sizes: sm 8 to 7 (`--ch-radius-sm`), lg 12 to 14 (`-lg`).
- Phone cards on the card radius: Track's card and its holed-hole review
  (26), the bell stack cards (22), the stats phone panels (18). Surface's
  footer sits on `--ch-bg-inset`.

### Why

- Sheet tops ran from 22 to 28px and cards from 16 to 26px, and every
  separator was two or three device pixels.

### Verification

- New `radii-hairlines.test.ts` (sheet list by hand, Surface, no raw radius
  equal to a token, hairline widths, button and phone-card corners).
- WebKit pixel diff on nine screens at 390 and 1280 after the token swap:
  no pixel moved by more than 2 levels. Sheet tops computed at 20px.
  Before and after on Track and team Stats at 390.

## 2026-10-23 — Elevated surfaces at night, glass, edge fade (B4)

```text
Design package: none (Clubhouse A+ handoff, section 4.18, B4)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: Settings and Recruiting sheets keep the page colour (grouped
  cards sit on it); shadows move onto three levels screen by screen
```

### Changed

- `--ch-bg-elevated` and `-2`: the surface in light; #232925 and #2b322d
  at night. Sheets, the modal, popovers (menus and the bell), the peek,
  More and the asks sheet sit on it in dark, so they lift off the cards.
- The five frosted surfaces blur from `--ch-glass-blur` (scaled to keep
  their old radius), so Reduce Transparency and Increase Contrast flatten
  them.
- `--ch-edge-fade` (28px): a phone's sideways scrollers fade over it.
- A ratchet holds raw box-shadows at 352.

### Why

- At night a sheet was the same colour as the cards under it, and two
  frosted bars ignored Reduce Transparency.

### Verification

- New `elevation-tokens.test.ts`; contrast pairs for ink on both elevated
  steps (all above 7:1). Light pixel diff unchanged; the invite dialog in
  dark at 1280 lifts off the page.

## 2026-10-23 — One z-index ladder (CONS-35)

```text
Design package: none (Clubhouse A+ handoff, section 4.18, CONS-35)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: seven literals off the ladder (ratcheted)
```

### Changed

- Steps raised 10, panel 30, dock 50, popover 60, sheet 90, skip 110 join
  sticky, overlay and toast. Literals equal to a step use it. The skip
  links sit above a toast (110).
- Seven literals (20, 35, 55, 70 and onboarding's 6 to 8) stay, ratcheted.

### Why

- Nine literals and three offsets stacked by hand.

### Verification

- New `z-ladder.test.ts`; both skip links computed at 110.

## 2026-10-23 — The primary key at night (B21)

```text
Design package: none (Clubhouse A+ handoff, section 4.18, B21, X-6)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: sidebar tone, gold arcs and the phone lip (owner)
```

### Changed

- In dark, the primary key is #25734d to #1d613f (hover top #2c7a52,
  press #17543a), lighter than the cards' green, per 4.32.1.

### Why

- At night the primary key shared the cards' green and lost its weight.

### Verification

- Contrast test: ivory at 4.5:1 or more on every stop; 3:1 against the
  page. WebKit dark Roster at 1280.

## 2026-10-23 — Chart ink under Increase Contrast (B15)

```text
Design package: none (Clubhouse A+ handoff, section 4.18, B15)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: raw-colour sweep on stats, calendar and rounds; the
  WKWebView bridge if iOS does not report prefers-contrast
```

### Changed

- Under `prefers-contrast: more`, gain, loss and flag inks step further
  from the paper in both themes.

### Why

- The contrast block reached borders and tertiary ink but not charts.

### Verification

- Contrast test: tertiary at 7:1 or more on the page; chart inks stronger
  than at rest and 4.5:1 or more. WebKit with contrast emulated on Stats.
