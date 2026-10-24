# 2026-10-24 — Tinted drops on the green and ink surfaces (row 40)

## 2026-10-24 — four drop tokens; the green and ink surfaces read them

```text
Design package: none (Clubhouse A+ handoff, row 40; FINISH_DIRECTIONS S1 item 2)
PR/commit:      agent/aplus-s1
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     the medallion's own lift (shell.css .ch-empty-page__ic, 0 16px
                30px -14px), the frame lifts (.ch-canvas, the sign-in and
                onboarding panels), the slider and switch thumbs, and the ivory
                chips' ink drops stay raw: they are not green or ink surfaces,
                or no step fits them without a visible change.
```

### Changed

- tokens.css: `--ch-drop-green-1` (0 1px 2px, a chip that is on),
  `--ch-drop-green-2` (0 4px 12px -4px, a pill), `--ch-drop-green-3` (0 10px
  20px -10px, a key), all in the green `rgb(11 58 37)`, and `--ch-drop-ink` (a
  hairline ring and 0 12px 32px -8px, an ink pill). One value in both themes; a
  surface with its own dark lift keeps it.
- Same look: Classes' add key and day picker, the Hub's RSVP choice, Messages'
  "N new messages" pill and the toast now read the token with their old value.
- Removed: `.ch-ms-send.is-ready`'s first box-shadow (messages.css), which the
  later rule of the same selector always overrode (no visual change).
- Visible, small: Track's hole number key goes from 0 8px 16px -10px to the key
  step (0 10px 20px -10px, as Classes' add key), and Stats' "Updating" pill from
  0 8px 22px -8px to the toast's 0 12px 32px -8px.
- elevation-tokens.test: RAW_SHADOW and RAW_DROP lowered (classes, hub,
  messages, rounds-track, stats, ui); each surface is pinned to its token.

### Why

- Row 40 asked for tinted lifts under green and ink surfaces from tokens, not
  hand-set per screen.

### Verification

- `npx vitest run src/clubhouse/__tests__/elevation-tokens.test.ts`. Needs a
  look in light and dark: Track's hole number and Stats' "Updating" pill.
