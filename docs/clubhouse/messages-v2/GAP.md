# Messages v2 gap analysis: today's code vs SPEC.md and MOTION.md

Method: five read-only surveys (one per slice) compared every SPEC.md item
(MSG-nnn) and MOTION.md item (MOT-*) with the code at branch
`agent/ch-messages-v2` (from `agent/ch-consolidate`, 2026-11-07), grepping exact
copy and numbers and reading the code. Line numbers were verified by the
surveyors with `grep -n`; cascade and layout claims were checked by reading CSS,
not in a browser. Short forms in the tables: `MV` =
`src/clubhouse/screens/messages/MessagesView.tsx`, `MP` = `MessagesPhone.tsx`,
`M` = `Messages.tsx`, `CSS` = `src/clubhouse/styles/messages.css` (5,958 lines),
`UGM` = `src/hooks/golf/use-golf-messages.ts`.

Verdicts: DONE (matches values, copy and behaviour), PARTIAL (exists but
differs; the cell lists spec vs code), MISSING (no implementation), CONFLICTS
(code does something the new spec forbids; delete or flip it, do not extend it).

## Totals (unique items)

| Kind | Items | Verdicts |
| --- | --- | --- |
| MSG | 108 | DONE 19, PARTIAL 68, MISSING 4, CONFLICTS 17 |
| MOT | 81 | DONE 27, PARTIAL 44, MISSING 9, CONFLICTS 1 |
| All | 189 | DONE 46, PARTIAL 112, MISSING 13, CONFLICTS 18 |

Rows that two surveys covered are counted once: MSG-220 and MSG-221 under Part D
(D owns photo and file bubbles whole), MSG-224 under Part C, MOT-KB-1 under Part
B. The other slice's row is kept below and marked "(see other slice)". Part G
also holds a 27-row token table that is not counted. Per slice (rows): A: DONE
7, PARTIAL 20, MISSING 0, CONFLICTS 8; B: DONE 9, PARTIAL 35, MISSING 10,
CONFLICTS 4; C: DONE 8, PARTIAL 24, MISSING 0, CONFLICTS 2; D: DONE 9, PARTIAL
25, MISSING 1, CONFLICTS 3; G: DONE 13, PARTIAL 8, MISSING 2, CONFLICTS 1.

## What changes the plan (read these first)

1. The thread is three flex rows (bar, scroller, composer), not layers (Part B
   risk 1). The spec's content-under-glass, `--pad-top`/`--pad-bot`, keyboard
   ride and floating pills all need the scroller to become the page with the bar
   and composer as overlays. One owner, once, before motion work.
2. `Bubble` (MV:1110-1534, 425 lines) mixes B (row, tail, receipt, time), C
   (hold, lift, hover bar, reactions, double-tap) and D (poll, attachments).
   `Thread` (MV) and `PhoneThread` (MP) duplicate the scroller, day rows, typing
   row, jump key and composer mount. `Messages.tsx` builds the whole `api` in
   one literal. These are the merge hazards; PLAN.md schedules a seam wave
   first.
3. The lint and ratchet gates bite (Part G risks 1-3): literal `duration: N`
   outside {0, .11, .18, .26, .28, .52} and literal `Nms` / `cubic-bezier(` in
   CSS outside tokens.css fail `clubhouse:check`; animating
   `grid-template-columns` (MOT-DET-2) fails `clubhouse/no-layout-motion` and
   contradicts the Nov 7 shell-motion rule; CSS ratchets on `messages.css` run
   in both directions; adding `launch` fails `motion-physics.test.tsx` until it
   is named there.
4. Pins: no server action exists; the hook calls Supabase from the browser
   against `golf_conversation_pins`, which is not in production, so pins are
   per-device there today. The team channel does not count toward the 3-pin
   limit in code but does in the HTML (Part A risks 1-2).
5. Sends are serialized (`!sending` gate, MV:1863) so MC-01 (two sends 140 ms
   apart) is impossible today; there is no `launch` spring, no clone flight, and
   desktop has no send animation (Part B).
6. Desktop 3-pane applies only at canvas >= 1101 px; at the 1280 viewport the
   design draws, the canvas is about 1032 px, so the legacy floating details
   panel renders (Part D risk 4).
7. Hold on a poll or a file-only message opens nothing; bubbles have no
   `tabindex` (Part C risks 1-2).
8. Mute: two toasts per mute, no inbox-glyph refresh after a Details mute,
   expiry only applied at read time (Part D risk 7).
9. Security: DATA.md section 3 lists three RLS/grant holes and an email leak
   found while auditing; they are not Messages UI work, but the redesign adds
   surface on top of them.

---

## Part A. Slice A: inbox, pins, search, rail

Surveyed 2026-11-07 in `ch-messages-v2` (branch `agent/ch-messages-v2`),
read-only. Items: SPEC MSG-004..007 (Messages part only), MSG-101..116,
MSG-121..126; MOTION MOT-LIST-1..5, MOT-X-2, X-8, X-15, X-17. Where SPEC.md and
the HTML differ, the HTML
(`design-refresh/messages/redesign/clubhouse-messages.html`, Part 2 CSS from
line 613) was used and is said so. Line numbers were re-checked with `grep -n`
against this checkout.

Short names: `MP` = `src/clubhouse/screens/messages/MessagesPhone.tsx`, `MV` =
`.../MessagesView.tsx`, `M` = `.../Messages.tsx`, `CSS` =
`src/clubhouse/styles/messages.css`, `CTRL` =
`src/clubhouse/styles/controls.css`, `UI` = `src/clubhouse/ui`, `SH` =
`src/clubhouse/shell`.

Counts: 35 items. DONE 7, PARTIAL 20, CONFLICTS 8 (MSG-102, 106, 108, 109, 112,
113, 124, MOT-X-17), MISSING 0. A CONFLICTS cell starts with what to delete or
replace; build the rest after that.

### Verdicts

| ID | Verdict | Today (file:line) | Delta to build |
| --- | --- | --- | --- |
| MSG-004 | PARTIAL | `--ch-page-x-phone` is 16 and becomes 20 at min-width 414 (`tokens.css:469`, `:1503`). Inbox top `padding: 8px var(--ch-page-x-phone) 12px` (`CSS:4205`); card `margin: 0 var(--ch-page-x-phone) 12px` (`CSS:4241`). | The token is right. BUT the page wrapper also pads: `.ch-msp-page { padding: 26px var(--ch-page-x-phone) 32px }` (`CSS:1632-1637`) is on the same `div` as `.ch-msv-inbox` (`MP:266`), so by static reading the search/segmented and the cards sit inset twice (32 px at 390, 40 at 430) instead of 16/20. Not measured in a browser: check in Safari first. Fix: `.ch-msv-inbox` padding-inline 0 (and keep the landscape safe-area rule `CSS:5946` working). Thread/composer/attach/jump edges are other slices. |
| MSG-005 | PARTIAL | Inbox starts `26px` (page, `CSS:1636`) + `8px` (`.ch-msv-top`, `CSS:4205`) under the shell bar; bottom padding `32px`. Safe areas come from the shell (`env(safe-area-inset-*)`), correct in principle. | Spec: root bar min-height 104 and scroll top 128 (shot 74 vs bar 50), so 24 px from bar to search and bottom 40. Code is 34 top (26+8) and 32 bottom. Set top 24 / bottom 40 once the double inset above is fixed. Other shot-mode numbers (thread, datepill, details, newmsg, composer, attach, jump, toast) are other slices. |
| MSG-006 | DONE | `<PhoneTop title="Messages" start action={undefined} />` (`MP:169-182`) renders into the unchanged shell bar (`SH/phone-chrome.tsx:360-376`; `start` makes the title the section switcher, bell stays because there is no action). | none (Messages part). Bar colours are shell tokens, not verified here. |
| MSG-007 | DONE | Messages fills the canvas: `.ch-ms { height: calc(100dvh - 16px - var(--ch-topbar-h)) }` (`CSS:3-9`); desktop mount `MessagesDesktop` (`MV:3257-3389`). | none (Messages part). Note for MSG-121: the sidebar is `--ch-sidebar-w: 240px` (`tokens.css:480`), spec says 232; the canvas is therefore 8 px narrower than the artifact's. |
| MSG-101 | DONE | Same as MSG-006: title "Messages" (`MP:171`), bell kept (the "New message" key is in the body, `MP:272-274`). | none for the Messages part. Bar min-height 104, switcher 17k/600, bell badge 20 x 20 are shell values and not re-verified. |
| MSG-102 | CONFLICTS | Context line is rendered: `const context = ... "{n} unread · {teamName}"` or "Loading conversations" (`MP:258`), `<p className="ch-msv-ctx ch-num">{context}</p>` (`MP:269`), styled `CSS:4207-4211`. No large title (correct). `.ch-msv-top` gap 12 (`CSS:4204`). | DELETE FIRST: the context line (`context`, its `<p>`, `.ch-msv-ctx`). Then: DELETE the context line, `context`, `unread`'s use for it, and `.ch-msv-ctx`. Spec: `.inbox__top` padding 0 16, gap 10, margin-bottom 4 (code gap 12, padding 8 16 12). "Loading conversations" text is desktop only (MSG-112). Top bar has no hairline: already true (shell). Spacing below the segmented control: `.ch-msp-home { gap: 32px }` (`CSS:1657`) sits between `.ch-msv-top` and the list, so the segmented control to the first card is 12 (top padding-bottom) + 32 = 44 px vs spec 14 + 4 = 18 (segmented `margin 12 0 14`, `.inbox__top` margin-bottom 4); set the gap to 0 for the Messages inbox. |
| MSG-103 | PARTIAL | Row `.ch-msv-srow` gap 8 (`CSS:4212-4216`). Search is the shared `SearchField` (`MP:270`, `UI/SearchField.tsx:17-63`): placeholder "Search", aria "Search conversations and messages", `.ch-search` height 36, padding 0 8 0 12, bg `--ch-ivory-25`, 1 px ring + inset (`CTRL:161-173`), icon 14 (`SearchField.tsx:27`), input 16px on phone (`CTRL:625-629`). New key `.ch-msv-new` 40 x 40 circle, card bg, `--ch-messages-x2`, icon 19, `--ch-green-600`, aria "New message", 44 target by `::before` (`CSS:4221-4239`, `MP:272-274`). | Key is DONE (dark ink is `#6bbb8c` vs accent-text `#7CC79B`). Well differs: height 36 vs 40, bg ivory-25 vs page-2 (`--ch-well-bg-flat` `#F6F4EE`/`#141815`), drop the 1 px ring (spec: inset well shadow only), icon 14 vs 17, padding 0 8 0 12 vs 0 11, label colour placeholder token vs ink-2 at 16k. Scope as a Messages variant (`.ch-msv-search`) because `SearchField` is shared app-wide. |
| MSG-104 | PARTIAL | Phone: `<Segmented redraws block label="Filter conversations">` with no `size` (so md) (`MP:276-291`); rail: `size="sm"` (`MV:676`). Well and thumb colours already equal the artifact's (`tokens.css:852`, `:780`, `:1277`; `CTRL:4-12`, `:101-107`). Options "All/Unread/Groups" correct. Semantics: `role=radiogroup`/`radio aria-checked` (`UI/Segmented.tsx:85-108`). | Sizes: button height 30 (md) / 26 (sm) on desktop and 36 / 34 on phone (`CTRL:22-25`, `:56-61`, `:585-591`) vs spec `30 * k` everywhere; padding 0 16 (md) / 0 12 (sm) vs 0 12; font 13/500 ok but not scaled with k beyond `--ch-type-k`. Dark thumb is `#23704a > #1d613f` vs spec `#2A7D53 > #1F6B45`. Margin 12 0 14 not applied (parent gap 12). Thumb motion: see MOT-LIST-4. `aria-pressed` buttons are an HTML artefact: keep the radiogroup (tests use `getByRole('radio')`, `messages.test.tsx:1250`). Sizing must be a Messages-scoped variant, `Segmented` is shared. |
| MSG-105 | PARTIAL | `PhoneInboxV2` Pinned card (`MP:311-337`): `<section className="ch-msv-card" aria-label="Pinned">`, `<h2 className="ch-msv-card__h">Pinned</h2>`, 3-col grid gap 6 (`CSS:4273-4278`). Items: `pinnedThreads(convs, pins.ids)` = team channel first, then own pins, `slice(0,3)` (`model.ts:378-382`, used `MP:259`). Label `c.channel ? "Team" : c.group ? c.title : firstName(c.title)` (`MP:330`), 13/500 ink ellipsis (`CSS:4299-4305`). | Visible only when `filter === "all" && !q.trim()` (`MP:311`); spec/HTML draw it under every filter and search. Header padding 12/16/8 (`CSS:4254`) vs 14/16/10. `.ch-msv-pins` padding 6 8 8 vs 6 8 10. `.ch-msv-pin` padding 8 4 8, gap 6, radius 16 (`CSS:4279-4291`) vs 10 4 9, gap 7, radius 18. DM face `Avatar size="xl"` = 64 (`UI/Avatar.tsx:17`) vs 62 (group coin is 62 + icon 31, `CSS:4295-4298`, `MP:326`); coin initials 22 vs 0.38 x 62. Group coin is flat `--ch-green-fill-700` (`CSS:304-309`) vs gradient `linear-gradient(160deg,#1F6B45,#0B3A25)`. Pressed wash is accent 10% (`CSS:4292`) vs ink 5% (`--a-wash`). Group label: spec says "Team" for the channel only, code shows other groups' titles (fine, undrawn). A pin tile has NO long-press/context menu, so on a phone a pinned DM can never be unpinned once MSG-107 removes it from Recent (see Risks). Pin accounting: see Risks. |
| MSG-106 | CONFLICTS | Bubblet `<span className="ch-msv-bubblet">` inside the pin (`MP:320-324`); typing swaps in `<TypingMini/>`. CSS `CSS:4306-4322`: abs, top 0, left 50%, `translateX(-12%)`, max-width 92, padding 4 8, radius 12, card bg, `--ch-shadow-float`, 12/500 secondary; third pin `right:0; left:auto; transform:none` (`CSS:4324-4328`). Text is `said = !c.group && lastSenderId !== viewer ? c.lastText : null` (`MP:318`). | REMOVE/SCOPE FIRST: the `@media (max-width: 400px)` rule (`CSS:5937-5941`, MOB-MSG-9) that centres every bubblet at the default 390 pt width. Then: top 0 vs 2; radius 12 vs 11; shadow `--ch-shadow-float` vs `--ch-messages-x2` + `0 4px 10px -4px rgb(28 25 18/.18)`; third pin `right:0` vs `-2px`. `@media (max-width: 400px)` (`CSS:5937-5941`, MOB-MSG-9) centres EVERY bubblet (`left:50%`, `translateX(-50%)`, max-width `calc(100% - 4px)`), which is the default 390 pt phone, so the drawn offset/anchoring never shows: reconcile (spec wins at 390; keep a narrow-screen guard below ~360). `said` excludes groups, but the HTML shows the team channel's latest line ("Asking the real…", no sender prefix): include groups when the last sender is not the viewer. Typing dots exist (gap 2 vs 3, see MSG-110). Nothing shown when no latest line: ok. |
| MSG-107 | PARTIAL | Recent card `MP:338-347`: `aria-label={recentTitle}`, header "Recent"/"Unread"/"Groups" + `<small class="ch-num">{recent.length}</small>` (`MP:264`, `:340`); rows `<ListPresence arrive="inbox" cut={changedScope}>` of `ConvRow avatarSize={44} phone`. | Pins are removed from Recent only when `filter==="all" && !q.trim()` (`MP:263`); spec: the phone list ALWAYS filters out pinned ones (HTML `inboxPage` `!CONVS[id].pin`, line 1653) and the Pinned card is always drawn. Count is 15k secondary: ok (`CSS:4268-4272`). |
| MSG-108 | CONFLICTS | `RailEmpty` (`RailEmpty.tsx:11-40`): Unread -> "Nothing unread" + "You’re caught up." + button "Show all"; Groups -> "No group conversations yet"; search -> "No conversation names match" + "Clear search". Rendered as a bare compact `EmptyState` after the cards (`MP:349`, `MV:727`). | REPLACE FIRST: `RailEmpty`'s copy and its bare `EmptyState` placement. Spec/HTML: inside the Recent card, header "Nothing here" and body (padding 10 16 14, 15k ink-2) `No unread conversations right now.` / `No groups right now.` (HTML line 1663). Replace copy and structure on the phone; the desk rail should use the same copy (HTML draws only the phone card; default: same words as a flat note). The search case becomes MSG-115's "No results for {query}". `messages.test.tsx:1246-1252` pins "No group conversations yet" (wave 5 #12 "never caught up"): the HTML wins, update the test. |
| MSG-109 | CONFLICTS | `ConvRow` (`MV:360-433`) -> `ConvRowButton` (`MV:528-607`). Grid `44px 1fr`, gap 12 (`CSS:272-276`); name 16/600 -.01em (`CSS:4131-4135`); time 13 tertiary tabular (`CSS:4136-4139`, `MV:551-553`); preview `.ch-ms-row__prev` 15 (`CSS:4140-4143`), 2-line clamp on phone (`CSS:1900-1907`); sender prefix `<em>You:/First:</em>` (`MV:567-578`); muted `BellOff 13` after the name (`MV:550`); unread dot `<i class="ch-msv-dot">` before the name (`MV:548`, `CSS:5067-5075`); sr-only "n unread/Marked unread" (`MV:592-594`); wash on press/selected 5% ink (`CSS:4110-4126`). | DELETE FIRST: unread name `font-weight:700` and the green 600 unread time (`CSS:236-241`, `:330-332`), the always-primary preview colour (`CSS:4140-4143`), the `!important` 44 px avatar (`CSS:301-303`), the x=68 top-seam model (`CSS:1813-1820`, `:1845-1853`). Then build the rest: (1) REMOVE unread styling that the spec does not have: name goes `font-weight:700` on `.is-unread` (`CSS:236-238`, `:330-332`) and the time goes green+600 (`CSS:239-242`); spec: name 600, time 13/400 ink-3 always. (2) Preview colour is ALWAYS `--ch-text-primary` (`CSS:4140-4143`); spec: ink-2 (`--ch-text-secondary`) when read, ink when unread. (3) Dot 8 x 8 `--ch-green-600` (dark `#6bbb8c`) vs 9 px `--a-unread` (`#155A39`/`#7CC79B`), margin 0 6 1 -1 (code `margin-block-start:6; margin-inline-end:-2`). (4) Face: `.ch-ms-row .ch-avatar { --ch-av-size: 44px !important }` (`CSS:301-303`) forces 44 on desktop too (spec desk 40); initials 14 (nearest step) vs 0.38 x 44; group coin flat green not gradient, icon 15 (`MV:541`) / 18 via CSS (`CSS:1886-1889`) vs 22 (50%). (5) Padding 12 / min-height 72 (`CSS:1787-1795`) + inline 16 (`CSS:5076-5078`) vs 10 16. (6) Hairline: top seam from x=68 to right-12 using `::before` (`CSS:1813-1820`, `:1845-1853`) vs 0.5 px from x=16 to the right edge, none under the last row. (7) Muted bell margin: flex gap 8 vs margin-left 4. (8) Press wash on `[data-ch-pressed]`: ok. Name line wrap is MSG-113. |
| MSG-110 | PARTIAL | `TypingMini` (`MV:512-520`): three `<i>` 5 px, `role="img" aria-label="Typing"`; keyframes 0/60/100% `translateY(0)` opacity .4, 28% `-3px` opacity 1 (`CSS:4166-4175`), 1200 ms, step 160 ms (`tokens.css:932-933`, `CSS:4153-4165`). Data: `useTypingByConversation` expires each typer 5 s after their last event (`use-typing-by-conversation.ts:6`, `:51`). One typer -> dots, 2+ -> text (`MV:560-566`, `typersLine` `MV:523-526`). | Two or more typers render "Maya and Owen are typing" / "Several people are typing" as text; QUESTIONS Q-12 default = dots only with an aria-label naming the typers. One typer: aria-label "Typing" vs "{Name} is typing" (HTML `aria-label="${first} is typing"`). Dot gap 2 (`CSS:4146-4152`) vs 3. Easing `--ch-ease-typing` `cubic-bezier(.45,0,.55,1)` (`tokens.css:935`) vs CSS `ease` (SETTLED ruling 26). Reduce Motion holds opacity 1 (`CSS:4186-4196`): ok. Hook joins the realtime channel of up to 30 listed conversations and skips the open one. |
| MSG-111 | PARTIAL | `rowItems` (`MV:378-392`): "Open conversation", "Pin"/"Unpin" (with `caption: "Pin up to 3"`, `disabled: atLimit` at `MV:385`), "Mark as unread"/"Mark as read", "Mute…" (opens `RowMuteModal`, a `Modal`, `MV:439-502`), separator, "Delete conversation" (danger, only when `api.deleteConversation`). `useContextMenu({label: "Actions for {title}", touchHold: phone, anchored: true})` (`MV:393-399`). Trigger: right-click / Shift+F10 on desktop, 500 ms hold on phone (`UI/ContextMenu.tsx:20`, `:123-139`), plus a focusable "Actions for" button and swipes (`MV:416-429`). | Items, order, copy and aria-label already match. Differences: width 232 (`ContextMenu.tsx:12`) vs 236; surface is the solid `.ch-popover` `#faf8f2` (`ui.css:622-627`) vs glass-strong 90% (MSG-402 is slice C); opening motion `CH_POP` `translateY(-4px) scale(.97)` + `chTween('quick')` 180 ms (`lib/motion.ts:165-170`, `ContextMenu.tsx:298-301`) vs `scale .8 > 1` on `lift`, exit 160 ms fade (MOT-X-8); position: desktop opens at the pointer, phone at `row.left + 16, row.bottom + 4` (`ContextMenu.tsx:137`), flips up when `h > below && above > below` with EDGE 8 (`:251`) vs spec "anchored to the row, 8 px below it, up if it would pass the bottom 40 and there is room (> 60)". Dimmed Pin uses native `disabled` (`MV:385`, `Menu.tsx:257`), so it is skipped by arrow keys and not announced as a menu item; spec: `aria-disabled`, `is-off`, ink-3. The dimming rule `.ch-menu__item:disabled > :not(small) { opacity:.5 }` is UNSCOPED (`CSS:4332`). Mute… should open the details-v2 `MuteMenu` (slice D) instead of a Modal (HTML `rowMenu` leaves it a no-op). Delete is offered on the team channel too; the server refuses (`conversation-hide.ts:72`), hide it for `c.channel`. |
| MSG-112 | CONFLICTS | Phone: card `role="status" aria-label="Loading conversations"` with a `is-w20` header line and five rows of a 44 coin + `is-w40`/`is-small is-w70` lines (`MP:293-309`, `CSS:5921-5928`); fill `color-mix(text-primary 9%)`, radius 6 (`CSS:4174-4179`). Desk: `div aria-busy` (no role/label) with ui `Skeleton` 36 coin, 60%/85% (`MV:700-711`). Route: `MessagesSkeleton` (`MessagesSkeleton.tsx:11-65`). | REPLACE FIRST: the route skeleton's phone half (`MessagesSkeleton.tsx:39-61`: `LargeTitleSkeleton`, three chips, double-rule section) and the desk shimmer rows. Then: Widths are identical per row; spec [[46,78],[38,64],[52,82],[34,58],[44,70]] %. Lines are `1lh` of 15/13 type with 2 px block padding (about 16/13.7 high) vs `11k` and `9k` at 75% opacity, margin-top 8. Header is 20% wide vs a 64 px bar. Pulse 900 ms (`tokens.css:926`) vs 1.4 s (MOT-X-15). Desk: coin 36 vs 40, role=status + label missing, shimmer not pulse, no 56 px section-label placeholder, context text is present ("Loading conversations", `MV:668`). `MessagesSkeleton` phone half still draws `LargeTitleSkeleton` + three chips + double-rule section (`MessagesSkeleton.tsx:39-61`, `CSS:1560-1615`), which is the pre-Nov-4 shape: redraw it as search row + segmented + card of five skeleton rows; its desktop half (`:13-37`) draws a 36 coin rail. `large-title-skeletons.test.tsx:27` must drop Messages. `annLoading` also gates the skeleton (`MP:257`). |
| MSG-113 | CONFLICTS | `.ch-ms-row__top b { display:-webkit-box; -webkit-line-clamp: 2; white-space: normal; overflow-wrap:anywhere }` (`CSS:310-320`); the v2 rule only sets font (`CSS:4131-4135`) and does not reset it. Preview clamps to 2 lines on phone (`CSS:1900-1907`), 1 line (nowrap) on desktop (`CSS:218-226`). | Names must be ONE line with ellipsis ("Qualifier group · Lonnie Poole travel squad", "Maya Ortiz-Castellanos"): add `display:block; -webkit-line-clamp:unset; white-space:nowrap; text-overflow:ellipsis` (v2 scope) and keep `min-width:0`. Preview two-line clamp: ok on phone. |
| MSG-114 | DONE | The phone page scrolls under the shell bar; `PhoneTop` never moves (`MP:169-182`, `SH/phone-chrome.tsx`). The desktop rail head is outside the scroller (`MV:654-688` vs body `:689`). | none. (In the HTML prototype the desktop rail head is inside `.scroll` and scrolls away; the spec text only asks for the phone behaviour. Keep the head fixed unless the owner says otherwise.) |
| MSG-115 | PARTIAL | `SearchField` -> `filterConvs(convs, filter, q)` matches `title` OR `lastText` (`model.ts:220-223`); `MessageHits` (`message-hits.tsx:9-111`): term >= 2 chars, 250 ms debounce, `searchGolfMessages` server action (ilike on content, limit 50, hidden conversations excluded, `actions/messages.ts:1483-1560`), first 20 shown as `ch-ms-row is-hit` rows with a search coin, name, time, "Sender: snippet" + `<mark>`; label "In messages"; skeleton row; failure `InlineNotice` CH-7203; "No messages mention “term”" CH-7303; with no name match and no hit: card "No results" / "Try another name or word." (`message-hits.tsx:37-43`). Search from `M:577-603`; `openHit` `M:999-1002`. | Mostly there. Delta: hits render as a flat `.ch-ms-sec` ("In messages" label, on phone the old double-rule ledger label `CSS:1762-1773`, no card) vs "rows in the Recent card style"; empty copy is "No results" + "Try another name or word." vs Q-07 default "No results for {query}" in the Nothing-here style; names that match only via `lastText` also pass (spec: by name) - decide with the owner, default keep. Pinned card is hidden while a query is typed (`MP:311`); under spec it stays. `AnnouncementsSection` also filters on the query (`MP:350`) and is not in the HTML. |
| MSG-116 | DONE | Phone `InlineNotice code="CH-7201" title="Conversations didn’t load" body="Your messages are safe. Try again." onRetry={api.refetchConvs}` (`MP:291`); same on the rail (`MV:690-699`); `M` sets `convsError: !!error && !conversations.length` (`M:714`). | none (today's pattern and copy, as the spec asks). |
| MSG-121 | PARTIAL | Rail column: base `grid-template-columns: 340px minmax(0,1fr)` (`CSS:6`); 320 only under `@container (min-width: 1101px)` (`CSS:4069-4082`; container = `.ch-canvas`, `shell.css:23`). Background `--ch-grouped-bg` + `--ch-messages-x1` (inset -0.5px) (`CSS:4083-4086`) on top of the base `border-right: var(--ch-hairline-w) solid` (`CSS:36-42`). Body padding `4px 12px 20px` (`CSS:73-84`). | At a 1280 window the canvas is about 1032 px, below 1101, so the rail is 340 not 320: make the rail 320 at every desktop width (details column stays a separate decision, MSG-801/Pkg D). Background: HTML Part 2 `.rail` is `--a-surface` (`--ch-card-bg`), not the grouped page colour. Drop the duplicate 1 px border (keep the 0.5 px hairline). Scroll padding `0 0 24` (code 4 12 20, which is also the cause of the row inset in MSG-124). |
| MSG-122 | PARTIAL | `Rail` head (`MV:654-688`): `<h1>Messages</h1>` `--ch-type-28-strong`, -0.038em (`CSS:4087-4090`); new key = `ch-btn ch-btn--secondary ch-iconbtn` with icon 16 in a `Tooltip` (`MV:656-666`); `<p class="ch-ms-rail__ctx ch-num">` via `inboxContextDesktop` = "{n} unread · {m} conversations" (`MV:610-612`, `:668`); `SearchField`; `Segmented size="sm"`. Head padding `20 16 16`, gap 12 (`CSS:43-48`). | Title 28 vs 26k, -0.038em vs -0.034em. Key must be the MSG-103 40 px circle (surface, card shadow, icon 19, accent-text). Context line: copy right; margin `2 0 12` vs head gap. Search 36 vs 40, Segmented sizes (MSG-103/104). Head padding 18 16 4 vs 20 16 16. |
| MSG-123 | PARTIAL | `PinnedAndRecent` (`MV:615-638`): `<section aria-label="Pinned">` `<div class="ch-ms-sec__l">Pinned</div>` then "Recent", labels omitted when empty, flat rows (no card, `CSS:4100-4103`); label 13/600 secondary (`CSS:4096-4099`). Pinned rows are ordinary `ConvRow`s of the filtered list; the team channel always leads (`model.ts:378`). | Label spacing: base `padding: 0 8px 8px` (`CSS:88-94`) inside a 12 px body padding vs `margin 14 0 4; padding 0 18`. Otherwise matches. |
| MSG-124 | CONFLICTS | Rail row = `ConvRow` default `avatarSize=36` (`MV:360`, `:724`) but forced 44 by `CSS:301-303`; `margin-inline: 8px; radius 12` (`CSS:4104-4109`); padding 12 / grid col 44 (`CSS:272-276`); desktop seam hairline from x=69 on `~ .ch-ms-row::before` (`CSS:280-287`); preview one line (`CSS:218-226`); selected wash 5% (`CSS:4110-4112`). Right-click menu: MSG-111. | DELETE FIRST: the desktop rail's row seams (`CSS:280-287`) and the `!important` 44 px avatar (`CSS:301-303`). Then: Face 40 (not 44), padding 9 10, NO separators on the desktop rail (remove `CSS:280-287` seams for `.ch-ms-rail`; the test `conv-row-seams.test.tsx:74-87` pins them), preview 15k two-line clamp (currently one line), body padding removed so the row inset is 8 not 20. Name/time/dot/bell/typing follow MSG-109/110 (including its REMOVE items). Hover wash `rgba(28,25,18,.045)` (`CSS:144-146`) is not in the spec (only `:active` and `.is-sel`): keep or drop with the owner. |
| MSG-125 | DONE | `isMessagesFirstRun` (`MessagesFirstRun.tsx:44-46`): the rail keeps `<h1>Messages</h1>`, context "No conversations yet" (`MV:668`), the search field, hides the Segmented (`MV:675`) and renders no list (`MV:710-712`); the pane shows the first-run card (`MV:3331-3341`, slice D). | none for the rail (title/search sizes: MSG-122). Phone hides search + segmented too (`MP:267`). |
| MSG-126 | PARTIAL | Rail loading (`MV:700-711`): `div.ch-ms-sec__card aria-busy data-ch-code="CH-7402"`, five rows of `Skeleton` 36 coin, 60% x 13 and 85% x 12 lines. | Same deltas as MSG-112 desk half: coin 40, per-row widths, 11k/9k lines at 75%, add the 56 px section-label placeholder, `role="status" aria-label="Loading conversations"`, pulse instead of shimmer. Context text "Loading conversations" is already shown (`MV:668`). |
| MOT-LIST-1 | PARTIAL | Thread is a `PhoneScreen` (`MP:462`): `translateX(100%) > 0` on `chSpring('smooth')` (`SH/PhoneScreen.tsx:125-135`). Page beneath: `slideUnderlay` translates the canvas parts by `-CH_UNDERLAY_SHIFT * 100vw` with a scrim `--ch-push-dim` (`SH/phone-chrome.tsx:188`, `:249-285`; `tokens.css:1408` `rgb(20 18 12/.10)`, dark `.35` `shell.css:2784`). Face flight: `noteTappedFace` on the inbox (`MP:266`) records the face of `.ch-ms-row`/`.ch-msv-pin`; `useFaceFlight` clones it to `.ch-msp-who > :first-child` on the smooth curve, bar face hidden until it lands (`thread-v2.tsx:269-309`, called `MP:446`). Inbox is `inert` while pushed (`MP:178`). Reduce Motion: fade (`chFade`). | Underlay shift is 24% of the width (`CH_UNDERLAY_SHIFT = 0.24`) vs the HTML's `translateX(-30%)`. The Nov 4 rulings (`design-refresh/messages/07-MOTION.md` M-MSG-01a, line 94 and 295) deliberately kept 24% + `brightness(.9)`; MOTION.md copied the HTML's 30%. Needs an owner call (shell-wide constant: every pushed screen in Clubhouse moves with it). Reduce Motion fade is `CH_FADE_MS`/quick 180 ms vs 120 (Q-05). Flight clone z-index 60 vs 45 (irrelevant). |
| MOT-LIST-2 | PARTIAL | Back = exit `translateX(100%)` on `chSpring('smooth')` (`PhoneScreen.tsx:137-149`); underlay animates back "from wherever each one is now" (`slideUnderlay` reads live `translate`, `phone-chrome.tsx:249-285`); `useFaceFlight` cleanup cancels the flight and shows the face (`thread-v2.tsx:299-307`); `usePhoneStackHistory` pops on the iOS edge swipe/back (`MP:166`). | Same 24% vs 30% decision as MOT-LIST-1; RM 180 vs 120. MC-07 (back at 170 ms) is not covered by an automated test today. |
| MOT-LIST-3 | DONE | Bar is the shell's and never moves; list scrolls in the canvas. | none. |
| MOT-LIST-4 | PARTIAL | Rows: `ListPresence arrive="inbox" cut={changedScope}` (`MP:342`, scope compare `MP:251-256`): rows that stay glide (framer `layout="position"`) on the 462 ms smooth push curve, new rows fade in on it, rows leaving a filter/search change are cut in one frame, a row leaving the list fades + scales .96 over 180 ms (`UI/ListPresence.tsx:94-100`, `:116-120`). Thumb: `useSlidePlate` WAAPI on the `settle` spring, translate + width, skipped under Reduce Motion (`UI/Segmented.tsx:61`, `lib/slide-plate.ts:20-85`). Desktop rail uses plain `<ListPresence>` (`MV:625`, `:633`: arrive "open"). | Rows on the phone: DONE. Thumb: CSS `transform .36s cubic-bezier(.34,1.3,.64,1)` (overshoot) vs settle spring (about 427 ms, small overshoot); jump under RM: ok. Decide: add a `tween` option to the Messages Segmented, or accept the settle spring. Desktop rail: rows open/close height (`ENTER`/`LEAVE`) on filter change vs translateY glide + fade: switch the rail's two `ListPresence` to `arrive="inbox"` too. |
| MOT-LIST-5 | PARTIAL | Row/pin dots: see MSG-110. Preview swaps to dots while typing, hides 5 s after the last event (`use-typing-by-conversation.ts:6`, `MV:560-566`), loop 1.2 s, delays 0/.16/.32. Reduce Motion: no animation, opacity 1 (`CSS:4186-4196`, also `base.css:320-327`). | Easing token vs CSS `ease`; gap 2 vs 3; 2+ typers show text. Otherwise DONE. |
| MOT-X-2 | PARTIAL | Same code as MOT-LIST-4 thumb. | CSS 360 ms `cubic-bezier(.34,1.3,.64,1)` vs `settle` spring via WAAPI (`slide-plate.ts`). Reduce Motion jump: ok. |
| MOT-X-8 | PARTIAL | Row menu = `ContextMenuSurface` `m.div` (`UI/ContextMenu.tsx:289-316`): in `CH_POP.initial` (opacity 0, `translateY(-4px) scale(.97)`), exit `translateY(-2px) scale(.98)`, both `chTween('quick')` 180 ms; origin `top \| bottom left \| right`from placement (`:243-258`). Reduce Motion: opacity only. | Needs `scale(.8) opacity 0 > none` on the `lift` spring from the top-left (bottom-left when flipped up) and a 160 ms opacity close; add as an option on `useContextMenu` (shared by other screens), not a global change. |
| MOT-X-15 | PARTIAL | Phone inbox skeleton `.ch-msv-sk` pulse `ch-msv-skel` opacity 1 > .55 at 50% over `--ch-dur-sweep` = 900 ms, ease-in-out, infinite (`CSS:4174-4185`, `tokens.css:926`); stops under `prefers-reduced-motion` and `data-motion='off'` (`CSS:4186-4196`). Desktop rail and route skeleton use `ui Skeleton` -> `.ch-skel` with a sheen sweep `--ch-dur-shimmer` 1.9 s (`shell.css:857-870`, `tokens.css:922`). | Duration 900 ms vs 1.4 s (`animation-duration: 1.4s` on the Messages skeleton only; do not change `--ch-dur-sweep`, spinners use it). Desktop/route: replace the shimmer with the same pulse (new `ch-msv-sk` rows). RM stop: ok. |
| MOT-X-17 | CONFLICTS | Rows transition `background-color var(--ch-dur-quick)` 180 ms (`CSS:115-117`; phone `var(--ch-dur-press)` 110 ms, `CSS:1793`). Selected = 5% ink (`CSS:4110`), press = `[data-ch-pressed]` 5% (`CSS:4124`). Pins have no transition. | REMOVE FIRST: the row background transitions (`CSS:115-117` 180 ms, `CSS:1793` 110 ms). Then: Spec: a plain background change, no animation. Set `transition: none` on `.ch-ms-row` in the v2 scope (phone and desk). Colour values are right. |

### Code map

#### src/clubhouse/screens/messages/MessagesPhone.tsx (1,270 lines)

| Lines | Name | Holds | Shared with other slices |
| --- | --- | --- | --- |
| 1-113 | imports | inbox uses `Segmented`, `SearchField`, `RailEmpty`, `MessageHits`, `AnnouncementsSection`, `MessagesFirstRun`, `ListPresence`, `Avatar`, `filterConvs`, `pinnedThreads`, `noteTappedFace` | the thread/details imports are slice B/C/D |
| 115-119 | `FirstMessage`, `AnnDraft` types | none of A | D |
| 128-243 | `MessagesPhone` | stack controller: `top`/`depth`/`popTo` (`:151-166`), `usePhoneStackHistory`; A owns only the root bar and inbox mount (`:169-182`: `PhoneTop`, `.ch-msp-inbox` with `inert={depth>0}`, `<SectionBoundary surface="messages.rail" code="CH-7210">`) and the `onNew`/`onTeam` callbacks | B (thread mount `:185-198`, `covered`), D (announcement `:200-211`, new message `:212-230`, announce form `:231-233`, details `:234-236`). One implementer should own the controller; A only touches `:169-182`. |
| 245-356 | `PhoneInboxV2` | MSG-102..109, 112, 113, 115, 116; MOT-LIST-4 rows; pin tile markup `:314-336`; skeleton `:292-307`; first-run switch `:308` | Self-contained: A can rewrite the whole function. Calls `ConvRow` (MV) and `MessageHits`, `RailEmpty`, `AnnouncementsSection`. |
| 358-364 | `GroupMark` | thread/details coin (`:469`, `:808`) | B/D (not A) |
| 366-698 | `PhoneThread` | none of A except `useFaceFlight(true, threadReduced)` at `:446` (the other end of MOT-LIST-1's avatar flight) | B, C |
| 700-765 | `SeenSheetRow`, `ActingSeenMeta`, `PollSheetRows`, `SheetRow`, `Panel` | none | C/D |
| 767-909 | `PhoneDetails` | none (mute, hide: D) | D |
| 911-1200 | `PhoneNewMessage` | none | D |
| 1203-1270 | `PhoneAnnouncementForm` | none | D |

#### src/clubhouse/screens/messages/MessagesView.tsx (3,389 lines)

| Lines | Name | Holds | Shared with other slices |
| --- | --- | --- | --- |
| 152 | `RAIL_KEYS` | rail keyboard hint | A |
| 193-337 | `ChMessagesApi` | A reads: `pins` (202), `typingByConv` (204), `designFilter` (198), `convs`/`convsLoading`/`convsError`/`refetchConvs` (214-217), `deleteConversation` (260), `searchMessages`/`openHit` (288-289), `muteOf`/`muteConversation` (302-304), `setRead` (309), `annLoading` (313) | every slice reads this interface; add fields additively |
| 342-348 | `convAvatarId` | face id | A, B |
| 360-433 | `ConvRow` | MSG-109, 111; row menu items `:378-392`, `useContextMenu` `:393-399`, phone `SwipeRow` `:416-429` | A only |
| 439-502 | `RowMuteModal` | "Mute…" sheet from a row (CH-7607) | A (trigger) / D (should become `MuteMenu`) |
| 505-509 | `convYear` | coin year | A, B |
| 512-526 | `TypingMini`, `typersLine` | MSG-110; `TypingMini` is also used by the pins | A; `typersLine` unused elsewhere |
| 528-607 | `ConvRowButton` | MSG-109, 110, 113 markup | A only |
| 610-612 | `inboxContextDesktop` | MSG-122 context line | A |
| 615-638 | `PinnedAndRecent` | MSG-123 | A |
| 640-736 | `Rail` | MSG-121..126: head `:654-688`, error `:690-699`, loading `:700-711`, empty `:712-720`, list `:721-733` | A only |
| 745-... | `popBadge`, `ReactionChip`, ... `Bubble` (1110), composer (1777), `Thread` (2152) | none | B/C |
| 2581-2616 | `DeleteConversationModal` | confirm "Delete {title}?" used by the row (`MV:403`) and by Details (`MV:2858`) | A (row) / D (Details) |
| 2754-2866 | `Details`, `muteLabel` | none | D |
| 3257-3389 | `MessagesDesktop` | rail mount `:3295`; the rest is pane/details/first-run | D owns the function, A owns only the `<Rail>` line |

#### src/clubhouse/screens/messages/Messages.tsx (1,094 lines, one component `Messages` 73-1094 that builds the `api` object)

A touches: `mark`/`marked` (108-117, device-only marked-unread), `loadedConvs`
mapping (119-147: `lastText`, `lastSenderId`, `lastIsPoll`, `markedUnread`; a
pin bubblet needs `lastSenderId`, already there), `select` (280-298: clears the
mark on open), `canHide` probe (171-183), `searchMessages` (577-603), `muteOf`
(631-641), `rowMutes`/`convIds`/`pins`/`typingByConv`/`shownConvs` (689-693),
`api` fields `pins`, `typingByConv`, `convs`, `convsLoading`, `convsError`
(695-720), `deleteConversation` (937-949), `openHit` (999-1002),
`muteConversation` (1015-1019), `setRead` (1020-1042). The rest of `api` (send,
attachments, polls, reactions, members, announcements, drafts) belongs to B/C/D.
Because it is one `api` literal, merge conflicts here are likely: keep A's edits
to the listed blocks.

#### Other files in the slice

| File | What | Notes |
| --- | --- | --- |
| `RailEmpty.tsx` (42) | MSG-108 filtered empties | A only |
| `MessagesSkeleton.tsx` (65) | route skeleton, desk half `:13-37`, phone half `:39-61` | A only; `app/golf/(dashboard)/dashboard/messages/loading.tsx:30` mounts it; also `app/clubhouse-preview/[screen]/page.tsx:516` |
| `MessagesFirstRun.tsx` (46) | `isMessagesFirstRun` used by A; the card is MSG-7xx (D) | shared |
| `MessagesScreen.tsx` (40) | picks phone/desktop; wraps everything in `data-ch-ms-v2` unconditionally (`:36`) | shared |
| `message-hits.tsx` (112) | MSG-115 | A only |
| `pinned.ts` (70) | device pins in localStorage `ch:msg:pinned:{viewer}:{team}`, `PIN_LIMIT = 3` | A |
| `use-conversation-pins.ts` (236) | pins hook (server first, device fallback) | A; see Risks |
| `marked-unread.ts` (40) | per-device "Mark as unread" (`ch.msg.unread.{userId}`) | A |
| `use-typing-by-conversation.ts` (65), `use-row-mutes.ts` (37) | typing and mute glyphs for rows | A |
| `model.ts` | `ChConv`, `filterConvs` (220), `isUnread` (216), `railTime` (157), `pinnedThreads` (378) | shared |
| `announcements.tsx` | `AnnouncementsSection` (23-...), shown in both inboxes (`MP:350`, `MV:729`) | not in the HTML; decide (D-44) |
| `thread-v2.tsx:269-309` | `noteTappedFace`, `useFaceFlight` | B owns the file; A calls `noteTappedFace` |

#### CSS (`src/clubhouse/styles/messages.css`, 5,958 lines, shared by all slices)

Inbox rules, in three generations that overlap: base rail/rows `:36-380`;
skeleton/phone page `:1560-1680`; phone rows/seams `:1756-1930`; announcements
`:3251-3340`; v2 inbox `:4068-4335` (everything under `[data-ch-ms-v2]`); unread
dot + card rows `:5063-5078`; skeleton lines `:5921-5928`; narrow-phone bubblet
override `:5937-5941`. Token blocks `:5855-5865`. The 4,000+ lines of
thread/composer/overlay/details rules between those belong to B/C/D. Related
shared files: `controls.css` (Segmented `:3-107`, Search `:161-215`, phone sizes
`:585-640`), `ui.css` (`.ch-popover` `:622`), `tokens.css`, `shell.css`
(`.ch-pscreen`, scrim `:1600-1625`).

#### Shared UI / shell touched

`UI/ContextMenu.tsx` (hold 500 ms, width 232, `CH_POP`), `UI/Menu.tsx` (caption + native disabled), `UI/Segmented.tsx` + `lib/slide-plate.ts`,
`UI/SearchField.tsx`, `UI/ListPresence.tsx`, `UI/SwipeRow.tsx`, `UI/Avatar.tsx`,
`SH/phone-chrome.tsx` (`CH_UNDERLAY_SHIFT`, `PhoneTop`, `slideUnderlay`),
`SH/PhoneScreen.tsx`. Changes there affect every Clubhouse screen: add
Messages-scoped variants/options.

### Tests

Existing tests that pin behaviour in this slice, and what legitimately changes:

| Test | Pins | Change for the new spec |
| --- | --- | --- |
| `screens/messages/__tests__/conv-context-menu.test.tsx` | row menu items ("Open conversation", "Mark as unread", "Mute…" without pins), `aria-label` "Actions for {name}", Mute sheet CH-7607, phone Actions button, swipe cancels hold | Keep. Add: Pin/Unpin order, dimmed Pin with "Pin up to 3" as `aria-disabled`, width 236, Delete hidden for the team channel. |
| `screens/messages/__tests__/conv-row-seams.test.tsx` | CSS strings for phone seams across `<dialog>` siblings (`:38-87`), desktop seams (`:74-87`), single inline child in the clamped preview (F-0052, keep), no haptic on open (keep), announcement card margin (keep) | Seam tests must change: phone seam moves to x=16..right edge at 0.5 px, desktop rail seams go away. Do not delete: replace with the new selectors. |
| `screens/messages/__tests__/pinned.test.tsx`, `pinned-threads.test.ts`, `use-conversation-pins.test.tsx` | 3-pin limit, device fallback with the table missing for `42P01/PGRST205/PGRST202` (no toast, no console error, no channel), pin_limit/not_a_member toasts, offline queue, import, "fourth pin sends nothing", `atLimit` counts pins not in the inbox | Stay valid unless the pin accounting changes (channel counting as a pin, see Risks): then update `pinned-threads` ("three in all") and the `atLimit` cases (`use-conversation-pins.test.tsx:308-327`). |
| `screens/messages/__tests__/marked-unread.test.tsx` | localStorage round-trip | none |
| `screens/messages/__tests__/typing-by-conversation.test.tsx` | 5 s expiry, skips open conversation, 30-channel cap | none (rendering of 2+ typers is untested today; add one for dots-only + aria-label). |
| `clubhouse/__tests__/messages.test.tsx` | `#12` Groups empty = "No group conversations yet" CH-7302 (`:1246-1252`); CH-7401/7402 route and rail loading (`:452-460`); CH-7301/7305 empties (`:436-443`); filter radios `getByRole('radio', {name:'Groups'})`; search box name "Search conversations and messages" (`:669`); delete/mark-read rows (`:296-327`); rail Arrow keys (`:235`) | `#12` copy changes to "No groups right now." in the card; keep codes CH-7302/7402 as `data-ch-code`; keep the radio semantics and the search box label. |
| `clubhouse/__tests__/large-title-skeletons.test.tsx` | `MessagesSkeleton` draws exactly one `[data-ch-large-title]` (`:27`, `:46-53`) | Contradicts MSG-102/112 (no large title in the Messages inbox): remove Messages from `ROOTS` with a comment, keep the other ten. |
| `clubhouse/__tests__/empty-honest.test.ts` | ratchet: legacy `EmptyState` counts per file (`MessagesPhone.tsx: 2`, `MessagesView.tsx: 3`, `RailEmpty.tsx: 1`, `:54-56`) | Counts may only fall. Converting the empties to the card note lowers `RailEmpty`; a new `EmptyState` needs `kind=`. |
| `clubhouse/__tests__/page-spacing.test.ts` | `.ch-msp-page` and `.ch-msp-skel` use page tokens (`:111-112`) | Keep edges on `--ch-page-x-phone`; the inbox fix (zero inline padding on `.ch-msv-inbox`) must still pass. |
| `clubhouse/preview/__tests__/messages-design-fixture.test.tsx` | the `[data-ch-ms-v2]` root | none |

A repo-wide search (excluding `node_modules`) for `ch-ms-row`, `ch-msv-`, `Pin
up to 3`, `Nothing unread`, `Loading conversations` finds no test, `e2e/` or
`scripts/` file outside `src/` that pins inbox selectors or copy; the hits
outside the code are docs: `docs/clubhouse/catalog/messages.md`,
`docs/clubhouse/pages/P007-messages/changes/*` (inbox row, desktop seams, silent
open), `docs/clubhouse/motion/2026-10-20-messages.md` and
`design/handoff/messages.jsx`. The mapped feature docs carry the old copy and
structure and must be updated with the build (AGENTS.md: update the mapped doc
when its contract changes).

No test pins the phone context line, `typersLine`, the pin bubblet,
`PhoneInboxV2`, `MessageHits` copy or `RailEmpty`'s search/Unread copy directly;
add focused tests for each new rule.

### Risks and surprises

1. Pins in production (what actually happens; the table's absence is inferred
   from `HELD.md:253` and `database.ts` having no `golf_conversation_pins`, not
   checked against the live catalog). There is NO server action and NO loader
   for pins. `useConversationPins` (`use-conversation-pins.ts`) talks to
   Supabase from the browser: it reads `golf_conversation_pins`
   (`.select('conversation_id')` scoped by `team_id`, ordered by `position`,
   `:73-77`), writes through `rpc('golf_pin_conversation', {p_conversation_id,
   p_pinned})` which returns `{pins: [...]}` or raises `pin_limit` /
   `not_a_member` (`:86`, `:211-216`; toasts "You already have 3 pinned." /
   "You’re not in this conversation anymore."), imports this device's pins once
   (`:94-121`) and listens on the private channel `golf-pins:<viewer>` (event
   `pins`, `:153-160`). `golf_reorder_conversation_pins` exists in the migration
   but nothing calls it. Migration `20261031150000_golf_conversation_pins.sql`
   is "WRITTEN, NOT APPLIED" in `supabase/migrations/HELD.md:253` and
   `golf_conversation_pins` is not in `src/lib/types/database.ts`, so in
   production the read fails (`42P01`/`PGRST205`/`PGRST202`), the hook stores
   `unavailableUntil = now + 5 min` (module scope, `:13-15`, `:76`) and returns
   `null`; the UI then uses device pins (`pinned.ts`, localStorage
   `ch:msg:pinned:{viewer}:{team}`, max 3) with no toast or error anywhere. Pins
   therefore WORK per device in production, do not sync, and cannot show on a
   second device. Side effects: (a) the Pinned card is held empty for up to
   `PROBE_WAIT_MS` = 1.5 s (`:229`) and then jumps to the device pins, so tiles
   can appear late; (b) every window `focus` on a mount that did the probe
   repeats the failing GET because `refetch` does not check `unavailableUntil`
   (`:139-142`, `:174`; the early return at `:130` only skips mounts inside the
   5-minute window): one 404 per focus in the network panel; (c) Messages passes
   `enabled=true` as a literal (`M:691`); the "flag off: no request" comment is
   stale. After the owner applies the migration and runs `npm run db:types`, the
   next mount picks up the server list and runs the one-time import; the
   `PinsClient` cast can then go. The build must keep the device fallback.
2. Pin accounting does not match the spec. The team channel is "always pinned
   first" for display (`pinnedThreads`, `model.ts:378-382`) but is not a stored
   pin and does not count toward `atLimit` (`pinned.ts:44`,
   `use-conversation-pins.ts:234`). The HTML's third pin is the channel (pins =
   team, eli, dana; "Pin up to 3" appears at 3 including Team). In code a coach
   can store 3 own pins, and the phone card then shows channel + the first two
   and silently drops the third from Pinned (it falls into Recent). Either count
   the channel in `atLimit` (limit 3 total) or make the limit 2 when a channel
   exists. The channel row's menu also offers "Pin" (it dedups in display but
   burns a slot).
3. Unpin on the phone. If MSG-107 filters pinned conversations out of Recent,
   the only row menu (`ConvRow`) is no longer reachable for a pinned DM; today
   it is reachable only because filters/search re-list pins. The Pinned tile
   needs its own long-press menu (Unpin, Mark as unread, Mute…, Delete) using
   the same `useContextMenu`. The HTML does not draw this; propose it as the
   default.
4. Possible double inset on the phone inbox (MSG-004/005): `.ch-msp-page`
   padding plus `.ch-msv-top`/`.ch-msv-card` padding/margin. Measure before and
   after.
5. 24% vs 30% push underlay is a conflict between the HTML/MOTION.md and the Nov
   4 ruling in `07-MOTION.md` (M-MSG-01a: "build -24%, `CH_UNDERLAY_SHIFT`,
   `brightness(0.9)`") and `SETTLED-4NOV`; the constant is shell-wide. Also the
   Reduce Motion fade is 180 ms in the app (`CH_FADE_MS`, owner decision 2) vs
   120 ms in the HTML (Q-05).
6. Shared primitives. Segmented, SearchField, ContextMenu/Menu, ListPresence,
   Avatar sizes and `.ch-popover` are used by every screen;
   `controls.css:585-591` enlarges segments on the phone for the whole app.
   Implement Messages deltas as scoped variants (class under `[data-ch-ms-v2]`,
   or new optional props) and keep `ui/__tests__` green.
7. CSS archaeology. Row styling is three generations deep with an `!important`
   avatar size (`CSS:301-303`), a two-line name clamp (`CSS:310-320`), unscoped
   rules (`.ch-menu__item:disabled`, `CSS:4332`), and `~`-sibling seam selectors
   that exist because a row's sheets are `<dialog>`s left after its frame
   (`CSS:1840-1875`, pinned by `conv-row-seams.test.tsx`). Change the seam model
   in one pass with the test.
8. `MessagesScreen` wraps the screen in `data-ch-ms-v2` unconditionally
   (`MessagesScreen.tsx:36`); the "flag off keeps today's DOM" comments in `CSS`
   are historical. All new CSS can live under that attribute.
9. Phone rows sit inside `SwipeRow` (leading Read/Unread, trailing Delete; owner
   decision 14) and the Actions button for VoiceOver (`MV:416-429`). The HTML
   draws neither; keep them (every action must also be in the menu). The extra
   wrapper is why seam CSS targets `.ch-ms-swipe`.
10. Announcements live inside the inbox on both layouts (`AnnouncementsSection`,
    owner 2026-10-16, D-44; `MP:350`, `MV:729`). The HTML has no announcements.
    Keep unless PLAN removes them; they must follow the new card/row styling or
    they will look like the old ledger.
11. Delete/hide: `hideGolfConversation` is a server action writing the caller's
    own `hidden_at` (`actions/conversation-hide.ts`). Migration `20261008160000`
    is APPLIED (HELD.md:196, 2026-10-21) and `database.ts:12646` has
    `hidden_at`, so the file's "held" comments and the `as '*'`/`as never` casts
    are stale; `canHideGolfConversations` still costs one server-action read
    unless `data.canHide` is passed (`M:171-183`). The team channel cannot be
    hidden (server error "A team channel can’t be deleted") but the menu offers
    Delete for it.
12. Mark as unread is device-local (`marked-unread.ts`, owner decision 14): it
    never changes the server read flag or the nav badge; opening the
    conversation clears it (`M:290`). The "Unread" filter and the dot include
    marked rows (`model.ts:216-218`).
13. Search is a server action with `ilike` over messages (limit 50, hidden
    conversations excluded, `actions/messages.ts:1483-1560`); the client filters
    hits to the loaded inbox (`M:595-597`) and shows 20. Name search also
    matches the preview text (`model.ts:222`).
14. Typing: the hook joins up to 30 `golf-conversation:<id>` channels and skips
    the open thread; pins and rows beyond that show no typing. Group copy is a
    decision (Q-12 default: dots only).
15. Desktop auto-open: with no `selectedId`, desktop opens the newest thread
    beside the rail and marks it selected (`M:184-191`), so the `is-sel` wash is
    always present on desktop.
16. Rail head is fixed above the scroller in code; in the HTML prototype it
    scrolls with the list. Spec text does not require scrolling; keep fixed.
17. HTML vs SPEC.md: SPEC.md MSG-107 says the phone list "filters out pin", the
    HTML also keeps the Pinned card under Unread/Groups; the HTML also lists
    desktop pinned rows only when they pass the filter (matches code). SPEC.md
    MSG-105 "Max 3" counts the team channel (see item 2).

Summary: 35 items, DONE 7, PARTIAL 20, CONFLICTS 8 (MSG-102 context line,
MSG-106 narrow-phone bubblet override, MSG-108 empty copy, MSG-109 unread
styling/avatar/seams, MSG-112 route skeleton, MSG-113 name wrap, MSG-124 rail
seams, MOT-X-17 row transitions), MISSING 0.

---

## Part B. Slice B: thread, composer, send, typing, date pill, jump

Slice B of the Messages v2 gap survey. Today's code is the Nov 4 generation
(`[data-ch-ms-v2]` rules in `src/clubhouse/styles/messages.css`, hooks in
`thread-v2.tsx`). Where SPEC.md and the HTML differ I say so. All paths below
are under `src/clubhouse/` unless they start with `src/`. Line numbers were
re-read against the checkout (branch `agent/ch-messages-v2`). CSS-cascade claims
(specificity) come from reading the stylesheet, not from a browser run; the
implementer should check them in WebKit.

Abbreviations: MV = `screens/messages/MessagesView.tsx`, MP =
`screens/messages/MessagesPhone.tsx`, T2 = `screens/messages/thread-v2.tsx`, CSS
= `styles/messages.css`, UGM = `src/hooks/golf/use-golf-messages.ts`.

### Verdicts

| ID | Verdict | Today (file:line) | Delta to build |
| --- | --- | --- | --- |
| MSG-201 | CONFLICTS | Phone bar is `PhoneBar lead` (MP:463-479): back key aria "Back to Messages" (MP:465, ok), `.ch-msp-who` button holding `Avatar size="md"` (36, `ui/Avatar.tsx:19`) + `<b>` first name for a DM (MP:470) / full title for a group + `<em>` sub (MP:471-476), info key `PhoneIconAction label="Details"` (MP:478, ok). Name 17/600 and role 13 (CSS:5916-5917, ok). Layout is LEFT-aligned flex: `.ch-pbar__lead` `flex:1` (`styles/shell.css:1527-1533`), `.ch-pbar.is-lead` gap 4 / padding-left 4 (shell.css:1461-1464), `.ch-msp-who` `flex:0 1 auto; margin-left:-4px; gap:8` (CSS:1941-1990). | Owner 2026-11-07 "center this": replace with a Messages-only 3-column bar `44px minmax(0,1fr) 44px`, gap 4, `.who` centred (face 36 + two left-aligned lines, gap 10 not 8). `PhoneBar`/`.ch-pbar__lead` are shared with other screens (Details, New message): do not change them globally. Add aria "Details for {name}" on the `.who` button (none today). Short group name = full title in the HTML, so no change there. Sub copy "N members" is already right (MP:367 `sub`). |
| MSG-202 | PARTIAL | Desktop bar `Thread` header (MV:2273-2327): `.ch-ms-th` absolute glass-strong over the scroller, container query >= 721 (CSS:5615-5629); hairline `::after` opacity via `.is-under` (CSS:5630-5640; class toggled by scroll listener MV:2253-2262, `scrollTop >= 2`). Name 15/600 (CSS:415), sub 13 tertiary (CSS:421). Search key aria "Search this conversation" (MV:2297); Schedule key (coach, MV:2299-2307) and Details key aria "Details" (MV:2316). `min-height:56; padding:8px 16px` (CSS:4638-4645). Desktop sub is `N members · A, B, C and more` (MV:2242-2250). | Spec: 64 high, grid `1fr auto`, padding 10 14; sub 12.5k ink-3; sub copy exactly "Junior" / "11 members" / "6 members" (drop the member-name list); search aria "Search in conversation"; hairline transition 200 ms (today `--ch-dur-quick` 180, CSS:5636). Back key `.ch-ms-back` (MV:2275-2283) must not render on desktop (spec: no back key): check it is hidden >= 821 (it is shown by CSS:1345 in the narrow-pane rule). Schedule key is not in the spec; keep (coach only, behaviour) or confirm with the owner. |
| MSG-203 | PARTIAL | Scroller is a flex child BETWEEN the bar and the composer, not a layer under them: phone `.ch-msp-thread .ch-ms-scroll {display:flex; padding:8px 0 16px}` (CSS:2029-2033), `.ch-ms-msgs` padding `0 12px` (CSS:2034-2040) later overridden to `var(--ch-page-x-phone)` = 16 (20 at >=414) (CSS:5911, tokens.css:469,1500-1505). Desktop `padding-top:48px` (CSS:5642-5644), column `max-width: var(--ch-measure-reading)` = 760 (tokens.css:433; CSS:4654) ok. Top edge fades by mask `.is-scrolled` 40px (CSS:477-480). Composer is in flow; `.ch-ms-comp::before` is a 24px gradient above it (CSS:4678-4687). Opens at the end + 700 ms settle hold (`use-thread-anchor.ts:9,127-164`). Follows the end while within 120 px (`NEAR_END_PX`, use-thread-anchor.ts:6,82). | Spec: scroller fills the page; bar and composer are glass overlays and the thread slides under both (`--pad-top` 132 phone / 76 desk, `--pad-bot` 104 / 92 + `--kb-pad`; side padding 12, 16 at 430 vs code 16/20); composer backing `inset:-24px 0 0` gradient transparent to page at 58%. Pin-to-bottom threshold: spec 24 px (field grow, chips, keyboard) and 60 px (arrival, HTML `rerender`), code 120 px for everything. This is the structural change of the slice (see Risks 1). |
| MSG-204 | PARTIAL | `[data-ch-ms-v2] .ch-ms-bub` (CSS:4393-4403): padding `calc(7.5*k) calc(13*k)` ok, radius `--ch-radius-xl` = 20 (tokens.css:570), font `--ch-type-16` = 16/21 (tokens.css:358) letter-spacing -0.01em, theirs `#fffefb` (tokens.css:716), mine flat `#155a39` (tokens.css:717) + `inset 0 .5px 0 rgb(255 255 255/.14)` (`--ch-messages-x4`, CSS:5862), shadows via `filter` tokens. `white-space:pre-wrap; overflow-wrap:anywhere` (CSS:575-576, plus `text-wrap:pretty`). Max width: phone stack 76% (CSS:5913), desktop col `min(520px,72%)` (CSS:4649). Desktop 15 (CSS:4651). `user-select:none; -webkit-touch-callout:none` only on phone stack (CSS:2056-2060). | Radius 20 -> 19; line-height 21/16=1.3125 -> 1.32; letter-spacing -0.01em -> -0.005em; lit edge 0.5px -> 1px if the token is 0.5; apply `user-select:none; -webkit-touch-callout:none` to desktop bubbles too (spec: all). Emoji-only message (no bubble, 40k, padding 0) is MISSING (grep `emoji` in screens/messages: only reaction maps). Focus ring: see MSG-008 note in Risks (bubbles are not focusable). Legacy `.ch-ms-msg.is-mine .ch-ms-bub {border-bottom-right-radius: var(--ch-radius-tail)}` (CSS:588-592) and phone legacy corner rules (CSS:2074-2078) still out-rank the v2 radius, so mine always has a 6px bottom-right even on the last bubble: HTML keeps 19 there. Phone bubble width compounds two percentages: the column is capped at 82% of the row (`.ch-msp-thread .ch-ms-msg__col`, CSS:2053-2055) and the stack inside it at 76% of that (CSS:5913), so a long message tops out near 62% of the row (by reading; measure it). Spec/HTML: the column is 76% of the row and the bubble 100% of the column. Verify corners in WebKit. |
| MSG-205 | PARTIAL | Gaps: v2 `.ch-ms-msg {margin-top:2px}` (CSS:4386-4389), `.is-first {margin-top:8px}` (CSS:4390-4392), phone legacy `.is-first 8px` (CSS:2050); reacted row `margin-top:16px` via `:has(.ch-ms-reacts)` (CSS:5883) ok. Join corners 6 (`--ch-radius-tail`) on the right sides (CSS:4411-4422) ok. Run logic is `threadItems` (`model.ts:198-211`): breaks on day change AND after 5 minutes between messages, and polls are not excluded. | `.is-first` 8 -> 10. Run = consecutive messages from one sender, no time gap, polls excluded (HTML `joins()` line 1517: same sender, neither is a poll or typing). Change `near()` in `threadItems` (model.ts:208) and add a poll check; `model.test.ts` pins today's 5-minute rule (see Tests). |
| MSG-206 | CONFLICTS | v2 tail is exact: `BubbleTail` SVG path `M0 0h12c0 9 1.6 14.5 6 20-5.2.3-9.8-.9-13.4-3.6L0 20z`, 18x20 (T2:213-219), `bottom:0; left:-5; scaleX(-1)`, mine `right:-5` (CSS:4423-4442), only when `last` (MV:1335). BUT the phone legacy tail is still live: `.ch-msp-thread .ch-ms-msg.is-last .ch-ms-bub:not(...)::after` draws a second 12x14 clip-path tail with `background: inherit` (CSS:2079-2093). | Delete the legacy `::after` tail (CSS:2079-2093) and its failed-state hider (CSS:3245-3247) so only the SVG tail draws. Tail is on the text bubble only; a message with text + attachment has the tail on the text bubble (MV:1335) while the photo/file sits below it in the same stack (see MSG-220). |
| MSG-207 | PARTIAL | Name inside first bubble of a run in groups: `{!m.mine && first && group && <b className="ch-msv-bname">}` (MV:1333); `.ch-msv-bname` 13/600 secondary, block (CSS:4443-4447); 30px face in the 30px slot on the LAST bubble (MV:1308-1322, `Avatar size={30}`); DMs hide the slot (`.ch-ms-msg:not(.is-group) .ch-ms-msg__av {display:none}`, CSS:5877). | Check `margin:0 0 1px` on `.ch-msv-bname` (absent). Typing-row face is 30 on desktop (MV:2412) but `size="sm"` = 28 on phone (MP:560): make both 30. |
| MSG-208 | PARTIAL | `.ch-msv-time` absolute, `right:calc(-64*k)`, `width:calc(52*k)`, 13/400 tertiary, nowrap (CSS:4491-4501); `right:calc(-68*k)` at 414-820 (CSS:4501-4505); desktop `left:100%; opacity 0 -> 1` on row hover/focus, `--ch-dur-quick` 180 ms (CSS:4507-4516). One per row (MV:1491). HTML line 934 writes `.phone .time {right:-64px}` without k; SPEC says -64k and the Nov 4 ruling 9 says -64k: keep k. | Vertical anchor: spec `bottom:6px`; code `top:50%; translateY(-50%)` (CSS:4493-4499) so it centres on tall bubbles. Desktop fade 150 ms (code 180). |
| MSG-209 | CONFLICTS | Day marker is still a CHIP: `[data-ch-ms-v2] .ch-ms-day > span {padding:4px 12px; radius:999; background:card; box-shadow; 13/500 secondary}` appears twice (CSS:4377-4385 and CSS:4624-4631), `margin:16px 0 8px` (CSS:4632-4635). The phone legacy plain-text rule (CSS:2041-2049) is overridden by these (equal specificity, later wins). JSX: `<span>{label}<b className="ch-num"> {clock}</b></span>` (MV:2362-2364, MP:527-529); time weight 400 (CSS:5060). `dayLabel` gives "Today"/"Yesterday"/weekday/"Oct 8" (`model.ts:167-173`), no "Thursday 4:12 PM" style first-of-day time handling beyond the `<b>` time. | Delete both chip rules (CSS:4377-4385, 4624-4631). New: plain centred text, no background/shadow, day 12k/600 ink-3 tabular, time 400 beside it, margin `22px 0 8px`. Remove the 4px/12px padding. Labels match (`Today 7:05 AM`, `Yesterday`, weekday). The "New" divider shares `.ch-ms-day` (`NewDivider`, MV:2144-2150; CSS:2769): re-check it after the chip rules go. |
| MSG-210 | PARTIAL | `ThreadDatePill` (T2:12-54) is PHONE ONLY (MP:576; not in `Thread`, MV:2152-2446). Label: first `.ch-ms-day` whose top is above scroller top + 8 (T2:25-31); hidden when any marker sits within 60 px of the scroller top (`inFlow`, T2:28-33); fades out 1000 ms after scroll stops (T2:9,35). CSS: top `env(safe-area-inset-top) + 50px + 8px` (CSS:4517-4521; `--ch-phone-topbar-h` 50, tokens.css:485), desktop `top:140px` (CSS:4540-4543, unused), padding 4 12, 13/500 secondary, glass-strong blur `--ch-glass-blur` = 20 (tokens.css:602), no saturate, `--ch-shadow-float`, opacity transition 260 ms (`--ch-dur-base`), 180 ms in (CSS:4535-4538). No `linked`/PILL_GAP behaviour anywhere (grep PILL_GAP: none). Test pins aria-hidden and "day last passed". | Rewrite `read()`: label = day whose marker has gone above the PILL's own top; `PILL_GAP = 20`: within 20 px of a marker (above or below) set inline `opacity = min(1, near/20)` and class `linked` (`transition:none`); otherwise `is-on` with 1 s hide. Remove the `inFlow` 60 px rule. Mount on desktop too (top 76). Geometry: top `inset + 74` phone (code `inset + 58`), 76 desk (code 140); padding 4 10; blur 16 + saturate 160%. Fade out 250 ms (code 260) fine. |
| MSG-211 | PARTIAL | `ThreadJumpKey` (T2:60-135), on both phone (MP:577) and desktop (MV:2424). Shows when `far` (> 0.9 of scroller height above end, T2:71) OR `unseen > 0` (T2:97). Appears on `pop` via CSS animation (CSS:4560 `ch-msv-jump-in` scale .6, tokens `--ch-dur-spring-pop` 496 / `--ch-ease-spring-pop`), leaves 180 ms `opacity 1 -> 0, scale .8` from the live frame (T2:119-126), re-pops from the live frame if wanted again mid-leave (T2:108-117). 40px glass circle, `ArrowDown size 19` (T2:131; stroke 2.2 not set), phone `right:14` (18 at >=414), `bottom: --ch-ms-comp-h + 12` (CSS:4544-4548, 4581-4584); badge `b` top -6, right -4, min 20x20, padding 0 4, 12/600, mine fill (CSS:4567-4580). Unseen counted in `useThreadAnchor` when NOT within 120 px (use-thread-anchor.ts:82,122) and cleared at 120 px (line 83). aria "Jump to latest" / "Jump to latest, N new" (T2:130). No keyboard ride (`--keyboard-height` absent from the rule; see MOT-KB-1). | Badge: padding 0 5, 12/700, 2px page ring `box-shadow: 0 0 0 2px var(--page)`; icon stroke 2.2. Visibility: only when far (> 0.9h); a badge alone must not show the key (HTML `away`, line 1958). Count threshold 60 px at arrival (HTML `incoming`), clear within 8 px of bottom (code 120). Leave 160 ms (code 180 = `CH_DUR.quick`). Geometry: phone right 14/18 ok; bottom 100 drawn (shot 66) -> compute from composer height + keyboard lift. Ride the keyboard with the composer (new). aria stays; the "N new" suffix is extra and fine. |
| MSG-212 | PARTIAL | DM typing row: desktop `MV:2408-2421`, phone `MP:553-573`; `.ch-msv-typing` inline-flex, padding 12 16, radius xl, bottom-left 6, theirs bg + shadow filter, origin `0% 100%`, 3 dots 7px gap 4 `--ch-typing-dot`, 1200 ms `cubic-bezier(.45,0,.55,1)`, delays 160/320 (CSS:4448-4483, keyframes 4162-4173 `translateY(-3px)`, opacity .4 -> 1 at 28%). `role="status"` aria "{First} is typing" (MV:2414, MP:565). Pop-in CSS animation scale .5 -> 1 on pop (CSS:4458, 4484-4489). Row is outside `ListPresence` (appears/leaves instantly). | Padding 13 15 (code 12 16); radius 19 (code 20). Spec: skip the grow-in when the reader is scrolled away from the bottom (MOT-SEND-11): CSS animation always runs. Reduce Motion today: no pop, dots static at opacity 1 (CSS:4592-4599) ok. |
| MSG-213 | PARTIAL | Group typing: name inside bubble `.ch-msv-bname` (MV:2416, MP:567), `.has-name` column, gap 4, padding `7.5k 12 12` (CSS:4460-4465). Phone renders ONE bubble per typer from `api.typingUserIds` (MP:554-572, falls back to `[""]` = "Someone"). Desktop renders only the FIRST typer: `typistId = api.typingUserIds?.[0] ?? api.typingByConv...` (MV:2264). No caption under the bubble (ok). | Gap 5, padding `7.5k 13 12` (code 4 and `7.5k 12 12`). Desktop: one bubble per typer (loop over `typingUserIds`). Both gated on `api.typing` (= `isOtherTyping`, last-event-wins, UGM:1038-1064): with two typers, one stopping hides both rows; gate on `typingUserIds.length` instead (see Typing notes). |
| MSG-214 | PARTIAL | DM receipt only renders when the other side has read: `(carrier && m.mine && m.seen) && <span class="ch-ms-msg__t ch-num is-pill">Seen {clock(m.at)}</span>` (MV:1466-1470). So "Delivered" never draws, and the time shown is the MESSAGE's sent time (`m.at`), not the read time. CSS `is-pill`: padding 4 8, radius 999, card bg, `--ch-messages-x3` (ring only), 13 secondary, align-self flex-end (CSS:5047-5060). Carrier = newest confirmed own message, not pending/failed/deleted/poll (`src/lib/golf/message-receipts.ts:70-79`). No rise-in, no crossfade. | Always show for the carrier of a DM: "Delivered" until read, then "Seen 8:15 AM" (read time: `ChMsg` has only `seen:boolean`, model.ts:96; `otherParticipantLastReadAt` exists in UGM:547 but is not passed up. DATA/Q-15 decide whether to expose), older: "Seen" / "Seen Wednesday". Style: padding 3 9, card shadow, 12.5k/500 ink-2, margin `6px 2px 0`. Motion: rise 4px in after the bubble lands (MOT-SEND-8); crossfade 180 ms Delivered -> Seen. A pending carrier is skipped (message-receipts.ts:74), so the pill appears when the server confirms, not at 70% of launch. |
| MSG-215 | PARTIAL | Group receipt `SeenByPill` (seen-by.tsx:144-167): paper pill with up to 5 faces (`SeenFaces size 16 max 5`, seen-by.tsx:105-122, pop-in on `pop`), text "Seen by **n** of m" / "Seen by everyone" / "Sent" (`seenByLabel`, message-receipts.ts:39-45). CSS `.ch-msv-seen`: gap 6, padding `4 8 4 4`, margin `6 2 0`, card shadow, 13/500 (CSS:4987-5008); face ring `0 0 0 1px card` and overlap -4 (CSS:4970-4982). Button when `canOpen`, else a span. Only for viewers `seenByAccess` allows (`'sender-and-coaches'`, message-receipts.ts:82; mine only). The file header comment "No faces anywhere" (seen-by.tsx:25) is stale. | Zero readers: copy "Delivered" (code "Sent"), non-interactive pill. Padding `3 9 3 4`, 12.5k/500, face ring 1.5px surface. Everything else matches. Player senders in groups: Q-15 decides. |
| MSG-216 | CONFLICTS | Failed bubble gets a muted fill and dashed outline: `.ch-ms-msg.is-failed .ch-ms-bub {background: --ch-bg-subtle; outline: 1.5px dashed ...}` (CSS:599-606, 3238-3247; keyed by `is-failed` class MV:1304). Line under it is `.ch-ms-msg__fail` pill (MV:1441-1459; CSS:4659-4672): "Not sent." + "Try again" + "Discard" buttons; unknown outcome: "Couldn’t confirm this message sent. Check before sending again." Retry = `api.retry(id)` (Messages.tsx:825-835): offline refuses with CH-1903, failure toasts CH-7004, success has NO toast. | HTML draws the normal green bubble (no `.is-failed` rule) with a danger-colour pill under it: alert icon 14k + `Not delivered · **Try again**` (500; bold on Try again). Flip: remove the muted/dashed bubble styling (CSS:3238-3247 and the base rule), restyle `.ch-ms-msg__fail` danger (`--ch-flag`), copy "Not delivered" (Q-03 default: adopt; change `messages.test.tsx:474,484,491` on purpose), add toast "Sending again" on tap. Keep the unknown-outcome copy and CH-7016/7017 codes (Q-06). Keep "Discard" (spec has none, but it is the only way to drop a failed row; decision for the implementer, default keep as a secondary action). |
| MSG-217 | MISSING | `edited` is mapped into `ChMsg` (Messages.tsx:476, model.ts:99) but nothing renders it: grep `\.edited` in screens/messages finds no JSX. | Add `<span class="edited">Edited</span>` inside the text bubble before the tail: 0.78em, opacity .75, margin-left 6. |
| MSG-218 | PARTIAL | `ReplyQuote` (MV:1573-1596): a button `.ch-ms-quote` above the bubble with `<b>You \| Name</b>` + one-line text; v2 override makes it flat well bg with no shadow (CSS:5919-5920). | Spec: margin `0 4px 4px`, padding `5 10`, radius 12, surface + card shadow, 13 ink-2, max-width 100%. The v2 "flat inside the bubble" override (CSS:5919 "MSG-15") contradicts: flip to card surface + shadow. Keep click-to-scroll behaviour. |
| MSG-219 | DONE | `overflow-wrap:anywhere` on bubbles (CSS:576); header name truncates (`.ch-msp-who b` ellipsis, CSS:1963-1970; desktop `.ch-ms-th__who`). Keys stay 44. | none |
| MSG-220 | (see other slice) PARTIAL | Shell only (content = slice D): photo is a button `.ch-ms-img` (MV:895-901) 242x176, padding 2, radius xl, theirs/mine bg (CSS:4606-4623), inner img radius lg; lazy-loaded by `Attachments` (MV:911-1040) INSIDE `.ch-ms-msg__stack` (MV:1325-1347). Holdable: stack carries the press handlers (MV:1325). aria = `Open {name}` (MV:895), not "Photo from {First}"; img alt = file name, no `role=img` "Photo of ...". No tail (ok). | Seam: slice B owns `.ch-ms-msg__stack`/row/reaction badge/press; slice D owns `Attachments`, `ImageAttachment`, `.ch-ms-img`. Shell deltas: inner padding 2 -> 3, outer stays 242x176; bubble aria "Photo from {First}". Reaction badge is positioned on `.ch-ms-msg__col` (MV:1433), fine. |
| MSG-221 | (see other slice) PARTIAL | File bubble = `<a class="ch-ms-bub ch-ms-bub--file">` (MV:1015-1033; CSS:628-660 legacy): icon tile `.ch-ms-file__ic`, name `<b>`, `kind · size`, download icon. No type-label tile (PDF/MOV 9.5/700), no "mine = white .14 tile". | Seam as MSG-220 (D owns content). B owns only that the row/stack/press/holdable behaviour and corner joins apply to it. |
| MSG-222 | PARTIAL | `HelloCard` (HelloCard.tsx:1-25): `Avatar size="xl"` (64, Avatar.tsx:19) + `<b>` name + `<small>` "{role} · No messages yet" + 3 coach starters (exact copy) or 3 player starters; used on phone (MP:508-516) and desktop (MV:2370) for DMs; groups get `EmptyState "No messages yet"`. A starter calls `onStarter` -> `seed` -> `Composer` fills an empty draft or asks "Replace your draft?" (MV:1866-1875, 2111-2128); never sends. CSS `.ch-msv-hello` (CSS:5202-5240): margin 16 auto, padding `20 16 16`, name `--ch-type-20-strong`, small 15/500, chips 14/500 padding 8 12. | Face 72 (code 64); name 19/700 (code 20/600); sub 15 regular; card padding `22 16 18`, margin `16 0 12`. Starters are right for a coach viewer; the player starters are an addition to the spec (keep). |
| MSG-223 | DONE | Loading: 3 `Skeleton` bars (MV:2358-2367, MP:499-506); error: `InlineNotice CH-7202` with retry (MV:2350-2356, MP:492-497); stale: `CH-7216`. Spec says keep. | none |
| MSG-224 | (see other slice) PARTIAL | `ch-msv-hoverbar role="toolbar" aria-label="Message actions"` with Like/Love/Laugh, Reply, More (MV:1353-1387): 5 keys, glyph 14.4. Rendered on desktop only (`!onActions`). Also rendered on polls. CSS: `top:-20`, `left:0` (theirs) / `right:0` (mine) i.e. above the bubble corner, width 144, height 32.6, padding 2, key 26.9, `--ch-glass-bg` blur (CSS:5657-5700). Aria: "React like"/"Remove like", "Reply", "More message actions". | Position beside the bubble: top -18; theirs `right:-64`, mine `left:-64`. Padding 3, keys 28, `glass-strong` blur 18. Aria exactly "Like", "Love", "Laugh", "Reply", "More actions". Not on polls. Opacity 160 ms / transform 220 ms `--ch-ease` (code 180/180). Hover reveal on `:hover/:focus-within` ok. |
| MSG-301 | PARTIAL | One `Composer` for desktop and phone (MV:1777-2130). v2 pill: `.ch-ms-comp__field` flex, gap 6, `min-height:46`, padding 4, radius xl (20), `--ch-glass-strong`, `--ch-card-shadow` (CSS:4688-4699). No focus-within ring. Phone: the v2 rules win where both set a property (equal specificity 0,2,0 / 0,2,1 and v2 comes later: field CSS:4688 over CSS:2123-2129; textarea CSS:4699 over CSS:2139-2153; the phone composer padding is v2's CSS:5901-5907, `0 12px max(8px, inset-4)`, keyboard-open `8px` CSS:5909). What leaks through from the legacy phone textarea rule is what v2 never sets: `box-sizing:border-box`, `border-radius:22px`, `background-clip:padding-box`, `box-shadow: var(--ch-field-pill-edge)` (CSS:2139-2153), and the legacy `:focus` rule `box-shadow: var(--ch-field-pill-edge-focus)` (CSS:2154-2157, specificity 0,3,1, beats v2). So the phone field is a glass pill containing a textarea that still draws its own 22px edge ring. Desktop: `.ch-ms-comp` padding `8 32 16`, max-width `--ch-ms-measure` 816 (CSS:988-998). | Spec: pill padding 5, gap 6, radius 24, max-width 760 centred, glass-strong blur 24 saturate 170%, float shadow `--ch-shadow-float`; focus-within ring `0 0 0 1.5px color-mix(in oklab, accent-text 55%, transparent)`; `.comp` padding phone `8 10 30` (14 at 430) / desk `10 28 18`. Delete the legacy `.ch-msp-thread .ch-ms-comp*` block (CSS:2109-2178 incl. send rules, dark variants CSS:3213-3225) so the v2 pill is the only look. `--ch-glass-saturate` is 110% (tokens.css:603): saturate(170%) is new. |
| MSG-302 | PARTIAL | `ComposerPlusV2` key (ComposerPlusV2.tsx:66-68): 36 circle `--ch-well-bg-flat`, `Plus size 20`, rotates 45 on open with `transform var(--ch-dur-release) var(--ch-ease-spring)` (CSS:4745-4751; 280 ms, spec 300 ms). aria "Add a photo, file or poll" and it changes to "Close" while open; `aria-expanded` ok. | Spec aria is static "Add photo, file or poll" (drop the "a" and the "Close" swap; `composer-v2.test.tsx:122,144-147` pin today's). Icon ink-2 (code text-primary). The menu itself is slice C/D (MSG-312). |
| MSG-303 | PARTIAL | Textarea `rows=1`, placeholder `Message {firstName \| group title}` (MV:2080), `useAutosize` (MV:1735-1747) no animation; max 132 (v2 CSS:4707 `max-height:132px`,`min-height:36px`, padding`8px 4px 6px`); phone legacy overrides (see MSG-301). aria-label is`Message {label}` (MV:2079), disabled copy "Replies are off until this loads". | Spec aria "Message"; padding `8 4 7`; 16k/1.32 (code 16/21). Keep disabled copy (Q-06). |
| MSG-304 | PARTIAL | Send key exists only when ready: `SendKeyHolder` -> `useSendKeyPop` (MV:1750-1759; T2:343-373): scale .4 -> 1 on `pop` in, shrink from live frame out, `hidden` after; Reduce Motion swaps at once (T2:352-355). `ready` requires `!sending` (MV:1863). Button `onMouseDown preventDefault` so the field keeps focus (NotifyAnyway.tsx:99, always, not only when the keyboard is up). Desktop Enter sends, Shift+Enter newline, not while `isComposing` (MV:2029-2039); phone Return adds a line (`!phone &&`, MV:2036; HTML's own `return` key also inserts "\n", kbPress `ret`), `enterKeyHint` "enter"/"send" (MV:2095). 36 circle accent, `ArrowUp size 17` (NotifyAnyway.tsx:106; spec 18 / stroke 2.4), aria "Send". Notify-anyway adds long-press / chevron (NotifyAnyway.tsx:73-171): extra, keep. | Arrow 17 -> 18 stroke 2.4. The `!sending` gate and `sendingRef` early return (MV:1863,1919) mean the key disappears for a server round trip after every send and a second send cannot start until the first resolves: remove the gate for plain text (the optimistic row is id-safe, see Send path) or MC-01 (two sends 140 ms apart) can never happen. The unknown-outcome / recovery states keep their lock. |
| MSG-305 | PARTIAL | Reply chip `.ch-ms-comp__reply` (MV:2053-2057: "Replying to {name}" / "yourself"; cancel `IconButton` aria "Cancel reply" MV:2056); edit chip "Editing message" (MV:2045-2051, cancel "Cancel edit" MV:2049); file chips `AttachChips` (MV:1626-1658: `FileText 13` + name + remove `aria "Remove {name}"`, no 28x32 tile). All three `ref={chipRise}` -> rise 12 px on `smooth`, Reduce Motion = appears (T2:376-385) ok. CSS shared box: min-height 44, padding `6 8 6 6`, radius 12, glass-strong, card shadow, 13/500 (CSS:4819-4835), reply/edit `fit-content; min-height 0`, key 26 with 44 target (CSS:5018-5040). Container: `.ch-ms-to` (CSS:1273). | Chip text 12.5k/500 (code 13); file chip: 28x32 tile + name ("Lineup · Saturday.pdf"); aria "Remove file", "Cancel" (code "Remove {name}", "Cancel reply", "Cancel edit"; tests at composer-v2.test.tsx:230-236). `.comp__files` padding `4 4 6 46` (aligns under the field, past the plus key); today the chip row has no left inset. Chips use `glass-strong`, spec `surface`. |
| MSG-306 | PARTIAL | Edit flow in the composer (MV:1848-1859 fill+focus+caret; `send()` branch MV:1920-1942): same text closes with no write; success flashes `.ch-ms-bub` `opacity .4 -> 1`, 260 ms `cubic-bezier(.22,1,.36,1)` (MV:1933; Reduce Motion `CH_FADE_MS`). Never a new bubble ok. `EditMessageModal` is mounted with `message={null}` (MV:2440, MP:691), i.e. dead code; `edit` toasts "Message edited" (Messages.tsx:838-842). | Add the "Edited" marker (MSG-217). Spec has no "Message edited" toast: the HTML only flashes. Remove the dead `EditMessageModal` mounts once nothing opens them (slice C owns the menu). |
| MSG-307 | MISSING | Keyboard is handled only as layout: native `keyboardWillShow` sets `body.keyboard-open` + `--keyboard-height` instantly, `keyboardWillHide` sets `0px` (`src/components/providers/CapacitorProvider.tsx:125-130,175-178`); Safari web fallback reads `visualViewport` and publishes the same two things (CapacitorProvider.tsx:205-230); `PhoneScreen keyboardAware` adds `padding-bottom: var(--keyboard-height)` (`shell/PhoneScreen.tsx:73,111`; `styles/shell.css:1590-1592`) and, on Safari, fits the screen to the visual viewport (`data-ch-vv`, shell.css:1595-1599, PhoneScreen.tsx:188-215). The Capacitor `Keyboard` config is `resize:'ionic'` (capacitor.config.ts:86-91), so the WebView is not resized. Nothing in Messages transitions the lift (grep `0.32, 0.72` in screens/messages and messages.css: none). `useThreadAnchor`'s ResizeObserver re-pins with an instant `scrollTop` (use-thread-anchor.ts:94-103). Composer padding while open drops to 8 (CSS:5909). Nothing blurs the field on thread tap (grep `.blur()`: only MV:1974, the unknown-outcome branch). | Build the ride: composer and jump `translate: 0 calc(-1 * lift)` with `transition: translate 480ms cubic-bezier(0.32,0.72,0,1)`; thread bottom padding grows by the lift; at-bottom reader: animate the list `translateY(d) -> 0` composite on the same 480 ms (HTML `kbShow`, line 1871-1881). `lift` = `--keyboard-height` minus the composer's home-indicator padding that drops away (HTML 294 vs 316 = 22). Stop using `padding-bottom` on `.ch-pscreen[data-fw-keyboard-aware]` for this screen (a layout change cannot be transitioned). Add tap-on-thread blur and lower on back. Reduce Motion: no transition. Safari `data-ch-vv` path resizes the screen per visualViewport event: needs the same treatment or a flag to keep it as is. |
| MSG-308 | PARTIAL | Desktop composer = same pill, no keyboard; hint line "Enter to send · Shift + Enter for a new line" + `CharsLeft` (MV:2099-2109) kept; padding/measure see MSG-301. | Spec padding `10 28 18`, max 760; plus menu above plus (slice C/D). The hint line is not drawn in the HTML: keep (today's behaviour, CH-7802). |
| MSG-309 | MISSING | Starter -> `setSeed` -> `applySeed` (MV:1866-1875): fills, focuses, caret at end, never sends. No `pop` scale. | Add `scale .98 -> 1` on `pop` on the pill (`.comp__in`) when a starter fills it (`applySeed` call from a starter only; Remind/Share result also call it, spec only names starters: harmless). |
| MSG-310 | DONE | `DraftStore` (drafts.ts:1-53): `Map` mirrored to `sessionStorage` key `ch.msg.drafts.{userId}`; created once in `Messages.tsx:95`; Composer reads `api.drafts.get(conv.id)` (MV:1823-1827), writes on every change, deletes when empty / on send. | none |
| MSG-311 | DONE | `unavailable` composer (MV:2080, 2099-2102), CH-7217 / CH-7023 notices (MV:2043-2044), offline refuse CH-1903 (Messages.tsx:324-330). Spec: keep. | none |
| MOT-THR-1 | PARTIAL | Desktop bar hairline `::after` opacity, toggled by `scrollTop >= 2` (MV:2253-2262; CSS:5630-5640), transition `--ch-dur-quick ease` = 180 ms. Phone bar has no hairline (ok). | 200 ms. Spec says "when messages are under it" (content actually under the bar): with the bar absolute (CSS:5617) `scrollTop >= 2` is a fair proxy; keep. |
| MOT-THR-2 | PARTIAL | See MSG-210: fade in 180 ms (`--ch-dur-quick`), out 260 ms, hide timer 1000 ms (T2:9,35); no `linked` mode; phone only. | Add `linked` (`transition:none`, opacity = min(1, near/20)); desktop mount. |
| MOT-THR-3 | PARTIAL | `useThreadDragTimes` (use-thread-drag-times.ts:25-82), phone only (MP:442): follow 0.6 (line 9), stop `58 * k` (lines 8,27, `readTypeK`), axis lock after 10 px (line 10; spec 8), ignores `button, a, input, textarea, [role=button]` (line 39; spec `button, textarea, .opt`), back-swipe edge 24 px kept (line 11), release = `translateX(from) -> none` on `settle` WAAPI (lines 69-72), Reduce Motion returns at once. It writes `style.transform` on `.ch-ms-msgs`. | Axis lock 8 px. Release should use composite add / start from the live offset if grabbed again (code cancels animations on down, line 40, and restarts from `current`: equivalent). Note: `useThreadMakeRoom` also animates `.ch-ms-msgs` `transform`; a send during a drag/settle cancels the drag animation (`running.cancel()`, T2:207). |
| MOT-THR-4 | PARTIAL | `useThreadMakeRoom` (T2:175-210), phone and desktop: list height measured per commit + ResizeObserver (T2:179-187), `translateY(d + moved) -> none` on the cause's spring (own send `send`, other's `reveal`, typing row `pop`, removal `smooth`; T2:206), clamped to scroller height, only within 60 px of the end (T2:203), cancels the running animation and folds its live offset (T2:200,207-208), opens at rest when `before === 0` (T2:197). Reduce Motion: no motion. Test pins "one replacing animation". | Spec says composite add on the given spring; the fold-in-one-animation approach gives the same visible result and keeps it on the compositor, so keep. Delta: Reduce Motion should fade the new bubble in (`launch` 120/180 ms) rather than nothing; today only `useSendRise` (phone) and `useReplyFromTyping` (phone) do that. ListPresence's own 8 px rise + fade on every arriving row doubles up with the send/reveal animations (see ListPresence notes). |
| MOT-SEND-1 | MISSING | Same as MSG-307: the composer jumps to its final position the instant `--keyboard-height` is set; no 480 ms ride; the thread re-pins instantly. | See MSG-307. |
| MOT-SEND-2 | DONE | Send key never takes focus: `onMouseDown preventDefault` (NotifyAnyway.tsx:99); Composer refocuses after the send resolves (MV:2008). | none |
| MOT-SEND-3 | MISSING | Nothing lowers the keyboard on a tap in the thread, and back relies on the field unmounting (PhoneScreen exit). | Tap on `.ch-ms-scroll` -> `blur()` the field (phone), lower on the same 480 ms curve via MSG-307's transition. |
| MOT-SEND-4 | DONE | `useSendKeyPop` (T2:343-373): `scale(.4) opacity 0 -> none` on `pop` (`chSpringCurve('pop')`, 496 ms), out = shrink from the live frame then `hidden`; Reduce Motion swaps at once. `hidden` => `display:none` (CSS:4709-4711). | none |
| MOT-SEND-5 | PARTIAL | Field height changes without animating (`useAutosize`, MV:1735-1747; no CSS transition on the textarea); 132 cap. `composer-v2.test.tsx:113-119` pins "no height transition". | The pin-to-bottom while growing uses `NEAR_END_PX` 120 vs spec 24 (see MSG-203). |
| MOT-SEND-6 | MISSING | See "What the code animates today on send" below. There is no flight clone, no `launch` spring, no green-fill-under-words fade, no tail grow-in, no arrow motion, no hidden-until-landed real bubble. | Build per MOTION.md MOT-SEND-6/7; gate on MC-01, MC-02, MC-11 (Q-19: if the clone teleports or blinks, fall back to moving the real bubble and tell the owner). |
| MOT-SEND-7 | PARTIAL | `useSendRise` (T2:312-340), phone only (MP:447): after the optimistic row mounts, the REAL bubble (`.ch-ms-bub, .ch-ms-img`) animates `translate(f.left - 9 - b.left, f.bottom - b.bottom - d) scale(.96)` + `opacity .85` -> none/1 in ONE WAAPI animation on `chSpringCurve('send')` (700 ms), origin `100% 100%` (T2:333-338). Bubble is visible with its green fill and white text from frame 1 at 85% opacity. | `launch` spring missing in `CH_SPRINGS` (lib/motion.ts:70-81; Q-04). Spec: vertical on `launch` (828 ms), horizontal on `--ch-ease` over `round(launch.ms*0.62)`, scale .92 -> 1 on `pop` origin `0% 100%` (text clone .96), non-text bubbles also opacity .6 -> 1 over 150 ms linear, multi-bubble stagger `(count-1-n)*40 ms`, offset -8 px per step. Desktop has no send animation at all (`Thread` never calls `useSendRise`, MV:2218-2221). |
| MOT-SEND-8 | MISSING | Receipt (DM) appears with the row, or when the pending flag clears (message-receipts.ts:74); no 260 ms `translate 0 4px, opacity 0 -> 1` delay of 70% of launch; field placeholder does not fade back (draft clears, field is simply empty). | Receipt pill animation (260 ms `--ch-ease`, delay `round(launch.ms*0.7)` = 580) on the last sent bubble only; textarea `opacity 0 -> 1` 220 ms linear, delay 140 ms. |
| MOT-SEND-9 | DONE | List glide on send is `useThreadMakeRoom` on `send` spring (T2:206), clamped, folds a second send (T2:200-208). Both devices. | none |
| MOT-SEND-10 | PARTIAL | Group faces pop in as readers arrive (`SeenFaces` on `pop`, seen-by.tsx:105-122) ok; the old inline receipt crossfade uses `chTween('quick')` 180 ms (MV:1473-1477 / seen-by.tsx:63-80). DM "Seen" has no crossfade (plain text swap). | DM Delivered -> Seen crossfade 180 ms (needs MSG-214). |
| MOT-SEND-11 | PARTIAL | Typing row grows from the tail corner: CSS animation `ch-msv-typing-pop`, scale .5 -> 1, opacity, origin `0% 100%`, on `pop` (CSS:4448-4489). List makes room on `pop` (T2:206). Not skipped when the reader is scrolled away; Reduce Motion: no animation, dots held (CSS:4592-4599) ok. | Skip the grow-in when scrolled away from the bottom (needs a JS check or class from `useThreadAnchor.atEnd`); Reduce Motion should fade in 120/180 ms. |
| MOT-SEND-12 | PARTIAL | `useReplyFromTyping` (T2:226-263), PHONE only (MP:445): reads typing row size while shown, on arrival animates the new theirs bubble `scale(sc) opacity 0 -> scale(sc+(1-sc)*.35) opacity 1 @35% -> none`, `sc` clamp .45-1, origin `0% 100%`, `reveal` (T2:252-261); within 60 px of end only; Reduce Motion = fade `CH_FADE_MS`. Values match the HTML. | Desktop does not call it (MV:2218-2221). ListPresence also fades/rises the same row (opacity 0 + `translateY(8px)`, 260 ms) at the same time: the HTML has no row-level animation, so the reveal can look doubled. MC-02 untested today. |
| MOT-JMP-1 | PARTIAL | See MSG-211: appear on `pop` from `scale(.6)`, leave 180 ms to `scale(.8)` (spec 160), live-frame carry both ways (T2:96-127) so MC-09 should pass; Reduce Motion: fade (leave `gone = 'none'`, T2:120; appear is a CSS animation killed by CSS:4592-4594). | 160 ms. Appear under Reduce Motion fades 120/180 ms (today instant). |
| MOT-JMP-2 | MISSING | Badge `<b className="ch-num">` rendered statically (T2:132); no CSS animation on `.ch-msv-jump b` (CSS:4567-4580). | `scale .4 -> 1` on `pop` the first time the badge appears (not on each increment). |
| MOT-JMP-3 | PARTIAL | `useSpringToEnd` (T2:141-165), PHONE only (MP:444); desktop jump uses `anchor.toEnd` instant (MV:2424). 921 ms hard-coded (T2:155) on `chSpringAt('reveal', t)`, stops on wheel/touchstart/pointerdown (T2:148-152), Reduce Motion = straight to end. Target is `el.scrollHeight - el.clientHeight` re-read each frame (T2:160), which a running make-room transform inflates (the HTML computes the bottom from layout only: `maxTop`, line 1951). | Use `toEnd`'s transform-aware end (use-thread-anchor.ts:49-64) for the target; use it on desktop too; derive the 921 ms from `chSpringCurve('reveal').ms`. `usePanelSmoothScroll(scroller, {duration 1.2})` on the desktop thread (MV:2226) is Lenis wheel smoothing (`lib/smooth-scroll.ts`); the jump glide must cancel it too. |
| MOT-KB-1 | MISSING | See MSG-307 / MOT-SEND-1. Jump key also ignores the keyboard (CSS:4544-4548 has no `--keyboard-height`; it is `position:absolute` in the fixed `.ch-pscreen`, whose `padding-bottom` does not move absolute children), so with the keyboard open the key sits under the keyboard. Toasts do add it (shell.css:1424,1429). | Include the lift in the jump key's offset (ride with the composer). |
| MOT-KB-2 | DONE | Device simulation: no fake keyboard exists in the code, which is what the spec asks for. | none |
| MOT-X-1 | MISSING | No scroll-linked pill opacity; grep `PILL_GAP`/`linked` in src: none. | See MSG-210. |
| MOT-X-9 | DONE | Edit saved: `.ch-ms-bub` `opacity .4 -> 1`, 260 ms, `cubic-bezier(.22,1,.36,1)` (= `--ch-ease`) (MV:1933). Reduce Motion uses `CH_FADE_MS` 180 (spec n/a). | none |
| MOT-X-10 | PARTIAL | Delete: confirm in `DeleteMessageModal` (MV:2500-2541, slice C), `api.remove` -> optimistic removal (UGM:1326-1340); the row leaves through `ListPresence` `LEAVE`: `height:0, opacity:0, padding/margin 0, overflow clip`, height/margins on `smooth` (462 ms), opacity 180 ms (`ui/ListPresence.tsx:130-142`). Toast "Message deleted" (Messages.tsx:846-849). | Spec: row `opacity 1 -> 0, scale .92` 180 ms fill forwards, THEN re-render and the list glides by transform on `smooth` (`useThreadMakeRoom` already glides on `smooth` for removal, T2:206). `LEAVE` animates layout (height/margin), which the house rule "only transforms and opacity move" forbids; add a thread-specific leave (`opacity+scale .92`, no height) via a `leave` variant on `ListPresence`. Toast copy "Deleted for everyone". Note: the row stays mounted during the exit, so `useThreadMakeRoom` measures no height change at commit time; check the glide fires. |
| MOT-X-11 | PARTIAL | Desktop conversation switch uses `<Swap swapKey={pane.turn} className="ch-ms-pane">` (MV:3304-3313; `ui/Swap.tsx`): kind `settle` = incoming copy `opacity` over `--ch-dur-base` (260 ms) + 6 px rise on the `settle` spring, outgoing fades 180 ms. | Spec: thread content `opacity 0 -> 1, translateY(6px) -> 0`, 260 ms `--ch-ease`, no outgoing crossfade. Close; `Swap` `mode="popLayout"` already drops the old copy. Decide whether to keep `Swap` (shared) or special-case. |
| MOT-X-16 | PARTIAL | The "To" field uses the browser's own caret: desktop `<input aria-label="Search people">` in `NewMessagePane.tsx:63-64`, phone `<input className="ch-msp-to__in">` in `MessagesPhone.tsx:1090-1100` (`PhoneNewMessage`). No custom caret, no `caret-color`, no `steps(1)` anywhere (grep `caret`, `steps(1)` in `messages.css` and `screens/messages/*.tsx`: only comments about moving the caret in the composer, MV:1812,1848). SETTLED ruling 21 (Nov 4) explicitly chose the native caret ("M-MSG-32 uses the browser's own caret"). | The new SPEC (MSG-702) wins: a blinking caret 1.5 x 20, accent-text, `steps(1)` 1 s loop, kept blinking under Reduce Motion (MOT-R-2). Seam: the To field is slice D's (`NewMessagePane.tsx`, `PhoneNewMessage` MP:1078-1110, `.ch-msp-to*` CSS:2544-2600, `.ch-msv-tocard`); the minimum is `caret-color: var(--ch-accent-text)` on those inputs, a drawn caret needs a mirrored-text measure. Not a slice B file; listed here because MOT-X-16 was assigned to B. |

#### Supporting findings (send path, typing, receipts, keyboard, launch, ListPresence)

The table above is one table in ID order (MSG-201 to MSG-311, then the MOT
rows).

**Send path end to end (text).**

1. `Composer.send` (MV:1918-2009). Gates: `ready` (MV:1863) needs `!sending &&
   !checking && !checkFailed && !unavailable`, and the function returns if
   `sendingRef.current` (MV:1919). It clears the draft (`setDraft("")`, MV:1948)
   and files, calls `api.onTyping(false)` (MV:1950), then `await api.send(text,
   parentId, {notifyAnyway?})` (MV:1955-1960). Haptics: success after a true
   result (MV:1991), `warning` for partial/unknown, `error` otherwise (MV:1997).
   Reply chip clears only on success (MV:1989). Field is refocused at the end
   (MV:2008).
2. `api.send` in `Messages.tsx:752-770` calls `msgs.sendMessage`
   (UGM:1147-1227). It builds ONE client UUID (`generateClientMessageId`,
   UGM:407-425; falls back to a v4-shaped string), appends an optimistic row
   `pending:true` with `created_at = new Date()` synchronously (UGM:1157-1182),
   then `sendGolfMessage(conversationId, content, optimisticId, replyToId,
   {notifyAnyway})` (server action `src/app/actions/messages.ts:809`, a `'use
   server'` file; it also fans out push via `notifyGolfMessageRecipients`)
   wrapped in `withOneTransportRetry` (750 ms, UGM:23,1195-1202).
3. Idempotency: the client id is written as the real `golf_messages.id`; a
   duplicate attempt collides on the primary key (23505) and the action reports
   success (UGM:1186-1194;
   `src/test/actions/send-message-duplicate-key-equivalence.test.ts`). The
   realtime INSERT echo replaces the optimistic row IN PLACE by id
   (`applyRealtimeMessageInsert`, UGM:340-399), so a sent bubble never remounts;
   `pending` clears when the action answers (UGM:1217-1218).
4. Failure: the row stays, `sendFailed:true` + `sendOutcome` `'refused'`
   (answered with an error) or `'unknown'` (transport error text,
   `classifySendFailure`, UGM:1127-1145) (UGM:1127-1131,1208-1226).
   `ChMsg.failed` maps it (Messages.tsx:475). The toast in
   `Messages.tsx:757-767` agrees with the bubble. Failed rows are held across a
   refetch (UGM:840-848).
5. Retry: `api.retry(id)` (Messages.tsx:825-835) -> `msgs.retryMessage(id)`
   (UGM:1249-1283): reuses the SAME id (so pressing twice or racing a committed
   attempt cannot duplicate), clears the failed flag optimistically
   (`pending:true`), restores it if it fails again; offline refuses first with
   CH-1903. `discard` removes only `sendFailed` rows (UGM:1296-1299).
6. Attachments are a separate path (`api.sendFiles`, Messages.tsx:771-823,
   `useMessageAttachments({recoverable:true})`): outcome `true | 'partial' |
   'unknown'`, unconfirmed sends lock the composer (CH-7023) and recover through
   `getPendingAttachmentSend`. Not optimistic: no bubble until the server row
   arrives. A photo/file/poll "launch" (MOT-SEND-7 non-text) therefore has no
   optimistic bubble to fly today; polls call `insertConfirmed` after the action
   answers (UGM, Messages.tsx:889-910).
7. First message from New message: `autoSend` effect calls `send()` on mount of
   the thread's composer (MV:2014-2021); `useSendRise`/`useThreadMakeRoom` skip
   because `before === 0` (T2:197, 318).

**What the code animates today on send ("words become the bubble" delta).**

- Phone only. On the commit that adds the optimistic row (same tick as
  `setDraft("")`, so the textarea has already shrunk to one row):
  `useThreadMakeRoom` (MP:443) moves the whole list by `translateY(d)` on
  `send`; `useSendRise` (MP:447, T2:312-340) then animates the real bubble from
  the field rect to its slot as ONE transform (`translate(dx,dy) scale(.96)` ->
  none) with `opacity .85 -> 1`, on `chSpringCurve('send')` (visualDuration .42,
  bounce .12, 700 ms), origin `100% 100%`. `dx = f.left - 9 - b.left` (the `-9`
  matches the HTML), `dy = f.bottom - b.bottom - rowHeight`.
- Also running on the same row: `ListPresence arrive="rise"` fades the row `0 ->
  1` and rises it 8 px over 260 ms on `--ch-ease` (ui/ListPresence.tsx:127-129),
  and the send key shrinks (`useSendKeyPop`).
- NOT present: a clone (`flyText`), the `launch` spring, a
  typed-words-fade/green-fill-comes-up 160 ms stage (the bubble is green from
  frame 1), x on a separate faster curve (path is a straight diagonal, not
  curved into the right edge), tail grow-in, send-arrow lift, real bubble hidden
  until landing, receipt wait (70% of launch), textarea opacity return,
  multi-bubble stagger, Reduce Motion crossfade of the bubble beyond the 180 ms
  fade in `useSendRise` (T2:324-327).
- Desktop: nothing beyond make-room and the ListPresence rise.

**Typing presence.**

- Broadcast: `Composer` textarea `onChange` calls `api.onTyping(true)` per
  keystroke and a 2500 ms idle timer calls `onTyping(false)` (MV:2083-2092);
  `api.onTyping` = `msgs.sendTypingStatus` (Messages.tsx:729): broadcast
  `typing` `{userId,isTyping}` on `golf-conversation:{id}` (UGM:965,1101-1114),
  throttled to one `true` per 500 ms; `sendMessage` and the composer's send both
  send `false`.
- Open thread listener: same channel (UGM:1034-1068). Per-typer timers set
  `typingUserIds` (expiry `typingExpiryMs`, 5000 from Messages.tsx:165; hook
  default 3000). `isOtherTyping` is last-event-wins and also has its own timer;
  a message INSERT from someone else clears `isOtherTyping` but NOT
  `typingUserIds` (UGM:988-992). The thread rows are gated on `api.typing`
  (`isOtherTyping`), so with two typers in a group one `false` event hides every
  bubble. Because the sender sends `false` after 2.5 s idle, rows/bubbles clear
  at about 2.5 s, not 5 s; the 5 s expiry is the backstop.
- Rows and pins: `useTypingByConversation` (use-typing-by-conversation.ts:1-65)
  joins `golf-conversation:{id}` for up to 30 conversations on screen EXCEPT the
  open one (two subscriptions to one topic from one client break the first),
  listens to `typing` only, ignores the viewer, expires each typer 5 s after
  their last event (`TYPING_EXPIRY_MS`, `typersAt` is pure and tested).
  Consequence: a typer only broadcasts on the channel their own thread hook
  joined, i.e. while THEIR thread is open on that conversation. Cleanup removes
  and re-creates every channel when the watched set changes (key join, line 25),
  which can race with the thread hook's subscribe on open.
- Known-id problem: `api.typingUserIds` is empty for a DM; the phone falls back
  to `conv.memberIds[0]` (MP:554), desktop to `typingByConv` (MV:2264).

**Read / receipt writes.**

- Open: `fetchMessages` ends with `await markGolfMessagesAsRead(conversationId)`
  unless `deferMarkRead` (auto-opened deep link; released by `select` ->
  `msgs.markRead()`, Messages.tsx:277-285; UGM:860,1361-1373). Arrival while
  open: `markReadSoon` debounced 900 ms, only if `document.visibilityState ===
  'visible'` (UGM:31,946-962,993). Row menu "Mark as read" -> `setRead` ->
  action + `refetch` + `badges.refetch` (Messages.tsx:1026-1040). Server action:
  `src/app/actions/messages.ts:837` -> `markMessagesAsRead`.
- Reading others' reads: realtime UPDATE on `golf_conversation_participants` ->
  `readMarks` (monotonic) and `otherParticipantLastReadAt` for DMs
  (UGM:998-1018); refetch after a dropped channel (UGM:1074-1085). `ChMsg.seen`
  = `isRead` (viewer-relative, UGM:894-908). No per-message read time reaches
  the UI.

**Keyboard.** See MSG-307. Summary: three sources (Capacitor
`keyboardWillShow/Hide`, Safari `visualViewport` in `CapacitorProvider`,
per-sheet `useSheetKeyboardFit` in `ui/sheet-keyboard.ts`) publish
`--keyboard-height` + `body.keyboard-open` with no animation; Messages consumes
it only through `PhoneScreen`'s `padding-bottom`, the composer's
`padding-bottom:8px` rule (CSS:5909) and the toast offset. Capacitor's own
`scrollIntoView` on `keyboardWillShow` is skipped for `[data-fw-keyboard-aware]`
screens (CapacitorProvider.tsx:163-172).

**ListPresence arrive behaviour.** The thread wraps its rows in `<ListPresence
key={conv.id} flip={false} arrive="rise">` (MV:2378, MP:522). `PresenceRow`
arrivals (any row whose key is new after first paint: your sent bubble, an
incoming bubble, a day marker, the New divider) run `initial {opacity:0,
transform:translateY(8px)}` -> `{1, 0}` over `CH_DUR.base` 260 ms `CH_EASE`
(ui/ListPresence.tsx:127-129), then clear their inline styles (`settle`, line
83-85). Reduced motion: no animation. Exits use `LEAVE` (height/margins
collapse). First paint never animates and a different `conv.id` is a new list.
Implication for the new send choreography: the row's 8 px rise + fade runs under
the real-bubble flight and would show the bubble early (MOT-SEND-6 wants it
hidden until the flight lands) and doubles the reply reveal (MOT-SEND-12). The
send bubble and the reply bubble need to opt out of `rise` (a prop on
`PresenceRow` or `arrive="none"` for mine / for a message that replaces a typing
row), while a message that arrives with the reader scrolled away should still
just appear (HTML: no animation, badge only).

**Other hooks in the slice.**

- `useThreadAnchor` (use-thread-anchor.ts:21-165): opens at the end; settle hold
  700 ms (line 9, 127-164, stops on first input or a held search hit); follows
  arrivals only if `nearEnd` (120 px) or the message is yours (line 121); typing
  row follows only if near end (line 118); ResizeObserver re-pins on
  viewport/content height changes for a reader at the end (lines 94-103);
  `unseen` counter (lines 45,122); `toEnd` is transform-aware (lines 49-64). It
  is shared with `useFocusMessage` (search hits pause it).
- `composer-inset.ts` (39 lines): sets `--ch-ms-comp-h` (border-box height of
  the newest live composer footer) on `.ch-root` via ResizeObserver; consumed by
  toasts (`ui.css:423`, `shell.css:1429`) and the jump key (`CSS:4548`). It does
  not know the keyboard.
- `drafts.ts`: see MSG-310.

### Code map

**`screens/messages/MessagesView.tsx` (3,389 lines).** Thread and composer code
is one contiguous block, lines 1040-2446, plus the desktop shell at 3257-3389.
Everything else in the file belongs to other slices.

| Range | Name | What | IDs |
| --- | --- | --- | --- |
| 1-150 | imports | note it imports `useThreadAnchor`, `useComposerInset`, `BubbleTail`, `useThreadMakeRoom`, `ThreadJumpKey`, `useChipRise`, `useSendKeyPop` | - |
| 152-155 | `THREAD_SCROLL_DUR` 1.2 | desktop wheel glide for the thread | MOT-JMP-3 note |
| 165-175 | `REACTIONS`, `REACTION_ICON` | reaction set (C: overlays) | shared |
| 177-340 | `ChPendingAttachmentSend`, `ChAttachmentRecovery`, `ChMessagesApi` | the API contract: `send`, `sendFiles`, `retry`, `discard`, `edit`, `remove`, `typing`, `typingUserIds`, `onTyping`, `drafts`, `receipts`, `msgs*` | send path, typing, drafts (B); other fields belong to A/C/D |
| 360-745 | `ConvRow`, `RowMuteModal`, `TypingMini`, `ConvRowButton`, `Rail` ... | inbox/rail | NOT B |
| 745-873 | `popBadge`, `ReactionChip` | reaction badges | C |
| 875-909 | `ImageAttachment` | photo shell | D (seam MSG-220) |
| 911-1040 | `Attachments` | attachment loader and file rows | D (seam MSG-220/221) |
| 1045-1108 | `useLongPress` | 450 ms hold, swipe-to-reply, context menu | C (hold); the swipe-to-reply is also a B gesture |
| 1110-1534 | `Bubble` | the message row: deleted tombstone (1265-1283), avatar slot (1308-1322), `.ch-ms-msg__stack` + text bubble + name + tail (1325-1347), hover bar (1353-1387), reaction bar (1389-1420, desktop `picking`), reactions (1433-1438), failed line (1441-1459), receipts (1460-1480), notified-anyway (1483-1489), time (1491), `HoldLift` mount (1492-1532) | MSG-204-208, 214-217, 224; hold/reactions/menu items inside it are C |
| 1540-1563 | `MessageText` | link parts | B |
| 1567-1596 | `replyName`, `ReplyQuote` | quote chip | MSG-218 |
| 1599-1623 | `addAttachments`, `useAddAttachments` | attach limit toast | D |
| 1626-1658 | `AttachChips` | file chips | MSG-305 |
| 1665-1699 | `AttachButton` | legacy paperclip, used only by `PhoneNewMessage` (MP:1172) | D |
| 1702-1732 | `ComposerPlus` | LEGACY plus menu, no callers (dead) | delete candidate |
| 1735-1747 | `useAutosize` | field height | MOT-SEND-5 |
| 1750-1759 | `SendKeyHolder` | send key pop | MOT-SEND-4 |
| 1762-1775 | `CharsLeft` | counter | B |
| 1777-2130 | `Composer` | whole composer: recovery/unconfirmed state (1816-1829, 1893-1917), draft (1821-1828), edit seed (1848-1859), chip rise (1860), `ready` (1863), seed/replace-draft (1866-1885), `send` (1918-2009), auto-send (2014-2021), notify-anyway (2023-2028), `onKey` (2029-2039), JSX 2041-2129 (notices 2043-2044, edit/reply chips 2045-2058, `AttachChips` 2063, field 2074-2096, send 2097, hint 2099-2109, replace-draft Modal 2111-2128) | MSG-301-311, MOT-SEND-2/4/5, send path |
| 2136-2150 | `useNewDivider`, `NewDivider` | "New" divider | B (shares `.ch-ms-day`) |
| 2152-2446 | `Thread` (desktop) | state 2166-2186, anchor/make-room/smooth-scroll 2216-2227, bar 2273-2327, searching bar 2328-2332, scroller 2333-2406 (states 2340-2372, `ListPresence` 2378, `Bubble` 2388), typing row 2408-2421, `ThreadJumpKey` 2424, `Composer` 2425-2437, modals 2440-2441 | MSG-202, 203, 210 (missing), 211-213, 222-224, MOT-THR-1/4, JMP |
| 2449-2541 | `EditMessageModal`, `DeleteMessageModal` | confirm modals | C (EditMessageModal dead) |
| 2543-2750 | Leave/Delete conversation/Remove/Add members modals | D | NOT B |
| 2754-2940 | `Details`, `MuteControl` | D | NOT B |
| 2941-3255 | `NewMessage` dialog | D | NOT B |
| 3257-3389 | `MessagesDesktop` | pane switch `Swap` (3304-3313) holds the thread: MOT-X-11; rail and details around it are A/D | MOT-X-11 |

Seams for four implementers: (a) `Bubble` is one 425-line function that mixes B
(row/bubble/tail/receipt/failed/time/hover bar) with C (long-press, `HoldLift`,
reaction bar, menu items, double-tap) and D (`PollCard`, `Attachments`); split
by extracting `BubbleBody`, `BubbleReceipt`, `BubbleHoverBar` first. (b)
`Composer` is single-owner (B); the plus menu is a child component
(`ComposerPlusV2`, owner C/D) and `AttachChips` is B. (c) `Thread` is the
desktop twin of `PhoneThread`: both repeat the scroller JSX, day rows, typing
row, jump key and composer mount; extract a shared `ThreadScroller` before four
people edit both. (d) `MessagesView.tsx` imports `ConversationSearch`,
`MembersCard` etc. from `details-v2`, so a type-only cycle is avoided only
because `MessagesScreen.tsx` picks desktop vs phone (MessagesScreen.tsx:13).

**`screens/messages/MessagesPhone.tsx` (1,270 lines).**

| Range | Name | IDs |
| --- | --- | --- |
| 128-243 | `MessagesPhone` (stack of inbox, thread, details, new, announcement; `AnimatePresence`) | MOT-LIST/DET (not B); mounts `PhoneThread` at 183-197 |
| 245-358 | `PhoneInboxV2` | A |
| 360-364 | `GroupMark` | B (bar mark, MSG-201) |
| 366-698 | `PhoneThread` | B: state/reply/edit 389-421, hooks 433-447 (`useThreadAnchor` 435, `useThreadDragTimes` 442, `useThreadMakeRoom` 443, `useSpringToEnd` 444, `useReplyFromTyping` 445, `useFaceFlight` 446, `useSendRise` 447), bar 463-478, scroller 481-574 (states 489-521, `ListPresence` 522, `Bubble` 532, typing rows 553-573), `ThreadDatePill`/`ThreadJumpKey` 575-578, `Composer` 579-596 (`key={conv.id}`, `phone`, `autoSend`), `HoldLift` 599-648 (C), legacy `Modal open={false}` "Message" sheet 642-690 (dead, C to delete), Edit/Delete modals 691-692, `seenList` 693 |
| 700-765 | `SeenSheetRow`, `ActingSeenMeta`, `PollSheetRows`, `SheetRow`, `Panel` | C |
| 767-909 | `PhoneDetails` | D |
| 911-1201 | `PhoneNewMessage` (own textarea composer using `ch-ms-comp` classes, `AttachButton`, `CharsLeft`) | D; shares composer CSS with B |
| 1203-1270 | `PhoneAnnouncementForm` | NOT B |

**`screens/messages/thread-v2.tsx` (385 lines), all B except `useFaceFlight`.**
`ThreadDatePill` 12-54 (MSG-210/MOT-THR-2/X-1), `ThreadJumpKey` 60-135
(MSG-211/MOT-JMP-1/2), `useSpringToEnd` 141-165 (MOT-JMP-3), `useThreadMakeRoom`
175-210 (MOT-THR-4/SEND-9), `BubbleTail` 213-219 (MSG-206), `useReplyFromTyping`
226-263 (MOT-SEND-12), `noteTappedFace` 269-274 + `useFaceFlight` 280-309
(MOT-LIST-1; slice A/nav), `useSendRise` 312-340 (MOT-SEND-7), `useSendKeyPop`
343-373 (MOT-SEND-4), `useChipRise` 376-385 (MOT-ATT-3; also used by
`AttachChips` and the reply/edit chips). Shared with other slices:
`useFaceFlight`/`noteTappedFace` (push), `useChipRise` (MOT-ATT-3).

**Other files.**

- `use-thread-anchor.ts` (165): B only (also read by `use-focus-message.ts`).
- `use-thread-drag-times.ts` (82): B only (`MOT-THR-3`).
- `use-typing-by-conversation.ts` (65): typing for rows/pins; consumers are
  slice A (rows) but the realtime/expiry logic is B's typing item.
- `composer-inset.ts` (39), `drafts.ts` (53), `HelloCard.tsx` (25),
  `NotifyAnyway.tsx` (171, `SendCluster` and `useSendHold`): B (MSG-222, 304,
  310). `ComposerPlusV2.tsx` (102): plus key is B (MSG-302), the menu and polls
  are C/D.
- `model.ts`: `threadItems` 198-211, `dayLabel` 167-173, `ChMsg` 91-109 (B).
- `Messages.tsx` (1094): container wiring of send/retry/discard (752-835),
  typing (727-729, 692), receipts (866), drafts (95), `markRead` (277-285,
  1026-1040).
- `src/hooks/golf/use-golf-messages.ts` (2,286): `sendMessage` 1147-1227,
  `retryMessage` 1249-1283, `discardFailedMessage` 1296-1299, realtime channel
  965-1086, `sendTypingStatus` 1101-1114, `markRead` 1361-1373.
- `src/app/actions/messages.ts` (`'use server'`): `sendGolfMessage` 809-811,
  `markGolfMessagesAsRead` 837-847. It exports `interface MessageSearchResult`
  (line 1467), a type export from a `'use server'` file that works only because
  it is erased; do not add value exports of non-functions.
- `src/components/providers/CapacitorProvider.tsx` (keyboard publishing
  106-230), `shell/PhoneScreen.tsx` (30-115 keyboard-aware, 188-215 Safari fit),
  `ui/sheet-keyboard.ts`.
- `ui/ListPresence.tsx` (142), `ui/PhoneBar.tsx` (shared bar chassis),
  `lib/motion.ts` (springs; `launch` goes into `CH_SPRINGS` at lines 70-81,
  `CH_EASE_SHEET` = the iOS keyboard curve already exists at line 83).
- CSS `styles/messages.css` (5,958 lines): legacy thread/composer 384-1100,
  legacy phone block 1676-2190 (thread bar 1941-2020, thread 2028-2107, composer
  2109-2178), v2 inbox 4068-4375, v2 thread/bubbles 4376-4636, v2 thread
  photo/day/desktop bar 4600-4690, v2 composer 4673-4835, v2 lift/hold 4836-4960
  (C), receipts/chips 4962-5060, polls/empty/hello 5090-5290, hover bar
  5657-5720, phone composer overrides 5895-5915, `.ch-msp-who` 5916-5918. Legacy
  and v2 rules coexist; there is no flag any more (`data-ch-ms-v2` is always on,
  `MessagesScreen.tsx:36`).

### Tests

Existing tests that pin behaviour in this slice, and what legitimately changes
(none should be deleted; update the assertion to the new requirement):

| Test | Pins | Change for v2? |
| --- | --- | --- |
| `screens/messages/__tests__/thread-v2.test.tsx` | drag follows 60%, stops at 58, rightward = 0 | No (axis slop 10 -> 8 is not asserted). |
| `screens/messages/__tests__/thread-drag-k.test.tsx` | 58*k at XXL | No. |
| `screens/messages/__tests__/thread-make-room.test.tsx` | opens at rest; a new message moves the list by transform as one replacing animation | No if the replacing-animation design stays; update only if you switch to `composite:'add'`. |
| `screens/messages/__tests__/thread-v2-traps.test.tsx` | jump key: shows past 0.9, hidden within, "shows at the end when something arrived unseen, with the count", calls jump, scroll toggles it; date pill: "reads the day last passed, not the one coming", aria-hidden, none with no day above; "conversation bar stays on its own bar" CSS-scan tests | Yes: the "unseen at the end shows the key" test contradicts the spec (key only when > 0.9 away; badge counts while away); the date-pill label test changes with the PILL_GAP rewrite and needs a `linked` case; keep the aria-hidden and bar-isolation cases. |
| `screens/messages/__tests__/composer-v2.test.tsx` | send key hidden/shown/hidden, no mic, display:none by stylesheet; six lines then scroll, 132 cap, no height transition; plus menu rows and aria "Add a photo, file or poll" + label "Close" while open; Enter/Shift+Enter/phone Return; chips (reply text "Replying to Ava", "Cancel reply", edit chip, "Editing message", same-text edit closes with no write) | Yes, on purpose: plus aria becomes "Add photo, file or poll" with no "Close" swap (lines 122,143-147); chip cancel labels "Cancel" / file "Remove file" (lines 230-236, and `AttachChips` assertions elsewhere). Keep Enter rules. |
| `__tests__/messages.test.tsx` (lines 470-500, 7016/7017/7004) | failed-send copy `/Not sent/`, "Try again" button, CH-1903 offline refuse | Yes: Q-03 default changes "Not sent" to "Not delivered"; change the regex on purpose, keep the CH codes and the retry/offline assertions. |
| `__tests__/thread-anchor.test.tsx` (`describe useThreadAnchor`, `useThreadAnchor · layout changes`) | opens at the end and follows while there; a scrolled-up reader stays and arrivals are counted; own message goes to the end; `is-scrolled` class; away-from-end flag; composer/keyboard resize keeps the end visible; the 700 ms settle hold and that it runs no frame loop | Yes only if `NEAR_END_PX` (120) changes to 24/60 or the 8 px clear threshold is added. |
| `__tests__/messages-drafts.test.ts` | `DraftStore`: survives a reload for the same user, gone once sent or cleared; another account never sees it; refused write / malformed storage tolerated (it does not test thread switches) | No. |
| `screens/messages/__tests__/typing-by-conversation.test.tsx` | `typersAt` expiry, channel cap, own id ignored | No (unless the open-conversation exclusion changes). |
| `screens/messages/__tests__/seen-pill.test.tsx`, `__tests__/messages-seen-by.test.tsx`, `screens/messages/__tests__/messages-player-session.test.tsx` | "Seen by n of m", at most 5 faces, "Sent, then Seen by everyone", player sees "Seen by" | Yes: zero readers: "Sent" -> "Delivered" (message-receipts.ts:41); the player-session test asserts `/Seen by/` for a player sender, which Q-15 may change. |
| `src/clubhouse/__tests__/logic.test.ts` lines 262-270 | `threadItems`: "groups a sender's run within five minutes and puts day separators between days" (expects `aF bL cFL`: a message 18 minutes later starts a new run) | Yes: runs ignore the time gap and exclude polls (HTML `joins`, line 1517), so `c` would join `a, b`. `screens/messages/__tests__/model.test.ts` has no thread-run test (it covers `untilLabel`, `searchSnippet`, `linkParts`, `firstUnreadId`, `isGroupRow`). |
| `src/hooks/golf/__tests__/use-golf-messages.{send-integrity,send-outcome,failed-send,quoted-reply,notify-anyway,read-marks,defer-mark-read,single-load}.test.ts*` | optimistic id reuse, 23505 equivalence, unknown vs refused, retry reuses id, read-mark rules | No: the send path is not being changed; these must stay green and guard the clone-flight work. `src/test/actions/send-message-duplicate-key-equivalence.test.ts` likewise. |
| `src/clubhouse/__tests__/wiring-p007-messages.test.tsx`, `class-awareness-messages.test.tsx` | wiring of the thread/composer through `Messages` | Re-run; likely only the aria/label changes above. |

New tests belong in `__tests__/` next to the code. The motion acceptance cases
MC-01, MC-02, MC-09, MC-11 need a headed 60 Hz sampler (MOTION.md "Acceptance
cases"); there is none in the repo for Messages today.

### Risks and surprises

1. **The structure is flex rows, not layers (MSG-203).** Bar, scroller and
   composer are three flex children (`PhoneScreen` column: `PhoneBar`,
   `.ch-msp-scroll`, `.ch-msp-composer`). The spec's "slides under the lip and
   blurs under the composer", `--pad-top/--pad-bot`, `--kb-pad` and a composer
   that translates with the keyboard all need the scroller to become the full
   page with the composer and bar as overlays. This touches `use-thread-anchor`
   (viewport-height observer), `useThreadMakeRoom` (bottom measurement uses
   scroller padding-bottom, T2:202), `useComposerInset`, the jump/date-pill
   offsets, and `ThreadJumpKey`'s settle logic. Do it once, by one owner, before
   the motion work.
2. **Legacy and v2 CSS coexist; most v2 rules win by order, a few legacy ones do
   not lose.** Checked by specificity (v2 is later in the file). What the legacy
   block still contributes: (a) bubble corners: base `.ch-ms-msg.is-mine
   .ch-ms-bub {border-bottom-right-radius: 6}` (CSS:588-592, 0,3,0) and
   `.ch-ms-msg:not(.is-mine).is-last .ch-ms-bub {border-bottom-left-radius: 6}`
   (CSS:579, 0,4,0) beat v2's `border-radius` shorthand (0,2,0), so last bubbles
   keep a 6px tail-side corner; (b) a SECOND tail: the phone `::after` clip-path
   tail (CSS:2079-2093) has no v2 counterpart to override it, so both tails
   draw; (c) the legacy phone textarea leaks `border-radius:22px`, `box-shadow:
   field-pill-edge`, `box-sizing`, and its `:focus` ring (CSS:2139-2157, the
   `:focus` one at 0,3,1 wins over v2); (d) the 82% phone column cap (CSS:2053)
   compounding with v2's 76% stack; (e) `.ch-ms-th` legacy flex bar rules
   (CSS:400-408) under the v2 desktop bar. What v2 already wins and the legacy
   rule is only dead weight: phone composer padding/background (CSS:2109-2118 vs
   5901-5907), composer field (CSS:2123-2129 vs 4688), bubble padding/font
   (CSS:2061-2066), day chip vs plain text (v2 chip CSS:4377 and 4624 beat
   legacy plain text CSS:2041-2049, so the CHIP is what renders: the conflict is
   v2's own rule, delete both v2 chip rules). Delete the legacy rules in the
   same PR that restyles each piece; do not add a third layer.
3. **Text sends are serialized.** `ready` includes `!sending` and `send()`
   returns while `sendingRef` is set (MV:1863,1919), and `api.send` only
   resolves after the server action (round trip). MC-01 (two sends 140 ms apart)
   is impossible today and the send key flickers away for a round trip after
   each send. The optimistic id design (UGM:1157) makes parallel sends safe;
   relax the gate for plain text but keep it for the recovery/unknown attachment
   states.
4. **ListPresence rise runs under the new flights (MV:2378, MP:522).** See the
   ListPresence notes: your own sent bubble and a bubble replacing a typing row
   must opt out, or the real bubble is visible (8 px low, fading) while the
   clone flies and the reveal doubles. The `useThreadMakeRoom` measurement
   happens in the same layout pass; keep `useSendRise`'s successor AFTER
   `useThreadMakeRoom` in hook order (MP:443-447 today) because it reads rects
   while the list animation holds the rows `d` px low.
5. **Q-19 conflict (clone vs real bubble).** SETTLED ruling 23 (Nov 4) said move
   the REAL bubble because a copy blinked in motion-check cases 1, 2, 11; the
   HTML (Nov 7) flies a clone and hides the real bubble with an `opacity:0`
   animation until it lands (`flyText`, HTML 2066-2096). QUESTIONS Q-19 default
   is "HTML wins, fall back if MC fails". Today's `useSendRise` is the fallback
   shape already; keep it available behind the same hook signature.
6. **`launch` is not in `CH_SPRINGS`.** `lib/motion.ts:70-81` has
   smooth/settle/reveal/send/pop/lift/pour. Adding `launch: {visualDuration .5,
   bounce .2}` exceeds the 0.1 bounce cap the file's comment documents (Q-04).
   `chSpringCurve` caps its sampled curve at 1.5 s and rests at 0.001
   (motion.ts:111-112), fine for 828 ms. App `pop` is 496 ms (tokens.css:1340),
   spec solver 540: use the app's number. `CH_FADE_MS` is 180, the HTML says 120
   (Q-05, ruling 25: use the shared helper).
7. **Reduce Motion is `useChReducedMotion()` = OS setting OR Settings >
   Animations off** (`lib/reduced-motion.ts:30-34`); CSS keyframes key off
   `prefers-reduced-motion` and `[data-motion='off']` separately
   (CSS:4592-4604). New motion written in CSS must cover both selectors; WAAPI
   hooks already take `reduced`.
8. **Native-only keyboard path.** `--keyboard-height` is only published (a) in
   the Capacitor app on `keyboardWillShow` with `info.keyboardHeight` (no
   duration or curve is read), (b) in Safari on coarse pointers from
   `visualViewport` (>120 px cover) (CapacitorProvider.tsx:205-230), and (c) per
   sheet. Desktop Chrome in a narrow window never sets it. The Safari path
   shrinks `.ch-pscreen` to the visual viewport (`data-ch-vv`), so a
   transform-based ride must not double-apply there. Capacitor's
   `resize:'ionic'` plus `scrollAssist/scrollPadding` true
   (capacitor.config.ts:86-91) mean iOS may still scroll the WebView; the screen
   sets `data-fw-keyboard-aware` so the global `scrollIntoView` is skipped
   (CapacitorProvider.tsx:163-172). Test on a device or the Simulator;
   `helm-safari-performance` and `scripts/phone/` are the tools.
9. **Bubbles are not focusable (MSG-008).** No `tabIndex` on `.ch-ms-bub` (grep:
   only the reaction bar, MV:1413). Spec wants `tabindex=0`, a 2px
   `--ch-ring-own` focus ring (offset 3) and Enter/Space opening the actions
   (MSG-401/402, slice C). `--ch-ring-own` exists (tokens.css:729,980).
   Photos/files are buttons/anchors already.
10. **Receipt time is the sent time.** DM "Seen {clock(m.at)}" (MV:1468) prints
    the message time. Showing "Seen 8:15 AM" needs the reader's `last_read_at`
    passed into `ChMsg`/`ChReceipts`; DATA.md/Q-15 gate it for minors' privacy.
    The group receipt already respects `seenByAccess('sender-and-coaches')`.
11. **Desktop has far fewer motion hooks than phone.** `Thread` (desktop) calls
    only `useThreadAnchor`, `useThreadMakeRoom`, `useFocusMessage` and
    `usePanelSmoothScroll`; it lacks date pill, send rise, reply-from-typing,
    drag (correct, phone only), spring jump, per-typer bubbles. The HTML runs
    the same `send`/`incoming`/`onScroll` on both devices. Extract shared hooks
    so both call the same ones.
12. **Typing gate and channel races.** `api.typing` is last-event-wins
    (UGM:1038-1064), a message INSERT clears it but leaves `typingUserIds`
    populated; the rows hook tears down and rebuilds all its channels whenever
    the watched id set changes (use-typing-by-conversation.ts:25-60) while the
    thread hook joins the same topic when a conversation opens (the open id is
    excluded, but the exclusion lands one render after selection). Realtime is
    Supabase `golf-conversation:{id}` (broadcast + postgres_changes on one
    channel), and `observeRealtimeChannel` wraps it for telemetry. 13a.
    **Re-check after the centred bar (MSG-219):** the name must still ellipsize
    between two 44 px keys. **iOS focus (MOT-SEND-2):** the send key only
    prevents `mousedown` (NotifyAnyway.tsx:99); the HTML prevents `pointerdown`
    while the keyboard is up. If a touch path focuses the button before
    `mousedown`, the keyboard drops on send; test on a device, and `ta.focus()`
    after an `await` (MV:2008) does not reliably re-raise a dismissed iOS
    keyboard.
13. **Dead code to remove during the work:** `ComposerPlus` (MV:1702-1732, no
    callers), `EditMessageModal` mounted with `message={null}` (MV:2440,
    MP:691), the phone `Modal open={false}` "Message" sheet (MP:642-690),
    `ThreadDatePill`'s unused desktop CSS `top:140px` (CSS:4540), the
    `.ch-ms-th` legacy flex bar rules once the bar is rebuilt.
14. **HTML vs SPEC value checks.** HTML Part 1 `.time right:-58px` is superseded
    by `.phone .time right:-64px` (HTML:934) and the 430 `-68*k` (HTML:1038);
    SPEC's `-64k` equals the code. HTML `.jump b` is 12/700 with `box-shadow: 0
    0 0 2px var(--a-page)` (HTML:427): SPEC matches, code does not
    (CSS:4567-4580). HTML `.datepill` Part 2 is 13/500 with blur 16 saturate 160
    (HTML:307,745); SPEC matches. No conflicts between SPEC and HTML found in
    this slice beyond the `-64` without `k`.
15. **`'use server'` surface.** `sendGolfMessage` and `markGolfMessagesAsRead`
    live in `src/app/actions/messages.ts`; this slice should not need to change
    them (the optimistic id and 23505 handling already exist). If anything is
    added there, export only async functions (the file already exports one
    `interface`); a changed `'use server'` surface needs `npm run build`
    (AGENTS.md).

---

## Part C. Slice C: overlays, reactions, menus, attach

Checkout: ch-messages-v2, read-only survey. Spec: SPEC.md MSG-224, 312, 313,
401-410; MOTION.md MOT-HOLD-1..6, MOT-RX-1..3, MOT-TEAM-1..3, MOT-ATT-1..3,
MOT-X-3/4/5/6/13/14. HTML checked directly where SPEC and code needed a
tie-break (`clubhouse-messages.html` lines 355-360, 502-529, 559-568, 805-815,
924-931, 2150-2330).

Short version of today: a Nov 4 generation of the lift exists and is good
(`hold-lift.tsx`, Reply/Copy/Edit/Seen/Delete rows, bar and menu springs,
reaction chips in the opposite colour, Seen faces, attach menu with
Photos/File/Poll, shared Modal sheet that already catches reopen mid-exit). The
Nov 7 deltas that bite here: no Enter/Space on a bubble, hold on a poll or
file-only message draws nothing, hover bar is in the wrong place and has the
wrong labels, delete asks first and says "Message deleted", pill toast lasts 4 s
not 1.7 s, three of the nine toast strings do not exist, scrim blur is 20 px not
14 + saturate, reaction chips have no title tooltip, attach open/close is a CSS
keyframe that cannot resume from a live frame.

### Verdicts

| ID | Verdict | Today (file:line) | Delta to build |
| --- | --- | --- | --- |
| MSG-224 Desktop hover bar | PARTIAL | JSX `MessagesView.tsx:1353-1388` (`.ch-msv-hoverbar`, `role="toolbar" aria-label="Message actions"`, Like/Love/Laugh/Reply/More); CSS `messages.css:5657-5720` | **Position**: code `top:-20`, mine `right:0`, theirs `left:0` (5659, 5691-5696), i.e. over the bubble's top corner; spec `top:-18`, theirs `right:-64`, mine `left:-64` (beside the bubble). **Size**: keys 26.9 (5678), glyph 14.4 (`MessagesView.tsx:1366`), width 144, padding 2, gap 0; spec keys 28, glyph 15, padding 3, gap 1 (~150 wide). **Glass**: `--ch-glass-bg` .70 + `--ch-glass-blur` 20 (5668-5670); spec glass-strong (.90) blur 18. **Transition**: opacity and transform both `--ch-dur-quick` 180 ms (5672); spec opacity 160 ms, transform 220 ms `--ch-ease`. **aria**: keys are "React like"/"Remove like", "Reply", "More message actions" (1361, 1371, 1379); spec exactly "Like", "Love", "Laugh", "Reply", "More actions" (keep `aria-pressed`). `__tests__/messages.test.tsx:1485` clicks `getAllByRole('button', { name: 'React like' })[0]`, which is this bar, so that test must change with the labels. **Polls**: bar renders on polls (condition `1353` is `!m.failed && !m.deleted && !onActions`); spec: not on polls. **Reveal**: `:hover` of the row or `:focus-within` of the bar only (5701-5703); spec row `focus-within`, which needs a focusable bubble (MSG-008, missing, see MSG-401). Good as is: desktop only (`!onActions`), More opens the lift (1379-1385), 3 reaction keys toggle, Reply sets the chip, hidden state `opacity 0, translateY(4px) scale(.96), pointer-events none` (5667-5675), reduced motion drops the transform (5714-5719). |
| MSG-312 Attach glass menu | PARTIAL | `ComposerPlusV2.tsx:65-96` (`role="menu"`, Photos/File/Poll, tiles `is-photos/is-file/is-poll`); CSS `messages.css:4723-4818` | **Anchor**: menu is absolute inside `.ch-msv-plus` (`left:-5px; bottom: calc(100% + 13px)`, 4751-4755), not in the thread page at phone left 12 (430: 16) bottom 92 / desk left = plus left bottom 84. Measure in a browser; the composer pill's own padding decides whether it lands on the same pixels. **Radius**: `--ch-radius-xl` 20 (4759) vs 22; rows `--ch-radius-lg` 16 vs 15; tile `--ch-radius-sm` 8 vs 10; row padding 6 8 vs 6 10. **Glass**: `--ch-glass-strong` + float shadow ok, but **no backdrop-filter** (spec blur 28 saturate 170). **Poll row**: shown only when `conv.group && api.polls` (63); spec always three rows; a test pins DMs to Photos + File (`composer-v2.test.tsx:131-134`). Decision needed (default: keep DMs without Poll, polls are a group feature, owner to confirm). Matches: width 240, padding 6, origin `18px 100%` (4760), row min-height 46, gap 12, 15k/500, tile 32 with glyph 17, tile colours #2F7D4C / #7F612A / #155A39 and ivory glyph #FDFCF8 (tokens.css:13-16), no Camera, no Announcement, closes on outside pointerdown (30-39, swallows the tap's click), Escape (41), plus key (49-57), and a pick (82-93). Escape does not return focus to the plus key. |
| MSG-313 Attach picks | DONE | Photos `ComposerPlusV2.tsx:82-83, 97` (`accept="image/*,video/*"`, no `capture`, so iOS offers camera itself); File 85-86, 98; Poll 89-93 opens `PollSheet` (99) | none for the menu. The picked file becomes the chip via `onPick` -> `setFiles` (`MessagesView.tsx:2069-2074`, `AttachChips` 1626-1658, MSG-305 is Pkg B). The poll sheet is a `Modal` in `polls.tsx` (MSG-504, Pkg D). |
| MSG-401 Hold to open (phone) | PARTIAL | `useLongPress` `MessagesView.tsx:1045-1108` (450 ms timer 1066, `haptic("press")` 1064, move cancel 1070-1081); press scale via `data-ch-press-scale=".97"` on `.ch-ms-msg__stack` (1325) handled by `lib/press.ts` (110 ms down, 280 ms `--ch-ease` release); right-click 1172-1181; phone entry `MessagesPhone.tsx:532-549` | **Cancel distance**: 10 px (1070) vs 8 px. **Touch press delay**: `press.ts` waits `PRESS_TOUCH_DELAY_MS` 70 ms before the sink on touch (a short hold sinks late); HTML sinks at 0 ms. **Scope**: the sink and 450 ms timer also run for a mouse on desktop (desktop hold sets `barHeld`, 1167); spec: phone only. **Enter / Space on a focused bubble**: MISSING. Searched `tabIndex`, `onKeyDown`, `role="button"` around `.ch-ms-bub` and the stack: none; bubbles are not focusable (MSG-008 also missing). The phone has a screen-reader-only "Message actions" button (1343-1352, CH-7804) and desktop keyboard users reach More through the hover bar, but nothing opens the lift from the bubble. **Photo / file / poll**: `HoldLift` finds its source with `querySelector('.ch-ms-bub, .ch-ms-img')` (`hold-lift.tsx:47, 50, 55`) and returns `null` when there is none (157): a hold on a poll card (`.ch-ms-poll`) or a file-only message (`.ch-ms-file`) opens nothing visible while `acting`/`lifted` stays set. Spec says photo/file lift too. Haptic is `haptic('press')` (light), which is what SPEC chose (Q-02): DONE. Right-click on desktop opens the lift (`rightClick` 1172-1181, overrides `press.onContextMenu`): DONE. |
| MSG-402 Lift overlay | PARTIAL | `hold-lift.tsx:20-174` (whole file); CSS `messages.css:4870-4891, 5290-5294, 5726-5728` | **Scrim**: `blur(var(--ch-glass-blur))` = 20 px, no saturate (4879-4880, tokens.css:602); spec blur 14 px saturate 120% (HTML 503). Scrim colour `--ch-scrim` .36 ok. **Copy**: clones only the bubble/photo node, not the row (`replaceChildren(el.cloneNode(true))` 57), so the reaction badges, reply quote and avatar do not lift with it; spec lifts the REAL row's copy (HTML clones the row and hides `.time/.hoverbar/.seen` in it, line 812). Transform origin is the bubble's bottom corner (164); HTML uses the bubble centre. **Clamp**: edge 12 (159) vs 8; bar and menu are positioned by `left/right` from the bubble (160-161) with no check that a 260 px bar fits. **Role/aria**: `role="dialog" aria-modal="true" aria-label="Message actions"` ok (162); bar has no `role="toolbar"`/aria "React" (165), menu has no `role="menu"` and its buttons are not `menuitem` (168). **Focus return**: `source.current?.focus()` (99-102) is a no-op because the bubble is not focusable. Matches: scale 1.02 (76), shift/safe math 60/36 phone, 12/12 desk plus env() insets (61-69), bar 56 above, menu 10 below (65-66, 168), first reaction key takes focus except while typing on a phone (89), scrim tap / Escape dismiss (163, 138-153), Tab trap (145-150), real row hidden `visibility:hidden` (58), time/receipt/hover bar are outside the cloned node. |
| MSG-403 Reaction bar | PARTIAL | `hold-lift.tsx:165-167`; built in `MessagesView.tsx:1496-1520` and `MessagesPhone.tsx:612-629`; `messages.css:4892-4924` | Six keys in `REACTIONS` order Like, Love, Laugh, Celebrate, Surprised, Thanks (`MessagesView.tsx:165-172`): ok. 40 px keys, glyph 22 (`size={22}`), 260 wide, 50 tall, gap 2: ok. **Padding** 4 vs 5 (4897; height is pinned at 50 so only the gutter differs). **Blur**: none on `.ch-msv-rbar` (only the menu has blur, 5872-5875); spec blur 24 saturate 170. **Stroke**: Icon default 1.6 vs 1.8. **`on` key**: `--ch-selected-tint` background + `--ch-green-600` glyph (4917-4919) vs accent fill + accent-ink. **Role/aria**: no `role="toolbar"`, no aria "React" on the wrapper; key labels are "React like"/"Remove like" (lower-case) vs exactly "Like", "Love", "Laugh", "Celebrate", "Surprised", "Thanks" (keep `aria-pressed` or an `on` class). Behaviour ok: pick dismisses, then applies (`liftPick`/`pickHold`), `haptic("select")`, badge pops after. |
| MSG-404 Message menu | CONFLICTS | desktop rows `MessagesView.tsx:1199-1222, 1285-1291, 1523-1533`; phone rows `MessagesPhone.tsx:632-640`; `messages.css:4925-4970, 5037-5043, 5723-5725, 5872-5875` | **Order and copy**: Reply, Copy (text only), Edit (mine, text only), sep, Seen by row (group AND mine), sep, Delete: matches for the main cases (desktop 1523-1533, phone 632-639). Seen row text `{n} of {m} · {m-n} not yet`, faces 20 px max 6: exact (`seen-by.tsx:125-141`). **Extras that spec does not have**: a coach also gets a "Seen by 9 of 11" row on THEIR message in a group (`seenItem` 1199, `SeenSheetRow` `MessagesPhone.tsx:634, 700-705`); polls add See votes / Remind n / Close poll / Share result / "Copy poll" rows (1200-1209; `MessagesPhone.tsx:632, 635, 714-729`); spec: photos/files/polls get Reply (+ Delete if mine). Poll rows are product (D26), keep them behind the same hold unless the owner says otherwise. Player senders never see the Seen row (coach-only list, `seenByAccess`), consistent with Q-15. **Box**: width 236, padding 6 ok; radius `--ch-radius-lg` 16 vs 18; row min-height 44 vs 42; row padding `0 8px` vs `8 12`; trailing icon 18 vs 19; blur 20 no saturate vs 24/170; **no `role="menu"`/`menuitem`**; origin ok. **Delete (the conflict)**: asks first (`DeleteMessageModal` `MessagesView.tsx:2500-2541`, `MessagesPhone.tsx:693`, CH-7501) then fades via `ListPresence` (height + opacity, no scale); spec: no confirm, row fades `scale .92` 180 ms then the list glides on smooth, toast "Deleted for everyone". Today's toast is "Message deleted" (`Messages.tsx:848`). **Copy** toast "Copied": ok (`MessagesView.tsx:1188-1189`, `MessagesPhone.tsx:450-458`). **Edit** goes to the composer chip (Pkg B), not a modal (the `EditMessageModal` render sites pass `message={null}`, dead). **Reply** sets the chip. **Seen by row** opens `useSeenByList().open`. |
| MSG-405 Seen by sheet | PARTIAL | `seen-by.tsx:324-336` (`SeenBySheet` = `Modal` width 400, class `ch-msv-sheet`), `SeenByBody` 183-321; `messages.css:5741-5760` | Title "Seen by" ok. **Subtitle**: `{n} of {total} · {slice(0,46)}` with no trailing "…" (327-329); spec adds "…". **Groups**: "Seen" and "Not seen yet" with counts ok; "Not seen yet" omitted when empty ok (`section()` returns false on 0). **Row**: avatar 36 (`Avatar size="md"`, 288) vs 32; the time is a second line under the name (`ch-seen-row__body`, 287-290) vs right-aligned 13k ink-3; no role line; empty time prints nothing, spec fallback "Just now" (261). "Hasn't opened this chat" ok (typographic apostrophe, 261). Ordering is most recent first (311), spec: reading order. Cards: `ch-seen-sec`, not the `vgroup` card look (is-v2 CSS only partly). Close key 40 with 44 target and aria "Close": ok. Dead code: `SeenByPopover` (340-436) is exported and catalogued but nothing renders it; `useSeenByList.render` ignores its `phone` argument and always returns the sheet (438-452). Stale header comment says "No faces anywhere" (24-26) but faces exist. |
| MSG-406 Reaction badges | PARTIAL | `ReactionChip` `MessagesView.tsx:756-873`, container 1433-1437; CSS `messages.css:748-830, 5082-5093, 5730-5740, 5897-5898` | **Colour rule: matches** (opposite of the bubble, see "Reaction colour rule" under Extra checks) but the green is `--ch-green-700` = **#0F4A2F** (tokens.css:69; dark `--ch-green-fill-700` #1D613F, tokens.css:1079) while the spec accent is #155A39 / dark #1F6B45 (`--ch-bubble-mine-fill`, tokens.css:717, 970): use that token. Position ok (top -14, theirs right -10, mine left -10, 16 px margin via `:has`, 5082-5093, 5897). **Size**: padding `0 8px` (757) vs `0 6px`; gap 4 (755) vs 3; no `min-width: 26`; glyph 12 (`MessagesView.tsx:825`) vs 14; stroke 1.6 (791-795) vs 2; chips gap 2 (5086) vs 3; font 12k/600 (`--ch-type-12-strong`) ok for the phone floor, desktop spec 11.5. `:hover` lifts 1 px (783-787): not in spec. Count only when > 1 ok (826). **Own ring**: 1.5 px `--ch-ring-own` (5736-5739) vs 2 px, offset 1 ok, halo `0 0 0 4px --ch-grouped-bg` ok. **Badges on MINE (ivory)**: halo is `0 0 0 1px rgb(21 90 57/.2)` + bubble elevation (769-772); spec `0 0 0 2px page, 0 0 0 3px rgb(21 90 57/.2)`. **Tooltip**: none. The chip has `aria-label` only (817) and is a `<button aria-haspopup="dialog">` that opens a "who reacted" card (`ch-rx`, 831-869); spec: a `title` `{Label}: You, Maya` (names joined ", ", you first as "You"). Default: keep the button and card (richer, keyboard-reachable), ADD `title` with the spec string. |
| MSG-407 Sheet system | PARTIAL | `ui/Modal.tsx` (whole), `controls.css:416-575`, `lib/sheet-drag.ts`, `lib/dialog-lifetime.ts`; messages use `Modal` only (`seen-by.tsx:329`, `polls.tsx:486, 539, 809`, `MessagesView.tsx` several), never `FormSheet` | Dismiss paths match (backdrop click, Close key, native Escape via `onCancel`, phone drag from grab/header, body drag at scroll top). **Phone box**: `max-height: 92dvh` (controls.css:551-557) vs 78%; head padding `20 16 6 24` (12 top on phone) vs `10 18`; body padding from `.ch-modal__body`; radius 20 20 0 0 ok (`--ch-radius-sheet` 20); grabber `.ch-grab` is 36 x 5, radius 999, `--ch-grab-bg` (controls.css:1535-1546): ok. **Desk**: width 400 for Seen (`width={400}`) ok; `max-height: calc(100dvh - 48px)` vs 82%; panel `ch-pop` enters `translateY(6px) scale(.98)` (controls.css:531-535) vs `scale .94`. **Scrim**: `::backdrop` plain `--ch-scrim` (controls.css:427-431), no blur; spec scrim = MSG-402 overlay (blur 14 saturate 120). Scope with `.ch-msv-sheet::backdrop` so other screens keep theirs. **Drag**: close past `CH_SHEET_CLOSE_PX` 80 px (`sheet-drag.ts:8`) or a flick > 0.5 px/ms (ok, line 10); spec past one third of the sheet height. Rubber band is UIKit's `(1 - 1/(x*.55/100+1))*100` (`rubberBand`), spec `-sqrt( \| d \| ) * 2.2`. These two live in a file shared by every Clubhouse sheet: change only behind an option, not globally. |
| MSG-408 Double-tap Like | PARTIAL | `toggleLikeOnDouble` `MessagesView.tsx:1226-1235`, wired on the stack at 1325 (`onClick`, `onDoubleClick: preventDefault`) | Works for touch and mouse (two clicks within 300 ms toggle Like, `haptic("select")`, `api.react(m.id, "Like", !mine)`). **Excluded**: links, buttons, polls (`.ch-ms-poll`), reply quotes (`.ch-ms-quote`), photos (`img`) (1228); spec: any bubble (photo/file included; polls vote on tap so keep that exclusion). No optimistic update: the badge pops only after insert + full reload (see reaction data path), so the pop lags by two round trips. `api.react` drops a tap while another reaction is saving (`Messages.tsx:858`). |
| MSG-409 Toast | CONFLICTS | `ui/Toast.tsx:90-105, 215, 222, 366-392` (`useToastPill`, `PILL_DONE_MS`); `messages.css:5095-5103, 5832-5858`; `Messages.tsx:687` turns the pill on | **Duration bug**: the pill's 1.7 s is only stored in `clock.left` (215) while the timer is armed with `DISMISS_MS[tone]` = 4000 (215): a pill confirmation stays 4 s; spec 1.7 s. `toast-timers.test.tsx` pins 4 s for non-pill only. **Placement**: container `top: env(safe-area-inset-top) + 8`, full width, centred (5832-5841); spec absolute centred, `top 62` phone (shot 58) / `18` desk. **Box**: padding `8 12` (5098, 5844) vs `9 14`; min-height 31; blur 20 (`--ch-glass-blur`) vs 18; `font 13 strong` (600) ok; glass-strong + float: partly (it uses `--ch-glass-strong`, shadow from base `.ch-toast`). Icon and close key hidden (5854-5857) ok. **Stack (the conflict)**: up to 3 toasts stacked with layout reflow (`.slice(-2)`, 222); spec: one at a time, a new toast fades the old out in 120 ms. **Motion**: in `y -8, scale .96, opacity 0 -> 1` on `pop` (387-395) ok; out `opacity` over `CH_DUR.quick` 180 ms (370) vs 200 ms. `role="status"` ok (`Toast.tsx:382`). **Copy**: "Copied" ok. "Deleted for everyone": MISSING (today "Message deleted", `Messages.tsx:848`, also `PreviewMessages.tsx:388`). "Sending again": MISSING (searched `src/clubhouse` for the string; the failed-send retry toasts only on failure). "Reminder drafted. It sends only when you tap Send": MISSING. "Unmuted": ok (`details-v2.tsx:59`). Mute strings: today `Mute 8 hours` / `Mute a week` / `Until I turn it on` from `useMuteAction` (59) PLUS `Conversation muted` from `api.setMute` (`Messages.tsx:650`): two toasts per mute (Q-13 keeps today's strings; decide which one survives). |
| MSG-410 Popover menu primitive | PARTIAL | `ui/Menu.tsx` (`Menu`, `MenuItems`, `menuKeyDown`), `ui/ContextMenu.tsx` (`useContextMenu` with `anchored`), `lib/use-popover-fit.ts`, `CH_POP` (`lib/motion.ts:165-170`); Mute uses bespoke `MuteMenu` `details-v2.tsx:67-92` on `.ch-msv-holdmenu.is-mute` (`messages.css:5295-5298`) | The primitive exists and is shared app-wide: portal, flips up near the bottom, arrows/Home/End/Esc/Tab, `role=menu`/`menuitem`, `aria-disabled` is NOT set (uses native `disabled`), separators, `caption` second line (used for "Pin up to 3"). **Differs from spec**: width 232 (`Menu.tsx:34`, `ContextMenu.tsx:12`) vs 236; surface is `.ch-menu.ch-popover` (card look), not glass-strong blur 24 saturate 170 with radius 18; entry is `CH_POP` (`translateY(-4px) scale(.97)`, quick 180 ms) vs `scale .8 -> 1` from the corner nearest the anchor on `lift`, and exit 160 ms fade; row height/typography are the shared `ch-menu__item`, not 42 min-height 15k/500 with a trailing 19 px icon (icons are left, 15 px); placement rule is 6 px gap with `above>below` flip (`Menu.tsx:95-99`) vs spec 8 px clamp and "above if it would pass the bottom 40 and there is 60 above"; scrim is none (spec: transparent scrim). Row menu: `useContextMenu({ anchored })` opens under the row at `r.left + 16, r.bottom + 4` (`ContextMenu.tsx:137, 204`). **Mute** does not use the primitive at all: it is a lift-styled glass box with a light scrim, no scale-in/out animation (instant mount), rows "Mute 8 hours" etc. Build a Messages popover variant (class or prop) rather than restyling `Menu` for the whole app. |
| MOT-ATT-1 + rotates 45 | DONE | `messages.css:4745-4750, 4835-4839`; `ComposerPlusV2.tsx:66-68` (`is-open`) | none (`transform var(--ch-dur-release)` 280 ms `--ch-ease-spring` = `cubic-bezier(.34,1.3,.64,1)` vs ~300 ms; reduced: `transition:none`). |
| MOT-ATT-2 Attach grows / closes | PARTIAL | open keyframe `ch-msv-lift` `messages.css:4763, 4769-4774`; close `.is-closing` `ch-msv-unlift` 4765-4767, 4775-4779; `onAnimationEnd` unmounts (`ComposerPlusV2.tsx:74-79`) | Open: `scale(.4) opacity 0 -> none` from `18px 100%` ok; easing `var(--ch-ease-spring-lift, var(--ch-ease))` resolves to the `lift` spring where `linear()` is supported (tokens.css:1341, generated from `CH_SPRINGS`), but the duration is **520 ms** (`--ch-dur-reveal`) instead of `--ch-dur-spring-lift` 471 ms (tokens.css:1342), so the curve is stretched. Close: `opacity 1 -> 0, scale .7` ok, **180 ms** (`--ch-dur-quick`) vs 160. **Resume from live frame (MC-06)**: MISSING. Closing swaps the class from one CSS animation to another, so it restarts from the base style (scale 1, opacity 1); reopening while closing restarts `ch-msv-lift` from `.4` (a visible jump both ways). Needs WAAPI (`chSpringCurve('lift')`) with a live start, like `hold-lift.tsx` does. Reduced: `animation-duration: --ch-dur-quick` (fade through the keyframe) ok. e2e `clubhouse-messages-motion.spec.ts` case 6 samples `.ch-msv-plus__key` only. |
| MOT-ATT-3 Picked file rises | PARTIAL | `useChipRise` `thread-v2.tsx:376-385`, used by `AttachChips` (`MessagesView.tsx:1636, 1641`) and the reply/edit chips (`2046, 2053`) | `translateY(12px) -> none` on `smooth` ok; **no opacity** (spec `opacity 0 -> 1`); reduced: appears ok. |
| MOT-HOLD-1 Sink to .97 | PARTIAL | `data-ch-press-scale=".97"` `MessagesView.tsx:1325`; `lib/press.ts:12-50, 94-157` | Down 110 ms / release 280 ms, `--ch-ease` both ways, no scale under reduced motion (`useChPress(!reduced)`, `shell/RouteFrame.tsx:173`): ok. Differences: touch waits 70 ms before it sinks (`press.ts:36-37`); cancel move is 10 px (`MessagesView.tsx:1070`) vs 8 x scale; the sink and hold are not phone-only; target is the whole `.ch-ms-msg__stack` (quote + bubble + attachments) rather than the bubble. |
| MOT-HOLD-2 Lift at 450 ms | PARTIAL | `hold-lift.tsx:54-95` | 450 ms, `translateY(shift) scale(1.02)` on `lift`, fill kept (inline transform), start scale = live press scale (`sink` 46-49, not clamped .9-1), real row hidden: ok. Haptic `press` light (Q-02 ruling): ok. **Origin** bottom corner (164) vs bubble centre; copy is the bubble only (see MSG-402); poll/file-only holds draw nothing (see MSG-401). Reduced: fades in place over `CH_FADE_MS` 180 (Q-05 says use the shared helper): ok. |
| MOT-HOLD-3 Reaction bar grows | DONE | `hold-lift.tsx:84, 165` | `scale(.5) opacity 0 -> none` on `pop`, origin `100% 100%` mine / `0% 100%` theirs: matches. Reduced fade 180 (shared helper). |
| MOT-HOLD-4 Menu unfolds | DONE | `hold-lift.tsx:85, 168` | `scale(.8) opacity 0 -> none` on `lift`, origin `100% 0%` / `0% 0%`: matches. |
| MOT-HOLD-5 Blur and scrim | PARTIAL | `hold-lift.tsx:83` (opacity 0 -> 1, `CH_SPRING_SETTLE_MS` 462 ms on `smooth`), CSS `messages.css:4875-4881` | Blur is set once, only opacity animates: ok. Blur value 20 px without saturate vs 14 px + saturate 120%. |
| MOT-HOLD-6 Dismiss | PARTIAL | `hold-lift.tsx:96-135` | Settle spring home from the live transform (`getComputedStyle(copy).transform`), scrim 280 ms `--ch-ease`, bar `scale .6`, menu `scale .85`: ok. **Bar/menu 180 ms** (`CH_DUR.quick`, 112-113) vs 160. **Reopen while closing**: tap on the settling copy or scrim reverses every part from where it is (`reopen` 120-130) instead of the HTML's fresh `openHold` that reuses the live lift transform and scrim opacity; the outcome is equivalent and has no teleport, but it fires on pointerdown, not after a new 450 ms hold. **Focus return** to the bubble is a no-op (bubble not focusable). Reduced: fade ok. |
| MOT-RX-1 Badge pops | PARTIAL | `popBadge` `MessagesView.tsx:745-754`; `arriving={drawn.current}` (1435); origin CSS `messages.css:5730-5735` | `scale .4 -> 1` on `pop`, origin `0% 100%` mine bubble / `100% 100%` theirs, once per node (`dataset.chPopped`): matches. Reduced: fades over `CH_FADE_MS` (reads `matchMedia`, not `useChReducedMotion`, so "Animations off" still plays it). **Latency**: reactions are written then fully reloaded (`use-message-reactions.ts:145-166`, `refresh()` re-reads every reaction row of the thread in pages of 100 ids), nothing is optimistic, so the pop lands one or two round trips after the tap. |
| MOT-RX-2 Count changes at once | DONE | `MessagesView.tsx:826` | Count is plain text, no count-up. |
| MOT-RX-3 Double-tap pops | PARTIAL | see MSG-408 | Press sink ok, badge pops (after the round trip), exclusions as in MSG-408. |
| MOT-TEAM-1 Name inside, face beside | DONE | `MessagesView.tsx:1333` (`ch-msv-bname` inside first bubble, group, theirs); face on the run's last row 1306-1322 | none (a 1:1 draws no face, `messages.css:5878-5880`). |
| MOT-TEAM-2 Seen faces pop | DONE | `SeenFaces` `seen-by.tsx:105-123` (`AnimatePresence initial={false}`, `scale .4 opacity 0 -> 1`, `chSpring("pop")`; reduced: no initial) | none for the faces. The pill around them is MSG-215 (other slice): padding `4 8 4 4` vs `3 9 3 4`, ring 1 px vs 1.5, and "Sent" (`message-receipts.ts:41`) vs spec "Delivered" with no readers. |
| MOT-TEAM-3 Open Seen by | PARTIAL | `Modal` + `dialog-lifetime.ts` (phone `ch-rise` on smooth; exit `translateY(100%)` 280 ms `cubic-bezier(.22,1,.36,1)` from the live frame, `dialog-lifetime.ts:148-166`; reopen from the caught frame 99-108, 174) | Phone motion matches (already catches mid-exit). Desktop enters `translateY(6px) scale(.98)` and leaves the same (`dialog-lifetime.ts:148`) vs `scale .94 -> 1` / `.96`. Scrim fades on smooth ok but has no blur (MSG-407). Reduced: opacity over 180 ms ok. |
| MOT-X-3 Hover bar motion | PARTIAL | `messages.css:5672, 5714-5719` | Both properties 180 ms; spec opacity 160, transform 220 `--ch-ease`. Reduced: transform none, opacity crossfade (spec: no motion). |
| MOT-X-4 Toast motion | PARTIAL | `Toast.tsx:366-395` | In: ok (`y -8, scale .96, opacity 0 -> 1`, `pop`). Out: 180 ms (spec 200). Replacement: no 120 ms fade of the older toast, stack of up to 3. Duration bug (4 s vs 1.7 s) in MSG-409. |
| MOT-X-5 Sheet open/close | PARTIAL | `dialog-lifetime.ts` | Open smooth + scrim smooth, close 280 ms `--ch-ease`, live reopen: ok. Scrim lacks the blur (MSG-407); the `Modal` is the only sheet messages use. |
| MOT-X-6 Sheet drag | PARTIAL | `sheet-drag.ts:8-10, 31-33, 117, 195`; `chThrownExit` (ruling 24) already used by the close | Follows finger from grab/header (and body at scroll top), scrim follows (`chScrimAt` = `1 - offset/size`, ok), flick 0.5 px/ms ok, thrown exit ok, settle on smooth ok. Differs: close threshold 80 px vs one third of height; rubber band formula. |
| MOT-X-13 Interrupt carry | PARTIAL | React reconciliation keeps nodes (`ReactionChip` keyed by kind; `SeenFaces` presence); `hold-lift.tsx:120-130`; `dialog-lifetime.ts` caught frame | No `CARRY` engine, none needed for nodes React keeps. Gaps in this slice: attach menu (MOT-ATT-2), toast stack, lift copy is a static `cloneNode` (a reaction arriving while lifted does not appear in it). |
| MOT-X-14 Press feedback | DONE | `press.ts` + `data-ch-press-scale` | 110 ms down, 280 ms release, `--ch-ease`; none under reduced motion. |

### Extra checks (requested, not SPEC IDs)

| Topic | Verdict | Today (file:line) | Delta to build |
| --- | --- | --- | --- |
| Reaction colour rule vs MSG-406 | PARTIAL | `messages.css:769-781` (`.on-mine` ivory `--ch-ivory-50` #F9F7F1 chip + `--ch-forest-900` glyph; `.on-theirs` `--ch-green-fill-700` = `--ch-green-700` chip + `--ch-on-fill-50` glyph), class chosen at `MessagesView.tsx:1433` (`m.mine ? "on-mine" : "on-theirs"`) | Rule in code = "opposite colour of the bubble": a reaction under MY green bubble is ivory, under THEIR paper bubble is green (owner 2026-10-08, comment `messages.css:766-767`). That equals MSG-406 and the HTML Part 2 CSS (HTML 926-927). Own reaction: champagne ring `outline` `--ch-ring-own` #8C703A light / #C9AD74 dark (tokens.css:729, 980) on a 4 px `--ch-grouped-bg` halo (`messages.css:5736-5739`, `--ch-messages-x7` defined at 5865): equals the spec colours but is **1.5 px**, spec 2 px. Missing: the 2 px page-colour halo plus `rgb(21 90 57/.2)` 3 px line on ivory chips (code: 1 px line). Checked: `--ch-green-700` is #0F4A2F, not the spec accent #155A39, so the chip green on THEIR bubbles is darker than the design; point it at `--ch-bubble-mine-fill`. Nothing to flip in the rule itself; do NOT adopt the "white with green glyphs, solid green when yours" prose in HTML chapter c-react (Q-01). |
| Reaction data path | n/a (facts) | `hooks/golf/use-message-reactions.ts`: `MESSAGE_REACTIONS` 10-17 (👍 Like, ❤️ Love, 😂 Laugh, 🎉 Celebrate, 😮 Surprised, 🙏 Thanks); `useMessageReactions` 51-176; table `golf_message_reactions` (unique `(message_id, user_id, emoji)`, `supabase/migrations/20260908160000_golf_message_reactions_access.sql:47`, RLS participants only); wired in `Messages.tsx:57-58` (emoji maps), `167` (hook), `493-507` (`reactionMap` -> `api.reactions`), `855-865` (`api.react`) | **No server action.** The browser client inserts/deletes directly (RLS), then calls `refresh()` (full re-read of all reaction rows for the thread's live message ids, 100 per query) and a realtime channel on the whole table re-runs it (131). **A user can place any number of kinds on one message, at most 6, one row per kind** (unique index; `setReaction` has no cap and the HTML toggles each kind independently): spec-compatible. `summarizeReactions` sorts badges by emoji code point (`localeCompare`, line 38), not by `REACTIONS` order or time; HTML draws in `RX` order. `pending` makes `api.react` drop taps while one saves. Same hook and table back the Fairway thread (`FairwayMessages.tsx`, `MessageThreadPane.tsx`): do not change the emoji list or return shape without them. Copy: no tooltip/title today; chip `aria-label` "`{Label}, {n}[, including you]. Show who reacted`" (817); card "Take back your reaction" / "React with {Label}" (864); errors "Couldn’t save the reaction" (CH-7009). |
| Delete-for-everyone server action and toast | PARTIAL | client `Messages.tsx:844-851` (`remove` -> `msgs.removeMessage`, `haptic('success')`, toast 'Message deleted'); hook `use-golf-messages.ts:1326-1340` (optimistic filter, rollback by `fetchMessages()`); action `deleteGolfMessage` `app/actions/messages.ts:1420` -> `observedDeleteGolfMessage` -> `deleteMessage({ sport: 'golf' })` 1327-1395, re-exported by `app/golf/actions/messages.ts:351-358` | Sender-only soft delete for everyone: `is_deleted=true`, `content=''`, poll `payload=null`, `touchConversation`, `logSecurityEvent('message_deleted')`. Already "for everyone" by nature, so only the copy ("Deleted for everyone"), the missing confirm decision and the fade (`scale .92` 180 ms then glide) change; no server change. Others see the tombstone "Message deleted" (`MessagesView.tsx:1265-1282`). Both action files are `'use server'`; `app/golf/actions/messages.ts` exports an `interface` (48) which is erased, but do not add a non-async runtime export to either. |
| Message actions: Reply / Copy / Edit / Delete / Seen by | see MSG-404 | rows `MessagesView.tsx:1199-1222` (desktop), `MessagesPhone.tsx:632-640` (phone) | Reply: `reply()` sets `replyToId` and focuses the composer (`MessagesPhone.tsx:391-395, 418-420`). Copy: clipboard, `haptic('success')`, "Copied", failure toast CH-7020. Edit: `setEditing` -> composer edit chip. Delete: confirm Modal then toast. Seen by: row opens the sheet. |
| `haptics.ts` | DONE | `lib/haptics.ts:30-60` | `press` = light (the lift tick, `MessagesView.tsx:1064`), `select` for reactions and double-tap, `success` for Copy/Delete/Edit saved, `warning` for destructive confirm, `commit` (medium) only for sheet drag close. Matches ruling 22 (Q-02). Native-only and preference-gated: nothing fires in jsdom or on the web. |
| Dead code in this slice | n/a | old desktop reaction bar `picking` path: `MessagesView.tsx:1236-1262` (`closeBar`, `onBarKey`, `reactBtn`), 1390-1428 (`.ch-ms-reactbar`), Thread `2165, 2225-2240`; nothing ever calls `setPicking(true)`. Legacy `ComposerPlus` (`MessagesView.tsx:1702`): no caller anywhere in `src` (grep), dead. Phone `Modal code="CH-7604" open={false}` `MessagesPhone.tsx:642-690` (+ `.ch-msp-acts*` CSS `messages.css:2214`); `EditMessageModal` render sites with `message={null}` (`MessagesView.tsx:2440`, `MessagesPhone.tsx:691`); `SeenByPopover` (no render site; only `preview/component-catalog.json:4893`) | Safe to delete when the overlay slice is rebuilt; `.ch-ms-reactbar*` and `.ch-ms-tool` selectors in CSS go with them. |

### Code map

Four implementers will split `MessagesView.tsx` (3,389 lines) and
`MessagesPhone.tsx` (1,270). Overlay code is concentrated in the two files
below; everything else is a separate file.

#### `src/clubhouse/screens/messages/hold-lift.tsx` (174 lines): slice C owns it whole

- `atRest` 10-16, `safeAreaInsets` 24-32, `HoldLift` 34-174: MSG-401/402/403/404
  shell, MOT-HOLD-1..6. Props: `messageId, mine, bar, children, onClosed,
  closeSignal, onReopen`. Source lookup `47-55`, placement math `56-70`, enter
  animations `71-90`, `dismiss` 96-118, `reopen` 120-130, key handling 132-155,
  render 157-172. Selectors tests and e2e use: `.ch-msv-lift`,
  `.ch-msv-lift__copy`, `.ch-msv-rbar`, `.ch-msv-holdmenu`,
  `data-ch-code="CH-7604"`.
- Shared with other slices: none.

#### `src/clubhouse/screens/messages/MessagesView.tsx` (3,389 lines)

| Lines | Name | IDs | Notes |
| --- | --- | --- | --- |
| 93, 137 | imports `HoldLift`, seen-by | C | |
| 157-175 | `Surprised` icon, `REACTIONS`, `REACTION_ICON` | MSG-403/406/224 | exported; used by `MessagesPhone.tsx`, `Messages.tsx` maps keys |
| 745-754 | `popBadge` | MOT-RX-1 | |
| 756-873 | `ReactionChip` (button + "who reacted" card) | MSG-406 | portal card `ch-rx` |
| 1045-1108 | `useLongPress` | MSG-401 | hold timer, swipe-to-reply/times (swipe belongs to slice B, same function) |
| 1110-1534 | `Bubble` | C and B | see split below |
| 1142-1181 | lift state, `liftPick`, `barHeld`, `press`, `rightClick` | MSG-401, 402 | C |
| 1183-1222 | `copyText`, `seenItem`, `menuItems` | MSG-404 | C |
| 1223-1235 | `reacts`, `toggleLikeOnDouble` | MSG-408 | C |
| 1236-1262 | dead `picking` bar logic | dead | delete |
| 1265-1284 | deleted-message tombstone | MSG-404 context | B |
| 1285-1291 | `holdRows`, `holdRow` | MSG-404 | C |
| 1292-1342 | row shell: avatar, name-in-bubble, stack with `data-ch-press-scale`, quote, poll, attachments (B owns through 1342; C owns the handlers on line 1325) | B, C | |
| 1343-1352 | sr-only "Message actions" button (phone) | MSG-401 a11y | C |
| 1353-1388 | `.ch-msv-hoverbar` | MSG-224 | C |
| 1390-1428 | dead `.ch-ms-reactbar` (`picking`) | dead | delete |
| 1430-1437 | reaction chips container | MSG-406 | C |
| 1438-1486 | failed row, receipts lane (`SeenByPill`, `SeenByReceipt`), notified-anyway | MSG-215/216 | B (not C) |
| 1491 | `.ch-msv-time` | MSG-218 | B |
| 1492-1533 | `<HoldLift>` call with bar and rows | MSG-402/403/404 | C |
| 1540-1565 | `MessageText` | B | |
| 1626-1658 | `AttachChips` | MSG-305/MOT-ATT-3 | B, C touches the rise |
| 1702-1733 | legacy `ComposerPlus` (Menu based; check for callers before keeping) | MSG-312 | C |
| 2069-2074 | `<ComposerPlusV2>` mount in `Composer` | MSG-312/313 | C (call site inside B's `Composer` 1777-2134) |
| 2152-2446 | `Thread` (desktop): `picking` 2165, 2225-2240 (dead), `seenList` 2186, `Bubble` calls 2387-2402, modals 2440-2442 | C and B | |
| 2449-2498 | `EditMessageModal` (dead render sites) | dead | |
| 2500-2541 | `DeleteMessageModal` | MSG-404 delete | C |

Split for `Bubble` (1110-1534): the overlay half (C) is 1142-1235, 1285-1291,
1343-1437, 1492-1533; the layout half (B) is 1265-1284, 1292-1342, 1438-1491.
They share props and the `id="ch-ms-message-{id}"` row that `HoldLift` queries
by id. Suggest extracting C's pieces into new files (`bubble-actions.tsx`: hover
bar, lift wiring, `useLongPress`, double-tap; `reaction-chip.tsx`) and leaving B
the row layout.

#### `src/clubhouse/screens/messages/MessagesPhone.tsx` (1,270 lines)

| Lines | Name | IDs | Notes |
| --- | --- | --- | --- |
| 45, 74, 107-109 | imports `Modal`, seen-by, `HoldLift`, thread-v2 hooks | | |
| 366-697 | `PhoneThread` | B and C | |
| 386, 424-430 | `acting` state, `pickHold` | MSG-401 | C |
| 450-458 | `copy` | MSG-404 | C |
| 530-550 | `<Bubble ... onActions={() => (notePollHold(), setActing(it.m))}>` | MSG-401 | C |
| 598-641 | `<HoldLift>` with the phone bar and rows | MSG-402/403/404 | C |
| 642-690 | dead `Modal code="CH-7604" open={false}` (old "Message" sheet) | dead | delete with `.ch-msp-acts*` CSS |
| 691-693 | Edit/Delete modals, `seenList.render` | MSG-404/405 | C |
| 699-705 | `SeenSheetRow` | MSG-404 | C |
| 707-712 | `ActingSeenMeta` (only used by the dead Modal) | dead | |
| 714-731 | `PollSheetRows` | MSG-404 poll rows | C (reads `pollCardActions`) |
| 733-749 | `SheetRow` (`hold` variant is the glass row) | MSG-404 | C |
| 767+ | `PhoneDetails` incl. `Modal` at 888 | MSG-6xx | D |

#### Other files, slice C owns whole

- `ComposerPlusV2.tsx` (102): MSG-312/313, MOT-ATT-1/2. Mount site
  `MessagesView.tsx:2069`.
- `seen-by.tsx` (453): `useSeenBy` 30-42, `SeenByReceipt` 47-103 (legacy inline
  receipt, B), `SeenFaces` 105-123, `HoldSeenRow` 125-142, `SeenByPill` 144-164
  (MSG-215, B), `SeenByBody` 183-321, `SeenBySheet` 324-336, `SeenByPopover`
  340-436 (dead), `useSeenByList` 438-452. Split: MSG-404/405 and MOT-TEAM-2/3 =
  C; pill and receipt = B.
- `ui/Toast.tsx` (427, shared app-wide): pill mode 90-105, 215, 330-343; changes
  must stay behind `pillOn`. `useToastPill` called by `Messages.tsx:687` and the
  preview.
- `ui/Modal.tsx`, `lib/sheet-drag.ts`, `lib/dialog-lifetime.ts`,
  `styles/controls.css:416-575`: shared by every Clubhouse screen. Messages-only
  changes go through `className="ch-msv-sheet"` and `.ch-msv-sheet::backdrop`.
- `ui/Menu.tsx`, `ui/ContextMenu.tsx`, `lib/use-popover-fit.ts`,
  `lib/haptics.ts`, `lib/press.ts`, `lib/motion.ts`: shared; `launch` spring is
  not added here (slice B/C coordination: Q-04).
- `Messages.tsx` (1,094): container glue for C: `EMOJI_BY_KEY/KEY_BY_EMOJI`
  57-58, `useMessageReactions` 167, `reactionMap` 493-507, `remove` 844-851
  (toast string), `react` 855-865, mute toast 650, `useToastPill` 687.
- `details-v2.tsx`: `useMuteAction`/`MuteMenu` 36-92 (MSG-410 consumer, owned by
  D).
- `hooks/golf/use-message-reactions.ts` (shared with Fairway).
- `src/app/actions/messages.ts` `deleteMessage` 1327-1395, `deleteGolfMessage`
  1420; `src/app/golf/actions/messages.ts` re-export 351-358.

#### CSS (`src/clubhouse/styles/messages.css`, 5,958 lines)

Reaction chips 748-830 (+ legacy `.ch-ms-reactbar` 706-746, dead), `.ch-rx` card
830-915; plus/attach 4723-4840; lift, bar, menu, seen row 4870-5041; badges
5082-5093, 5730-5740, 5897-5898; hover bar 5657-5727; sheets 5741-5760; toast
pill 5095-5103, 5832-5858; mute menu 5295-5298; blur on menu 5872-5875. Tokens
used: `tokens.css` 13-16 (attach tile colours), 602 (`--ch-glass-blur` 20 px),
726 (`--ch-glass-strong`), 729 (`--ch-ring-own`), 869 (`--ch-scrim`), 895-900
(`--ch-ease-spring`, durations).

### Tests

Existing tests that pin overlay behaviour:

- `src/clubhouse/__tests__/messages.test.tsx`: `:836-837` (phone: click sr-only
  "Message actions", then `[data-ch-code="CH-7604"]` Reply). Keeps working if
  the lift keeps the code and the labels. `:1480-1486` ("CH-7009 a reaction that
  fails says so") clicks `getAllByRole('button', { name: 'React like' })[0]`:
  this is the desktop hover bar's aria-label. Legitimately changes to "Like"
  (MSG-224 labels); update the query on purpose.
- `src/clubhouse/screens/messages/__tests__/composer-v2.test.tsx:120-152`:
  attach rows (`Photos, File, Poll` in a group; `Photos, File` in a DM) and a
  single `.ch-msv-attach`. Changes only if the owner puts Poll in DMs; add
  open/close-resume cases for MOT-ATT-2.
- `screens/messages/__tests__/seen-pill.test.tsx` (`HoldSeenRow`, `SeenByPill`)
  and `src/clubhouse/__tests__/messages-seen-by.test.tsx` (`SeenByReceipt`,
  `SeenBySheet` loading/error, subtitle): the sheet subtitle test must change if
  the "…" is added; `SeenByPopover` is not tested (safe to delete).
- `screens/messages/__tests__/messages-player-session.test.tsx`: `SeenByReceipt`
  for a player; unchanged by C.
- Strings pinned (ruling 19): `__tests__/messages.test.tsx:337, 356, 364` find
  buttons named "Mute 8 hours" (the details Mute rows, MSG-603/410), `:474`
  expects "Not sent" (MSG-216, other slice), `:794` the tombstone "Message
  deleted" (stays: it is what others see). `toast-timers.test.tsx:316-331` uses
  "Conversation muted" / "Notifications back on" as sample titles only. No test
  pins the delete toast "Message deleted" from `Messages.tsx:848`, so "Deleted
  for everyone" breaks nothing; the Mute label change (if the owner picks "For 8
  hours") would need `messages.test.tsx:337-364` edited on purpose.
- `src/clubhouse/__tests__/toast-timers.test.tsx` (4 s confirmation / 8 s error,
  onExpire, hover/focus holds): all non-pill. Add a pill case at 1.7 s; the
  existing ones stay.
- `src/clubhouse/__tests__/motion-physics.test.tsx` (spring tables,
  `send/pop/lift` named exceptions, toast swipe/hold),
  `sheet-drag-reduced.test.tsx`, `scrim-follows-sheet.test.tsx`,
  `dialog-lifetime.test.tsx`, `popup-layout.test.tsx`, `haptic-grammar.test.ts`:
  shared infrastructure; they change only if the one-third close threshold, the
  sqrt rubber band or a `launch` spring is added to the shared code (prefer
  options so these stay).
- `src/clubhouse/preview/__tests__/messages-design-fixture.test.tsx` and
  `preview/PreviewMessages.tsx:247-276`: the design route opens states by
  dispatching `contextmenu` on `.ch-ms-msg__stack`, clicking
  `.ch-msv-plus__key`, and `.ch-msv-rbar button:nth-child(2)`. Keep those class
  names or update the preview steps in the same change.
- `e2e/clubhouse-messages-motion.spec.ts` cases 3 (hold, Escape at 90 ms), 4
  (hold again while settling), 6 (attach close/reopen): they sample `.ch-ms-msg
  .ch-ms-bub, .ch-msv-lift__copy` and `.ch-msv-plus__key`. These are the repo's
  MC-03/04/06; they must keep passing, and case 6 should be extended to sample
  the attach menu itself (`.ch-msv-attach`) once MOT-ATT-2 is rebuilt.
- Fairway has its own reaction tests
  (`components/fairway/pages/messages/MessageThreadPane.*.test.ts`); not
  affected unless `use-message-reactions.ts` changes.

New tests worth adding next to the code (`__tests__/`): Enter/Space opens the
lift; hold on a poll and on a file-only message opens the lift; reaction
`title`; "Deleted for everyone" toast; pill toast lasts 1700 ms.

### Risks and surprises

1. **Hold on a poll or a file-only message opens nothing**
   (`hold-lift.tsx:47-55, 157`): the source selector is `.ch-ms-bub,
   .ch-ms-img`. `acting` stays set on the phone, so the next hold on the same
   message may not re-open (`key={acting.id}` same). Fix by letting `HoldLift`
   take any `.ch-ms-msg__stack` child (`.ch-ms-poll`, `.ch-ms-file`) and clone
   the stack instead.
2. **Focus return is a no-op**: bubbles have no `tabindex` (MSG-008 missing), so
   `source.focus()` after the lift and the "focus-within" hover reveal both
   fail. Add `tabIndex=0` + Enter/Space + focus ring on `.ch-ms-bub`/the stack
   in the same change as the hover bar fix; remember `useLongPress` and the
   double-tap `onClick` live on the same element.
3. **Pill toast is 4 s, not 1.7 s** (`Toast.tsx:215`: `left` uses
   `PILL_DONE_MS`, the timer uses `DISMISS_MS`). The toast is shared by every
   screen; the pill branch is gated by the module-level `pillOn`, so the change
   is safe only inside that branch. A toast raised in a `<dialog>` is re-hosted
   into the dialog (`useToastHost`), so the spec's absolute `top 62 / 18` must
   be computed relative to the host, not the viewport.
4. **Delete confirm**: the HTML has no confirm and deletes at once with a fade.
   Today's `DeleteMessageModal` (CH-7501) is owner-visible safety (it quotes the
   message). Owner decision needed; default: keep the confirm, change the toast
   to "Deleted for everyone", and replace the height collapse with the scale .92
   fade. `ListPresence` (`ui/ListPresence.tsx:121-142`) animates height, margins
   and opacity (layout), which breaks the "only transforms move" house rule on
   delete; the thread uses `arrive="rise"`, `flip={false}`.
5. **No optimistic reactions**: the badge and its pop wait for insert + a full
   `refresh()` of every reaction row in the thread, and `api.react` ignores taps
   while `pending`. Rapid Like/Love taps lose the second. The hook is shared
   with Fairway; add an optimistic layer in `Messages.tsx` (local overlay on
   `reactionMap`) rather than editing the hook.
6. **`Modal` is the only sheet** and `Modal`, `sheet-drag.ts`, `controls.css`
   are shared app-wide. The spec's one-third close threshold, sqrt rubber band,
   78%/82% max-height and blurred scrim must be opt-in (a prop on
   `useSheetDrag`/`Modal` or `.ch-msv-sheet` CSS), never global.
7. **Popover primitive**: do not restyle `Menu`/`ContextMenu` globally (232
   wide, `CH_POP`); 40+ screens use them. Add a variant. The row menu's "Pin up
   to 3" can use `MenuItem.caption` + `disabled` (native `disabled`, spec wants
   `aria-disabled`, so keyboard focus can still land on it). Mute is hand-rolled
   on the lift CSS and has no open/close animation.
8. **Attach menu**: CSS keyframes cannot resume from a live frame. Rebuild
   open/close with WAAPI on `chSpringCurve('lift')` and the existing
   `is-closing` guard; `--ch-ease-spring-lift` and `--ch-dur-spring-lift` exist
   (tokens.css:1341-1342, only under `@supports linear()`); the attach keyframe
   pairs the lift curve with the 520 ms reveal duration. Keep
   `.ch-msv-plus__key` (e2e, preview) and the swallow-click-on-outside
   behaviour.
9. **Hover bar vs reaction badge**: both sit at the top corner (`top:-20` vs
   `-14`); moving the bar outside the bubble (`±64`) fixes the overlap but the
   bar then needs room in the row (rows have `padding-inline` 16/28); check
   narrow desktop panes (details open).
10. **Seen row privacy**: `HoldSeenRow` and the sheet only show for a coach
    (`seenByAccess(...).list`, `SEEN_BY_VISIBILITY`), matching Q-15; the HTML
    shows the row for any group sender. Keep the gate. A coach also gets a Seen
    row on theirs-in-group today; spec says mine only; decide, default keep
    (coach tooling, P-1 slice 6).
11. **Stale comments mislead**: `seen-by.tsx:24-26` ("No faces anywhere"),
    `MessagesView.tsx:194` (flag comment; the wrapper `data-ch-ms-v2` is now
    unconditional, `MessagesScreen.tsx:36`), `hold-lift.tsx` header cites M-MSG
    ids. Legacy `ComposerPlus` (1702) has no callers (checked across `src`).
12. **`SeenByPopover` and `MuteMenu` carry `data-ch-ms-v2="on"` inline**
    (`hold-lift.tsx:162`, `details-v2.tsx:79`) because they portal outside the
    wrapper; any v2 CSS scoped by `[data-ch-ms-v2]` needs the attribute on
    portalled overlays.
13. **HTML vs SETTLED / QUESTIONS**: Q-05 (reduced fade 120 vs shared 180) and
    Q-02 (haptic) are resolved and the code already follows them. Q-13 is NOT
    closed in practice: it says keep today's mute strings AND the labels "For 8
    hours" / "For a week" / "Until I turn it on", but today's rows and toasts
    read "Mute 8 hours" / "Mute a week" / "Until I turn it on"
    (`details-v2.tsx:59, 86-88`) and `api.setMute` toasts a second line
    "Conversation muted" / "Notifications back on" (`Messages.tsx:650, 1013`),
    so a mute raises two toasts today. Owner to pick the strings. The other open
    conflict in this slice is the delete confirm (risk 4).
14. **Generated catalog**: `preview/component-catalog.json` lists
    `EditMessageModal`, `SeenByPopover`, `HoldSeenRow` etc. (lines 4637,
    4891-4895); deleting or renaming exports needs the repo's regenerate step
    (`npm run regen:resolve` / the catalog generator), never a hand edit.
15. **Touch press delay**: `press.ts` PRESS_TOUCH_DELAY_MS 70 ms is app-wide
    (scroll safety). The HTML sinks at 0 ms; a hold's sink therefore starts 70
    ms late on the phone. Not worth changing globally; if needed, add a
    per-element opt-out (`data-ch-press-now`).

---

## Part D. Slice D: polls, files, photos, details, mute, empty states, desktop layout

Checkout `ch-messages-v2` (branch `agent/ch-messages-v2`), read-only survey,
2026-11-07. Paths are under `src/clubhouse/` unless they start with `src/`. `MV`
= `screens/messages/MessagesView.tsx` (3,389 lines), `MP` =
`screens/messages/MessagesPhone.tsx` (1,270), `M` =
`screens/messages/Messages.tsx` (1,094), `CSS` = `styles/messages.css` (5,958).
Line numbers were re-checked with `grep -n` / `sed -n`.

Method notes. Every value below was read in the code, not inferred from a test
name. Where I deduce a visual result from the CSS cascade instead of a render,
the cell says "by cascade". Where SPEC.md and the HTML differ I say so. DATA.md
and QUESTIONS.md do not exist in this checkout, so the "privacy-gated (DATA.md)"
and Q-nn references could not be read.

Headline: today's polls are the Nov 4 generation (paper card, key-style options,
green gradient fill plus a 3 px level line, "Poll / Final / Ends ..." header, "n
of m voted" footer). The Nov 7 poll (flat recv bubble, page-2 well options,
"Poll · Choose one", "{n} votes · Closes ...") is a restyle plus copy change on
top of working behaviour. Behaviour (single and multi vote, close, final,
remind, share, drafts, clock) is richer than the spec and must be kept.

### Verdicts

| ID | Verdict | Today (file:line) | Delta to build |
| --- | --- | --- | --- |
| MSG-220 Photo bubble | PARTIAL | Content: `MV:875-910` `ImageAttachment` (button `.ch-ms-img`, `aria-label="Open {f.name}"`, `<img alt={f.name}>`, tap opens `Modal` viewer `MV:899-908`). Rendered by `Bubble` at `MV:1339-1341` through `Attachments` `MV:911-1044` (own sibling of the text bubble inside `.ch-ms-msg__stack`). Shell CSS `CSS:4606-4622`: 242 x 176, padding 2, radius `--ch-radius-xl` (20), image radius `--ch-radius-lg` (16), bg theirs/mine fill. No tail (tail only in the text branch `MV:1335`). | Spec `.b.photo`: padding 3, image 236 x 170 radius 16 (outer is 242 x 176 in both, so only the inner box and padding move: padding 2 to 3, image 238 x 172 to 236 x 170), bubble radius 19 not 20. alt = "Photo of ..." from the message text, bubble aria "Photo from {First}" (today alt is the file name, aria "Open {name}"). Reaction badge on the corner and hold-lift are slice C but key off this node: `hold-lift.tsx:47,50,55` query `.ch-ms-bub, .ch-ms-img`; keep one of those classes on whatever shell is built. Reserve the 176 px frame before the signed URL arrives (see Risks 1). |
| MSG-221 File bubble | CONFLICTS | `MV:1012-1031` (an `<a class="ch-ms-bub ch-ms-bub--file" href=signed url target=_blank>`), failed/loading variants `MV:984-1008`, broken-image fallback `MV:878-891`. CSS `CSS:628-662`: grid `34px 1fr auto`, gap 12, min-width 240, tile `.ch-ms-file__ic` 34 x 34 radius 12 with a `FileText` icon (no type label), title `--ch-type-14-medium`, sub `--ch-type-13` tertiary, trailing `Download` icon 15. Mine: `CSS:639-643` forces the paper surface (`--ch-sheet-bg`, primary ink); dark `CSS:3159`; v2 green rule excludes it `CSS:4434`. Sub text `fileKind(mime) · fileSize` `files.ts:61-62`. | Flip: spec/HTML make a mine file bubble the green bubble (`.mine .file__ic {background: rgb(255 255 255/.14); color: sent-ink}`), so delete the three paper overrides (`CSS:639-643`, `CSS:3159-3161`, the `:not(.ch-ms-bub--file)` at `CSS:4434`, and the same `:not(...)` at `CSS:2067,2079,2090,3213,3238,3240`) and style by owner. Layout: flex, gap 11, padding 10 14 10 10, min-width 230; tile 40 x 46 radius 9, tint bg, a type label (9.5/700, "PDF", "MOV") instead of the icon; title 14k/600 (today 500); sub 12k at .72 opacity (today 13 tertiary); drop the `Download` icon. "Video · 0:42" needs `durationSeconds`, which `getGolfMessageAttachments` returns (`src/app/golf/actions/message-attachments.ts:433-448`) but `loadAttachments` drops (`M:678-687`, maps only id, name, size, mime, url). "Scorecard · 96 KB" is a prototype word: use `fileKind`. Holdable: already (`.ch-ms-bub`). |
| MSG-501 Poll card | CONFLICTS | `polls.tsx:199-439` `PollCard`; CSS base `CSS:3446-3480` (gradient `--ch-sheet-bg` to green-50, `--ch-elevation-raised`, hairline), v2 override `CSS:5104-5121`: width 272, desk 330 (`@media (min-width:821px)...`), padding 12 all round, radius `xl xl tail` (so bottom-right 6 on EVERY poll). Legacy `CSS:3499-3504` adds bottom-left 6 on theirs and bottom-right 6 on mine (theirs therefore has both lower corners at 6). Header `polls.tsx:313-327`: icon on a green coin + "Poll" / "Poll closed" / "Voting ended" + " · Ends tomorrow at 6:00 PM" or "Final"; 12 medium tertiary (`CSS:3505-3512`, v2 `CSS:5114-5117` 13 strong secondary). Question 17 strong `CSS:5118`. Multi sub-line "Choose any that work" `polls.tsx:331`. Footer `polls.tsx:398-436` + `CSS:3759-3771`: count text then links. | Delete the Nov 4 card surface and replace it (not extend): the gradient/raised/hairline card `CSS:3446-3480` and the theirs bottom-right 6. Bg: recv flat (`--ch-bubble-theirs-bg`) + theirs bubble shadow, not the gradient/raised card; mine is also recv (card is not green) which today already holds. Padding 14 14 12 (today 12). Radius 20, bottom-right 6 on MINE only (today also on theirs: remove the shorthand's third value and the `:not(.is-mine)` BL rule `CSS:3502-3504`). Header copy "Poll · Choose one" / "Poll · Choose any" (13k/600 ink-2, plain 14 px icon, no coin `CSS:3514-3527`); the end phrase moves to the footer. Footer `{total} vote(s) · {closes}` ("3 votes · Closes Sunday 8 PM", "1 vote") 13k ink-2 plus "See votes" 12.5k/600 accent-text; today: "No votes yet", "3 of 8 voted", "Everyone voted", "1 vote", "N voted" (`polls.tsx:278-293`), end phrase "Ends ..." in the header (`polls.tsx:79-89`). Keep Final/Ended/countdown, Retry, Remind N, Close poll, Share result as extra links (not drawn). Never in a run, no tail, no receipt: already (`MV:1327`; tail only on text). |
| MSG-502 Poll option | CONFLICTS | `polls.tsx:335-398`; CSS `CSS:3560-3600` (flex, gap `--ch-space-2`, min-height 44, desk 40 `CSS:3586`, padding 8 12, radius 12, bg `--ch-poll-opt-bg` surface + key shadows `CSS:3454-3460`, font `--ch-type-16-medium`, lifts on hover `CSS:3687-3700`); fill `CSS:3626-3644` (green-50 to green-200 gradient) plus a separate 3 px `.ch-ms-poll__level` line `CSS:3645-3652`; mark 20 px, ring `inset 1.5px --ch-ink-500`, multi = square (`CSS:3696-3711`); label flex 1; "Most votes"/"Tied" chip `CSS:3677-3685` only when closed (`polls.tsx:380`); faces 18 px `Avatar` (`polls.tsx:367-376`, `CSS:5804-5811` overlap -4, no ring); count `--ch-type-15-strong` secondary, `min-width: 2ch`, "0" tertiary (`CSS:3743-3758`). | Delete and replace, not extend: the key look (`--ch-poll-opt-*` shadows, hover lift, press sink), `.ch-ms-poll__level`, the gradient fill and the closed-only leader chip with "Tied" all contradict the HTML, and the viewer's face must move from last to first. Grid `22px 1fr auto`, gap 10, margin 0 0 6, bg page-2 + well shadow `inset 0 1px 2px rgb(28 25 18/.06)` (drop the key shadows, hover lift `translate: 0 -1px`, press sink `CSS:3594-3609`); label 14k/500 (today 16, desk 15); ring 1.5 px ink-2 (today ink-500). Fill = accent 10% (yours 20%) `scaleX(share)`, delete `.ch-ms-poll__level` and the gradient/leader recolours (`CSS:3653-3675`). Chip "Most votes": 12/600 radius 7 margin-left 6 10% tint, shown on a sole leader with at least one vote, OPEN OR CLOSED (today: closed only, plus "Tied"; the 4 Nov D5 ruling "never nudge toward a leader while open" is contradicted by the HTML, `pollHTML` computes `lead` with no closed test). Faces: YOUR face first (today sorted LAST then `.slice(-3)`, `polls.tsx:368-371`), overlap -5, 1.5 px ring, then count 13k/600 tabular. Share denominator: HTML uses votes (`n / total`), code `pollShare` uses voters (`lib/golf/message-polls.ts:227-228`); identical for single-choice, differs for multi-choice. |
| MSG-503 Voting | PARTIAL | `polls.tsx:265-277` `pick` (single: tap own choice clears, other switches; multi: toggles, ids ordered by `encodeChoice`); optimistic via `useMessageResponses.vote` (`src/hooks/golf/use-message-responses.ts:187-191`); ring/check pop `CSS:5788-5803` (scale .6 to 1 on `--ch-dur-spring-pop`, tick `stroke-dashoffset 20 to 0` on `--ch-dur-base` + `--ch-ease`); bars `CSS:5122-5126` `transform: scaleX(var(--ch-poll-share))` on smooth; your face pops `CSS:5812-5821`. Multi-select is implemented (resolves Q-08). | Counts and footer text change by CROSSFADE (`Crossfade`/`FadeCopy` `polls.tsx:166-197`, base in / quick out) but the spec says "Counts change at once": render the number directly (keep the fade only for the footer if you want). `.ch-ms-poll__level` moves on `--ch-dur-release` (`CSS:3628-3640`) while the fill moves on smooth, so two bars disagree during a vote: removing the level (MSG-502) fixes it. Everything else matches. |
| MSG-504 New poll sheet | PARTIAL | `polls.tsx:655-985` `PollSheet` in a `Modal` (`polls.tsx:809-823`, `className="ch-msv-pollnew"`, width 400); head via `CSS:5344-5360` (Cancel left, title "New poll" centred, Send right 600, close key hidden). Fields: Question input (placeholder "Ask the team something"), "Choices" fieldset with numbered rows `aria-label="Choice N"`, placeholder "Choice 1/2" then "Add a choice", spare row appears as the last fills, 2 to 6 (`POLL_MIN/MAX_OPTIONS`), remove key; `Switch` "Allow multiple answers" (`polls.tsx:926`); "Closes" `Menu` row (`.ch-msv-closes` `CSS:5379-5400`) with No end / 1 hour / 1 day / 3 days / Custom (date + time fields, team clock) and a live "Voting ends ..." help line. Cmd/Ctrl Enter sends. Draft kept per conversation (`drafts` Map `polls.tsx:603`). | Per spec: visible labels "Question", "Choice 1", "Choice 2", "Choice 3" on each input (today a legend plus a number), inputs min-height 44 radius 12 well bg (today `.ch-input`, 44 phone), focus ring 2 px accent-text; Switch and Closes inside ONE `lcard` (today the Switch floats, Closes is its own card-button). Switch is the shared 40 x 23 (see MOT-X-7). "Closes" value is a duration label (today "No end"); keep the real options, the "Sunday 8 PM" sample is prototype copy. Send closes the sheet first in the HTML; today it closes after the server confirms (`polls.tsx:781-788`): keep today's order. Sheet chrome is the shared `Modal` (slice C owns MSG-407). |
| MSG-505 Votes sheet | PARTIAL | `polls.tsx:446-534` `PollVotesModal` in `Modal` (`className="ch-msv-sheet ch-msv-votes"`, width 400, title "Votes", description = question, `action` = "Final" when closed); per choice: heading + `n · pct%` (pct only when total > 0) + a 3 px `.ch-msv-votebar` under the heading (`polls.tsx:515-517`, `CSS:5764-5775`, static `width: %`), voter rows with `Avatar size="sm"` (28), name, role line (`lineOf` = directory subtitle), "Left the group"; "No votes yet" (`polls.tsx:518`); "Hasn’t voted" count + rows, coaches and a coach viewer left out (`polls.tsx:473`); footer "Draft a reminder" only when `remind` (coach, open poll, someone waiting) `polls.tsx:493-500`. Draft = `pollRemindDraft` (`lib/golf/message-polls.ts:367-371`): "Sam, Eli, can you vote in the poll when you get a chance? It ends today at 6:00 PM." via `thread.replyWith` (`MV:2187-2196`, `MP:406-417`) which ALSO sets a reply to the poll. | Voter face 32 (today 28), `vgroup` card per choice (radius 16, elev bg, 0.5 px hair, overflow hidden `.vgroup`) instead of flat sections on seams (`CSS:3847-3850`), 3 px accent-text bar pinned to the card's bottom edge at `pct%` (today a separate track under the heading). Reminder: spec text is "Reminder: vote in the practice round poll by Sunday 8 PM." with the poll name hard-coded in the prototype (Q-09); today's text is nicer and names people, keep today's. MISSING: the toast "Reminder drafted. It sends only when you tap Send" (nothing toasts after Draft a reminder). Sheet max-height: `CSS:5761-5763` 82% on phone (spec phone 78%, desk 82%). Voter DATA, see Risks 3. |
| MSG-506 Closed poll | DONE | `polls.tsx:79-81` returns "Final"; `state` head "Poll closed"/"Voting ended" `polls.tsx:313-320`; rows go `aria-disabled` (`polls.tsx:346`), closed styles `CSS:3610-3675`; `isPollClosed`/`pollState` `lib/golf/message-polls.ts:218-262`. | none (spec says keep). When the fills are restyled (MSG-502) restyle the closed variants too. |
| MSG-507 Poll states not drawn | DONE | Loading "Loading votes…" and error "Votes didn’t load" + `Retry` (`polls.tsx:278-282,407-412`); vote refused CH-7030 "Voting has ended" and CH-7029 "Your vote wasn’t saved" (`M:869-885`); send failure CH-7028 (`M:` `api.polls.send`) and earlier-copy CH-7031 (`polls.tsx:789-792,958-973`); close CH-7027 (`M:913-918`). | none |
| MSG-601 Details phone page | PARTIAL | `MP:767-910` `PhoneDetails` in `PhoneScreen` (`MP:802`), `PhoneBar back={{label:"Back"}} title="Details"` (`MP:803`); page `.ch-msp-page` padding `26 var(--ch-page-x-phone) 32` (`CSS:1632-1638`, 20 px edge at 430 via the token `tokens.css:1503`). `PhoneBar` builds the back aria as `Back to ${label}` (`ui/PhoneBar.tsx:81`). Pushed on the smooth spring by `shell/PhoneScreen.tsx` with the thread drawn back by `CH_UNDERLAY_SHIFT = 0.24` (`shell/phone-chrome.tsx:188`). | Back key aria today reads "Back to Back": pass `ariaLabel: "Back to conversation"` (spec). Bottom padding 40 (today 32). The 24 % underlay shift vs spec 30 % is the shared push (see MOT-DET-1). Title and champagne back link already match. |
| MSG-602 Details desktop column | PARTIAL | `MV:2754-2865` `Details` (`<aside class="ch-ms-det">`), mounted by `MessagesDesktop` `MV:3369-3377` while `useDetailsColumn` says so (`details-v2.tsx:337-372`). Grid: legacy `CSS:3-9, 27-29` (`340px 1fr`, `340px 1fr 300px`), v2 only inside `@container (min-width: 1101px)` `CSS:4068-4081`: `320px 1fr 0px` / `320px 1fr 300px`, `.ch-ms { overflow: clip }`, `.ch-ms-det { width: 300px; min-width: 300px }`. At or below 1100 px the container rule `CSS:1309-1324` applies: rail 300, details `position:absolute` over the thread, `box-shadow`, NO column motion. `.ch-canvas` is the container (`styles/shell.css:23`; I grepped every `container-type`/`container:` in `styles/*.css`, none sits between the canvas and `.ch-ms`, and the `[data-ch-ms-v2]` wrapper is `display: contents`), so the test is the CANVAS width, by cascade (not rendered): viewport 1280 gives about 1032 (sidebar 240 + 8 margin) and falls in the floating branch; viewport 1440 gives about 1192 and already gets the three-pane grid; a folded sidebar (56 px) at 1280 gives about 1216, which also passes. Close key `IconButton X "Close details"` in a head row with the title text "Details"/"Group details" (`MV:2788-2796`). Thread header: info key toggles (`MV:2296-2326`, key at `MV:2316`), the name is not a button. | Make the 3-pane grid the rule at the spec's 1280: lower or remove the 1101 container threshold (the single/dual-pane collapse stays at 720 `CSS:1326-1349`; Q-10 leaves the exact width open). Today at 1280 the user gets a 300 px rail and a floating panel, not `320, 1fr, 300`. Rail 320 is only set in the v2 branch (legacy 340/300). Drop the "Details" title text in the column head; keep only the close key at top right (aria "Close details"). Content pinned to the column's RIGHT edge (HTML `.desk .details > .scroll {left:auto; right:0; width:300px}`): today the 300 px aside starts at the track's left edge and is clipped from the right, so content travels with the track instead of being revealed by it. Name tap should also open details (spec). Sections inside: hero 64 face (Avatar `xl`, `ui/Avatar.tsx:19`) ok. |
| MSG-603 Header block | PARTIAL | Phone `MP:807-826`: `Avatar size={84}`, `h2` `--ch-type-22-strong` (`CSS:5243-5246`), sub `p` 15 secondary (`CSS:5247-5249`). Desktop `MV:2797-2809`: `Avatar xl` 64, name `CSS:5422` 17 strong, sub `CSS:1136-1142` 13 tertiary. Sub string `detailsLine` `details-v2.tsx:164-168` ("Junior · Demo University Golf", "Team channel · 11 members", "Group · 6 members"). | Desktop name 18/700 (today 17/600), sub 15 ink-2 (today 13 tertiary). MISSING: " · Muted" appended when muted (spec): `detailsLine` ignores `api.mute`; today muted state only shows in the bottom Notifications section (desktop `MV:2866-2940`) or the phone panel note (`MP:861-880`). Group face is the `GroupMark`/`ch-ms-grp is-xl` coin, not 84/64 sized flag/users art: check the sizes against `CSS:178`. |
| MSG-604 Quick actions | PARTIAL | `details-v2.tsx:92-162` `QuickActions`; grid `[data-ch-ms-v2] .ch-msp-tiles` `CSS:5254-5258` (`repeat(var(--ch-msp-n,4), 1fr)`, gap 8; `n = 3 + (profileHref or group ? 1 : 0)`), tile `CSS:5259-5268` (radius 12, padding 8 2 8, card bg + card shadow, label 13 medium secondary, icon 20 green-600). Mute tile `details-v2.tsx:116-132`: `aria-pressed`, BellOff + "Muted"/Bell + "Mute"; `popIn(…, 0.92)` fires on TAP (`:124`); menu `MuteMenu` `details-v2.tsx:65-90` labels "Mute 8 hours" / "Mute a week" / "Until I turn it on"; Search toggles an inline `ConversationSearch` (`:170-184`); Files scrolls to `.ch-msv-files`; Profile (`Link`, coach viewer + player DM only, ruling 20 ok); Add (group creator) / Leave (non-creator, non-channel). | (a) Muted ON state has no accent fill: the legacy `.ch-msp-tile[aria-pressed='true']` wash/ring `CSS:2283-2286` is overridden by the later equal-specificity v2 tile rule `CSS:5259` (by cascade, not rendered), so only icon and label change. Spec: accent fill + accent-ink. (b) `pop` .92 to 1 should fire when the choice is made and the tile flips, not on the tap that opens the menu (`MOT-DET-3`). (c) Radius 14, padding 10 2 9. (d) Menu labels: SPEC/HTML "For 8 hours / For a week / Until I turn it on" vs ruling 19 + test `messages.test.tsx:337,356,364` pinning "Mute 8 hours"; a decision is needed, default keep today's (SPEC MSG-409 already says keep today's mute strings). (e) Row menu "Mute…" still opens `RowMuteModal` (`MV:439-503`, a `Modal` with buttons, copy "Mute {title}") not the MSG-410 popover: slice A/C boundary. (f) The grid keeps `--ch-msp-n = 4` for a non-creator in the team channel (3 tiles in 4 columns). |
| MSG-605 Members card | PARTIAL | `details-v2.tsx:186-246` `MembersCard`; first 6, "Show all {n}" (`:236-241`), "You", Coach chip (`.ch-msv-coachchip` `CSS:5280-5286`), creator shown as "Admin" in the role line (`:225`), remove key for the creator; `Avatar size="md"` (36) `:222`; header `.ch-msv-members__h` `CSS:5448-5463` (13 secondary, title 15 strong, count `ch-num` secondary). Class status for DMs, see MSG-606. | Face 32 (md is 36), row min-height 52, card header 17k/600 with the 0.5 px hairline under it from x = 16 and the count in accent-text (today 15 strong, count secondary, no hairline). "Captain" chip: SETTLED/`details-v2.tsx:185` comment says no Captain chip, HTML draws one from the role text; spec says "Coach (or Captain)". Needs a role source (none in `ChMember`). Remove-member key and "Admin" are extras, keep. |
| MSG-606 Class status card (DM) | PARTIAL | Desktop `MV:2822-2837`, phone `MP:827-839` render `ThreadClassSection` (`ThreadClassSection.tsx:15-30`) only when `api.classDay && !conv.group && viewer is coach`; data `class-thread.ts:22-26,35-57`: copy "No class status" (untracked), "In class until 11:50 AM · STAT 201" / "In an exam until ..." / "Class at ..." / "Travelling · X" / "No class right now", then "Today: STAT 201 9:05 to 9:55 AM · ...", then "From Cole’s class schedule · pushes held during class". `api.classDay` is null unless `classOn` = flag `useClassAwareness()` && coach (`M:84-87,718`). Header line: `ThreadClassSub.tsx:18-30` swaps the sub line for the status (coach, DM). | Card is coach-viewer-only today; spec "Players only; privacy-gated" reads as "about a player" and matches. Visuals: green `--a-unread` status dot + ONE line ("No classes today. Next: Monday 9:05 AM, Statistics"); today three lines, no dot, class codes. The "Next: Monday ..." clause is NOT derivable: `ChClassDay` is a single day (`src/lib/golf/class-day-shape.ts:60-67`, `on`, players' `blocks` for that date only) so tomorrow/Monday needs a loader change (`useTeamClassDay`, `data/class-awareness*`). Decide whether to keep the richer coach copy (default: keep, restyle into the lcard with the dot). Header: spec MSG-201 says the sub is the role line; `ThreadClassSub` replaces it with the live status for a coach (slice B). |
| MSG-607 Photos and files card | PARTIAL | `details-v2.tsx:279-335` `PhotosAndFiles` + `PhotoTile` `:251-277`; data `useConversationFiles` `files.ts:25-59` -> `api.files` `M:668-676` -> server action `getGolfConversationFiles` (`message-attachments.ts:556-598`, newest first, LIMIT 100, metadata only, Clubhouse-gated). Grid `.ch-msv-ptiles` `CSS:5507-5512` (3 cols, gap 6, padding 4 16 8, tile radius 8); 6 tiles then 2 file rows, "See all" button at the foot (`:325-331`) expands in place (`all` state) and only appears past 6 images / 2 files; file row = 32 px tile with `FileText` icon + name + `fileMeta` "PDF · 96 KB · Today" (`files.ts:65-66`); empty "No files shared yet." (CH-7306), loading skeleton (CH-7409), error notice (CH-7214). Header count `ch-num` of all files. | "See all" link in the HEADER at the right (accent-text 500), always when there is something to expand; tiles gap 4, padding 12, radius 10; card header per MSG-605. Rows already match the meta format. Photo tiles sign per tile: see Risks 2. Image tile tap opens the signed URL in a new tab (`files.ts:42-57`), the thread's photo opens an in-app viewer (`MV:899`): unify if desired. |
| MSG-608 Mute states | PARTIAL | State: `M:603-628` (`getGolfConversationMute` per open thread), `M:642-651` `muteConversation`, `M:1005-1017` api. Server `src/app/golf/actions/message-mute.ts:15-36` computes `muted = level==='muted' && (no until or until > now)` on every read, writes `muted_until = now + hours` or null (`:51-52`), accepts 1 to 8,760 h. Row glyph set `use-row-mutes.ts:11-36` (`isMutedRow`, one read of the viewer's participant rows, `useEffect` deps `[enabled, viewerUserId, tick]`). Toasts: `details-v2.tsx:59` ("Unmuted" / "Mute 8 hours" / "Mute a week" / "Until I turn it on") AND `M:650` ("Conversation muted" / "Notifications back on", `replace:'mute'`). | (1) BUG: muting from Details calls `api.setMute` = `muteConversation` WITHOUT `rowMutes.refresh()` (`M:1013`; only `api.muteConversation` refreshes `M:1015-1019 (refresh at 1017)`), so the inbox row's bell-off glyph does not update until a reload. (2) Expiry only applies at read time: an 8-hour mute left open stays "Muted" in the tile and the row (no timer, no refetch on focus), spec says the conversation returns to unmuted automatically; add a re-read at `until` (and on visibility). (3) Two toasts per action (`details-v2.tsx:59` + `M:650`, the second has `replace`, the first does not): keep one. (4) Details sub " · Muted" and the on-state tile (MSG-603/604). (5) Dead code to delete with it: in `PhoneDetails` the `<Modal open={choosing}>` mute sheet (`MP:888-900`) plus its `choosing` state, local `setMute` and `muteBusy` (`MP:773,787-795`) can never open, because `setChoosing(true)` is never called (the tile goes through `useMuteAction`, `MP:887`). (6) Desktop `MuteControl` (`MV:2869-2940`, "Notifications" section with Mute 8 hours / a week / Until I turn it on buttons and an Unmute button) duplicates the quick action: delete it (phone already dropped its twin, `MP:861-880`). The three durations (8, 168 h, null) are right. |
| MSG-609 Details loading/error/long | DONE | Members skeleton CH-7405 / notice CH-7204 (`details-v2.tsx:197-204`), files CH-7409/7214/7306 (`:290-307`), mute CH-7407/7208 (`MP:861-872`, `MV:2885-2895`); long lists via "Show all {n}" and "See all". | none |
| MSG-701 First run | PARTIAL | `MessagesFirstRun.tsx:12-40`, `isMessagesFirstRun` `:43-46`. Copy matches exactly: h2 "No conversations yet", body "Message a player, a coach or the whole team. Everything stays inside {team}.", "Start a conversation", ghost "Message the team" (coach only). Illustration is an inline SVG 168 x 120 (`CSS:5134-5137`, art in `:15-26`). CSS `CSS:5161-5200`: width `min(360px,100%)`, margin 24 auto, padding 24 20 20, gap 8, radius 16, card shadow; h2 `--ch-type-20-strong`; p 15 secondary, no max-width; CTA min-height 44, padding 0 16, flat `--ch-bubble-mine-fill`, 15 strong; ghost 15 strong green-600. Desktop: centred in `.ch-ms-thread.is-empty` (`MV:3331-3341`, `CSS:5138-5143`); rail shows "No conversations yet" context line (`MV:668`) + search, no filter (`MV:675`). Phone: `MP:260,277,306-308` hides the search/filter block, `.ch-msp-home:has(> .ch-msv-empty)` centres it (`CSS:5144-5148`). | Padding 26 20 20, gap 10, body max-width 280, CTA padding 0 18, ghost 14.5/600 (small). Fully static already (nothing loops). Phone top padding 140 is the bar offset, check with the app's real bar. "Start a conversation" opens New message, "Message the team" opens New message seeded with the whole team: ok. |
| MSG-702 New message page | PARTIAL | Desktop `NewMessagePane.tsx:18-110`: sticky glass bar (title "New message" left, "Cancel" right `:50-55`), To card (`.ch-msv-tocard` `CSS:5584-5606`), "Suggested" card with "People you haven’t messaged" (`:70-86`), extra coach card New group / Announcement (`:87-106`). Phone `MP:911-1202` `PhoneNewMessage`: bar Cancel (text, no chevron) + "New message" + Next/Create group (coach), To field with tokens (`.ch-msp-tok`), "Suggested"/"Results" heading (`MP:1139`), people list, Quick groups, first-message composer footer. Token `CSS:5538-5541` = SOLID accent bg with on-accent ink; phone token text is the FIRST name, desktop the full name (`NewMessagePane.tsx:60-63`, `MP:1084-1087`); no face. Caret is the browser's (SETTLED ruling 21). Filtering REMOVES non-matching rows (`NewMessagePane.tsx:34`, `MP:956`). | Token: 22 px face + name, bg chip tint (10% accent) with accent ink, 600, radius 999 (today solid green fill, white ink, no face). Header copy "Players you haven't messaged" (desktop says "People", phone has no sub). Non-matching rows DIM to .35 over 180 ms (spec) instead of vanishing (today filtered out, which also re-lays out the list). To card min-height 52 padding 12 16 (ok). Spec says caret blinks `steps(1)` 1 s: native caret, keep. Extra coach rows and the first-message composer are not in the spec, keep. |
| MSG-703 Pick a person | PARTIAL | Pick: desktop `NewMessagePane.tsx:35-47`, phone `MP:960-972` -> `popIn(el, 0.8, true)` on the token (`details-v2.tsx:23-32`, scale only, `chSpringCurve('pop')`), then `tokenBeat()` = pop curve ms (496) or 0 under Reduce Motion (`details-v2.tsx:34`), then `api.startDirect` (`M:354-383`): opens the existing DM or CREATES the conversation on the server (`createGolfConversation`) and opens it. Desktop: `onCancel()` then the pane swap through `Swap` (`MV:3304`, `ui/Swap.tsx:68-76` rise 6 px on the settle spring + 260 ms opacity, with a 180 ms leave). Phone: the thread is a pushed `PhoneScreen` that slides in (`MP:185-199` mounts it, `shell/PhoneScreen.tsx:129-130`). | Wait 520 ms (200 under Reduce Motion) not 496/0; token should also fade (`scale .8 opacity 0 to none`). Phone: spec "new thread page fades in 220 ms over the form"; today the thread slides in over the exiting form (both inside one `AnimatePresence`, `MP:184-237`). Desktop: spec swap is opacity 0 to 1 + 6 px rise over 260 ms `--ch-ease`; `Swap` is close but the rise uses the settle spring (417 ms) and a leave animation exists. Existing DM opens it, a fresh one shows `HelloCard` (MSG-222, `MV:2370`, `MP:508`): ok. Note `startDirect` writes a server conversation on pick (an empty one if the user then leaves): unchanged behaviour. |
| MSG-704 No team / no access | DONE | `MessagesNoTeam.tsx:4-13` (`MessagesHead` + `NoTeam` CH-7308) used by `routes/messages.tsx:26-28`; tested `messages.test.tsx:1082-1094`. | none (spec: keep). Note the `data-ch-ms-v2="on"` literal on its `<main>` (`:6`) is independent of the `MessagesScreen` wrapper. |
| MSG-801 Three panes | PARTIAL | `MessagesDesktop` `MV:3257-3389` renders `<main class="ch-ms [has-open] [has-details]">` with `Rail`, `Swap`ped pane (thread / `NewMessagePane` / first run / empty), `Details`. Columns: see MSG-602 (v2 grid only above a 1101 px canvas). Rail 320 in v2 (`CSS:4072`), 300 or 340 otherwise. Top bar row is the shell's, not part of `.ch-ms` (`CSS:3-9` height `calc(100dvh - 16px - var(--ch-topbar-h))`). | Same threshold fix as MSG-602. The "top bar spans all columns" is satisfied by the shell (MSG-007). The details column opening is wired as the one layout animation (MOT-DET-2). |
| MSG-802 Desktop-only behaviour | PARTIAL | Hover bar `CSS:5657-5720` (`.ch-msv-hoverbar`, 144 x 32.6, keys 26.9, top -20); selected rail row wash `CSS:4110-4112` (5% ink); right-click `ConvRowButton`/`useLongPress` `MV:1045-1109`. In slice D: Escape closes New message (`NewMessagePane.tsx:24-30`, `MP:1004-1018`). Escape does not close the details column. | Hover bar numbers are slice C (spec 5 keys 28, `top -18`, offsets +-64; today 3 reactions + reply + more, 26.9). For D: nothing else to build; the Escape order lift/sheet/popover/attach is C. |
| MSG-803 Desktop pane switch | PARTIAL | `MV:3277-3279` `pane` turn counter; `Swap swapKey={pane.turn}` (`MV:3304`); `ui/Swap.tsx` `SETTLE` (`:56-60`): enter `opacity 0 + translate(0,6px)` to rest on the `settle` spring (417 ms) with opacity over `CH_DUR.base` (260 ms); leave `opacity 0, -3 px` over 180 ms; the first thread of a visit appears with no motion (`pane.key === null`, `MV:3279`). Selected rail row + read marker update in `select` (`M:280-297`). | Spec: opacity 0 to 1 and translateY 6 to 0 over 260 ms `--ch-ease`, no leave. Close; swap the spring for the ease or accept `settle` (417) as the app's curve. Reduce Motion: `INSTANT`. |
| MSG-804 Narrow viewport | DONE | `screens/messages/MessagesScreen.tsx:25-39` picks phone below `CH_PHONE_QUERY` (`lib/phone-query.ts:6`, max 820 / short coarse); `@container (max-width: 720px)` `CSS:1326-1349` gives desktop one pane (rail or thread). | none (width not drawn, Q-10). Interaction with MSG-602: the container thresholds (720 / 1100 / 1101) must be decided together. |
| MOT-POLL-1 | DONE | Ring pop `CSS:5788-5790,5794-5801` (`scale .6 to 1`, `--ch-dur-spring-pop` 496 ms, `--ch-ease-spring-pop`); tick `CSS:5791-5793,5802-5806` `stroke-dashoffset 20 to 0` on `--ch-dur-base` (260 ms) `--ch-ease`; only the tapped row (`data-pop` via `tapped`, `polls.tsx:359`); Reduce Motion `CSS:5821-5830` (animation none; the older fade rule is `CSS:3819-3825`). | none (the check path is `pathLength=20`, `polls.tsx:362`). Spec: "Check appears" under Reduce Motion: ok. |
| MOT-POLL-2 | DONE | `CSS:5122-5126` `.ch-ms-poll__fill {transform: scaleX(var(--ch-poll-share)); transform-origin: 0 50%; transition: transform var(--ch-dur-spring-smooth) var(--ch-ease-spring-smooth)}` (462 ms smooth `linear()` where supported, `tokens.css:1333-1334`); a CSS transition retargets from the live value; Reduce Motion `transition: none` (`CSS:5127-5131`). All options update together (shared `--ch-poll-share`). | none for the fill. The separate level line is on 280 ms (see MSG-502/503). Counts change by crossfade not "at once" (MSG-503). |
| MOT-POLL-3 | DONE | `CSS:5812-5822` `ch-msv-face-pop` (`opacity 0, scale .4` to rest) on `--ch-dur-spring-pop`, only the viewer's face when `tapped === option` (`polls.tsx:372`); Reduce Motion fade `CSS:5826-5830`. | Face must be present in the stack (see ordering in MSG-502: today the viewer's face is last, spec first). |
| MOT-POLL-4 | PARTIAL | Phone: shared `Modal` bottom sheet, rises on the smooth spring (`dialog-lifetime.ts:104-107`, CSS `controls.css:563`), live restart from `caught` (`:57,174`), scrim by `--ch-scrim-a`; closes `translateY(100%)` over `CH_DUR.release` (280 ms `cubic-bezier(.22,1,.36,1)`) from the live frame (`:148-166`), a flick uses the thrown exit (`:163`). Desktop: panel `animation: ch-pop var(--ch-dur-base)` = `opacity 0, translateY(6px) scale(.98)` (`controls.css:437-447,531-536`); leaves `translateY(6px) scale(.98)` + fade (`dialog-lifetime.ts:148`). | Desktop open/close should be `scale .94 opacity 0 to none` on smooth, close `scale .96` (today `.98` + 6 px, base 260 ms). This is the shared sheet primitive (slice C owns MSG-407); D just inherits. Phone ok. |
| MOT-DET-1 | PARTIAL | Details is a `PhoneScreen` (`MP:802`) pushed over the thread (`covered={details}` on the thread, `MP:197`): smooth spring slide (`shell/PhoneScreen.tsx:129-130`), under-page draws back 24 % of the width (`phone-chrome.tsx:188`) and dims with `--ch-push-dim: rgb(20 18 12 / 0.1)` (`tokens.css:1408`, `shell.css:1606-1627`); Reduce Motion: fade over `chFade` (`PhoneScreen.tsx:144`). | Spec MOT-LIST-1: under-page to -30 % (today -24 %). One number for every phone push (`CH_UNDERLAY_SHIFT`), so it changes inbox to thread too: coordinate with slice A/B. |
| MOT-DET-2 | PARTIAL | `details-v2.tsx:337-372` `useDetailsColumn`: sets `grid.style.transition = 'grid-template-columns var(--ch-dur-spring-smooth) var(--ch-ease-spring-smooth)'` inline (462 ms smooth curve) unless Reduce Motion (`:342-352`); keeps the panel mounted for 502 ms on close (`:353-370`) and re-pins the thread to the end every frame for 502 ms when it was within 48 px of the bottom (`:355-366`); CSS tracks `CSS:4068-4081`. A CSS transition retargets live, so a close mid-open turns round. | Works only in the `>= 1101 px` canvas branch (see MSG-602): at 1280 the panel just appears over the thread. Panel content slides with the track instead of being pinned right (MSG-602). Reduce Motion: `ch-msv-det-fade` 180 ms (`CSS:5401-5410`, `--ch-dur-crossfade-rm`) vs spec 120 ms (Q-05 ruling 25 prefers the shared 180). Pin threshold 48 px vs "within 60 px" in `pinBottom`. |
| MOT-DET-3 | PARTIAL | Menu: `MuteMenu` `details-v2.tsx:65-90` renders `.ch-msv-lift` + `.ch-msv-holdmenu.is-mute` (`CSS:5290-5298`) with NO entrance or exit animation (the `ch-msv-lift` keyframe `CSS:4769` belongs to the attach menu), unmounts at once on pick/scrim/Escape. Tile pop: `popIn(e.currentTarget, 0.92)` on tap (`details-v2.tsx:119`, `:23-32`). | Menu `scale .8 opacity 0 to none` from the anchor on `lift`, 160 ms fade out (MISSING); origin = anchor corner. Tile `pop .92 to 1` must run when the muted state flips (today on the opening tap, and again on the unmute tap). Same menu is the row menu's Mute… in the spec (MOT-X-8). |
| MOT-EMP-1 | DONE | `.ch-msv-empty` and its SVG have no animation or transition (`CSS:5134-5200`; the card is static, nothing loops). | none |
| MOT-EMP-2 | PARTIAL | See MSG-703. Token pop is scale-only `popIn(el, 0.8, true)`; beat is `tokenBeat()` (496 / 0). Other suggestions are removed, not dimmed. | 520 ms (200 Reduce Motion), `opacity 0` on the token, dim to .35 over 180 ms, 220 ms thread fade (phone) / pane swap (desk). |
| MOT-EMP-3 | MISSING | Starter fill: `HelloCard.tsx:10-24`, `MV:2370` / `MP:508` -> `setSeed({text, nonce})` -> `Composer` `applySeed` (`MV:1866-1880`): sets the draft, focuses, caret at end; never sends. If the field already has text it asks to replace (`MV:2122`). No `pop` on the composer pill. | Add `scale .98 to 1` on `pop` on the composer pill (`comp__in`) when a starter fills it (slice B owns the composer markup; D owns the trigger). Reduce Motion: none. |
| MOT-X-7 | PARTIAL | `Switch` shared primitive: track 40 x 23, thumb 19, travel `translateX(17px)` over `--ch-dur-base` (260 ms) `--ch-ease-spring` (= `cubic-bezier(.34,1.3,.64,1)`, `tokens.css:895`), track colour 260 ms (`styles/controls.css:759-790`); off ring `[data-ch-ms-v2] .ch-switch input:not(:checked) + * {box-shadow: var(--ch-messages-x5)}` = inset 1.5 `--ch-switch-off-ring` (`CSS:5287-5289`, token def `CSS:5863`). Used at `polls.tsx:926`. | Spec: 44 x 26, knob 22, `translateX(18px)` 320 ms, track 250 ms. Either add a Messages-scoped override of `.ch-switch__track/__thumb` (the Switch is app-wide) or accept the shared 40 x 23. Reduce Motion: `--ch-dur-base` is 0 ms (`tokens.css:1354`), ok. |
| MOT-X-12 | PARTIAL | Phone: New message is a `PhoneScreen` push (`MP:1065`, smooth slide; mounted `MP:212-231`) = MOT-LIST-1 minus the avatar flight, so ok. Desktop: `newPane` replaces the `Swap` pane by a plain conditional (`MV:3297-3303`), no fade. | Desktop form fades in over 200 ms (opacity, no transform); wrap `NewMessagePane` in an opacity animation or put it inside the same `Swap` with a 200 ms variant. |
| D-POLL-WHO (polls.tsx: who creates / closes) | PARTIAL | Create: UI only in group threads: `PollButton` returns null when `!conv.group` (`polls.tsx:991`), `ComposerPlusV2` `canPoll = conv.group && !!api.polls` (`ComposerPlusV2.tsx:63`), test `messages-polls.test.tsx:209-215`. Server `sendGolfPoll` allows ANY participant of ANY conversation (`src/app/golf/actions/message-polls.ts:55-78`), no role or group test. Close: sender only, UI `mine && !closed && tally` (`polls.tsx:424-428`), server `row.sender_id !== user.id` refuses (`message-polls.ts:158`). Remind: coach, open poll, someone waiting (`polls.tsx:232-244`). Share result: sender or coach, final, >= 1 vote (`polls.tsx:245-252`). | Spec MSG-312/504 draws Poll in the attach menu with no group condition (HTML shows it in every thread). Decide whether DMs get polls (server already allows it; "n of m voted" is meaningless in a DM, the spec footer no longer says it). Nothing in the spec removes Remind/Close/Share, keep. |
| D-POLL-VOTERS (voter data) | PARTIAL | Everything about voters comes from ONE client read: `useMessageResponses` -> `select('message_id,user_id,choice,updated_at')` from `golf_message_responses` for the thread's poll ids, 100 ids per page, plus a realtime channel (`src/hooks/golf/use-message-responses.ts:76-77,128-141`); wired at `M:489-491` and mapped by `tallyPoll` (`lib/golf/message-polls.ts:178-200`) to `PollTally {counts, voters: Record<optionId, userId[]>, voterCount, mine, leaders}`. Every member can read every vote (RLS `golf_message_responses_select` gated by `golf_conversation_has_me`, `supabase/migrations/20261024090000_golf_message_responses_access.sql`, applied 2026-10-25). Names, faces and roles come from `api.directory` (`polls.tsx:213,363-376,462-478`), so a voter who left the team reads "Member" and "Left the group". Vote TIMES are fetched (`updated_at`) but never shown ("No vote times in v1", `polls.tsx:440-443`). Today shown: up to 3 faces per option (18 px, `Avatar` initials from the directory), counts per option, the footer total, and in the sheet every voter by name with role line and "You" first plus "Hasn’t voted". | None needed for the new spec (no times). If voter faces gain a ring or "Just now" times appear later, `updated_at` is already in the row. No server loader is involved: the sheet is client-derived from the same rows as the card. |
| D-FILES (files.ts / message-attachments) | PARTIAL | `getGolfMessageAttachments` signs every attachment of one message (1 h, `message-attachments.ts:402`), `getGolfConversationFiles` lists metadata only (100 newest, no URLs, no width/height, `:515`). Thread: `Attachments` lazily signs when within 800 px of the viewport (`MV:929-936`), retries an empty list once after 1.5 s (`MV:951-953,965`), re-signs after 45 min on a 5-minute timer and on `visibilitychange` (`MV:972-985`). Details tiles: one `api.attachments(messageId)` call PER TILE (`details-v2.tsx:251-277`), no cache. | "See all" is an in-place expand, never a separate screen. Spec has no new data needs, but see Risks 1 and 2. |
| D-PREFILL (prefill.ts) | DONE | `prefill.ts:16-133` unchanged contract (`messagesPrefillHref`, `takePrefill`, `onRoster`, `seedThreadFiles`, `takeThreadFiles`); consumed in `M:196-263`, phone `MP:132-134,933`, desktop `MV:3263-3265`. | none; New message restyle must keep `api.prefill` (`to`, `draft`, `title`) and the dialog fallback `NewMessage` (`MV:2941-3256`), which desktop still uses for prefilled and group/announcement flows (`MV:3258-3262`, `3379-3386`). |

### Code map

#### polls.tsx (998 lines) -- slice D owns it whole

| Lines | Name | Holds |
| --- | --- | --- |
| 55-77 | `ChPollsApi` | tally / vote / pending / error / retry / send / close contract |
| 79-89 | `endsLabel` | "Final", "Ends in N min", "Ends tomorrow at ..." (MSG-501 header, moves to footer) |
| 91-96 | `notePollHold`, `heldSince` | long-press-is-not-a-vote guard; called from `MP`'s hold code |
| 102-133 | `usePollClock` | exact-end timer, 15 s tick last hour |
| 135-149 | `PollThreadActions`, `PollThreadContext`, `PollCardActions`, `pollCardActions` | reply-with-draft seam used by `MV` Thread (2187-2196, provider 2267) and `MP` PhoneThread (406-417, provider 461) |
| 152-197 | `shortNames`, `FadeCopy`, `Crossfade` | crossfades (to remove for counts) |
| 199-439 | `PollCard` | MSG-501/502/503, 506, 507, D-POLL-WHO (remind, share, close) |
| 440-534 | `PollVotesModal` | MSG-505 (+ MOT-POLL-4 via `Modal`) |
| 536-571 | `ClosePollModal` | "Close this poll?" confirm (not drawn) |
| 573-653 | `ENDS`, `PROBLEM`, `PollSheetDraft`, `drafts`, `seedPollDraft`, `usePollSeed`, `clearPollDrafts`, `endsWords` | Ask handoff and drafts; `seedPollDraft` is called from `M:235` |
| 655-985 | `PollSheet` | MSG-504 |
| 988-998 | `PollButton` | old composer plus-key poll (group only) |

#### details-v2.tsx (372 lines) -- slice D owns it whole

`popIn` 23-32, `tokenBeat` 34, `useMuteAction` 37-63, `MuteMenu` 65-90,
`QuickActions` 92-162 (MSG-604, MOT-DET-3), `detailsLine` 164-168,
`ConversationSearch` 170-184, `MembersCard` 186-246 (MSG-605), `PhotoTile`
251-277, `PhotosAndFiles` 279-335 (MSG-607), `useDetailsColumn` 337-372
(MOT-DET-2). Imported by `MV` (line 91), `MP` (line 105) and
`NewMessagePane.tsx` (line 10: `popIn`, `tokenBeat`).

#### Other whole files owned by D

`files.ts` (66), `class-thread.ts` (57), `group-class.ts` (48),
`GroupClassLine.tsx` (48), `ThreadClassSection.tsx` (30), `ThreadClassSub.tsx`
(30), `use-row-mutes.ts` (37), `MessagesFirstRun.tsx` (46), `HelloCard.tsx`
(25), `MessagesNoTeam.tsx` (27), `NewMessagePane.tsx` (110), `prefill.ts` (133),
`MessagesScreen.tsx` (40, only the phone/desktop pick and the `data-ch-ms-v2`
wrapper). Server side (not under screens):
`src/app/golf/actions/message-mute.ts`, `message-attachments.ts`,
`message-polls.ts`, `src/hooks/golf/use-message-responses.ts`,
`src/lib/golf/message-polls.ts`.

#### MessagesView.tsx (3,389 lines) -- shared monolith, seams for D

| Lines | Name | D's part |
| --- | --- | --- |
| 177-341 | `ChPendingAttachmentSend`, `ChAttachmentRecovery`, `ChMessagesApi` | D fields: `attachments` 250, `files` 271, `classDay` 277, `directory` 279, `startDirect` 282, `prefill` 285, `mute*` 297-304, `polls` 333. Adding fields here touches every slice's test mocks |
| 439-503 | `RowMuteModal` | row Mute… (slice A/C: should become the MSG-410 popover) |
| 640-744 | `Rail` | D: first-run rail (668, 675) only; rest is slice A |
| 875-910 | `ImageAttachment` | MSG-220 |
| 911-1044 | `Attachments` | MSG-220/221 (loading skeleton 1004-1010, failed 984-1002, file bubble 1012-1031) |
| 1110-1539 | `Bubble` | D touches only 1326-1328 (`PollCard`), 1339-1341 (`Attachments`); the rest (press, hold, tail, name, receipt, hover bar, reactions) is B/C |
| 1777-2135 | `Composer` | D: 1866-1880 starter seed (`applySeed`), 2062 `GroupClassLine`, 2069 `ComposerPlusV2` mount |
| 2152-2448 | `Thread` (desktop) | D: 2187-2196 `pollThread`, 2273-2326 header (details toggle, `ThreadClassSub` 2292), 2362-2372 `HelloCard` |
| 2543-2753 | `LeaveGroupModal`, `DeleteConversationModal`, `RemoveMemberModal`, `AddMembersModal` | group admin sheets reached from Details (keep) |
| 2754-2865 | `Details` | MSG-602/603/606/607 desktop |
| 2866-2940 | `muteLabel`, `MuteControl` | MSG-608: `MuteControl` is to be deleted; `muteLabel` is used by phone and `RowMuteModal` |
| 2941-3256 | `NewMessage` (dialog) | still used for prefill, groups and announcements on desktop |
| 3257-3389 | `MessagesDesktop` | MSG-801 and the pane switch (3277-3279 turn counter, 3304 `Swap`, 3331 first run, 3369-3377 details mount) |

#### MessagesPhone.tsx (1,270 lines)

| Lines | Name | D's part |
| --- | --- | --- |
| 128-244 | `MessagesPhone` | stack/history logic (`details` state 136, `depth` 152), `PhoneNewMessage` mount 212-231 |
| 245-359 | `PhoneInboxV2` | D: first-run branch only (260, 277, 306-308) |
| 366-699 | `PhoneThread` | D: 406-417 `pollThread`, 473 `ThreadClassSub`, 506-520 `HelloCard`; 632 and 675 `PollSheetRows` mounts (hold sheet entries for polls, outside the spec's poll menu: Reply/Delete only) |
| 714-730 | `PollSheetRows` | See votes / Remind / Close poll / Share result rows |
| 753-766 | `Panel` | used by `PhoneDetails` only |
| 767-910 | `PhoneDetails` | MSG-601/603/604/606/607/608 phone |
| 911-1202 | `PhoneNewMessage` | MSG-702/703 phone |
| 1203-1270 | `PhoneAnnouncementForm` | not in this slice |

#### Messages.tsx (1,094 lines), one component `Messages` (73-1094)

D parts: class awareness 83-87 and 718; prefill state 98-104 and deep link
195-263; `landDraft` 343-352, `startDirect` 354-383, `createGroup` 384-431; poll
responses 489-491 and `api.polls` 867-919; mute state 603-651 (toast at 650);
`addCandidates` 653-666; `loadFiles` 668-676; `loadAttachments` 678-687;
`rowMutes`/`shownConvs` 689-693; `api` members 920, mute 1010-1019, files 981,
prefill 991-993.

#### CSS (`styles/messages.css`)

Polls base 3442-3860 (card 3446, head 3505, opts 3560, fill 3626, level 3645,
mark 3696, foot 3759, reduced motion 3807-3840, votes sheet 3841-3906, poll
sheet 3907-4060); v2 poll override 5103-5132 and 5782-5840; empty/hello/details
tiles 5133-5290; details column and quick actions 5399-5560; new message pane
5547-5620; hover/lift 5657-5728; sheet/vote bars 5740-5780; desktop grid: legacy
3-29, 1309-1349, v2 4068-4081; details legacy 1121-1236; photo 451-466 and
4606-4622; file bubble 628-662; photo-off tile 5934.

### Tests

Existing tests that pin D behaviour (all in `src/clubhouse/` unless noted):

- `__tests__/messages-polls.test.tsx` (PollCard: lines 85-215
  counts/vote/closed/votes/close, 209-215 group-only button, 218-293 D11-D28,
  295-333 visual states, 335-380 remind/share/actions, 384-387 faces). Would
  legitimately change: 298-305 (asserts `.ch-ms-poll__level` x2 and an "honest
  0" in `.ch-ms-poll__n`), 307-312 head text "Poll closed·Final", 314-322
  "Voting ended·Final", "Tied" tags, 327-333 "Choose any that work", 85-98
  footer strings ("N of M voted", "Everyone voted") because the spec
  header/footer copy and the no-level-line rule change them; 384-387 asserts
  `.ch-ms-poll__faces`, a class that no longer exists (the real one is
  `.ch-msv-pollfaces`), so it passes vacuously: rewrite it to expect up to 3
  faces, yours first. 209-215 only if DMs get polls.
- `__tests__/messages-polls-css.test.ts` pins `--ch-dur-release` on the fill,
  `border-bottom-right-radius: tail`, `--ch-poll-mark-ring: ink-500`, the
  `min(460px,78%)` column rules and a no-`prefers-color-scheme` rule on the
  whole stylesheet. Fill-curve and mark-ring pins change with MSG-502 (the v2
  override already moved the fill to smooth, the test passes only because the
  legacy text still exists); keep the column-width and dark-theme pins.
- `__tests__/messages.test.tsx`: poll integration 1367-1460 (keep); mute 329-358
  (CH-1902, CH-7011) and 337/356/364 "Mute 8 hours" button names (change only if
  the "For 8 hours" labels are adopted); 417 CH-7208; 673 CH-7405/7407; 876
  phone first run; 885-916 and 947-998 Details files (CH-7409/7306/7214/7021,
  "kind, size and day"); 1055 CH-7605 pane swap (change if the swap curve
  changes); 1082-1094 CH-7308; 1096-1217 prefill (keep); 1277 "#2 a week’s mute
  reads as a date" (uses `muteLabel`; delete-safe only if `MuteControl` stays or
  `muteLabel` is re-homed).
- `screens/messages/__tests__/class-thread.test.tsx`,
  `__tests__/class-awareness-messages.test.tsx` (Details block,
  `GroupClassLine`, `ThreadClassSection`): change only if the class card is
  restyled (the card text and `data-ch-code` CH-7272/7273 are pinned).
- `screens/messages/__tests__/messages-player-session.test.tsx`,
  `attachments-load.test.tsx` (attachment load and re-sign),
  `screens/messages/__tests__/composer-v2.test.tsx` (CSS pins for the plus key
  and send key: read before touching the shared stylesheet).
- `__tests__/toast-timers.test.tsx:316-331` ("Conversation muted" replaced by
  "Notifications back on"): these test the toast key mechanism, unaffected if
  the two mute toasts are merged but keep `replace`.
- `__tests__/redesign-shared-guards.test.ts` (flag name list, no raw hex etc. in
  `screens/messages`), `__tests__/phone-type-floor-css.test.ts`,
  `__tests__/target-size-css.test.ts`,
  `__tests__/no-first-paint-draw-ins.test.ts`: global guards that any new CSS
  (12 px floor, 44 px targets, no first-paint draw-ins) must still pass; the
  poll fill must keep "no first-paint draw-in".
- `preview/__tests__/messages-design-fixture.test.tsx` and
  `preview/PreviewMessages.tsx` (design fixture with its own toast code at
  `:479-487`): needs the new poll/details/empty states if captures are to be
  taken.
- No test pins the 1101 px container rule, the grid columns or
  `useDetailsColumn`; add one for the 1280 canvas (see Risks 4).

### Risks and surprises

1. Photo and file bubbles are sized only after an async signed-URL round trip.
   `Bubble` knows just `hasAttachments` (`MV:1339`); `Attachments` shows a 240 x
   54 skeleton (`MV:1005-1008`), then the real 242 x 176 photo, so the thread
   grows 122 px under the reader the first time a photo scrolls in (the CSS
   comment at `CSS:451` claims a late image cannot move messages; the skeleton
   breaks that). MOTION house rule B7 ("an arrival has its full height from the
   first frame") needs the message list payload to carry the kind (and ideally
   width/height, which the table has: `AttachmentUploadData.width/height`) so
   the frame can be reserved before signing. Also `IntersectionObserver`
   rootMargin 800 px means far-off photos stay unsigned.
2. Details photo tiles are N+1: each `PhotoTile` calls
   `api.attachments(messageId)` (a server action that lists and signs ALL files
   of that message) once per tile, 6 on open and up to 100 after "See all", with
   no cache shared with the thread's own `Attachments`
   (`details-v2.tsx:251-277`, `M:678-687`). Add a batch signer
   (`getSignedUrlsForAttachments` already exists, re-exported
   `src/app/golf/actions/messages.ts:41,377`) or cache by message id. A signed
   URL also expires after 1 h; tiles never re-sign.
3. Votes: voter identity depends on `api.directory` (the viewer's messageable
   people), so a vote from someone outside it, or a teammate who left, reads
   "Member" with a placeholder avatar. Visibility is thread-wide by RLS, so
   showing faces and the full "Votes" sheet leaks nothing new. If a future
   design shows voters on the card, remember the tally is derived client-side
   per poll and re-read on every realtime change (250 ms coalesced).
4. The desktop grid threshold is on the canvas, not the viewport. `.ch-canvas`
   is `container-type: inline-size` (`shell.css:23`), the 3-pane rule needs
   `min-width: 1101px` of canvas (viewport >= about 1349), the spec's reference
   width 1280 gives a 1032 px canvas and silently renders the legacy floating
   panel with no column animation (and the rail at 300, not 320). This is by
   cascade, not rendered; a visual check at 1280 would show it at once. At 1440
   (canvas about 1192) and with the sidebar folded at 1280 (about 1216) the
   three-pane grid already applies, so only desktop viewports under about 1349
   px with the sidebar open are affected (this includes 1280 and 1024 to 1194 px
   tablets in landscape). There is no test for it. Changing the threshold also
   changes when the details panel stops floating over the composer.
5. Hidden coupling around the photo shell: `hold-lift.tsx:47,50,55` find the
   lift source with `.ch-ms-bub, .ch-ms-img`, `CSS:2067-3240` exclude
   `.ch-ms-bub--file` from the mine-green and tail rules, and reaction badges
   anchor to `.ch-ms-msg__stack`. If D replaces `.ch-ms-img`/`.ch-ms-bub--file`
   with a `.b.photo`/`.b.file` shell, slices B and C must agree on the class
   that marks "a bubble shell".
6. `'use server'` files here (`message-attachments.ts`, `message-mute.ts`,
   `message-polls.ts`, `messages.ts`) declare `export interface` / `export
   type`, which erases cleanly; `messages.ts:380-390` records that a type in an
   `export { ... }` specifier list takes every action down. Do not move types
   into those files with that form while changing `loadAttachments`' return
   shape.
7. Double toast on mute (`details-v2.tsx:59` and `M:650`), no inbox-glyph
   refresh after a Details mute (`M:1013`), and no in-session expiry: these are
   existing defects the spec's MSG-608 now depends on; fix them in the same
   package as the Details restyle.
8. Spec vs Nov 4 rulings that D must resolve: (a) ruling 19 / Q-13 (keep "Mute 8
   hours..." strings and tests) vs MSG-604 and the HTML ("For 8 hours / For a
   week / Until I turn it on", toast "Muted for ..."); (b) D5 (the poll leader
   is marked only once final, `polls.tsx:380`, test 298-305) vs MSG-502 / HTML
   (chip on a sole leader at any time); (c) the 4 Nov "no faces on a poll row
   (default B: count only)" test (`messages-polls.test.tsx:384`) vs the HTML's
   voter faces, which today's code already draws (`polls.tsx:360-376`), so the
   test is stale; (d) ruling 20 (Profile for a coach only) vs the HTML (always
   drawn): code follows the ruling; (e) HTML Captain chip vs
   `details-v2.tsx:184` ("no Captain chip").
9. Class awareness (`ThreadClassSub`, `ThreadClassSection`, `GroupClassLine`) is
   a P-10 feature gated by `useClassAwareness()` and a coach role (`M:84-87`);
   the spec draws only a DM card and no header status or group line. They are
   not in the HTML, so the default is keep, restyled to the new tokens;
   `GroupClassLine` sits directly above the composer pill (`MV:2062`), so slice
   B's composer geometry (MSG-301) must leave room for it.
10. `MessagesPhone` imports from `MessagesView` and `details-v2` imports a type
    from `MessagesView` (`details-v2.tsx:14`); `MessagesScreen.tsx` exists
    solely to avoid an import cycle (`check:cycles`). A new shared file (poll
    voters, photo shell) must not import `MessagesView` values.
11. Stale comment: `MessagesView.tsx:194` still documents
    `golf_messages_redesign_v1`; the flag is gone and `data-ch-ms-v2` is always
    rendered (`MessagesScreen.tsx:36`), so every `[data-ch-ms-v2]` rule is live
    and legacy rules without the prefix are only fallbacks; keep new rules under
    the prefix.
12. `startDirect` creates a server conversation as soon as a person is picked,
    and `HelloCard` then shows an empty thread; picking then leaving leaves an
    empty DM (existing behaviour, spec MSG-703 matches it).

---

## Part G. Slice G: global, tokens, springs, CSS, gates

Scope: MSG-001 to 003, 008 to 010, the SPEC token table, MSG-901 to 905,
MOT-SPR-1 to 7, MOT-R-1 to 6, MOT-KB-1, plus the six inventories asked for (CSS,
reduced motion and haptics, `'use server'` files, flags, checks, shared files).
Checkout: `/Users/ricknini/worktrees/helmv3/ch-messages-v2` (HEAD `56950784e6`,
contains origin/main `743cb23a19`). All lines re-verified. Where SPEC.md and the
HTML differ the HTML was read (token values in the HTML at lines 35-110,
617-637, 1002, 1029, springs `SP` at 1329-1337); I found no SPEC-vs-HTML value
difference in this slice.

Spring numbers were recomputed from `physics()` (omega = 2 pi / (1.2 vd), zeta =
1 - bounce): stiffness/damping/settle match MOTION.md for all seven;
`chSpringCurve` settle ms: smooth 462, settle 417, reveal 921, send 700, pop
496, lift 471, launch 812 (page solver says 828), peaks 1.000 / 1.002 / 1.000 /
1.003 / 1.068 / 1.006 / 1.015.

### Verdicts

| ID | Verdict | Today (file:line) | Delta to build |
| --- | --- | --- | --- |
| MSG-001 Text Size | PARTIAL | Every type token is `calc(N * var(--ch-type-k))` (tokens.css:306-309); XXL cap 23/17 (lib/dynamic-type.ts:7). messages.css has zero fixed-px font declarations. Times column `width: calc(52 * k)`, `right: calc(-64 * k)`, `-68k` at >= 414 (messages.css:4494-4503), `white-space: nowrap` (4498). Bubble padding `7.5k 13k` (4395). | (a) Segmented is fixed px: `.ch-seg__b` 30, `--sm` 26 (controls.css:22-25, 56-60), phone 36/34 + min-width 44 (controls.css:585-591); spec `30 * k`. Scope it: `[data-ch-ms-v2] .ch-seg__b { height: calc(30 * var(--ch-type-k)) }`, do not edit controls.css (56 importers). (b) Avatar initials are fixed px steps 11/12/13/14/22 (ui/Avatar.tsx:21, ui.css:200-219); spec 0.38 of the coin and k-scaled (see MSG-902). (c) Bar rows, chips and pills at XXL not audited: check `.ch-pbar` min-height and chip heights. |
| MSG-002 Themes | PARTIAL | Every token in the table has a dark value (see Token table). Dark switch is `html[data-fw-theme='dark']` (tokens.css:962), 40 dark overrides in messages.css. | Light-only literals left: `color: var(--ch-on-accent, #fff)` on `.ch-msp-tok` uses an UNDEFINED token (messages.css:5540, token not in tokens.css); `#f7fbf8` / `#fff` on the legacy gradient bubble (592, 2070, overridden by v2); `var(--ch-ivory-0, #fff)` (1076). Fix 5540 (use `--ch-text-on-accent`), delete 592/2070 with the gradient rules (lowers the hex ratchet, see Risks). |
| MSG-003 Reduce Motion | DONE | Global rule narrows every `.ch-root` transition to opacity and runs keyframes 1 ms unless opted in (base.css:310-345); typing dots and skeleton hold still at opacity 1 (messages.css:4185-4195, 4591-4603); segmented pill uses `useSlidePlate(..., { reduced })` (ui/Segmented.tsx:61). Native caret, so nothing blinks to stop (ruling 21). | none for the behaviours. The crossfade LENGTH (180 vs 120) is MOT-R-1. |
| MSG-008 Focus ring | MISSING | Bubble is `<div className="ch-ms-bub">` with no `tabIndex` (MessagesView.tsx:1331). Keyboard route is a separate sr-only "Message actions" button (MessagesView.tsx:1343-1351, `CH-7804`). No `.ch-ms-bub:focus-visible` rule: only `:not(:focus-visible)` outline hooks for search hits (messages.css:620-627). `--ch-ring-own` is read once, for the reaction ring (5737, 1.5 px). Searched: `tabIndex`, `focus-visible` + bub in messages.css/MessagesView.tsx. | Add `tabIndex={0}` to the bubble (text, photo, file), Enter/Space opens MSG-400 actions, `[data-ch-ms-v2] .ch-ms-bub:focus-visible { outline: 2px solid var(--ch-ring-own); outline-offset: 3px }`. Decide the sr-only button: with the bubble focusable it is a duplicate tab stop (drop it on desktop, keep for VoiceOver on phone). base.css:128 owns the generic focus rule; do not fight it. Reaction badge ring spec is 2 px / offset 1 (code 1.5 px). |
| MSG-009 Press rule | DONE | Rows: `color-mix(in srgb, var(--ch-ink-900) 5%, transparent)` (messages.css:4113, 4125) = spec light wash; no scale. Bubble sink: `data-ch-press-scale=".97"` (MessagesView.tsx:1325) -> lib/press.ts:13, 79 (110 ms `CH_DUR.press`), release 280 ms (press.ts:154); skipped under reduced motion (press.ts:53). | none. Nit: dark wash is 5% vs spec .06; `--ch-press-wash` (tokens.css:700 / 1003) is exactly the spec value and is unused by Messages rows, use it. Dead legacy washes at messages.css:148, 293 (rgb(28 25 18 / .07)). |
| MSG-010 Touch targets | DONE | Plus key 36 + `::before inset -4` = 44 (messages.css:4740-4744); send key 36 (4716-4720), phone `::before inset -5` (2173-2178); sheet close key 40 + `::before inset -2` = 44, `flex: none` (5744-5754); hover bar keys 26.9 (5679-5680, the WCAG 2.5.8 exception, ruling 17); segmented/pill reach via controls.css:606-612. | none. Re-check after the bar and row rebuilds that nothing new sits under 44 on the phone. |
| MSG-901 Contrast | PARTIAL | Token values equal the HTML table (see Token table). Pinned by tests: bubble ink vs fill, ink-2 vs bubble, dots/ring/switch 3:1 (refresh-tokens.test.ts:75-92); `--ch-flag` 4.5 on page and card (same file:57-60). | Not pinned: links on card, chips on tint, times (ink-3 on page), back link on frame, Delete, avatar initials on the lightest coin, "Rejected: ivory on #2A7D53 dark" (`--ch-accent-hover` dark is #2a7d53, tokens.css:1142: never use for sent). Light sent-ink is `--ch-text-on-accent` #ffffff (tokens.css:198), spec #FDFCF8 (the test hardcodes #fdfcf8, refresh-tokens.test.ts:76), passes either way. Add the missing pairs to contrast-tokens.test.ts. |
| MSG-902 Avatars | CONFLICTS | Shared `Avatar` draws a neutral green coin (phone) or 6 pastel tones (desk) with dark initials, ring `0 0 0 1px` and `inset 0 1px 0 .45` (ui.css:200-219, 226-260; Avatar.tsx:14-30). Sizes come from a step table `xs 24, sm 28, md 36, lg 40, xl 64` (Avatar.tsx:21) so Pinned is 64 (MessagesPhone.tsx:328 `xl`) not 62, HelloCard 64 not 72 (HelloCard.tsx:13), details phone 84 (MessagesPhone.tsx:808 ok), group run 30 ok (MessagesView.tsx:2412), header 36 ok (2287). Group coin gradient exists for the team channel (`.ch-ms-grp`, messages.css:304). | Spec: per-person flat coin (`--h1`, e.g. #2b5f45 #6e5232 #3a6580 #84495a ...) with ivory #fdfcf8 initials at 0.38 x size, weight 600, shadow `inset 0 1px 0 .22, inset 0 -1px 0 .12, 0 1px 2px .15`. The data model has no per-person hue; the HTML hues are a prototype palette. Needs an owner call (Q-new) because SETTLED-4NOV and the 5 Nov ruling ("coins are the calm neutral", Avatar.tsx comment) say the opposite. Do not edit shared Avatar (75 importers): scope `[data-ch-ms-v2] .ch-avatar` or add an opt-in `tone` prop. |
| MSG-903 Aria labels | PARTIAL | Present: "Back to Messages", "New message", "Filter conversations", "Loading conversations" (role=status, MessagesPhone.tsx:293), "Message actions" (toolbar MessagesView.tsx:1354, dialog hold-lift.tsx:162), "Jump to latest[, N new]" (thread-v2.tsx:130), typing `role="status"` + "{First} is typing" (MessagesPhone.tsx:562, MessagesView.tsx:2415), toast `role=status`/alert (Toast.tsx:382), `aria-expanded` on plus (ComposerPlusV2.tsx:66). | Different from spec: plus key "Add a photo, file or poll" / "Close" (spec "Add photo, file or poll"); hover bar "More message actions" (MessagesView.tsx:1379; spec "More actions"); reaction bar "Reactions" (1396; spec "React"); detail key "Details"/"Group details" (2316, 2786) and phone `.ch-msp-who` has no label naming the person (MessagesPhone.tsx:468; spec "Details for {name}"); "Back to conversation", "Search in conversation", "Remove file" ("Remove {file}" at 1647), "Photo from {First}" absent. Filters are `role="radiogroup"` + `aria-checked` (Segmented.tsx:85-96), spec says `aria-pressed`; changing shared Segmented needs the 56-importer review, otherwise keep radio semantics and note the deviation. Sheets use native `<dialog>` via Modal (no literal `aria-modal`); hold dialog has it. Some strings are pinned (screens/messages/**tests**/composer-v2.test.tsx names "Add a photo, file or poll"); change them on purpose. |
| MSG-904 Motion check | PARTIAL | `e2e/clubhouse-messages-motion.spec.ts` (316 lines) already runs the 11 cases on the preview fixture `/clubhouse-preview/messages?state=design&view=thread`, sampler `__mcStart`, headed + localhost only (lines 1-20, 134-310). Fixture: `src/clubhouse/preview/PreviewMessages.tsx`. | Cases were written for the Nov 4 build. Re-judge all 11 on the new send choreography (clone vs real bubble, MC-01/02/11), `launch`, keyboard ride and the desktop details column (MC-10). Needs a headed 60 Hz run; headless fails 2-3 cases (SETTLED-4NOV). |
| MSG-905 Rules kept | PARTIAL | No accent left-border cards (only neutral hairlines, messages.css:1127, 3380). Edge 16/20 from `--ch-page-x-phone` (tokens.css:469, 1501-1506; 414 breakpoint). | Delete/failed use `--ch-danger-600` (#b03a2e / #ef8576, tokens.css:106, 1094) at messages.css:2443, 2528, 5724; spec says `--ch-flag` (#b3261e / #f28b7d, tokens.css:677, 991). Menu Delete is `.ch-menu__item.is-danger` (controls.css:373), also check which token it reads. |
| MOT-SPR-1 smooth | DONE | `CH_SPRINGS.smooth` vd .26 / b 0 (motion.ts:71) = 405.6 / 40.3, 462 ms; CSS `--ch-ease-spring-smooth` + `--ch-dur-spring-smooth: 462ms` (tokens.css:1333-1334). | none |
| MOT-SPR-2 settle | DONE | motion.ts:72 (vd .26, b .1) = 405.6 / 36.2; chSpringCurve 417 ms (page 427); CSS token + 417ms (tokens.css:1343-1344, pinned refresh-tokens.test.ts:54-56). | none (quote 417, ruling 29) |
| MOT-SPR-3 reveal | DONE | motion.ts:73 (vd .52, b 0) = 101.4 / 20.1; chSpringCurve 921 ms (page 941). JS only: no CSS `--ch-ease-spring-reveal` token (tokens.css:1331-1347 list smooth, pour, send, pop, lift, settle). Used by thread-v2.tsx:141-165 (921 ms literal at 155), 252. | none; add a CSS token only if a CSS consumer appears. |
| MOT-SPR-4 send | DONE | motion.ts:76 (vd .42, b .12) = 155.4 / 21.9; 700 ms; CSS token + 700ms (tokens.css:1337-1338). Used for the thread making room (thread-v2.tsx:206, 333). | Spec narrowed `send` to the thread glide only; today `useSendRise` also moves the bubble on `send` (thread-v2.tsx:333), that moves to `launch` (MOT-SEND-7, slice B). |
| MOT-SPR-5 launch | MISSING | Not in `CH_SPRINGS` (motion.ts:70-81), no `--ch-ease-spring-launch` / `--ch-dur-spring-launch` (tokens.css:1331-1347), nothing in the `data-motion='off'` zeroing list (1351-1378) or the no-`linear()` fallbacks (913-918). Searched: `launch` in src/clubhouse lib, styles, screens. | Add `launch: { visualDuration: 0.5, bounce: 0.2 }` with a sign-off comment (bounce 0.2 is past the 0.1 cap; owner Q-04). Verified: 109.7 / 16.8, peak 1.015, chSpringCurve 812 ms (so `0.62 * ms` = 503, 70% receipt delay = 568, not 513 / 580; use the function, not the artifact numbers). If CSS needs it, generate `--ch-ease-spring-launch` / `-dur-` from `chSpringCurve('launch')` into tokens.css (the test at motion-physics.test.tsx:77-83 compares token text to the curve) and add the zeroing line. Update the named-exceptions set in motion-physics.test.tsx:49 (see Tests). |
| MOT-SPR-6 pop | DONE | motion.ts:77 (vd .25, b .35) = 438.6 / 27.2; 496 ms; peak 1.068 (ruling 28); CSS token + 496ms (tokens.css:1339-1340). `CH_SPRING_POP_MS = 507` (motion.ts:22) is a stale second number for the same spring (used by quick-chat task-motion.ts:34, 92 only). | none for Messages. Do not use CH_SPRING_POP_MS in Messages. |
| MOT-SPR-7 lift | DONE | motion.ts:78 (vd .28, b .15) = 349.7 / 31.8; 471 ms; CSS token + 471ms (tokens.css:1341-1342). | none |
| MOT-R-1 120 ms crossfade | PARTIAL | `CH_FADE_MS = CH_DUR.quick * 1000 = 180` (motion.ts:56); `--ch-dur-crossfade-rm: 180ms` (tokens.css:930, pinned equal by refresh-tokens.test.ts:47-49); global CSS floor (base.css:318-323); Messages WAAPI uses `CH_FADE_MS` (thread-v2.tsx:247, 325; hold-lift.tsx:79, 106-107; MessagesView.tsx:749, 1933). `chFade()` is an ease-out tween (motion.ts:52-54), the artifact is linear; the Messages WAAPI calls pass no easing (default linear) so they are linear. | Spec/HTML 120 ms linear; code 180 ms linear. Default per Q-05 and ruling 25: keep the shared 180 (14 files import `CH_FADE_MS`, 3 CSS consumers). To make Messages 120 a separate token would break ruling 25; a Clubhouse-wide change is a shared-owner decision, not Messages'. Record as accepted deviation. |
| MOT-R-2 loops stop | DONE | Dots `animation: none; opacity: 1` for row dots (messages.css:4185-4189), thread dots (4591-4603), both also under `[data-motion='off']`; skeleton pulse stops (4185-4194). Caret is the browser's (ruling 21). Legacy `.ch-ms-typing i` (980-985, opacity .6) has no live markup. | Skeleton pulse period is `--ch-dur-sweep` 900 ms (messages.css:4178) vs spec 1.4 s ease-in-out; opacity target .55 matches (4182). Slice A (MSG-112) owns the period. |
| MOT-R-3 hold | DONE | Press scale skipped under reduced motion (lib/press.ts:53-61); lift copy, bar, menu, scrim just fade `CH_FADE_MS` (hold-lift.tsx:79). | none |
| MOT-R-4 jump scroll | DONE | `useSpringToEnd(..., reduced)` returns `toEnd()` at once (thread-v2.tsx:144), wired on the phone with `threadReduced` (MessagesPhone.tsx:444). | Desktop passes `anchor.toEnd` directly (MessagesView.tsx:2424): no spring glide on desktop at all (MOT-JMP-3 gap, slice B). Spec also skips when ` \| to-from \| < 2`. |
| MOT-R-5 details column | PARTIAL | Reduced details panel crossfades with `ch-msv-det-fade var(--ch-dur-crossfade-rm) linear` (messages.css:5406-5409, 5827-5828). The grid has the one-track-list prep (`320px minmax(0,1fr) 0px` / `300px`, messages.css:4070-4080) but NO `transition: grid-template-columns` (searched `grid-template-columns` + `transition`): MOT-DET-2 itself is missing. | See Risks: a new layout-property transition is rejected by `clubhouse:css` (`clubhouse/no-layout-motion`) unless the exact declaration is in the base. Slice D owns MOT-DET-2. |
| MOT-R-6 send reduced | DONE | Reduced: new bubble `opacity 0 > 1` over `CH_FADE_MS` (thread-v2.tsx:324-327), thread glide skipped (197, `if (reduced ...) return`), no clone/arrow exists, reply fades (246-249). | Re-verify once `launch` and the clone land: reduced must stay "no flight, no clone, no arrow". |
| MOT-KB-1 keyboard ride | (see other slice) PARTIAL | Signals exist: native `keyboardWillShow` sets `--keyboard-height` and `body.keyboard-open` (components/providers/CapacitorProvider.tsx:123-132, hide 168-170), web `visualViewport` fallback (207-228), Safari fit `data-ch-vv` (shell/PhoneScreen.tsx:187-215, shell.css:1595-1599). The thread screen is `PhoneScreen keyboardAware` (MessagesPhone.tsx:462) and rides by `padding-bottom: var(--keyboard-height)` on `.ch-pscreen[data-fw-keyboard-aware]` (shell.css:1590-1592): an instant layout resize, no 480 ms transition, composer not translated, jump key follows `--ch-ms-comp-h` (composer-inset.ts, messages.css:4547). `--ch-ease-sheet: cubic-bezier(0.32, 0.72, 0, 1)` exists (tokens.css:913) and is unused; no 480 ms duration token. | Build: a `--ch-dur-keyboard: 480ms` token (CSS literal `ms` and `cubic-bezier(` are banned outside tokens.css), animate the composer and jump key by `translate` from `--keyboard-height`, thread floor padding grows by the same amount, `useThreadAnchor` re-pins (use-thread-anchor.ts), reduced: at once. Shared blast radius: shell.css:1590, PhoneScreen.tsx and CapacitorProvider (Roster phone profile also uses `keyboardAware`, RosterPhoneCrh.tsx:281). `keyboardWillShow` gives only the height, not the keyboard's duration, so 480 ms is a fixed guess. Native-only path: cannot be verified in a desktop browser; Safari web uses the visualViewport path. |

### Token table

"Spec" = SPEC.md Tokens table (HTML-verified). `Dark` = does the code's dark
value equal the spec's dark value.

| Artifact token | Clubhouse token and value (file:line) | Status | Dark | Notes |
| --- | --- | --- | --- | --- |
| page #F2F0E9 / #0E120F | `--ch-grouped-bg` #f2f0e9 (tokens.css:669) / #0e120f (983) | exists | match | Not `--ch-bg-page` (#ebe7dc, :166). v2 CSS uses grouped-bg. |
| page-2 #F6F4EE / #141815 | `--ch-well-bg-flat` #f6f4ee (671) / #141815 (985) | exists | match | Also read by home, practice, controls, roster. |
| recv #FFFEFB / #232925 | `--ch-bubble-theirs-bg` (716) / (969) | exists (spec says NEW; added Nov 4 "11a") | match | |
| recv-ink #1C1B18 / #F1ECDF | `--ch-text-primary` -> `--ch-ink-900` #1c1b18 (189, 49) / #f1ecdf (1060) | exists | match | |
| sent #155A39 / #1F6B45 | `--ch-bubble-mine-fill` (717) / (970) | exists | match | Do not use `--ch-accent` (dark #23704a, :1134). Gradient `--ch-bubble-mine-bg` still defined (809) and still read by messages.css:590, 2068 (dead under v2) AND coachhelm-thread.css:64 (Ask thread): keep the token, delete only the two Messages rules. |
| sent-ink #FDFCF8 / #F4EEDD | `--ch-text-on-accent` #ffffff (198) / #f4eedd (1133) | partial | dark match | Light is #fff, spec #FDFCF8; `--ch-attach-glyph` #fdfcf8 (16) is the exact colour. Optional NEW `--ch-bubble-mine-ink`. |
| surface / elev #FFFEFB / #191E1A | `--ch-card-bg` (670) / (984) | exists | match | |
| glass rgb(253 251 247/.78) / rgb(22 27 23/.74) | `--ch-glass` (725) / (976) | exists | match | Blur/saturate NOT the spec's 24 / 170%: `--ch-glass-blur: 20px`, `--ch-glass-saturate: 110%` (602-603); every Messages blur is `blur(var(--ch-glass-blur))` with no saturate (messages.css:4525, 4556, 4879, 5564, 5627, 5653, 5669, 5850, 5874), enforced by elevation-tokens.test.ts:50-58. Needs NEW scoped `[data-ch-ms-v2] { --ch-glass-blur: 24px }` plus `saturate(170%)` after the var; overlay wants 14 px / 120%. |
| glass-strong rgb(253 251 247/.90) / rgb(27 32 28/.88) | `--ch-glass-strong` (726) / (977) | exists | match | Also read by coachhelm-ask-v2.css: do not change the value. |
| ink-2 #46433D / #D0C9B8 | `--ch-crh-ink2` (739) / (1019), also `--ch-ink-600` (52) / (1062) = `--ch-text-tertiary` (191) | exists | match | Name trap: spec ink-2 is `--ch-text-tertiary`, not `--ch-text-secondary` (-> `--ch-ink-700` #3a3833 / #e2dccd, tokens.css:190). Messages uses `--ch-text-secondary` 56 times and `--ch-text-tertiary` 58 times, so "secondary" text is darker (light) / lighter (dark) than spec. |
| ink-3 #5F5C55 / #ADA697 | `--ch-crh-ink4` (740) / (1020) | exists | match | `--ch-ink-500` is #5f5c55 light but #bab3a4 dark (53, 1063): wrong in dark. Times use `--ch-text-tertiary` = ink-2 (messages.css:4499), spec says ink-3. |
| accent-text #155A39 / #7CC79B | `--ch-accent-ink` (741) / (1021) | exists | match | |
| danger #B3261E / #F28B7D | `--ch-flag` (677) / (991) | exists | match | Messages reads `--ch-danger-600` instead (see MSG-905). |
| dot #7A766C / #827D71 | `--ch-typing-dot` (728) / (979) | exists (spec NEW) | match | Read at messages.css:4152, 4474. |
| ring #8C703A / #C9AD74 | `--ch-ring-own` (729) / (980) | exists (spec NEW) | match | Read only at messages.css:5737. |
| sw-off #8F8B81 / #827D71 | `--ch-switch-off-ring` #8e8a80 (730) / #827d71 (981) | exists (spec NEW) | dark match | Light is 1/255 off per channel; harmless, set to #8f8b81 if touching. Read via `--ch-messages-x5` (messages.css:5863). |
| scrim rgb(28 30 24/.22) / rgb(0 0 0/.45) | `--ch-scrim` rgb(20 20 18/.36) (869) / rgb(2 6 4/.58) (1295) | MISMATCH | no | Shared with Modal, sheets, rounds, Ask (ui.css, controls.css, shell.css, base.css). Messages lift scrim reads it with fallback (messages.css:4878). NEW scoped `--ch-scrim-msg` or a `[data-ch-ms-v2]` override; do not change the global. |
| card-shadow (3 layers) / dark `0 0 0 1px .06, inset 0 1px 0 .04` | `--ch-card-shadow` = `--ch-elevation-lifted` (674 -> 617: ring .10 + 12px 24px -10 .26 + 30px 52px -22 .30 + rim) / dark (1202: ring .09, heavier) | MISMATCH | no | Closest existing: `--ch-elevation-card` (599: `0 0 0 1px .07, 0 1px 2px .04, 0 8px 20px -10px .1`), still not equal (.05 / -12px .12) and light only. NEW `--ch-card-shadow-flat` (both themes) in tokens.css, then point Messages at it. Raw `box-shadow` literals in messages.css are ratcheted (RAW_SHADOW 10) and need a `--ch-*` token (clubhouse:css `shadow-token`). |
| float shadow | `--ch-shadow-float` (724) / (975) | exists | match | |
| bubble shadow theirs / mine | `--ch-bubble-theirs-shadow` (722) / (973), `--ch-bubble-mine-shadow` (723) / (974) | exists | match | Lit top edge = `--ch-messages-x4` `inset 0 var(--ch-hairline-w) 0 rgb(255 255 255/.14)` (messages.css:5862; hairline-w is 1px, 0.5px at 2x). |
| attach tiles #2F7D4C / #7F612A / #155A39 | `--ch-attach-photos/-file/-poll`, `--ch-attach-glyph` #fdfcf8 (13-16) | exists (spec NEW) | same in both | Read at messages.css:4807-4816. |
| chip tint 10% / 12% + ink | `--ch-accent-tint` (742) / (1022) + `--ch-accent-ink` | exists | match | |
| unread dot #155A39 / #7CC79B | none; `.ch-msv-dot` uses `--ch-green-600` (messages.css:5074) = #155a39 / #6bbb8c (tokens.css:68, 1073) | partial | dark off | Use `--ch-accent-ink`. |
| skeleton fill 9% ink | `color-mix(in srgb, var(--ch-text-primary) 9%, transparent)` (messages.css:4175) | matches ruling 14 | n/a | |
| wash .05 / .06 | `--ch-press-wash` (700) / (1003) | exists | match | Unused by Messages rows (MSG-009). |
| well shadow `inset 0 1px 2px .06 / .3` | `--ch-crh-well-shadow` .05 (760) / .3 (1031) | exists | dark match | .05 vs .06 light. |
| glass-rule (hairline under bars) | `--ch-glass-rule` (727) / (978) | exists, UNREAD anywhere | match | Desktop bar hairline (MSG-202) should read it. |
| poll bar tint | `--ch-poll-bar` / `-on` (720-721, 971-972) | exists, UNREAD anywhere | match | Slice D. |
| bubble radius 19, join 6 | `--ch-bubble-radius: 19px` (718, UNREAD), `--ch-bubble-join` (719, UNREAD), `--ch-radius-tail: 6px` (572) | exists | n/a | Bubble rule uses `--ch-radius-xl` = 20 (messages.css:4397). Slice B. |
| NEW needed | scoped glass blur/saturate, `--ch-scrim-msg`, `--ch-card-shadow-flat`, `--ch-dur-keyboard`, `--ch-ease-spring-launch` + `--ch-dur-spring-launch`, optional `--ch-bubble-mine-ink` | | | Reduce Transparency and Increase Contrast blocks (tokens.css:1476-1500, 1520-1570) zero `--ch-glass-bg`/`--ch-glass-blur` only: `--ch-glass`/`--ch-glass-strong` stay translucent with no blur. Add them to both blocks. |

### Code map

#### Shared files Messages work will touch (other Clubhouse pages import them): single owner needed

Counts are non-test importers in `src/` (script: resolved relative and `@/`
imports). "Other pages" = distinct page dirs.

| File | What Messages needs from it | Importers (total / Messages) | Other pages that import it |
| --- | --- | --- | --- |
| `styles/tokens.css` (1581 lines) | launch token + zeroing (1351-1378), scoped glass blur/saturate, scrim, flat card shadow, keyboard duration, Reduce Transparency/Increase Contrast coverage | every page (loaded by ClubhouseFrame) | all. Tests: refresh-tokens, motion-physics, motion-durations-pinned, contrast-tokens, elevation-tokens |
| `styles/controls.css` (1935) | Segmented well/thumb (4-110, 585-591), Modal/sheet (`.ch-modal*` ~640), FormSheet (1577-1606), grab handle, `.ch-menu__item` (373), hit areas (606-612) | all pages | all. Prefer `[data-ch-ms-v2]` overrides in messages.css |
| `styles/shell.css` (4500) | `.ch-pscreen` keyboard (1590-1599), toast offsets (1424-1429), `.ch-pbar*` | all | all |
| `styles/ui.css` (2931) | `.ch-avatar` (200-290), `.ch-toasts` (418-423) | all | all |
| `styles/base.css` (383) | global Reduce Motion (310-345), focus ring (128, names `.ch-ms-comp__field textarea`) | all | all |
| `lib/motion.ts` (180) | add `launch` (70-81), named duration constants (TSX `duration: N` literals are linted) | 67 / 7 | auth, calendar, coachhelm, home, onboard, roster, rounds, settings, stats, tournaments, shell, ui |
| `lib/reduced-motion.ts` (59) | read only (`useChReducedMotion`, `useChMotionMode`) | 97 / 5 | ~20 areas |
| `lib/haptics.ts` (66) | read only (map below) | 187 / 10 | ~19 areas |
| `lib/press.ts` (~170) | bubble sink uses it as is | 2 / 0 | auth, shell (Messages uses the attribute via the shell) |
| `lib/sheet-drag.ts` | sheet drag (MSG-407), `chThrownExit`, `chSupportsLinear` | 15 / 1 | calendar, coachhelm, shell, ui |
| `lib/dialog-lifetime.ts`, `lib/overlay-scroll.ts` | under Modal; scroll lock for the lift overlay | 7 / 0, 4 / 0 | coachhelm, rounds, shell, ui / coachhelm, shell |
| `lib/smooth-scroll.ts`, `lib/slide-plate.ts`, `lib/nav-motion.ts`, `lib/motion-glide.ts` | thread smooth scroll; Segmented thumb; push; glide | 12/1, 5/0, 3/0, 6/0 | calendar, classes, rounds, settings, stats, shell, hub, auth |
| `ui/Segmented.tsx` | filter well (MSG-104): pill is `useSlidePlate` on settle, roles radiogroup/radio | 56 / 2 | calendar, classes, coachhelm, home, live, practice, recruiting, roster, rounds, settings, stats, tournaments, whats-new, preview |
| `ui/PhoneBar.tsx` | centred conversation bar (MSG-201), Details push bar | 20 / 1 | calendar, classes, coachhelm, hub, practice, qualifiers, recruiting, roster, stats, shell, preview |
| `ui/Menu.tsx`, `ui/ContextMenu.tsx` | row menu "Pin up to 3", glass menu, Mute menu | 29 / 3, 6 / 1 | calendar, coachhelm, hub, live, practice, recruiting, roster, tournaments, shell / calendar, classes, roster, rounds |
| `ui/Modal.tsx` | today's Seen-by/Votes/poll/Edit/Delete sheets (MSG-407 asks for a different sheet) | 87 / 4 | every page |
| `ui/FormSheet.tsx` | not used by Messages today; candidate for the New poll sheet | 9 / 0 | coachhelm, practice, recruiting, settings |
| `ui/Avatar.tsx` | MSG-902 | 75 / 8 | auth, calendar, coachhelm, home, hub, live, onboard, practice, qualifiers, roster, settings, stats, tournaments, shell, ui |
| `ui/Toast.tsx` | already has the pill mode (`useToastPill`, 85-100, class `is-pill` 248, `PILL_DONE_MS = 1700` 105); pop spring at 392 | 60 / 8 | calendar, classes, coachhelm, hub, practice, qualifiers, recruiting, roster, rounds, settings, stats, tournaments, shell |
| `ui/ListPresence.tsx`, `ui/Peek.tsx`, `ui/Switch.tsx`, `ui/SearchField.tsx`, `ui/Swap.tsx`, `ui/SwipeRow.tsx` | list glide, 450 ms hold constant (`PEEK_HOLD_MS`, Peek.tsx:37), poll switch, search well, swap, row swipe | 9/3, 6/1, 14/2, 16/3, 17/2, 1/1 | hub, roster, shell, calendar, live, classes, coachhelm, practice, qualifiers, recruiting, rounds, settings, auth, home, stats |
| `ui/States.tsx`, `ui/Notices.tsx`, `ui/Icon.tsx`, `ui/Button.tsx` | retry/empty/skeleton copy and icons | 131 / 8, 70 / 8, 219 / 13, 191 / 4 | everywhere |
| `shell/PhoneScreen.tsx` | `keyboardAware` pushed screen (MOT-KB-1) | 7 / 1 | coachhelm, recruiting, roster, stats |
| `shell/phone-chrome.tsx`, `shell/nav.ts` | phone chrome, route table | 53 / 1, 73 / 2 | nearly every page |
| `src/components/providers/CapacitorProvider.tsx`, `src/app/globals.css` (`body.keyboard-open` 485) | keyboard events and body padding (outside `src/clubhouse`) | 1 (app layout) | whole app incl. Fairway |
| Messages-owned, imported elsewhere | keep API stable | | `screens/messages/prefill.ts` (`messagesPrefillHref`) is imported by live, calendar, classes, coachhelm, home, rounds; `model.ts` by data/routes/preview; `MessagesSkeleton.tsx` by the route `loading.tsx` and the preview page; `MessagesView.tsx`, `pinned.ts`, `model.ts` by `src/clubhouse/preview/PreviewMessages.tsx` and `messages-design-cast.ts`; `src/clubhouse/shell/use-warm-inbox.ts` imports `use-golf-messages`; `live/PlayerLane.tsx` imports prefill |

#### Messages files and seams (for ownership)

- `screens/messages/MessagesScreen.tsx` (40): phone vs desktop switch, `<div
  data-ch-ms-v2 display:contents>` at :36 (always on; comment at :34 "Off, the
  DOM is today's" is stale). Hold overlay and details carry their own
  `data-ch-ms-v2="on"` (hold-lift.tsx:162, details-v2.tsx:79).
- `MessagesView.tsx` (3389) is the desktop monolith AND the shared parts library
  for the phone. Seams: types/`ChMessagesApi` 185-350 (stale flag comment :194);
  `ConvRow` 360 / `RowMuteModal` 439 / `TypingMini` 512 / `ConvRowButton` 528 /
  `Rail` 640 (slice A); `ReactionChip` 756 / `Attachments` 911 / `useLongPress`
  1045 (hold, `haptic("press")` at 1064, 450 ms at 1066, move cancel 10 px at 1070) / `Bubble` 1110-1540 (slice B/C: stack 1325, hover bar 1354, sr-only
  actions 1343) / `ReplyQuote` 1573; `AttachChips` 1626 / `ComposerPlus` 1702 /
  `useAutosize` 1735 / `SendKeyHolder` 1750 / `Composer` 1777-2130 (slice B);
  `NewDivider` 2144; `Thread` 2152-2447 (slice B; typing 2412, jump 2424,
  make-room 2220); modals 2449-2753 (slice C/D: Edit, Delete, Leave,
  DeleteConversation, RemoveMember, AddMembers); `Details` 2754 / `MuteControl`
  2869 (slice D); `NewMessage` 2941 (D); `MessagesDesktop` 3257 (D).
- `MessagesPhone.tsx` (1270): `MessagesPhone` 128, `PhoneInboxV2` 245 (A; still
  renders the context line `.ch-msv-ctx` at :270), `PhoneThread` 366 (B/C),
  sheet rows 700-766, `PhoneDetails` 767 (D), `PhoneNewMessage` 911 (D),
  `PhoneAnnouncementForm` 1203.
- `thread-v2.tsx` (385, all slice B/C motion hooks): `ThreadDatePill` 12,
  `ThreadJumpKey` 60, `useSpringToEnd` 141, `useThreadMakeRoom` 175,
  `BubbleTail` 213, `useReplyFromTyping` 226, `useFaceFlight` 280, `useSendRise`
  312, `useSendKeyPop` 343, `useChipRise` 376.
- `hold-lift.tsx` 174, `seen-by.tsx` 453, `polls.tsx` 998, `details-v2.tsx` 372,
  `ComposerPlusV2.tsx` 102, `use-thread-anchor.ts` 165,
  `use-thread-drag-times.ts` 82, `composer-inset.ts` 39 (toast offset var
  `--ch-ms-comp-h`): single-slice files.

#### CSS inventory (`styles/messages.css`, 5958 lines, 165,213 bytes; 817 `ch-ms-`, 232 `ch-msv-` occurrences)

Other CSS naming `ch-ms-`: base.css:128 (`.ch-ms-comp__field textarea` focus),
shell.css:1429 and ui.css:423 (`--ch-ms-comp-h` toast offset), controls.css:606
(`.ch-msp-link` hit area). No other page's TSX uses `ch-ms*` classes (only
`preview/PreviewMessages.tsx`).

The Nov 4 generation is lines 4068-5958 ("Every rule sits under
[data-ch-ms-v2]", 216 scoped rules, ALL 232 `.ch-msv-*` uses). `data-ch-ms-v2`
is always set, so every rule before 4068 that the overlay does not override is
still live, and every one it overrides is dead weight (and a trap:
equal-specificity order decides).

| Lines | Content | Generation |
| --- | --- | --- |
| 1-365 | grid, first run, skeleton shape, rail, flat conversation list (`.ch-ms-row` 94-365) | Oct (v1) |
| 383-986 | desktop thread, bubbles (gradient 590), day chip (494-505), reactions 766-829, notify-anyway 921 | Oct (v1) |
| 987-1120 | composer: `.ch-ms-send` grey/`is-ready` green states (1028-1120) | Oct (v1) |
| 1121-1560 | details, new message, narrow-canvas float (1309-1360), announcements | Oct (v1) |
| 1561-3047 | phone block `.ch-msp-*` (190 uses): inbox, thread (2029-2230, gradient 2068, plain day 2041-2049), composer 2110-2220, new message, announcements, text floor 3035-3046 | Oct to Nov 3 |
| 3048-3441 | reply context, composer notice, announcements fold, notify anyway (3361), class line (3406) | Oct (v1) |
| 3442-4066 | polls (card, options, votes sheet, poll form) | Oct 24-25 |
| 4068-5958 | Nov 4 redesign: inbox 4068, thread/bubbles 4376, thread extras 4605, composer 4674, hold 4869, seen pill 4982, chips 5017, reaction badges 5043, toast 5094, poll card 5103, first run/hello/details/mute 5133, new poll 5343, new message 5528, "11e/11c/11d gaps" 5617, touch hold 5708, reactions 5729, sheets 5740, toast pill 5841-5857, local shadow tokens `--ch-messages-x1..x7` 5859-5867, MSG-2/3 composer 5896-5912 | Nov 4 |

Rules that fight the new spec (delete or flip):

- Day marker chip (MSG-209): `[data-ch-ms-v2] .ch-ms-day > span` is a chip with
  `--ch-card-bg` + card shadow, padding 4 12, 13/500 (messages.css:4377-4385)
  and a second copy at 4624-4631 (`margin: 16px 0 8px`, 4632-4635); also base
  chip 494-505 and the "New" green chip `.ch-ms-day.is-new span` (2769-2774,
  markup MessagesView.tsx:2146). The phone's plain version (2041-2049) loses to
  the v2 chip by source order. Replace with plain 12k/600 ink-3 tabular text,
  margin 22 0 8.
- Gradient bubble: `background: var(--ch-bubble-mine-bg)` at 590 and 2068 (+
  `box-shadow: --ch-elevation-bubble-mine`), colour `#f7fbf8`/`#fff` (592,
  2070). Overridden by 4403-4409 and 4433-4440; delete the legacy rules, keep
  the token (Ask thread uses it).
- Persistent send key: base `.ch-ms-send` grey with `.is-ready` (1028-1120,
  2161-2171, dark 3162, 3216-3221) is the old always-visible key; the v2 wrapper
  hides it when empty (`.ch-msv-sendkey[hidden] { display: none }` 4709-4711,
  `SendKeyHolder` MessagesView.tsx:1750, `useSendKeyPop` thread-v2.tsx:343).
  Behaviour already matches MSG-304; the legacy colours are dead.
- Day pill position: `top: calc(env(safe-area-inset-top) +
  var(--ch-phone-topbar-h) + 8px)`, desktop `140px` (4517-4543) vs spec 128/76;
  no `.linked`/PILL_GAP (thread-v2.tsx:28 uses a 60 px "already on screen" rule
  instead).
- Jump key: `bottom: calc(var(--ch-ms-comp-h, 54px) + 12px)`, right 14/18
  (4546-4572) vs spec bottom 100, desk right 26 / bottom 96.
- Composer: in-flow footer (`position: relative`, 4675), `border-radius:
  var(--ch-radius-xl)` 20 (spec 24), `--ch-card-shadow` (spec float shadow),
  blur 20 (spec 24 + saturate 170), phone padding `0 12 max(8, safe-4)`
  (5903-5909) vs spec absolute pill over a thread that scrolls under it.
- Glass blur 20 / no saturate on all nine glass surfaces; scrim blur 20 (spec 14 + saturate 120%): messages.css:4875-4880.
- Toast pill (5841-5857) uses `--ch-glass-blur` 20 and `font:
  --ch-type-13-strong` (spec 13/600) fine, but position `top: safe + 8` vs spec
  top 62 phone / 18 desk.
- Avatar override `.ch-ms-row .ch-avatar { --ch-av-size: 44px !important }`
  (301-303).
- Dead: `.ch-ms-typing i` (962-985), `.ch-ms-row[data-ch-pressed]` rgb washes
  (148, 293).

#### Reduced-motion helper and haptics

- `lib/reduced-motion.ts`: `useChReducedMotion()` = OS `prefers-reduced-motion`
  OR Settings > Animations off (29-34); `useChMotionMode()` = `full | fade |
  off` (44-48; only `seen-by.tsx:342` uses it); `chMotionModeNow()` for
  non-React code (55-59). Messages calls the boolean in MessagesView (1236,
  1574, 1635, 1751, 1847, 2219), MessagesPhone (385, 436), polls, seen-by,
  hold-lift.
- `CH_FADE_MS`: 180 (`CH_DUR.quick`), the artifact's `anim()` uses 120. Three
  layers all say 180: JS `CH_FADE_MS` (motion.ts:56), token
  `--ch-dur-crossfade-rm` (tokens.css:930, test-pinned equal), global CSS floor
  (base.css:318-323). Q-05 default: keep.
- Haptics (`lib/haptics.ts`, native only, preference-gated, `select` throttled
  40 ms): `select` tick (tabs, Segmented 64, filters, pick, reaction pick),
  `press` = light, `commit` = medium (reserved for a sheet settling at a stop, a
  shot logged, pull to refresh), `success/warning/error`. Messages today:
  lift/long-press `haptic("press")` at 450 ms (MessagesView.tsx:1064;
  NotifyAnyway.tsx:40), `select` for toggles/menus (MessagesView.tsx:821, 859,
  1095, 1232, 1364, 1417, 1516, 2176, 2319), send `success` (1188) / `error`
  (1191), delete/refusal `warning` (1611, 1973, 3006), Messages.tsx
  success/error/warning for writes. `commit` is never used in Messages. HTML
  MOT-HOLD-2 says "medium impact"; ruling 22 and Q-02 say `press`: keep `press`.
  Hold cancels on a 10 px move (MessagesView.tsx:1070), spec 8 px scaled (slice
  C).

#### `'use server'` files Messages touches (bundle-boundary trap)

All under `src/app/golf/actions/` unless noted. Rule: only async functions may
be exported; a type must never appear in an `export { ... }` or `export type {
... }` specifier list (Next registers each name as an action and the module
throws `ReferenceError` at runtime, taking down every action in it). `export
interface X` / `export type X = ...` declarations are erased and safe.

| File | `'use server'` | Non-function exports | Status |
| --- | --- | --- | --- |
| `messages.ts` | line 12 | `export interface GolfConversationParticipantIdentity` (48, safe); `export const createGolfConversation = withGolfAction(...)` (336); `export { ... }` specifier list (351-372) of functions only, with a warning comment at 380-391 | Safe today. Adding any new action here means: implement in `src/app/actions/messages.ts`, add the NAME to the list at 351, never a type. |
| `src/app/actions/messages.ts` | line 4 | `export interface MessageSearchResult` (1467, safe) | Safe. Consumers import the type from here. |
| `message-attachments.ts` | line 1 | `export interface AttachmentUploadData` (18), `AttachmentSendResult` (31) | Safe; consumers use `import type` (use-message-attachments.ts:12). |
| `message-polls.ts` | line 1 | none (`sendGolfPoll`, `closeGolfPoll` only) | Safe. A voters-sheet or reminder action goes here. |
| `message-mute.ts` | line 1 | none | Safe. |
| `conversation-hide.ts` | line 1 | none | Safe. |
| `announcements.ts`, `communication.ts` | line 1 | none | Safe. |
| `documents.ts` | line 5 | `export interface GolfDocumentUploadTicket` (1338) | Safe. |

No pin action exists: pins use direct Supabase calls
(`use-conversation-pins.ts`) against held `golf_conversation_pins`
(supabase/migrations/HELD.md). No `'use server'` file lives under
`src/clubhouse` except `data/palette-people.ts`.

#### Flags and gates

- `golf_messages_redesign_v1` is retired (no entry in
  `config/feature-flags.yml`, `grep` of the whole tree finds only docs and two
  comments: MessagesView.tsx:194, messages.css:4068). Stale prose:
  `docs/clubhouse/GO-LIVE-RUNBOOK.md:104`,
  `memory/features/team-communications.md:897-898`. `clubhouse_refresh_v1` is
  also retired (commit 95871ec9fd): `data-ch-refresh="on"` is hard-coded
  (shell/ClubhouseFrame.tsx:185) and there is no `pre-refresh.css`.
- The only gate is `golf_clubhouse_ui` (config/feature-flags.yml:861, `default:
  false`, production/preview/development all `true` in the file) plus the
  `HELM_CLUBHOUSE_TEAMS` allowlist in `isClubhouseFor`
  (src/clubhouse/gate.ts:51-60, called from
  `src/app/golf/(dashboard)/dashboard/messages/page.tsx:8`). Q-28: no new flag.
  CLAUDE.md says Clubhouse is off in production; the flag file says on: confirm
  before any release claim.
- Runtime probes that act as soft gates: `api.polls` (held poll migrations),
  pins table probe with device-local fallback, `canHideGolfConversations`,
  `useAppearancePreferences().showAnimations`.

#### Clubhouse checks and registration

- `npm run clubhouse:check` (= scripts/clubhouse/**tests** +
  `scripts/clubhouse/check.mjs`): isolation (`--ch-*` only; `--keyboard-height`
  allowed), no emoji / exclamation / uppercase / stagger / count-up, **literal
  `\d+ms` and `cubic-bezier(` banned in any CSS except tokens.css
  (check.mjs:148-149)**, **TSX `duration: <number>` must be one of 0, .11, .18,
  .26, .28, .52 (check.mjs:63, 197-201; motion.ts exempt)**, z-index only
  `--ch-z-*` steps, card/panel/tile radii from `--ch-radius-*`, red tokens only
  in under/flag/danger/error selectors, class-owner uniqueness across page
  sheets (css-owners.mjs: new classes `.ch-ms*`/`.ch-msv*`/`.ch-msp*` only in
  messages.css), catalog (below), registry, changelog gate, VERIFY screenshot
  log, docs links.
- Catalog: `docs/clubhouse/catalog/messages.md`; every `CH-7xxx` used in code
  must be catalogued once; every enforced row (kinds 0-5: toast, validation,
  didn't load, empty, loading, confirm) must be used in `src/clubhouse` and
  named in a test under the FLAT `src/clubhouse/__tests__/` dir
  (check.mjs:442-444 reads only that directory, not
  `screens/messages/__tests__`). Removing a surface that carries a code (e.g.
  CH-7604 hold, CH-7608 seen pill, CH-7804 actions) needs the row retired.
- `npm run clubhouse:css` (css-quality.mjs, also CI clubhouse-quality.yml:83):
  new `transition` of a layout property (grid-template-columns, width, height,
  margin, top...) fails `clubhouse/no-layout-motion` unless the identical
  declaration exists in the merge-base; `transition: all` banned; new outer-blur
  `box-shadow` must be a `var(--ch-*)` token; per-file ratchet
  `config/clubhouse/css-ratchet.json` (`messages.css`: hex 6, both directions
  fail, lower with `npm run clubhouse:css -- --ratchet`). `npm run
  clubhouse:catalog -- --check` (CI) fails on a stale
  `src/clubhouse/preview/component-catalog.json`: regenerate after CSS/class
  changes.
- Docs gate: a Messages change needs a fragment
  `docs/clubhouse/pages/P007-messages/changes/<date>-<slug>.md`; a change to a
  shared file (ui, lib, shell, styles other than messages.css) needs
  `docs/clubhouse/changes/<date>-<slug>.md` (changelog-gate.mjs).
- New files under `src/clubhouse/screens/messages/**` need no registration:
  `memory/registry.yml` feature `team_communications` globs
  `src/clubhouse/screens/messages/**` and `src/clubhouse/styles/messages.css`
  (lines 1108-1109; `knowledge:map` confirmed a new file maps to
  `team_communications` + `clubhouse`), and the P007 manifest's
  `implementation.root` is that directory
  (`config/clubhouse/pages/P007-messages.json`; its actions cite
  `file#Component` but the registry only checks the FILE exists,
  scripts/clubhouse/registry.mjs:296). A new shared file outside the glob (e.g.
  a new `lib/` or `ui/` file) maps only to `clubhouse`. Required checks: `npm
  run typecheck`, `npm run test:e2e -- e2e/messages.spec.ts`, `npm run build`,
  `npm run clubhouse:check`. Update `memory/features/team-communications.md` and
  P007 CONTRACT/DESIGN/WIRING if the contract changes.
- `npm run lint:test-location` counts only `src/test/**` (baseline
  `.test-location-baseline.json`); new tests go in
  `src/clubhouse/screens/messages/__tests__/` (not counted), except
  catalog-naming tests (flat `src/clubhouse/__tests__/`).
- Other per-file ratchets that list `messages.css` (only fall):
  elevation-tokens.test.ts RAW_SHADOW 10 (:134) and blur-must-use-glass-token
  (:50-58); hairlines.test.ts 4 and 2; radius-steps.test.ts 2;
  spacing-scale.test.ts 9 (off-scale integer px
  3,5,7,9,10,13,14,15,17,18,19,21-23,25-29,30,31,33-39,41-47 in
  padding/margin/gap; use `calc(N * var(--ch-type-k))` or scale steps);
  tabular-nums 15; chips-tabs 8; legacy-type-roles 7; selected-state 3;
  look-feel-pass-css 1/2/12/15; page-spacing phone roots; z-ladder.

### Tests

Existing tests that pin behaviour in this slice:

- `src/clubhouse/__tests__/motion-physics.test.tsx`: springs. Line 49-56 "keep
  the D-64 base duration with bounce 0 to 0.1" skips a named set `send, pop,
  lift, pour`: adding `launch` (vd .5, bounce .2) FAILS it until `launch` is
  added to that set on purpose (owner sign-off, Q-04). Lines 62-72 pin
  send/pop/lift stiffness, damping, peak; extend with `launch` 110/16.8/1.015.
  Lines 77-83 compare tokens.css text to `chSpringCurve(kind).linear` for send,
  pop, lift: add launch if a CSS token is added.
- `src/clubhouse/__tests__/motion-durations-pinned.test.ts` (:58-69):
  `--ch-dur-spring-smooth: 462ms`, duration token list. Add the keyboard and
  launch tokens as new tests; do not change existing.
- `src/clubhouse/__tests__/refresh-tokens.test.ts`: :47-49
  `--ch-dur-crossfade-rm` equals `CH_FADE_MS` (changing Reduce Motion to 120
  would need this changed, a shared decision); :54-56 settle curve; :75-92
  Messages token contrast (sent ink literal #fdfcf8 vs `--ch-bubble-mine-fill`,
  ink-2 vs bubble, dot/ring/switch 3:1). Legit to extend for new tokens; the new
  `--ch-card-shadow-flat`/scrim need none.
- `src/clubhouse/__tests__/elevation-tokens.test.ts`: :50-58 every
  `backdrop-filter` contains `var(--ch-glass-blur)` (so spec's saturate must be
  appended, not substituted); RAW_SHADOW messages 10 (:134).
- `src/clubhouse/__tests__/contrast-tokens.test.ts` (:426 pins a Messages
  selector), `hairlines.test.ts`, `radius-steps.test.ts`,
  `spacing-scale.test.ts`, `tabular-nums.test.ts`, `chips-tabs.test.ts`,
  `legacy-type-roles.test.ts`, `selected-state.test.ts`,
  `look-feel-pass-css.test.ts`, `z-ladder.test.ts:59` (`.ch-rx` z),
  `page-spacing.test.ts:111-115`, `long-lists-css.test.ts:11-29` (`.ch-ms-row`
  content-visibility, `.ch-ms-msg` must NOT have it),
  `messages-polls-css.test.ts`: CSS-text ratchets; they should legitimately
  change only downward when legacy rules are deleted (lower the recorded counts,
  do not raise).
- `src/clubhouse/screens/messages/__tests__/`: `thread-v2.test.tsx`,
  `thread-v2-traps.test.tsx`, `thread-make-room.test.tsx` (pin
  `useThreadMakeRoom` replace-not-add and the `send`/`reveal`/`pop`/`smooth`
  choice, reduced skip), `composer-v2.test.tsx`, `seen-pill.test.tsx`,
  `thread-drag-k.test.tsx` (52k / 58k drag), `conv-row-seams.test.tsx`,
  `conv-context-menu.test.tsx`. In my slice: any test asserting `send` is the
  bubble spring or the receipt delay changes when `launch` takes the bubble
  (MOT-SPR-4/5); the plus-key aria string is pinned in
  `screens/messages/__tests__/composer-v2.test.tsx`; grep the others before
  renaming.
- `src/clubhouse/__tests__/messages-design-fixture` is
  `src/clubhouse/preview/__tests__/messages-design-fixture.test.tsx` (preview
  fixture the e2e uses).
- `e2e/clubhouse-messages-motion.spec.ts` (11 interrupt cases, headed +
  localhost) and `e2e/messages.spec.ts` (required check for
  `team_communications`).
- `src/clubhouse/lib/__tests__/` has no `haptics` or `reduced-motion` unit test
  for Messages; `motion-physics.test.tsx` mocks `hapticScrub` only.

### Risks and surprises

1. **Literal durations and curves are linted.** New WAAPI/framer durations like
   120, 150, 160, 200, 220, 260, 480, 520 written as `duration: 120` fail
   `clubhouse:check` (allowed set .11 .18 .26 .28 .52 and 0). Put named
   constants in `lib/motion.ts` (exempt) or use `chSpringCurve(...).ms`. In CSS
   the same literals and `cubic-bezier(...)` are banned outside tokens.css, so
   the 480 ms keyboard curve, the 120 ms crossfade and the launch curve all need
   tokens (`--ch-ease-sheet` already exists, unused).
2. **MOT-DET-2 (animate `grid-template-columns`) trips
   `clubhouse/no-layout-motion`** and contradicts the Nov 7 "transform and
   opacity only" shell-motion rule
   (docs/clubhouse/changes/2026-11-07-shell-motion.md). The prep (`320 | 1fr |
   0px`, messages.css:4070-4080) exists without the transition. Needs an
   owner-approved exception recorded in the baseline, or a transform-based
   design (slide the panel, snap the thread width). Same family: MOT-SEND-9 /
   MOT-THR-4 "composite add" (a second send adds on top) conflicts with
   `useThreadMakeRoom`, which deliberately cancels the running move so it stays
   on the compositor (thread-v2.tsx:207; change note 2026-11-07-shell-motion).
3. **Ratchets run both ways.** Deleting legacy `messages.css` rules (gradient
   bubble hex, dead washes) makes `css-ratchet.json` hex 6 too HIGH and fails
   until `npm run clubhouse:css -- --ratchet` is run and the JSON committed;
   same for the per-file counts in the Tests list. Adding spec values like
   `padding 3 9`, `gap 7`, `margin 22 0 8` raises the off-scale count
   (spacing-scale, messages.css 9): write them as `calc(N * var(--ch-type-k))`
   or move to scale steps.
4. **Glass tokens are not covered by Reduce Transparency / Increase Contrast.**
   Those blocks set `--ch-glass-bg` and `--ch-glass-blur: 0px`
   (tokens.css:1476-1500) but Messages draws `--ch-glass-strong`/`--ch-glass`,
   so under Reduce Transparency the composer, menus, date pill, jump key and
   toast stay 74-90% translucent with no blur over moving text. Add both tokens
   to those blocks (opaque `--ch-card-bg`-like fills).
5. **Shared tokens are read by other pages.** `--ch-glass-strong`
   (coachhelm-ask-v2), `--ch-scrim` (Modal and sheets everywhere),
   `--ch-card-shadow` (many pages), `--ch-bubble-mine-bg`
   (coachhelm-thread.css:64). Override inside `[data-ch-ms-v2]` or add NEW
   tokens; changing the global value is a cross-page visual change. Nine tokens
   exist but nothing reads them (`--ch-bubble-radius`, `--ch-bubble-join`,
   `--ch-poll-bar`, `--ch-poll-bar-on`, `--ch-glass-rule`): use them instead of
   adding new ones.
6. **Name traps in the token map.** SPEC "ink-2" is `--ch-text-tertiary`, not
   `--ch-text-secondary`; spec "ink-3" in dark is `--ch-crh-ink4`, NOT
   `--ch-ink-500` (#bab3a4). Messages currently draws times in ink-2 (spec
   ink-3) and secondary text in ink-700. `--ch-on-accent` (messages.css:5540) is
   undefined; `--ch-accent` dark (#23704a) is not the sent colour.
7. **Keyboard (MOT-KB-1) is layout-based and shared.** Resize comes from
   `padding-bottom` on `.ch-pscreen[data-fw-keyboard-aware]` (shell.css:1590),
   not a transform; `body.keyboard-open { padding-bottom }` (globals.css:485)
   also exists (harmless on a fixed screen). `keyboardWillShow` carries only the
   height, so the 480 ms curve is a fixed assumption and can drift from the real
   iOS animation. Web Safari uses the `visualViewport` path (`data-ch-vv`), so
   the two environments need separate checks; the native path cannot be
   exercised on desktop.
8. **Avatar is a policy conflict, not a styling gap.** MSG-902's per-person hues
   contradict the 5 Nov "coins are the calm neutral" ruling baked into
   `ui/Avatar.tsx` and `ui.css:252-259` (phone forces neutral). Get an owner
   answer before anyone touches it; 75 files import Avatar.
9. **HTML vs Nov 4 rulings (all in QUESTIONS.md already, listed so slice owners
   see them):** haptic medium (HTML) vs `press` (ruling 22, keep); clone-flight
   send (HTML, Q-19) vs "move the real bubble" (ruling 23; today's code moves
   the real bubble, thread-v2.tsx:312-340); 120 vs 180 ms (Q-05); launch bounce
   0.2 over the 0.1 cap (Q-04). `chSpringCurve('launch')` is 812 ms, not 828:
   derive 0.62x and 70% from it.
10. **Stale references.** `MessagesView.tsx:194` and `MessagesScreen.tsx:34`
    describe a flag that no longer exists; GO-LIVE-RUNBOOK and
    team-communications.md still list `golf_messages_redesign_v1`. Fix in the
    same change that touches them. CLAUDE.md says Clubhouse is off in production
    but `config/feature-flags.yml` says `production: true`; verify before saying
    anything is live.
11. **`CH_SPRING_POP_MS = 507`** (motion.ts:22) disagrees with
    `chSpringCurve('pop').ms` (496); only quick-chat uses it. Do not copy it
    into Messages.
12. **A brand-new `'use server'` action that returns or re-exports a type will
    take down send/mark-read/edit/delete** (see the warning in
    `src/app/golf/actions/messages.ts:380-391`); none of the files above has the
    problem today.

## Part H. Not matched as drawn (10 Nov 2026, release train)

What the built screens still do differently from
`design-refresh/messages/redesign`, and why.

| Where | Drawn | Built | Why |
| --- | --- | --- | --- |
| Receipt under your last message (1:1) | "Seen 8:15 AM" | "Seen" | Needs the other person's read time; that field comes with the data branch. |
| Pinned faces | 62 px | 64 px | Avatar's `xl` step; a token wins over a raw value (owner, 10 Nov). |
| Row faces, phone | 44 px | 40 px | Avatar's `lg` step, as the rail already was. |
| Seen by sheet faces | 32 px | 36 px | Avatar's `md` step. |
| Details tiles | radius 14 | radius 12 | The radius scale has no 14. |
| Details | no Schedule row | Schedule card after Photos and files | Today's action, kept; a coach uses it. |
| New message | no Quick groups | Quick groups card | Today's action, kept. |
| New message rows | 32 px faces | Avatar's `md` step | The shared step, not a lane size. |
| "See all" on Photos and files | always shown | only when there is more to see | A link to nothing is a dead control. |
| Desktop conversation switch | rise 6 px over 260 ms on the house curve | the shared swap: fade 260 ms, rise on a 350 ms spring, old content fades 180 ms | The shared primitive is kept (owner, 10 Nov). |
| + key rotation | 300 ms | 280 ms | The duration token. |
| Send key glow | drawn drop | a local green drop (`--ch-ms-send-drop`) | Neither shared elevation token is this colour. |
| Nobody has seen a group message | each row says when they last opened the chat | each row says "Hasn’t opened this chat" | As built before this pass; the wording is the design page's motion note (MOT-TEAM-3). |
| Phone thread bar above the default Text Size | name over role | the name alone | The shell's bar row is 44 px at every Text Size; name and role fit it only up to the default, so the role gives way. |
| Phone Details back label | "Back" | the conversation's name | The shared back label names the parent screen. |
| Seen by, "Not seen yet" order | the coach first | players first, coaches last | The list's existing order rule (`orderReceiptRows`). |
| Seen by, the line under a name, for a player viewer | class year | "Player" or "Coach" | Class years are a coach's view; the list itself opens for a coach only. |

Still open, not a design difference: the keyboard ride moves the list with an
additive animation (pinned by `thread/__tests__/use-thread-layers.test.tsx`),
which WebKit does not run on the compositor.
