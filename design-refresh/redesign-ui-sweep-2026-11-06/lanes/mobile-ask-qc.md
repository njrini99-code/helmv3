# Mobile audit: Ask (ASK) and Quick chat (QC)

Read-only audit of main `062f8a2` against packages `ask` and `coachhelm`. The phone shell is ≤820px (`useChPhone`). Landscape 844x390 and 932x430 therefore get the desktop layout, and iPhone 12/13 mini landscape 812x375 gets the phone layout. Ask v1 (`coachhelm-thread.css`) is the live path; Ask v2 and Quick chat are behind flags. Measurements come from the CSS: phone thread padding 16, the answer mark 36 + gap 12, card padding 12/16 and figure padding 16. Card content width is 208@320, 263@375, 278@390 and 318@430. Figure content width is 176@320, 231@375 and 246@390. Nothing here repeats ASK-1..28, QC-1..23, FID-ASK-*, FID-QC-*, MOT-* or QA-*.

### MOB-ASK-1 Answer bar chart track collapses to 6px at 320
- Severity: P0
- Where: Ask v1 answer with a bars figure (e.g. "Who's hitting the most greens"), 320; 375 is degraded. Any Text Size, light and dark, keyboard down
- File: src/clubhouse/styles/coachhelm-thread.css:488 (`.ch-th--phone .ch-th-bar`, grid `70px minmax(0,1fr) 84px`, gap 8) inside `.ch-th--phone .ch-th-fig` :384 (padding 16)
- What's wrong: The track gets 176 − 70 − 84 − 16 = 6px at 320, 61px at 375 and 76px at 390. At 320 every bar looks identical, so the chart says nothing. At XXL the 70px label column breaks long names onto 2–3 lines while the track stays at 6px.
- Should be: The visual in every answer must read on a phone (owner rule: every answer visual). The ask package phone stills (390) show a track about as wide as the label.
- Fix: At ≤374 stack each row: label and value on one line (`grid-template-columns: minmax(0,1fr) auto`) with the track full width beneath (`grid-column: 1 / -1`). Use `--ch-space-4` between rows. Do the same at XXL by keying on `--ch-type-k`, or with a container query on `.ch-th-fig` (`@container (max-width: 260px)`).
- Confidence: high

### MOB-ASK-2 SG anatomy diverging track is about 12px at 320
- Severity: P0
- Where: Ask v1 strokes-gained anatomy answer, 320 (67px at 375). Default Text Size, light and dark
- File: src/clubhouse/styles/coachhelm-thread.css:1545 (`.ch-th--phone .ch-th-va`: label 88, value 44, gap 8, padding 12 16) and :1607 (grid)
- What's wrong: 208 card width − 32 padding − 88 − 44 − 16 gaps leaves about 12px of track, 6px on each side of zero. A −0.8 putting bar and a +0.3 driving bar differ by about 2px. The chart cannot be read at 320.
- Should be: The ask package anatomy still at 390 has the track as the dominant column.
- Fix: Under a container query (`.ch-th-va` container width < 280), put the label row above the track (`grid-template-areas: "label value" "track track"`). Keep `--ch-th-va-value: 44px`.
- Confidence: high

### MOB-QC-1 Landscape iPhone opens the 640px desktop panel and focuses its field off screen (extends QC-16)
- Severity: P0
- Where: Quick chat opened from the top-right key, landscape 844x390 and 932x430 (desktop branch), keyboard up
- File: src/clubhouse/shell/quick-chat/QuickChatSession.tsx:87 (`if (!phone) field.current?.focus(...)`); src/clubhouse/styles/quick-chat.css:340 (`.ch-qcs.is-desk .qc { top: 62px; height: 640px }`)
- What's wrong: QC-16 noted the 640px height. The new problem is that on a landscape phone the composer sits at about y=702 in a 390px viewport (62 + 640). The desktop branch calls `focus()` on open, so iOS raises the keyboard (about 200px in landscape) for a field that is 300+px off screen. Safari then scrolls the layout viewport to reach the fixed field, which shifts the page behind. The user sees a header, a keyboard, and no field.
- Should be: The panel fits the visual viewport, the composer is always visible, and focusing on open happens only with a fine pointer.
- Fix: Gate the focus with `matchMedia('(pointer: fine)')`, as Composer.tsx already does with `finePointer`. Set the desktop panel height to `min(640px, calc(100dvh - var(--ch-qc-qc-top) - 14px))`.
- Confidence: high

### MOB-QC-2 Phone panel has no minimum height, so with the keyboard up in mini landscape the composer is clipped
- Severity: P0
- Where: Quick chat, iPhone 12/13 mini landscape 812x375 (phone layout), keyboard up
- File: src/clubhouse/shell/quick-chat/QuickChatSession.tsx:72–73 (`Math.min(700, kb - bar - 6 - 8)`); src/clubhouse/styles/quick-chat.css:339 (`.qc` fixed, overflow hidden)
- What's wrong: `kb` is about 375 − 200 (keyboard + QuickType bar) ≈ 175 and `bar` is about 55, so the height is about 114px. The header (~68) plus the composer (~56) need 124, so the composer is clipped by `overflow:hidden` and the body is 0. Nothing clamps the height from below and nothing reflows for this case.
- Should be: The composer is always visible above the keyboard (spec 06 S-PANEL, keyboard state).
- Fix: Clamp with `Math.max(header + composer, …)`. When the space is below that, collapse the header to its 44px close row and let the body scroll to 0, or present the panel full-screen (`top: env(safe-area-inset-top)`) while the keyboard is up.
- Confidence: medium (keyboard height in landscape varies)

### MOB-ASK-3 Blue "send" return key inserts a newline on iPhone
- Severity: P1
- Where: Ask composer, every phone width, keyboard up
- File: src/clubhouse/screens/coachhelm/chat/Composer.tsx:408 (`enterKeyHint="send"`) and :340 (`if (e.key === 'Enter' && !e.shiftKey && finePointer)`)
- What's wrong: iOS draws a blue "send" return key, but with a coarse pointer the handler ignores Enter, so tapping it adds a line break. The key's label promises one thing and does another. This is the most common action in the lane.
- Should be: The return key's label matches its action (brief: Keyboard, return key label and action).
- Fix: Either keep `enterKeyHint="send"` and submit on Enter for coarse pointers too (a newline stays reachable by paste), or set `enterKeyHint="enter"` on coarse pointers so the key reads "return". The first matches Messages.
- Confidence: high

### MOB-ASK-4 Plan sheet inputs are 15px, so iOS zooms the page on focus
- Severity: P1
- Where: Ask, practice plan card sheet: "Ask about this block", "Ask about this station" and the folder-name field. All widths, default Text Size (zoom happens below a computed 16px)
- File: src/clubhouse/styles/coachhelm-plan.css:474 (`.ch-cpv .fr .inp`, `--ch-type-15`), :686–694 (`.ch-cpv-sheet .ask-in input`, `--ch-type-15`); TSX src/clubhouse/screens/coachhelm/plan/PlanCard.tsx:469, 603, 646
- What's wrong: The computed font size is 15px at default Text Size, so Safari zooms the page about 1.07x on focus and does not zoom back out after blur. The sheet then sits off-centre with horizontal pan.
- Should be: Inputs are at least 16px (owner rule; brief: inputs under 16px).
- Fix: Use `--ch-type-17` (the body style) for these inputs, or `max(16px, var(--ch-type-15))` if the look must stay.
- Confidence: high

### MOB-QC-3 Quick chat "New folder" field is 15px, so iOS zooms inside the glass panel
- Severity: P1
- Where: Quick chat, plan task, new folder row, all phone widths, keyboard up
- File: src/clubhouse/styles/quick-chat.css:262 (`.ch-qcs .fnew input`, `--ch-type-15-medium`); TSX src/clubhouse/shell/quick-chat/visuals/PlanTask.tsx:187
- What's wrong: Same 15px zoom, but inside a fixed panel. After the zoom the panel's `left:10px; right:10px` no longer matches the visual viewport, so the panel is cut on the right until the user pinches back. The field also autofocuses via `ref={(el) => el?.focus()}`, so the zoom happens without a tap.
- Should be: At least 16px.
- Fix: `font: var(--ch-type-17-medium)` (or `max(16px, …)`). Also add `enterKeyHint="done"` and `autoCapitalize="words"`.
- Confidence: high

### MOB-QC-4 Auto-scroll fires on every streamed token, smooth, with no stick-to-bottom check
- Severity: P1
- Where: Quick chat body while an answer streams, all phone widths, with the user scrolled up to reread
- File: src/clubhouse/shell/quick-chat/QuickChatSession.tsx:140–143 (`useEffect … el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })` on `[chat.messages]`)
- What's wrong: `chat.messages` changes on every token, so each token starts a new 300–400ms smooth scroll that cancels the last one. iOS shows this as a constant stutter, and a user who scrolls up to reread is pulled back down about every 30ms. Momentum scrolling is cut off by each programmatic scroll.
- Should be: Follow only while the reader is at the bottom, as iMessage does (owner rule: keep smooth scroll).
- Fix: Track `atBottom = scrollHeight - scrollTop - clientHeight < 24` in a scroll listener. Scroll only when `atBottom`, use `behavior:'auto'` during a stream and `'smooth'` only for a new user message. Show a "jump to latest" pill otherwise (the existing Ask pattern requested in ASK-15).
- Confidence: high

### MOB-QC-5 Swipe-to-close on the panel header never fires on touch
- Severity: P1
- Where: Quick chat on phone, swiping up on the header to close, all widths
- File: src/clubhouse/shell/quick-chat/QuickChatSession.tsx:196–205 (`onPointerDown`/`onPointerUp` swipe), spread on `.qc__h` (:213) and the grab (:341)
- What's wrong: The header has no `touch-action: none`, so iOS turns the vertical drag into a pan, sends `pointercancel`, and never sends `pointerup`. `swipeFrom` is never compared, so the swipe never closes the panel. Only a tap-and-release with no movement reaches `onPointerUp`.
- Should be: Spec 06 S-PANEL: swipe up to dismiss.
- Fix: Set `touch-action: none` on `.qc__h` and the grab. Handle `onPointerCancel` by resetting. Use `setPointerCapture` on pointerdown and track `pointermove` so the panel follows the finger, as `ui/Modal`'s sheet drag does.
- Confidence: high

### MOB-QC-6 Grab handle swipe zone is 36x5px and sits in the home-indicator gesture zone
- Severity: P1
- Where: Quick chat on phone, bottom of the panel, all widths, portrait and standalone
- File: src/clubhouse/shell/quick-chat/QuickChatSession.tsx:341 (`<i className="ch-grab" …>`, no `ch-grab--hit`); src/clubhouse/styles/controls.css:1524 (`.ch-grab--hit::after`, the shared hit area)
- What's wrong: The handle is only the visible 36x5 bar, because it does not use the shared `ch-grab--hit` hit area. The panel bottom is 8px above the visual viewport bottom (see MOB-QC-7), so an upward swipe there is taken by iOS's home gesture first.
- Should be: Spec 06 S-PANEL: "swipe zone: the bottom 21pt, full width".
- Fix: Add `ch-grab--hit`, make the zone a full-width 21pt strip (`.qc__sheet::after`), and lift the panel clear of the indicator (MOB-QC-7).
- Confidence: high

### MOB-QC-7 Phone panel ignores safe-area-inset-bottom and ends in the home-indicator zone
- Severity: P1
- Where: Quick chat on phone, keyboard down, Face ID iPhones (375/390/430), Safari with the toolbar collapsed and standalone mode
- File: src/clubhouse/shell/quick-chat/QuickChatSession.tsx:72–73 (`kb - bar - 6 - 8`, no inset); src/clubhouse/styles/quick-chat.css:339
- What's wrong: The panel bottom is 8px above `visualViewport` bottom. In standalone on a 13 mini (812 high, inset 34) the panel ends at y≈804, so the composer's lower 26px and its send button sit under the home indicator. In Safari, when the toolbar collapses, `visualViewport.height` grows but nothing re-runs `place()` until resize, so the panel is short or long by about 50px.
- Should be: Content clears `env(safe-area-inset-bottom)` when the keyboard is down.
- Fix: Subtract `max(8px, env(safe-area-inset-bottom))` when the keyboard is down (`vv.height ≈ innerHeight`), read through a CSS var probe. Re-run `place()` on `visualViewport` `resize`, which already covers the toolbar change.
- Confidence: medium

### MOB-ASK-5 Artifact push on phone has no edge-swipe back and no history entry
- Severity: P1
- Where: Ask, opening an artifact (plan, report) from an answer on phone, all widths
- File: src/clubhouse/screens/coachhelm/chat/parts/Artifact.tsx:75–85 (plain fixed `div.ch-ak-push`, not a `PhoneScreen`)
- What's wrong: Every other pushed phone screen uses `PhoneScreen`, which has `useEdgeSwipeBack`. This one does not. The left-edge swipe therefore hits Safari's own back gesture, which goes back past the Ask page and loses the conversation's scroll position and draft. The browser Back button (and the Android back button) does the same, because nothing pushes a history state.
- Should be: A pushed screen pops on an edge swipe and on Back (native nav).
- Fix: Render the push through `PhoneScreen`, or push `history.pushState({ artifact })` on open and close on `popstate`, plus `useEdgeSwipeBack(close)`.
- Confidence: high

### MOB-ASK-6 Action-card Confirm button is clipped at 320 with XXL text
- Severity: P1
- Where: Ask v1 confirm card (e.g. "Move Saturday Spring Preview Tournament"), 320, Text Size XXL (k≈1.353)
- File: src/clubhouse/styles/coachhelm-thread.css:1206 (`.ch-th--phone .ch-th-act__foot .ch-btn { flex: 1 1 0 }`) with `.ch-btn` `white-space: nowrap`, inside `.ch-th-act` :1055 (`overflow: hidden`)
- What's wrong: At XXL, Cancel and Confirm need about 107px each with their padding, a total of 222 > 208 available. `nowrap` stops the labels from shrinking, the row overflows, and the card's `overflow:hidden` cuts about 14px off the right of Confirm, the primary action.
- Should be: Primary actions are never clipped at any Text Size.
- Fix: `flex-wrap: wrap` on `.ch-th-act__foot`, with `.ch-btn { flex: 1 1 120px }`, so the buttons stack full width when they don't fit (Confirm on top, the iOS alert pattern).
- Confidence: high

### MOB-ASK-7 Action-card fact values break mid-word at 320 with XXL text
- Severity: P1
- Where: Ask v1 confirm card facts ("Event: Saturday Spring Preview Tournament"), 320, XXL
- File: src/clubhouse/styles/coachhelm-thread.css:1196 (`.ch-th--phone .ch-th-act__facts > div`, `96px minmax(0,1fr)`), :1126 (`overflow-wrap: anywhere`)
- What's wrong: The value column is about 100px. At XXL "Tournament" is wider than that, and `anywhere` breaks it as "Tourname / nt". A 96px label column at XXL also wraps "Players" and "When" awkwardly.
- Should be: Words never break mid-word on a phone. Long values wrap on spaces (long real names in the brief).
- Fix: At ≤374 or XXL stack the label above the value (`grid-template-columns: 1fr`, label in `--ch-type-13` secondary). Use `overflow-wrap: break-word` instead of `anywhere`.
- Confidence: high

### MOB-ASK-8 Ranked list name column is about 52px at 320, so names break mid-word
- Severity: P1
- Where: Ask v1 rank answer ("Who's improving most"), 320, default and XXL
- File: src/clubhouse/styles/coachhelm-thread.css:638 (`.ch-th--phone .ch-th-rank li`, `14px minmax(0,1.4fr) minmax(36px,1fr) auto`), :573 (`overflow-wrap: anywhere`)
- What's wrong: 208 − 14 − value (~40) − 3 gaps of 8 leaves about 130px for name plus bar, split 1.4:1, so the name gets about 76px at default and about 52px once the value grows at XXL. "Christopherson" breaks as "Christophe / rson".
- Should be: Long real names stay whole or truncate cleanly.
- Fix: Below a container width of 260, give the name its own row above the bar. Otherwise use `overflow-wrap: break-word` with `text-overflow: ellipsis` on one line and the full name in `title` and `aria-label`.
- Confidence: high

### MOB-ASK-9 Answer mark indent takes 48px of every phone answer
- Severity: P1
- Where: Ask v1, every answer, 320/375
- File: src/clubhouse/styles/coachhelm-thread.css:90 (`.ch-th-mark` 36x36) plus the 12px row gap; :144 (`.ch-th--phone .ch-th-card` padding 12 16)
- What's wrong: This is the root cause of MOB-ASK-1, 2, 7 and 8. At 320 the answer card is 208px of a 288px column, so 28% of the width goes to a repeated avatar. Messages and the ask package phone stills put the avatar once above the turn, not as a left gutter on every card.
- Should be: The ask package phone (390) layout: the mark sits on the turn header and the cards run full width to the 16px edge.
- Fix: At ≤414 move `.ch-th-mark` into the turn's header row (24px, `--ch-space-2` gap) and let the cards span the whole column. This gives back 48px on every answer.
- Confidence: medium (check against the ask package's phone stills before changing it)

### MOB-ASK-10 Keyboard-up phone chrome leaves about 170px of thread on an iPhone SE
- Severity: P1
- Where: Ask, coach, 375x667 (SE 3), keyboard up, default Text Size; worse at XXL
- File: src/clubhouse/screens/coachhelm/chat/Ask.tsx:343–346 (`.ch-ak-top` with CoachHelmTabs, or AllowanceMeter for a player) and the scope line and dock below
- What's wrong: The stack is status bar plus topbar (~70), Board|Ask tabs (8 + 44 + 8 = 60), scope line (~24), dock (~76) and keyboard with QuickType (~300). That leaves about 137–170px for the conversation, about two lines of an answer. A player's AllowanceMeter card (padding 12 16) is taller still. Nothing collapses when the composer is focused.
- Should be: When the keyboard is up, the content area is the priority, as in Messages: the tabs and meter scroll away and only the composer stays docked.
- Fix: When the composer is focused on coarse pointers (`:has(.ch-ak-dock textarea:focus)`), hide `.ch-ak-top` and the scope line (`display:none` or a transform with reduced-motion fallback), or let them scroll with the thread instead of sitting sticky.
- Confidence: medium

### MOB-ASK-11 The "+" menu blurs the composer, so the keyboard drops and comes back
- Severity: P1
- Where: Ask composer on phone, keyboard up, tapping "+"
- File: src/clubhouse/screens/coachhelm/chat/Composer.tsx:350–372 (the `+` Menu trigger has no `onMouseDown={(e) => e.preventDefault()}`, unlike the `@` button at :454); src/clubhouse/ui/Menu.tsx:140 (rAF focuses the first menuitem)
- What's wrong: The tap moves focus to the trigger, then Menu focuses its first item, so the textarea blurs and the keyboard slides down (~250ms). Choosing an item calls focusEnd, which raises the keyboard again. The menu also opens in the space the keyboard leaves, then the keyboard covers it. The whole thing looks like a glitch.
- Should be: The "@" button already keeps the keyboard up (comment at :453).
- Fix: Add the same `onMouseDown` preventDefault to the `+` trigger, and pass a Menu prop (e.g. `focusFirst={finePointer}`) so it does not move focus to an item on coarse pointers.
- Confidence: high

### MOB-QC-8 Receipt row leaves the receipt text about 62px at 320 and about 23px at XXL
- Severity: P1
- Where: Quick chat task receipt ("Added Wedge Distance Control (80-120 yards) to Tuesday" with Undo and Open), 320; XXL
- File: src/clubhouse/styles/quick-chat.css:192 (`.ch-qcs .rcpt`, `26px minmax(0,1fr) auto`), :199 (`.rcpt__a` gap 2), :200 (`.tbtn` padding 0 8, 15px strong)
- What's wrong: At 320 the panel is 300 wide. After body margin and padding (36) and task padding (24) the row is 240. Icon 26, two gaps 16, Undo ~80, Open ~54 leaves about 62px for the receipt text, which wraps to 5–6 lines. At XXL the buttons grow to about 175px and the text gets about 23px, one or two letters per line.
- Should be: The receipt reads in one or two lines, and Undo stays a clear 44pt target.
- Fix: Below a container width of 300 (or at XXL), wrap `.rcpt__a` to its own row (`grid-template-areas: "icon text" ". actions"`).
- Confidence: high

### MOB-QC-9 Phone panel sits under the notch in mini landscape
- Severity: P1
- Where: Quick chat, iPhone 12/13 mini landscape 812x375 (phone layout), notch side either way
- File: src/clubhouse/styles/quick-chat.css:339 (`.ch-qcs.is-phone .qc { left: 10px; right: 10px }`)
- What's wrong: In landscape the side insets are about 50px, so with `left:10px` the panel's first 40px (the CoachHelm mark, the close button on the other side, the start of every line) is under the sensor housing.
- Should be: Fixed UI respects `env(safe-area-inset-left/right)`.
- Fix: `left: max(10px, env(safe-area-inset-left)); right: max(10px, env(safe-area-inset-right))`.
- Confidence: high

### MOB-QC-10 Panel stays open across navigation, so "Looking at" changes mid-task
- Severity: P1
- Where: Quick chat on phone, panel open, then Safari edge-swipe back or a link in an answer
- File: src/clubhouse/shell/quick-chat/QuickChatProvider.tsx:31–81 (no effect closes `open` on a `pathname` change; `looking` at :39 is recomputed from the new path)
- What's wrong: An edge swipe or tapped link changes the page behind while the panel stays open. The "Looking at" context and the quick starts (`quickStarts(pathname)`, QuickChatSession.tsx:239) silently switch to the new page in the middle of a task, so a confirm prepared for one player can show another page's context.
- Should be: Native modal panels close when the screen under them changes. Context is fixed for a task.
- Fix: In the provider, `useEffect(() => setOpen(false), [pathname])`, or freeze `looking` while a run or confirm is pending.
- Confidence: medium

### MOB-ASK-12 Artifact push ignores the side insets in mini landscape
- Severity: P2
- Where: Ask artifact push, 812x375 mini landscape (phone layout)
- File: src/clubhouse/styles/coachhelm-ask-v2.css:141 (`.ch-ak-push { inset: 0; padding-top: 48px }`), :139 (`.apb` padding 16)
- What's wrong: The body and dock have 16px side padding with no safe-area term, so the content starts under the notch (inset about 50px). The push is full-bleed fixed, so the shell's own inset padding does not reach it.
- Should be: The 16px page edge is measured from the safe area.
- Fix: `padding-left: max(16px, env(safe-area-inset-left)); padding-right: max(16px, env(safe-area-inset-right))` on `.apb` and `.apdock`.
- Confidence: high

### MOB-ASK-13 Phone composer placeholder wraps to two lines at 320
- Severity: P2
- Where: Ask composer, first turn, 320; 375 at XXL
- File: src/clubhouse/screens/coachhelm/chat/Composer.tsx:348 (phone placeholder 'Ask about a player, a stat, or the week')
- What's wrong: The text area is about 124px at 320 (320 − 24 dock padding − about 172 for the +, @ and send buttons and padding). The 40-character placeholder wraps to two lines and the empty composer grows to two rows. QC-6 covers the Quick chat placeholder only.
- Should be: Ask spec E-COMP: "one line with ellipsis for the placeholder".
- Fix: Use a shorter phone placeholder ("Ask CoachHelm") at ≤374, or `textarea::placeholder { white-space: nowrap; overflow: hidden; text-overflow: ellipsis }` (Safari honours this on a single-row textarea).
- Confidence: high

### MOB-ASK-14 Chat settings sheet ignores its 0.62 detent
- Severity: P2
- Where: Ask, Chat settings on phone, all widths
- File: src/clubhouse/screens/coachhelm/chat/Ask.tsx:336 (`<Modal detent={0.62}>`); src/clubhouse/styles/controls.css:1858 (detent rules only under `main[data-ch-crh='on']`)
- What's wrong: The detent CSS applies only inside the CRH lane, so in Ask the sheet opens at its default height (near full height). The page behind is no longer visible, so it does not look like a medium-detent iOS sheet.
- Should be: A medium detent for a short settings list.
- Fix: Scope the detent rules to `.ch-modal[data-ch-detent]` in general, or add `main[data-ch-ask]` to the selector.
- Confidence: high

### MOB-ASK-15 Scope line truncates the important part (the time window) at XXL
- Severity: P2
- Where: Ask v2 scope line ("Demo University Golf · all players · last 30 days"), 320/375, XXL
- File: src/clubhouse/styles/coachhelm-ask-v2.css:254–263 (`.ch-ak-scope` nowrap, ellipsis)
- What's wrong: The ellipsis cuts from the end, so at 320 XXL it reads "Demo University Golf · all pla…". The window that tells the coach what the answer covers is lost first.
- Should be: Long real names truncate in the least informative segment.
- Fix: Split into spans with the team name `min-width:0; overflow:hidden; text-overflow:ellipsis` and the window `flex:none`, or allow two lines (`white-space: normal`, `-webkit-line-clamp: 2`).
- Confidence: high

### MOB-ASK-16 Citation chip breaks the prose line spacing, and its hit area covers the lines above and below
- Severity: P2
- Where: Ask v2 answer prose with citations, all widths, worse at XXL
- File: src/clubhouse/styles/coachhelm-ask-v2.css:41 (`.cite` inline-flex, padding 4 8, 13px strong), :42 (`.cite::after { inset: -12px 0 }`)
- What's wrong: The chip is about 26px tall inside 21px prose lines, so every line with a citation is about 5px taller and the paragraph spacing is uneven. The 12px vertical hit area reaches into the words of the lines above and below, so taps meant for a link or for selecting text open the citation.
- Should be: Inline chips sit in the line box (as Safari Reader does), and targets don't overlap other content.
- Fix: Use `padding: 1px 6px; line-height: 1; vertical-align: baseline` so the chip fits a 21px line, and limit `::after` to `inset: -4px -4px`. Give the citations a 44pt target as a footer row under the answer, not inline.
- Confidence: medium

### MOB-QC-11 Undo and Open are 2px apart
- Severity: P2
- Where: Quick chat receipt, all phone widths
- File: src/clubhouse/styles/quick-chat.css:199 (`.ch-qcs .rcpt__a { gap: 2px }`), :200 (`.tbtn`)
- What's wrong: Two 44pt targets with opposite effects (Undo reverses, Open navigates away) are 2px apart, so a slightly off tap does the other action.
- Should be: At least 8pt between targets (brief: Touch).
- Fix: `gap: var(--ch-space-2)` (8px), or a hairline divider between them.
- Confidence: high

### MOB-QC-12 Tone and option chips' 44px hit areas overlap between wrapped rows
- Severity: P2
- Where: Quick chat message-tone chips and question options, wrapping to two or more rows at 320/375, any Text Size
- File: src/clubhouse/styles/quick-chat.css:153–154 (`.mtone` gap 6, buttons about 30px tall), :241–242 (`.opts` gap 6, min-height 36), :334 (`::before` 44x44 hit area)
- What's wrong: The rows are 36px (30 + 6) and 42px (36 + 6) apart, but each hit area is 44px tall, so hit areas overlap by 8px and 2px. The chip later in the DOM wins, so a tap on the bottom edge of a first-row chip picks the chip below it.
- Should be: Targets at least 44pt, at least 8pt apart, and never overlapping.
- Fix: Set the row gap to `calc(44px - chip height)`: `.mtone { row-gap: 14px }`, `.opts { row-gap: 8px }`. Or make the chips themselves `min-height: 44px` and drop the `::before`.
- Confidence: high

### MOB-ASK-17 Plan sheet "Ask about…" field has no focus ring, a 28px send button and no return key behaviour
- Severity: P2
- Where: Ask, practice plan card sheet, ask field, all widths, keyboard up
- File: src/clubhouse/styles/coachhelm-plan.css:686–694 (`.ask-in input` `outline: 0`, min-height 28), :697 (`.ask-in button` 28x28, no hit area); TSX src/clubhouse/screens/coachhelm/plan/PlanCard.tsx:603, 646 (no `enterKeyHint`, `onKeyDown`, `autoCapitalize`)
- What's wrong: The send button is 28x28 with no `::after` hit area, under the 44pt rule. With `outline:0` and no `:focus-visible` ring, a keyboard or VoiceOver user cannot see which field has focus. The return key reads "return" and does nothing.
- Should be: 44pt targets, a visible focus ring (as on `.ch-field`), and a return key that sends.
- Fix: Use the shared composer send button (or add `::after { inset: -8px }`). Add `:focus-within` on `.ask-in` with `--ch-focus-ring`. Add `enterKeyHint="send"` and submit on Enter.
- Confidence: high

### MOB-QC-13 VoiceOver reads streaming answers and typed titles letter by letter
- Severity: P2
- Where: Quick chat with VoiceOver on, any width
- File: src/clubhouse/shell/quick-chat/QuickChatSession.tsx:233 (`aria-live="polite"` on all of `.qc__inner`); src/clubhouse/shell/quick-chat/TaskCard.tsx:16–25, 148, 156 (`useTyped` char-by-char title in `<b aria-label={title}>`)
- What's wrong: The live region wraps the whole conversation, so every streamed token and every frame of the typed title is a DOM mutation. VoiceOver queues partial announcements ("Mov", "Moving Sat", …) and then reads the whole region again. On a `<b>`, `aria-label` is ignored (it is not a labelled role), so the typed fragments are what gets read.
- Should be: One announcement when an answer or task step completes.
- Fix: Remove `aria-live` from `.qc__inner`. Add a visually hidden `role="status"` that gets the finished text once per message or step. Render the typed title `aria-hidden` with a `.ch-sr-only` full title next to it.
- Confidence: high

### MOB-ASK-18 role="log" over the streaming thread repeats announcements, with nested live steps
- Severity: P2
- Where: Ask v1 with VoiceOver, while an answer streams
- File: src/clubhouse/screens/coachhelm/chat/Thread.tsx:189 (`role="log"` on `.ch-th-col`), plus the nested `aria-live` on the step list
- What's wrong: `role=log` is an implicit polite live region, and the streamed answer mutates inside it on every token, as does the nested steps region. VoiceOver on iOS announces fragments and can read the step list twice, once from each region.
- Should be: One announcement per finished turn.
- Fix: Keep `role="log"` but mark the streaming message `aria-busy="true"` until it finishes. Remove the nested `aria-live` on the steps, or move it out of the log.
- Confidence: medium

### MOB-QC-14 The panel dialog is not modal for VoiceOver
- Severity: P2
- Where: Quick chat with VoiceOver, phone
- File: src/clubhouse/shell/quick-chat/QuickChatSession.tsx:212 (`role="dialog"`, no `aria-modal`, page not `inert`)
- What's wrong: Tab is trapped (AC-QC-PNL-08), but VoiceOver swipe navigation is not limited by Tab handling. A right swipe leaves the panel and reads the page behind the scrim. The scrim is `aria-hidden` and the page is not, so the panel does not behave as a modal for VoiceOver.
- Should be: A modal panel behaves like `ui/Modal`.
- Fix: Add `aria-modal="true"` and set `inert` on the shell's main content while the panel is open, the same mechanism `ui/Modal` uses.
- Confidence: high

### MOB-ASK-19 Artifact push is a dialog with no modality and no focus move
- Severity: P2
- Where: Ask artifact push with VoiceOver, phone
- File: src/clubhouse/screens/coachhelm/chat/parts/Artifact.tsx:77 (`role="dialog"`, no `aria-modal`, no initial focus)
- What's wrong: VoiceOver focus stays on the answer button that opened the push, which is now covered. The first right swipe reads the hidden conversation behind it. Nothing returns focus to the opener when the push closes.
- Should be: A pushed screen moves VoiceOver focus to its title and restores it on pop.
- Fix: Render through `PhoneScreen` (see MOB-ASK-5), or focus the `PhoneTop` title on mount, make the thread `inert`, and restore focus to the opener on close.
- Confidence: high

### MOB-ASK-20 Brief question options are announced as a radio group with no radios
- Severity: P2
- Where: Ask v2 brief card questions with VoiceOver
- File: src/clubhouse/screens/coachhelm/chat/parts/BriefCard.tsx:64 (`role={q.multi ? 'group' : 'radiogroup'}` around buttons with `aria-pressed`)
- What's wrong: VoiceOver says "radio group" and then reads each option as "toggle button, selected". The rotor's radio navigation finds nothing, and arrow-key roving (implied by radiogroup) is not wired.
- Should be: Roles that match the control.
- Fix: For single choice, use `role="radio"` and `aria-checked` on each button with roving tabindex, or keep `aria-pressed` and use `role="group"` for both cases.
- Confidence: high

## Summary
- 34 findings: 4 P0, 17 P1, 13 P2, across ASK (20) and QC (14).
- Worst: v1 answer visuals collapse at 320 (bar track 6px, SG track 12px) because the 48px mark gutter and padding leave 176–208px of content.
- The landscape iPhone gets the desktop Quick chat panel (640px tall in 390px), which focuses its field off screen. The phone panel has no height floor, so in mini landscape the composer is clipped with the keyboard up.
- Keyboard: Ask's blue "send" key inserts a newline, three plan inputs and the QC folder field are 15px and zoom, and "+" drops the keyboard.
- Native feel: the Artifact push has no edge swipe or history; the QC swipe-to-close never fires and its grab is 5px in the home-indicator zone; auto-scroll yanks on every token; and VoiceOver announces streaming text in fragments.
