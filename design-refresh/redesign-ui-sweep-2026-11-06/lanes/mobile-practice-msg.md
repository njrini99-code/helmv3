# Mobile audit: Practice (PRAC) and Messages (MSG)

Repo `helmv3` at main `062f8a2`. This is a read-only code audit; no browser was run. Every finding was checked against `messages.md`, `practice.md`, `fidelity-practice-msg.md`, `motion.md`, `qa-staging.md` and the other lane files. Where a finding deepens an existing ID, it says "extends".

Notes on scope:
- The phone layout is `useChPhone()` = `(max-width: 820px)` (`src/clubhouse/lib/use-phone.ts:7`).
- Landscape 844x390 and 932 get the **desktop** tree. Landscape 812 (X/11 Pro/12-13 mini) still gets the phone tree.
- Fields are forced to ≥16px up to 1023px (`globals.css:239-244`, `controls.css:1486-1491`), so there are no input-zoom findings.
- Meta and theme-color belong to SHELL.

---

## Messages

### MOB-MSG-1 Opening a photo or file from Details is blocked as a pop-up in iPhone Safari
- Severity: P1
- Where: Details > Photos / Files tiles, all widths, all Text Sizes, light and dark. Keyboard down.
- File: src/clubhouse/screens/messages/files.ts:41-51 (`open`). Used by details-v2.tsx PhotoTile and the file rows (~:248-320).
- What's wrong: `open` awaits `api.attachments(f.messageId)` (:43) and only then calls `window.open(hit.url, "_blank", …)` (:50). That is outside the tap's user activation, so Mobile Safari silently blocks the new tab, and nothing happens on tap. The repo already has the fix pattern: `announcements.tsx:129-150` opens the window inside the tap, with the comment "The tab opens inside the tap, or Safari blocks it". Hub's `TeamHub.tsx:293` does the same.
- Should be: every tap gives a visible result. Use the same pattern as announcements.
- Fix: inside the click, call `const w = window.open("about:blank","_blank")`. After the await, set `w.location.href = hit.url`, or call `w.close()` on a miss. Better still, reuse the announcements helper.
- Confidence: high

### MOB-MSG-2 There are no message actions on touch at ≥821 (iPhone landscape 844/932, iPad)
- Severity: P1
- Where: thread, 844x390 and 932x430 landscape (desktop tree), any Text Size, light and dark.
- File:
  - src/clubhouse/screens/messages/MessagesView.tsx:1162 (long press only when `onActions`), :1350-1390 (`.ch-msv-hoverbar`)
  - src/clubhouse/styles/messages.css:5693-5699 (`@media (hover: hover)`), :4510-4516 (time on `:hover, :focus-within`)
- What's wrong:
  - The desktop tree passes no `onActions`, so the long press is off.
  - The v2 hoverbar (react, reply, edit, delete, copy) appears only under `hover:hover`.
  - iOS fires no `contextmenu` on a long press.
  - The legacy `.ch-ms-msg__tools` had a `hover:none` fallback (messages.css:682-686), but the v2 bar has none.
  - The result: on an iPhone turned sideways, a touch user cannot react, reply, edit or delete. The time label shows only through a sticky `:hover` after a tap.
- Should be: every action is reachable by touch at every phone width (spec, Must: the phone long-press menu).
- Fix: under `(hover: none)`, enable `useLongPress` and the HoldLift whenever `matchMedia('(pointer:coarse)')`, even in the desktop tree. Alternatively, add a `@media (hover:none)` rule that shows the hoverbar on `:focus-within` and give the bubble `tabIndex=0`.
- Confidence: high

### MOB-MSG-3 Landscape iPhone gets the desktop composer, and rotating throws away composer state
- Severity: P1
- Where: thread, 844x390, keyboard up, rotating between portrait and landscape. All Text Sizes.
- File:
  - src/clubhouse/screens/messages/MessagesView.tsx:2078-2086 (`!phone` Enter sends), :2178 (`enterKeyHint`), :2186-2192 (hint)
  - MessagesScreen.tsx (swaps the MessagesPhone and MessagesDesktop trees on `useChPhone`)
- What's wrong:
  - At 844 the composer has `phone=false`. The iOS Return key therefore sends (there is no way to type a new line), and the hint "Enter to send · Shift + Enter for a new line" is drawn on a device with no Shift+Enter.
  - The desktop tree has no `keyboardAware` / visualViewport fit, so in Safari the keyboard (≈160–200px of a 390px-tall viewport) covers the composer.
  - Crossing 820 unmounts the whole tree. Picked files, `replyToId`, `editing`, the scroll position and focus are all lost. Only the text draft survives, through `api.drafts`.
- Should be: on a phone, Return inserts a line break, the keyboard never hides the field, and rotating never loses work.
- Fix:
  - Key the `phone` prop on `(pointer:coarse)` rather than width, so Return is a line break and the hint is hidden.
  - Lift files, reply and edit state into the draft store (`api.drafts`) next to the text.
  - Or make the phone tree's breakpoint `(max-width:820px), (max-height:500px) and (pointer:coarse)`.
- Confidence: medium

### MOB-MSG-4 About 34px of home-indicator padding stays above the keyboard in Mobile Safari (extends MSG-3)
- Severity: P1
- Where: thread and New message, 320–430 portrait, keyboard up, Safari (not Capacitor). Light and dark.
- File: src/clubhouse/styles/messages.css:2110-2122 (`.ch-msp-thread .ch-ms-comp`, `.ch-msp-new .ch-ms-comp`)
- What's wrong:
  - The composer pads `calc(8px + env(safe-area-inset-bottom))`, and the drop to 8px is only under `body.keyboard-open`, which only Capacitor sets.
  - In Safari, PhoneScreen fits to the visual viewport with `[data-ch-vv]` (shell.css:1577), but `env(safe-area-inset-bottom)` stays 34px. So a band of about 34px of composer background sits between the pill and the keyboard.
  - MSG-3 found the composer jump. This is the leftover gap once the fit works.
- Should be: the composer sits directly on the keyboard with 8px padding (spec 06:583, composer 10/14).
- Fix: add `.ch-pscreen[data-ch-vv] .ch-ms-comp { padding-bottom: 8px; }` next to the `body.keyboard-open` rule.
- Confidence: medium

### MOB-MSG-5 The keyboard drops after every send on iPhone
- Severity: P1
- Where: thread composer, all widths, keyboard up, Safari.
- File:
  - src/clubhouse/screens/messages/NotifyAnyway.tsx:97 (send `<button onClick={() => onSend(false)}>`)
  - src/clubhouse/screens/messages/MessagesView.tsx:2056 (`ta.current?.focus()` after the await)
- What's wrong:
  - The send key has no `onPointerDown` / `onMouseDown` preventDefault, so a tap blurs the textarea first and iOS lowers the keyboard.
  - The refocus at :2056 runs after `await` (outside the gesture), and iOS will not reopen the keyboard from a programmatic focus outside a gesture.
  - Each message therefore costs a tap back into the field, and the thread jumps twice as the viewport grows and shrinks.
  - The `+` key (ComposerPlusV2) has the same issue.
- Should be: the keyboard stays up through a send (iMessage behaviour; spec, composer).
- Fix: add `onPointerDown={(e) => e.preventDefault()}` to the send button and the `+` trigger. Focus then never leaves the textarea, and the post-await `focus()` becomes a no-op.
- Confidence: medium

### MOB-MSG-6 A long press while typing drops the keyboard under a lift measured with the keyboard up
- Severity: P1
- Where: thread, 320–430, keyboard up, long press on a bubble.
- File: src/clubhouse/screens/messages/hold-lift.tsx:73-74 (`rbar…querySelector('button')?.focus({preventScroll:true})`)
- What's wrong:
  - On open, focus moves to the first reaction, which blurs the textarea, so iOS lowers the keyboard.
  - The thread then grows by the keyboard height (≈290–336px), but the lifted copy, the reaction bar and the menu stay at the rect measured before. They end up floating 300px above the bubble or off the top.
  - Nothing re-measures on `visualViewport` resize.
- Should be: the lift stays on its bubble, as in spec (hold-lift).
- Fix:
  - Either `blur()` the active field and wait one `visualViewport` resize before measuring.
  - Or re-measure the rect on `visualViewport.resize` while the lift is open.
  - Or skip moving focus when `pointerType==='touch'` and the textarea is focused.
- Confidence: medium

### MOB-MSG-7 The date pill sits at a fixed 74px, under the notch bar
- Severity: P1
- Where: thread scroll, all portrait widths, all Text Sizes, light and dark.
- File: src/clubhouse/styles/messages.css:4518-4521 (`[data-ch-ms-v2] .ch-msv-datepill { top: 74px }`)
- What's wrong:
  - The phone bar is `env(safe-area-inset-top)` (47–59) plus `.ch-msp-who` 44, which is ≈91–103px.
  - At 74px the floating "Today" pill is drawn under, or half under, the translucent bar. At XXL the bar is taller still (see MOB-MSG-14).
  - The desktop uses 140px. There is no phone value.
- Should be: 8px below the bar (spec 06, date pill).
- Fix: in the phone thread, set `top: calc(env(safe-area-inset-top) + var(--ch-phone-topbar-h) + 8px)`, or measure the bar's height into a CSS variable.
- Confidence: high

### MOB-MSG-8 At XXL the drag-for-times stops 13–20px short, so times stay clipped
- Severity: P1
- Where: thread, drag left to show times, 320–430, largest non-AX and XXL, light and dark.
- File:
  - src/clubhouse/screens/messages/MessagesPhone.tsx:571 (`useThreadDragTimes(scroller, !!api.redesign, threadReduced)`, with no `k`)
  - use-thread-drag-times.ts:7, :26 (`max = TIMES_DRAG_PX * k`, `k` defaults to 1)
  - messages.css:4490-4502 (`.ch-msv-time { right: calc(-64px * k); width: calc(52px * k) }`, -68k at 414–820)
- What's wrong: the time column is placed by the Text Size factor `k` (1.353 at XXL → 86.6–92px), but the drag is capped at 58px because `k` is never passed. At XXL, "10:42 AM" therefore shows only about 2/3 of the way.
- Should be: times show in full at every Text Size. The spec has the time column one line at 70.3 wide at XXL.
- Fix: read `--ch-type-k` (e.g. `useDynamicTypeScale()`) and pass it as the 4th argument. Use 64 or 68 to match the CSS offset at ≥414.
- Confidence: high

### MOB-MSG-9 Pin speech bubbles overlap at 320 and 375
- Severity: P1
- Where: inbox Pins card with 3 pins, 320, 375 and 390, default Text Size and up, light and dark.
- File: src/clubhouse/styles/messages.css:4241-4330 (`.ch-msv-pins` 3-column grid with padding 6/8/8 and gap 6; `.ch-msv-bubblet { left:50%; max-width:92px; transform:translateX(-12%) }`; only `:nth-child(3)` is right-anchored). PIN_LIMIT is 3 (`pinned.ts:10`).
- What's wrong:
  - Pin 2's bubblet runs right from its centre into pin 3's right-anchored bubblet.
  - Computed overlap is about 37px at 320, 9.5px at 375 and 2px at 390. The "said" previews draw over each other, and the result is worse at larger Text Sizes.
- Should be: pins are 110 wide and bubblets are 92 wide with no overlap (spec 06, pins).
- Fix:
  - Below 400px, centre the bubblet (`translateX(-50%)`) and cap it at `calc(100% - 4px)` of its cell.
  - Or hide the bubblet below 360 and show it on press.
- Confidence: high

### MOB-MSG-10 The poll sheet's Cancel and Send scroll away under the Safari keyboard
- Severity: P1
- Where: composer `+` > Poll, 320–430, keyboard up, Safari. All Text Sizes.
- File: src/clubhouse/screens/messages/polls.tsx:657+ (PollSheet in `Modal`); src/clubhouse/styles/controls.css:617-623 and :1555-1590 (fit only under `body.keyboard-open`)
- What's wrong:
  - Modal and FormSheet fit the keyboard only under Capacitor's `body.keyboard-open`. Safari has no visualViewport path for sheets.
  - With a choice field focused, iOS scrolls the layout viewport, and the sheet's header (Cancel / Send in the redesign) goes off the top. On 320, the "Add choice" row sits under the keyboard.
- Should be: a sheet's header and its focused field stay visible with the keyboard up.
- Fix: reuse `useSafariKeyboardFit` in Modal/FormSheet. Set `--ch-vv-h` and `max-height: var(--ch-vv-h)` on the sheet, as PhoneScreen does at shell.css:1577.
- Confidence: medium

### MOB-MSG-11 Details hosts Search but isn't keyboard-aware, and Search doesn't take focus
- Severity: P1
- Where: Details > Search in conversation, 320–430, keyboard up, Safari.
- File: src/clubhouse/screens/messages/MessagesPhone.tsx:947 (`<PhoneScreen … className="ch-msp-details">`, with no `keyboardAware`); details-v2.tsx:163-176 (ConversationSearch, no autofocus)
- What's wrong:
  - The screen isn't fitted to the visual viewport, so iOS pans the page when the field focuses. The page bar scrolls off, and the results list sits under the keyboard.
  - Opening Search needs a second tap to place the caret.
- Should be: keyboard-up screens set `keyboardAware`, as the thread, New message and announcement screens already do (:591, :1357, :1512).
- Fix: add `keyboardAware` to the Details PhoneScreen. Focus the field when the search opens (`autoFocus`, inside the opening tap).
- Confidence: medium

### MOB-MSG-12 Landscape 812 (phone tree) ignores the side safe areas
- Severity: P1
- Where: thread, inbox and composer, 812x375 landscape (iPhone X/11 Pro/12-13 mini), all Text Sizes.
- File: src/clubhouse/styles/messages.css. There is no `safe-area-inset-left/right` anywhere; only bottom at :1357 and :2115, and top at :5816. Thread padding is `0 12px` at :2039, and the composer is 8px at :2115.
- What's wrong: with `viewport-fit=cover`, the notch side has a 44px inset. Bubbles, the avatar column, the `+` key and the inbox rows run under the sensor housing.
- Should be: content stays inside the safe area (owner rule: page edge).
- Fix: on `.ch-msp-thread .ch-ms-msgs`, `.ch-ms-comp` and the inbox list, use `padding-inline: max(12px, env(safe-area-inset-left))` and `max(12px, env(safe-area-inset-right))`.
- Confidence: medium

### MOB-MSG-13 Thread side padding stays 12px at ≥414
- Severity: P2
- Where: thread, 414/428/430, all Text Sizes.
- File: src/clubhouse/styles/messages.css:2034-2040 (`.ch-msp-thread .ch-ms-msgs { padding: 0 12px }`, with no ≥414 rule)
- What's wrong: the spec gives 12 at 390 and 16 at 430. The code holds 12 at every width, while the jump key already moves to 18 at ≥414.
- Should be: design-refresh/messages 06-SCREEN-SPECS :541 (thread 12/16).
- Fix: `@media (min-width:414px) { .ch-msp-thread .ch-ms-msgs { padding: 0 16px } }`.
- Confidence: high

### MOB-MSG-14 The thread bar's name block overflows its fixed 44px at large Text Sizes
- Severity: P2
- Where: thread bar, 320–430, largest non-AX and XXL.
- File: src/clubhouse/styles/messages.css:1941-1983 (`.ch-msp-who { height: 44px }`; `b` type-15-strong, `em` type-12, lead 1.1)
- What's wrong: at XXL the name and subtitle are ≈27 + 2 + 17.9 = 47px inside a fixed 44px box, so the subtitle is clipped or overlaps the hairline. The spec grows `.who` to 53.7px at XXL.
- Should be: 06-SCREEN-SPECS, phone bar at XXL (`.who` 53.7).
- Fix: change `height:44px` to `min-height:44px`, and let the bar grow with `--ch-type-k`.
- Confidence: medium

### MOB-MSG-15 Phone bubble column is 82% wide, the spec says 76%
- Severity: P2
- Where: thread, all phone widths.
- File: src/clubhouse/styles/messages.css:2052-2053 (`.ch-msp-thread .ch-ms-msg__col { max-width: 82% }`)
- What's wrong: long bubbles reach 6% further than the design. At 320 that leaves about 40px of gutter on the opposite side instead of about 60px, so who said what is harder to scan.
- Should be: spec bubble max width 76%.
- Fix: `max-width: 76%`.
- Confidence: medium

### MOB-MSG-16 A double tap anywhere in the bubble stack likes the message, even on links, polls and images
- Severity: P2
- Where: thread, all widths, touch.
- File: src/clubhouse/screens/messages/MessagesView.tsx:1222-1229 (`toggleLikeOnDouble`, 300ms), set on `.ch-ms-msg__stack` at :1323
- What's wrong: the handler isn't filtered by target. Two quick taps on poll choices, a link, an image or the reply quote also toggle a Like. Changing a poll vote quickly likes the poll.
- Should be: only a double tap on the bubble body likes it.
- Fix: return early when `e.target.closest('a,button,input,label,[role=button],.ch-ms-poll,.ch-ms-quote,img')`.
- Confidence: medium

### MOB-MSG-17 New message and announcement fields lack phone keyboard hints, and Return does nothing
- Severity: P2
- Where: New message (To, group Name) and New announcement (Title), 320–430, keyboard up.
- File: src/clubhouse/screens/messages/MessagesPhone.tsx:1381-1388 (To), :1394 (Name), :1528 (announcement Title)
- What's wrong:
  - The To field has only `autoComplete="off"`. It has no `autoCorrect="off"`, `spellCheck={false}`, `autoCapitalize="none"` or `enterKeyHint`, so iOS autocorrects people's names as you type them.
  - Return does nothing, rather than picking the top match.
  - The To field isn't focused on open, so an extra tap is needed.
  - Name and Title have no `enterKeyHint="next"` and no `autoCapitalize="words"`/`"sentences"`.
- Should be: name lookups don't autocorrect, and the Return key moves you on.
- Fix:
  - On the To field, add `autoCorrect="off" spellCheck={false} autoCapitalize="none" enterKeyHint="next" autoFocus`, with Enter choosing the first match.
  - On the Title field, add `enterKeyHint="next"` and focus the body on Enter.
- Confidence: high

### MOB-MSG-18 The Search key leaves the keyboard over the results
- Severity: P2
- Where: inbox search and conversation search, all widths, keyboard up.
- File: src/clubhouse/ui/SearchField.tsx:34-35 (`onKeyDown` handles only Escape; `enterKeyHint="search"`)
- What's wrong:
  - The Search key does nothing, so the keyboard keeps covering about half of the results and must be swiped down.
  - There is no `autoCorrect="off"` / `spellCheck={false}`, so searching for a name gets autocorrected.
- Should be: the Search key commits the search and lowers the keyboard (iOS convention).
- Fix: on Enter, call `e.currentTarget.blur()`. Add `autoCorrect="off" spellCheck={false}`.
- Confidence: high

### MOB-MSG-19 A short inbox shows a band of a different colour below the list
- Severity: P2
- Where: inbox with 0–4 conversations, 320–430, light and dark.
- File: src/clubhouse/styles/messages.css:4201 (`.ch-msv-inbox { background: var(--ch-grouped-bg) }`); src/clubhouse/styles/shell.css:1217 (canvas `padding-bottom: calc(env(safe-area-inset-bottom) + 20px)` on `--ch-bg-page`)
- What's wrong:
  - The inbox paints grouped-bg (#f2f0e9 light, #0e120f dark) only to the end of its content.
  - The phone canvas below it is bg-page (#ede9df light, #111512 dark), and the band is 20px plus the inset. It is visible above the dock, and the same thing happens on the empty state.
- Should be: one surface colour per screen.
- Fix: give `.ch-msv-inbox` `min-height: 100%` (flex:1 in the canvas). Or set the canvas background to grouped-bg on the Messages route.
- Confidence: medium

### MOB-MSG-20 Announcement folds keep a hover tint after a tap
- Severity: P2
- Where: inbox Announcements section, all phone widths, light and dark.
- File: src/clubhouse/styles/messages.css:3284 (`.ch-ms-fold:hover`, not gated)
- What's wrong: iOS applies `:hover` on tap and keeps it until another element is tapped, so a folded announcement stays tinted green 7% as if selected.
- Should be: hover styles only for hover pointers. Other messages rules already use `@media (hover:hover)` (:5693).
- Fix: wrap the rule in `@media (hover: hover)`.
- Confidence: high

### MOB-MSG-21 The attach menu sits under the bar on a 320 SE with the keyboard up, and tapping outside goes through
- Severity: P2
- Where: composer `+` menu, 320x568, keyboard up (visual viewport ≈ 260px), all Text Sizes.
- File: src/clubhouse/screens/messages/ComposerPlusV2.tsx:27-37 (document `pointerdown` close); src/clubhouse/styles/messages.css:4716-4790 (menu `bottom: calc(100% + 13px)`)
- What's wrong:
  - The menu opens upward from the composer with no max-height and no flip. Once the keyboard takes ≈300px, the top item (Photos) is under the thread bar, and worse at XXL.
  - The outside `pointerdown` closes the menu but doesn't stop the tap. A tap meant to dismiss the menu also opens a bubble or likes it.
- Should be: the menu fits the visual viewport, and a dismiss tap only dismisses.
- Fix:
  - Set `max-height: calc(var(--ch-vv-h) - var(--ch-ms-comp-h) - 60px)` with `overflow:auto`.
  - In the close handler, call `preventDefault()` / swallow the next click, as SendCluster's `onClickCapture` does (NotifyAnyway.tsx:52).
- Confidence: low

### MOB-MSG-22 The photo picker can't send videos, and "File" opens the same iOS sheet
- Severity: P2
- Where: composer `+` > Photos / File, iPhone.
- File: src/clubhouse/screens/messages/ComposerPlusV2.tsx:88 (`accept="image/*"`), :89 (File: no `accept`)
- What's wrong:
  - Photos excludes videos (`image/*`), so swing clips from the camera roll can't be picked there.
  - "File" with no accept shows the same Photo Library / Take Photo / Choose File sheet, so the two menu items look the same on iOS.
- Should be: each menu item opens a distinct, useful picker.
- Fix: Photos `accept="image/*,video/*"`. For File, use `accept` with document types (`.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,application/*`) so iOS goes straight to Files.
- Confidence: medium

### MOB-MSG-23 A tapped photo leaves the app for a new Safari tab
- Severity: P2
- Where: thread image attachment, all widths.
- File: src/clubhouse/screens/messages/MessagesView.tsx:918-943 (ImageAttachment `<a target="_blank">` around `<img>`)
- What's wrong:
  - Tapping an image opens a new tab with a signed URL. In a standalone home-screen app that jumps out to Safari with no way back.
  - The double-tap-to-like on the stack (MOB-MSG-16) also opens the tab.
  - Pinch, swipe and close follow none of the app's patterns.
- Should be: an in-app full-screen viewer (sheet) with share and close.
- Fix: replace the anchor with a button that opens a `Modal` / full-screen PhoneScreen holding the image. Keep "Open original" inside the viewer.
- Confidence: medium

### MOB-MSG-24 Opening a thread mounts 200 bubbles, each fetching signed attachment URLs
- Severity: P2
- Where: a busy team thread, on cellular.
- File: src/hooks/golf/use-golf-messages.ts:783-793 (`.limit(200)`, no older paging); src/clubhouse/screens/messages/MessagesView.tsx:945-1000 (Attachments fetch on mount, plus a 45-minute re-sign timer per instance)
- What's wrong:
  - All 200 messages render at once with no virtualization. Each one with attachments fires its own signing request and keeps its own timer.
  - On an older iPhone over LTE, the first paint and the scroll-to-end wait on this. Memory grows with images.
  - Older history beyond 200 can't be reached.
- Should be: the thread opens at the end quickly. Smooth scroll is an owner rule.
- Fix:
  - Batch the signing per thread, one call for visible message ids.
  - Lazy-sign attachments with IntersectionObserver.
  - Page older messages on scroll-to-top.
- Confidence: medium

### MOB-MSG-25 The inbox row's leading swipe fights Safari's back-swipe at the left edge
- Severity: P2
- Where: inbox rows, Safari (not standalone), all widths.
- File: src/clubhouse/ui/SwipeRow.tsx (pointerdown; no edge exclusion); MessagesView.tsx:420 (leading action)
- What's wrong: a swipe that starts within ≈20px of the left edge both reveals the row's leading action and starts Safari's back gesture. The thread's own drag uses `BACK_SWIPE_EDGE 24` (use-thread-drag-times.ts), but SwipeRow doesn't.
- Should be: the edge is left to the system.
- Fix: in SwipeRow, ignore a pointerdown with `clientX < 24` (shared constant with use-thread-drag-times).
- Confidence: low

### MOB-MSG-26 Swipe-to-reply gives no feedback while dragging
- Severity: P2
- Where: thread bubble, swipe right to reply, touch.
- File: src/clubhouse/screens/messages/MessagesView.tsx:1095-1101 (`useLongPress` resolves the swipe on `pointerup` only)
- What's wrong: the bubble doesn't follow the finger and no reply arrow appears, so the user can't tell a reply swipe is happening until they let go. Short swipes do nothing, with no hint.
- Should be: the bubble follows the finger and the arrow shows at the threshold (spec motion, swipe-to-reply).
- Fix: on `pointermove`, apply `translateX(min(dx, 64px))` and show the reply glyph once past the threshold. Spring back on release (`--ch-dur-quick`). Skip it under Reduce Motion.
- Confidence: medium

### MOB-MSG-27 The jump-to-latest key doesn't re-check when the keyboard opens or the screen resizes
- Severity: P2
- Where: thread, keyboard up or down while scrolled near the end.
- File: src/clubhouse/screens/messages/thread-v2.tsx (ThreadJumpKey: `far` is updated on `scroll` and mount only)
- What's wrong: when the keyboard shrinks the scroller, the reader can end up far from the end with no scroll event. The jump key stays hidden, or stays shown after the keyboard closes.
- Should be: the jump key reflects the distance from the end at all times.
- Fix: also recompute `far` in a ResizeObserver on the scroller. use-thread-anchor.ts already has one, so share it.
- Confidence: low

### MOB-MSG-28 Details "Files" jumps instead of scrolling smoothly
- Severity: P2
- Where: Details, tapping the Files count, all widths.
- File: src/clubhouse/screens/messages/MessagesPhone.tsx:967 (`scrollIntoView({ block: "start" })`)
- What's wrong: there's no `behavior:"smooth"`, so the screen cuts to the files section. With the translucent bar, the section heading also lands under the bar.
- Should be: owner rule, keep smooth scroll.
- Fix: `scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" })`. Add `scroll-margin-top: calc(env(safe-area-inset-top) + var(--ch-phone-topbar-h))` on `.ch-msv-files`.
- Confidence: medium

---

## Practice

### MOB-PRAC-1 Plan sheet times print "10:30 AM" in a 46px column and 40px rotation headers
- Severity: P1
- Where: Practice plan sheet (coach), 320–430, default Text Size and up, light (the sheet is light only).
- File:
  - src/clubhouse/screens/coachhelm/plan/sheet/plan-sheet-model.ts:32 (`clock = formatWith(d,{hour:'numeric',minute:'2-digit',timeZone})`, en-US by lib/dates.ts:114)
  - src/clubhouse/styles/coachhelm-plan.css `.drow { grid-template-columns: 46px … }` (`.pt b` type-14-strong) and `.pp-rot` (`repeat(n,40px)`, inline in PracticePlanSheet.tsx)
- What's wrong:
  - "10:30 AM" at 14px strong is ≈62px. It wraps onto 2 lines in the 46px column and overflows the 40px turn headers into the next turn.
  - Three places disagree:
    - PlayerPractice strips AM/PM (data/practice-plan.ts:82).
    - PlanCard's clock has none (PlanCard.tsx:88-93).
    - The sheet keeps it.
- Should be: one clock format across Practice, fitting its column.
- Fix: use the same AM/PM-less clock as `data/practice-plan.ts:82` in plan-sheet-model, and show the period once in the sheet header ("Time" row :83). Size `.drow` to `calc(46px * var(--ch-type-k))`.
- Confidence: high

### MOB-PRAC-2 Print on iPhone leaves a second plan sheet rendered under the app
- Severity: P1
- Where: plan page > Print, iPhone Safari and the standalone home-screen app.
- File: src/clubhouse/screens/coachhelm/plan/PrintPlan.tsx (appends `div.ch-cp-print-root` to body; `await document.fonts.ready` + 2 rAFs, then `window.print()`; cleanup on `afterprint` only); src/clubhouse/styles/coachhelm-plan.css:83-88 (`@media print` only)
- What's wrong:
  - `.ch-cp-print-root` has no screen rule hiding it, so the whole sheet is in the page under the app (scroll height grows, VoiceOver reads it twice).
  - `window.print()` runs after awaits, outside the tap's activation. iOS may ignore it, or show the print sheet late.
  - If `afterprint` never fires (often in standalone mode), the root stays for the rest of the session, and a second Print appends a second copy.
- Should be: print only shows on paper and is idempotent.
- Fix:
  - Add `@media screen { .ch-cp-print-root { display:none } }`.
  - Call `window.print()` synchronously in the tap, after preloading fonts when the page loads.
  - Remove any existing root before appending, and also clean up on `focus` / `visibilitychange`.
- Confidence: medium

### MOB-PRAC-3 "Ask about this block/station" is covered by the Safari keyboard
- Severity: P1
- Where: plan card sheet (block / station) > Ask field, 320–430, keyboard up, Safari.
- File: src/clubhouse/screens/coachhelm/plan/PlanCard.tsx:596-606, :639-650 (`form.ask-in` input); src/clubhouse/styles/controls.css:1555-1590 (FormSheet keyboard fit only under `body.keyboard-open`)
- What's wrong:
  - The field sits at the bottom of a FormSheet, and the sheet has no Safari keyboard fit. The keyboard covers the field and Done, and iOS pans the page, so the sheet's grabber and title go off the top.
  - The field has no `enterKeyHint="send"`, so the Return key reads "return" for a field that submits.
- Should be: keyboard-up fields stay in view (same root as MOB-MSG-10).
- Fix: give FormSheet the visualViewport fit (see MOB-MSG-10). Add `enterKeyHint="send"` and `autoCapitalize="sentences"` to the input.
- Confidence: medium

### MOB-PRAC-4 Player plan and Plan format keep a 16px edge at ≥414 and show a background seam (extends PP-25)
- Severity: P2
- Where: player's plan view (`.ch-cpv-ply`) and Plan format (`.ch-cpv-fmt`), 414–430, light and dark.
- File: src/clubhouse/styles/coachhelm-plan.css:1082-1086 (`.ch-cpv-fmt, .ch-cpv-ply { padding:16px; background: var(--ch-grouped-bg) }`)
- What's wrong:
  - PP-25 covered the coach sheet. The player's view has the same fixed 16px edge, which should be 20 at ≥414.
  - It paints grouped-bg on `main` while the phone canvas below is bg-page (#ede9df / #111512), so the colour changes where `main` ends.
- Should be: owner rule, 16px edge and 20 at ≥414 (`--ch-page-x-phone`, tokens.css:1446). One surface per screen.
- Fix: `padding-inline: var(--ch-page-x-phone)`, and move the grouped-bg to the canvas for these routes (or `min-height:100%`).
- Confidence: high

### MOB-PRAC-5 The player's plan view shows two titles
- Severity: P2
- Where: player > Practice, all phone widths.
- File: src/clubhouse/screens/coachhelm/plan/player/PlayerPractice.tsx (LargeTitle "Practice"); src/clubhouse/shell/nav.ts:369 (stand-in bar "Back · Practice plan")
- What's wrong: the stand-in bar says "Practice plan" and the page's large title says "Practice" right under it. That's two names for one screen, and about 52px of vertical space lost at 320.
- Should be: one title per screen. Either the bar collapses into the large title, or the bar has no title.
- Fix: drop the bar title on this route (nav.ts), or drop the LargeTitle and keep the bar. Use the same word in both places.
- Confidence: medium

### MOB-PRAC-6 "Now" and "Next" go stale on a long-open phone
- Severity: P2
- Where: player's plan view, during practice, home-screen app resumed after minutes.
- File: src/clubhouse/data/practice-plan.ts:84-85 (`nowAt`/`nextAt` computed once on the server); PlayerPractice.tsx (no timer or `visibilitychange` refresh)
- What's wrong: a player who opens the plan at 3:25 and checks again at 4:10 still sees the 3:25 block marked Now. The labels are wrong for the rest of practice unless the page is reloaded.
- Should be: Now/Next reflect the current time.
- Fix: compute Now/Next on the client from block starts. Rerun on a 60s interval and on `visibilitychange` (visible).
- Confidence: medium

### MOB-PRAC-7 Time columns overflow at XXL (`.drow` 46px, `.stop` 52px, `.blk` 54px)
- Severity: P2
- Where: coach sheet, plan blocks and player stops, 320–430, largest non-AX and XXL.
- File: src/clubhouse/styles/coachhelm-plan.css `.drow` (46px), :181-215 `.blk` (54px), :1347-1420 `.stop` (52px)
- What's wrong: "10:30" at XXL type-14-strong is ≈52px, and the cells are fixed px. The time wraps or runs into the block title. That is before AM/PM (MOB-PRAC-1).
- Should be: owner rule, text follows iPhone Text Size without clipping.
- Fix: size the columns as `calc(<px> * var(--ch-type-k))` or `max-content`, and use `font-variant-numeric: tabular-nums`.
- Confidence: medium

### MOB-PRAC-8 Bring and Notes stay two columns at 320
- Severity: P2
- Where: plan sheet, 320 (and 375 at XXL).
- File: src/clubhouse/styles/coachhelm-plan.css `.pp-two` (2 columns, no phone breakpoint); PracticePlanSheet.tsx
- What's wrong: each column is ≈116px at 320. Bring lists and notes wrap one or two words per line, and long equipment names break mid-word.
- Should be: readable line length on the narrowest phone.
- Fix: `@media (max-width: 380px) { .pp-two { grid-template-columns: 1fr } }`, plus the same at large Text Sizes, keyed on `--ch-type-k`.
- Confidence: medium

### MOB-PRAC-9 Plan format's "See … in it" link is small and wraps next to Undo
- Severity: P2
- Where: Plan format, after changing the format, 320–430, all Text Sizes.
- File: src/clubhouse/styles/coachhelm-plan.css:1279-1292 (`.rlinks button` 44px), :1541 (`.rlinks a`, no min-height); PlanFormat.tsx (`.rlinks`)
- What's wrong: the "See {title} in it" link has no 44pt height and no truncation. With a long plan title it wraps to 2–3 lines beside Undo, and the tap target is the text line (≈20px).
- Should be: owner rule, 44pt targets.
- Fix: give `.rlinks a` `min-height:44px; display:inline-flex; align-items:center`, plus `overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0`.
- Confidence: high

### MOB-PRAC-10 Documents: desktop drop copy, a 32px ⋯ button and an 11px type tag on the phone
- Severity: P2
- Where: Practice > Documents, 320–430, light and dark.
- File: src/clubhouse/screens/hub/parts.tsx:723 (drop copy), :771-783 (⋯ `.ch-hb-iconbtn`); src/clubhouse/styles/hub.css:147-158 (32x32), ~:935 (`.ch-hb-file__ic em`, type-11)
- What's wrong:
  - "Drop files to share with the team" shows on a phone, which can't drop files.
  - The ⋯ button is 32x32 with a 4px gap and no hit slop, so it's easy to open the file by mistake.
  - The "PDF" tag is 11px.
- Should be: owner rule, 44pt targets. Phone copy describes a tap.
- Fix:
  - Show "Tap to add files" under `(pointer:coarse)`.
  - Make the ⋯ 44x44 on the phone (or add a `::before` hit area of inset -6px).
  - Set the tag to type-12 or larger.
- Confidence: high

### MOB-PRAC-11 The folder name field refocuses on every render and lacks keyboard hints
- Severity: P2
- Where: plan builder > new / rename folder, keyboard up.
- File: src/clubhouse/screens/coachhelm/plan/PlanCard.tsx:455-470 (callback ref calls `focus()` on every render)
- What's wrong:
  - Every re-render (each keystroke, or a sync) refocuses the field and can move the caret or scroll the sheet.
  - There's no `autoCapitalize="words"` and no `enterKeyHint="done"`.
- Should be: focus once on open, with the right keyboard.
- Fix: focus once with `useEffect(() => ref.current?.focus(), [])` or `autoFocus`. Add `autoCapitalize="words" enterKeyHint="done"`.
- Confidence: medium

### MOB-PRAC-12 Plan format's file input sits outside the modal sheet
- Severity: P2
- Where: Plan format > upload a format file, all widths.
- File: src/clubhouse/screens/coachhelm/plan/format/PlanFormat.tsx (hidden `<input type=file>` rendered outside the FormSheet `<dialog>`; all three options call `input.click()`)
- What's wrong: `showModal()` makes everything outside the dialog inert. Calling `click()` on an inert input works in current WebKit, but it's fragile, and VoiceOver can't reach the input. The upload is also tied to an element the sheet doesn't own.
- Should be: controls the sheet uses live inside the sheet.
- Fix: render the hidden input inside the FormSheet body.
- Confidence: low

---

## Summary
- 40 findings: 0 P0, 15 P1, 25 P2 (Messages 28, Practice 12).
- The worst Messages issues are on iPhone Safari: Details photos and files don't open (pop-up block), there are no message actions on touch at ≥821, and landscape gets the desktop composer, where Return sends.
- Keyboard handling is the common root: the send tap drops the keyboard, 34px of inset padding stays above it, and sheets (poll, plan card Ask) have no Safari fit. Fix it once in Modal/FormSheet with `useSafariKeyboardFit`.
- The Text Size scale isn't passed through: the drag-for-times cap, the 44px thread bar and the fixed time columns in Practice all clip at XXL.
- In Practice, the en-US "10:30 AM" clock in fixed columns, the print root left on screen, the 16px edge and background seam on the player view, and stale Now/Next are the main phone issues.
