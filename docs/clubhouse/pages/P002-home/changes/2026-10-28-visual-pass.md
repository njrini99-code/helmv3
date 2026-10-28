# 2026-10-28 — Home: visual pass (contrast, Waiting on you on the phone, skeleton order)

## 2026-10-28 — Pre-deploy visual and premium-polish pass, area B (Home, both roles)

```text
Design package: none (visual pass 2026-10-28, RUBRIC.md section 3 "Home (P002)")
PR/commit:      visual-pass-2026-10-28
Contract IDs:   20104 (Waiting on you, drawing only), CH-2220 (its note, phone drawing), CH-2401 (route skeleton order)
Actions:        none added or removed; ACT-P002-QUEUE-* and ACT-P002-OPEN-LEG-PLAYER keep their links, with larger targets
Data impact:    none (no read, write or copy meaning changed)
Held items:     iPhone/Safari check of the phone capsules, color-mix() tints and the 12px coin initials (see Verification)
```

### Changed

- **Contrast (phone, coach).** The scoring form's captions and the week's note
  were raw greys under 4.5:1 on the sheet (`#8A8476` 3.07:1, `#6E6A60`
  4.45:1, measured on the painted `#eeebe1`). They take `--ch-text-tertiary`
  (9:1). The four dead raw greys in the light Up next variant (overridden by
  the green card) went the same way so nothing failing is left in source.
- **Honest change colour (phone, coach).** The team average's change drew
  green (`#3F7556`) even when it was "No clear change" (no `.is-gain`), so a
  flat −0.9 read as a gain. A plain change is now secondary ink in both
  themes; only `.is-gain`/`.is-loss` colour it. Its words ("No clear change vs
  previous 10") now show under the figure on the phone, as the four parts'
  rows already do; they were hidden with the title's `em`.
- **Waiting on you on the phone.** The key sits on its own line and each part
  is a quiet capsule (32px, 9% tint of its green, 44px hit area via
  `::after`, 12px between rows so hit areas never overlap). The old flowing
  line stacked each link's 12px padding into a 42px gap between wrapped lines
  and could leave a "·" at a line's end. On the phone the "some items didn’t
  load" note drops its leading dot. Desktop is unchanged (one line in the
  well).
- **Targets.** A name in the team's four parts ("Eli B.", 28×42) gets a
  44×44 hit area without moving the words.
- **Coins.** The day card's 28px coins drew initials at 11.76px tracked .04em
  ("TM" met the ring): now 12px untracked. The desktop latest-round rail's
  26px coins drew 10.92px: now 11px.
- **Figures.** The phone's form figures, latest-round scores, the four parts'
  strokes gained and Since-you-last-looked figures take the dense width
  (`--ch-wdth-dense`, 88) with tabular digits. The phone score and the
  desktop form's change now scale with Text Size (were raw 17/20px and
  `700 15px`).
- **From your coach (player).** Each count keeps to one line ("· 2" no longer
  strands above "tasks due"), the chevron is 16 (icon set 16/20), and a tap
  shows on the row (`[data-ch-pressed]`).
- **Player desktop sheet corner.** The week-and-Scoring sheet (`.ch-h-flow`)
  sits on the card radius (16, was 20), and the Scoring seam's bottom corners
  with it.
- **Skeleton order (row 79).** The desktop route skeleton drew the coach's
  form and four parts before the week's sheet; the loaded page draws the
  sheet first. `SkeletonDeskHead` now draws only the head, a new
  `SkeletonDeskForm` draws the form and four parts after the sheet, with the
  loaded page's 32px step (`.ch-h-main[aria-busy] > .ch-h-sheet + .ch-h-form`).

### Verification

- Before/after captures: `/home/claude/vp/before/…`, `/home/claude/vp/before-states-B/…`,
  `/home/claude/vp/after-B/…` (home, home-player, whats-new, home--loading,
  home--queuefailed at 393 and 1280, light and dark).
- `look-feel-pass-css.test.ts`: home.css stays at its pins (raw longhands 47);
  the coin initials use the 12 and 11 type roles.
- Computed-style probe at 393 light: capsules 32px tall on a 44px row pitch;
  coin initials 12px; captions rgb(70 67 61) (tertiary); plain change
  rgb(58 56 51).
- stylelint and eslint clean on the changed files. Vitest: home, player-home,
  home-coach-parity, home-consumer-truthfulness, wiring-p002-home,
  player-home-phone, whats-new, avatar-sizes pass. `stats-geometry.test.tsx`
  pins the old skeleton order (line 247) and needs the new order; requested
  from its owner.
- Held for a real iPhone: the capsules' `color-mix()` tint and press shade in
  Safari, the 12px coin initials at the largest Text Size, and the delta words
  wrapping beside the 56px average at 375.
