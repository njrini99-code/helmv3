# Quick chat lane audit (Helm key, quick chat panel, task cards)

Repo `helmv3` main `062f8a2`, read-only. Covers `src/clubhouse/shell/quick-chat/*` (QuickChatProvider/HelmKey, QuickChatSession, TaskCard, task-motion, visuals/visuals.tsx, visuals/PlanTask.tsx), `src/clubhouse/styles/quick-chat.css`, and `src/clubhouse/preview/PreviewQuickChat.tsx`. Specs: `design-refresh/coachhelm/QUICK_CHAT.md`, `02-PLAN.md`, `05-SCREENS.md`, `06-SCREEN-SPECS.md`, `07-MOTION.md`, RUBRIC H1–H19. The real dark theme selector is `html[data-fw-theme='dark']`.

### QC-1 Answers show raw markdown, and charts and evidence are silently dropped
- Severity: P1
- Where: any assistant answer in the quick chat panel, phone and desktop, light and dark
- File: src/clubhouse/shell/quick-chat/QuickChatSession.tsx:410 (`if (b.kind === 'text') return <p className="say">{b.text}</p>`), :414 (`return null` for every other block)
- What's wrong: text blocks go into a single `<p>`, so `**bold**`, `## headings`, `- lists` show their raw characters and newlines collapse into one paragraph. Evidence, visual, composition, standalone receipt and handoff blocks return `null`. An answer whose substance is a chart arrives as a one-line sentence or as nothing, with no "Open in Ask" fallback.
- Should be: coachhelm/05-SCREENS §answer (prose, then the visual); 06-SCREEN-SPECS:305 (coach bubble)
- Fix: render text through the shared `Prose` component (`screens/coachhelm/chat/Prose.tsx`). For blocks the panel can't draw, show a one-line "See the chart in Ask" row that links to the conversation (the `full()` handler already does this).
- Confidence: high

### QC-2 Dark-mode overrides never match, so plan-bar text drops to 1.65–2.92:1
- Severity: P1
- Where: plan task bar, header buttons, tiles, composer, dark
- File: src/clubhouse/styles/quick-chat.css:172 (`.ch-qcs :root[data-theme="dark"] .pseg`), :287 (`.qbtn`), :305 (`.tile i`), :316 (`.cmp`)
- What's wrong: `:root` can never be a descendant of `.ch-qcs`, and the app's attribute is `html[data-fw-theme='dark']`, so none of the four rules ever applies. `.pseg` stays `color: #fff` (:168) on the dark segment colours: white on #4fa877 = 2.92:1, on #7cc79b = 2.00:1, on #9dd6b4 = 1.65:1 (13px strong text needs 4.5). The dark `.qbtn` fill, the tile icon colour and the composer's dark shadow are lost too.
- Should be: H8; brief "Dark mode"
- Fix: rewrite them as `:where(html[data-fw-theme='dark']) .ch-qcs .pseg { color: #0e120f }` (and the same for the other three), or better, add a `--ch-qc-a-seg-ink` token with light and dark values.
- Confidence: high (ratios computed)

### QC-3 Failed, undone and cancelled receipts still show the green success disc
- Severity: P1
- Where: task card after a failed save, an Undo, or a cancel, phone and desktop, light and dark
- File: src/clubhouse/shell/quick-chat/TaskCard.tsx:253, :262 (`<div className="rcpt neutral">`), :271 (`<div className="rcpt fail">`); src/clubhouse/styles/quick-chat.css:193, :195–196 (`.rcpt__g.fail`, `.rcpt__g.neutral`)
- What's wrong: the modifier class sits on the `.rcpt` container, but the CSS targets `.rcpt__g.fail` / `.rcpt__g.neutral` on the disc. Every receipt disc therefore keeps `background: var(--ch-qc-a-accent)`, so "Not saved", "Undone" and "Cancelled" all show the same accent-green disc as a success. The failed receipt also has no Try again or Cancel.
- Should be: coachhelm/05-SCREENS:230 (failed receipt: loss tint, reason, Try again); H13
- Fix: put the modifier on the disc (`<span className="rcpt__g fail">`) or change the selectors to `.rcpt.fail .rcpt__g`. Add `Button` "Try again" (and quiet "Cancel") to the failed receipt.
- Confidence: high

### QC-4 Task header chip is unstyled text
- Severity: P1
- Where: every task card header (Draft / Added / Not saved / Undone / Cancelled), phone and desktop, light and dark
- File: src/clubhouse/shell/quick-chat/TaskCard.tsx:149–150, :159 (`<span className={chipClass}>`, `'chip' + ' ok' | ' fail'`)
- What's wrong: there is no `.ch-qcs .chip` rule anywhere in quick-chat.css (or in the shared CSS under `.ch-qcs`). The state chip renders as bare inline text at inherited size, so "Not saved" reads like part of the title. PlanTask uses `Badge` for the same thing, so the two card types look different.
- Should be: coachhelm/06-SCREEN-SPECS:379 (chip: padding 3 8, radius 7, 13/600, well bg; ok = accent tint; fail = loss tint)
- Fix: use `<Badge tone={ok ? 'positive' : fail ? 'attention' : 'neutral'}>` from `src/clubhouse/ui/Badge`, as PlanTask does.
- Confidence: high

### QC-5 Calendar rail clips long events and overlaps existing blocks
- Severity: P1
- Where: event task visual (add practice/meeting), phone and desktop, light and dark
- File: src/clubhouse/shell/quick-chat/visuals/visuals.tsx:50 (`y = 12 + (h - first) * 32`), :75 (old blocks `height: 24, padding: '4px 10px'`), :84 (new block `height: Math.max(24, (end - start) * 32 - 2)`); src/clubhouse/styles/quick-chat.css:135 (`.rail` `height: 150px; overflow: hidden`), :138 (`.blk` left 62, right 10)
- What's wrong: the rail is a fixed 150px, which is room for about 4.3 hours at 32px per hour. The new block's height isn't clamped, so a 4-hour practice (126px plus 1h of lead) is cut off at the bottom. Old blocks are 24px tall, but their content (4+4 padding plus 14px strong title plus 13px line) is about 40px, and it's clipped with no ellipsis. All blocks share left 62 / right 10 with no collision layout, so an existing event that overlaps the new one is drawn on top of it.
- Should be: brief pattern "data-derived sizes without clamp"; H11; coachhelm/06 event visual
- Fix: size the rail from the hour span (`height = 24 + hours * 32`, capped at 220 with the window centred on the new block). Clamp block heights to the rail. Give old blocks `min-height: 32px`, show the title only with `text-overflow: ellipsis; white-space: nowrap`, and split overlapping blocks into columns (left/right halves).
- Confidence: high

### QC-6 Composer placeholder is 2.33:1 in Safari
- Severity: P1
- Where: composer empty, phone and desktop, light
- File: src/clubhouse/styles/quick-chat.css:213–214 (`.cmp__t`, `.cmp__t.ph` defined but unused), :320
- What's wrong: there is no `::placeholder` rule, so WebKit's default (#a9a9a9) applies: 2.33:1 on the #fffefb composer tile. `.cmp__t.ph` (tertiary ink) is never applied to the textarea.
- Should be: H8
- Fix: `.ch-qcs .cmp__t::placeholder { color: var(--ch-qc-a-ink-3); opacity: 1 }`, and delete the unused `.ph` rule.
- Confidence: high (ratio computed)

### QC-7 Stream errors have no Try again, and failed steps get a green check
- Severity: P1
- Where: answer that fails mid-run, phone and desktop, light and dark
- File: src/clubhouse/shell/quick-chat/QuickChatSession.tsx:296 (`{notice && <p className="say quiet">…}`), :349–401 (`Steps`); src/clubhouse/styles/quick-chat.css:88 (`.step.fail` defined, never used)
- What's wrong: a dropped connection shows a single grey line with no action. `Steps` never emits `fail`, so the step that broke still shows the green done check, which reads as success.
- Should be: coachhelm/05-SCREENS:146 ("Lost the connection. Nothing was saved." plus Try again, the failing step amber); 05:166
- Fix: render the notice with the shared `States` error row (message plus `Button` "Try again" that resends the last message). Mark the last active step `fail` when `notice` is set.
- Confidence: high

### QC-8 Composer doesn't grow past one line
- Severity: P1
- Where: typing a multi-line question, phone and desktop
- File: src/clubhouse/shell/quick-chat/QuickChatSession.tsx:304–318 (`<textarea rows={1}>`, no auto-size)
- What's wrong: the textarea is fixed at one row, so a second line scrolls inside a 34px box and the coach can't see what they wrote.
- Should be: coachhelm/06-SCREEN-SPECS:285 (grows to 4 lines, then scrolls)
- Fix: auto-size on input (`el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 4 * lineHeight) + 'px'`), or reuse the Ask composer's autosize hook.
- Confidence: high

### QC-9 iOS keyboard pan pushes the phone panel's header off-screen
- Severity: P1
- Where: panel open with the keyboard up, phone (iOS Safari)
- File: src/clubhouse/shell/quick-chat/QuickChatSession.tsx:72–73 (`kb = vv.height + vv.offsetTop`; height `min(700, kb - bar - 14)`), :95–97 (`vv.addEventListener('resize', place)` only)
- What's wrong: the panel is `position: fixed` with `top: var(--ch-qc-qc-top, 104px)` (quick-chat.css:339). When iOS pans the visual viewport (`offsetTop > 0`, typical when focusing the textarea), the layout-viewport `top: 104px` moves up with the page, and only `resize` is listened to, not `scroll`. The header (close and expand) can end up above the visible area until the keyboard closes.
- Should be: coachhelm/02-PLAN:57 (`min(700px, keyboardTop − 104 − 8)` from visualViewport); ACCEPTANCE-SHARED composer above keyboard
- Fix: also listen to `visualViewport` `scroll`, and set `top` to `vv.offsetTop + bar` and the height to `vv.height - bar - 14`.
- Confidence: medium (from code; not reproduced on a device)

### QC-10 "Open full chat" button looks live but does nothing before the first send
- Severity: P2
- Where: panel header, new chat with no message yet, phone and desktop
- File: src/clubhouse/shell/quick-chat/QuickChatSession.tsx:224 (`disabled={!chat.conversationId}`); src/clubhouse/styles/quick-chat.css (`.qbtn` has no `:disabled` rule)
- What's wrong: the button is disabled but styled the same as enabled, so a tap does nothing (dead tap).
- Should be: brief "dead taps"
- Fix: `.ch-qcs .qbtn:disabled { opacity: .4; cursor: default }`, or open an empty Ask chat instead of disabling.
- Confidence: high

### QC-11 Live pill has no failed state and sits 2px off centre
- Severity: P2
- Where: Helm key live pill while a run is out, phone and desktop
- File: src/clubhouse/shell/quick-chat/QuickChatProvider.tsx:125–135 (icons for `work`, `wait`, `done` only; inline `maxWidth: phone ? 172 : 260`); src/clubhouse/styles/quick-chat.css:37, :374 (`.live` height 36, `margin-top: -16px`)
- What's wrong: `run.state === 'failed'` renders an empty icon slot, so a failed run looks like idle text. `margin-top: -16px` on a 36px box centres it 2px low. The inline max-width bypasses the CSS and truncates without a token.
- Should be: coachhelm/05-SCREENS:94 (failed: amber dot); H13
- Fix: add a `failed` branch with the amber dot (`--ch-warning-500`), use `margin-top: -18px` (or `translateY(-50%)`), and move max-width into CSS.
- Confidence: high

### QC-12 "Earlier today" row pops in and pushes the thread down
- Severity: P2
- Where: reopening the panel after a task earlier today, phone and desktop
- File: src/clubhouse/shell/quick-chat/QuickChatSession.tsx:252–266 (`{earlier && (<div className="earlier">…)}`)
- What's wrong: the row mounts after its data arrives with no reserved space, so everything below it jumps by about 64px.
- Should be: coachhelm/05-SCREENS:109 (no layout jump)
- Fix: reserve the row's height while loading (a skeleton from `src/clubhouse/ui/States`), or fade it in with transform only.
- Confidence: medium

### QC-13 Long words overflow message bubbles
- Severity: P2
- Where: user bubble, message-draft visual, answers, phone 390
- File: src/clubhouse/styles/quick-chat.css:73 (`.ub`), :74 (`.say`), :148 (`.mb`)
- What's wrong: there is no `overflow-wrap` on any of them (the composer has `overflow-wrap: anywhere`, :213). A pasted URL or long token runs past the 84%/88% bubble and the panel edge.
- Should be: H11
- Fix: add `overflow-wrap: anywhere` to `.ub`, `.say` and `.mb`.
- Confidence: high

### QC-14 Plan bar segment labels are cut mid-letter
- Severity: P2
- Where: plan task visual with short blocks, phone 390
- File: src/clubhouse/shell/quick-chat/visuals/PlanTask.tsx:115 (`style={{ flex: b.len }}`); src/clubhouse/styles/quick-chat.css:168 (`.pseg` `white-space: nowrap; overflow: hidden`)
- What's wrong: a segment's width is proportional to its length, and its label clips with no ellipsis, so a 10-minute "Putting" block at about 30px shows "Pu" cut through a letter.
- Should be: H11; brief "nowrap without ellipsis"
- Fix: `text-overflow: ellipsis` on an inner span, and hide the label below about 40px (show it in the legend under the bar).
- Confidence: high

### QC-15 Panel corner radius is 20 where the spec says 32 on phone and 26 on desktop
- Severity: P2
- Where: panel, phone and desktop
- File: src/clubhouse/styles/quick-chat.css:327, :329, :339, :340 (`border-radius: var(--ch-radius-xl)`)
- What's wrong: the panel uses 20px on both, so it reads like an ordinary card rather than the sheet in the design. The inner `.qc__body` (:332) also uses `--ch-radius-xl` with a 6px margin, so the inner and outer radii are equal (H17 wants outer minus inset).
- Should be: coachhelm/06-SCREEN-SPECS:225 (panel radius 32 phone, 26 desktop); H17
- Fix: use the sheet radius token (or add `--ch-radius-sheet`), and set `.qc__body` to `calc(var(--ch-radius-sheet) - 6px)`.
- Confidence: high

### QC-16 Desktop panel is a fixed 640px, taller than short windows
- Severity: P2
- Where: panel, desktop with a window under about 720px tall (laptop with dock)
- File: src/clubhouse/styles/quick-chat.css:340 (`top: 62px; height: 640px; max-height: none`)
- What's wrong: at a 680px-tall window the panel's bottom (composer) is 22px below the viewport and can't be reached.
- Should be: H11
- Fix: `height: min(640px, calc(100dvh - 62px - 16px))`.
- Confidence: high

### QC-17 Tone chips stay visible at 40% after a message is sent
- Severity: P2
- Where: message task after Send, phone and desktop
- File: src/clubhouse/shell/quick-chat/task-motion.ts:82 (`tones.animate([{ opacity: 1 }, { opacity: 0.4 }], …)`)
- What's wrong: the tone choices fade only to 0.4 and stay interactive, so they still look tappable after the message has gone.
- Should be: coachhelm/06-SCREEN-SPECS T5 (fade to 0 and inert)
- Fix: animate to opacity 0, then set `inert` (or `hidden`) on `.mtone`.
- Confidence: high

### QC-18 Cancelled task card has no visual change
- Severity: P2
- Where: task card after Cancel, phone and desktop
- File: src/clubhouse/shell/quick-chat/TaskCard.tsx:152 (adds `' cancelled'`); src/clubhouse/styles/quick-chat.css (no `.task.cancelled` rule; `.task.dimmed` exists at :207–208)
- What's wrong: the class is applied but unstyled, so the cancelled card's visual looks as live as a draft.
- Should be: coachhelm/05-SCREENS:247 (cancelled: dimmed visual)
- Fix: apply the existing `.dimmed` treatment for `.cancelled` too.
- Confidence: high

### QC-19 No scroll lock behind the phone scrim
- Severity: P2
- Where: panel open, phone
- File: src/clubhouse/shell/quick-chat/QuickChatSession.tsx:210 (`<div className="scrim" … onClick={onClose}>`); no body or canvas scroll lock in the file
- What's wrong: dragging outside the panel, or overscrolling the panel's thread, scrolls the page underneath (iOS scroll chaining), so the header moves behind the scrim.
- Should be: Modal/FormSheet behaviour in `src/clubhouse/ui/`
- Fix: reuse the Modal/FormSheet scroll lock, or `overscroll-behavior: contain` on `.qc__body` plus `touch-action: none` on `.scrim`.
- Confidence: medium

### QC-20 Escape is ignored while typing
- Severity: P2
- Where: panel, desktop keyboard
- File: src/clubhouse/shell/quick-chat/QuickChatSession.tsx:101–111 (Escape closes unless the target is an INPUT)
- What's wrong: the composer is a TEXTAREA, so the check doesn't block it, but the spec wants a first Escape to clear or blur and a second to close. As written, one Escape while typing discards a half-written question.
- Should be: coachhelm/06 keyboard (Esc blurs the composer, then closes)
- Fix: if the target is the textarea with text, blur it first; close on the next Escape.
- Confidence: medium

### QC-21 Reduce Transparency setting in the app is ignored
- Severity: P2
- Where: panel with the in-app Reduce Transparency setting on
- File: src/clubhouse/styles/quick-chat.css:345 (only `@media (prefers-reduced-transparency: reduce)`)
- What's wrong: the app's own setting (`data-reduce-transparency` on root) doesn't turn off the panel's backdrop blur. Only the OS media query does, and Safari doesn't support that query yet, so iOS users never get the solid panel.
- Should be: ACCEPTANCE-SHARED accessibility settings
- Fix: add `:where(html[data-reduce-transparency]) .ch-qcs .qc { background: var(--ch-qc-a-card); backdrop-filter: none }`.
- Confidence: medium

### QC-22 Year coins use 11px type
- Severity: P2
- Where: roster visual coins (SR/JR/SO/FR, "+3"), phone
- File: src/clubhouse/styles/quick-chat.css:117, :123 (`.coin` `--ch-type-11-strong`, `.coin.more` `--ch-type-11`)
- What's wrong: 11px text on phone.
- Should be: H12; use `Avatar` from `src/clubhouse/ui/` for coins
- Fix: `--ch-type-12-strong`, or the shared Avatar size xs.
- Confidence: high

### QC-23 Preview has no error or failed-task fixture
- Severity: P2
- Where: `/clubhouse-preview/*?qc=<state>`
- File: src/clubhouse/preview/PreviewQuickChat.tsx:17 (`error: undefined`), :35 (`QC_FIXTURES`)
- What's wrong: no fixture covers a stream error, a failed step or a failed receipt, so QC-3 and QC-7 never show up in captures.
- Should be: brief "States: loading, empty, error, partial"
- Fix: add `qc=error`, `qc=task-failed` and `qc=task-cancelled` fixtures.
- Confidence: high

## Summary (worst first)
1. Answers in the panel are raw text in a single `<p>`: markdown shows its characters, and every chart, evidence or composition block is silently dropped (QC-1).
2. All four dark-mode overrides use a selector that can never match, so plan-bar labels fall to 1.65–2.92:1 and the header and composer lose their dark styling (QC-2).
3. Failed, undone and cancelled receipts show the same green success disc (the class is on the wrong element), and the header state chip has no CSS at all (QC-3/4).
4. The event rail clips long events and overlaps existing blocks; old blocks are 24px tall around about 40px of content (QC-5).
5. Errors give no Try again and mark the failed step green; the placeholder is 2.33:1; the composer doesn't grow; the iOS keyboard pan can push the header off-screen (QC-6/7/8/9).
