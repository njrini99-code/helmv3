# Classes, Roster and coach Home: handover to the hub thread (31 Oct, 15:40)

Note: the motion lines below record what the design page draws. Build the START_HERE shared values instead: Reduce Motion crossfades use `CH_FADE_MS` (180ms today, not the page's 120ms) and the page behind a push moves 24% (not the page's 30%).

From the Classes, Roster and Home thread. I had started reading for 05 to 08 when the plan changed; I wrote none of them. This is what I had, so you don't redo it. Everything here was read off the design page source, not from memory.

Package: `design-refresh/classes-roster-home/` (01 to 04, README, capture/capture.mjs, redesign/).
Design page: https://claude.ai/artifact/QnVN3x63a79TM8geunzccU, now version 7. Local copy `redesign/clubhouse-phone-redesign.html` is the same file.

v7 change: the Try again, Import schedule and Copy team code buttons in the failed and empty states drew a blank icon (the `refresh`, `download` and `copy` glyphs were missing). They now draw the Lucide icons. Click-through test and state hashes pass with 0 errors.

## Links the page accepts

`#<screen>[-phone|-desktop][-light|-dark][-coach|-player][-profile][-reduce][-early|-loading|-empty|-failed|-long|-big|-xxl]`

- screen: classes, roster, home. `profile` opens the first player's pushed profile (Roster).
- Large phone (430, 20px edge) has no hash token: click `button[data-set="size"][data-v="69"]`.
- Sheets and the strip have no hash token. Open them by clicking inside `#devwrap`: `[data-act="class"]` (class sheet, 90%), `[data-act="reqs"]` (join requests, 62%), `[data-act="round"]` (round sheet, 74%), `[data-act="strip"]` (section strip). capture.mjs already does this.
- Desktop roster: `[data-act="dsel"][data-id="<name>"]` changes the peek.

## Drawn vs not drawn (for 05)

Drawn: Classes screen, class detail sheet, section strip; Roster coach screen, Roster player screen, player profile push, join requests sheet; coach Home, round sheet; desktop for all three; loading, empty, failed for all three (phone and desktop); early season, long names, big roster (24 players); Text Size up to XXL (1.36); dark; Reduce Motion; 390 and 430.

Not drawn (need "not drawn" plus a build rule):
- Classes: the + menu (aria-label "Add or import a class"), Edit class form, Remove confirm, Delete all classes confirm, the toggle's write result.
- Roster: Invite players button target (coach), profile more menu ("Player actions"), injured row tap (has press feedback, no destination), Approve / Decline / Approve all results, "All 14" recent rounds, Message and Plan 1:1.
- Home: bell, Waiting on you capsules, Up next card target, Calendar and Team stats links, the leg cell player names.
- States: one item, offline or stale.
- The app also has Classes sheets the design never drew: ExamSheet, TermSheet, TeamBreakSheet, InClassSheet, NoClassTodaySheet, ClassStatusDetail, ClassForm, ImportSchedule; Roster has InviteByEmail and RosterStatus. The full read-only inventory of these (how each is reached, file:line, primitive, toasts, preview routes) is in `classes-roster-home-SUBSURFACES.md` next to this file (3 Nov).

## Motion values as the page actually runs them (for 07)

Tokens: `--ease` cubic-bezier(.22,1,.36,1); `--smooth` and `--settle` are `linear()` springs (strings in the page `:root`); `--d-press` 110ms, `--d-quick` 180ms, `--d-base` 260ms, `--d-spring` 462ms.

- Press (cards, buttons, binders, leaders): `scale(1) → .97` over 110ms on pointerdown; back over 280ms `--ease`. Rows don't scale: background goes to `color-mix(ink 5%)`. Green-bar icon buttons: background `rgb(255 255 255/.08)`, no scale. Reduce Motion: no scale (1ms).
- Sheet open: `translateY(102%) → none`, 462ms `--smooth`. Close: 280ms `--ease`; the page re-renders after 320ms. Dim `opacity 0 → 1` (rgb(0 0 0/.32)), 260ms linear, both ways. Closes on the dim, the ✕, or swipe down (build rule). Reduce Motion: no travel, opacity 0 → 1 over 120ms linear; re-render after 160ms.
- Push (profile): push layer `translateX(100%) → none` 462ms `--smooth`; base layer `→ translateX(-30%)` 462ms `--smooth` with a dim overlay to rgb(0 0 0/.10) over 260ms linear; left edge shadow `-10px 0 30px -12px rgb(0 0 0/.3)`. Back: 280ms `--ease`, re-render after 330ms. Reduce Motion: 120ms opacity crossfade, base doesn't move.
- Section strip: `translateY(-12px) → none` 462ms `--smooth`, opacity 0 → 1 over 180ms linear. The title chevron rotates 0 → 180deg over 260ms `--ease`. Reduce Motion: no travel (1ms).
- Large title: scroll-linked over the first 56px: opacity `1 → 0.1`, `scale(1 → 0.86)` from the left edge. Reduce Motion: opacity only, no scale. The green bar never fades and keeps its own title.
- Bar shade: after 8px of scroll a 14px shade under the bar (`rgb(0 0 0/.10) → transparent`) fades in over 180ms linear.
- Segmented chip: `transform` over 360ms `cubic-bezier(.34,1.3,.64,1)` (small overshoot); label colour 360ms `--ease`. Reduce Motion: instant.
- Sort reorder (FLIP): every row that moved animates `translateY(old − new) → none`, 360ms cubic-bezier(.22,1,.36,1), no stagger, no fade. Reduce Motion: instant.
- Switch: thumb `translateX(0 → 20px)` 462ms `--settle`; track colour 260ms linear (to #2E8A57). Reduce Motion: 1ms.
- Diverging SG bars (Home, the team's game): `scaleX(0 → 1)` from the zero line, 360ms `--ease`, once when Home renders, never on scroll or re-render. Reduce Motion: drawn in place.
- Skeleton: opacity pulse 1 → .55 → 1 over 1.6s ease-in-out, infinite. Reduce Motion: static.
- "1 overlap" chip: smooth scroll to the Overlaps card (110px under the bar). Reduce Motion: jump.

Two mismatches inside the page to settle in 07: the Motion section's cards say Press uses `cubic-bezier(.2,.8,.2,1)` and Switch uses 360ms with the segmented curve, but the CSS that actually runs uses 280ms `--ease` for press release and 462ms `--settle` for the switch thumb. I'd take the CSS as the truth.

Never animate: count-ups on figures, entrance staggers, chart line draw-on, re-render motion after a sort or toggle beyond the FLIP, the green bar or its title on scroll, blur on scroll.

## Settled by Nick (31 Oct, "Go with your picks")

Practice rounds out of averages, leaders and top five. No Captain tag. Plain "Injured" chip, injured count as active. Classes shows no finals, holidays or next-week travel. Home bar and hero share `--ch-frame`. Desktop "Needs a look" strip dropped. All six are drawn in v6/v7 and recorded in 04 §8.
