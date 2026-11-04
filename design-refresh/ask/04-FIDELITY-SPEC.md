# 04. CoachHelm Ask: fidelity spec

How closely the build must match the design page v12 (https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA, local copy `redesign/coachhelm-ask.html`). This file is the short version: tokens, contrast, the rules every piece follows, and what the page draws that the build must not copy. The detail lives in 05 to 08, and where they and this file disagree, they win.

- `05-SCREENS.md`: every screen ID, how you get there, its design anchor and app route, and its state matrix.
- `06-SCREEN-SPECS.md`: the piece library (E-codes) and each ID's pieces, copy, data and redline.
- `07-MOTION.md`: one row per interaction (M-ASK-01 to M-ASK-89), never-animate list, interrupt cases.
- `08-ACCEPTANCE.md`: pass or fail criteria per ID (the coordinator's file).
- `capture/capture.mjs`: shoots both sides per ID and state, and records the motion clips. `capture/contrast-table.txt`: every text and mark pair, light and dark.

## Tokens

The page's tokens and the app tokens to use (`src/clubhouse/styles/tokens.css`). Names marked "add" are new and come in with AK0 (or BUILD_BRIEF PR 1 and Messages 11a, if they land first).

| Page token | App token | Light | Dark |
|---|---|---|---|
| `--page` | `--ch-grouped-bg` | #F2F0E9 | #0E120F |
| `--card` | `--ch-card-bg` | #FFFEFB | #191E1A |
| `--well` | `--ch-well-bg-flat` | #F6F4EE | #141815 |
| `--ink` | `--ch-text-primary` | #1C1B18 | #F1ECDF |
| `--ink2` | `--ch-text-secondary` | #46433D | #D0C9B8 |
| `--ink3` | `--ch-text-tertiary` | #5F5C55 | #ADA697 |
| `--gain` | `--ch-gain` | #14613D | #7CC79B |
| `--loss` | `--ch-loss` | #9A5700 | #E7AE57 |
| `--flag` | `--ch-flag` | #B3261E | #F28B7D |
| `--accent` | `--ch-accent` | #155A39 | #7CC79B |
| `--btn` | `--ch-accent (button fill)` | #155A39 | #7CC79B |
| `--onbtn` | `--ch-text-on-accent` | #FFFEFB | #0E120F |
| `--sep` | `--ch-separator` | rgb(28 27 24/.10) | rgb(241 236 223/.10) |
| `--ring` | `--ch-card-ring` | rgb(28 27 24/.07) | rgb(255 255 255/.06) |
| `--hair` | `--ch-border-hairline` | rgb(28 27 24/.14) | rgb(241 236 223/.14) |
| `--hair2` | `--ch-border-hairline at 8% (add --ch-ak-hair-2)` | rgb(28 27 24/.08) | rgb(241 236 223/.08) |
| `--frame` | `--ch-frame` | #0a331f | #08150e |
| `--frame2` | `--ch-frame raised (add --ch-ak-frame-2)` | #0d3d26 | #0b1d13 |
| `--onframe` | `--ch-on-green-ink` | #f4eedd | #f4eedd |
| `--onframe2` | `--ch-on-green-ink-soft` | rgb(240 233 214/.86) | rgb(240 233 214/.86) |
| `--champ` | `--ch-champagne-500` | #D8B871 | #D8B871 |
| `--gainfill` | `--ch-chart-gain-fill` | #1F6B45 | #4FA877 |
| `--lossfill` | `--ch-chart-loss-fill` | #B86F0C | #E09A35 |
| `--neutral` | `--ch-chart-flat` | #6B675F | #A39D90 |
| `--track` | `--ch-chart-track` | #EBE5D8 | #2C322D |
| `--zero` | `--ch-chart-zero` | #5F5C55 | #ADA697 |
| `--feature` | `--ch-feature-bg` | #0B3A25 | #123D29 |
| `--fink` | `--ch-feature-ink` | #F4F1E8 | #F4F1E8 |
| `--fink2` | `--ch-feature-ink-2` | #D3D9CB | #D3D9CB |
| `--glass` | `--ch-glass-bg` | rgb(253 251 247/.80) | rgb(22 27 23/.78) |
| `--glass-strong` | `--ch-glass-bg (strong, add --ch-ak-glass-strong)` | rgb(253 251 247/.9) | rgb(27 32 28/.88) |
| `--userbub` | `--ch-bubble-mine-bg (top)` | #155A39 | #1F4D35 |
| `--userbub2` | `--ch-bubble-mine-bg (bottom)` | #0F4A2E | #173D2A |
| `--onuser` | `--ch-bubble-mine-ink (Messages 11a)` | #F7F4EA | #F1ECDF |
| `--tint-acc` | `--ch-selected-tint` | rgb(21 90 57/.10) | rgb(124 199 155/.14) |
| `--tint-loss` | `--ch-chart-loss-tint` | rgb(154 87 0/.12) | rgb(231 174 87/.14) |
| `--shadow-float` | `--ch-shadow-float` | 3-layer float | 3-layer float |
| `--shadow-recv` | `--ch-elevation-bubble` | drop-shadow x3 | drop-shadow x2 |
| `--shadow-sent` | `--ch-elevation-bubble-mine` | drop-shadow x2 | drop-shadow x2 |
| `--scrim` | `--ch-push-dim` | rgb(14 12 8/.32) | rgb(0 0 0/.5) |
| `--foldb` | add --ch-ak-fold-back | #CDBB8C | #6B6047 |
| `--foldf` | add --ch-ak-fold-front | #E6D8AF | #8A7C59 |

Type: SF Pro (system) at the page's sizes, scaled by `--ch-type-scale` (1.353 at XXL; the page uses `--k` 1.36). Radii: answer card 22, kit card 18, wells 16, chips and capsules 99. Spacing does not scale with Text Size. Springs and curves: see 07, "Springs and curves".

## Contrast summary

`capture/contrast-table.txt` lists 79 pairs, each light and dark, computed from the page's own tokens by `capture/contrast.py`. Text must reach 4.9:1 (4.5:1 floor); marks 3:1 (SHARED-4).

- Flags at v12: 0. The v11 failures are fixed on the page: Urgent label #8A4C00 (5.41 / 5.29), the cancelled draft loses colour with `saturate(0)` instead of opacity (8.97 / 10.86 secondary), the paused composer keeps full opacity (6.39 / 6.96), seated lineup rows use ink2 with the coin at `saturate(.25)` (8.96 / 10.87; coins 5.95 to 6.88), folder list document rows are full opacity ink2 with the icon at 70% (9.77 / 10.25; icon 3.30 / 4.12).
- Exempt, with the reason: Told coin before it lights (initials at 35%) 2.07 / 2.07 (exempt: the unlit coin is a transitional frame); Cancel after the confirm press (disabled, 50%) 2.57 / 3.57 (exempt (disabled)); Back on the first brief question (disabled, 40%) 2.07 / 2.76 (exempt (disabled)); Undo ring track against card 1.24 / 1.29 (exempt: track is decorative (the drain carries the meaning, 8.15/8.45)).
- Lowest passing text: Loss on well (tied standings) 5.11, Lock banner Urgent (#8A4C00 on 90% ivory over frame) 5.29, Coin initials #fdfcf8 on #9A5700 (AN) 5.47, Coin initials #fdfcf8 on #6B675F (SA) 5.48.

## Rules every piece follows

- One answer card per turn (E-CARD) with the Messages receive shadow, 22 radius, 22 gap between turns; no accent left borders (SHARED-3); the page is flat (SHARED-2).
- The green bar, the parchment sheet and the Board | Ask segmented control stay as they are today (SHARED-1).
- Every write goes through the kit: draft card, On confirm line, Cancel and the primary verb button, capsule, flight to where it lands, receipt with 8s Undo, Told row after the window. A write that cannot be undone (Lock lineup) says so on its own card and has no Undo (AK4, AK11d).
- Amber (`--ch-loss`, loss fills) for losses, ties and failed reads; red only for under par on hole strips. Green for gains and the accent.
- Sentence case everywhere; no tracked uppercase labels, even where the page draws them.
- Every hit area at least 44×44; smaller drawn targets grow with a transparent `::after`.
- Text grows at XXL and never clips (SHARED-5); phone edge 16, 20 at 430 (SHARED-7); desktop thread column max 680, pane 452.
- Motion only from the shared springs by name; Reduce Motion is a `CH_FADE_MS` (180ms today) opacity fade with no travel (SHARED-6, 07).
- Players never see a teammate's figures and never see write tools; coach-only pieces are absent from the player DOM (SHARED-11, AK10a).
- Pieces map to PRs: AK1 answer card, steps, composer; AK2 read chips and sources; AK3 tool cards, follow-ups, strokes gained; AK4 confirm, receipt, moments, kit; AK5 artifacts and publish; AK6 putt profile and miss pattern; AK7 season and hole strip; AK8 tone, history, CoachHelm knows; AK9 practice brief and save to folder; AK10a player Ask, AK10b allowance; AK11a to AK11e the create flows. Shared criteria are SHARED-1 to SHARED-12 in `ACCEPTANCE-SHARED.md`.

## Can't match as drawn

What the page draws that the build does differently, and what to build instead.

- Curves: the page's `--ease` is cubic-bezier(.2,.7,.2,1) and its CSS `--spring` and `--spring-pop` are fixed `linear()` strings at fixed durations. Build with `--ch-ease` and the named springs (`smooth`, `settle`, `reveal`, `send`, `pop`, `lift`); 07 gives each row's spring and its settle time.
- Animated layout: the desktop pane widens by its grid column, the steps body and the sources list by `grid-template-rows`, the brief viewport by height, the allowance meter by width. Build these on transform or clip with the same timing (07).
- Animated box-shadow: the free slot pulse (`slotp`) and the avatar ping (`ping`). Build as an opacity or scale on a ring layer.
- Reduce Motion: the page sets most transitions to 1ms; only some pieces get its 120ms fade. Build the 120ms fade everywhere (SHARED-6). The app's `CH_FADE_MS` is 180; this lane uses 120 to match SHARED-6 and 08.
- Tracked uppercase labels: `.fsec`, `.hsh small`, `.lu small`, `.gtar .wl`, `.fgm b`, `.callsd .dec`, `.lockp .b1 b` and the 0.04em day labels. Build in sentence case with no tracking.
- Red where red is not under par: the trip route flag and the drill flag use `--flag`. Build them in ink (or `--ch-loss`).
- XXL: many labels are fixed px (9.5, 10.5, 11) and do not take `--k`; the page's `--k` is 1.36 against the app's 1.353. Every size takes `--ch-type-scale` in the build.
- Phone edge at 430: the page keeps 16; build 20 (SHARED-7).
- Hard-coded colours: the lock screen banner (fixed light by design, keep it), the uniform swatches (#1F6B45, #FBF9F3) and the player coin fills. Map swatches to tokens and coins to the roster's colours.
- Hit areas under 44 on the page: read chips, the 32 expand button, the 38 composer buttons, receipt links, the 24 version arrows and follow-up chips. Build with the `::after` rule.
- Version arrows read "1 of 1" on a plan with one version. Hide them until there is a second version.
- Change answers on the folded brief has no handler on the page. Build S-ASK.brief.change (05).
- Counted reads tick their detail line (a count-up). Show the final figure.
- Fixed in version 13: the round note's "Where it lands" header icon rendered the text "undefined" (`FI.flag` was missing). The page now draws a flag outline in currentColor; the build uses the round review icon.
- The moments stage bar, the pieces board and the 47 status bar are design page chrome. Not built.
- On the page, `&stage=confirm` holds before Cancel and the primary button get their listeners, so neither can be pressed while held; capture reaches Cancelled by stepping the clock instead. The build has no hold.
- On the page a run sets `data-stage=done` before the 8s Undo timer sets `told`, and `lock` and `locked` after that. Capture waits on the DOM, not on the order.

