# 05-SCREENS: Classes, Roster, coach Home
> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 39 inventory rows, 33 state matrices, an entry table and a handoff table).
Design page: https://claude.ai/artifact/QnVN3x63a79TM8geunzccU (v6) · Local: `design-refresh/classes-roster-home/redesign/clubhouse-phone-redesign.html` with `redesign.css` · Package: `design-refresh/classes-roster-home/` · Status: Ready to build

Anchor grammar (04 §1): `#<screen>-<phone|desktop>-<light|dark>[-coach|-player][-profile][-reduce][-early|-loading|-empty|-failed|-long|-big][-xxl]`. The table gives the light phone anchor; swap `light` for `dark` and add tokens for states. Preview routes are `/clubhouse-preview/<route>`. Capture stems are the `SHOTS` names in `capture/capture.mjs` (saved as `<stem>-<light|dark>-<390|430>.png`, desktop once). "add" means the PR adds the fixture or the stem.

PR numbers follow BUILD_BRIEF: PR 7 year avatars and label (plus the shared tokens, card surface, large title of 02 §2), PR 8 Roster phone and desktop, PR 9 Classes, PR 10 coach Home.

## Inventory

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| S-CLASSES | screen | section strip "Classes" | `#classes-phone-light` | `classes` | player | 9 |
| S-CLASSES.add-menu | menu (anchored to the bar's +) | tap + ("Add or import a class") | not drawn as open; + drawn on `#classes-phone-light` | `classes`, tap + | player | 9 |
| S-CLASSES.add-sheet | sheet (today's) | add-menu > Add class | not drawn | today's add sheet | player | 9 (unchanged) |
| S-CLASSES.import-sheet | sheet (today's) | add-menu > Import schedule, or empty-state button | not drawn | today's import sheet | player | 9 (unchanged) |
| S-CLASSES.class-sheet | sheet, 90% detent | tap a Today row or a binder | `#classes-phone-light`, click `[data-act="class"]` | `classes`, tap a class | player | 9 |
| S-CLASSES.overlaps | inline card (scroll target) | tap the "1 overlap" chip on the term card | `#classes-phone-light` | `classes` | player | 9 |
| S-CLASSES.noteam | inline state | player with no team | as today | `classes?state=noteam` | player | 9 (unchanged) |
| S-CLASSES.desktop | screen (desktop) | same route above 820px | `#classes-desktop-light` | `classes` at 1280 | player | 9 |
| S-ROSTER | screen | section strip "Roster" (coach) | `#roster-phone-light-coach` | `roster` | coach | 8 |
| S-ROSTER.player | screen (role variant) | section strip "Roster" (player) | `#roster-phone-light-player` | `roster-player` | player | 8 |
| S-ROSTER.invite | sheet (today's) | bar action "Invite players", or empty-state button | not drawn | today's invite flow | coach | 8 (unchanged) |
| S-ROSTER.requests | sheet, 62% detent | tap the Join requests row; `?tab=requests` | `#roster-phone-light-coach`, click `[data-act="reqs"]` | `roster`, tap the requests row | coach | 8 |
| S-ROSTER.profile | push | tap a player row or a leader card | `#roster-phone-light-coach-profile` | `roster`, tap a row | coach | 8 |
| S-ROSTER.profile-actions | menu (today's) | profile bar more button "Player actions" | not drawn as open | `roster`, profile, tap more | coach | 8 (unchanged content) |
| S-ROSTER.injured | inline card | roster with an injured player | Injured card on `#roster-phone-light-coach` | `roster?state=availability` | coach | 8 |
| S-ROSTER.desktop | screen (desktop) | same route above 820px | `#roster-desktop-light-coach` | `roster` at 1280 | coach | 8 |
| S-ROSTER.peek | inline panel (desktop) | click a desktop table row | `#roster-desktop-light-coach` (first row selected) | `roster` at 1280, click a row | coach | 8 |
| S-HOME | screen | section strip "Home" (coach) | `#home-phone-light` | `home` | coach | 10 |
| S-HOME.round-sheet | sheet, 74% detent | tap a Latest rounds row | `#home-phone-light`, click `[data-act="round"]` | `home`, tap a round | coach | 10 |
| S-HOME.strip | popover (section strip under the bar) | tap "Home ⌄" or any green bar title | `#home-phone-light`, click `[data-act="strip"]` | any screen, tap the title | coach, player | 10 (applies on every screen) |
| S-HOME.desktop | screen (desktop) | same route above 820px | `#home-desktop-light` | `home` at 1280 | coach | 10 |

Not in this lane: player Home (Stats lane, PR 6; re-shot after PR 10's bar change), Notifications (bell, as today), event pages (Up next and capsules open today's pages).


## Not drawn: today's sheets, menus and targets (added 3 Nov)

Sources: the Classes thread's handover (`classes-roster-home-HANDOVER.md`, "Drawn vs not drawn") and the read-only app inventory (`classes-roster-home-SUBSURFACES.md`, helmv3 at 75b4956). The design never drew these. Each keeps what it does today (content, fields, copy, writes, toasts, error codes) and takes the redesign's look.

**The standard rule ("restyle")**, used by every sheet row below: keep today's sheet and restyle it with the redesign's sheet surface, type and motion. Surface: 06 section 1.3 "Sheet" (`--ch-sheet-bg`, top radius 20, grabber 36 x 5, header title 650 17k, 32 close button with a 44 hit area, body padding at the page edge, content in the 06 card and row components, no accent left borders). Height: content height capped at 92dvh (`ui/Modal.tsx` has no detents; 06 section 14 row 31). Type: Instrument Sans at the 06 sizes, scaling with Text Size, unclipped at XXL (SHARED-5). Motion: 07 M-CRH-45 (in on the smooth spring, out 280ms, drag to close, Reduce Motion an opacity fade over `CH_FADE_MS` 180ms). Confirms use the same sheet on the phone with today's two buttons (destructive one in `flag`, 07 M-CRH-37 `warning` haptic). Desktop keeps today's centred dialog with the same surface and type. Capture: none until a fixture or a click step exists (most of these cannot be opened by a preview route today; SUBSURFACES "Preview routes").

| ID | Kind (today) | Reached from | App component | Roles | PR | Build rule |
|---|---|---|---|---|---|---|
| S-CLASSES.class-form | sheet, form (Modal 520) | add-menu > Add class; AddTile; class sheet "Edit class"; a Fix notice; `classes?new=1` | `ClassForm.tsx:139` | player | 9 | Restyle. Fields, overlap warnings and validation as today. Today's + opens it directly; after PR 9 the + opens the add-menu and Add class opens this |
| S-CLASSES.class-form.discard | confirm | closing the form while it has changes | `ClassForm.tsx:322` | player | 9 | Restyle as a confirm: "Keep editing" / "Discard" |
| S-CLASSES.import-sheet | sheet, steps (Modal 620) | add-menu > Import schedule; the empty state's Import schedule | `ImportSchedule.tsx:228` | player | 9 | Restyle. Steps Pick (stock Segmented, file or paste), Reading (slow notice CH-12902), error kinds, Review ("Import {n} classes"), Done, as today; steps swap with today's `chSwap` (07 M-CRH-45) |
| S-CLASSES.import-sheet.start-over | confirm | Review step | `ImportSchedule.tsx:472` | player | 9 | Restyle as a confirm: "Keep reviewing" / "Start over" |
| S-CLASSES.remove-confirm | confirm (420) | class sheet "Remove class" | `ClassesView.tsx:511` | player | 9 | Restyle as a confirm: "Keep it" / "Remove class"; toast "{code} removed" as today |
| S-CLASSES.delete-all-confirm | confirm | the "Delete all classes" row | `ClassesView.tsx:537` | player | 9 | Restyle as a confirm: "Keep them" / "Delete all classes" |
| S-CLASSES.exam-sheet | sheet, form (Modal 440) | class sheet, "Add an exam" (class awareness on) | `ExamSheet.tsx:51` | player | 9 | Restyle. Date, Starts, Ends, Name as today |
| S-CLASSES.exam-remove | confirm (420) | trash icon on an exam in the class sheet | `ClassDetail.tsx:228` | player | 9 | Restyle as a confirm: "Cancel" / "Remove" |
| S-CLASSES.status-detail | inline in the class sheet | class sheet, when class awareness is on | `ClassDetail.tsx` (status detail) | player | 9 | Not drawn. Keep today's rows inside the class sheet as 06 rows, below the drawn facts and "This week" |
| S-CLASSES.status-panel extras | inline | status card, class awareness on with status writes | `ClassStatusPanel.tsx:162` | player | 9 | The drawn status card keeps the "Share class status with coaches" switch. Today's other rows ("Pushes during class · Change", "No class today ›", Tag / Re-sync / Fix notices, error CH-12270) sit in the same card as 06 rows below the switch. Cannot be captured until the preview passes `statusWrites` |
| S-CLASSES.no-class-today | sheet (Modal 420) | status card "No class today ›" | `NoClassTodaySheet.tsx:54` | player | 9 | Restyle. Radio list, "Cancel" / "Mark no class", toast with Undo as today |
| S-CLASSES.toggle-result | write result | the status switch | `ClassStatusPanel.tsx` | player | 9 | The switch moves at once (07 M-CRH-26); on a failed write it moves back on the same spring and today's toast shows. No inline spinner |
| S-CLASSES.sync | inline | after add or import | `parts.tsx:436` | player | 9 | Not drawn. "Adding to your calendar…" and "Retry sync" as a 06 row at the top of the binders, today's copy |
| S-CLASSES.route-error | route error | a crash while loading Classes | today: Fairway `RouteErrorBoundary` ("Failed to load classes") | player | 9 | Not drawn. Flagged: today it falls to the legacy Fairway page, not a Clubhouse state. Rule: show the drawn failed state (`#classes-phone-light-failed`) with Try again (fixed 4 Nov: settled in DECISIONS, "Classes route errors"; no coordinator yes needed) |
| S-ROSTER.invite | sheet (Modal) | bar user-plus; empty state "Invite players"; `roster?invite=1` | `Roster.tsx:917` | coach | 8 | Restyle (replaces "Today's invite flow, unchanged" above). Team code Copy, invite link Share / Copy, Done, as today |
| S-ROSTER.invite-email | sub-form inside Invite | Invite > email | `InviteByEmail.tsx:140` | coach | 8 | Restyle inside the same sheet. Chips field, "Send {n} invites"; off state CH-3980, as today |
| S-ROSTER.profile-actions | sheet (Modal) | profile bar more button ("Player actions", 44 hit area) | `RosterPhone.tsx:581` | coach | 8 | Restyle (replaces "Today's menu, unchanged content" above). View stats, Mark inactive / active, Remove from team, as today |
| S-ROSTER.status-confirm | confirm (460) | profile-actions > Mark inactive / active | `RosterStatus.tsx:50` | coach | 8 | Restyle as a confirm; toast "{name} marked {status}" as today |
| S-ROSTER.remove-confirm | confirm (460) | profile-actions > Remove from team | `Roster.tsx:405` | coach | 8 | Restyle as a confirm: "Keep {first}" / "Remove player" |
| S-ROSTER.requests results | write results | Approve, Decline, Approve all in the requests sheet | `RosterPhone.tsx:494` | coach | 8 | Not drawn. The row fades and the list closes up (07 M-CRH-36); the Join requests count on Roster updates; when the last request goes the sheet closes. Approve all exists on the phone sheet only, as today. Failure toasts as today |
| S-ROSTER.injured-tap | row target | an Injured row | `RosterPhone.tsx:407` | coach | 8 | Drawn with press feedback, no destination. Rule: opens the player's profile like an Active row (07 M-CRH-17) |
| S-ROSTER.inactive | inline card | players marked inactive | `RosterPhone.tsx` (Inactive section) | coach | 8 | Not drawn. An "Inactive" card after Injured, same rows as Active, no form bars; tap opens the profile |
| S-ROSTER.peek-hold | peek | 450ms hold on a coach Roster row | `ui/PlayerPeek.tsx:31` (fixed 4 Nov wiring: the component is at `:48`; 31 to 32 is `coachHelmPlayerHref`) | coach | 8 | Not drawn; kept. Message, View stats, Plan 1:1, CoachHelm, as today (07 M-CRH-41) |
| S-ROSTER.profile targets | links | profile Message, Plan 1:1, "All {n}" recent rounds, CoachHelm panel, Coach's note | `RosterProfile.tsx:63` | coach | 8 | Not drawn as destinations. Message opens Messages with the player as the recipient (the coach writes and sends; nothing is sent for them); Plan 1:1, "All {n}" and CoachHelm open today's pages; the Coach's note edits in place as today |
| S-ROSTER.profile availability | control | profile Availability (Available / Injured / Away) | `RosterProfile.tsx` | coach | 8 | Not drawn as a control. Keep it in the profile as the stock Segmented in a 06 card under About (07 M-CRH-43); writes and toast as today |
| S-ROSTER.desktop-menu | menu | desktop row kebab or right-click | `Roster.tsx:856`, `:388` | coach | 8 | Not drawn. Today's context menu, restyled with the redesign's menu surface (07 M-CRH-44) |
| S-HOME.in-class-sheet | sheet (Modal 420) | Home class line, "In class now" | `InClassSheet.tsx:93` | coach | 10 | Restyle. Rows open Messages; Edit / Set dates opens the term sheet; Mark a day opens Breaks |
| S-HOME.term-sheet | sheet, form (Modal 460) | class line, or In class now > Edit / Set dates | `TermSheet.tsx:89` | coach | 10 | Restyle. "Save dates" as today |
| S-HOME.breaks-sheet | sheet, form (Modal 460) and its remove confirm (420) | In class now > Mark a day | `TeamBreakSheet.tsx:76`, `:135` | coach | 10 | Restyle, with the confirm restyled as a confirm. "Mark no classes" as today |
| S-HOME.class-line | inline button | coach Home | `ClassHomeLine.tsx:98` | coach | 10 | Not drawn. Keep it on Home as one 06 row under the hero's Waiting on you capsules, today's copy (fixed 4 Nov: settled in DECISIONS as the default Nick can flip) |
| S-HOME.live | card and sheet (PlayerLiveSheet, Modal 520) | live rounds (`home?live=`) | `LiveNowCard.tsx:85` | coach | 10 | Not drawn. The card as a 06 card after Up next; its sheet restyled |
| S-HOME.waiting targets | links | Waiting on you capsules | `CoachQueue.tsx:57` | coach | 10 | Not drawn as destinations. Join requests → `roster?tab=requests` (opens S-ROSTER.requests-sheet at rest); replies → the event in Calendar; tasks → Team Hub tasks; posts → Team Hub announcements; error CH-2220, as today |
| S-HOME.up-next target | link | Up next card | `DayCard.tsx:67` | coach | 10 | Not drawn. Opens the event, as today (07 M-CRH-12) |
| S-HOME.links | links | "Calendar", "Team stats", leg cell player names, week tiles | `HomePhone.tsx:411`, `TeamLegs.tsx:204` | coach | 10 | Not drawn. Team stats → Stats; a player name → that player's Stats game tab; a week tile → Calendar day view, as today |
| S-HOME.peek-hold | peek | 450ms hold on a Latest rounds row | `ui/PlayerPeek.tsx:31` (fixed 4 Nov wiring: the component is at `:48`; 31 to 32 is `coachHelmPlayerHref`) | coach | 10 | Not drawn; kept (07 M-CRH-41) |
| S-HOME.bell | drop sheet under the bar | bell | `shell/Bell.tsx:568` | coach, player | n/a | Not in this lane: unchanged (07 M-CRH-34) |
| S-ALL.pull-refresh | gesture | top of any phone page, iPhone app | `shell/PullToRefresh.tsx` | coach, player | n/a | Unchanged (07 M-CRH-42) |
| S-ALL.one-item | state | one class, one player, one round | n/a | all | 8, 9, 10 | Not drawn where the matrices above say so. Each card shows its one row; no "see all"; mix and credit bars draw one full segment; leaders and the top five follow their own minimums (3 rounds, 5 players) |
| S-ALL.offline | state | no network or a stale read | shell `OfflineBanner` (CH-1901), `RefreshNotice` | all | 8, 9, 10 | Not drawn. Today's banner and refresh notice, unchanged; cards keep the last data; no new banner; writes show "{failed}: you're offline" with Try again (CH-1903) as today |

## State matrices

Columns: drawn? gives the anchor, or "not drawn" with the rule to build. Capture is the `capture.mjs` stem. "Rule" is the one-line rule the build must follow. Phone 390 has a 16pt edge, 430 a 20pt edge (SHARED-7). Dark is `golf_theme` = dark. XXL is `--ch-type-k` 1.36. Reduce Motion uses Playwright `reducedMotion: 'reduce'` and also covers `[data-motion='off']`.

### S-CLASSES

| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | `#classes-phone-light` | `classes` | Large title "Classes", context "Fall 2026 · Aug 20 – Dec 15"; term, Today, Overlaps, binders, status, delete row |
| loading | `#classes-phone-light-loading` | `classes-loading` | Term card loads as a green block with 16% ivory bars; other cards hold `--ch-separator` bars, radius 6, 1.6s pulse to 55% |
| empty | `#classes-phone-light-empty` | `classes-empty` | "No classes yet" with Import schedule and Add a class |
| error/failed | `#classes-phone-light-failed` | `classes-failed` | "Classes didn't load", body ends "Nothing you added is lost.", Try again |
| long text | `#classes-phone-light-long` | `classes-long` (add `classes?state=long`) | Binder names wrap to 2 lines then ellipsis; time column never wraps |
| lots of items | not drawn | none | Binders keep stacking; credits bar keeps one segment per class, flex by credits; nothing truncated |
| one item | not drawn | none | One class: credits bar is one full-width segment; "1 class / N credits"; Today shows that class or "No classes today" |
| offline/stale | not drawn | none | Keep today's behaviour; no new banner |
| XXL | `#classes-phone-light-xxl` | `classes-xxl` | Time column 58 x k stays one line; nothing clipped (SHARED-5) |
| dark | `#classes-phone-dark` | `classes` dark | Keep the app's dark board tones, not the mock's (04 §8) |
| Reduce Motion | `#classes-phone-light-reduce` | all stills | Overlap chip jumps instead of smooth scroll; sheet crossfades over `CH_FADE_MS` 180ms; no pulse |
| phone 390 | `#classes-phone-light` | `classes-light-390` | Edge 16 |
| phone 430 | control bar size 430 | `classes-light-430` | Edge 20 |
| desktop 1280 | `#classes-desktop-light` | `classes-desktop` | Keeps Section and today's side layout |

### S-CLASSES.add-menu

| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | not drawn open | none (add stem `classes-addmenu`) | Two rows: Add class, Import schedule; each opens today's sheet |
| dark, XXL | not drawn | none | Today's menu tokens; rows stay 44 tall minimum and unclipped at 1.36 |
| Reduce Motion | not drawn | none | Opens in place |
| other rows | n/a | n/a | No loading, empty, failed or list states |

### S-CLASSES.add-sheet, S-CLASSES.import-sheet

Today's sheets, restyled with the redesign's sheet surface, type and motion (see "Not drawn" above: S-CLASSES.class-form and S-CLASSES.import-sheet). They open from the new add-menu and from the empty state's buttons. No new capture.

### S-CLASSES.class-sheet

| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | `#classes-phone-light` + click `class` | `classes-sheet` | 90% height, top radius 20, grabber 36x5, ✕; facts Meets, Time, Room, Credits; "This week" card; Remove and Edit class |
| loading, empty, failed | not drawn | none | Opens from loaded data only; no states of its own |
| long text | `-long` + click `class` | none (add `classes-sheet-long`) | Class name wraps; facts never clip |
| one item | drawn (one class) | `classes-sheet` | n/a |
| travel | drawn (Travel chip in This week) | `classes-sheet` | Travel chip shows only when a team event clashes that week |
| XXL | `-xxl` + click | none (add `classes-sheet-xxl`) | Sheet scrolls inside; buttons stay visible at the bottom |
| dark | `-dark` + click | `classes-sheet` dark | Sheet on `--ch-card-bg` dark |
| Reduce Motion | `-reduce` + click | `classes-sheet` | Crossfade in and out over `CH_FADE_MS` 180ms |
| 390 / 430 | both | `classes-sheet-light-390/430` | Edges 16 / 20 |
| desktop | not drawn | none | Today's desktop detail, unchanged |

### S-CLASSES.overlaps

| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | on `#classes-phone-light` | `classes` | Amber chip "1 this week", bus icon, footer "Your coach sees this overlap too." |
| empty | not drawn | none | No conflicts this week: card absent and the term card shows no overlap chip |
| lots | not drawn | none | One row per conflict; chip reads "N this week" |
| Reduce Motion | `-reduce` | none | Chip tap jumps, no smooth scroll |

### S-CLASSES.noteam

As today (`classes?state=noteam`). Rule: the redesign does not change its copy or layout beyond the card surface.

### S-CLASSES.desktop

| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | `#classes-desktop-light` | `classes-desktop` | Section and side layout kept; `.ch-cl-h h1` remains |
| dark | `#classes-desktop-dark` | `classes-desktop` dark | App's dark tones |
| loading, empty, failed | `-desktop-…-loading/empty/failed` | none (add) | Same copy as phone |
| XXL, Reduce Motion | anchor tokens | none | As phone |

### S-ROSTER (coach)

| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | `#roster-phone-light-coach` | `roster-coach` | Team card, leaders, Join requests row, sort bar, Active card, Injured card |
| loading | `-coach-loading` | `roster-loading` | Skeleton bars in the team card (green block) and in the list card |
| empty | `-coach-empty` | `roster-empty` | "No players yet" with Invite players and Copy team code |
| error/failed | `-coach-failed` | `roster-failed` | "The roster didn't load", Try again, says nothing was lost |
| early (staging today) | `-coach-early` | `roster-early` (add `roster?state=early`) | Two neutral stubs instead of bars, SG "—", no leaders, no top five, rows "Early read · 2 rounds" |
| long text | `-coach-long` | `roster-long` (add `roster?state=long`) | Row names one line with ellipsis |
| lots of items | `-coach-big` | `roster-big` (add `roster?state=big`) | 25 players: list grows; counts and mix bar computed; nothing truncated |
| one item | not drawn | none | One player: mix bar one segment; no top five (needs 5); leaders only if that player has 3+ rounds |
| injured | Injured card | none (`roster?state=availability`) | Dim coins, "Injured" chip with no date; counted in active |
| offline/stale | not drawn | none | Today's behaviour; no new banner |
| XXL | `-coach-xxl` | `roster-xxl` | Figures and form bars stay on the row; names ellipsis; nothing clipped |
| dark | `#roster-phone-dark-coach` | `roster-coach` dark | Year colours use the dark set |
| Reduce Motion | `-coach-reduce` | all stills | Sort reorder and chip instant |
| 390 / 430 | both | `roster-coach-light-390/430` | Edges 16 / 20; leaders row bleeds to the screen edge |
| desktop 1280 | see S-ROSTER.desktop | | |

### S-ROSTER.player

| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | `#roster-phone-light-player` | `roster-player` | Team card without injured, waiting or top five; sort Name / Class / HCP; Coaches card; Players card |
| loading | `-player-loading` | none (add) | As coach skeleton, without leaders |
| empty | `-player-empty` | `roster-player-empty` | "No teammates yet" |
| failed | `-player-failed` | none (add) | Same copy as coach failed |
| long, big, XXL | `-player-long/-big/-xxl` | none (add) | As coach rules |
| one item | not drawn | none | Only the viewer: one row with the "You" chip |
| offline/stale | not drawn | none | Today's behaviour |
| dark, Reduce Motion, 390, 430 | anchor tokens | `roster-player` per theme and width | As coach |
| desktop 1280 | not drawn | none | Today's player desktop with the new year coins and label only |

### S-ROSTER.requests

| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | `#roster-phone-light-coach` + click `reqs` | `roster-requests` | 62% sheet; Decline and Approve per person; footer note; team code card; Approve all |
| empty | not drawn | none | No requests: the row on Roster is absent, so the sheet can't open; `?tab=requests` with none opens the sheet with no person rows and the team code card (see S-ROSTER.requests.none). When the last request is handled inside the open sheet, the sheet closes (07 M-CRH-36) |
| one item | not drawn | none | One person: Approve all hidden, the row's own Approve is enough (fixed 4 Nov: settled in DECISIONS; see S-ROSTER.requests.one) |
| lots | not drawn | none | Sheet scrolls inside at 62% |
| long text | `-long` + click | none | Names ellipsis; year line under the name |
| XXL | `-xxl` + click | none | Buttons stay 44 tall and side by side or stack, never clip |
| dark, Reduce Motion, 390, 430 | anchor tokens | `roster-requests` per theme and width | Crossfade over `CH_FADE_MS` 180ms under Reduce Motion |
| desktop | not drawn | none | Today's desktop requests UI |

### S-ROSTER.profile

| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | `#roster-phone-light-coach-profile` | `roster-profile` | Coin 76, name, hometown, year chip, Message and Plan 1:1, This season, Scoring trend, Recent rounds, About |
| loading | not drawn | none | Today's profile loading inside the new cards |
| early | `-coach-profile-early` | none (add) | SG "—"; trend card shows the rounds there are |
| no rounds | not drawn | none | Season figures "—"; Recent rounds card reads today's empty copy |
| long text | `-coach-profile-long` | none (add) | Name wraps to 2 lines, centred |
| lots | not drawn | none | Recent rounds shows today's count with "All N" |
| XXL | `-coach-profile-xxl` | none (add) | Coin stays 76; buttons stack if needed; nothing clipped |
| dark, Reduce Motion | anchor tokens | `roster-profile` dark | Push becomes a crossfade over `CH_FADE_MS` 180ms |
| 390 / 430 | both | `roster-profile-light-390/430` | Edges 16 / 20 |
| desktop | see S-ROSTER.peek | | |

### S-ROSTER.profile-actions

Today's content, restyled as a sheet (see "Not drawn" above: S-ROSTER.profile-actions); opened from the new more button (44 hit area). No capture.

### S-ROSTER.injured

Covered in the S-ROSTER matrix ("injured" row). Dark: amber chip on `--ch-warn-bg` dark. XXL: chip stays one line.

### S-ROSTER.invite

Today's invite flow, restyled (see "Not drawn" above: S-ROSTER.invite, S-ROSTER.invite-email). Opened from the bar's user-plus action and the empty state's Invite players.

### S-ROSTER.desktop

| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | `#roster-desktop-light-coach` | `roster-desktop` | Team card and leaders across the top; requests row; table card with sticky header; peek on the right; no `.ch-rs-attn` strip |
| loading, empty, failed | `#roster-desktop-light-coach-loading/empty/failed` | none (add) | Same copy as phone |
| early | `-desktop-light-coach-early` | none (add) | "Last 5" cells show stubs; SG "—"; no leaders |
| long, big | `-long`, `-big` | none (add) | Names ellipsis in the Player column; 25 rows, sticky header stays |
| XXL, dark, Reduce Motion | tokens | `roster-desktop` dark | As phone |

### S-ROSTER.peek

| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | on `#roster-desktop-light-coach` | `roster-desktop` | Coin, year chip, Message, Schedule 1:1, four figures, chart, Open full profile |
| none selected | not drawn | none | Today's behaviour (first row selected or empty peek) |
| early | `-early` | none | Figures "—" where SG is missing; chart shows the rounds there are |

### S-HOME

| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | `#home-phone-light` | `home` | Hero (one green with the bar), Today, Team scoring, The team's game, This week, Latest rounds |
| loading | `#home-phone-light-loading` | `home-loading` | Hero skeleton in green with 16% ivory bars; cards with `--ch-separator` bars |
| empty | `#home-phone-light-empty` | `home-empty` | "Welcome to Clubhouse, Nick.", "Get your team set up" checklist, "Nothing on the calendar today" |
| error/failed | `#home-phone-light-failed` | `home-failed` | "Some of today didn't load. What did is below.", "Today didn't load", "Scoring didn't load / Your rounds are safe." |
| events only | not drawn | none (`home?state=eventsonly`) | Today and This week only; scoring cards hidden |
| no rounds | not drawn | none (`home?state=norounds`) | Scoring cards hidden |
| long text | not drawn | none | Event and course names ellipsis on one line; Up next title wraps to 2 |
| lots of items | not drawn | none | Today lists every event; Latest rounds shows the loader's 3 rows |
| one item | not drawn | none | One event: no "Clash" chip; one round row |
| offline/stale | not drawn | none | Today's behaviour |
| XXL | `#home-phone-light-xxl` | `home-xxl` | Capsules wrap to a second line; greeting wraps; nothing clipped |
| dark | `#home-phone-dark` | `home` dark | Hero and bar both `--ch-frame` dark, no seam |
| Reduce Motion | `-reduce` | all stills | SG bars drawn in place; strip appears in place |
| 390 / 430 | both | `home-light-390/430` | Hero bleeds full width; inner edge 20 (04 hero padding) |
| desktop 1280 | see S-HOME.desktop | | |

### S-HOME.round-sheet

| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | `#home-phone-light` + click `round` | `home-round` | 74% sheet; Score / GIR / Putts / SG strip; nine-hole card; Message; Round recap |
| totals only | not drawn | none | Round with no hole data: nine-hole card absent, SG "—" |
| long text | not drawn | none | Course name wraps to 2 lines |
| XXL | `-xxl` + click | none (add) | Strip wraps to 2 rows if needed; sheet scrolls inside |
| dark, Reduce Motion, 430 | tokens | `home-round` per theme and width | Crossfade over `CH_FADE_MS` 180ms under Reduce Motion |

### S-HOME.strip

| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | `#home-phone-light` + click `strip` | `home-strip` | Strip under the bar; chevron turned 180° |
| player | not drawn | none | Player's sections; same component |
| XXL | not drawn | none (add `home-strip-xxl`) | Items wrap or scroll; none clipped |
| dark, 430 | tokens | `home-strip` per theme and width | |
| Reduce Motion | `-reduce` + click | `home-strip` | Appears in place, no slide |

### S-HOME.desktop

| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | `#home-desktop-light` | `home-desktop` | Hero with Up next, This week agenda, Team scoring, legs, Latest rounds (4 rows), Leaderboard top 5 |
| loading, empty, failed | `#home-desktop-light-loading/empty/failed` | none (add) | Same copy as phone |
| dark, XXL, Reduce Motion | tokens | `home-desktop` dark | As phone |

## Completeness pass, 4 Nov 2026

What this section adds: the lane flag and what shows with it off, every way to land on each screen (URL, cold start, bell and push notifications, a link to something deleted or not allowed), every cross-lane handoff with its Back, and the states the matrices above did not name (no term, term edges, day rollover, requests handled elsewhere, a player removed mid-session, unsaved note, write failures with rollback, double submit, desktop search with no results, print, 821 to 1279 wide, keyboard and VoiceOver). Each new row has a CP criterion in 08 (CP-1 to CP-74), a motion row in 07 (M-CRH-46 to M-CRH-58) where something moves, and a spec in 06 where something new is drawn. Fixes made in place above are marked "(fixed 4 Nov: ...)".

### CP.1 Lane flag and held migrations

| Item | Rule |
|---|---|
| Lane flag | **`clubhouse_classes_roster_home_v1`** (new, added in PR 7 in `config/feature-flags.yml` by copying the `coachhelm_track_record_v1` entry shape: type release, owner golf/clubhouse, `default: false`, production, preview and development all false; then `npm run flags:generate`). Purpose line: "Classes, Roster and coach Home redesign: year coins, team card, leaders, form bars, term card, binders, coach Home hero and cards." |
| How it gates | Read once on the server in `routes/classes.tsx`, `routes/roster.tsx` and the Home route, and once in the shell, then passed down as a `crh` prop and set as `data-ch-crh="on"` on the Clubhouse frame root. Every CSS rule this lane adds or replaces is scoped under `[data-ch-crh='on']`; every JSX change branches on `crh`. PR 1's tokens are additive and unused, so they need no gate. |
| Flag off | Every screen ID in this file renders exactly as main 75b4956 (SHARED-8): today's PhoneTop actions (Classes + opens ClassForm directly and Import is its own header button), neutral coins, today's `classYearLabel` text (the "Class of X · Class of X" repeat stays on flag-off screens until the flag is on), today's sheet look, today's hero-mode bar fill, today's `.ch-rs-attn` strip on desktop. A test renders each route with the flag off and diffs the DOM and a screenshot against main. |
| Flag on | Everything in 05 to 08 of this lane. |
| Held migrations | None. Every figure comes from what today's loaders already load (03). No PR from 7 to 10 carries a migration file. |
| Other flags this lane reads (unchanged) | `class_awareness_v1` (status card extras, status detail, exams, No class today, In class now, the Home class line): off, those parts are absent as today and the cards around them close up with no gap. `golf_tournaments_v1` (tournament live in S-HOME.live): off, absent as today. `coachhelm_player_file_v1` (Lenses) and the Messages, Stats and Team Board lanes' gates decide where this lane's links land; see CP.4. |
| Preview | `/clubhouse-preview/<screen>` reads `&crh=0|1`, default 1 in the preview only, so capture shoots the redesign and `crh=0` shoots main for the flag-off proof. Production and preview deploys read only the real flag. |

### CP.2 New inventory rows

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| S-ALL.flag-off | state | lane flag off | none (main) | any route with `&crh=0` | all | 7 to 10 |
| S-ALL.deeplink | entry | a URL with params, a cold start, a bell row, a push notification | not drawn | see CP.3 | all | 8, 9, 10 |
| S-ALL.keyboard | interaction | Tab, Shift+Tab, arrows, Enter, Space, Escape on desktop and on an iPad with a keyboard | not drawn | any route at 1280, and at 390 with a keyboard | all | 7 to 10 |
| S-ALL.voiceover | interaction | VoiceOver or a screen reader | not drawn | any route | all | 7 to 10 |
| S-ALL.toast | toast (today's `useToast`, unchanged) | any write result | not drawn | any route with `failwrites` | all | none (unchanged) |
| S-ALL.busy | inline state | a write button tapped and waiting | not drawn | `&failwrites` slow fakes | all | 8, 9, 10 |
| S-ALL.day-rollover | state | the app is open across midnight in the team's zone, or across 1 August | not drawn | fixture clock | all | 8, 9, 10 |
| S-ALL.mid-width | layout | window 821 to 1279 wide, and iPad portrait 768 to 820 | not drawn | any route at 1024 and 768 | all | 8, 9, 10 |
| S-CLASSES.coach | route | a coach opens `/golf/dashboard/classes` | none | `classes` as a coach | coach | none (today's legacy page, unchanged) |
| S-CLASSES.no-term | inline state | the team has no term set | not drawn | add `classes?state=noterm` | player | 9 |
| S-CLASSES.term-edges | inline state | today is before the term starts or after it ends | not drawn | add `classes?state=preterm`, `classes?state=postterm` | player | 9 |
| S-CLASSES.partial | inline state | some reads failed (preview `partial`, `mixed`) | not drawn | `classes?state=partial`, `mixed` | player | 9 |
| S-CLASSES.team-items | inline (not links) | the practice row in Today, the Overlaps lead row, the Soon list, the class sheet's Travel chip | drawn as not tappable | `classes` | player | 9 |
| S-CLASSES.sheet-stack | sheet over sheet | class sheet > Edit class, Remove class, Add an exam | not drawn | `classes`, tap a class, then a button | player | 9 |
| S-CLASSES.gone | state | a class removed on another device while its sheet is open | not drawn | fixture | player | 9 |
| S-ROSTER.requests.none | inline state | `roster?tab=requests` with no pending requests | not drawn | add `roster?tab=requests&state=norequests` | coach | 8 |
| S-ROSTER.requests.one | inline state | exactly one pending request | not drawn | add `roster?state=onerequest` | coach | 8 |
| S-ROSTER.requests.elsewhere | write result | another coach already handled the request | not drawn | fixture | coach | 8 |
| S-ROSTER.requests.failed | write result | Approve, Decline or Approve all fails | not drawn | `roster?tab=requests&failwrites` | coach | 8 |
| S-ROSTER.profile.deeplink | entry | `roster?player=<id>`, Lenses "Open {first}'s profile", a bell row | not drawn | `roster&player=<id>` | coach | 8 |
| S-ROSTER.profile.missing | state | `?player=` is not a uuid, is not on this team, or was removed | not drawn | add `roster&player=missing` | coach | 8 |
| S-ROSTER.profile.removed | state | the open player is removed or set inactive by another coach | not drawn | fixture | coach | 8 |
| S-ROSTER.profile.note-dirty | confirm | Back, edge swipe or a link while the Coach's note has unsaved text | not drawn | `roster`, profile, type in the note | coach | 8 |
| S-ROSTER.profile.availability-failed | write result | the Availability write fails | not drawn | `roster?state=availability&failwrites` | coach | 8 |
| S-ROSTER.profile.order | layout | the profile cards the design did not draw (Availability, Coach's note, CoachHelm panel) | not drawn | `roster`, profile | coach | 8 |
| S-ROSTER.role-guard | state | a player opens `?tab=requests`, `?invite=1` or `?player=` | not drawn | `roster-player&tab=requests` | player | 8 |
| S-ROSTER.alias | route | `/golf/dashboard/roster/<id>` | none | as today | both | none (unchanged: coach to `/stats?player=<id>`, player to `/roster`) |
| S-ROSTER.desktop-search | inline state | desktop search with no matches | not drawn | `roster` at 1280, type a name that is not there | coach | 8 |
| S-ROSTER.desktop-tools | controls | desktop Export, Status segmented, Team or List toggle, search | not drawn | `roster` at 1280 | coach | 8 |
| S-ROSTER.print | print | browser print of the desktop roster | not drawn | `roster` at 1280, print | coach | 8 |
| S-HOME.since | inline card | "Since you last looked" (today's `DayCard.tsx:376`) | not drawn | `home` | coach | 10 |
| S-HOME.later | inline card | "Later today" and "Coming up" (`DayCard.tsx:184`) | not drawn | `home` | coach | 10 |
| S-HOME.no-events | inline state | no events at all (today's `NoEvents`, CH-2309) | not drawn | `home?state=noevents` | coach | 10 |
| S-HOME.today-empty | inline state | nothing today but events later (CH-2301, "Plan") | not drawn | `home?state=eventsonly` with today cleared | coach | 10 |
| S-HOME.day-actions | links | Up next "Nudge", "Message", "Directions", and the recap row | not drawn | `home` | coach | 10 |
| S-HOME.queue-failed | inline state | the queue read fails (CH-2220) | not drawn | `home?state=queuefailed` | coach | 10 |
| S-HOME.part-failed | inline state | `cachefailed`, `tourfailed`, `noholes`, `unranked`, `error` | not drawn | `home?state=<each>` | coach | 10 |
| S-HOME.round-links | links | round sheet Message, Round recap or Player stats, CoachHelm | Message and Round recap drawn; CoachHelm not drawn | `home`, tap a round | coach | 10 |
| S-HOME.player-boundary | boundary | player Home: its bar, its hero, and the shared `Today`, `UpNext`, `WeekStrip` | stats-home page draws player Home | `home-player` | player | 10 (bar only); stats-home 6 (Your game) |

### CP.3 Every entry: URLs, cold start, bell and push

Rule for every row: a URL that opens a sheet or the profile shows it **at rest** (no rise, no push; 07 M-CRH-46). On arrival the route calls `history.replaceState` to the bare screen URL and then `history.pushState` the param back, so browser Back, the Android back gesture and edge swipe close the sheet or pop the profile first and land on the screen; a second Back leaves the screen. Closing a sheet or popping the profile by hand removes the param with `replaceState`, so a reload shows the plain screen. This mirrors the Stats lane's arrival rule (stats-home 02 "Arriving with a deep link").

| URL | Role | Lands on | Back | Missing, deleted or not allowed |
|---|---|---|---|---|
| `/golf/dashboard/roster` | coach | S-ROSTER at the top | leaves Roster | n/a |
| `…/roster?tab=requests` | coach, phone | S-ROSTER.requests at rest over Roster | closes the sheet to Roster | no pending requests: S-ROSTER.requests.none |
| `…/roster?tab=requests` | coach, desktop | S-ROSTER.desktop with the requests row scrolled into view and focused (today's behaviour) | leaves Roster | none pending: the row is absent; Roster at the top |
| `…/roster?invite=1` | coach | S-ROSTER.invite at rest | closes the sheet to Roster | n/a |
| `…/roster?player=<id>` | coach, phone | S-ROSTER.profile.deeplink: profile at rest, Roster rendered under it | pops to Roster (scroll 0), second Back leaves | S-ROSTER.profile.missing |
| `…/roster?player=<id>` | coach, desktop | S-ROSTER.desktop with that row selected in the peek and scrolled into view | leaves Roster | Roster with today's default peek selection and the same toast as phone |
| any of the three params | player | S-ROSTER.player at the top; the params are ignored | leaves Roster | S-ROSTER.role-guard: coach-only sheets and the profile never mount, so they are absent from the DOM and no coach-only data is fetched |
| `/golf/dashboard/roster/<id>` | both | unchanged alias: coach to `/stats?player=<id>` (stats-home S-STATS.coach), player to `/roster` | as that page | as that page (stats-home: `NotOnTeam` CH-5306) |
| `/golf/dashboard/classes` | player | S-CLASSES at the top | leaves Classes | no team: S-CLASSES.noteam |
| `…/classes?new=1` | player | S-CLASSES.class-form at rest (the add-menu does not show) | closes the form to Classes (no discard confirm: a fresh form is not dirty) | n/a |
| `/golf/dashboard/classes` | coach | S-CLASSES.coach: today's legacy page | as today | n/a |
| legacy `…/hub?tab=classes` | both | Home (today's HUB-R4 mapping, unchanged) | as today | n/a |
| `/golf/dashboard` | coach | S-HOME at the top | leaves Home | n/a |

Cold start (the app launched by a link or a push): the route shows its skeleton at once (07 M-CRH-38, hard loads show it with no wait), then the target at rest. Nothing animates in on a cold start: no sheet rise, no push, no SG bar grow (the grow runs only on a visit that started inside the app; 07 M-CRH-29 and M-CRH-46).

Bell and push rows: this lane adds no notification and changes no writer. The bell opens an item only when `isSafeInternalPath(item.action_url)` holds, then `armRelink` and `router.push`, as today; a push opens its stored path the same way. Whatever the type, the landing follows the URL table above. For the three kinds named for this lane:

| Kind | Who | Lands | When the item is stale |
|---|---|---|---|
| Join request | coach | the writer's path: `?tab=requests` opens the sheet at rest; plain `/roster` lands on Roster with the Join requests row in view at the top | already handled by another coach, or withdrawn: S-ROSTER.requests.none on phone; on desktop Roster with no requests row |
| Join approved | player (inserted by `acceptJoinRequest`) | its stored path, as today; if it is `/roster`, S-ROSTER.player with the player's own row carrying the "You" chip (fixed 4 Nov wiring: the stored path is `/golf/dashboard`, `src/app/golf/actions/teams.ts:1408`, so it lands on player Home; a decline stores `/golf/dashboard/settings`, 1541. Bell rows only, no push) | the player has left the team: today's no-team state |
| Injury or availability change | coach | no such notification exists in today's app (03, SUBSURFACES); none is added. If a future item carries `?player=<id>` it lands as S-ROSTER.profile.deeplink. The Injured card, the "N injured" count and the row note change on the next load with no motion | player removed: S-ROSTER.profile.missing |
| Class schedule (class-status pushes, calendar sync) | player | `/classes`: S-CLASSES at the top. A sync problem shows the S-CLASSES.sync row with "Retry sync" | class deleted: Classes as it is now; no error |
| Class schedule | coach | coach class awareness lives on Home's class line, which has no URL of its own: lands on S-HOME at the top with the class line in view under Waiting on you. A coach item that points at `/classes` gets the legacy page, as today | n/a |

### CP.4 Cross-lane handoffs

| From | To (lane) | Trigger | Context carried | Back | Other lane's flag off |
|---|---|---|---|---|---|
| S-ROSTER.profile-actions "View stats", S-ROSTER.peek-hold "View stats" | S-STATS.coach (stats-home) | tap | `?player=<id>` | browser Back or edge swipe returns to Roster with the profile open at rest and its scroll restored (M-CRH-53). The Stats bar's own back key stays today's "‹ Team" (stats-home 02; the bar must not change), so it goes to Team Stats, not Roster | today's player Stats page at the same URL |
| S-ROSTER.profile Recent rounds "All {n}" | stats-home Rounds detail | tap | `?player=<id>&window=season&tab=rounds` (today's `roundsHref`) | Back: stats-home shows the summary first (its arrival rule), then Roster with the profile at rest | today's Stats page scrolled to Rounds |
| S-HOME "The team's game" names | stats-home Strokes gained detail | tap | `?player=<id>&tab=game` | Back: Stats summary, then Home at its scroll position | today's Your game tab |
| S-HOME "Team stats" (Team scoring, legs, desktop Latest rounds) | S-TEAMSTATS (stats-home) | tap | none | Back: Home at its scroll position | today's Team Stats |
| S-ROSTER.profile "Message", peek "Message", S-HOME.round-links "Message" | Messages compose (messages) | tap | the player as the recipient, through today's mechanism (Messages has no per-conversation URL, its 05 "Settled" table) | Back: the opener as it was (profile open at rest; Home with the round sheet closed, since a sheet does not survive a route change) | today's Messages |
| S-HOME.day-actions "Nudge", "Message" | Messages compose (messages) | tap | `/messages?prefill=` as today: a draft only, nothing is sent for the coach | Back: Home at its scroll position | today's Messages |
| S-ROSTER.profile CoachHelm panel, peek "CoachHelm", round sheet CoachHelm | Lenses S-FILE (coachhelm-lenses) | tap | the player id (and `insight` where today's link has one) through today's hrefs; this lane edits no CoachHelm href, and Lenses' redirect of `?view=deep-dive` moves them | Back: the profile at rest, or Home | today's Deep dive (`coachhelm_player_file_v1` off) |
| Lenses S-FILE.more "Open {first}'s profile" | S-ROSTER.profile.deeplink (this lane) | tap | `/golf/dashboard/roster?player=<id>` | "‹ Roster" and edge swipe go to the Roster list; browser Back from there returns to the file | this lane's flag off: today's profile at the same URL |
| S-ROSTER.profile "Plan 1:1", S-ROSTER.peek "Schedule 1:1" | today's page (Calendar, no lane) | tap | as today | Back: the profile at rest | n/a |
| S-HOME.waiting targets: join requests | S-ROSTER.requests (this lane) | tap a capsule | `roster?tab=requests` | Back: Home at the top | n/a |
| S-HOME.waiting targets: replies, tasks, posts | Calendar event; Team Hub tasks; Team Hub announcements (no lane) | tap a capsule | as today | Back: Home | n/a |
| S-HOME.waiting targets: Ask, Practice plans, Messages, Team Board | none | none | The queue (`data/home-queue.ts`) holds only join requests, missing replies, overdue tasks and unacknowledged posts, and this lane adds no capsule. Things those lanes make land in the existing capsules (an Ask-made task counts in tasks, an Ask announcement in posts) and in Today and Up next (an event or a practice) | n/a | n/a |
| S-HOME Up next, Today rows, Later, week tiles | Calendar event or day (no lane); a practice's plan shows on the event page when `golf_practice_plans` is on (practice-plan lane) | tap | event id, date | Back: Home at its scroll position | the event page as today |
| S-HOME.strip "CoachHelm" | Team Board landing (coachhelm-team, `TEAM_BOARD_FIRST_VIEW`) | tap a capsule | none | section change, not a push (M-CRH-11) | today's CoachHelm |
| S-CLASSES.team-items | none | none | The practice row, the Overlaps lead row, the Soon list and the class sheet's Travel chip are information, not links (drawn without a chevron or press). The player reaches the event through the strip's Calendar | n/a | n/a |
| S-CLASSES saves and removes | Calendar (no lane) | add, edit, import, remove | today's `syncClassToCalendar` writes class events | n/a | n/a |
| S-HOME.player-boundary | stats-home S-HOMEGAME | n/a | Coach Home is this lane. Player Home (`PlayerHomePhone.tsx`, `.ch-hm-hero.is-player`) is not redesigned by this lane: its hero, greeting, Up next, Today and week stay as today except where stats-home PR 6 says. Stats-home owns only "Your game". The shared exports `Today`, `UpNext`, `WeekStrip` change only through the coach's `variant='card'`; the player's call sites do not pass it. The shell's hero-mode bar fill (shell.css near 1306) becomes `--ch-frame` under this lane's flag on coach Home; on player Home it follows only when player Home's hero also paints `--ch-frame` (stats-home PR 6, under its own gate), so no seam ever shows between a `--ch-frame` bar and a `--ch-green-800` hero | n/a | stats-home not built or off: player Home's bar stays as main, so it still matches its hero |

### CP.5 State matrices for the new rows

#### S-ALL.flag-off
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| every screen ID | main | every stem with `&crh=0` | DOM and pixels match main 75b4956 (SHARED-8) |

#### S-ALL.keyboard
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| focus ring | not drawn | add `<stem>-focus` | 06 CP-6.1 ring on `:focus-visible` only, never on tap |
| tab order | not drawn | none | Bar (switcher, then the right key), large title is not focusable, then cards top to bottom, each card's header action, then its rows in order. Sticky sort comes before the list it sorts |
| sheet open | not drawn | none | Focus moves to the sheet's title (tabindex -1), Tab is trapped inside, Escape closes (M-CRH-18), focus returns to the control that opened it |
| push (phone with a keyboard) | not drawn | none | Focus moves to the profile name heading; "‹ Roster" is first in Tab order; Escape does nothing (Apple has no Escape for a push); after the pop focus returns to the row that opened it |
| menus | not drawn | none | Arrow keys move, Enter picks, Escape closes and returns focus (today's `ui/Menu`) |
| segmented | stock | none | Left and Right arrows change the option (M-CRH-22) |
| desktop table | not drawn | none | Up and Down move the selection (M-CRH-33), Enter opens the full profile, the kebab is reachable by Tab inside the row |

#### S-ALL.voiceover
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| reading order | not drawn | none | Matches the visual order top to bottom; decorative marks are hidden (06 CP-6.10 lists every label) |
| figures | not drawn | none | Every bar, chart and coin set has a text label in the DOM; no figure is only a picture |
| roles | not drawn | none | The player's tree holds no teammate figure, label or hidden text (SHARED-11) |

#### S-ALL.busy
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| tapped once | not drawn | none | The button keeps its label and look, takes `aria-busy="true"` and `aria-disabled="true"`, and ignores further taps until the write returns (06 CP-6.11). No spinner, no opacity drop |
| slow (past today's threshold) | not drawn | none | Today's "Still saving…" toast (CH-1902) |
| offline | not drawn | none | Today's "{failed}: you're offline" with Try again (CH-1903) |

#### S-ALL.day-rollover
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| midnight while open | not drawn | fixture clock 23:59:50 then 00:00:10 | When the page becomes visible again or the minute ticks past midnight in the team's zone, the screen refetches as pull to refresh does (no motion, M-CRH-55): Classes Today and its weekday, the week strip's ringed tile, Home's date, greeting, Today and This week move to the new day |
| greeting band | not drawn | none | The greeting follows today's `greeting` clock; it changes on the next refetch, never mid-read |
| 1 August | not drawn | fixture clock 31 Jul 23:59 then 1 Aug 00:01 team zone | Year coins, `classYearLine`, the team card's season title ("2026–27 season" to "2027–28 season") and the season averages turn over on the refetch (SHARED-11; 08 item 3) |
| team zone vs device zone | not drawn | fixture device zone 3 hours off | Every "today" uses the team's zone (`todayIso`, `homeClock`), never the device's, as today |

#### S-ALL.mid-width
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| 821 to 1279 | not drawn | add `<stem>-1024` | The desktop layout with today's responsive rules; the new pieces fill the main column: the team card and leaders sit in one row while both fit at their minimum (team card 320, leaders 3 x 200), else the leaders row drops under the team card and scrolls sideways; the Home hero's `1fr 380` grid becomes one column under 1100 with Up next under the greeting |
| 768 to 820 (iPad portrait) | not drawn | add `<stem>-768` | The phone layout with the 20 edge; cards fill the width (no max width, as today); the leaders row keeps `min(62%, 220)` cards and bleeds |

#### S-CLASSES.coach
As today: the legacy "Classes are a player feature" page; this lane does not touch it.

#### S-CLASSES.no-term
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | not drawn | `classes-noterm` | No term card and no context line; Today is the first card; binders and the week strips draw as normal; no overlap chip (the chip lives in the term card); the Overlaps card still shows when there is a conflict |
| loading | not drawn | none | Skeleton as drawn (the green block shows until the read says there is no term, then the first frame of content drops it, M-CRH-39) |

#### S-CLASSES.term-edges
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| before start | not drawn | `classes-preterm` | Term card: no week well; heading "Starts {Mon, Aug 20}"; sub "{N} weeks · term ends {Dec 15}"; term line empty with the Today knob at the start; Soon lists this week's team events only. Context line as normal |
| after end | not drawn | `classes-postterm` | Term card: no week well; heading "Term ended"; sub "Ended {Dec 15}"; term line full with no knob; no Soon list; no overlap chip. Today shows "No classes today" with no "Next" line and no ribbon when no class meets again |
| last week | not drawn | none | "1 week left · term ends {Dec 15}" (singular); on the end date itself "Ends today" |

#### S-CLASSES.partial
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| some cards failed | not drawn | `classes-partial` | Cards whose read worked render; a card whose read failed shows the failed block inside that card (06 1.3) with today's code (CH-12202 for Overlaps) and Try again that refetches the screen. The term card never shows a failed block: it hides if its read failed |
| sync failed (`failsync`, `failpartial`) | not drawn | none | The S-CLASSES.sync row with "Retry sync" and today's toast "{code} is saved, but not on your calendar" |

#### S-CLASSES.team-items
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | drawn | `classes` | Not buttons, no chevron, no press wash; VoiceOver reads them as text |

#### S-CLASSES.sheet-stack
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| Edit class | not drawn | none | The class sheet stays mounted; ClassForm opens above it on today's Modal stack with its own dim (M-CRH-45). Save closes the form and the class sheet shows the saved values on one frame (no motion) |
| Remove class | not drawn | none | The confirm opens above the class sheet. On "Remove class" both close together (M-CRH-57), the binder is gone on the next frame, toast "{code} removed" |
| Add an exam | not drawn | none | ExamSheet above the class sheet; Save closes it and the exam row appears in the class sheet on one frame |
| Escape or dim tap | not drawn | none | Closes only the top sheet; focus returns to the button in the sheet below |

#### S-CLASSES.gone
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | not drawn | none | A refetch that no longer has the open class closes its sheet (M-CRH-18) with no toast and no error; a write on it that returns "not found" does the same and shows today's failure toast |

#### S-ROSTER.requests.none
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | not drawn | `roster-requests-none` | The sheet opens at rest with the Requests card holding one centred line, "No join requests right now." (06 CP-6.5), then the team code card. No Approve all |

#### S-ROSTER.requests.one
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | not drawn | `roster-requests-one` | One row with its own Decline and Approve; Approve all is absent from the DOM (DECISIONS: hidden when there is only one request) |

#### S-ROSTER.requests.elsewhere
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | not drawn | none | The write answers that the request is no longer pending: the row leaves exactly as on success (M-CRH-36), no error toast, the Roster count refreshes from the server |

#### S-ROSTER.requests.failed
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| one row | not drawn | none | The row starts its fade at once; on failure it returns (M-CRH-47) and today's failure toast shows; the count on Roster is unchanged |
| Approve all | not drawn | none | Every row fades together; on a failure the rows the server did not approve return, the ones it did stay gone, toast as today |

#### S-ROSTER.profile.deeplink
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | not drawn | `roster-profile-link` | Profile at rest with Roster under it, focus on the profile name (M-CRH-46) |
| loading | not drawn | none | Roster's skeleton until the roster read returns, then the profile at rest; never a push |
| Reduce Motion | not drawn | none | Same, at rest (nothing to fade) |

#### S-ROSTER.profile.missing
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | not drawn | `roster-profile-missing` | Roster at rest, no profile, toast "That player isn't on your roster." (no name, so no other team's player is ever named); the param is removed with `replaceState` |

#### S-ROSTER.profile.removed
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| removed | not drawn | none | On the next refetch (focus, pull, or a write) that no longer has the player: the profile pops (M-CRH-49), toast "{first} is no longer on the roster." |
| set inactive elsewhere | not drawn | none | The profile stays; its coin takes `data-dim`; the row moves to the Inactive card on Roster with no motion |
| a write on a removed player | not drawn | none | The write's "not found" answer pops the profile with the same toast |

#### S-ROSTER.profile.note-dirty
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| Back or a link | not drawn | none | Today's "Discard your changes?" confirm shape (S-CLASSES.class-form.discard) with "Keep editing" / "Discard"; Keep returns to the note with the caret where it was |
| edge swipe | not drawn | none | The swipe follows the finger; on commit the profile springs back to rest instead of popping and the confirm opens (M-CRH-58) |
| saved | not drawn | none | Today's save and toast "Note saved for {first}" |

#### S-ROSTER.profile.availability-failed
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | not drawn | none | The chip moves at once (M-CRH-43); on failure it moves back on the same spring (M-CRH-48) and today's toast shows; the Injured card on Roster is unchanged |

#### S-ROSTER.profile.order
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | not drawn | `roster-profile` scrolled | Cards top to bottom: This season, Scoring trend, Recent rounds, About (drawn), then Availability, Coach's note, CoachHelm (today's panel, when today shows it). Each is a 06 card; nothing sits on the page between them |

#### S-ROSTER.role-guard
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | not drawn | `roster-player-guard` | S-ROSTER.player at the top; no requests, invite or profile component in the DOM; no coach-only read in the network log |

#### S-ROSTER.desktop-search
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| no matches | not drawn | `roster-desktop-noresults` | Inside the table card under the sticky header: the empty block (06 1.3) with icon `search` and today's no-results copy; the peek keeps its last selection; clearing the field restores the rows on one frame |
| one match | not drawn | none | One row, selected in the peek |

#### S-ROSTER.desktop-tools
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | not drawn | `roster-desktop` | Export, search, the Status segmented and the Team or List toggle keep today's place and behaviour above the table card, restyled with the card and segmented tokens; `ch-roster-view` in localStorage still remembers the view |

#### S-ROSTER.print
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | not drawn | add a print-media screenshot | Today's print block keeps working on the renamed selectors (02 R14): black text on white, year coins print as their initials in a 1px outline (no fill), form bars print in ink, no sticky header repeat beyond today's |

#### S-HOME.since, S-HOME.later
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | not drawn | `home` scrolled | Each is a 06 card with 64pt rows (52 without a coin), today's copy and order, placed where today places them inside `.ch-hm-body`; round rows open the round sheet; change rows open the event |
| empty | not drawn | none | Card absent, as today |

#### S-HOME.no-events, S-HOME.today-empty
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| no events | not drawn | `home-noevents` | Today's NoEvents inside the Today card as the empty block: type chips (06 chip, each with a 44 hit area) and "Add event" opening `/calendar?new=1&type=<t>`, CH-2309 |
| nothing today | not drawn | none | The Today card shows today's empty line and "Plan" (CH-2301) opening `/calendar?new=1` |

#### S-HOME.day-actions
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | not drawn | none | On the glass Up next card, today's Nudge, Message and Directions become glass capsules (06 CP-6.9) in one row under the coins; Directions opens Apple Maps as today; the recap row opens the round sheet |
| none apply | not drawn | none | Row absent; the card ends at "4 of 6 going" |

#### S-HOME.queue-failed
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | not drawn | `home-queuefailed` | In the hero where the capsules sit: today's CH-2220 line at `h-ink2` with a "Try again" glass capsule; the rest of Home renders |

#### S-HOME.part-failed
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| `cachefailed`, `error` | not drawn | `home-<state>` | As the drawn failed state: "Some of today didn't load. What did is below." and per-card failed blocks |
| `tourfailed` | not drawn | none | The tournament part of S-HOME.live shows its failed block; everything else renders |
| `noholes` | not drawn | none | The team's game card shows today's no-holes copy in the empty block; Team scoring still shows the average |
| `unranked` | not drawn | none | Desktop Leaderboard rows show rank as the no-data dash, as today |

#### S-HOME.round-links
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| default | drawn (two buttons) | `home-round` | Message and Round recap as drawn; when the round has no recap, the primary reads today's "Player stats"; CoachHelm is today's entry as a full-width default button under the two (06 CP-6.12) |

#### S-HOME.player-boundary
| State | Drawn? | Capture | Rule |
|---|---|---|---|
| this lane on, stats-home off | n/a | `home-player` | Player Home renders exactly as main, bar included |
| both on | stats-home page | `home-player` | Bar and hero one `--ch-frame` green with no seam (pixel sample at the join), "Your game" per stats-home |
| this lane off, stats-home on | n/a | `home-player` | Stats-home owns its bar; this lane changes nothing on player Home |

### CP.6 Fixes made in place above
- S-CLASSES.route-error: the "Needs the coordinator's yes" note is settled by DECISIONS; the rule stands.
- S-ROSTER.requests "one item": "pick one; see report" is settled: Approve all is hidden.
- S-HOME.class-line: "flagged for Nick" is settled as the default under Waiting on you.
