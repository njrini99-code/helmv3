# 2026-10-23 — Type roles, stage 1 (Clubhouse A+ WP-11)

## 2026-10-23 — One role per type step, and the fixed titles (B1)

```text
Design package: none (Clubhouse A+ handoff, section 6, B1)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: the screen-by-screen move onto the roles (owner sees each)
```

### Changed

- `tokens.css`: a role per mot-08 step (`--ch-type-11` to `--ch-type-34`),
  each a whole `font` with its leading (11/13 to 34/41), a 600 `-strong`
  form and a tracking (`--ch-track-<n>`: +0.01em at 11, 0 at 12 to 14, then
  closing to −0.03em at 28 and 34). Named roles: large title, bar title,
  desktop hero, section header, card title; `--ch-lead-tight`; two widths.
- The pushed bar title is 17/600 like the tab-root one and the shell's
  stand-in (it was 16 with its own tracking).
- Every desktop hero is the 52px role; Rounds was 50.
- Display text closes in: the scorecard and board heroes lose their +0.01em
  and +0.08em, and the Home form eyebrow its +0.12em.
- Widths: 80, 86, 90 and 92 become 88 (dense numbers), 94 becomes 96. The
  sign-in pages keep theirs.
- Left for the screen-by-screen stages: 1,798 raw `font:` shorthands (335 use
  a role) and 208 off-role tracking values, now counted per file in a ratchet
  that only lets them fall. Codes, initials and file badges keep their
  tracking.

### Why

- The same size read differently from screen to screen.

### Verification

- `look-feel-pass-css.test.ts`: the roles exist, the ratchets, two widths,
  one bar title, one hero. `clubhouse:css` 0. WebKit before and after on
  track, home, player and qualifier at 390, and rounds and home at 1280
  (screenshots in the store); the differences are a pixel or two.

## 2026-10-23 — Every screen onto the type roles (B1, stage 2)

```text
Design package: none (Clubhouse A+ handoff, section 6, B1)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `scripts/clubhouse/type-roles.mjs` (dry run by default) moved 1,096 step
  sized `font:` declarations onto the roles across every Clubhouse
  stylesheet except the sign-in pages: Settings first as the pilot (67), then
  the rest (1,029). New 500 `-medium` roles mean no weight changed.
- Wrapped text takes the role's leading (Apple's: 13/18, 15/20, 17/22);
  single-line text (368 declarations at a leading of 1.15 or less) keeps its
  line height on the next line, so pills, tabs and figures don't move.
- Left as written (695, ratcheted): pixel sizes kept fixed on purpose, sizes
  off the steps (large figures), 700, and the sign-in pages.
- The named roles are written out in full, so the Dynamic Type test still
  sees every type token scale from `--ch-type-k`.

### Why

- One size, one leading: the same step reads the same on every screen.

### Verification

- WebKit before and after, full page, on all 39 preview screens at 390 and
  1280 (148 shots in the store). No page changed width; phone pages moved by
  −89 to +26px, from leading only (CoachHelm views and Hub checked by eye).
  `npx vitest run src/clubhouse`: 342 files, 5,618 passed. `clubhouse:css`
  0.

## 2026-10-23 — Tracking onto the steps (B1, stage 3)

```text
Design package: none (Clubhouse A+ handoff, section 6, B1)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `type-roles.mjs --tracking` moved 132 negative `letter-spacing` values onto
  their rule's step tracking (`var(--ch-track-<n>)`); 40 kinds of value
  became the role set.
- Left (76, ratcheted): positive tracking, which is deliberate on join
  codes, initials and file badges; large figures off the steps; `inherit`;
  and the sign-in pages.

### Why

- Text of one size had several trackings across screens.

### Verification

- WebKit on all 39 preview screens at 390 and 1280 against stage 2: no page
  changed size (glyph spacing only). `npx vitest run src/clubhouse`: 5,618
  passed.
