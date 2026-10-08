# Clubhouse premium pass: audit, owner answers and backlog

Date: 2026-10-08. The premium pass audited all 15 Clubhouse page families on desktop and phone: three ideas per page for each of look better, feel better and component or feature (135 ideas), 189 findings, and 120 owner questions. The owner answered them in the review page on 2026-10-08; this document is the durable record. The plan page and the review page are private Claude artifacts; the screenshots behind each finding stay in the session scratchpad and are not committed.

## Rules from the owner review

- Where a cross-app answer and a page answer disagree, the page answer wins; the cross-app answer covers only pages that were not answered (owner, 2026-10-08).
- D-70 stands: removing a shot or a class asks first; there is no Undo-as-Restore for shots or classes (owner, 2026-10-08).
- Actions that reach players (Nudge, bulk Message, Tell Coach) prefill Messages with the recipients and a draft; the coach presses Send (owner, 2026-10-08).
- The global light takes its sun from the team's course location, set once in Team settings, and from the time zone until it is set (owner, 2026-10-08).
- Dark mode ships with the release: System, Light or Dark in Settings, Preferences, Appearance, sharing GolfHelm's `golf_theme` switch; Clubhouse keeps its own night palette (owner, 2026-10-08).
- Ambient light leads the build: the owner says it "has really transformed the app" and wants more along those lines. The global light (P001-A1) comes first, then the pieces that read it: P003-A1, P004-A3, P006-A1, P010-A1/A2, P011-A1, P013-A3, P015-A1/A2. Light falls on the frame and materials, never on the data (owner, 2026-10-08).
- The real course view from the course-factory work (PR #2048) is on hold; the drawn hole map stays (owner, 2026-10-08).

## Build: yes (59)

Approved by the owner. Each still needs its board or spec where the audit says so before it is built.

| ID | Page | Item | Note or source |
| --- | --- | --- | --- |
| D1-5 | All | Auth provider for passkeys and Sign in with Apple |  |
| D1-6 | All | Push-to-self test endpoint |  |
| D2-1 | All | Undo windows on Decline and prospect delete |  |
| D2-2 | All | Read receipts |  |
| D2-3 | All | Sending minors’ messages or notes to an LLM |  |
| D2-4 | All | Share images and cards |  |
| D2-6 | All | Live round on the Lock Screen |  |
| D2-7 | All | New actions that message players | Owner, chat 2026-10-08: prefill only — the action opens Messages with recipients and a draft; the coach presses Send. |
| D2-8 | All | Coach-only meetings |  |
| D3-1 | All | Global light and its location source | Owner, chat 2026-10-08: location source = the team's course location (set once in Team settings), time zone until set. |
| D3-3 | All | Board changes on desktop |  |
| D3-4 | All | Phone board changes and new phone boards |  |
| D3-6 | All | Other layout and brand calls |  |
| D4-1 | All | Next shell build |  |
| D4-2 | All | Deep links on production |  |
| D4-3 | All | Actionable notifications |  |
| D4-4 | All | Widget extension and App Group |  |
| D5-1 | All | Red failure titles vs D-42 |  |
| D5-3 | All | Notification behaviour |  |
| D5-4 | All | Schema changes |  |
| D5-6 | All | Clubhouse painting |  |
| P001-A1 | P001 Shell | One sky, one light on the frame |  |
| P001-A2 | P001 Shell | Quiet the sidebar’s selected item |  |
| P001-C1 | P001 Shell | Resume-round accessory |  |
| P001-C2 | P001 Shell | Deep links end to end |  |
| P002-C2 | P002 Home | Trend sparkline in phone Latest rounds |  |
| P003-A1 | P003 Roster | Face grid as one ruled ledger lit by the hour |  |
| P003-A3 | P003 Roster | Drop chrome that competes with the players |  |
| P003-C1 | P003 Roster | A player peek card wherever a name appears |  |
| P004-A1 | P004 Stats (team) | Ledger grid in place of 28 tinted boxes |  |
| P004-A3 | P004 Stats (team) | Ambient light on the frame, never on the data |  |
| P005-A2 | P005 Stats (player) | One surface in Game detail |  |
| P005-C2 | P005 Stats (player) | Personal-best certificate and share card |  |
| P006-A1 | P006 Calendar | Daylight on the grid |  |
| P006-B2 | P006 Calendar | Swipe through days and weeks |  |
| P006-B3 | P006 Calendar | Drag to reschedule, with Undo |  |
| P006-C3 | P006 Calendar | Peek preview and hover cards |  |
| P007-A1 | P007 Messages | Announcements as letterhead |  |
| P008-C1 | P008 Settings | Real Dynamic Type, starting here |  |
| P008-C3 | P008 Settings | Test rows for push and haptics |  |
| P009-A1 | P009 Qualifiers | Standings on hand-hung plates |  |
| P009-B1 | P009 Qualifiers | Rows move only when the standings change |  |
| P009-C2 | P009 Qualifiers | Pace beside the total |  |
| P010-A1 | P010 Team Hub | The next trip as a lit pass with a stub |  |
| P010-A2 | P010 Team Hub | The latest announcement as a lacquered plate |  |
| P010-A3 | P010 Team Hub | Announcements as an edited page |  |
| P011-A1 | P011 Rounds | One sun for the round |  |
| P011-A2 | P011 Rounds | The scorecard as a hung board |  |
| P012-A1 | P012 Classes | One timetable, not 25 raised day keys |  |
| P012-A2 | P012 Classes | Overlaps drawn where they happen |  |
| P012-B1 | P012 Classes | A schedule read that shows its work |  |
| P013-A3 | P013 CoachHelm | The green card is where the light lands |  |
| P014-B1 | P014 Recruiting | “Committed” is a moment, once |  |
| P014-C1 | P014 Recruiting | A next step with a date |  |
| P014-C2 | P014 Recruiting | Recruiting calendar awareness | Research this for the divisions in my customers |
| P015-A1 | P015 Auth | Real solar light |  |
| P015-A2 | P015 Auth | Paper that sits in the room |  |
| P015-A3 | P015 Auth | One refusal anatomy |  |
| P015-B3 | P015 Auth | Keep Continue honest during the auto-advance |  |

## Later (13)

Wanted, not now.

| ID | Page | Item | Note or source |
| --- | --- | --- | --- |
| D2-5 | All | Selection letters and standings framing |  |
| P001-C3 | P001 Shell | ⌘K command palette |  |
| P002-C3 | P002 Home | Weather and light at tee time |  |
| P003-C2 | P003 Roster | Multi-select with bulk actions |  |
| P007-C3 | P007 Messages | Reply and Mark read from the Lock Screen |  |
| P008-C2 | P008 Settings | “Locker”: a member card for the player |  |
| P009-B3 | P009 Qualifiers | Pick the squad by placing players |  |
| P010-C2 | P010 Team Hub | “The course this week” briefing |  |
| P011-C1 | P011 Rounds | Live round on the Lock Screen and Dynamic Island |  |
| P012-C2 | P012 Classes | Per-class “On the team calendar” state |  |
| P012-C3 | P012 Classes | Next class on the Home and Lock Screen |  |
| P014-C3 | P014 Recruiting | A prospect one-pager |  |
| P015-C1 | P015 Auth | Passkeys and Sign in with Apple |  |

## Not building (45)

Declined. Do not reopen without the owner.

| ID | Page | Item | Note or source |
| --- | --- | --- | --- |
| D1-1 | All | Weather provider |  |
| D1-2 | All | Paid maps API |  |
| D1-3 | All | LLM spend on new AI surfaces |  |
| D1-4 | All | Apple Wallet pass |  |
| D3-2 | All | Crest and monogram system |  |
| D3-5 | All | Choreography and motion |  |
| D4-5 | All | Passkeys and Wallet |  |
| D5-2 | All | D-70 and contract conflicts |  |
| D5-5 | All | Recruiting calendar data |  |
| P002-A1 | P002 Home | Give the weight to the people who need a look |  |
| P002-A2 | P002 Home | Hand-hung to-par plates |  |
| P002-B1 | P002 Home | The countdown stops counting seconds |  |
| P002-B2 | P002 Home | One model for the latest-round pager |  |
| P002-C1 | P002 Home | “Why this line”, and an honest icon | Take this out |
| P003-B2 | P003 Roster | Decline with a 5-second Undo |  |
| P003-C3 | P003 Roster | One ranked next-best action |  |
| P003-F14 | P003 Roster | Opening a player fires haptic('select') per contract 31701, but D-70 reserves selection for pickers. |  |
| P004-C3 | P004 Stats (team) | “Ask about this leg” |  |
| P005-A1 | P005 Stats (player) | Numbers lead, identity steps back |  |
| P005-C3 | P005 Stats (player) | “Build a week around this” |  |
| P006-C1 | P006 Calendar | Directions and leave-by |  |
| P006-C2 | P006 Calendar | Tee-time conditions on outdoor events |  |
| P007-A3 | P007 Messages | Seen-by facepile on your last message |  |
| P007-C2 | P007 Messages | “Catch me up” on long threads |  |
| P008-A1 | P008 Settings | A real masthead |  |
| P008-B2 | P008 Settings | Quiet mode as a scheduled master control |  |
| P008-B3 | P008 Settings | One push model on phone |  |
| P008-F6 | P008 Settings | Two push models on phone: Settings keeps the tab bar (per the approved spec) while Roster’s profile is immersive. |  |
| P009-C1 | P009 Qualifiers | The selection letter |  |
| P009-C3 | P009 Qualifiers | Suggested lineup, with reasons |  |
| P010-B1 | P010 Team Hub | “Got it” lands like a signature |  |
| P010-C3 | P010 Team Hub | Take the trip with you |  |
| P011-B1 | P011 Rounds | Attest the card |  |
| P011-B3 | P011 Rounds | Shots land instantly; Undo is a Restore | Owner, chat 2026-10-08: keep D-70's warning before removing a shot; no Undo-as-Restore. |
| P012-B2 | P012 Classes | Remove a class with Undo | Owner, chat 2026-10-08: keep D-70's warning before removing a class. |
| P012-C1 | P012 Classes | Resolve an overlap where it is shown |  |
| P013-A1 | P013 CoachHelm | Decision first, pulse second |  |
| P013-A2 | P013 CoachHelm | AI mark and label in the house register |  |
| P013-C2 | P013 CoachHelm | “Why am I seeing this” on every signal |  |
| P014-A1 | P014 Recruiting | A pipeline that reads as a route |  |
| P014-A3 | P014 Recruiting | The prospect panel as a single sheet |  |
| P014-B2 | P014 Recruiting | Delete prospect becomes Undo |  |
| P015-B2 | P015 Auth | Tilt and pointer parallax on the course |  |
| P015-C2 | P015 Auth | Team crest on the welcome and member card |  |
| P015-C3 | P015 Auth | The member card becomes the Locker card |  |

## Still open (3)

No answer recorded yet.

| ID | Page | Item | Note or source |
| --- | --- | --- | --- |
| P002-B3 | P002 Home | Scrubbable scoring chart |  |
| P010-C1 | P010 Team Hub | Nudge the people who haven’t answered |  |
| P011-C2 | P011 Rounds | A post-round note that agrees with its numbers | I’d like round review to look a lot better |

## Release-relevant findings

Every P0 and P1 on a live code path, at the time of the audit.

| Sev | Page | ID | Finding | Fix | Status |
| --- | --- | --- | --- | --- | --- |
| P1 | P001 Shell | D1 | Reduce Transparency never applies on iPhone: WebKit has no prefers-reduced-transparency and no native bridge exists, so glass chrome stays translucent for users who asked for opaque. | Native bridge sets data-reduce-transparency; every reduced-transparency block also matches it (B1). | Fix pendingRelease |
| P1 | P002 Home | D1 | The deterministic brief carries an AI glyph (Sparkles), misattributing authorship on the screen that most needs trust. | Replace the glyph (C1); reserve Sparkles for CoachHelm model output. | Release |
| P1 | P003 Roster | #1 | The player roster renders the retired raised-card material: TeamRoster lacks data-canopy, so the player and coach views look like different products, and the skeleton differs from the content. | Add data-canopy and data-canopy-head to TeamRoster and RosterNoTeam. | Release |
| P1 | P003 Roster | #2 | Card rank and team strip come from the filtered list: searching “Jo” turns “4th of 7” into “Avg”, and “All” mixes inactive players into the ranks. | Compute averages from active players in Roster, not from rows. | Release |
| P1 | P004 Stats (team) | D1 | The phone ScoreLine plots lower scores higher with no axis cue: the line climbs while the caption says “Down 1.4 strokes”, the opposite of P005’s chart one panel away. | One app-wide scoring-axis convention, labelled “Lower is better” on inverted charts. | Release |
| P1 | P005 Stats (player) | D1 | The phone draws the same 10 scores twice, one panel apart, with opposite y-axes; the end label “74” collides with “avg 74”. | One chart or one labelled convention; run label collision on the end point. | Release |
| P1 | P005 Stats (player) | D2 | The same Last-10 window shows Scoring avg 74.1 in the hero and 73.6 in Game detail and the chart. | Fix the fixture, then test that both read the same round set. | ReleaseVerify live firstfixture; verify live |
| P1 | P006 Calendar | D1 | Week and Day grids open at 6 AM: at 1440x900 every event left today is below the fold. | Scroll so the now line or next event sits about 30% down, on open and on T (B1). | Release |
| P1 | P009 Qualifiers | D1 | “Live” is not guaranteed live: a realtime CHANNEL_ERROR goes to telemetry only, while Live badges keep showing. | Track channel state; show “Paused · standings from hh:mm” and Refresh when not SUBSCRIBED (B2). | Release |
| P1 | P011 Rounds | D1 | The shot screen and setup aren’t immersive on phone: the root top bar and bell stay above the screen’s own bar (about 100pt of chrome on the course), against the spec. | Call usePhoneImmersive(true); verify on the live route. | Release |
| P0 | P013 CoachHelm | D1 | Phone Ask opens Evidence as two nested modal dialogs: an empty front sheet holds focus while the content sheet sits dimmed behind, with two closes (axe serious). | Render only the panel body inside Ask’s Modal. | Fixed in 7751354fbRelease |
| P1 | P013 CoachHelm | D2 | The coach decision is below the fold: Assign at y=913 on 1440x900 and about y=1110 on phone. | A1. | Release |
| P1 | P013 CoachHelm | D3 | The Ask desktop trend chart scales a 360x150 viewBox to about 650px, so axis text is about 20px and “Average 30%” collides with the line. | Size the viewBox to the container; offset the reference label. | Release |
| P1 | P015 Auth | D1 | The onboarding reading surface is translucent glass (0.9 alpha, blur 22px): trees and the flag pole show through the fields and password rules, with no fallback. | Make .ch-ox-stage opaque; keep glass for the step pill and mark only. | Related to the reduce-transparency fix; needs its own fallbackRelease |

## All findings by page

IDs match the page audit notes. Line numbers drift; re-check each file and line before acting.

### P001 Shell

| Sev | ID | Finding | Fix |
| --- | --- | --- | --- |
| P1 | D1 | Reduce Transparency never applies on iPhone: WebKit has no prefers-reduced-transparency and no native bridge exists, so glass chrome stays translucent for users who asked for opaque. | Native bridge sets data-reduce-transparency; every reduced-transparency block also matches it (B1). |
| P2 | D2 | Phone sheet scrims stop under the green chassis: with the bell or More open, the top bar stays undimmed above the scrim. | Raise the scrim above .ch-topbar, or dim the bar with inert plus an overlay class. |
| P2 | D3 | The More sheet is a hand-rolled dialog with no inert background; VoiceOver can likely reach content behind it. | Port to ui/Modal.tsx, or set inert on .ch-app siblings while open. |
| P2 | D4 | Home’s phone top bar has two identities: server HTML says “Home”, then hydration swaps to the crest and “Varsity”. | Pass the hero flag through the server phone hint so the first paint is final. |
| P2 | D5 | The date eyebrow is tracked at 0.14em in mixed case and reads as a decoration error. | 0.01em tracking, 500 weight, 12–13px; carry hierarchy with colour and the double rule. |
| P2 | D6 | Raw colour literals bypass tokens (shell.css 44 hex / 54 rgb, home.css 68 / 96, onboard.css 61 / 45), blocking dark mode, P3 and light-temperature work. | Promote repeats to --ch-* tokens and lint new literals in clubhouse:check. |
| P2 | D7 | No prefers-contrast: more anywhere: faint engraved rules, the 12px champagne eyebrow and hairline cards lose definition. | One token block: stronger rules, text-secondary eyebrow, opaque glass. |
| P3 | D8 | Phone bell-failed uses a red title, while D-42 reserves red for under par, the flag and destructive actions. For owner awareness only. | None now; raise the D-42 tension in the next owner review. |
| P3 | D9 | The Next.js dev indicator covers the phone Home tab in every dev screenshot used as evidence. | Hide nextjs-portal in the clubhouse:shots capture CSS. |

### P002 Home

| Sev | ID | Finding | Fix |
| --- | --- | --- | --- |
| P1 | D1 | The deterministic brief carries an AI glyph (Sparkles), misattributing authorship on the screen that most needs trust. | Replace the glyph (C1); reserve Sparkles for CoachHelm model output. |
| P2 | D2 | The Up-next avatar stack clips initials (“AL(”, “JO(”). | Overlap about 6px, or show only the first letter in stacks. |
| P2 | D3 | Leaderboard rows are <a role="row">, so screen readers announce a row, not a link. | Keep role="row" on a div; put the link on the name cell, stretched with ::after. |
| P2 | D4 | No ties, and an “Early read” player still gets a numbered position. | Tie positions with a T prefix; early-read rows show “—” and sort last. |
| P2 | D5 | Phone failed state: inconsistent section anatomy and uneven notice gaps (about 100px vs 50px). | Same head (title + rule) and 18px notice rhythm for every covered part. |
| P2 | D6 | Desktop coach columns are unbalanced: the left ends about 300px early, leaving dead parchment. | Drop the duplicate recent list (A1) or move Later this week into the left column. |
| P2 | D7 | About 60px of extra dead space after Up next and Today on the coach phone. | Audit .ch-hm-hero margin and .ch-hm-body padding against m-clubhouse.css. |
| P2 | D8 | Tracked eyebrow date (same as P001 D5). | Same fix as P001 D5. |
| P3 | D9 | The countdown re-renders every second for far-off events (an unprofiled perf and attention smell). | Minute cadence until under an hour (B1). |
| P3 | D10 | Fixture fidelity: weekday mismatch, a fixed “Good morning” at 2:40 PM, and Jonah’s score differs between Home and the welcome. | Derive fixture labels from PREVIEW_HOME_NOW through the real formatters. |
| P3 | D11 | A React “state update on a component that hasn’t mounted” warning in the coach loading state. | Find the skeleton-path effect (likely SkeletonHeroBar / usePhoneHero). |

### P003 Roster

| Sev | ID | Finding | Fix |
| --- | --- | --- | --- |
| P1 | #1 | The player roster renders the retired raised-card material: TeamRoster lacks data-canopy, so the player and coach views look like different products, and the skeleton differs from the content. | Add data-canopy and data-canopy-head to TeamRoster and RosterNoTeam. |
| P1 | #2 | Card rank and team strip come from the filtered list: searching “Jo” turns “4th of 7” into “Avg”, and “All” mixes inactive players into the ranks. | Compute averages from active players in Roster, not from rows. |
| P2 | #3 | An early-read player (2 rounds) is ranked “7th of 7”. | Hide place and strip under the early floor; show “Needs 1 more”. |
| P2 | #4 | The desktop peek scrolls away: its identity, Close and actions leave the viewport. | Sticky peek with internal scroll (B3). |
| P2 | #5 | The phone requests sheet has four primary buttons. | Per-row Approve as secondary; Approve all the only primary. |
| P2 | #6 | The phone sort control’s hit height is 34px. | 44px min-height, or a pseudo-element hit area. |
| P2 | #7 | Sort stays on Avg when stats failed, so the order is meaningless. | Default to Name and disable Avg and SG when statsError. |
| P2 | #8 | The fallback team name leaks mid-sentence: “2 players want to join Your team”. | Lowercase mid-sentence, or omit the name on teamError. |
| P2 | #10 | Rem scaling is ignored: a 130% root size leaves Settings pixel-identical, and Roster type is px. | Shell-level Dynamic Type (P008 C1). |
| P3 | #9 | The phone kicker is tracked at 0.14em (sentence case, so not a doctrine breach, but inconsistent with desktop). | letter-spacing: 0. |
| P3 | #11 | Clicking an already-open player’s Needs-a-look chip closes the peek. | Chips only open; close stays on X or Esc. |
| P3 | #12 | “— a round” reads as a sentence when SG is null. | Hide the unit when the value is missing. |
| P3 | #13 | Cards are <button aria-pressed> around all the figures: a 30-word toggle label, and “pressed” misdescribes opening a panel. | aria-expanded with aria-controls; label is the name plus one figure. |
| P3 | #15 | Phone profile: Message is green-tinted while Plan 1:1 is white and raised, two secondary styles side by side. | One secondary style. |
| P3 | #16 | After Approve, the sidebar badge and header count don’t update. | Verify on a live team. |
| P3 | #17 | The coach failed state stacks three red titles; the player no-team state has no h1. | One summary notice; give the no-team title the h1. |
| Owner | #14 | Opening a player fires haptic('select') per contract 31701, but D-70 reserves selection for pickers. | Owner chooses; if D-70 wins, tick only on sort and filter changes. |

### P004 Stats (team)

| Sev | ID | Finding | Fix |
| --- | --- | --- | --- |
| P1 | D1 | The phone ScoreLine plots lower scores higher with no axis cue: the line climbs while the caption says “Down 1.4 strokes”, the opposite of P005’s chart one panel away. | One app-wide scoring-axis convention, labelled “Lower is better” on inverted charts. |
| P2 | D2 | The partial state says it twice, Try again floats mid-row, and empty figures keep their captions. | Suppress the section title when covered; right-align Try again; drop captions for null values. |
| P2 | D3 | The figure row is inconsistent: the Scrambling gauge has no reference, and only SG states its sample. | A named reference (or none) on every gauge; one caption line. |
| P2 | D4 | axe aria-allowed-role: leg-card rows .ch-lg__r[role=row] on a disallowed element (7 nodes). | Put role=row on a div with the link inside, or drop the grid roles. |
| P3 | D6 | Preview ?state=loading on phone renders the desktop skeleton; the live route is fine. | Use StatsRouteSkeleton in the preview. |
| P3 | D7 | The loading skeleton has no h1. | A visually hidden h1 “Team stats”. |
| P3 | D8 | The head costs about 390px before the first figure, then a 90px dead gap before the SG section. | Tighten the head; normalise section spacing. |
| P3 | D9 | Desktop putting rings: five 12px italic labels crowded on one leader fan. | Use the phone’s bars with a Tour tick. |
| P3 | D10 | The phone window switch is left-packed, leaving an empty right third. | Distribute segments or size the track to content. |
| P3 | D11 | 26 hard-coded colours in stats.css. | Move to --ch-* chart tokens. |
| P3 | D12 | Dev console: “state update on a component that hasn’t mounted” on partial. | Trace the refresh-notice effect. |

### P005 Stats (player)

| Sev | ID | Finding | Fix |
| --- | --- | --- | --- |
| P1 | D1 | The phone draws the same 10 scores twice, one panel apart, with opposite y-axes; the end label “74” collides with “avg 74”. | One chart or one labelled convention; run label collision on the end point. |
| P1 | D2 | The same Last-10 window shows Scoring avg 74.1 in the hero and 73.6 in Game detail and the chart. | Fix the fixture, then test that both read the same round set. |
| P2 | D3 | The desktop hero, figures and tabs push tab content to y≈700 of 900. | A1. |
| P2 | D4 | Game detail nests tiles in a raised card; with More detail open the tab is 11,608px tall. | A2; More detail closed or one section at a time. |
| P2 | D5 | .ch-gd__nav uses a raw backdrop-filter: blur(20px) with no @supports or reduced-transparency fallback. | Opaque parchment fallback under @supports not and :root[data-reduce-transparency]. |
| P2 | D6 | The phone “−1.3 vs. previous 10” chip sits detached from the SG figure it describes. | Put it under SG / round, or prefix “SG”. |
| P2 | D7 | Two h1 on phone; a desktop heading-order violation on .ch-yb__head h3. | One h1; fix the heading level. |
| P2 | D8 | Development rows are unitless: “35 → target 30”. | Add units (“35 ft → 30 ft”, “62% → 75%”). |
| P3 | D10 | Desktop Strokes gained by leg floats a dotted line and one bar in a half-empty panel. | Use the phone’s bar-either-side-of-zero rows. |
| P3 | D11 | The Par key swatch is near-invisible on parchment. | A 1px ink-300 outline on light segments. |
| P3 | D12 | Copy: “34 Holes” capitalised; “Fairways par 5 58% / Par 4 65%” reads as one label. | Sentence case; split the par 4 figure. |
| P3 | D13 | Preview phone loading renders the desktop profile skeleton; the live route is fine. | Use StatsRouteSkeleton in the preview. |

### P006 Calendar

| Sev | ID | Finding | Fix |
| --- | --- | --- | --- |
| P1 | D1 | Week and Day grids open at 6 AM: at 1440x900 every event left today is below the fold. | Scroll so the now line or next event sits about 30% down, on open and on T (B1). |
| P2 | D2 | Unlaned event titles are one line with an ellipsis even when the block has room (“Bus to Pine…”). | Wrap with a height-based line clamp, as .ch-ev--lane does. |
| P2 | D3 | New event always seeds 3:30–5:30 PM, colliding with daily practice, so all six invitees open as Busy. | Seed from openTimes(): the first free 2-hour slot after now. |
| P2 | D4 | Find a time’s opaque band hides the clashing block: lanes look free while the list says everyone is busy. | Outline-only band; raise .is-clash blocks above it in amber. |
| P2 | D5 | The phone Day view can’t reach the next or previous week except through Month. | ‹ › week buttons at the strip ends, plus swipe (B2). |
| P2 | D6 | The desktop toolbar shifts about 80px when Agenda drops the arrows. | Reserve the arrow slot in Agenda. |
| P3 | D7 | Players see coach-only meetings with no invitees (“Parent call · Natarajan family”). | Owner decides whether a meeting with no invitees is coach-private. |
| P3 | D8 | A player’s own class reads “Jonah · ECON 101 / ECON 101 · Gardner Hall 008”. | When owner = viewer, the title is the course and the subtitle the place. |
| P3 | D9 | Sheets draw a focus ring on Close when opened by touch (systemic, Modal owner). | Focus the sheet title, or ring only for keyboard modality. |
| P3 | D10 | The phone week plate glides on a bezier; D-64 puts gliding indicators on springs. | Spring token at bounce 0. |
| P3 | D11 | On failure the phone loses the week strip and day heading. | Keep the strip and heading; notice where the agenda was. |
| P3 | D12 | Event blocks transition box-shadow on hover: paint work on large grids. | Shadow on a pseudo-element; transition its opacity. |

### P007 Messages

| Sev | ID | Finding | Fix |
| --- | --- | --- | --- |
| P2 | D1 | A thread pushed during hydration opens at its oldest message (scrollTop 0 of 1011), with the unread messages below the fold. | Re-run toEnd() after the push settles and on the first ResizeObserver tick. |
| P2 | D2 | A failed own message drops to opacity 0.6, about 2.8:1 text contrast, exactly when it must be read to retry. | Full-ink text; dashed outline, muted fill and the existing “Not sent · Retry”. |
| P2 | D3 | A chunk-load failure falls through to the generic app error page (Helm copy, off-brand green Try Again). Real trigger: stale chunks after a deploy. | Clubhouse-styled error.tsx at the route segment; auto-reload once on ChunkLoadError. |
| P2 | D4 | The preview phone auto-pushes the Varsity thread after hydration, so the page jumps from inbox to thread. | Seed selectedId: null on phone; check the live loader never auto-pushes. |
| P3 | D5 | The phone “New message” action mounts after hydration and pops in late. | Stand-in bars render a disabled placeholder for declared actions. |
| P3 | D6 | Sheets show a focus ring on Close when opened by touch (systemic; also P006 D9 and P010). | Focus the sheet heading, or ring only for keyboard. |
| P3 | D7 | The seam between the two unread inbox rows is missing. | Keep seams; signal unread with weight and badge. |
| P3 | D9 | The composer stays live when the conversation failed to load. | Disable it, or label it “Sends when the conversation loads”. |
| P3 | D8 | Two announcement icon treatments with no legend. | One disc; an amber “Urgent” word in the meta line. |

### P008 Settings

| Sev | ID | Finding | Fix |
| --- | --- | --- | --- |
| P2 | #1 | The phone groups “Weekly team email” under “This device”. | Move it to an Email group, as on desktop. |
| P2 | #2 | Quiet mode is first on desktop and last on phone. | First on both (B2). |
| P2 | #3 | The invite code is set in tracked JetBrains Mono; three code styles exist across P003 and P008. | Single code plate (A3). |
| P2 | #4 | The Push column looks active while “Push on this device” is off. | A column note or dim (A2). |
| P2 | #5 | Type ignores rem scaling (the two captures are md5-identical); Dynamic Type itself is untested. | C1 (shell). |
| P3 | #7 | Help and legal links are styled as green bold headings. | Ink link rows with a chevron or external glyph. |
| P3 | #8 | Sign out is red, though D-42 reserves red for destructive actions. | Ink; keep red for Delete account. |
| P3 | #9 | Failed-profile copy says “Reload to try again” beside a Try again button. | “Nothing was changed. Try again; the error has been reported.” |
| P3 | #10 | CoachHelm: “Changes save as you make them” floats above the title, beside a lone sparkle icon. | Move the line to the subtitle; drop the icon. |
| P3 | #11 | The assistant coach’s header reads “Coach · Varsity”. | “Assistant coach · Varsity”. |
| P3 | #13 | The preview accepts any section regardless of role, rendering a blank pane; production is safe. | Use parseSection(section, data.role) in the preview. |
| P3 | #12 | Desktop CoachHelm reorder buttons are 30x30 and the sensitivity control 26px tall (fine for a pointer, but tight). | 32px minimum, or row drag with a keyboard fallback. |
| Owner | #6 | Two push models on phone: Settings keeps the tab bar (per the approved spec) while Roster’s profile is immersive. | B3. |

### P009 Qualifiers

| Sev | ID | Finding | Fix |
| --- | --- | --- | --- |
| P1 | D1 | “Live” is not guaranteed live: a realtime CHANNEL_ERROR goes to telemetry only, while Live badges keep showing. | Track channel state; show “Paused · standings from hh:mm” and Refresh when not SUBSCRIBED (B2). |
| P2 | D2 | Players with fewer rounds rank ahead of better-paced players (Luca 1/3 “Bubble” above Priya 2/3); the desktop board has no Avg or Thru. | Add Avg and Thru, note thin samples, gate Bubble (C2). |
| P2 | D3 | A qualifier shows Live a week after its end date. | After endDate: “Ended · n rounds outstanding”. |
| P2 | D4 | Phone leaderboard rows restate column labels (about 105pt each); the cut is on screen two. | Header once, 56pt rows (A1). |
| P2 | D5 | Touch targets: phone Manage selections, Edit and filter pills 36pt, Choose a player 30pt; desktop rows are clickable without a key handler. | 44pt minimum on phone; a 44pt chevron on coarse pointers. |
| P2 | D6 | Two h1s per screen across list, detail, selection and form. | PhoneBar heading: false when the page has its own h1. |
| P2 | D7 | Load-failure titles are red (ch-notice--danger), next to red under-par scores. Systemic. | Owner call (D-42). |
| P3 | D8 | Eyebrow counts repeat the filter pills; Selections repeats the board’s top four. | Drop eyebrow counts; Selections as margins (A2). |
| P3 | D9 | The failed-list eyebrow reads “— active · — concluded”. | Omit the eyebrow on failure. |
| P3 | D10 | Copy register: “format, stakes, vibe”; “No course set” reads as a problem when it is the default. | “format and stakes”; “Finley GC · the qualifier’s course”. |
| P3 | D11 | Dates repeat the year: “Sep 22, 2026 – Oct 1, 2026”. | Drop the year inside the current season. |
| P3 | D12 | The selection step strip looks like a segmented control; phone labels wrap. | A progress line with numbered nodes. |
| P3 | D13 | Fixture coherence: “7 of 7” vs 8 entrants; two different “Pinehurst qualifier” events. | Align fixtures; rename the travel event. |
| P3 | D14 | The “Active” section holds an “Upcoming” item. | “Upcoming and live”, or split the sections. |

### P010 Team Hub

| Sev | ID | Finding | Fix |
| --- | --- | --- | --- |
| P2 | D1 | A completed task strikes through its ring fraction (“6/6”). | Scope to the title: .ch-hb-task.is-done .ch-hb-task__t b. |
| P2 | D2 | The selected tab isn’t in the URL: reload, Back and shared links reset to Home. | history.replaceState with ?tab= (B2). |
| P2 | D3 | The coach Updates fixture carries player copy, so the preview misrepresents the coach feed. | Coach-shaped fixture rows; verify the real loader filters by role. |
| P2 | D4 | Travel repeats Departs and Stay, with two misaligned label grids. | Drop duplicate plan rows; one shared label column. |
| P2 | D5 | The all-failed page shows one notice plus four red section headings. | Ink titles with a muted “Not loaded”; the red notice once. |
| P2 | D6 | “New announcement” stays primary on every tab, even on the all-failed page. | The primary follows the tab (Plan a trip, Assign, Upload). |
| P2 | D7 | role="radio" groups have no arrow keys or roving tabindex. | Reuse the tabListKeys pattern. |
| P3 | D8 | The player card says “Needs your reply” for an acknowledgement. | “Needs your acknowledgement”. |
| P3 | D9 | RSVP rows state the date twice. | Time and place visible; full date in an sr-only span. |
| P3 | D10 | Desktop Announcements leaves about 30% of the canvas empty. | Read-receipt margin (A3), or centre the measure. |
| P3 | D11 | Stale serif-era tokens (--ch-font-serif, --ch-type-serif-*) are still used by hub heads. | Rename to --ch-type-display-*. |
| P3 | D12 | DESIGN.md says sections rise at first paint; the code and doctrine retired it. | Update the doc line. |
| P3 | D13 | Instrument Serif and JetBrains Mono are preloaded but unused on Clubhouse routes. | Scope those next/font instances; confirm in a production build. |
| P3 | D14 | The tab underline uses a tween; D-64 puts gliding indicators on springs. | chSpring('base', reduced). |

### P011 Rounds

| Sev | ID | Finding | Fix |
| --- | --- | --- | --- |
| P1 | D1 | The shot screen and setup aren’t immersive on phone: the root top bar and bell stay above the screen’s own bar (about 100pt of chrome on the course), against the spec. | Call usePhoneImmersive(true); verify on the live route. |
| P2 | D2 | A month’s “low” counts a nine-hole round (“low 38”). | Take low from 18-hole rounds; tag nine-hole rows. |
| P2 | D3 | The ribbon draws under-par bars green while every other under-par mark is red. | See A3. |
| P2 | D4 | The ribbon caption says shorter is better, but the −3 bar is the tallest. | “Above the line is over par; lower is better”. |
| P2 | D5 | Axis labels are about 2.9–3.2:1 and over-par bars about 1.8:1 against the paper. | Labels to --ch-ink-500; bars at 3:1 or more. |
| P2 | D6 | The “Round posted” and submit-failed overlays let the page read through (a 22% see-through scrim). | An opaque card on the scrim (B1); scrim alpha at least 0.94. |
| P2 | D7 | The submit overlay isn’t a dialog: focus isn’t moved or trapped, and the page behind isn’t inert. | Shared Modal, or inert on the route with the title focused. |
| P2 | D8 | The scorecard’s Score row is about 11px while Par and Putts are 14px. | The largest cell numeral role (A2). |
| P2 | D9 | Course touch targets under 44pt: 30x28 hole buttons, a 34x48 strip, a 36x36 Scorecard icon. | The whole cell as the button; 44pt minimum. |
| P2 | D10 | The phone scorecard scrolls sideways with no cue; Tot is off-screen. | A sticky first column and an edge fade (A2). |
| P2 | D11 | Heading structure: the shot screen has no h1, library and review have two, and setup’s h1 is a tagline. | One h1 per screen. |
| P2 | D12 | The scorecard “Missed” mark is about 1.6:1, and N/A reads as “_”. | Missed at 3:1 or more; N/A as “—”. |
| P2 | D13 | The AI recap contradicts its own screen (“the putter held steady” beside Putting −0.9). | Validate numbers and claims against SG facts (C2). |
| P3 | D14 | The recap uses a Sparkles icon. | A text label: “Written by CoachHelm”. |
| P3 | D15 | The hole strip shows scores where unplayed holes show numbers. | Number over score. |
| P3 | D16 | Course names are truncated by split(' ')[0] (“Carolina”). | A short-name field or a CSS ellipsis. |
| P3 | D17 | Desktop copy says “Tap a hole”. | “Select a hole” on pointer devices. |
| P3 | D18 | Nine-hole rows shift the desktop meters about 24px. | A fixed inline size for the score box. |
| P3 | D19 | Desktop book rows carry three raised tiles each; desktop is now cardier than phone. | Flush date and to-par, one inset (needs owner comparison). |
| P3 | D20 | Animations off doesn’t stop the submit spinner. | [data-motion='off'] .ch-rt-spin { animation: none }. |
| P3 | D21 | Unprefixed backdrop-filter with no reduced-transparency fallback on track surfaces. | Add the prefix and route through the shared glass token. |
| P3 | D22 | Fixture date coherence; the total-only state still shows SG and nine splits. | Pin the fixture clock; the total-only fixture drops SG. |
| P3 | D23 | The library error title is red (D-42). Systemic. | Owner call. |

### P012 Classes

| Sev | ID | Finding | Fix |
| --- | --- | --- | --- |
| P2 | D1 | Overlap-list swatches look like unchecked checkboxes. | A department chip or a round dot (A2). |
| P2 | D2 | Phone buttons are 36pt tall (Import, Add class, Delete all). | 44pt minimum on coarse pointers (shared Button). |
| P2 | D3 | Load-failure titles are red. Systemic. | Owner call. |
| P3 | D4 | A one-credit class becomes “E” in the term bar, which reads as even par. | Tone only; name it in the legend (A3). |
| P3 | D5 | The sync spinner ignores Animations off (--ch-dur-shimmer isn’t zeroed). | A [data-motion='off'] rule, or zero the token. |
| P3 | D6 | The empty-state copy overpromises: “we’ll add every class”. | “we’ll read it so you can check each class”. |
| P3 | D7 | 25 raised day keys on top of the cards: too cardy. | A1 (owner comparison). |
| P3 | D8 | Fixture incoherence: two different Pinehurst events. | Name the travel event “Pinehurst trip”. |
| P3 | D9 | The “This week” bracket and “Today” label collide on the term bar. | Stack the labels, or drop “This week”. |

### P013 CoachHelm

| Sev | ID | Finding | Fix |
| --- | --- | --- | --- |
| P0 | D1 | Phone Ask opens Evidence as two nested modal dialogs: an empty front sheet holds focus while the content sheet sits dimmed behind, with two closes (axe serious). | Render only the panel body inside Ask’s Modal. |
| P1 | D2 | The coach decision is below the fold: Assign at y=913 on 1440x900 and about y=1110 on phone. | A1. |
| P1 | D3 | The Ask desktop trend chart scales a 360x150 viewBox to about 650px, so axis text is about 20px and “Average 30%” collides with the line. | Size the viewBox to the container; offset the reference label. |
| P2 | D4 | Standing opens on “0 of 19” with three denominators, and calls the benchmark “field average” where Stats says “vs Tour” (Q-88). | Lead with most-to-gain; one denominator; one benchmark name. |
| P2 | D5 | Game profile shows “Wizard” for 44% scrambling; the live path withholds it. | Update the fixture to the live labels. |
| P2 | D6 | Deep dive repeats the drill text three times; sentences lack periods; header counts are unclear. | Drop the drill from the write-up; punctuate. |
| P2 | D7 | Ask fixture contradictions (24 vs 9 attempts; uphill vs level 81%). | Fix the fixture; assert the footer equals the listed total. |
| P2 | D8 | Two h1 on every phone CoachHelm page; skeletons have none; Standing heading order. | One h1; a hidden h1 in skeletons; rows as h3. |
| P2 | D9 | The Ask step toggle (30px) and ranked-list name links (20px) are under 44px. | A 44px ::after on both. |
| P2 | D10 | Proposed for you shows two filled Accept buttons above the green card. | Accept as secondary when there is more than one proposal. |
| P2 | D11 | Ask evidence nests a bordered ranked list inside a raised card. | Rows on rules inside the one card. |
| P3 | D12 | By player shows “0” for Theo beside a signal; a Title Case gauge label; “Eli· 1.1” spacing. | Hide zero counts; sentence-case generator labels. |
| P3 | D13 | Deep dive paints “E” on a mint tint; even is ink. | Ink E on a plain plate. |
| P3 | D14 | lib/fonts.ts still declares Instrument Serif. | Remove the serif face; check the production preload. |
| P3 | D15 | Dev console: “state update on a component that hasn’t mounted” on Game profile. | Trace the views-frame update. |

### P014 Recruiting

| Sev | ID | Finding | Fix |
| --- | --- | --- | --- |
| P2 | #1 | Add-form placeholders “NC” and “2028” read as real values. | “e.g. 2028” hints, or none. |
| P2 | #2 | The Add modal’s stage control leaves about 210px of dead well. | flex:1 per option, or size the track. |
| P2 | #3 | Delete is a permanently visible red link on desktop but inside Edit on phone. | An overflow menu on desktop. |
| P2 | #4 | “% of list” repeats four times; “Offered 0% of list” reads oddly. | Drop it, or fold it into proportional segments (A1). |
| P2 | #5 | The shared canopy header band leaves about 100px empty; the table starts at y≈540. | Tighten the canopy head on list pages (shared with P003 and P008). |
| P3 | #6 | “Only coaches see this page” is permanent reassurance copy. | Move it to the empty state and the privacy line. |
| P3 | #7 | The search placeholder omits “state”. | “Search name, town, state, email or notes”. |
| P3 | #8 | Phone detail: stage, Email and Call are three equal tiles. | Stage as a full-width row; two smaller contact actions. |
| P3 | #9 | Phone pipeline connectors stop about 4px short of the coins. | Run connectors edge to edge. |

### P015 Auth

| Sev | ID | Finding | Fix |
| --- | --- | --- | --- |
| P1 | D1 | The onboarding reading surface is translucent glass (0.9 alpha, blur 22px): trees and the flag pole show through the fields and password rules, with no fallback. | Make .ch-ox-stage opaque; keep glass for the step pill and mark only. |
| P2 | D2 | Sign in is disabled at rest (grey on grey) while Create account is enabled. | Enable it and validate on press (B1). |
| P2 | D3 | The refusal uses a pink box and rings both fields. | A flush notice; ring only the named field (A3). |
| P2 | D4 | Date formats disagree: the welcome uses the browser locale, Home a fixed en-GB. | One Clubhouse date formatter with an explicit locale. |
| P2 | D5 | The member seal reads “Member / 2026 / since”. | “Member since” on the top arc, 2026 in the centre. |
| P2 | D6 | The welcome card nests bordered, shadowed item cards. | Rows between hairlines; a flush notice for failure. |
| P2 | D7 | The password-strength meter is nearly invisible on the translucent stage. | A --ch-border-strong track and darker fills. |
| P2 | D8 | Onboarding desktop nests containers three deep. | Drop the green well. |
| P3 | D9 | The painted clubhouse closely evokes Augusta National’s (the rule is “inspired by only”). | An owner and legal glance. |
| P3 | D10 | The forgot form’s label and placeholder are both “Email”; phone sign-in uses placeholders as labels. | Placeholder “you@school.edu”; confirm accessible names. |
| P3 | D11 | “74 (+2)” uses parentheses unlike the rest of the app. | Match Home’s latest-rounds pattern. |
