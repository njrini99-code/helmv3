# 2026-10-28 — Messages visual pass

## 2026-10-28 — Bubbles on 16 with a 6 tail, cards on 16, reaction glyphs at the house stroke

```text
Design package: none (Clubhouse visual pass 2026-10-28, area E; RUBRIC H17 and
                the
                Messages checklist: "bubbles radius 16 with a 6 tail", "reaction
                glyph stroke 1.6, not 2.3")
PR/commit:      visual-pass-2026-10-28
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     Safari/iPhone: vector-effect: non-scaling-stroke on the reaction
                glyph paths (WebKit supports it; confirm the 1.6px line on a 3x
                screen), and the phone tail's join at the 16 corner
```

### Changed

- A bubble's corner is 16, not 20, on desktop and the phone (`.ch-ms-bub`,
  `.ch-msp-thread .ch-ms-bub`); the 6 tail corners that join a sender's run and
  close it are unchanged. At 20 a one-line bubble read as a pill. The typing
  bubble and the phone's long-press preview follow.
- Announcement cards (`.ch-ms-ann`) and the folded Announcements card on the
  inbox (`.ch-ms-sec.is-ann`) are on the 16 card radius (were 20).
- Reaction glyphs (chips, the reaction bar, who-reacted heads) draw a 1.6px line
  at every size. The old `stroke-width: 2.3` was in the 24-unit drawing, so it
  drew 1.15px at the chips' 12px and 1.44px in the bar's 15px: thinner and less
  even than the house stroke, against the owner's "more contrast" note
  (2026-10-08). The glyph paths now take `vector-effect: non-scaling-stroke`.

### Verification

- `messages.test`, `messages-polls-css`, `conv-row-seams` and the CSS ratchets
  (`chips-tabs`, `elevation-tokens`, `hairlines`, `legacy-type-roles`,
  `long-lists-css`, `large-title`) pass; `look-feel-pass-css` fails only on
  other
  areas' in-progress files (roster, stats, home, tournaments-review), not
  messages.css.
- Before: `/home/claude/vp/before/{light,dark}/{393,1280}/messages*.png`; after:
  `/home/claude/vp/after-E/` and `/home/claude/vp/after-int-E/` (thread,
  composer,
  long press, reaction bar, details).
