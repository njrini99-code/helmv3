# Settled 4 Nov: design page versions 13 to 15, and the calls made while writing 05 to 08

Nick, 31 Oct: "Handle any other questions they have". These are the calls made while measuring every frame for 06 and writing
07 and 08, and the page fixes they led to. 06, 07 and 08 cite them by number. The design page is version 15 (same link); every
measurement in 06 was taken on version 14, and 15 only moves the hidden time column at 430. Call 6 (several typers) and the earlier defaults are flip-able in one line; 05's "Settled as defaults Nick can flip" table lists the defaults.

## Page changes (now drawn; specs, motion and criteria must match)

1. **430 edge (SHARED-7).** The `-w430` frames draw a 20 px edge: inbox top, context line, search, segmented control, cards
   (`.lcard`), section labels, details, sheets, empty state, and the root bar's switcher (`.tbar.root` padding-left 20, which is
   what today's app does: `--ch-page-x-phone` is `--ch-space-5` at min-width 414px, tokens.css). Thread side padding 12 → 16,
   composer 10 → 14, attach menu left 12 → 16, jump key right 14 → 18. Measured: ctx/card/seg 20 at 430, 16 at 390.
2. **Typing dots (marks, SHARED-4).** `--a-dot` light is now **#7A766C**: 3.97 on the page #F2F0E9, 4.49 on paper #FFFEFB,
   4.08 on the selected-row wash #F4F3F0. Dark stays **#827D71**: 4.60 page, 4.12 rail #191E1A, 3.55 wash #262A26, 3.62 bubble
   #232925. Under Reduce Motion they hold still at opacity 1. This replaces 3.37 / 3.41 everywhere. App token: PR 11d adds `--ch-typing-dot` (#7A766C light, `var(--ch-ink-400)` dark); `--ch-ink-400` stays #8F8B81 because the scrollbar and heat-map ring use it.
3. **Champagne ring.** New token `--a-ring`: light **#8C703A** (4.10 on the page, 4.63 on paper), dark **#C9AD74** (8.73 on
   the page). Used for the bubble focus ring and the ring on your own reaction. Your own reaction now sits on a 4 px page-colour
   halo (`box-shadow: 0 0 0 4px var(--a-page)`, plus the existing green hairline and shadow on yours), so its ring is always
   measured against the page, on paper and on your green bubble alike. App side: PR 11d adds `--ch-ring-own` (light #8C703A,
   dark #C9AD74); the owner's rule "your own reaction carries the champagne ring" still holds, it is a deeper champagne.
4. **Jump badge.** 12/20 700, 20 × 20 (was 11/19). 8.01 light, 5.58 dark.
5. **Group face initials.** 12 px on the 30 px face (was 11.4).
6. **Group typing (SHARED-2).** The caption under the typing bubble ("Maya is typing") is gone. In a group the typer's name
   sits **inside** the typing bubble above the dots, exactly like a name in a first bubble: `.bname` 13/16.9 600 `--a-ink-2`
   (9.77 light, 8.99 dark). The bubble with a name: padding 7.5 13 12, gap 5, column. One-to-one typing is unchanged. When the
   reply lands, the bubble opens into the message, which already carries the same name, so nothing jumps. Several typers
   in the thread: one typing bubble per typer, each with its name inside. The inbox row and pin preview keep 05's default
   ("Maya and Owen are typing" / "Several people are typing").
7. **Details header (SHARED-2).** Ruled allowed: the name and line under the big face are the screen's large title and its
   context line, which SHARED-2 lets sit on the page. No change.
8. **Delete conversation** in the row menu is danger red (`--a-danger`: 6.26 light, 7.03 dark), matching Delete in the hold
   menu. The row menu order follows the page: Open conversation, Pin/Unpin, Mark as unread, Mute…, Delete conversation.
9. **XXL times.** The time column is `52 × k` wide with no wrapping, sits at `right: -64 × k`, and the drag that reveals it
   goes to `58 × k` (k = Text Size scale, 1.353 at XXL: 70.4 column, 78.5 drag). "5:52 PM" is one line at XXL (18 tall).
10. **Sheet close keys** (Votes, Seen by) are `flex: none`: 40 × 40 drawn, 44 target by a transparent `::before`.
11. **Switch off track.** A 1.5 px inset ring `--a-sw-off`: light #8F8B81 (3.37 on the card), dark #827D71 (4.12). On stays
    green. App: PR 11f adds `--ch-switch-off-ring`.
12. **"CH-7301" removed** from the empty card. It was a design annotation (the component code), not app copy.

30. **430 time column (v15).** The hidden time column sits at `right: -68 × k` at 430 (thread padding 16; `-64 × k` at 390,
    padding 12), so none of it shows before a drag. The 58 × k drag brings it to 6 px from the edge at both widths.

## Rulings with no page change

13. **Group coin gradient:** it is avatar art, like a photo, not page chrome; SHARED-2 is about text on the page. Allowed.
14. **Skeleton fill `--a-sk`:** build as `color-mix(in srgb, var(--ch-text-primary) 9%, transparent)`; no new token.
15. **Attach tile colours:** PR 11e adds three tokens with the drawn hex, same in both themes (`--ch-attach-photos`,
    `--ch-attach-file`, `--ch-attach-poll`); the ivory glyph on each must stay 4.5 or above (lowest measured 4.92).
16. **Phone bar keys:** the root bar is today's (SHARED-1). The conversation bar's Details key stays where drawn, after the name.
17. **Desktop hover bar keys at 27:** keep, with the exception 06 wrote (WCAG 2.5.8; every action is also in the context menu
    and on the keyboard).
18. **Seen by count "n of m"** is a count of readers, not a figure (SHARED-11 is not touched).
19. **Today's exact strings** ("Not sent", the mute lines) are checked by a test that compares them to today's source strings.
20. **Profile quick action** in details is shown to a coach viewer only. This is a rule, not a flip: for a player it would link to a teammate's stats (SHARED-11).
21. **Reply chip** belongs to PR 11d. **Edit chip** uses M-MSG-28. **M-MSG-32** uses the browser's own caret (no motion row
    to build).

## Motion rulings (07 open questions)

22. **Lift haptic:** `haptic('press')` (light), as the app's haptics map has it; medium (`commit`) stays reserved. 04 is
    corrected to say press.
23. **Sent bubble:** move the real bubble from the field's position, as the page does. A copy would blink in motion-check
    cases 1, 2 and 11. 02-PLAN 5.2 is corrected to match.
24. **Flicked sheet:** a flick closes with `chThrownExit` (keeps the flick's speed); a slow drag released past the line closes
    over 280 ms on `--ch-ease`.
25. **Reduce Motion fade:** linear, `CH_FADE_MS` 180, per the lead's shared value. If framer's `chFade()` uses an ease curve,
    that is PR 1's to align; Messages calls the shared helper and does not define its own.
26. **Row and pin typing dots** run on CSS `ease` as drawn; the thread bubble's dots keep their curve. Build as drawn.
27. **capture.mjs M-MSG-28** becomes by hand (`[null, []]`); done in the package.
28. **02-PLAN 11a test:** pin pop's peak at **1.068** (the app's `chSpringCurve` gives 1.06808), not 1.067.
29. **Settle times:** quote the app's `chSpringCurve` values (417, 921, 700, 496, 471; smooth 462) as what the build must hit,
    and the page's solver values only as a note.

## Motion check

The page's own motion check on v13 in real Chrome 156 on the Mac: **11 of 11 clean**
(`screenshots/reference/motion-check-v13-chrome-11-of-11.png`). Headless Chromium in this container drops frames (25 to 40 ms
frames with 120 to 250 ms stalls) and fails 2 or 3 cases on v12 and v13 alike; that is the container, not the page. The
criteria should say the check runs in a headed browser at 60 Hz or better.
