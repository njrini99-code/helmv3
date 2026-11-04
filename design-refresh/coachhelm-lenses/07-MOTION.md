# 07. CoachHelm Lenses: motion

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 9 rows).

One row per interaction on every screen ID in `05-SCREENS.md`. Values were read off the design page's script and CSS (`redesign/coachhelm-lenses.html`, version 6, 3 Nov), and the page itself was rebuilt in v6 to move on the app's own primitives, so the page and the build run the same curves. Where this file and `04-FIDELITY-SPEC.md` §7 disagree, this file wins; 04's own section 7 values and its scrim are superseded.

Rule of the lane: every move is one the app already has. Nothing here adds a curve, a duration or a spring. Pushes, sheets, menus, toasts, Swap and the press controller are today's components, unchanged.

## Tokens

| Token | Value | Where |
|---|---|---|
| `--ch-ease` / `CH_EASE` | `cubic-bezier(0.22, 1, 0.36, 1)` | `tokens.css`, `lib/motion.ts` |
| `--ch-ease-spring` / `SPRING_BACK` | `cubic-bezier(0.34, 1.3, 0.64, 1)` (the press release) | `tokens.css` |
| `CH_DUR` | press 110, quick 180, base 260, release 280, reveal 520 | `lib/motion.ts` |
| `CH_SPRINGS.smooth` / `--ch-ease-spring-smooth` | stiffness 405.6, damping 40.28, mass 1; 462ms to rest; `linear(0, 0.0418, 0.136, 0.2508, 0.3677, 0.477, 0.5739, 0.657, 0.7266, 0.7839, 0.8303, 0.8675, 0.8971, 0.9204, 0.9387, 0.953, 0.964, 0.9725, 0.9791, 0.9841, 0.988, 0.9909, 0.9931, 0.9948, 0.9961, 0.9971, 0.9978, 0.9983, 0.9988, 1)` | `tokens.css`, `lib/motion.ts` |
| `CH_SPRINGS.settle` | damping 36.25, base 260 visual, bounce 0.1; 417ms; peak 1.0015; `linear(0, 0.0429, 0.1419, 0.2645, 0.3907, 0.509, 0.6136, 0.7024, 0.7754, 0.8338, 0.8795, 0.9145, 0.9408, 0.9601, 0.974, 0.9839, 0.9906, 0.9952, 0.9981, 0.9998, 1.0008, 1.0013, 1.0015, 1.0015, 1.0014, 1.0012, 1)` (sampled the way `chSpringCurve` does) | `lib/motion.ts` |
| `CH_POP` | menu: in from `opacity 0, translateY(-4px) scale(.97)`; out to `translateY(-2px) scale(.98)`; 180, `--ch-ease` | `lib/motion.ts`, `ui/Menu` |
| `CH_ROUTE` | desktop route swap: in from `opacity 0, translateY(6px)`; out to `translateY(-4px)`; 260, `--ch-ease` | `lib/motion.ts` |
| `--ch-vt-parallax` | `-24%` (outgoing page on push; `CH_UNDERLAY_SHIFT` 0.24). It is `-30%` at 75b4956; PR 1 sets `-24%` and updates the one line of `native-nav.test.tsx` that pins `-30%` | `tokens.css:1134`, `nav-motion.ts:227` |
| `--ch-vt-push-dim` | `brightness(0.9)` | `tokens.css` |
| `--ch-dur-shimmer` | 1.9s, `linear` (0ms under Reduce Motion) | `tokens.css`, `.ch-skel` |
| `CH_FADE_MS` | 180, every Reduce Motion fade on this lane | `lib/motion.ts:45` (pinned by `reduced-motion.test.tsx:57`; leave it untouched) |

### Settled, and one known difference

1. **Reduce Motion length is 180ms.** SHARED-6 (3 Nov) settles it: every Reduce Motion fade is `CH_FADE_MS` from `lib/motion.ts`, 180ms today (owner decision, 24 Oct), and where a lane file says 120ms it reads `CH_FADE_MS`. That replaces this package's earlier 120ms (02 §13 item 9, 04 §8 A, README). The shared push, sheet and menu already fade with it (`nav-motion.ts:393`, `dialog-lifetime.ts:21, 28, 135, 136`); the lens fold, the pill and the rail swap import it too. No local 120 token. The page now draws 180 everywhere.
2. **Push underlay is 24%.** START_HERE's shared values settle it: the page behind moves 24% left (`CH_UNDERLAY_SHIFT` 0.24) and dims to `brightness(0.9)`, 462ms on `--ch-ease-spring-smooth`. The code at 75b4956 moves `--ch-vt-parallax` −30%; PR 1 changes it to −24%, so route pushes and stack pushes match and today's push is 24% too.

## App owner decisions this file follows over DESIGN_LANGUAGE §8

- Rows and cards never scale; they take a pressed tint (owner, 1 Oct, F02). DESIGN_LANGUAGE's "cards 0.97" is superseded.
- Chart marks are drawn at rest; nothing grows on first paint (owner, 24 Oct; OQ-16). Marks glide over base 260 only when figures change while on screen. DESIGN_LANGUAGE's "chart grow 360" is superseded.
- Segmented thumb rides `CH_SPRINGS.settle` (417), not 360. Sheet close rides the smooth spring it rose on, not "down 280".
- No count-ups, no entrance staggers, no motion on re-render (SHARED-6).

## Motion table

| ID | Screen | Trigger | Element(s) | Property | From → to | Duration | Curve or spring | Delay / stagger | Interruptible | Reduce Motion | Haptic | Check |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-LNS-01 | S-LIST → S-FILE (phone) | tap release on a player row (`data-ch-hf-open`); a 10pt move first is a scroll | incoming file page; outgoing list page | transform, filter | file `translateX(100%)` → `0`; list `0` → `translateX(-24%)` and `brightness(1)` → `brightness(0.9)` | 462 | `CH_SPRINGS.smooth` | the row's tint (M-LNS-03) shows first; the push starts on release | yes: Back or the edge swipe mid-push retargets from the current position | crossfade, opacity only, `CH_FADE_MS` 180 | none | clip `push`, frames 0 / 231 / 462 |
| M-LNS-02 | S-FILE → S-LIST (phone) | Back in the bar, or the native iOS edge swipe | as M-LNS-01 | as M-LNS-01 | the reverse; the swipe follows the finger and finishes or cancels on release by today's thresholds | 462 | `CH_SPRINGS.smooth` | none | yes: the swipe can reverse; a second Back is ignored until it settles | as M-LNS-01 | none | clip `pop` |
| M-LNS-03 | S-LIST, S-FILE.rail, every read row | pointer down on a row | the row | background | none → `--a-press` | lands 50ms after the finger, clears at once | none (step) | 50 | yes: moving 10pt clears it (a scroll) | same: a tint is not motion | none | DOM: no `transform` on rows during press |
| M-LNS-04 | S-FILE.lens | tap a lens segment (`data-ch-lens`) | lens-only cards folding (`[data-wrap]`: your plan, track record out; what's working in) | height, margin-top, opacity | leaving: height `h` → `0`, margin `0` → `-24px`, opacity `1` → `0`; arriving: the reverse | height 462; opacity 180 out, 260 in | height `CH_SPRINGS.smooth`; opacity `--ch-ease` | none: every fold runs together | yes: a second tap mid-fold retargets each card from its current height | the whole file crossfades, opacity `0` → `1`, `CH_FADE_MS` 180, scroll position kept | select (from today's Segmented) | clip `lens`, 462ms frame equals the lens still |
| M-LNS-05 | S-FILE.lens, S-BOARD view strip | tap a segment | the thumb | transform, width | from the old segment's x and width to the new | 417 | `CH_SPRINGS.settle` | none | yes: retargets from where it is | jumps, no motion | select | clip `lens`, thumb frames |
| M-LNS-06 | S-FILE.lens | same tap | shared cards (feature, plan, field, reads, strokes) changing their words | opacity, transform, height | today's Swap: old copy `opacity 1` → `0`; new copy `opacity 0` → `1` and `translateY(6px)` → `0`; frame height old → new | old 180; new 260 (opacity), 417 (rise); height 180 | opacity and height `--ch-ease`; rise `CH_SPRINGS.settle` | none | yes: Swap retargets (`popLayout`) | instant swap, no motion (today's Swap with Reduce Motion or Animations off) | none | clip `lens`; DOM: one copy left after 417 |
| M-LNS-07 | S-FILE.read, S-BOARD.read, S-FILE.plan | tap the feature card, a read row, or Edit plan | scrim; sheet (phone) or dialog (desktop) | opacity, transform | scrim `0` → `1`; phone sheet `translateY(100%)` → `0`; desktop dialog `opacity 0, translateY(6px) scale(.98)` → `none` | scrim 260; phone sheet 462; desktop 260 | scrim `--ch-ease`; phone `CH_SPRINGS.smooth`; desktop `--ch-ease` | none | yes: a close mid-rise retargets on the same spring | crossfade `CH_FADE_MS` 180 (`dialog-lifetime.ts`) | none | clips `sheet` (390) and `dialog` (1280) |
| M-LNS-08 | the three sheets | X, Cancel, scrim tap, Esc, Dismiss, Assign, Save plan | as M-LNS-07 | as M-LNS-07 | the reverse; phone carries a flick's speed into the spring | phone 462; desktop 260 | phone `CH_SPRINGS.smooth`; desktop `--ch-ease` | none | yes | as M-LNS-07 | none | clip `sheet`, close half |
| M-LNS-09 | the three sheets (phone) | drag down on the head or grabber; the body only once it's scrolled to the top | sheet | transform | follows the finger; past 80pt or a 0.5pt/ms flick it closes (M-LNS-08), else springs back on the smooth spring | live; release 462 | rubber band `(1 − 1/(x · 0.55 / 100 + 1)) · 100` upward, floor 120 | none | yes, by nature | drag still works; the close is a 180 fade | none | DOM test with today's thresholds: claim 3, body slop 6, velocity window 60ms, flick max age 80ms, scroll guard 100, click guard 300 |
| M-LNS-10 | S-FILE.lens | lens flips to "As Eli sees it" or back | preview pill | height, opacity, transform | fold in as M-LNS-04 plus `translateY(6px)` → `0`; out as M-LNS-04 | fold 462; rise 417 | as M-LNS-04; rise `CH_SPRINGS.settle` | none | as M-LNS-04 | inside the 180 file crossfade | none | clip `lens` |
| M-LNS-11 | S-FILE.more | tap More (`data-ch-hf-more`) | menu | opacity, transform | `CH_POP` in: `opacity 0, translateY(-4px) scale(.97)` → `none`, origin top right | 180 | `--ch-ease` | none | yes: a second tap closes from where it is | crossfade `CH_FADE_MS` 180 | select | clip `menu` |
| M-LNS-12 | S-FILE.more | pick, Esc, outside tap, scroll | menu | opacity, transform | `CH_POP` out: to `opacity 0, translateY(-2px) scale(.98)` | 180 | `--ch-ease` | none | finishes | as M-LNS-11 | select on a pick | clip `menu`, close half |
| M-LNS-13 | every `.ch-btn` and `[data-ch-press]` under 240 wide, plan picks | pointer down | the button | transform | `scale(1)` → `scale(max(0.96, 1 − 6/width))`, back to `1` | down 110; back 280 | down `--ch-ease`; back `SPRING_BACK` | touch waits 70ms before pressing; a quick tap still shows the press for 90ms | yes: release mid-press springs back from the current scale; a 10pt move cancels | none, static | none | clip `press`, frame at 110 shows the scale |
| M-LNS-14 | feature card, every card that opens something | pointer down | the card | box-shadow (inset tint) | none → inset `--a-press` (white 5% on the feature card) | lands 50ms after the finger, clears at once | none (step) | 50 | a button pressed inside the card shows no card tint | same | none | DOM: no `transform` on cards |
| M-LNS-15 | S-FILE.focus | Assign write succeeds (feature card or sheet footer) | feature card, plan card, the read's row chip | today's Swap (as M-LNS-06) | actions → "Sent to {first}"; plan card no focus → Suggested; row chip Priority → Assigned (no motion on the chip) | as M-LNS-06 | as M-LNS-06 | the sheet closes first (M-LNS-08), then the swap | no: controls are disabled while the write runs ("Assigning") | instant swap | success (today's `useFocusActions`); error on failure | clip `assign` |
| M-LNS-16 | S-FILE.focus, plan card | the Suggested step becomes reached while on screen (only after Assign) | step line; step dot; tick | width; background and ring; stroke-dashoffset | line `0` → `100%`; dot ring → `--ch-chart-gain-fill`; tick `14` → `0` | line 260; dot 180; tick 260 | `--ch-ease` | tick starts 120 after the dot | finishes | steps drawn reached, no fill motion | none | clip `assign`, line full at 260 |
| M-LNS-17 | S-BOARD.focus | Accept (`data-ch-hf-accept`) or Decline (`data-ch-hf-decline`) succeeds | feature card actions; plan card line | today's Swap | Accept / Decline → "Your focus since {date}" or the no-focus kicker | as M-LNS-06 | as M-LNS-06 | none | no while the write runs ("Accepting", "Declining") | instant swap | success; error on failure | clip `accept` |
| M-LNS-18 | S-FILE.undo | Dismiss succeeds (sheet footer) | the read's row; an older dismissed row if one shows | today's Swap | older dismissed row → its read row; then the read row → "Dismissed: … Undo" | as M-LNS-06, one after the other | as M-LNS-06 | the sheet closes first; the older row swaps first | no while the write runs ("Dismissing") | instant swaps | success; error on failure | clip `dismiss` |
| M-LNS-19 | S-FILE.undo | Undo succeeds (`data-ch-hf-undo`) | the dismissed row | today's Swap | "Dismissed: … Undo" → the read row | as M-LNS-06 | as M-LNS-06 | none | no while the write runs ("Undoing") | instant swap | success; error on failure | clip `undo` |
| M-LNS-20 | S-FILE.rail (desktop) | tap another player in the rail | the file column | opacity, transform | `CH_ROUTE`: in `opacity 0, translateY(6px)` → `none`; out to `translateY(-4px)` | 260 | `--ch-ease` | none | yes: a second pick retargets | crossfade `CH_FADE_MS` 180 | none | clip `rail` at 1280. Not drawn on the page; built from `CH_ROUTE` |
| M-LNS-21 | S-FILE.plan | Save plan succeeds (`data-ch-hf-intent-save`) | sheet; Your plan card | close as M-LNS-08, then today's Swap | sheet away; card old values → new | as M-LNS-08 then M-LNS-06 | as those | the swap starts when the sheet has closed | no while saving ("Saving") | fade close, instant swap | success; error on failure | clip `saveplan` |
| M-LNS-22 | S-FILE.read, S-BOARD.read | tap a correction chip, Not this, a reason, or Change | chip; reasons row; answer line | background, border-color; reasons row and answer line appear | chip `--ch-bg-surface` → `--ch-bg-selected`, border control → strong; reasons row and answer appear without motion | 180 | `--ch-ease` | none | yes: transitions retarget | colour change stays (not motion) | select on Not this and Change; success when saved; error on failure (today's) | DOM test: no transform or height animation |
| M-LNS-23 | S-FILE.plan | tap a pick (`data-ch-hf-pick`) | the pick | background (unpicked ↔ green chip), plus M-LNS-13 press | no fill transition; the picked state lands on release | press 110 / 280 | as M-LNS-13 | none | yes | no press scale | select | clip `saveplan`, first second |
| M-LNS-24 | failed state | Try again (`data-ch-hf-retry`) | failed card → skeleton cards → content | today's refetch: content replaces the skeleton with no motion | none | none | none | none | tap again is ignored while loading | same | none | DOM: skeleton shows, then content, no transition |
| M-LNS-25 | loading state | while a card loads | the skeleton sheen (`.ch-skel::before`) | transform | `translateX(-100%)` → `translateX(100%)`, repeating | 1900 per sweep | `linear`, infinite | none | stops when content lands | no sheen; bars static | none | clip `loading`; reduced clip shows no moving pixels |
| M-LNS-26 | S-FILE, S-BOARD (phone) | page scrolls past 8pt | the bar's scroll shade | opacity | `0` → `1` (and back under 8) | 180 | `--ch-ease` | none | yes | same (opacity only, already allowed) | none | clip `scroll` |
| M-LNS-27 | S-FILE.toast | a write fails, or Assign hits an existing focus | today's toast | today's | today's | today's | today's | today's | today's | today's | error (warning for duplicate) | clip `toast` with `state=failwrites` |
| M-LNS-28 | S-FILE (opened with `at=` and `insight=`) | the file loads from a notification | the scroll position | scroll | jumps straight to the named read's row, no smooth scroll | 0 | none | none | n/a | same | none | DOM: `scrollTop` set before first paint |

## Never animates on this lane

- Count-ups on any figure (the feature comparison, track record, field figure, strokes figures).
- Chart marks on first paint: strokes bars, the team tick, goal line and points, field dots, the evidence gauge and strip. They are drawn at rest.
- Entrance staggers of cards or rows, on load, on lens flip or on Try again.
- Any motion on re-render or refetch where nothing changed (SHARED-6).
- Scale on rows, cards, chips or the feature card (tint only).
- The handshake's Shown and Accepted steps: they fill at rest on a later load, because the player draws them, not the coach's tap. Only Suggested animates, and only right after Assign.
- Blur changes on scroll. The glass on the pill, menu and desktop top bar is static.
- The desktop rail list itself when the file swaps (only the file column moves).
- Text Size changes: layout reflows instantly.
- Loops other than the skeleton sheen. The sheen stops under Reduce Motion (SHARED-6).

## Interrupt cases worth a test

1. Tap Back while the push is still moving: the list returns from the current position on the same spring, with no jump (M-LNS-01, 02).
2. Edge-swipe halfway and let go: below today's threshold it springs back to the file; above it pops.
3. Flip the lens twice quickly: each folding card reverses from its current height; at rest the DOM holds exactly one copy of each shared card and the coach-only cards are absent in the player lens (M-LNS-04, 06).
4. Flip the lens while a sheet is open: the lens control isn't reachable under the scrim; the page doesn't change under the sheet.
5. Close the sheet mid-rise: it reverses on the smooth spring from where it is (M-LNS-07, 08).
6. Flick the sheet down at 0.6pt/ms with only 40pt of travel: it closes. Drag 70pt slowly and let go: it springs back.
7. Scroll the sheet body, then drag down from the middle: the drag claims only once the body is at the top (scroll guard).
8. Press a button and slide off 10pt: the press cancels and springs back, no action fires (M-LNS-13).
9. Press the feature card's Assign button: the card shows no tint, only the button scales (M-LNS-14).
10. Assign, then tap again while "Assigning": nothing fires twice; one success haptic.
11. Dismiss a second read while the first still shows its Undo row: the first row swaps back to its read before the second turns into Undo (M-LNS-18).
12. Tap a rail player while the file is mid-swap: the newest pick wins and the column settles once (M-LNS-20).
13. Reduce Motion on, then do 1, 3, 5: every move is a 180ms opacity fade with no travel, no scale, no height motion; Swap is instant.
14. Animations off in Settings (today's switch): the same as Reduce Motion.

## Completeness pass, 4 Nov 2026

Rows for the states added in 05's Completeness pass section. M-LNS-07 to 09 already carry the shared read sheet's motion; Team's M-TEAM-18 to 21 were fixed in place to the same values, so the one sheet moves the same in both lanes. Same columns as above.

| ID | Screen | Trigger | Element(s) | Property | From → to | Duration | Curve or spring | Delay / stagger | Interruptible | Reduce Motion | Haptic | Check |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-LNS-29 | S-FILE.plan.discard | scrim tap, swipe down past the threshold, or Esc with unsaved picks | sheet; footer | transform; opacity | sheet springs back to 0 (as M-LNS-09's short release); footer buttons crossfade to the discard row | sheet 462; footer 180 | sheet `CH_SPRINGS.smooth`; footer `--ch-ease` | none | Keep editing crossfades back in 180; Discard closes as M-LNS-08 | sheet stays, footer swap is a 180 fade | none | clip `plandirty` (add) |
| M-LNS-30 | S-FILE.read.gone | open with a gone `insight=`, or a write answers gone | the sheet with the gone card | as M-LNS-07 on open; after a write the body crossfades to the card | open as M-LNS-07; swap 180 | as M-LNS-07; `--ch-ease` | none | Close as M-LNS-08 | 180 fades | none | clip `gone` (add) |
| M-LNS-31 | S-FILE.read (gathering, no Tour, stale, part failed) | open such a read; Try again on a part | the card in question | none; Try again swaps the line for the card in place | at rest | 0 | none | none | n/a | same | none | `early`, `notour`, `readstale`, `stale` + sheet |
| M-LNS-32 | S-FILE.read | "Open the full read" | sheet, then the Read push | sheet closes as M-LNS-08 while Read's push starts (M-READ-38) | as those | 462 | `CH_SPRINGS.smooth` | none | Back reverses the push; the sheet stays closed | 180 fades | none | clip `toread` (add) |
| M-LNS-33 | S-FILE at 821 to 1023 | tap a player row in S-LIST inside the shell | as M-LNS-01 inside the main area | as M-LNS-01 | as M-LNS-01 | 462 | `CH_SPRINGS.smooth` | none | as M-LNS-02 | as M-LNS-01 | none | clip `push` at 900 (add) |
| M-LNS-34 | S-FILE at 1024 to 1179 | rail tap | file column | as M-LNS-20 | as M-LNS-20 | as M-LNS-20 | as M-LNS-20 | none | as M-LNS-20 | as M-LNS-20 | none | clip `rail` at 1100 (add) |
| M-LNS-35 | S-FILE (cold start) | the file is the first page of the session | file page | none | first paint as a page, no push | 0 | none | none | n/a | same | none | clip `cold` (add) |
| M-LNS-36 | S-FILE, S-BOARD (refresh) | pull to refresh | changed cards | none | swap in place; no chart redraw; lens kept | 0 | none | none | n/a | same | none | DOM: no motion class added |
| M-LNS-37 | every screen | Tab, Shift Tab, arrow keys on the lens | focus ring; lens thumb | none for the ring; lens as M-LNS-05 | ring at once | 0; lens 417 | lens `CH_SPRINGS.settle` | none | as M-LNS-05 | ring same; lens instant | none | DOM test: Esc returns focus to the opener |
