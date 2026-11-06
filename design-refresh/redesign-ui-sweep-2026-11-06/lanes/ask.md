# Ask lane audit (CoachHelm Ask, `/golf/dashboard/coachhelm?view=ask&c=<id>`)

Repo `helmv3` main `062f8a2`, read-only. Covers `src/clubhouse/screens/coachhelm/chat/*` (Ask, Thread, Home, History, Prose, parts/*, visual/blocks), `styles/coachhelm-ask.css`, `styles/coachhelm-ask-v2.css`, `styles/coachhelm-thread.css`, and the PreviewAsk/PreviewAskV2 fixtures. Specs: `design-refresh/ask/04-FIDELITY-SPEC.md`, `06-SCREEN-SPECS.md`, `ACCEPTANCE-SHARED.md`, `visual-pass-2026-10-28/RUBRIC.md`. Dark theme selector is `html[data-fw-theme='dark']`.

### ASK-1 Desktop artifact pane renders under the conversation as raw JSON
- Severity: P0
- Where: thread with an opened artifact (draft plan, lineup, message), desktop 1440, light and dark
- File: src/clubhouse/screens/coachhelm/chat/Ask.tsx:400; src/clubhouse/styles/coachhelm-ask-v2.css:134 (`.ch-ak-pane`)
- What's wrong: `<ArtifactView>` is rendered as a sibling after `.ch-ask-body` inside `main.ch-ask` (a flex column), not inside the body row. So the 452px pane drops below the thread, left-aligned, and pushes the dock off-screen. Its body is `<pre className="ch-ak-plain">{JSON.stringify(b, null, 2)}</pre>`, and `.ch-ak-plain` has no CSS anywhere. The coach sees monospace JSON in an unstyled pre.
- Should be: ask/04-FIDELITY-SPEC (desktop: thread max 680 plus right pane 452 side by side); ask/06 artifact pane screen
- Fix: render `ArtifactView` inside the `.ch-ask-body` flex row, next to the thread column. Pass the real artifact renderer (the same TaskCard/visual body the thread uses) instead of a JSON `pre`, or remove the pane until there is one.
- Confidence: high

### ASK-2 Composer hides under the iOS Safari keyboard
- Severity: P0
- Where: thread and home composer, phone (iOS Safari 26), light and dark
- File: src/clubhouse/styles/coachhelm-ask.css:892, :895 (`.ch-ask` phone height uses `var(--keyboard-height, 0px)`); src/clubhouse/shell/PhoneScreen.tsx:186 (`useSafariKeyboardFit`)
- What's wrong: Ask's phone height subtracts `--keyboard-height`. That value comes from CapacitorProvider's web fallback, `innerHeight - vv.height - vv.offsetTop`. The comment at PhoneScreen.tsx:186 says this reads 0 on Safari 26 because Safari shrinks innerHeight. Messages opts into `PhoneScreen keyboardAware`; Ask does not (no `keyboardAware` in chat/*.tsx). With the keyboard up, the column keeps its full height, Safari pans the page, and the topbar scrolls away or the dock sits under the keyboard.
- Should be: ACCEPTANCE-SHARED (composer pinned above the keyboard); coachhelm/02-PLAN:57 (size from visualViewport)
- Fix: wrap the phone Ask in `PhoneScreen keyboardAware` (as Messages does), or drive the height from `useSafariKeyboardFit` / visualViewport `resize` + `scroll`, instead of `--keyboard-height`.
- Confidence: medium (from code and the in-repo comment; not reproduced on a device)

### ASK-3 Phone artifact push screen sits under the top bar, with two PhoneTops portalled into one slot
- Severity: P1
- Where: artifact opened from the thread, phone 390, light and dark
- File: src/clubhouse/styles/coachhelm-ask-v2.css:141 (`.ch-ak-push`); src/clubhouse/screens/coachhelm/chat/parts/Artifact.tsx (phone branch renders its own `PhoneTop`); src/clubhouse/shell/phone-chrome.tsx:359
- What's wrong: `.ch-ak-push` is `position: fixed; inset: 0; z-index: var(--ch-z-sticky)` (40), the same z as the sticky phone topbar. It uses `padding-top: 48px` with no `env(safe-area-inset-top)`, so on a notched phone its content starts about 11px under the status-bar area. Ask's own PhoneTop (Chats / title / New chat) and the artifact's PhoneTop ("‹ Ask") both portal into the same bar slot. Which one wins depends on mount order, so the back button can be doubled or hidden.
- Should be: ask/06 artifact push (one header with back "Ask"); H11 overlap
- Fix: let the artifact view replace Ask's PhoneTop: render one PhoneTop and swap its props while an artifact is open. Use `padding-top: calc(var(--ch-phone-topbar-h) + env(safe-area-inset-top))` and a z above the bar only if the push owns its own header.
- Confidence: medium

### ASK-4 Composition expand button sits on top of the card title
- Severity: P1
- Where: answer with a composition visual (`.ch-th-cv`), phone and desktop, light and dark
- File: src/clubhouse/styles/coachhelm-thread.css:1977–1995 (`.ch-th-cv__expand`), :1739 (`.ch-th-cv__head`)
- What's wrong: the expand button is `position: absolute; top: 0; right: 0`, 32×32. `.ch-th-cv__head` has no right padding, so a long entity line or title ("Saturday Spring Preview Tournament") runs under the button. The button is also 32px, under the 44px target.
- Should be: H11 (no overlap); H10 (44 hit area)
- Fix: put the expand button in the head flex row (`display:flex; gap:8px`, title `flex:1; min-width:0`). Or give the head `padding-right: 44px`, and give the button a 44px `::after` hit area.
- Confidence: high

### ASK-5 Composition visuals are three cards deep inside the answer bubble
- Severity: P1
- Where: answer with a composition visual, phone 390 (most visible) and desktop, light and dark
- File: src/clubhouse/styles/coachhelm-ask-v2.css:18 (`.msg-a`: padding 16, radius xl, bubble bg); src/clubhouse/styles/coachhelm-thread.css:1725 (`.ch-th-cv`: bg-subtle, padding 16, radius 20), :1777 (`.ch-th-cv__fig`: sheet bg, padding 12, radius 16)
- What's wrong: bubble → composition card → figure card is three nested surfaces. At 390 the figure's content width is about 390 − 32 (page) − 32 (bubble) − 32 (cv) − 24 (fig) ≈ 270px. Radii run 20 → 20 → 16, where H17 wants outer minus padding (20 − 16 = 4). This is the "card nested in card" pattern the owner flagged on Coach Home.
- Should be: brief pattern "nested cards"; H17; DESIGN_LANGUAGE (one surface level inside a bubble)
- Fix: drop the `.ch-th-cv` background and padding inside `.msg-a` (keep it as a plain group with a hairline separator), and keep `.ch-th-cv__fig` as the only inset well, with radius `calc(var(--ch-radius-xl) - 16px)` or `--ch-radius-sm`.
- Confidence: high

### ASK-6 Citation popover is trapped under the next turn and runs off the right edge
- Severity: P1
- Where: tapping a "read" chip in an answer, phone 390 and desktop, light and dark
- File: src/clubhouse/styles/coachhelm-ask-v2.css:18 (`.msg-a { filter: var(--ch-bubble-theirs-shadow) }`), :44 (`.cpop`); src/clubhouse/screens/coachhelm/chat/parts/ReadChip.tsx
- What's wrong: `filter` on `.msg-a` creates a stacking context, so `.cpop` (z `--ch-z-panel`) can't rise above the following `.ch-ak-turn`, and the next bubble paints over it. `.cpop` is `left: 0; width: 280px; max-width: 72vw` with no collision handling. A chip that sits past about 110px from the left at 390 pushes the popover past the right edge (no `overflow` clip on the thread column, so it causes horizontal scroll).
- Should be: H11; ask/06 citation popover
- Fix: render the popover through the shared `Menu`/popover primitive in `src/clubhouse/ui/` (portalled, flips and clamps to the viewport), or move the shadow to `box-shadow` so there is no stacking context, and clamp `left` against the column width.
- Confidence: high (stacking context is certain from CSS); medium for the edge overflow amount

### ASK-7 Markdown in answers renders wrong: headings merge, numbered lists turn into bullets, code shows backticks
- Severity: P1
- Where: any answer the model formats, phone and desktop, light and dark
- File: src/clubhouse/screens/coachhelm/data/coachhelm-chat-thread.ts:579 (`parseProse`, heading handling near :617); src/clubhouse/screens/coachhelm/chat/Prose.tsx; prompt rules lib/coachhelm/v3/chat/instructions.ts:56
- What's wrong: the prompt allows headings, lists and bold. `parseProse` pushes `#`–`######` lines into the current paragraph with no flush, so "## Driving\nFairways hit 62%" renders as one run-on line "Driving Fairways hit 62%". `1.` lists become `<ul>` bullets, so the order is lost. There is no handling for inline code, fenced code, `*italic*` or links, which show their raw `` ` ``, `*` and `[text](url)` characters.
- Should be: ask/04-FIDELITY-SPEC (answer prose: heading, paragraph, ordered/unordered list, bold); instructions.ts:56 contract
- Fix: in `parseProse`, flush the paragraph on a heading and emit a heading block (render as `--ch-type-16-strong`). Emit `ol` for `^\d+\.`. Strip or render inline code and italics. Either render links as plain text with the URL dropped, or tell the model in instructions.ts not to emit them.
- Confidence: high

### ASK-8 Confirm card source line wraps into the 96px label column
- Severity: P1
- Where: confirm card (evidence rows) before a write, phone 390 and desktop, light and dark
- File: src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx:132–133; src/clubhouse/styles/coachhelm-ask-v2.css:94 (`.evd .f` grid `96px minmax(0,1fr)`)
- What's wrong: each row renders three children: `.k`, then `.v` or `.ns`, then `.inf`. The grid has two columns, so `.inf` auto-places onto a new row in the 96px label column and wraps every word or two. `.ns` and `.inf` have no CSS at all (no colour, no type), so "not set" and the source line look like the value.
- Should be: ask/06 confirm card (label | value, source under the value in tertiary 14)
- Fix: wrap `.v`/`.ns` and `.inf` in one `<span>` in the second column, or add `.evd .f .inf { grid-column: 2; font: var(--ch-type-14); color: var(--ch-text-tertiary) }` and `.evd .f .ns { color: var(--ch-text-tertiary) }`.
- Confidence: high

### ASK-9 Capability icons on desktop Ask home fail contrast in dark mode (1.67:1)
- Severity: P1
- Where: Ask home "What I can do" capability list (v1 desktop), desktop, dark
- File: src/clubhouse/styles/coachhelm-ask.css:1277, :1339 (`.ch-ask-cap__ic` background `--ch-green-700`, glyph `--ch-text-on-accent`)
- What's wrong: in dark, `--ch-green-700` resolves to #84c9a0 and `--ch-text-on-accent` to #f4eedd, which is 1.67:1 for the icon glyph (needs 3:1).
- Should be: H8/H9
- Fix: in dark use `--ch-accent` with `--ch-text-on-accent` (the pair the Button primary uses), or keep the light tint and use a dark glyph (`--ch-green-900`).
- Confidence: high (ratio computed)

### ASK-10 Home pulse rows are about 20px tap targets
- Severity: P1
- Where: Ask home v2 "pulse" list, phone 390, light and dark
- File: src/clubhouse/styles/coachhelm-ask-v2.css (`.ch-ak-home .pulse .rw`, near :300); src/clubhouse/screens/coachhelm/chat/Home.tsx
- What's wrong: each row is a button with `padding: 0` and no `min-height`, so its height is the line box, about 20px. Rows stack with small gaps, so taps hit the wrong row.
- Should be: H10 (44px targets)
- Fix: `min-height: 44px; display: flex; align-items: center` on `.rw`, or render them with the shared list-row component from `src/clubhouse/ui/`.
- Confidence: high

### ASK-11 Long URLs and tokens in answer prose overflow the bubble
- Severity: P1
- Where: answer with a long URL, file name or unbroken token, phone 390, light and dark
- File: src/clubhouse/styles/coachhelm-thread.css:224 (`.ch-th-prose`), :235 (`.ch-th-p`)
- What's wrong: there is no `overflow-wrap`/`word-break` on prose or paragraphs, and `.msg-a` has `min-width: 0` but no clip. A 60-character token at 15px is about 420px wide, which pushes past a 326px bubble and gives the page a horizontal scroll.
- Should be: H11
- Fix: `overflow-wrap: anywhere` on `.ch-th-prose` (the composer already does this, quick-chat.css:213).
- Confidence: high

### ASK-12 Phone dock has a 12px side edge and thread padding is fixed at 16
- Severity: P2
- Where: thread and home, phone 390 and 430, light and dark
- File: src/clubhouse/styles/coachhelm-ask.css:924–928 (`.ch-ask-dock` phone `padding: 8px 12px 8px`); src/clubhouse/styles/coachhelm-thread.css:17 (`.ch-th--phone` padding `16px 16px 12px`)
- What's wrong: the composer sits 12px from the screen edge while the thread above it sits at 16, so the two edges don't line up. At ≥414 neither switches to 20 (ask/04 SHARED-7: 16, 20 at 430).
- Should be: H5 (`--ch-page-x-phone`)
- Fix: use `padding-inline: var(--ch-page-x-phone)` on both `.ch-ask-dock` and `.ch-th--phone`.
- Confidence: high

### ASK-13 Safe-area band below the composer and an extra 20px of page scroll on home
- Severity: P2
- Where: home and thread, phone (iOS with home indicator), light and dark
- File: src/clubhouse/styles/shell.css:1217 (`.ch-canvas` phone `padding-bottom: calc(env(safe-area-inset-bottom) + 20px)`), :1414 (notabs); src/clubhouse/styles/coachhelm-ask.css:892, :895
- What's wrong: `.ch-ask` already subtracts the safe area and tab bar from 100dvh, but `.ch-canvas` adds `safe-area + 20px` padding below it. On home the page is 20px taller than the viewport and scrolls. In the thread the safe-area band below the dock shows the canvas colour, not `--ch-phone-composer-bg`, so the composer looks cut off. The dock itself has no `env(safe-area-inset-bottom)`.
- Should be: ACCEPTANCE-SHARED safe area; ask/06 composer
- Fix: give the Ask route a canvas variant with no bottom padding, and add `padding-bottom: calc(8px + env(safe-area-inset-bottom))` to the phone `.ch-ask-dock` (notabs case).
- Confidence: medium

### ASK-14 Error notice uses danger red for a failed answer
- Severity: P2
- Where: thread when a turn fails, phone and desktop, light and dark
- File: src/clubhouse/styles/coachhelm-thread.css:1021–1027 (`.ch-th-error` background `--ch-danger-100`)
- What's wrong: a failed answer gets a red panel. Ask 04 says failures are amber and red is only for under par on hole strips.
- Should be: ask/04-FIDELITY-SPEC rules (amber for failures); H15
- Fix: switch to `--ch-warning-100` / `--ch-warning-700` and the amber icon tone.
- Confidence: high

### ASK-15 No jump-to-latest control, and auto-scroll scrolls the whole page
- Severity: P2
- Where: long thread while streaming, phone and desktop
- File: src/clubhouse/screens/coachhelm/chat/Thread.tsx (`endRef.scrollIntoView({ block: 'end' })`, no jump button)
- What's wrong: `scrollIntoView` scrolls every scrollable ancestor (canvas and window too), which jolts the phone topbar under iOS. When the coach scrolls up to read, there is no "jump to latest" pill when new content arrives.
- Should be: ask/06 thread (jump to latest when scrolled up); 07-MOTION
- Fix: scroll the thread's own `ScrollRegion` (`el.scrollTo({ top: el.scrollHeight })`), only when already near the bottom, and show a jump pill otherwise.
- Confidence: high

### ASK-16 Desktop history rows: text pinned to the top of a 36px row
- Severity: P2
- Where: conversation list panel, desktop 1440, light and dark
- File: src/clubhouse/styles/coachhelm-ask.css:304–314 (`.ch-ask-hist__row`)
- What's wrong: `display: block; height: 36px` with no `line-height`, so the 14px title sits at the top of the row with about 16px of empty space below it. Phone fixes this with `line-height: 44px` (:1194); desktop does not. A 36px row is also under 44.
- Should be: H10; ask/06 history list
- Fix: `display: flex; align-items: center; min-height: 44px` (keep ellipsis on an inner span).
- Confidence: high

### ASK-17 Hand-drawn buttons in the brief/quiz footer and the empty history state
- Severity: P2
- Where: brief/quiz footer, empty conversation list, phone and desktop
- File: src/clubhouse/styles/coachhelm-ask-v2.css:193 (`.qft .p`, plus `.qft .sk`, `.qft .c`); src/clubhouse/styles/coachhelm-ask.css:369 (`.ch-ask-hist__emptynew`, 40px); src/clubhouse/screens/coachhelm/chat/History.tsx
- What's wrong: the buttons are hand-styled, about 36–40px tall, with their own radius and padding, where `src/clubhouse/ui/Button` exists (ConfirmCard and AskError already use it).
- Should be: brief "Components" (use `src/clubhouse/ui/`); H10
- Fix: replace them with `<Button variant="primary|secondary|quiet">`.
- Confidence: high

### ASK-18 "What it knows" panel misuses classes and has a 12px Remove link
- Severity: P2
- Where: Ask settings, "What it knows", phone and desktop
- File: src/clubhouse/screens/coachhelm/chat/parts/KnowsPanel.tsx:72 (reuses `.ch-ask-hist__new` for "Edit what it knows"), :77 (error shown with `.ch-ak-meter is-low`); src/clubhouse/styles/coachhelm-ask-v2.css (`.ch-ak-knows li button`, 12px, no hit area)
- What's wrong: the edit control borrows the history "New chat" style, and errors borrow the usage-meter card. The input has no placeholder and no Save/Cancel. "Remove" is 12px text with no 44px area, next to the item text.
- Should be: H10; H12 (12px is the floor, used here as a tap target); FormSheet/States in `src/clubhouse/ui/`
- Fix: use `Button` (quiet) for edit and remove with a 44px hit area, `States` for the error, and a `FormSheet` field with placeholder, Save and Cancel.
- Confidence: high

### ASK-19 Follow-up pills are 36px, and their ring disappears in dark
- Severity: P2
- Where: suggested follow-ups under an answer, phone and desktop, dark
- File: src/clubhouse/styles/coachhelm-thread.css:989–997 (`.ch-th-pill`, `min-height: 36px`), :1463 (dark ring `--ch-border-control`)
- What's wrong: the pills are 36px tall (H10). The light ring is a raw `rgb(28 25 18 / .12)`; the dark override uses `--ch-border-control`, which is very low contrast on the dark bubble, so the pill reads as plain text.
- Should be: H10; H9 (3:1 for control edges)
- Fix: `min-height: 44px`, and use the shared `Badge`/chip or a `Button` size sm with a 44px `::after`.
- Confidence: medium (the ring ratio was not computed exactly)

### ASK-20 Version arrows are 28px and unstyled in the phone dock
- Severity: P2
- Where: artifact with versions, desktop pane and phone push
- File: src/clubhouse/styles/coachhelm-ask-v2.css:143–145 (`.ch-ak-pane .vers button` 28×28); src/clubhouse/screens/coachhelm/chat/parts/Artifact.tsx (`Versions`)
- What's wrong: the arrows are 28px (H10). The styles are scoped to `.ch-ak-pane`, so in the phone `.apdock` they render as default browser buttons. They show even with a single version, disabled.
- Should be: ask/04 (hide version arrows unless there are 2 or more versions); H10
- Fix: scope to `.vers` in both, 44px hit area, and render `Versions` only when `versions.length > 1`.
- Confidence: high

### ASK-21 Hole strip marks under par by colour only, with cells about 33px wide
- Severity: P2
- Where: hole-strip visual in an answer, phone 390, light and dark, larger Text Size
- File: src/clubhouse/styles/coachhelm-ask-v2.css:169–173 (`.ch-ak-holes`, `.u b { color: var(--ch-flag) }`)
- What's wrong: under-par holes differ only by red text (H13). Nine columns at about 33px with `--ch-type-14-strong` overflow once Text Size is raised (a 3-character "−2" plus padding fits; "10" with a mark does not).
- Should be: H13; H14 (U+2212); ScoreMark in `src/clubhouse/ui/`
- Fix: render each value with `ScoreMark` (circle for under par), and drop to two rows of 9 at XXL or allow horizontal scroll in a `ScrollRegion`.
- Confidence: medium

### ASK-22 Small type below the phone floor in the hole-strip header
- Severity: P2
- Where: hole-strip header, phone
- File: src/clubhouse/styles/coachhelm-ask-v2.css (`.ch-ak-hs .hs-h small`, `--ch-type-11-strong`)
- What's wrong: 11px text on phone.
- Should be: H12 (12px floor)
- Fix: `--ch-type-12-strong`.
- Confidence: high

### ASK-23 Quiz progress dots animate width
- Severity: P2
- Where: brief/quiz, phone and desktop
- File: src/clubhouse/styles/coachhelm-ask-v2.css:179–181 (`.qdots i`, `.cur { width: 24px }`)
- What's wrong: the current dot grows from 16 to 24 by changing `width`, which triggers layout on every step (H2).
- Should be: H2; 07-MOTION (transform and opacity only)
- Fix: keep `width: 24px` and use `transform: scaleX(.667)` on the inactive dots, or overlay a scaled indicator.
- Confidence: medium (depends on whether a transition is declared on `i`)

### ASK-24 Hard-coded colours in the user bubble with no dark override
- Severity: P2
- Where: coach's own message bubble, dark
- File: src/clubhouse/styles/coachhelm-ask-v2.css:71 (gradient end `#0f4a2e`); src/clubhouse/styles/coachhelm-thread.css:66 (`.ch-th-user` color `#f7fbf8`)
- What's wrong: the gradient's bottom stop is fixed at `#0f4a2e`, where the spec's dark value is #173D2A, and the ink is a raw hex. In dark the bubble gets a darker band at the bottom that doesn't match the tokens.
- Should be: brief "Dark mode: hard-coded hex"; ask/04 tokens table
- Fix: use `var(--ch-bubble-mine-fill-2)` (add the token with light and dark values) and `var(--ch-bubble-mine-ink)`.
- Confidence: high

### ASK-25 Live "Working" row shows a chevron that does nothing
- Severity: P2
- Where: streaming answer, phone and desktop
- File: src/clubhouse/screens/coachhelm/chat/parts/Steps.tsx (live branch renders a ChevronDown with no button); src/clubhouse/styles/coachhelm-ask-v2.css:21 (`.work .sum` margin `-12px 0`, also applied to `.is-live`)
- What's wrong: while live, the row shows a chevron that suggests "expand", but it isn't a button (a dead tap). The −12px vertical margin, meant for the 44px collapsed button, also pulls the live row into the bubble padding above and below it.
- Should be: brief "dead taps"; ask/06 working state
- Fix: hide the chevron while live (or make it toggle the step list), and limit the negative margin to `.work .sum:not(.is-live)`.
- Confidence: high

### ASK-26 Home greeting uses the device's clock, not the team's
- Severity: P2
- Where: Ask home greeting, any, first paint
- File: src/clubhouse/screens/coachhelm/chat/Home.tsx (`new Date(data.nowIso).getHours()`)
- What's wrong: `getHours()` uses the server's zone during SSR and the browser's on the client. The greeting ("Good morning"/"Good evening") can differ between the two, which causes a hydration mismatch and a flash, and is wrong for a coach whose team plays in another zone.
- Should be: brief "States"; DECISIONS (team time zone)
- Fix: compute the hour with `Intl.DateTimeFormat(..., { hour: 'numeric', timeZone: team.tz })` on the server and pass the greeting down.
- Confidence: medium

### ASK-27 Confirm card primary capsule hit area is about 42px
- Severity: P2
- Where: confirm card "Add/Send" while busy, phone
- File: src/clubhouse/styles/coachhelm-ask-v2.css:101–103 (`.conf .btns .p`, `.p.cap`)
- What's wrong: the primary is a hand-styled button, 8px padding plus a 15px line, with a `::after` inset of −3px 0, about 42px total. It also uses `overflow: hidden`, which clips the `::after` hit area.
- Should be: H10; ConfirmCard already imports `Button`
- Fix: use `Button` size lg for the primary as well.
- Confidence: medium

### ASK-28 `.ch-ak-mark { all: unset }` removes the focus ring from tappable visuals
- Severity: P2
- Where: hole strip, putt profile, season compare and miss pattern blocks, keyboard and VoiceOver
- File: src/clubhouse/styles/coachhelm-ask-v2.css (`.ch-ak-mark { all: unset }`, about :443); src/clubhouse/screens/coachhelm/chat/visual/blocks.tsx
- What's wrong: these blocks are `<button>`s. `all: unset` strips `:focus-visible` and `cursor`, and no replacement focus style is declared, so keyboard users get no indication of focus.
- Should be: ACCEPTANCE-SHARED focus visible
- Fix: add `.ch-ak-mark:focus-visible { outline: 2px solid var(--ch-focus-ring); outline-offset: 2px }`, as the thread pills already do (coachhelm-thread.css:1012).
- Confidence: medium

## Summary (worst first)
1. The desktop artifact pane mounts outside the body row, so it lands under the chat, and it shows raw JSON in an unstyled `pre` (ASK-1).
2. Ask is not keyboard-aware on iOS Safari 26 (`--keyboard-height` reads 0), so the composer and bar slide under the keyboard (ASK-2).
3. The phone artifact push collides with the top bar: same z, no safe-area top, and two PhoneTops in one slot (ASK-3).
4. Composition visuals are three nested cards, the expand button overlaps the title, and the citation popover is trapped by a `filter` stacking context (ASK-4/5/6).
5. Markdown answers render wrong: headings merge, ordered lists become bullets, code and links show raw. Confirm-card sources wrap into the label column, and the dark capability icons are at 1.67:1 (ASK-7/8/9).
