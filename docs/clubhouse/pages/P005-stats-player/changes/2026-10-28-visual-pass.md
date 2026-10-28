# 2026-10-28 — Visual pass (area C: Player stats and the profile)

## 2026-10-28 — Profile hero and tabs on Text Size, dark tab underline contrast, phone figures and rows

```text
Design package: none (pre-deploy visual pass, owner: "contrast in the profile and tabs in desktop", 2026-10-28)
PR/commit: visual-pass-2026-10-28
Contract IDs: none
Actions: none
Data impact: none
Held items: Text Size at the largest steps and the hero at 1280 need a WebKit/iPhone check (captures were Chromium only)
```

### Changed

- Tabs (`.ch-tab-t`): on the shared tab tokens (`--ch-tab-ink`, `-ink-hover`, `-ink-selected`, `--ch-tab-bar`,
  `--ch-tab-bar-h`, `--ch-tab-gap`; the label is the 14 medium role `--ch-tab-font` names) instead of a raw `500 14px`
  and local colours. The label keeps one line and answers a touch press with the hover ink. In dark the underline is
  `--ch-tab-bar` (green-600, 7.8:1 on the workspace, as the Team Hub's bar); the fill green it used measured 2.99:1,
  under the 3:1 a tab indicator needs.
- The SG legs (`LegBars`) and the putting bands (`PuttBands`) glide by transform: each bar, whisker and mark is laid
  out once at its new place, and while the glide runs a `translate`/`scale` maps it from where it was drawn
  (`glide-transform.ts`). They tweened `left`/`width`/`top` each frame, which relaid out every frame. At rest, under
  reduced motion and on first paint no transform is set; durations are unchanged (the shared glide).
- Hero tag (`.ch-pf-tag`): the 12 medium role (Text Size), and it grows with the text instead of clipping at 22px.
  Measured 11.7:1 (light) and 8.1:1 (dark) on the phone hero's fairway stripes; 11.2:1 (light) and 9.3:1 (dark) on the framed desktop head.
- Hero title: the base rule is the 34 strong large-title role instead of a raw light `400 46px` (the framed desktop
  head keeps the shell's 44/600 for every page title).
- Hero figures: the caption under each figure keeps the text face (normal width and tracking). With the figure's
  condensed width and tight tracking inherited, "Team 72.8" drew as "Team 728" in Chromium.
- Hero at 1280 and wider: the SG change's words wrap beside their chip ("No clear change / vs previous 10") instead of
  holding one line. One line made the SG column about 265px against the others' 90 and squeezed the name column until
  the four actions stood in three rows; they now take two, and the head is about 65px shorter.
- The change chip: no dash glyph for a change inside its standard error (it read "— −1.3"); the flat chip has a
  hairline ring in light, where its ivory fill all but vanished (1.05:1) and the number looked indented. The chip's
  type is the 12 strong role.
- Phone: "No clear change" in the figure row wraps inside its column (balanced). It ran 11px past the 16px page edge at
  375 and 393. The trend's empty gauge cell no longer draws a seam.
- Phone rounds: each round row has the list chevron (ink-500), and its accessible name says the score, the score to par
  and strokes gained as well as the course and date. The label used to hide the score.

### Verification

- Before/after captures at 393 and 1280, light and dark; a scripted pass for tab hover and selection, the hero, the
  phone figures and the rounds list (`/home/claude/vp/scripts/C/interact.mjs`).
- eslint on the touched files (exit 0); the stats, strokes gained, type-ratchet and geometry vitest files through the
  shared queue (all of this page's pass; the glide test now checks the drawn width as layout width × scale).
