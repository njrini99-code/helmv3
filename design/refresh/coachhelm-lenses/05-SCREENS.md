# CoachHelm Lenses: screen inventory

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 30 rows).

Every screen, push, sheet, menu, toast and inline state this lane puts on screen. 06, 07, 08 and `capture/capture.mjs` use these IDs and these state ids, nothing else.

Design page: [CoachHelm Lenses](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe), version 6 (3 Nov). Local copy: `redesign/coachhelm-lenses.html`. A page link is `#<screen>-<tokens>`; tokens are listed in 04 section 1 and at the end of this file. App links are the preview route from 02-PLAN 2.8: `/clubhouse-preview/coachhelm-player-file?state=…&lens=coach|player&viewer=player`. Where the fixture state doesn't exist yet, the cell says "add".

Where this file and 04-FIDELITY-SPEC disagree, this file wins (BUILD_CONTRACT_STANDARD).

## Screen IDs

Example data throughout: Demo University Golf, head coach Maya Reyes, player Eli Brandt (junior), 21 rounds, top read "Penalty strokes: 1.1 a round".

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| `S-LIST` | screen (phone, coach) | CoachHelm in the bottom bar, as a coach. Lane 1 (Team Board) owns this screen; this lane only adds the row push and its hook | [#list-phone](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#list-phone) · `redesign/coachhelm-lenses.html#list-phone` | `/clubhouse-preview/coachhelm` (today's board fixture). Real: `/golf/dashboard/coachhelm` | coach only | 1 (row link to `playerFileHref`, `data-ch-hf-open`) |
| `S-FILE` | push on phone; screen on desktop | Phone: tap a player row on `S-LIST` (`data-ch-hf-open`). Desktop: CoachHelm in the sidebar, then a player in the rail. Also: an old Deep dive or Standing link (redirects, 02 §2.2), a notification with `at=` and `insight=` | [#file-phone](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone) · `#file-phone`; desktop [#file-desktop](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-desktop) | `coachhelm-player-file?state=accepted`. Real: `/golf/dashboard/coachhelm?view=player&player=<id>` | coach only. A player who opens this address gets their own `S-BOARD` | 1 shell, feature, reads, strokes; 2 plan; 3 field; 4 your plan and track record |
| `S-FILE.rail` | inline (desktop only) | Desktop `S-FILE`: the 300px "By player" rail. Tap another player: the file swaps in place, the rail row takes the selected tint | [#file-desktop](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-desktop) (Eli selected) | `coachhelm-player-file?state=accepted` at 1280 | coach | 1 |
| `S-FILE.lens` | inline state | On `S-FILE`, tap "As Eli sees it" in the lens control (`data-ch-lens="player"`). "Coach view" turns it back. Resets to Coach view on Back and on a fresh visit | [#file-phone-lens](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-lens) · desktop [#file-desktop-lens](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-desktop-lens) | `coachhelm-player-file?state=accepted&lens=player` | coach only. Shows exactly what `S-BOARD` shows Eli for the same data, plus the preview pill | 5b |
| `S-FILE.focus` | inline state | On `S-FILE`, the feature card's actions and the plan card's handshake by focus stage: no focus, Suggested (just assigned), Shown to Eli, Accepted, Declined | [#file-phone-nofocus](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-nofocus), [#file-phone-suggested](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-suggested), [#file-phone-seen](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-seen), [#file-phone](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone) (accepted) | `state=noplan`, `proposed`, `seen`, `accepted`, `declined` | coach | 2 (handshake); 1 (Assign on the feature card) |
| `S-FILE.undo` | inline state | On `S-FILE`, Dismiss a read in `S-FILE.read`: the read's row in All reads becomes "Dismissed: … Undo". Undo turns it back | [#file-phone](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone) (the "Fairways hit on par 5s" row is a dismissed read) | `state=accepted` (the fixture carries one dismissed read; add if missing) | coach | 1 |
| `S-FILE.read` | sheet on phone (hugs content, max 86% of the screen); centred dialog 480 wide on desktop | Tap the feature card (`data-ch-hf-read="top"`) or a row in All reads (`data-ch-hf-read="<id>"`). Closes on X, scrim, Cancel, swipe down, Esc, Dismiss or Assign | [#file-phone-sheet](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-sheet) · desktop [#file-desktop-sheet](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-desktop-sheet) | `state=accepted`, then tap `[data-ch-hf-read="top"]` | coach: five corrections, footer Dismiss and Assign as focus. Lens: as `S-BOARD.read` | 1 |
| `S-FILE.plan` | sheet on phone (hugs content, max 86%); dialog 480 on desktop | Tap "Edit plan" or "Set a plan" on the "Your plan for Eli" card (`data-ch-hf-intent-edit`). Closes on Cancel, Save plan, X, scrim, swipe down, Esc | [#file-phone-intent](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-intent) · no plan yet [#file-phone-intent-nointent](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-intent-nointent) · desktop [#file-desktop-intent](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-desktop-intent) | `state=accepted` then tap `[data-ch-hf-intent-edit]`; `state=nointent` for the empty plan | coach only; never in the lens or `S-BOARD` DOM | 4 |
| `S-FILE.more` | menu (today's `ui/Menu`, 232 wide) | Tap More (three dots) in the pushed bar on phone, or the More button after the lens control in the desktop head (`data-ch-hf-more`). Items: "Open Eli's profile" (`/golf/dashboard/roster?player=<id>`, fixed 4 Nov: the Roster lane's profile deep link), "Message Eli" | [#file-phone-menu](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-menu) · desktop [#file-desktop-menu](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-desktop-menu) | `state=accepted` then tap `[data-ch-hf-more]` | coach | 1 |
| `S-FILE.toast` | toast (today's `useToast`, unchanged) | A write that fails (Assign, Dismiss, Undo, Save plan, Accept, Decline), or Assign on a metric the player already has a focus on | not drawn | `state=failwrites`, `state=duplicate` | both | 1 (Assign, Dismiss, Undo), 4 (Save plan), 6 (Accept, Decline) |
| `S-BOARD` | screen (player) | CoachHelm in the bottom bar (phone) or sidebar (desktop), as a player. The Board segment of today's Board · Standing · Deep dive strip | [#board-phone](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone) · desktop [#board-desktop](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-desktop) | `coachhelm-player-file?viewer=player&state=accepted`. Real: `/golf/dashboard/coachhelm` as a player | player only (their own data). Never Your plan, Track record, teammate dots, "Seen repeatedly", Wrong cause, Already on it, Show later | 6 |
| `S-BOARD.focus` | inline state | On `S-BOARD`, a focus the coach suggested: Accept (`data-ch-hf-accept`) and Decline (`data-ch-hf-decline`) on the feature card. After Accept, "Your focus since Oct 5" | [#board-phone-suggested](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone-suggested), [#board-phone-seen](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone-seen), [#board-phone](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone) (accepted), [#board-phone-nofocus](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone-nofocus) | `viewer=player&state=proposed`, `seen`, `accepted`, `noplan`, `declined` | player | 6 (live Accept and Decline); 2 (handshake card) |
| `S-BOARD.read` | sheet on phone; dialog 480 on desktop | On `S-BOARD`, tap the feature card or a row in Also worth knowing | [#board-phone-sheet](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone-sheet) | `viewer=player&state=accepted`, then tap `[data-ch-hf-read="top"]` | player: two corrections (Not this, Good read), read word "Solid read", no footer | 6 (reuses PR 1's sheet) |

Not in this lane: the coach's team board on desktop and phone (lane 1), the full Standing and Deep dive views (they stay as they are for players, and coaches are redirected from them), Messages compose (opened by "Message Eli", lane Messages), the player profile (opened by "Open Eli's profile", Roster lane).

## State ids

The capture state id is what `capture.mjs --state` takes. Each id turns into a page hash token and an app preview query, as listed here and in `capture.mjs` (`STATES`). Theme is not a state: every capture writes `light` and `dark` unless `--theme` says one.

| State id | Page hash token | App preview | Viewport |
|---|---|---|---|
| `default` | none | `state=accepted` | phone 402 |
| `loading` | `loading` | `state=loading` | phone 402 |
| `empty` | `empty` | `state=empty` | phone 402 |
| `failed` | `failed` | `state=failed` | phone 402 |
| `early` | `early` | `state=early` | phone 402 |
| `long` | `long` | `state=long` | phone 402 |
| `many` | not drawn (falls back to default) | `state=manyreads` (add: 14 open reads, 3 dismissed, 30 rounds) | phone 402 |
| `one` | not drawn (falls back to default) | `state=oneread` (add: the top read only, no others) | phone 402 |
| `stale` | not drawn (falls back to default) | `state=readsfailed` (one section's read failed; the rest drawn) | phone 402 |
| `xxl` | `xxl` | `state=accepted`, `--ch-type-scale: 1.36` on `<html>` | phone 402 |
| `reduce` | `reduce` | `state=accepted`, `reducedMotion: 'reduce'` | phone 402 |
| `w390` | none | `state=accepted` | 390 × 844 |
| `w430` | none | `state=accepted` | 430 × 932 |
| `desk` | `desktop` | `state=accepted` | 1280 × 800 |
| `nofocus` / `suggested` / `seen` / `declined` | `nofocus` / `suggested` / `seen` / not drawn | `state=noplan` / `proposed` / `seen` / `declined` | phone 402 |
| `nofield` | `nofield` | `state=nofield` | phone 402 |
| `fieldfew` | not drawn (falls back to default) | `state=fieldfew` (a field of 4 on the newest round) | phone 402 |
| `nointent` | `nointent` | `state=nointent` | phone 402 |
| `failwrites` / `duplicate` | not drawn | `state=failwrites` / `duplicate` | phone 402 |

The page's phone device is 402 × 874 (iPhone 16 Pro). The app is shot at 402 to pair with it, and at 390 and 430 for the edge check (SHARED-7). On the page the side edge is 16 at every phone width, because the device is 402; the app's 20px edge at 430 and up is checked on the app shot alone.

## State matrices

"Drawn" gives the page link. "Not drawn" gives the rule the build follows. Every row has a capture state id, even where the page has no drawing, so the app side is still shot.

### S-LIST

This lane changes one thing here: each player row pushes `S-FILE`. Everything else on the screen is lane 1's and is checked in lane 1's package.

| Row | Drawn? | Capture | Rule |
|---|---|---|---|
| default | [#list-phone](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#list-phone) | `default` | Each player row carries `data-ch-hf-open` and links to `playerFileHref(id)` when the flag is on; flag off, the row goes where it goes today |
| loading | not drawn | `loading` | Lane 1's skeleton; rows aren't tappable until loaded |
| empty | not drawn | `empty` | Lane 1's empty board; nothing to push |
| error | not drawn | `failed` | Lane 1's RefreshNotice |
| long text | [#list-phone-long](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#list-phone-long) | `long` | Name and read line one line each, ellipsis; chip and chevron never wrap |
| lots of items | not drawn | `many` | Lane 1's list; every row pushes |
| one item | not drawn | `one` | One row; pushes |
| offline or stale | not drawn | `stale` | Lane 1's rule |
| XXL | [#list-phone-xxl](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#list-phone-xxl) | `xxl` | Rows grow; the push target is the whole row |
| dark | [#list-phone-dark](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#list-phone-dark) | `default` (dark file) | Lane 1's colours |
| Reduce Motion | [#list-phone-reduce](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#list-phone-reduce) | `reduce` | The push becomes today's reduced push (07 M-LNS-01) |
| phone 390 | not drawn | `w390` | Edge 16 |
| large phone 430 | not drawn | `w430` | Edge 20 |
| desktop 1280 | not drawn | `desk` | No list on desktop: the rail on `S-FILE` replaces it |

### S-FILE

Card order, phone: feature, plan, last round in context, all reads, where the strokes go, your plan for Eli, track record with Eli. Desktop: left column feature, plan, strokes; right column last round, all reads, your plan, track record. (What's working shows only in the lens, `S-FILE.lens`.)

| Row | Drawn? | Capture | Rule |
|---|---|---|---|
| default | [#file-phone](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone) | `default` | Focus accepted, 21 rounds, every card |
| loading | [#file-phone-loading](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-loading) | `loading` | Each card keeps its title and draws today's `Skeleton` lines (12pt tall, three lines at 82, 64, 74%); the feature card is a green `Skeleton shape="feature"` of the loaded card's height. The lens control is drawn but disabled. No tap opens a sheet |
| empty | [#file-phone-empty](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-empty) | `empty` | No rounds: one card "No rounds yet" with Message Eli, then Your plan and Track record (both still useful with no rounds). No feature card, no strokes |
| error | [#file-phone-failed](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-failed) | `failed` | The file's load failed: one card "Couldn't load Eli's file", amber icon, Try again (`data-ch-hf-retry`). No lens control. Try again shows `loading`, then the data |
| early season | [#file-phone-early](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-early) | `early` | 2 rounds, totals only: feature "No reads yet" with "0 of 4 rounds that count"; strokes rows show "—"; reads "No reads yet"; no field card; track record "No focus assigned to Eli yet this season" |
| long text | [#file-phone-long](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-long) | `long` | Name "Maximilian Okonkwo-Vandermeer", course "Lonnie Poole Golf Course at NC State". Bar title, card meta and row meta: one line, ellipsis. Read titles and the feature title: two lines, then ellipsis. Your plan note: wraps, no limit |
| lots of items | not drawn | `many` | All reads lists every open read the loader returns (up to its limit of 30), in `orderDive`'s order, then the dismissed rows. No inner scroll, no "show more": the card grows. Meta reads "14 open · 3 dismissed" |
| one item | not drawn | `one` | The feature card holds the one read; All reads still lists it ("1 open"); no dismissed row |
| offline or stale | not drawn | `stale` | A section whose read failed shows today's `RefreshNotice` in that card's place (`readsfailed`, `sgfailed`, `fieldfailed`, `intentfailed`); the other cards draw. Two or more failed: the page-level notice, as today. The figures always say how old they are ("as of Oct 30") |
| no field | [#file-phone-nofield](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-nofield) | `nofield` | Fewer than 3 played the newest round, or `coachhelm_team_pattern_v1` is off: no field card, the rest closes up |
| small field | not drawn | `fieldfew` | A field of 3 or 4: the card draws with every teammate dot (coaches see every field size) |
| no plan set | [#file-phone-nointent](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-nointent) | `nointent` | Your plan card: "Not set yet…" and Set a plan |
| XXL | [#file-phone-xxl](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-xxl) | `xxl` | Every type step × 1.36; rows and cards grow; the feature comparison stays three columns; strokes label column stays 108pt and its text wraps to two lines |
| dark | [#file-phone-dark](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-dark) | `default` (dark file) | Dark tokens in 06 |
| Reduce Motion | [#file-phone-reduce](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-reduce) | `reduce` | Drawn the same at rest; motion per 07's Reduce Motion column |
| phone 390 | not drawn | `w390` | Edge 16; feature comparison cells 3 across at about 108pt each |
| large phone 430 | not drawn | `w430` | Edge 20 |
| desktop 1280 | [#file-desktop](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-desktop) | `desk` | Sidebar 216, glass top bar 56, rail 300, file in two columns (1.12fr and 1fr, gap 20) |

### S-FILE.rail

| Row | Drawn? | Capture | Rule |
|---|---|---|---|
| default | [#file-desktop](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-desktop) | `desk` | "By player", count in the meta, one row per active player, the open player tinted |
| loading | [#file-desktop-loading](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-desktop-loading) | `loading` | The rail draws from the roster query, which is separate: rows show while the file skeletons |
| empty | not drawn | `empty` | One active player at least is always there (the open one) |
| error | not drawn | `failed` | Rail failed: today's `RefreshNotice` in the rail; the file still draws |
| long text | [#file-desktop-long](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-desktop-long) | `long` | Name and second line one line each, ellipsis |
| lots of items | not drawn | `many` | 25 players: the rail scrolls on its own; the open row is scrolled into view on load |
| one item | not drawn | `one` | One row, selected |
| offline or stale | not drawn | `stale` | As error |
| XXL | not drawn | `xxl` | Desktop doesn't follow iPhone Text Size; same as default |
| dark | [#file-desktop-dark](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-desktop-dark) | `desk` (dark) | Dark tokens |
| Reduce Motion | [#file-desktop-reduce](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-desktop-reduce) | `reduce` at 1280 | File swap is a 180ms fade, `CH_FADE_MS` (07 M-LNS-20) |
| phone 390 / 430 | n/a | n/a | No rail on phone |
| desktop 1280 | drawn | `desk` | As default |

The second line of a rail row is the class year until lane 1's loader exposes each player's top read (04 8 P). The page draws the top read; the build shows "Junior" until then.

### S-FILE.lens

| Row | Drawn? | Capture | Rule |
|---|---|---|---|
| default | [#file-phone-lens](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-lens) | `default` + `lens=player` | Player voice ("You"); preview pill "Previewing Eli's screen"; Your plan and Track record folded away; What's working folded in; reads card titled "Also worth knowing" with the Board's caps |
| loading | not drawn | `loading` + lens | The lens control is disabled while loading, so the lens can't be entered |
| empty | [#file-phone-lens-empty](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-lens-empty) | `empty` + lens | The player's empty card, "Go to Rounds" shown but inert in the lens (a coach can't post Eli's rounds) |
| error | not drawn | `failed` | No lens control in the failed state |
| long text | not drawn | `long` + lens | As `S-BOARD` long |
| lots of items | not drawn | `many` + lens | Board caps: Also worth knowing at most 2 (3 with the focus), What's working 1, then "N more reads in the Deep dive" |
| one item | not drawn | `one` + lens | Also worth knowing not drawn when it has no rows |
| offline or stale | not drawn | `stale` + lens | As `S-FILE` |
| small field | not drawn | `fieldfew` + lens | No field card, as on `S-BOARD` (player floor `field_n ≥ 5`) |
| XXL | not drawn | `xxl` + lens | Pill grows, stays one line, ellipsis |
| dark | not drawn | lens, dark file | Dark tokens |
| Reduce Motion | not drawn | `reduce` + lens | Lens switch is a 180ms fade of the whole file (`CH_FADE_MS`), nothing folds (07 M-LNS-04) |
| phone 390 / 430 | not drawn | `w390`, `w430` + lens | Edges as `S-FILE` |
| desktop 1280 | [#file-desktop-lens](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-desktop-lens) | `desk` + lens | Pill under the head; right column becomes What's working, field, Also worth knowing |

### S-FILE.focus

| Row | Drawn? | Capture | Rule |
|---|---|---|---|
| default (accepted) | [#file-phone](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone) | `default` | All three steps filled; feature button "Eli accepted it" disabled |
| no focus | [#file-phone-nofocus](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-nofocus) | `nofocus` | Plan card "No focus yet"; feature buttons Assign as focus and Message Eli |
| suggested | [#file-phone-suggested](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-suggested) | `suggested` | Step 1 filled; "Sent to Eli" disabled; reads chip "Assigned" |
| shown to Eli | [#file-phone-seen](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-seen) | `seen` | Steps 1 and 2 filled. Shown fills from the first `player_feed` exposure after the focus was made (04 8 M), on a later load, at rest |
| declined | not drawn | `declined` | Step 3 reads "Declined" in the loss colour, its dot an amber ring with no tick; feature buttons return to Assign as focus |
| assigning (in flight) | not drawn | `default` + tap Assign (the fixture's mock write waits 600ms) | The pressed button reads "Assigning", disabled; other focus controls wait; nothing else changes until the write answers |
| loading / empty / error / early | drawn under `S-FILE` | as `S-FILE` | No handshake without a read |
| long text | [#file-phone-long](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-long) | `long` | Step labels "Shown to Maximilian" wrap to two lines; dates stay one line |
| lots of items / one item | n/a | n/a | One focus at a time |
| offline or stale | not drawn | `stale` | Plan card's read failed: `RefreshNotice` in its place |
| XXL | [#file-phone-xxl](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-xxl) | `xxl` | Steps stay three across; labels wrap |
| dark / Reduce Motion / 390 / 430 / desktop | `#file-phone-dark`, `#file-phone-reduce`, `#file-desktop` | `default`, `reduce`, `w390`, `w430`, `desk` | As `S-FILE` |

### S-FILE.undo

| Row | Drawn? | Capture | Rule |
|---|---|---|---|
| default | [#file-phone](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone) | `default` | "Dismissed: Fairways hit on par 5s" with Undo, last in All reads |
| undoing (in flight) | not drawn | tap Undo with the 600ms mock | Undo reads "Undoing", disabled |
| failed write | not drawn | `failwrites` | The row stays; `S-FILE.toast` says "Couldn't undo the dismissal" |
| long text | [#file-phone-long](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-long) | `long` | "Dismissed: …" one line, ellipsis; Undo never wraps |
| lots of items | not drawn | `many` | Every read dismissed on this visit or before shows its own row, newest first, after the open reads |
| XXL | [#file-phone-xxl](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-xxl) | `xxl` | Row grows; Undo keeps a 44pt hit area |
| loading, empty, error, one item, stale | n/a | as `S-FILE` | No row without a dismissed read |
| dark, Reduce Motion, 390, 430, desktop | as `S-FILE` | as `S-FILE` | Desktop: in the right column's All reads |

### S-FILE.read

| Row | Drawn? | Capture | Rule |
|---|---|---|---|
| default | [#file-phone-sheet](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-sheet) | `default` + tap top read | Penalty read: comparison gauge, penalties in the last 8 rounds, where it happened, why we think this, is this right (5), footer Dismiss and Assign as focus |
| loading | not drawn | `loading` | Can't open while the file loads |
| empty | not drawn | n/a | No read, no sheet |
| error | not drawn | `failwrites` + Assign | A failed Assign keeps the sheet open, button back to Assign as focus, toast |
| long text | [#file-desktop-sheet-long](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-desktop-sheet-long) | `long` + sheet | Title wraps, no limit; hole lines wrap after the date column |
| lots of items | not drawn | `many` + sheet | Where it happened lists every hole in the window; the sheet body scrolls inside the 86% cap; header and footer stay put |
| one item | not drawn | `one` + sheet | One hole line; the strip still draws 8 rounds |
| offline or stale | not drawn | `stale` + sheet | The strip's read failed: that well says "Couldn't load this part" with Try again; the rest draws |
| assigned already | [#file-phone-suggested-sheet](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-suggested-sheet) | `suggested` + sheet | Head chip "Assigned"; footer "Eli's focus", disabled |
| XXL | [#file-phone-sheet-xxl](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-sheet-xxl) | `xxl` + sheet | Sheet grows to its 86% cap, then the body scrolls; correction chips wrap |
| dark | [#file-phone-sheet-dark](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-sheet-dark) | sheet, dark file | Scrim rgb(2 6 4/.58) |
| Reduce Motion | [#file-phone-sheet-reduce](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-sheet-reduce) | `reduce` + sheet | Opens and closes with a fade (07 M-LNS-07) |
| phone 390 / 430 | not drawn | `w390`, `w430` + sheet | Full width; body side padding 16 |
| desktop 1280 | [#file-desktop-sheet](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-desktop-sheet) | `desk` + sheet | Centred dialog 480 wide, radius 20, no grabber |

### S-FILE.plan

| Row | Drawn? | Capture | Rule |
|---|---|---|---|
| default | [#file-phone-intent](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-intent) | `default` + tap Edit plan | Aim Breakout, Alerts Balanced, Watching Course management, the note |
| not set yet | [#file-phone-intent-nointent](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-intent-nointent) | `nointent` + tap Set a plan | Develop and Balanced picked, nothing watched, empty note with placeholder "Only you see this" |
| saving (in flight) | not drawn | tap Save with the 600ms mock | Save plan reads "Saving", disabled; Cancel disabled |
| error | not drawn | `failwrites` + Save | The sheet stays open with the picks kept; toast "Couldn't save your plan for Eli · Nothing was saved. Try again." (next free CH-13xxx code) (fixed 4 Nov wiring: CH-13760) |
| loading / empty | n/a | n/a | Opens only from a loaded card |
| long text | not drawn | `long` + sheet | A 3-line note: the field grows to fit up to 6 lines, then scrolls inside |
| lots of items / one item | n/a | n/a | Fixed lists (5 aims, 4 alert levels, 5 areas) |
| offline or stale | not drawn | `stale` | `intentfailed`: the card shows `RefreshNotice`, so the sheet can't open |
| XXL | not drawn | `xxl` + sheet | Picks wrap to more lines; footer stays pinned |
| dark | not drawn | sheet, dark file | Dark tokens |
| Reduce Motion | not drawn | `reduce` + sheet | Fade |
| phone 390 / 430 | not drawn | `w390`, `w430` | Full width |
| desktop 1280 | [#file-desktop-intent](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-desktop-intent) | `desk` + sheet | Dialog 480 |

### S-FILE.more

| Row | Drawn? | Capture | Rule |
|---|---|---|---|
| default | [#file-phone-menu](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-menu) | `default` + tap More | Two items, top right under the bar, 232 wide |
| loading | not drawn | `loading` | More works while loading (it needs only the player's id) |
| empty / error | not drawn | `empty`, `failed` | Still offered; both items work with no rounds |
| long text | [#file-phone-menu-long](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-phone-menu-long) (dark: `#file-phone-dark-menu-long`) | `long` + menu | Items ellipsis at 232 wide ("Open Maximilian's prof…") |
| lots of items / one item | n/a | n/a | Two fixed items |
| offline or stale | n/a | n/a | No data |
| XXL | not drawn | `xxl` + menu | Row height 34 × 1.36 = 46pt; width stays 232 |
| dark | not drawn | menu, dark file | Glass rgb(22 27 23/.86) |
| Reduce Motion | not drawn | `reduce` + menu | Fade |
| phone 390 / 430 | not drawn | `w390`, `w430` | 10pt from the right screen edge (today's Menu: 8 minimum) |
| desktop 1280 | [#file-desktop-menu](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#file-desktop-menu) | `desk` + menu | Anchored under the head's More button, right aligned |

### S-FILE.toast

Today's toast, untouched. Its wording is in 02 §2.6 and `parts.tsx` (`useFocusActions`). Not drawn on the page.

| Row | Drawn? | Capture | Rule |
|---|---|---|---|
| default (failed write) | not drawn | `failwrites` + Assign | "Couldn't assign the focus to Eli", hint "Nothing was saved. Try again.", CH-13001 |
| duplicate focus | not drawn | `duplicate` + Assign | "Eli already has a focus on this"; the card shows the focus as active |
| every other row | not drawn | as `S-FILE` | Today's toast layout and motion; long text wraps in the toast; XXL grows it; Reduce Motion as today |

### S-BOARD

Card order, phone: feature, what's working, plan, last round in context, where the strokes go, also worth knowing. Desktop: left feature, plan, strokes; right what's working, field, also worth knowing.

| Row | Drawn? | Capture | Rule |
|---|---|---|---|
| default | [#board-phone](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone) | `default` | "Your week", "21 rounds · refreshed Oct 30"; field card shows the field average and Eli's own mark only |
| loading | [#board-phone-loading](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone-loading) | `loading` | As `S-FILE` loading |
| empty | [#board-phone-empty](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone-empty) | `empty` | "No rounds yet" with Go to Rounds |
| error | [#board-phone-failed](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone-failed) | `failed` | "Couldn't load your CoachHelm", Try again |
| early season | [#board-phone-early](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone-early) | `early` | "Your reads start after 4 full rounds" with 0 of 4 |
| long text | [#board-phone-long](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone-long) | `long` | As `S-FILE` |
| lots of items | not drawn | `many` | Today's Board caps (`NEEDS_MAX` 3 with the focus, `WORKING_MAX` 1): Also worth knowing at most 2 rows, What's working 1, then "N more reads in the Deep dive" (`moreReadsLine`) as the reads card's note |
| one item | not drawn | `one` | Feature only; Also worth knowing and What's working not drawn when empty |
| offline or stale | not drawn | `stale` | As `S-FILE` |
| no field | [#board-phone-nofield](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone-nofield) | `nofield` | No field card |
| small field | not drawn | `fieldfew` | A field of 3 or 4: no field card for the player (the mean would give away teammates' scores); the rest closes up. The coach's file still shows the card with dots |
| XXL | [#board-phone-xxl](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone-xxl) | `xxl` | The Board · Standing · Deep dive strip stays one line; labels ellipsis before wrapping |
| dark | [#board-phone-dark](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone-dark) | `default` (dark file) | Dark tokens |
| Reduce Motion | [#board-phone-reduce](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone-reduce) | `reduce` | Per 07 |
| phone 390 / 430 | not drawn | `w390`, `w430` | Edges 16 / 20 |
| desktop 1280 | [#board-desktop](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-desktop) | `desk` | No rail; the view strip sits right of the title |

### S-BOARD.focus

| Row | Drawn? | Capture | Rule |
|---|---|---|---|
| default (accepted) | [#board-phone](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone) | `default` | "Your focus", disabled "Your focus since Oct 5" |
| suggested | [#board-phone-suggested](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone-suggested) | `suggested` | "Coach Reyes suggests this as your focus", Accept and Decline |
| shown | [#board-phone-seen](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone-seen) | `seen` | As suggested (Shown is the coach's word for it) |
| no focus | [#board-phone-nofocus](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone-nofocus) | `nofocus` | "Top of your list", no buttons |
| declined | not drawn | `declined` | Feature card back to "Top of your list"; the coach is not named |
| accepting (in flight) | not drawn | `suggested` + Accept with the 600ms mock | Accept reads "Accepting", both buttons disabled |
| failed write | not drawn | `failwrites` + Accept | Buttons stay; toast "Couldn't accept the focus · Nothing was saved. Try again." (next free code) (fixed 4 Nov wiring: today's `ProposalRow` toast, "Couldn't accept {title}" / "It is still waiting for you. Try again in a moment.", CH-13004; decline CH-13005, `screens/coachhelm/Proposals.tsx:35, 44`) |
| long, XXL, dark, Reduce Motion, 390, 430, desktop | `#board-phone-long`, `-xxl`, `-dark`, `-reduce`, `#board-desktop` | as `S-BOARD` | Buttons wrap to a second line before they shrink |
| loading, empty, error, lots, one, stale | as `S-BOARD` | as `S-BOARD` | No focus controls without a read |

### S-BOARD.read

| Row | Drawn? | Capture | Rule |
|---|---|---|---|
| default | [#board-phone-sheet](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe#board-phone-sheet) | `default` + tap top read | "You", "Why CoachHelm thinks this", "Solid read", two corrections, no footer |
| every other row | as `S-FILE.read` | as `S-FILE.read` | Same sheet and rules, player words; no Dismiss, no Assign |

## Page hash tokens

`#<screen>-<token>-<token>…`, tokens in any order: screen `list`, `file`, `board`; device `phone`, `desktop`; theme `light`, `dark`; `lens`; overlays `sheet`, `intent`, `menu`; focus stage `nofocus`, `suggested`, `seen` (default accepted); data `loading`, `early`, `empty`, `failed`, `long`, `nofield`, `nointent`; type `larger` (1.18), `xxl` (1.36); `reduce`. The caption under the device always shows the hash it is on.

## Completeness pass, 4 Nov 2026

Added after a front-to-back check of every ID against states, sizes, entry points, flags and the handoffs to Team, Read, Stats and the roster. Same shapes as above. Rows fixed in place carry `(fixed 4 Nov: ...)`; the log is in `lane-reports/coachhelm-lenses.md`.

### New screen IDs

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| `S-FILE.read.gone` | inline state in the sheet | `insight=` names a read that is gone, or one this viewer may not see | not drawn | add `&insight=gone` | both | 1 |
| `S-FILE.plan.discard` | inline state in the plan sheet footer | Scrim tap, swipe down or Esc with unsaved picks | not drawn | add `&state=plandirty` | coach | 4 |
| `S-FILE.off` | flag off | Any file entry with `coachhelm_player_file_v1` off | today's player page | today's | both | 1 |

### S-FILE (added rows)

| Row | Drawn? | Capture | Rule |
|---|---|---|---|
| 1024 to 1179 | not drawn | add `w1100` | Desktop shell, rail 300, the file in one column in phone card order (max 720). Two columns start at 1180 (fixed 4 Nov: the shared breakpoint with Team and Read). |
| 821 to 1023 | not drawn | add `w900` | Desktop shell with no rail: S-LIST in the main area, and a row pushes the file inside the shell as on phone (M-LNS-01). Back returns to the list. |
| deep link `at=` and `insight=` | drawn (M-LNS-28) | `notif` | As 08 S-FILE 9. A gone or not-allowed `insight=` opens `S-FILE.read.gone`; a bad `player=` opens today's not-on-team screen (CH-13311). |
| old links | n/a | n/a | Roster profile and peek CoachHelm links, and old Deep dive and Standing links, redirect to the file (02 §2.2) with the flag on. |
| cold start | not drawn | add `cold` | No push on first paint; Back goes to S-LIST (phone) or stays on the file (desktop, rail present). |
| player opens a coach file URL | not drawn | n/a | A player gets their own `S-BOARD`; the query is dropped by replace; nothing of another player loads. |
| pull to refresh | not drawn | n/a | Today's pull to refresh on the route; cards swap in place, no chart redraw, the lens stays as it was. |
| Back and restore | not drawn | n/a | Back to S-LIST keeps the list scroll; coming back into a file starts on "As you see it" (the lens resets) with scroll at the top. Back from Read or Stats returns to the same scroll and lens. |
| two devices | not drawn | n/a | Assign elsewhere: next load shows the focus and the row chip "Assigned". Plan saved on two devices: the last save wins; the card shows the latest on next load. |
| deleted mid-session | not drawn | n/a | A read removed while the file is open: its row stays until the next load; opening it shows `S-FILE.read.gone`; a write on it fails with today's toast. |
| 1 Aug rollover | not drawn | add `rollover` | From 1 Aug the file reads the new season: no rounds gives `empty`; track record and plan stay; last season stays in Stats. |
| timezone | not drawn | n/a | Round dates are date-only and show as stored. |
| keyboard and screen reader | not drawn | n/a | Tab order: bar, lens control, cards in order; Esc closes the top sheet or the menu and focus returns to the opener; the lens control is a radio group with arrow keys. |
| share and print | n/a | n/a | No share or print styles. |

### S-FILE.read (added rows; contract in 06 Completeness pass)

| Row | Drawn? | Capture | Rule |
|---|---|---|---|
| gathering | not drawn | `early` + a read with no drill | Still gathering card in the drill's place; no Assign. |
| no Tour | not drawn | add `notour` + sheet | Tour row left out; the `ChLadderRow.missing` line under the rows. |
| Team row | drawn | `default` + sheet | Only with a team pool, `coachhelm_team_pool_v1` on and 5 or more in the pool (fixed in 08 S-FILE.read 3). |
| stale | not drawn | add `readstale` + sheet | "Out of date" chip first; no Assign. |
| part failed | drawn as "offline or stale" above | `stale` + sheet | "Couldn't load this part" with Try again. |
| links | not drawn | n/a | "Open the full read" only with `coachhelm_read_v1` on; Ask only once Ask exports its href. |
| on success | drawn | `default` + Assign | The sheet closes, then the card swaps (M-LNS-15). Team keeps its sheet open on the Assigned row instead; this is the host's choice, the sheet's states are the same. |
| double submit | not drawn | `failwrites` | A second tap while in flight does nothing. |

### S-FILE.read.gone

| Row | Drawn? | Capture | Rule |
|---|---|---|---|
| default | not drawn | add | Compact gone card (CH-13861 wording) and Close; the file under it draws as normal. No figures of that read load. |

### S-FILE.plan.discard

| Row | Drawn? | Capture | Rule |
|---|---|---|---|
| default | not drawn | add `plandirty` | The sheet springs back to open; the footer's two buttons are replaced by one line "Discard changes?" with primary "Keep editing" and secondary "Discard" (not red: nothing saved is lost). Keep editing restores the footer; Discard closes with nothing saved. Cancel and X discard at once with no question. |

### S-FILE.off

| Row | Drawn? | Capture | Rule |
|---|---|---|---|
| default | today's | n/a | Every entry goes where it goes today (08 S-LIST 3); no redirects; `at=` and `insight=` are ignored by today's page as they are now. |

### S-FILE.rail (added rows)

| Row | Drawn? | Capture | Rule |
|---|---|---|---|
| data | n/a | n/a | Rows come from `loadFileRoster` (the roster query). The second line is the class year until Team's CT0 loader, which lands first (BUILD_BRIEF), exposes each player's top read; the rail then reads it from that loader with CT0a's rule that only reads actually drawn count as shown, so the rail records no roster-card exposure for rows it doesn't draw. |
| 1024 to 1179 | not drawn | `w1100` | Rail 300 stays; the file is one column. |
