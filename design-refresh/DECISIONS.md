# Decisions (31 Oct 2026)

Nick's own words are in quotes. A line marked "default" was settled by the design lane after Nick said "Handle any other questions they have" (15:28). Nick can flip any default with one word, and the lane's package says what changes if he does.

## Nick's answers today

| Lane | Call | Answer |
|---|---|---|
| All | Who settles the remaining questions | "Handle any other questions they have" (15:28) |
| All | Depth of the package | "all designed screens need an emphasis on matching designs and motion and animation details and subscreen details… I want more detail than just a 500 word Md" (15:30). This is why every lane has 05 to 08 |
| Classes, Roster, Home | Six calls | "Go with your picks" (13:47): practice rounds out of averages, leaders and top five; no Captain tag; plain "Injured" chip, injured count as active; no finals, holidays or next-week travel on Classes; Home's hero bar becomes `--ch-frame`; desktop "Needs a look" strip removed |
| Stats | Page head | "Keep as drawn" (15:26): no large title, section names on the page. The one agreed exception to law 1 |
| Stats | Detail pages longer than drawn; `LEG_TREND` 7 to 10 | Default: yes to both |
| Messages | Announcement row in the + menu | "no to announcement" (14:32) |
| Messages | Typing | "typing should be tracked" (14:32): dots on inbox rows and pins, and group threads name who is typing |
| Messages | Springs over the 0.1 bounce cap | "as long as it's smooth" (14:32) |
| Messages | Camera row | "No don't add camera" (15:26). The + menu is Photos, File and Poll |
| Messages | Pin sync across devices | "pins sync is a go. Research how to do it" (15:26). It ships as its own held draft PR with a drafted, unapplied migration. The plan is in the Messages lane |
| Ask | Announcements | "Yes" (15:26): posts when the coach presses Post, with an 8 second Undo; players are told once Undo closes. Not a draft |
| Ask | Players' own Ask | Stats and visuals only, own data only, no writes, never a named teammate |
| Lenses and player Ask | What players compare against | "They see against pga tour and team averages" (15:26). No teammate dots, named or not |
| Team Board | White space and polish | "I love this. Fix the white space in the desktop version. Other than let's polish and rip it." |
| Team Board | Fifth Course tab; open reads per player | Nick (15:12): "I like having 5th tab with course stuff like reads and perf history and the 4 open reads are good". The Course tab is in, and up to 4 reads per player show. Team opens on the hole by default (`TEAM_BOARD_FIRST_VIEW`) |
| Read | Pictures in the read; players see where it shows up but no likely cause; team pool on the ladder when its flag is on | Default: yes to all three |
| Quick chat | Panel style | Glass panel |
| Ask | Drill flow; lineup flow; Lift flow | Default: drills built but off until N-00's held `golf_team_drills` (`20261026010100`) runs; Ask's HM5 is superseded (fixed 4 Nov wiring: was a `golf_drills.team_id` migration); lineup only where `golf_tournaments_v1` is on; no Lift flow yet |

## Calls the design lane made about this package

| Call | Pick and why |
|---|---|
| One zip or many | One zip, `clubhouse-redesign-package.zip`, rebuilt in place as lanes land, so there is one link to share |
| Folder layout | One `design-refresh/` folder with the same layout the plans already refer to (lane folders by name, shared files at the top), so no path in any plan breaks. The README table and START_HERE give the build order |
| Lane folder contents | Exactly what the lane's own thread wrote, copied as is. Old versions (`-v1`, `-v2`), duplicate copies of the design page, and the superseded Stats plan files are left out |
| Entry point for Code | `START_HERE.md` (runbook) and `CODE_PROMPT.md` (the prompt to paste). The two live leak fixes, CR0 and L0, go first |
| Acceptance format | Numbered pass or fail facts per screen ID and per PR, each checkable on a screenshot, in a DOM test or in a clip, with real numbers. Shared criteria are written once in `ACCEPTANCE-SHARED.md` as SHARED-1 to SHARED-12. The shape is set in `BUILD_CONTRACT_STANDARD.md` |
| Which file wins | 05 to 08 win over 04. A lane's package wins over BUILD_BRIEF. BUILD_BRIEF wins over the hub page |
| Where a lane's own 05 to 08 is missing | The design lead's draft fills in, and the README table says so |
| Screenshots | The design shots made in the cloud are included. App shots and side-by-side pairs are made on the Mac by each lane's `capture/capture.mjs`, because the app runs there |

## Calls the design lead settled while writing the acceptance criteria (Nick: "Handle any other questions they have")

| Lane | Question | Pick |
|---|---|---|
| All | How far the screen behind a push slides | The house value everywhere: `CH_UNDERLAY_SHIFT` 0.24 (the screen behind moves 24% left). Classes and Roster drew 30%; they follow the house value |
| All | Contrast for small chart marks such as the Steady spark | 3:1, because they are non-text marks (SHARED-4). Text stays at 4.9:1 |
| Classes, Roster, Home | Dark Sophomore year coin (white on fill 4.7:1) | Darken the dark-theme Sophomore fill until white reads at least 4.9:1. Hue stays the same |
| Classes, Roster, Home | Class tones in dark | The app's own dark tones, as 04 §8 says (its section 8 is the final word over 02) |
| Classes, Roster, Home | Practice rounds in the form bars | Left out, like every other scoring figure. They still list in Latest rounds |
| Classes, Roster, Home | Approve all with a single join request | Hidden when there is only one request. The row's own Approve is enough |
| Classes, Roster, Home, Stats | Team average window | As 03-DATA-CHECKS says, which follows today's loaders: season on Roster, last 10 rounds on Home. Each card names its window |
| Stats | Loss pill at 4.84:1 in light | Lighten the pill tint to #F7F0E6 so the text reads 4.97:1 in light and 6.18:1 in dark (Stats 04 §2 and 06) |
| Read | Four 02 vs design conflicts (back label, desktop rail, message prefill, card spacing) | Settled in Read 06 §14: back label is the player's first name for a coach and "CoachHelm" for a player; rail 250; no message prefill; 20 between cards, 16 inside |
| Messages | Pin sync, first sync on a device | Device pins are copied up on first sync, so nobody loses a pin, up to the cap |
| Messages | Pin reordering | No reorder UI for now, and the position column stays so it can be added later. A new pin goes at the end, so a coach's arrangement stays steady (PIN-SYNC D4; newest first is the listed flip) |
| Ask | Request more email when customer email is off | It follows `HELM_CUSTOMER_EMAIL_ENABLED` like every other app email: with it off, the request is logged and no email goes |
| Ask | Pieces the design page still shows that Nick's answers retired (Important, "Tomorrow at 8 AM", "No push", trip link) | Not built. Their capture IDs are retired, and the Ask thread updates the page |
| Ask | Pairs under 4.9:1 on the design page (urgent banner label, paused composer, cancelled draft, seated lineup row) | Raised to 4.9:1 in the build. The Undo ring track is decorative; its moving fill needs 3:1 |
| All | Reduce Motion crossfade length (lane files say 120ms; the app pins 180ms) | The app wins: `CH_FADE_MS` from `lib/motion.ts`, 180ms today, set by an owner decision on 24 Oct and pinned by a test. Every lane reads its "120ms crossfade" as `CH_FADE_MS`. Where a lane names the CSS token `--ch-dur-crossfade-rm`, PR 1 adds it set to the same value as `CH_FADE_MS`, so CSS and JS agree |
| Classes, Roster, Home | Design page springs (`--smooth`, `--settle`) are softer than the app's | The app's springs win. The side-by-side clip check compares the build with the app's curve strings in 07 (K1 to K9), not the page's |
| Classes, Roster, Home | 47 contrast pairs under target as drawn (06 §13) | Fix every text and mark pair in the build as 06 lists it (off-day letters at full tone ink, injured initials opaque, dark chart marks on `--ch-green-500` dark, and so on). The 18 decorative pairs need no fix |
| Classes, Roster, Home | Sheets at 90%, 62% and 74% need heights the shared Modal lacks | Add an optional detent/height prop to Modal. It defaults to today's behaviour, so other callers don't change |
| Classes, Roster, Home | Classes route errors | Show the drawn failed state (with Try again), not the legacy Fairway error page |
| Classes, Roster, Home | Where the coach Home class line goes | Under Waiting on you (default Nick can flip) |
| Classes, Roster, Home | App sheets the design never drew (37 rows in 05) | Keep each of today's sheets and restyle it with the redesign's sheet surface, type and motion |
| All | New motion hooks asked for by 07 | Allowed as additive tokens in PR 1: `data-ch-press-scale` (cards press at 0.97) and `--ch-ease-spring-settle` (switch thumb). Nothing existing changes |
| All | Route parallax `--ch-vt-parallax` is −30% while `CH_UNDERLAY_SHIFT` is 0.24 | One value: 24%, as the design notes say. PR 1 sets `--ch-vt-parallax` to −24% and updates the one pin in `native-nav.test.tsx`. Every lane that says −30% (or keeps today's push) reads 24%. The shared values table in START_HERE is the single source of truth |
| Lenses | Coach field dots | Coach sees unnamed dots from 3 players up, no floor; never sent to the player or the lens (SHARED-11) |
| Lenses | Field card for players | Players and the lens get the field card only when the field is 5 or more, so no one can work out a teammate's score. Same floor as the Team figure |
| Lenses | Preview pill | Solid `--ch-card-bg`, no blur, because glass never sits over data |
| All | Menu rows at 34pt (today's `ui/Menu`) | Unchanged component, left as is in lane PRs. PR 12 lists it for Nick, since Apple's menu rows are 44pt |
| All | `.ch-btn--primary` has its own gradient (`ui.css`) | Unchanged component, left as is in lane PRs. SHARED-2 covers new surfaces. PR 12 lists it for Nick |
| All | Dark Sophomore avatar initials at 4.7:1 | Same fix as the year coin: the darker dark-theme Sophomore fill (#8B6B30) brings white to 4.95:1 |
| Practice Builder | Which flag gates what | Two flags: `golf_practice_plans` (N-00) gates the Practice tab and its builder; `coachhelm_practice_plans_v1` gates CoachHelm writing plans. The CoachHelm helper inside the builder needs both |
| Practice Builder | Group C and the random kind colour | Plum (#654A7E, dark #B49ACB), because the dark ochre read as the loss amber |

## Calls settled in the completeness pass (4 Nov 2026)

Nick asked for every screen, subscreen and feature to be finished front to back for one agent ("Everything needs to be thought of and considered"). These are defaults under his "Handle any other questions they have". None reopens a call above. Each flips in one line, and `COMPLETENESS.md` says where.

| Lane | Call | Pick and why |
|---|---|---|
| All | Lane flags | Every lane has its own flag, off everywhere: `clubhouse_refresh_v1` (foundation PR 2 and 3), `clubhouse_classes_roster_home_v1`, `clubhouse_stats_redesign_v1`, `golf_messages_redesign_v1`, plus the CoachHelm and Practice flags already named. Three lanes had none, so SHARED-8 couldn't hold. Nick confirmed the new `clubhouse_refresh_v1` foundation flag ("Keep all three", 4 Nov 01:49 UTC) |
| All | Feature cards | Flat, no radial light, because SHARED-2 allows no gradient but the segmented chip |
| All | XXL Text Size value | 1.36 |
| All | Practice tab and Documents | N-00 and N-10 are in `prerequisites/` and built before PP4, restyled to DESIGN_LANGUAGE; the practice-plan lane's drawings win where both draw a screen. Nick asked for "Practices should be a tab itself" and plans in Documents, and the builder lane ships with it |
| Stats | Practice rounds | Out of every average by default, as on Roster and Home; the filter can still include them on purpose |
| Stats | Card press | 0.97 with the wash (shared Press value); rows and tiles wash only |
| Stats | "Missed short" fix | Behind the Stats flag, so flag off matches main |
| Classes, Roster, Home | `classYearLabel` repeat fix | Behind the lane flag |
| Classes, Roster, Home | Stats' "‹ Team" key when the coach came from Roster | Stays "‹ Team"; Back already returns to Roster |
| Messages | Offline sends | Today's rule: fail at once, "Not sent", tap to retry. No auto queue |
| Messages | Ask's announcement "Open" | 11f adds `?announcement=<id>` |
| Ask | Practice brief | One card, shared with the practice-plan lane, not the page's four paged questions. Nick confirmed ("Keep all three", 4 Nov 01:49 UTC) |
| Ask | Publish confirm | Inline in the thread, not a 90% sheet |
| Ask | Regenerate | Not built |
| Ask, Quick chat, Practice | Drill bank | One bank, N-00's `golf_team_drills` (held `20261026010100`). Ask's HM5 is superseded |
| Ask, Quick chat, Practice | Folders | The name in `golf_documents.folder`; a plan can sit in any coach folder and keeps it on publish. N-10's `20261026090300` is narrowed to allow that, and plan rows get Move. Nick confirmed ("Keep all three", 4 Nov 01:49 UTC) |
| Ask, Quick chat, Practice | Plan without a practice that day | The practice event confirm comes first; Save turns on once it commits |
| Ask, Messages | Acknowledgement wording | "n of N acknowledged", today's Messages words, in both places |
| Read, Lenses | Top-read card when both flags are on | Lenses' feature card |
| Lenses | Plan sheet | Keeps a "Discard changes?" confirm |
| Practice | Block delete | Instant, with an 8 second Undo; N-00's confirm dropped. Plan, template and group delete keep their confirms |
| Practice | Groups D to F | D slate, E and F neutral, always lettered (DESIGN_LANGUAGE) |
| Practice | Player share | Players get Share PDF of their own copy only |
| Quick chat | Publishing | Quick chat never publishes; Publish lives on the plan page |
| Quick chat | A waiting question card | Expires at midnight in the team's time zone |

## Calls settled in the wiring pass (4 Nov 2026)

Engineering calls made while checking every lane against the code on main 03d9087. Each keeps today's behaviour or picks the option that needs no new table.

| Lane | Call | Pick and why |
|---|---|---|
| Read, Lenses | Error codes | Read uses CH-13861 to CH-13869, failed state CH-13866 (CH-13860 is Standing's How you play). Lenses uses CH-13760 to CH-13779, Save plan failure CH-13760; Accept and Decline keep today's CH-13004 and CH-13005 |
| Read | Read card with Read on and Lenses off | One flag branch on the player's top focus card (`PlayerBoard.tsx:44`) and on the Deep dive head. Team never draws it |
| Team | Source for strokes by area | Team Stats' rounds, so one number shows across Stats and CoachHelm and no held table is needed |
| Lenses | Coach told when a player accepts or declines a focus | No new notification; the handshake shows on the next load, as today |
| Messages | Older messages | No paging; the thread keeps today's newest 200 |
| Messages | Deleted message in an open thread | Closes in place, as today |
| Messages | Reaction pop | Plays when the saved row lands, as today; no optimistic overlay |
| Classes, Roster, Home | Join request already handled elsewhere | Row stays hidden, no toast, route refreshes |
| Classes, Roster, Home, Stats | Practice rounds | Left out of averages through one `countsForScoring(r)`, under each lane's flag; Stats' pressure gap keeps them on purpose |
| Practice | Undo of a publish | Take-down: the frozen version stays but is no longer live, so the next publish is version 2 |
| Practice | Bell row settings | No per-user switch, the same as every `event_reminder` row today |
