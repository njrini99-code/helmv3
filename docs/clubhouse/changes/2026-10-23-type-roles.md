# 2026-10-23 — Type roles, stage 1 (Clubhouse A+ WP-11)

## 2026-10-23 — One role per type step, and the fixed titles (B1)

```text
Design package: none (Clubhouse A+ handoff, section 6, B1)
PR/commit: Phase 2 draft PR
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
