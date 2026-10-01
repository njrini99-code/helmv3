# Clubhouse component depth audit: status

The owner's "GolfHelm Component Depth and Native Fidelity Audit" and the
Messages "clarity and depth repair example" (2026-10-01) are the briefs. The
owner's direction: "Everything is flat and looks basic"; a full audit with
fixes across the app, Messages as the worked example (PROGRESS Q-142). Branch
`agent/swap-audit` (PR #2111).

Status words as in `HIGH_FIDELITY_AUDIT.md`: **fixed**, **confirmed**,
**open**, **blocked**, **not exercised**.

## The depth system (`src/clubhouse/styles/tokens.css`)

Depth follows a component's role, from one ladder of tokens:

| Role | Token | Used by |
| --- | --- | --- |
| Canvas | `--ch-bg-page` | the page under everything |
| Reading surface | `--ch-elevation-reading` | cards, panels, lists, sheets |
| Raised control | `--ch-elevation-control` | options, chips, segmented pill |
| Floating surface | `--ch-elevation-floating` | the desktop composer |
| Overlay | `--ch-elevation-overlay` | menus, popovers |
| Bottom sheet | `--ch-elevation-sheet` | the More and bell sheets |
| Message bubble | `--ch-elevation-bubble`, `-mine` | Messages |
| Switch | `--ch-switch-*` | every switch |

A reading surface has a crisp edge, a contact shadow and two soft ambient
layers. A raised control adds a top highlight. The older `--ch-shadow-sm`,
`--ch-shadow-lg` and `--ch-sheet-shadow` now read their role on the ladder,
so their many uses moved with it. In the page stylesheets, 56 flat cards and
16 tap controls (a ring and nothing else) moved onto their role.

Surfaces (owner, Q-142: the ivory ladder, never white): on a phone the canvas
is `#EDE8DC` (was the beige `#E2DCCD`) under `#FBF9F4` cards, bubbles and
composer. On desktop the canvas is `--ch-ivory-150` under the same `#FCFBF7`
sheets. Text contrast on the new canvas: primary 14.1:1, secondary 6.4:1,
tertiary 5.5:1 (phone).

## Findings

- **D01 depth exists but is spread thin: fixed.** One ladder; cards lift off
  the canvas instead of matching it.
- **D02 glass: fixed in part.** Blur 20px (Q-139); saturation 170% is now
  110% (`--ch-glass-saturate`), and the phone bars are lighter and more
  opaque. Glass stays on the top bar and tab bar (Q-139). Safari profiling:
  not exercised.
- **D03 composer double ring: fixed.** One edge, a highlight and a soft
  ambient shadow; focus keeps the green edge and halo.
- **D04 bubbles share card elevation: fixed.** Bubbles have their own lighter
  role; the green bubble keeps a green-tinted shadow.
- **D05 sculpted switches: fixed.** A solid track with one inner edge, a white
  thumb with one contact and one soft shadow (supersedes Q-139's tactile
  switch, Q-142).
- **D06 focus varies by control: fixed.** One focus language: the green edge
  and a green halo (`--ch-focus-halo` was a dark halo) on inputs, selects,
  search, the composers and Ask. At rest a field is an edge with a faint inner
  top shadow, so it reads as a place to type rather than a card.
- **D07 shell recipes: fixed.** Inventoried by role. The two bottom sheets
  (More, the bell) take `--ch-elevation-sheet` (a top edge and a long soft
  shadow) instead of a raw black shadow; the More list and card read the
  ladder. Kept on purpose as light-on-green variants: the selected sidebar
  item, the next-event card and the canvas frame, whose gold edge and darker
  shadow are balanced for the green, not the ivory.

Calendar (phone day): an event is a card; a class or busy block stays an
unlifted hatch, so time a player is not free never reads as an event.

## Messages (the worked example)

Phone thread: bubbles on the ladder, message text 17px (Q-142), sender names
13px semibold, timestamps 12px, a quieter "Today" divider with room around
it, a white composer bar with a top rule. Avatars app-wide: one sage coin
with dark initials (8.7:1) and a contact shadow, not concentric rings.

The fuzziness in the owner's reference: that image was this session's own
Playwright capture at 1x density, viewed on a retina phone, and its "avatar"
in the composer was the Next.js development badge. The capture spec now
shoots at 2x and hides the badge. A direct iPhone screenshot is still the
real test (not exercised).

## Evidence

`e2e/clubhouse-materials.spec.ts` shoots 16 preview screens at 390 and 1280
wide, at 2x, before and after (local only). Resting appearance only; motion,
keyboard on a device, Safari traces, text enlargement and a real iPhone are
not exercised.
