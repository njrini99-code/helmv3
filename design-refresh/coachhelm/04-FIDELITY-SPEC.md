# CoachHelm quick chat: fidelity spec

This lane's fidelity spec is split into the four build-contract files, which win over this one wherever they differ:

| File | Holds |
|---|---|
| `05-SCREENS.md` | every screen, subscreen, card, menu and state, with its design anchor, app route and PR |
| `06-SCREEN-SPECS.md` | each element's box, type, colour token (light and dark hex), contrast, icon, hit area and data field, with a redline list per screen |
| `07-MOTION.md` | one row per move: trigger, property, from and to, duration, spring or curve, delay or stagger, interruptibility, Reduce Motion version, haptic, and the clip that checks it |
| `08-ACCEPTANCE.md` | pass or fail criteria per screen and per PR, and the side-by-side rules |

The summary below is what a reviewer needs in their head while reading those four.

## 1. The look in one paragraph

The green bar doesn't change except that its sparkle key becomes the Helm key in the same 44pt slot. The panel is the only glass in the app: a frosted frame with a lit top edge and a soft two-layer shadow over a light veil. Inside, nothing is read through glass: below the header the scrolling body is a solid sheet 6pt in from the frame, and tiles, cards, steps, receipts and the composer sit on it. Year colours stay with class years; the start tiles use the accent tint. Failures are amber, never red. No accent left borders. Type follows iPhone Text Size; the panel's size doesn't, so content scrolls inside it at XXL.

## 2. Sizes that define it

- Phone panel: 10pt from each side, top 104, height 700 (never under the keyboard), radius 32, grab bar 36×5.
- Desktop panel: 432 wide, 14 from the right, top 62, height 640, radius 26.
- Key: 44×44 hit target, 24pt mark at stroke 1.7, disc inset 4 radius 18; flag 9pt champagne.
- Live pill: 36 tall, radius 18, fill #06231a, 13.5pt semibold label, one line.
- Task card radius 16, icon tile 32 radius 10; question card radius 16, padding 14; step rows 32 tall, 15pt.
- Exact values and every other element: 06.

## 3. Motion in one paragraph

The panel pours out of the key on the new `pour` spring (visualDuration 0.42, bounce 0), scaling from 0.5 at the key's centre with opacity full almost at once, and its parts rise 8pt, 30ms apart. It closes back into the key in 220ms on `cubic-bezier(0.32, 0.72, 0, 1)`, content fading first. Tapping mid-flight reverses from where it is. Inside, everything moves with today's `smooth` and `settle` springs: steps rise in and their checks draw, the confirm card settles, the object flies home, the receipt's check draws while the Undo ring drains over 8 seconds, then players' coins light up in delivery order. Only transform and opacity move (the check and the Undo ring are SVG strokes); the panel never changes height. Under Reduce Motion every move is a `CH_FADE_MS` crossfade (180ms today, the shared value) and loops stop. Exact rows: 07.

## 4. Checks

Shots and clips: `capture/capture.mjs` (README has the commands). In-page motion tests: open the design page at `#motion-check`; the same six tests run against the app in QC6.
