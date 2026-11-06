# Lane audit: Messages (phone v2 inbox and thread, desktop rail, thread and details)

Repo `helmv3` at `062f8a2`, read-only.

Scope:
- Live code: `src/clubhouse/screens/messages/*` (MessagesPhone, MessagesView, details-v2, hold-lift, polls, pinned) and `src/clubhouse/styles/messages.css` (5877 lines).
- Previews: `messages` and `messages-player`.
- Spec: `design-refresh/messages/`, including `SETTLED-4NOV.md`, 04 composer, 06 redlines, 08 MSG-* acceptance rows.

Checked at phone 390 (shell ≤820) and desktop 1440, in light and dark. No browser was run, so the figures come from the CSS and markup.

## Already known (not re-derived)
- The empty rail has lost its body text and its New message button: `MessagesView.tsx` ~737 (Rail empty state).

---

### MSG-1 The phone inbox bar shows a compose key instead of the bell, plus a second New message key
- Severity: P1
- Where: Messages inbox (root), phone, light and dark, coach and player
- File:
  - `src/clubhouse/screens/messages/MessagesPhone.tsx:~177` (`<PhoneTop title="Messages" start action={<PhoneIconAction icon={SquarePen} …/>}>`)
  - `src/clubhouse/shell/phone-chrome.tsx` (PhoneTop treats any `action` as non-root and drops the bell)
- What's wrong:
  - Because `action` is set, PhoneTop replaces the notifications bell with a SquarePen key.
  - The v2 inbox also draws its own `.ch-msv-new` key in the body. The screen ends up with two New message buttons and no way to reach notifications.
- Should be: SETTLED-4NOV §16 and 06 "Shared: the green bars". The root bar is the switcher plus the bell, and New message lives once, in the inbox.
- Fix: Drop the `action` prop on the root PhoneTop so the bell comes back. Keep `.ch-msv-new` as the only compose entry.
- Confidence: high

### MSG-2 Reaction badges overlap the bubble above and run off-screen with several reactions
- Severity: P1
- Where: Thread, any message with reactions inside a run, phone and desktop, light and dark
- File:
  - `src/clubhouse/styles/messages.css:5075-5086` (`[data-ch-ms-v2] .ch-ms-reacts{position:absolute;top:-14px}`, `.on-theirs{right:-10px}`, `.on-mine{left:-10px}`)
  - `MessagesView.tsx:1290` (Bubble class assembly) and `:1482`
- What's wrong:
  - The chips hang 14px above the bubble. Nothing adds space above a reacted bubble: no class and no `:has(.ch-ms-reacts)`. In a run (2–4px gaps), the chips sit on top of the previous bubble's last line.
  - The row is a nowrap flex anchored 10px outside the bubble edge. Three or four distinct reactions on a short bubble ("ok") extend past the bubble, and for `on-theirs` past the left screen edge.
- Should be: 06:543 says 16 above a bubble with reactions. MSG-REACT-01 to 04 say the chips stay on the bubble corner, inside the page edge.
- Fix:
  - Add `.ch-ms-msg:has(.ch-ms-reacts){margin-top:16px}`, or a class set in Bubble.
  - Cap the visible chips at 3 plus a "+N" chip.
  - Give the row `max-width: calc(100vw - 2*var(--ch-page-x-phone))`.
- Confidence: high

### MSG-3 The phone composer is an opaque bar with a mismatched fade band, not the floating glass pill
- Severity: P1
- Where: Thread composer, phone, light and dark, at rest and with the keyboard open
- File:
  - `messages.css:2110-2121`: the old phone rule, `padding:8px 8px calc(8px + env(safe-area-inset-bottom))`, opaque `--ch-phone-composer-bg` (rgb(253 252 248/.94) light, rgb(27 32 28/.94) dark), and a top hairline
  - `messages.css:4679`: the v2 `::before`, a 24px fade to `--ch-grouped-bg`
- What's wrong:
  - The v2 fade blends to grouped-bg (#f2f0e9 light, #0e120f dark) but sits on a bar of a different colour (#fdfcf8 / #1b201c). That leaves a visible band and a hard edge above the composer in both themes.
  - The bar is full-bleed with 8px sides.
  - Bottom is 8 plus the full safe-area inset, about 42 on iPhone, so it sits too high.
- Should be: 04:153, 174 and 179, and MSG-COMP-01. A floating glass pill with sides 10/14 and bottom `max(8px, env(safe-area-inset-bottom) - 4px)`, with no bar behind it.
- Fix: Under `[data-ch-ms-v2]`:
  - Set the phone composer wrapper `background:none`, with no hairline.
  - Give the pill `background:var(--ch-glass-strong)` and `margin:0 10px`.
  - Use `padding-bottom:max(8px, calc(env(safe-area-inset-bottom) - 4px))`.
  - Keep the `::before` fade, which now matches the page.
- Confidence: high

### MSG-4 Group typing on phone names an arbitrary member when the typer is unknown
- Severity: P1
- Where: Group thread, typing indicator, phone
- File: `MessagesPhone.tsx:683` (`api.typingUserIds?.length ? api.typingUserIds : [conv.memberIds[0] ?? ""]`)
- What's wrong:
  - When the typer list is empty, the indicator falls back to the first member's name. It says "Jordan is typing" when Jordan is not typing, and that member can even be the viewer.
  - Desktop says "Someone" in the same case (`MessagesView.tsx` ~2515).
- Should be: The typing line names only real typers, and phone and desktop agree.
- Fix: Use the desktop fallback: no name ("Someone is typing"), or hide the indicator when there is no typer id.
- Confidence: high

### MSG-5 Details shows "Leave" on the team channel for anyone who didn't create it
- Severity: P1
- Where: Team channel → Details quick actions, phone (redesign), player and assistant coaches
- File: `src/clubhouse/screens/messages/details-v2.tsx:151-156` (`{conv.group && !mine && (… Leave …)}`), wired at `MessagesPhone.tsx:969`
- What's wrong:
  - The tile's only condition is `conv.group && !mine`, so the team channel offers Leave to every non-creator. The team channel is a group whose membership the roster owns.
  - The pin and row code treat the team channel as its own kind (see MSG-9), but Details doesn't.
- Should be: MSG-DETAILS-04 and MSG-GROUPDET-02 set Profile, Add or Leave per kind and role. The team channel has no Leave.
- Fix: Use `conv.group && !mine && conv.channel !== 'team'`. Use the same kind test as the rows (`c.channel`).
- Confidence: medium (depends on the team channel carrying `group: true`, which the pin code implies)

### MSG-6 Hold menu uses its own 768 phone breakpoint and fixed insets
- Severity: P2
- Where: Long-press on a bubble (lift, reaction bar and menu), widths 768–820 and very tall bubbles, phone
- File: `src/clubhouse/screens/messages/hold-lift.tsx:50-55` (`const phone = window.innerWidth < 768`, insets 60/36 or 12/12) and `:143-145`
- What's wrong:
  - The shell is phone up to 820, but the lift switches to desktop insets at 768. On an iPad mini portrait (768) the reaction bar can go to 12px from the top, under the status bar.
  - Insets are fixed numbers, not `env(safe-area-inset-*)`.
  - For a bubble taller than the viewport, `Math.max(limit-bottom, insetTop-top)` keeps the top and pushes the menu off the bottom.
- Should be: The shared phone breakpoint (`useChPhone`, ≤820). Keep the menu inside the safe area (M-MSG-10b).
- Fix:
  - Use `useChPhone()`.
  - Add `env(safe-area-inset-top/bottom)` to the 60/36.
  - When `bottom - top > innerHeight - insets`, pin the menu to the bottom inset and let the copy clip.
- Confidence: medium

### MSG-7 Thread bar sizes are off spec on phone, and the team channel bar has no flag
- Severity: P2
- Where: Thread bar (`.ch-msp-who`), phone, light and dark
- File: `MessagesPhone.tsx` (`.ch-msp-who`: Avatar 30, name type-15, role 12) and messages.css `.ch-msp-who`
- What's wrong:
  - The bar uses a 30 avatar, a 15 name and a 12 role. The spec is 36, 17/600 and 13.
  - The team channel shows a generic group mark, while its pin shows a Flag.
- Should be: 06 thread bar redline (36 / 17-strong / 13), and SETTLED-4NOV: the team channel is a Flag everywhere.
- Fix:
  - Use `<Avatar size="md">` (36), `--ch-type-17-strong` and `--ch-type-13`.
  - Render the Flag group mark when `conv.channel === 'team'`.
- Confidence: medium

### MSG-8 The Unread filter still shows the Pinned card, and pinned unread conversations drop out of "Unread"
- Severity: P2
- Where: Phone inbox → Segmented "Unread", light and dark
- File: `MessagesPhone.tsx:259-345` (pinned card; `recentTitle` at 275; segmented at 295)
- What's wrong:
  - With the Unread filter on, the Pinned card still renders all pins, including ones with nothing unread.
  - The list below excludes pinned conversations, so a pinned unread thread appears only as a pin, not in the "Unread" list the filter promises.
- Should be: SETTLED-4NOV. A filter applies to the whole inbox.
- Fix: When `filter !== 'all'`, hide the Pinned card and include pinned matches in the filtered list. Alternatively, filter `pinned` by the same predicate.
- Confidence: high

### MSG-9 Pins decide "team" by title; rows decide by channel
- Severity: P2
- Where: Phone inbox pins, any group whose title matches the team name
- File: `MessagesPhone.tsx:337, 341` (`c.title === api.teamName ? Flag : Users`, label "Team")
- What's wrong:
  - A user-made group titled like the team gets the team Flag and the "Team" label.
  - A renamed team channel loses both.
  - Rows use `c.channel`, so the pin and the row disagree.
- Should be: One kind test, used everywhere.
- Fix: Use `c.channel === 'team'` in both places.
- Confidence: high

### MSG-10 Desktop redesign still uses the old ThreadBelow, not the jump key
- Severity: P2
- Where: Desktop thread, scrolled up with new messages, light and dark
- File: `MessagesView.tsx:2239` (`ThreadBelow`), used at `:2538`
- What's wrong: The redesign phone thread uses the v2 jump key. Desktop still renders the legacy "N new below" bar, so the two surfaces differ.
- Should be: SETTLED-4NOV and 06. One jump-to-latest control on phone and desktop.
- Fix: Render ThreadJumpKey on desktop when `api.redesign`, and keep ThreadBelow only for the legacy path.
- Confidence: medium

### MSG-11 The details column opens with a raw 462ms grid-template-columns transition
- Severity: P2
- Where: Desktop thread → Details open and close
- File: `src/clubhouse/screens/messages/details-v2.tsx:337` (`grid.style.transition = 'grid-template-columns 462ms var(--ch-ease-spring-smooth)'`)
- What's wrong:
  - This is a layout-property animation with a hard-coded duration set inline.
  - It isn't gated on reduced motion, and it reflows the thread column every frame.
  - The spec sanctions the motion, not the raw number.
- Should be: H2. Motion uses `--ch-dur-*` tokens and respects reduced motion.
- Fix: Use `var(--ch-dur-spring-smooth)` (or the matching token) and skip the transition when `useChReducedMotion()` is set.
- Confidence: high

### MSG-12 Photo tiles in Details have no loading or failure state
- Severity: P2
- Where: Details → Photos grid, phone and desktop, slow or failed fetch
- File: `details-v2.tsx:249` (`PhotoTile`) and `:299`
- What's wrong:
  - Each tile fetches its own signed URL.
  - While the fetch runs, and if it fails, the tile is a flat grey square with no shimmer, icon or retry. A grid of failures looks like an empty box.
- Should be: 05 states: loading and error per media item.
- Fix: Use the shared skeleton shimmer while loading. On error, show an image-off icon with the file name.
- Confidence: medium

### MSG-13 Tap targets under 44: hold menu rows and wrapped poll foot links
- Severity: P2
- Where: Long-press menu, and poll card foot when the links wrap, phone
- File:
  - `messages.css:4927-4935` (`.ch-msv-holdmenu > button{min-height:42px}`)
  - `messages.css:3757-3782` (`.ch-ms-poll__foot{flex-wrap:wrap;gap:4px 16px}`, `.ch-ms-poll__link{min-height:44px;margin:-8px}`)
- What's wrong:
  - The menu rows are 42.
  - The poll links' 44px hit boxes use −8px margins and lay out at 28px. When the four foot items (count, See votes, Remind N, Close poll) wrap onto two lines in the 272 card, the row gap of 4 makes the two rows' hit areas overlap by about 12px.
- Should be: H10.
- Fix:
  - Set the menu rows to `min-height:44px`.
  - Set the poll foot to `row-gap:16px`, or move the count onto its own line so the three links fit on one row.
- Confidence: medium

### MSG-14 Four `.ch-msv-seeall` rules and two toast styles in one file
- Severity: P2
- Where: Inbox "See all", toasts, phone and desktop
- File:
  - `messages.css:5300, 5333, 5431, 5438` (`.ch-msv-seeall`)
  - `messages.css:5088-5094` (`body:has([data-ch-ms-v2]) .ch-toast`, glass-strong)
  - `messages.css:5825` (`.ch-toasts.is-pill .ch-toast`, glass-bg)
- What's wrong:
  - Later rules partially override earlier ones, so the result depends on source order.
  - Two toast surfaces exist, despite the comment "One toast style in Messages", so the toast looks different depending on which container raised it.
- Should be: MSG-TOAST-01. One toast style.
- Fix: Collapse `.ch-msv-seeall` to one rule. Delete the `.is-pill` variant, or make it use `--ch-glass-strong`.
- Confidence: high

### MSG-15 The reply quote is still the old elevated card
- Severity: P2
- Where: Thread bubble with a reply quote, and the composer reply strip, light and dark
- File: `messages.css:3049` (`.ch-ms-quote`) and `:3085`. There is no `[data-ch-ms-v2]` restyle.
- What's wrong: The quote keeps the pre-redesign elevation card inside the bubble, so it is a card nested in a bubble, with a shadow that doesn't match the v2 surfaces.
- Should be: The 06 reply quote redline: a flat tinted block inside the bubble. Owner pattern: nested cards.
- Fix: Under `[data-ch-ms-v2]`, set `.ch-ms-quote{box-shadow:none;background:var(--ch-well-flat)}` (on mine, use `--ch-accent-tint`).
- Confidence: medium

### MSG-16 Own-reaction halo uses the page colour token from the old layout
- Severity: P2
- Where: Thread, your own reaction chip, light and dark
- File: `messages.css:5848` (`--ch-messages-x7: 0 0 0 4px var(--ch-bg-page), …`) and `:5717-5720`
- What's wrong: The v2 thread sits on `--ch-grouped-bg`, but the halo is `--ch-bg-page`, so a 4px ring of a slightly different colour shows around your own chip in both themes.
- Should be: MSG-REACT-04. The halo is the page colour behind the thread.
- Fix: Use `0 0 0 4px var(--ch-grouped-bg)` under `[data-ch-ms-v2]`.
- Confidence: medium

### MSG-17 Hard-coded ivory on the reaction chips of others' bubbles
- Severity: P2
- Where: Reaction chips on others' bubbles, and the reaction sheet head, dark
- File: `messages.css:805-807` (`.ch-ms-reacts.on-theirs .ch-ms-react, .ch-rx__head{color:#fffdf6}`)
- What's wrong: A raw hex overrides the token pair set at 773-776 (`--ch-on-fill-50`), so it never follows a theme change.
- Should be: Tokens only.
- Fix: Replace it with `var(--ch-on-fill-50)`.
- Confidence: high

### MSG-18 The mute menu on phone floats at a fixed 40% top, detached from its row
- Severity: P2
- Where: Inbox row hold → Mute, phone; Details → Mute, desktop near the right edge
- File:
  - `messages.css:5288` (`.ch-msv-holdmenu.is-mute{left:var(--ch-page-x-phone);top:40%}`)
  - `details-v2.tsx:45` (`Math.min(r.left, window.innerWidth - 236 - 16)`)
- What's wrong:
  - On phone the mute options appear at 40% of the screen whatever row was pressed, so for a row near the bottom they cover other rows and are far from the finger.
  - On desktop the clamp uses a hard-coded 236 width and doesn't flip upward near the bottom edge.
- Should be: The menu anchors to the source, inside the safe area (M-MSG-10b).
- Fix: Anchor the menu to the row rect, flipping when it would leave the safe area. On desktop use the menu's measured `offsetWidth/offsetHeight`.
- Confidence: medium

### MSG-19 Inbox skeleton uses inline raw sizes, including 9 and 11px bars
- Severity: P2
- Where: Phone inbox loading
- File: `MessagesPhone.tsx:306-313` (`style={{ width: 124.2, height: 11 }}`, `{ width: 210.6, height: 9 }`)
- What's wrong:
  - The skeleton rows are inline magic numbers that don't match the loaded row's type metrics (15/13), so the layout jumps when the content lands.
  - The 44 avatar doesn't match the loaded row avatar.
- Should be: The skeleton mirrors the loaded row (05 loading state).
- Fix: Build the skeleton from the row's own classes, with `.ch-msv-sk` line heights set from the type tokens.
- Confidence: medium

---

## Summary (worst first)
1. MSG-1 (P1): the phone inbox bar swaps the bell for a compose key, so there is no notifications entry and there are two New message buttons.
2. MSG-2 (P1): reaction chips sit 14px above the bubble with no gap. They overlap the previous bubble and, with several reactions, run off the screen edge.
3. MSG-3 (P1): the phone composer is still the old opaque bar, with a fade band of the wrong colour. It is not the floating glass pill, and its insets are wrong.
4. MSG-4 and MSG-5 (P1): group typing names a random member on phone, and Details offers Leave on the team channel.
5. MSG-6 to MSG-19 (P2): the hold menu has its own breakpoint and fixed insets, tap targets fall under 44, styles are duplicated, the reply quote is still an old nested card, and phone and desktop drift apart (jump key, typing, team flag).
