# Acceptance: CoachHelm Ask redesign (lane 4)

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 71 rows, CP-1 to CP-71, plus per-PR and side-by-side additions).

> Wiring, 4 Nov 2026: see the section of that name at the end of this file (W-ASK-1 to W-ASK-28).

> Shared values (START_HERE): wherever this file says the Reduce Motion fade is 120ms, that is the design page's own fade. The build uses `CH_FADE_MS` from `lib/motion.ts` (180ms today, opacity only, linear), and the page behind a push moves 24% (`CH_UNDERLAY_SHIFT` 0.24). Clip checks compare against those values.

Design page: https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA (local `ask/redesign/coachhelm-ask.html`, identical to `ask/coachhelm-ask.html`) · Package: design-refresh/ask/ · Design page version 13 (3 Nov) · Status: plan ready, 17 draft PRs AK0 to AK12; behind `coachhelm_ask_v2` (off in production, preview and development); player Ask behind `coachhelm_player_ask_v1` on top of it, off everywhere; held migrations HM1 to HM5 written, never run

Shape: BUILD_CONTRACT_STANDARD.md "08-ACCEPTANCE.md". Part 1 is criteria per screen ID, Part 2 is per PR, Part 3 is the side-by-side check.

Sources, cited in brackets: P = `02-PLAN.md` (15:42 version; §18 corrections win over the design page), AR = `ASK_REDESIGN.md` (15:30), B = `01-BRIEF.md`, K = `../coachhelm/AGENT_KIT.md`, TF = `../coachhelm/TASK_FIELDS.md`, DP = the design page's CSS and flow scripts, CM = `capture/capture.mjs` registry, CT = `capture/contrast.py` run against the design page (table in `capture/contrast-table.txt`). Where `05-SCREENS.md`, `06-SCREEN-SPECS.md` or `07-MOTION.md` give a number, that number wins over the one here; this file says what passes, they say exactly how it looks and moves.

Decisions applied (Nick, 31 Oct):
- Announcements post when the coach presses Post, with an 8 second Undo. They are not saved as drafts. Players are told only after Undo closes. [B, P §2.1, K]
- Players compare against the PGA Tour and team averages only. No teammate dots, names or individual figures appear anywhere on the player side. Coaches see everyone. [B, P §13.1]
- Boards and polls are drafts in the Messages composer; Ask never sends a message. [P §14.3]

Calls settled by the Ask lane (Nick, 31 Oct: "Handle any other questions they have"). Each is a default Nick can flip:
- The drill flow is built but off until held HM5 gives `golf_drills` a `team_id` and a policy. (fixed 4 Nov: superseded by N-00 20261026010100; Ask's drill flow waits on that held migration).
- The lineup flow shows only with `golf_tournaments_v1` on. It sets the lineup with Undo, then offers Lock as its own card with no Undo.
- No Lift flow until Lift has a team table.
- Request more follows `HELM_CUSTOMER_EMAIL_ENABLED`: with it on, the mail goes after Undo closes; with it off, the request is logged in `ask_credit_requests` and no email goes.

Shared criteria are referenced, not restated. Numbering is SHARED-1 to SHARED-12 as in `ACCEPTANCE-SHARED.md` at the package root.

Screen IDs and motion IDs are the ones in the capture registry (CM), used exactly. IDs marked "not drawn" have no design frame (CM `nd`); they are checked in the app against the rule given here. App route: `/clubhouse-preview/coachhelm-ask-v2?id=<ID>&scene=<play>&stage=<stage>&viewer=coach|player[&answers=..][&state=..][&text=xxl]` (02 §3, CM), which sets `data-ch-ak-ready="1"` on `<html>` once settled. Capture states: default 390 × 844, w430 430 × 932, desktop 1440 × 900, desktop-1280 1280 × 800, xxl (`--k` 1.353), reduce, long, loading, empty, failed, many, one, stale. [CM]

CSS prefix `.ch-ak-`, every rule in `styles/coachhelm-ask-v2.css` scoped under `.ch-ask[data-v2]`. Pixel values below are CSS px at 1×, equal to pt on the phone frame. Values given as `n × k` scale with Text Size.

## Part 1. Criteria per screen ID

### Corrections the build applies over the design page
The design page from version 12 already shows every item below. They stay listed because the plan found them in the code, and each is checked on every ID it touches.
1. Announcement urgency is Normal or Urgent. No "Important" option, label, banner text or read detail ("Travel posts went out as Important" changes to name Normal or Urgent). [P §18.8, TF §5.3]
2. Every announcement pushes, and emails while `HELM_CUSTOMER_EMAIL_ENABLED` is true, whatever its urgency. The lock preview never shows "No push. It waits in Messages." [P §18.8]
3. No scheduled send and no trip link on announcements: no "When should it go?" question, no "Tomorrow at 8 AM" option, no "Schedule it" button, no "Scheduling…" state, no "Linked to the Hargrove trip" pill, no "linked it to the trip" lead. [P §18.8, §14.2]
4. Announcement recipients are players only: "7 players", never "7 players and 2 coaches". [P §18.8]
5. Putting band copy reads "3 to 5 ft" (Stats buckets 0-3, 3-5, 5-10, 10-15, 15-25, 25+); "3 to 6 ft" appears nowhere. [P §18.6]
6. Strokes gained axis and legend read "0 = scoring baseline"; "0 = team average" and "Baseline: Team average" appear nowhere. [P §18.7]
7. Lineup lands "Lineup set". Lock is a second confirm card with no Undo, and the first card neither says "locks" nor uses "Lock the lineup" as its button. [P §18.2, §14.4]
8. Round note: no "Share it with Theo now?" question and no private option; the note appends below the existing note and Undo restores the old text. [P §18.10, §14.1]
9. Qualifier: no exemption question and no tie rule; it asks rounds, squad size and coach's picks. [P §18.11, §14.2]
10. Event: no per-event reminder pill or field ("Reminder 1 hour before" is removed; the team setting applies). [P §14.1, §18.11]
11. No Lift flow anywhere. [P §2.7]

### S-ASK (coach Ask, phone and desktop shell)
Design: CoachHelm section switcher then Ask (phone); sidebar CoachHelm then Ask (desktop). States drawn: default, long, xxl, reduce, w430, desktop, desktop-1280, empty.
1. Route is reached from the CoachHelm switcher; switcher row padding 12/16/8, two equal columns, labels 15pt, padding 8. [DP `.pseg`]
2. Green phone bar, desktop sidebar and glass top bar are the existing components, untouched (`shell/*`, `ui/PhoneBar.tsx` not in the diff). [P §1; SHARED-1]
3. Root carries `.ch-ask[data-v2]`; with `coachhelm_ask_v2` off the root has no `data-v2` and no `.ch-ak-` rule matches. [P §3]
4. The client never reads the flag; `v2` arrives as a prop from `routes/coachhelm.tsx` (server only). [P §3]
5. Empty state (no turns): greeting and composer only, no placeholder card. Text on page: body 15.10 / 16.01, secondary 8.64 / 11.45, tertiary 5.85 / 7.80 (light / dark). [CT]

### S-ASK.flag-off (not drawn)
1. With both flags off, the Ask route, the stream route and `buildCoachTools` output are byte-identical to 75b4956 on the existing fixtures; the tool set keys equal today's 17 reads, `show_visual` and four writes. [P §3]
2. Root snapshot keeps `data-ch-code="CH-13820"` and today's class list. [P §3]
3. Playwright flag-off parity: zero pixel difference against today's Ask states. [P §15]
4. Fairway's chat: the tool set built with `askV2` false has today's keys; Fairway's `CompositionVisual.tsx` ignores a v2 block. [P §9.2, §17.1]

### S-ASK.loading and S-ASK.error (not drawn)
1. Loading shows the shell and composer with no step rows; no step row exists before its `data-progress` part arrives. [P §4]
2. A stream failure or team load failure uses a new CH-139xx code; no today's code is reused. [P §3]
3. Failure colour is amber (`--ch-loss`), never red. [P hard rules]

### S-ASK.scope
1. Phone only, above the thread: "Reading Varsity · last 30 days" form; it changes when a question is sent. [AR §3.8, CM]
2. Scope chips in the composer: 13pt 600, ink2 on well, radius 7, padding 3/8, ring 1px. Secondary on well 8.96 / 10.87. [DP `.cbox .scope`, CT]

### S-ASK.composer, .typing, .busy
1. Glass: `backdrop-filter: blur(24px) saturate(170%)`, radius 24 (fixed 4 Nov: 26, as 06 E-COMP; 06 wins over 08 on numbers), padding 8/8/8/14, gap 4, float shadow token. [DP `.cbox`, AR §3.14]
2. Input 16 × k; placeholder ink3 on glass 6.39 / 6.96; typed text ink 16.50 / 14.28; caret 2px accent, blink 1s steps(1). [DP, CT]
3. Buttons 38 × 38 circles, glyph 20. Send uses `--btn` with `--onbtn` (8.15 / 9.44). [DP, CT]
4. Busy: send becomes Stop (ink fill, card glyph) while steps run. [DP `.send.stop`, CM]
5. Pressing Stop marks the active step with a dash and prints "Stopped. Nothing was saved." (see S-ASK.steps.stopped). [P §4]

### S-ASK.composer.at-menu and S-ASK.composer.slash-menu (board frames)
1. @ lists players, rounds, events, qualifiers, documents; a pick pins the id into the request. [AR §3.8]
2. / lists /plan, /lineup, /recap, /compare. [AR §3.8]
3. On the player side the @ menu lists no teammates (SHARED-11).

### S-ASK.composer.add-menu (not drawn)
1. Opens from +; holds no write action that skips a confirm card. [P hard rules]

### S-ASK.composer.paused (player)
See S-ASK.player.out.

### S-ASK.history (desktop rail), S-ASK.history.sheet (phone, 74%, not drawn)
1. Desktop: always in the left rail; phone: sheet at 74% of the screen from the chat title or history button. [CM]
2. History rows: body on page 15.10 / 16.01; "Today" tertiary 5.85 / 7.80. [CT]
3. Player Ask without HM3 hides history (new chat each visit). [P §13.1]

### S-ASK.knows (desktop), S-ASK.knows.edit (phone 90%, not drawn), S-ASK.settings.sheet (phone 62%, not drawn)
1. Desktop shows the list at the bottom of the history rail ("Practice runs 2h 30m on weekdays", "Team goal: under +2 a round by spring", "Edit what it knows"); phone shows it in the settings sheet at 62%, edit at 90%. [P §11, CM]
2. Each fact is at most 280 characters, coach-written, saved only by the `saveCoachFact` server action; no chat turn creates a fact row (DB assertion). [P §11]
3. Hidden until HM2 is applied (column check). [P §11]

### S-ASK.tone, .tone.detailed, .tone.team-talk (board frames)
1. Three values: Straight (default), Detailed, Team talk; stored as `straight | detailed | team_talk`. [P §11]
2. The same fixture question in all three tones returns identical tool calls, figures and chips. [P §11]
3. Hidden until HM2; tone defaults to Straight. [P §11]
4. Segmented on label #F7F4EA on #155A39 7.47, on #1d6a45 5.96. [CT]

### S-ASK.turn.user
1. User bubble aligned right, max width 84%, padding 10/15, radius 20/20/6/20, text 16 × k, line height 1.4, sent gradient. [DP `.msg-u`]
2. Text on bubble: top of gradient 7.47 / 8.20, bottom 9.36 / 10.25. [CT]
3. Lands with M-ASK-02. [DP motion table]

### S-ASK.turn.answer, S-ASK.answer.putts, .answer.jonah, .answer.trend, S-ASK.hypothesis
1. One answer card per assistant turn: radius 22, padding 16/18/14, inner gap 14, `filter: var(--shadow-recv)` (Messages receive shadow) and no box-shadow; 22 between turns. [DP `.msg-a`, AR §3.14]
2. The card holds steps, prose, visuals and sources; follow-ups sit under it, outside the card. [P §4]
3. No elapsed timer and no percentage in v2 (DOM). [P §4]
4. Every figure in prose comes from a read envelope; a digit the model writes on its own is refused by the existing compile path. [P §6]
5. putts scene asks "Why are we missing so many short putts lately?"; jonah scene "Where is Jonah losing strokes?"; trend scene "How are we scoring this fall compared to last fall?". [CM]
6. putts scene shows three chips in order "Putts · 30 days", "Putts · season", "By player" and "3 reads". [P §5]
7. jonah scene's step detail "Approach is his open root cause" comes from the fixture insight via `get_root_causes`, which records no `coach_feed` exposure (spy). [P §10]
8. Hypothesis tag: accent on accent tint over card 6.96 / 6.39. [CT]

### S-ASK.steps, .steps.folded, .steps.open, .steps.waiting, .steps.failed, .steps.next, .steps.stopped
1. Steps sit inside the answer card with no card of their own; one row per announced step only. [AR §3.1, P §4]
2. Row: grid 20px icon column plus text, gap 10, min height 32, padding 6/0. Icon box 20 × 20; running glyph 18; done check 14. [DP `.step`, K]
3. Label 15pt ink; detail 14pt ink2. Done row: label ink2 (9.77 / 10.25), detail ink3 (6.61 / 6.99). [DP, CT]
4. Running: 8pt dot breathing 1.0 to 0.6 every 1.2s; label shimmer 1.9s. [K, DP]
5. Done: check draws in 240ms; label switches to the past-tense `PROGRESS_DONE` text ("Read the roster"); detail is one fact from the envelope's own counts ("38 rounds so far"), never a number not in the envelope. [P §4, AR §3.1]
6. Every tool in the set has a done label; no done label carries a digit unless it comes from the envelope (test). A raw tool name never reaches the screen. [P §4]
7. Failed: amber ring with a bar (failed step ring 5.57 / 8.53), never red; the turn continues and no second error message is added. [P §4, CT]
8. Waiting (turn stops at Confirm): "Waiting for you" row with an accent ring. [P §4]
9. Next (announced, not started): row present with no check and no shimmer. [CM]
10. Folded: when the answer lands the list folds to "{n} steps · {s}s" ("4 steps · 3s") with a 16pt chevron, summary 15pt ink2 with the count in ink 600; collapse 360ms. [P §4, DP `.work .sum`, K, 07]
11. Open: tap the folded line; chevron rotates 180° in 260ms; body opens on `grid-template-rows` in 360ms. [DP]
12. Stopped (not drawn): Stop marks the active row with a dash and prints "Stopped. Nothing was saved."; no write runs. [P §4]
13. `aria-live` only on the live list; a step change is announced once. [P §4, §15]
14. The progress part id stays stable across the approval continuation (two-request turn test). [P §4]

### S-ASK.toolcard.skeleton, .putt-profile, .sg, .miss-pattern, .season, .hole-strip, .ask-about, .expanded
1. Visual card: radius 16, header padding 14/16/10, title 17 × k 600 line height 1.25, subline 14 ink2; expand button 32 × 32 radius 9 on well; body padding 12/16/6; footer 14pt ink2 padding 10/16/14. [DP `.vcard`]
2. Skeleton is shaped by the block types in the partial input (headline, kpis, trend, bars, split, compare, note, miss_pattern, putt_profile, season_compare, hole_strip); a refused visual fades the skeleton out. [P §6]
3. Skeleton crossfades to the chart in 260ms; marks grow 360ms once on first view; scrolling off and back does not replay (Playwright). [AR §3.2, P §6]
4. putt-profile: make rate by Stats bucket with the season tick; band labels per Corrections 5. [P §9.2, §18.6]
5. sg: axis reads "0 = scoring baseline" (Corrections 6). [P §18.7]
6. miss-pattern: 8 wedges plus dots by distance left from the 64-shot fixture; no map position; shots with no miss logged counted separately. [P §9]
7. season: this season against last season's band (mean plus or minus one standard deviation; method in the envelope note). [P §10]
8. hole-strip: red (`flag` token) only on under-par holes; amber never used for over par on this block. Under par red mark 6.48 / 7.06. [P §10, CT]
9. Chart marks reach 3:1: loss fill on track 3.15 / 5.52, gain fill on track 5.15 / 4.50, neutral on track 4.49 / 4.86, zero rule 6.61 / 6.99. [CT]
10. ask-about: every bar and dot is a button; tap fills the composer with "Ask about this: {label}" and does not send. [P §6]
11. expanded (full sheet, not drawn): opens from the expand button; same figures as the card.
12. Every figure on a block traces to a `03-DATA-CHECKS.md` DERIVE row with its query named. [P §9]

### S-ASK.readchip, .readchip.popover, S-ASK.sources, .sources.open
1. Chip after the sentence it supports: 13pt 600, padding 4/8, radius 99, well fill with 1px ring, icon 12, margin-left 4; on and hover: accent on accent tint (6.96 / 6.39). Off: secondary on well 8.96 / 10.87. [DP `.cite`, CT]
2. Chip label is read plus window ("Putts · 30 days") built from envelope `measurements[].window_start/end`, never a footnote number. [P §5]
3. Popover rows: read name, window, sample, computed time, "Open in Stats"; no string in the popover that is not in the envelope or the fixed labels (DOM test). Keyboard opens it and focus returns to the chip on close. [P §5]
4. `[eN]` markers are stripped before the claim audit and before persisting `content`; an unknown ref (`[e9]` with two reads) draws no chip and leaves the audit result unchanged. [P §5]
5. Sources: "{n} reads" 14pt ink2 with a stack of 20pt discs overlapping 6, 2px page border; opens a well listing every read of the turn. [DP `.srcs`, P §5]

### S-ASK.followups
1. At most three chips from `followUpsFor`, together, under the card; chip radius 99, padding 8/14, 15 × k 500, gap 8; press scale 0.97. [P §6, DP `.chip`]
2. Enter together in 260ms (M-ASK-25). [AR §3.7]

### S-ASK.flow.plan.reads, S-ASK.brief.q1 to .q4, .brief.free, .brief.folded, .brief.skip, .brief.change (not drawn), S-ASK.flow.plan.drafting
1. Started by "Build Tuesday's practice" or /plan. No plan is drafted before the brief. [AR §3.11, CM]
2. Up to four questions, one at a time: length (default from the free calendar window), what to work on (multi-select, options tagged "Focus area" or "Slipped this month"), how to split the team, where plus a free "Anything else?" line. Each option names its source. [AR §3.11, P §12]
3. Never asks what a read answered (TF rule 3). [P §12]
4. Question card: header padding 13/16/11 with a 0.5px hairline, icon 30 radius 9 on accent tint, title 15 600, small 13 500. Dots show progress; Back works and is disabled (40%, exempt) on question 1. [DP `.qcard`, CT]
5. "Skip, just build" takes every default. [AR §3.11]
6. Last Next folds the card to answer pills with "Change answers"; only then do drafting steps run. [AR §3.11]
7. Picked option: ink on accent tint 14.57 / 10.83. [CT]

### S-ASK.artifact.card, .artifact.card.saved
1. Grid 44 / 1fr / auto, gap 12, radius 16, padding 12/12/12/14; tile 44 × 52 radius 9 on well; title 16 600; meta 14 ink2; Open 14 600 accent on accent tint, padding 6/10, radius 8; press 0.97. [DP `.acard`]
2. While writing, the tile scans (1.1s linear loop). [DP]
3. `data-artifact` carries a version; an old message opens its old version. Kinds: `practice_plan | player_report | lineup | round_recap`. [P §8]
4. card.saved shows the location chip after Save. [AR §3.12]

### S-ASK.artifact.pane (desktop), S-ASK.artifact.push (phone), .artifact.versions, .artifact.why-popover, .artifact.edit (toast)
1. Desktop: right pane widens to 452 on the smooth spring (462ms); the chat stays usable beside it. [AR §3.5, P §8]
2. Pane header: title, meta, "1 of 3" version arrows, close; footer: Edit in builder, Save draft…, Publish…. [P §8]
3. Phone: pushed screen under the green bar with "‹ Ask" (`PhoneTop back title`), not a sheet; glass dock with Save draft… and Publish…; back keeps the thread scroll. [P §8]
4. practice_plan renders lane 6's printed page component (imported, not copied); it stays light in dark mode. Until it lands AK5 is not done. [P §8]
5. Why chip opens a popover (coach copy only). Edit in builder shows a toast on desktop. [AR §3.5, CM]
6. Save draft… and Publish… show "Comes with the practice builder" and make no network call until N-00 and N-10 are applied and on. [P §12] (fixed 4 Nov: "Comes with the Practice tab", until N-00 is applied and `golf_practice_plans` is on; N-10 is not needed, folders are names.)

### S-ASK.save, .save.folder-list, .save.new-folder, .save.confirm, .save.commit, .save.receipt, .save.told, .save.undone, .save.cancelled
1. Save card docks above the artifact footer: thumbnail, then "Save to [Practice plans ⌄]" defaulting to the last folder used with its count. [AR §3.12]
2. Folder list opens in place inside the card in 360ms: folders with counts, a check on the chosen one, then New folder; folder document rows in ink2 at full opacity, icon at 70% (9.77 light, 10.25 dark, see Contrast). [AR §3.12, CT]
3. New folder becomes a name field with Create; Enter creates, Escape closes; the new folder appears at the top already chosen and the "On save" line names it. [AR §3.12] (fixed 4 Nov: Create writes nothing; the name, 1 to 60 characters trimmed, is held in the card and becomes the `golf_documents.folder` value on Save, practice-plan default 1. A name that matches an existing folder ignoring case and spaces picks that folder.)
4. Primary names the target ("Save to November"). [AR §3.12]
5. Receipt "Plan saved · Documents · November" with 8s Undo; the Draft chip springs to Saved. [AR §3.12]
6. Told: "Only you can see it. Players are told when you publish." [AR §3.12]
7. Nothing in `golf_documents` before the Save press and nothing after Undo; Undo also leaves no folder made here (Undo window rules). [P §12] (fixed 4 Nov: Save writes at once through `savePracticePlanDraft` and Undo calls `undoPracticePlanDraft`, not the HM1 hold; a folder is only a name, so after Undo the name is gone from the list because no row names it.)
8. Saves only on tap. [AR §6]

### S-ASK.publish (90% sheet), .publish.commit, .publish.receipt, .publish.told, .publish.undone, .publish.cancelled
1. Publish… opens the kit confirm in a 90% sheet; primary "Publish to 7 players". [P §12, CM]
2. Receipt fans the plan out to 7 player avatars plus a copy into Practice plans; badges show a document while Undo runs and turn to checks once players are told. [AR §3.13]
3. Undo inside 8s: no published plan, no Practice plans copy, nobody told. [P §12] (fixed 4 Nov: to match the practice-plan lane, Publish files at once and defers only the push, bell and chat post; Undo inside 8s takes the plan back to a draft, the Documents row is `is_public` false so no player can see it, the receipt reads "Taken back. Nobody was told.", and the notification spies see zero calls.)

### S-ASK.flow.plan.draft, .confirm, .commit, .receipt, .told, .undone, .cancelled
1. (fixed 4 Nov: event first, see CP-74) When the plan's day has no practice event, before Save the thread offers the practice event; the draft is the real event chip with its date block on a mini week. [AR §3.6, CM]
2. On confirm line names who is told and when ("7 players get an invite once Undo closes"); Cancel left, "Add to calendar" right. [AR §3.6]
3. Receipt line "Added to calendar · Tue Nov 3, 3:00 PM", Open, Undo. [AR §3.6]
4. Nothing in `golf_events` before the press; Undo inside 8s leaves no row and no invite. [P §7]

### S-ASK.moment.cal.*, .moment.fold.*, .moment.focus.*, .moment.pub.* (board frames: draft, confirm, receipt, told)
1. Calendar: real week grid with existing events; the open slot pulses; the draft flies into it; invites go after Undo with a check per avatar. [AR §3.13]
2. Focus: the player card with current focus areas; the new chip flies into the empty slot and the avatar pings. Nothing in `golf_player_focus_areas` before the press. [AR §3.13, P §7]
3. Folder: the inline Save row from S-ASK.save. Publish: as S-ASK.publish. [AR §3.13]
4. The stage bar (Draft, Confirm, Adding, Receipt, Invites) is design-page only and absent from the app DOM. [AR §3.13]

### Kit pieces on every confirm (S-ASK.flow.*.draft, .confirm, .commit; S-ASK.save.confirm; S-ASK.publish; S-ASK.player.request)
1. Confirm card: radius 16; header padding 14/16/10, icon 32 radius 9 on accent tint, title 16 600, subline 14 ink2; fields padding 4/16. [DP `.conf`]
2. Fields fill one at a time in 260ms each behind a green write head; an unfilled field shows a 12pt-tall skeleton bar at 60% width, radius 6; optional gaps read "Not set". [K, DP `.fld`, P §7]
3. "On confirm:" line names exactly who is told and when. [K, AR §3.15]
4. Buttons row padding 12/16/14, gap 8: Cancel left (15pt 500 ink2, padding 9/10), verb plus object primary right. [DP]
5. Both buttons lock after the first tap; Cancel shows disabled at 50% (exempt). A second tap does nothing (UI test). [P §7, CT]
6. Commit: primary becomes an "Adding…" capsule (verb per flow: "Posting…", "Setting…", "Saving…"), radius 99, accent on accent tint (6.96 / 6.39), padding 9/18, with a 2px sweep bar 40% wide on a 900ms linear loop. [DP, K, CT]
7. Nothing is written before the named confirm button is pressed; no new tool runs `execute` without approval (`agent-tools.confirm-gate.test.ts`). [P §7]

### Receipt, Undo window and Told (every S-ASK.*.receipt, .undone, .told, .cancelled; S-ASK.kit.failed, .kit.partial, .kit.reloaded)
1. Receipt: 22pt accent check disc, 13pt glyph drawing in 240ms after a 100ms delay; a 2px accent ring expands over 620ms; line 15pt 600; sub 14 ink2; Open 14pt 600 accent. Edge flash 900ms; Draft chip springs to the flow's done word. [DP `.receipt`, K]
2. Undo: 20pt ring glyph, accent drain (8.15 / 8.45) over the track, circumference 63, draining linearly over exactly 8000ms (clip: ring empty at 8000 ± 50ms after the receipt's `in` class). [DP, K, CT]
3. At 8000ms the Undo control fades out and takes no pointer events. [DP `.undo.gone`]
4. Server: confirm writes one `golf_coachhelm_action_runs` row `held` with `run_at = now + 8s` and returns at once; no domain row exists during the window (DB assertion per flow). [P §7, TF §3]
5. Undo at t < 8000ms calls `DELETE /api/coachhelm/v3/chat/actions/[key]`: the row goes `held` to `cancelled` only while `run_at > now()`; the action mock is never called; no domain row is ever written; nobody is told. A cancel after `run_at` is refused. [P §7]
6. Notification spies (`sendBulkPushNotification`, `notifyTeamAnnouncement`, the bell insert, email) see zero calls during the window and one batch after it; after Undo they see zero calls in total. [P §7]
7. Release runs from `after()` only if the row is still `held` (atomic update returning); release and the sweeper racing run it once (idempotency key). [P §7]
8. Open inside the window commits early (`POST ?now=1`): the write runs at once and the Told row follows the commit, not the 8s mark. [P §7]
9. Closing the app does not cancel: a page closed at t = 3s still has its row written by t ≥ 8s (or on the next chat request via `sweepHeld`). [P §7]
10. Reload during the window shows the held receipt with the remaining ring (reload at t = 3s shows 5s ± 250ms left); reload after shows the durable receipt with no Undo (S-ASK.kit.reloaded). [P §7]
11. Told appears only after the window: coins 22pt overlapping 5, initials 10pt 700 on the player fills (5.47 to 6.30); unlit coins at 35% opacity, saturate 0.3, lighting over 200ms, one every 90ms in arrival order; seen dot 9pt gain fill with a 2px well ring, popping on the pop spring in 300ms. "Seen by" appears only where a table records it. [DP `.told`, K, CT, P §7]
12. Undone: receipt line switches to ink2 500 with the flow's undone copy. [DP `.receipt.undone`]
13. Cancelled: the draft greys with `saturate(0)` at full opacity (text keeps its ratios, 8.97 / 10.86) and nothing is sent or written. [K, Contrast 2]
14. Failed and partial (not drawn): today's copy, amber, never red; a partial multi-row write lists what landed. [P §7]
15. Until HM1 is applied (`42703` on `run_at`), Ask falls back to today's immediate write with today's ActionCard and shows no Undo at all. [P §7]
16. Reduce Motion: no flight, 120ms crossfades, all coins at once; the Undo ring still runs its full 8000ms. [DP motion table]

### Create flows, common shape (every S-ASK.flow.f_*.<stage>)
1. reads: steps with past-tense lines. [AR §3.15]
2. worked: a row of Worked out pills, each naming its source ("Wed Nov 4 · 4:00 PM · Calendar and classes"); pill title 13.5pt 600 ink, source 11.5pt ink3; tap a pill to change it (press 0.97). [AR §3.15, DP `.ipl`]
3. brief, brief-2, brief-3, brief-free: only what Ask could not work out, one to three questions, defaults from reads, "Skip, use my picks". [AR §3.15]
4. folded: answers fold to pills. draft: the flow's own visual builds, then the kit fill. confirm, commit, receipt, told, undone, cancelled: as the kit sections above. [AR §3.15]
5. Each create tool re-checks `team_id` at execute time and resolves names only by roster id. [P §14]
6. Joined to `CONFIRM_REQUIRED_TOOLS` only under `askV2`. [P §14.1]

### S-ASK.flow.f_event.* (Event)
1. Asks "Who is it for?" (Whole team, All 7 players; Seniors only, Josie and Sam) and "Where?" (Clubhouse film room; On the range; Video call). [DP]
2. Worked out: "Wed Nov 4 · 4:00 PM · Calendar and classes", "45 minutes · Your usual meeting"; no reminder pill (Corrections 10). [DP, P §14.1]
3. Draft: week grid, Wednesday slot at 4:00; detail rows "Team meeting · before the qualifier", "4:00 to 4:45 PM", place, "7 players · RSVP on". [DP]
4. On confirm: "7 players get an invite once Undo closes. Nothing else is sent." (seniors variant: "Josie and Sam get an invite…", S-ASK.flow.f_event.confirm.seniors); button "Add to calendar". [DP]
5. `createGolfEvent` always sends `allDay` and the offset; time in the team zone. [P §14.1]
6. Undone: "Undone. The meeting was removed."; no `golf_events` row, no invite. [DP, P §7]

### S-ASK.flow.f_annc.* (Announcement)
1. Worked out: "Title: Bus to Hargrove · Your words", "7 players · Roster". No trip pill. [DP, Corrections 3, 4]
2. Questions: "How urgent is it?" with exactly two options, Normal ("Push when they are free") and Urgent ("Push right away, even in class"); "Ask them to tap Got it?" (Yes, ask for Got it; No). No third question. S-ASK.flow.f_annc.brief-3, .confirm.later and .told.later are retired: absent in the app and listed in Part 3 as "can't match as drawn: removed by decision". [P §14.2, §18.8]
3. Fields: title at most 120 characters, body at most 2000; urgency sent only as `normal` or `urgent`, never `high` or `low`; no `publish_at`; recipients are roster ids. [TF §5.3, P §7]
4. Draft visual: lock screen preview; the banner (radius 16, padding 9/11, ivory at 90% over the frame, blur 10) drops from 26px above with scale 0.96 to 1 on the pop spring, 200ms after the card lands. The banner shows for Normal and Urgent alike, labelled "Announcement · now" or "Urgent · now". [DP, Corrections 2]
5. Lock banner text: title 13.81 / 13.52, meta 7.91 / 7.74. The Urgent label is #8A4C00 on the 90% ivory banner, 6.41 light and 5.41 dark (raised from #9A5700 in version 12). [CT]
6. "Also emailed to 7 players" shows for every urgency while `HELM_CUSTOMER_EMAIL_ENABLED` is true and is absent when it is false. [P §7, §18.8]
7. The card shows the message word for word ("Bus leaves the Clubhouse lot Sunday at 7:00 AM. Bags at the vans by 6:45."). [P §7, DP]
8. On confirm names the post, push and email for 7 players and when ("once Undo closes"); the email clause follows the switch; it never names coaches. [P §7, Corrections 4]
9. Button "Post to 7 players" ({n} from the recipients); never "Schedule it". [P §7]
10. Commit capsule "Posting…"; receipt "Posted · Bus to Hargrove", sub "Players are told when Undo closes", after "Posted to Announcements", Open, Undo 8s. [DP]
11. Home mock: the new row at the top of Announcements ("Just now · Urgent" or "· Normal", "Got it 0 of 7"); older rows rise 50ms apart. [DP]
12. Undone: "Undone. Nothing was posted."; no `golf_announcements` row exists; no bell, push or email was sent (spies at zero). [P §7, DP]
13. Told after 8000ms: "7 players got it on their phones", coins 90ms apart in arrival order, then "Seen by 4. 2 tapped Got it." (with Got it) or "Seen by 4." (without); the home row ticks to "Got it 2 of 7" with a 0.85 to 1 pop. Counts come from `notifications` and `golf_announcement_acknowledgements` only. [DP, P §7]
14. Reduce Motion: banner and post appear in place with a 120ms fade. [DP]

### S-ASK.flow.f_travel.*
1. Asks how you get there (S-ASK.flow.f_travel.confirm.fly), room pairing (.rooms-mine), uniform; worked out: leave time from the first tee time ("Leave Sun Nov 8 · 7:00 AM · Tee times") only with `golf_tournaments_v1` on, else asked. .confirm.by-tee-time covers pairing by tee time. [DP, P §14.2]
2. On confirm: "7 players and 2 coaches see the trip in Hub once Undo closes. Rooms show only to the players in them."; button "Add the trip". [DP]
3. Writes through `createGolfTravelItinerary` with `room_assignments` json, `gear_list` array, `uniform_requirements` text. Undone: "Undone. The trip was removed." [P §14.2, DP]

### S-ASK.flow.f_board.* and S-ASK.flow.f_poll.* (drafts only)
1. Board asks what it should show (.confirm.four-tiles) and whether to add a note (.confirm.no-note, .brief-free); poll asks which nights (.confirm.four-nights) and when it closes (.confirm.leave-open). [DP, CM]
2. On confirm: board "Nothing is sent. The board goes into your message to Jonah, and you send it from Messages."; poll "Nothing is posted. The poll goes into the team chat composer, and you send it."; button "Open in Messages". [DP]
3. Receipt says "Nothing is sent until you tap Send"; the composer holds the draft. [P §14]
4. No call to `sendGolfPoll`, `sendMessage` or any `golf_messages` insert from Ask code (spy and grep); neither tool is in `CONFIRM_REQUIRED_TOOLS`; the result is a prefill href in sessionStorage. [P §14.3]
5. Undone removes the draft from the prefill: board "Undone. The board is out of the message."; poll "Undone. The poll is out of the composer." No told row with coins (nothing was sent). [DP]
6. Poll flow stays off until held `20261028140800` is applied. [P §14.3]

### S-ASK.flow.f_qual.*
1. Asks one question, how many rounds (.confirm.three-rounds, .confirm.one-round). Squad size (`selection_slots_total`, 5 from the entry) and coach's picks (`selection_slots_coach_pick`, none) are worked out and shown on the draft, not asked. No exemption question and no tie rule; the page no longer draws .brief-2 ("Is anyone exempt?") or .confirm.exempt. Worked out shows "All 7 players · Roster"; the draft's detail line reads "5 spots · top 5 by total". [P §14.2, Corrections 9]
2. On confirm: "7 players get it on their calendar once Undo closes."; button "Create qualifier". Undone: "Undone. The qualifier was removed." [DP]

### S-ASK.flow.f_lineup.*
1. Registered only with `golf_tournaments_v1` on; absent otherwise. [P §14.4]
2. The only question is the tie for spot 5 (.confirm.ana, .confirm.playoff); tied rows wobble in amber until the coach picks. [AR §3.15, DP]
3. Calls `golf_tournament_set_entries`; receipt reads "Lineup set" with 8s Undo, which restores the previous entries. [P §14.4]
4. The first card's button reads "Set the lineup"; capsule "Setting…"; receipt "Lineup set · Hargrove round 1", sub "Players are told when Undo closes", after "Set for round 1. Not locked yet". [DP]
5. Lock is a second card (S-ASK.flow.f_lineup.lock) that rises only after Told: icon tile 28 radius 8 on track, title "Lock the lineup for round 1?" 15pt 600, sub "Locking can't be undone. Scores then count for these five." 13pt ink2, buttons "Not yet" and "Lock lineup" (primary, right). Card radius 22, padding 14/16, gap 12, 12 above. [DP `.lockask`]
6. Lock lineup calls `golf_tournament_lock_lineup(p_id)` once. The button becomes the "Locking…" capsule; on success each seated row gets its lock (pop, slight turn) 70ms apart, then the receipt "Lineup locked · round 1" with sub "Locked for good. There is no Undo." (S-ASK.flow.f_lineup.locked). No Undo ring anywhere on this card. [P §14.4, DP, Corrections 7]
7. Not yet (S-ASK.flow.f_lineup.not-locked) replaces the buttons with "Not locked. Lock it from the lineup any time." and calls nothing. [DP]
8. A failed lock keeps the card, puts the capsule back to "Lock lineup" and shows the kit failed line in amber; no seat shows a lock. [K]

### S-ASK.flow.f_task.*
1. Asks reminder time (.confirm.no-reminder) and repeat (.confirm.weekly); priority only `low | normal | high`; reminder via `golf_task_reminders`. [DP, P §14.1]
2. On confirm: "Eli and Theo see it on their Home once Undo closes."; button "Assign to 2 players". Undone: "Undone. The task was removed." [DP]

### S-ASK.flow.f_goal.*
1. Asks how far and by when (.confirm.stretch) and whether the player accepts (.confirm.just-set, .told.just-set), mapped to `coach_assignment_mode` mandatory or suggested; eight stats only. [P §14.2]
2. On confirm: "Jonah gets it to accept once Undo closes. It shows on his Home when he does." or "It shows on Jonah's Home once Undo closes."; button "Set the goal"; capsule "Setting…"; receipt "Goal set · Jonah · approach". [DP]
3. Undone: "Undone. The goal was removed." [DP]

### S-ASK.flow.f_note.*
1. No question at all. The note is always shared; .brief (as drawn), .confirm.private and .told.private are retired, and the page no longer draws them. [P §14.1, Corrections 8]
2. Draft shows the existing notes with the new line below them, starting "Hole 13: driver brought the bunker in."; Undo restores the old `coach_notes` text exactly (DB compare). [P §14.1]
3. On confirm "Theo sees it on the round once Undo closes."; button "Share with Theo"; receipt "Note shared · hole 13"; Open round. Undone: "Undone. Your earlier notes are back as they were." [DP]

### S-ASK.flow.f_drill.*
1. Built off: registered only when `golf_drills.team_id` exists (HM5 or N-00 §8.3); otherwise the gallery shows "Drill bank comes with the practice builder". [P §14.5] (fixed 4 Nov: registered only when `golf_team_drills` exists, N-00 010100; otherwise the gallery shows "Drill bank comes with the Practice tab".)
2. Asks who can see it (.confirm.coaches-only); button "Add to drill bank"; undone "Undone. The drill was removed." [DP] (fixed 4 Nov: no question; see CP-40.)

### S-ASK.player (player Ask, own switch), .player.steps, .player.answer, .player.drill, .player.recap
1. Shown only when `coachhelm_player_ask_v1` and `coachhelm_ask_v2` are both on; otherwise a player's `?view=ask` falls through to their board. [P §13.1]
2. Tool set is an allowlist: own `get_player_metrics`, `get_player_trend`, `get_recent_rounds`, `get_focus_areas`, `get_upcoming_events`, `get_shot_pattern`, `get_round_detail`, `compare_seasons`, the player projection of insights, and `show_visual`. No key matches `^(create|set|add|draft|save|publish|request)_`; no `compare_players`, `get_team_metric_ranking`, `get_team_overview`, `get_team_rounds`. Every tool overwrites `player_id` with the session's. [P §13.1]
3. Comparisons are PGA Tour and team average only; the team average arrives as an unnamed benchmark figure. No teammate dots, rows, chips or names in text, chips, popovers or visuals (DOM scan of every player fixture answer for every roster name but the player's own). [P §13.1, SHARED-11]
4. Player instructions say "you", tone Encouraging, and never name another player. [P §13.1]
5. player.steps asks "Why is my approach costing me strokes?"; player.answer includes the coach's drill as a read-only card with no button (player.drill). [CM]
6. player.recap ("How did I play at Hilltop?") uses hole-strip rules (red only under par). [CM, P §10]
7. No write tool and no confirm card except Request more. [P §13.1]

### S-ASK.player.allowance, .player.allowance-low (not drawn), .player.out, S-ASK.composer.paused, S-ASK.player.request, .request.commit, .request.receipt, .request.told, .request.undone, .request.cancelled
1. Meter on player Ask home: "Ask this week · Plenty left · resets Monday"; row 14pt with 13pt ink2 sub. Low (under 20% left) turns amber. [P §13.2, DP `.allow`, CM]
2. The client only ever receives `plenty | low | out`; no dollar sign, token count or percentage appears in Ask strings or responses (grep test on the payload). The $5 cap lives in server config only. [P §13.2]
3. Week starts Monday in the team zone. [P §13.2]
4. Out: the model is skipped and one `data-allowance {state: 'out', resets}` part is written. [P §13.2]
5. Out card: top padding 16/16/12 gap 10; icon 38 radius 12 on well; title 18 × k 600, tracking -0.015em; body 15 × k, line height 1.45; reset row 13pt; "keep" row and ask row with 0.5px hairlines; "Need more before Monday?" with "Request more" (btn fill, 15pt 600, radius 99, padding 9/16). [DP `.outcard`]
6. Composer paused: the box stays at full opacity with "Ask is paused until Monday" as placeholder in ink3; send button on track with ink3 glyph (5.31 / 5.42). [DP, P §13.2, CT]
7. Request more opens a kit confirm ("Send request"); "It sends when Undo closes"; held 8s like AK4. [DP, P §13.2]
8. Told: one email sent once per week through the ops transport to `ASK_CREDITS_TO`, only while `HELM_CUSTOMER_EMAIL_ENABLED` is true; with it false the request row is written and no email goes. Undo inside 8s sends no email (spy) and leaves no `ask_credit_requests` row. [P §13.2, lane call]
9. Hidden entirely until HM4 is applied (no cap, no ship). [P §16]

### Contrast (CT, design page tokens; target SHARED-4, marks 3:1)
1. All primary text pairs pass in both themes (body on card 17.08 / 14.34 down to tertiary on page 5.85 / 7.80).
2. Pairs fixed on the design page in version 12, which the build copies (no opacity on text anywhere):
   - Lock banner Urgent label: #8A4C00, 6.41 light, 5.41 dark (was #9A5700, 4.51 / 4.41).
   - Cancelled draft: greyed with `saturate(0)` at full opacity, so its text keeps the ink and ink2 ratios (was 60% opacity, 3.14 / 4.66).
   - Paused composer: full opacity (was 72%, 3.38 / 4.26).
   - Lineup row already seated: coin at `saturate(.25)`, name in ink2 (was ink at 45%, 2.82 / 4.00).
   - Folder list document row: ink2 text at full opacity, icon at 70% (was ink at 60%, 4.52 / 5.95).
   The final ratios for each are in `capture/contrast-table.txt` and `06-SCREEN-SPECS.md`.
3. Exempt, with the reason in the PR: the Undo ring track against card (1.24 / 1.29) is decorative, since the drain carries the meaning at 8.15 / 8.45; the told coin before it lights (35%, 2.07) is a transitional frame of at most 90ms × position, never a resting state.
4. Disabled controls (Cancel after confirm 50%, Back on question 1 40%) are exempt.

### Motion (rows from CM; timings from the DP motion table, AR and K; 07-MOTION.md not written yet) (fixed 4 Nov: 07-MOTION.md is written and wins over this table; every "120ms" here reads `CH_FADE_MS`)
Easing tokens: `--ch-ease` cubic-bezier(.22,1,.36,1), smooth spring 462ms, settle, reveal, and Messages 11a's send, pop and lift as `linear()` easings. Every row has a Reduce Motion version: 120ms crossfade, no movement, unless the row says otherwise. Where a run of rows shares one screen, the split of the listed moves across those rows comes from 07-MOTION.md when written.

| Row | Screen | What the clip must show | Reduce Motion |
|---|---|---|---|
| M-ASK-01 | S-ASK | CoachHelm switcher press into Ask | 120ms fade |
| M-ASK-02 | S-ASK.turn.user | Question lands, 260ms, rises 8px, spring | 120ms fade |
| M-ASK-03 | S-ASK.composer.typing | Typing, caret blink 1s steps | caret static |
| M-ASK-04 | S-ASK.turn.answer | Answer card enters after send | 120ms fade |
| M-ASK-05 to 10 | S-ASK.steps | Step row in 260ms with 6px rise; dot breath 1.2s 1.0 to 0.6; label shimmer 1.9s; check draw 240ms | static dot; check appears |
| M-ASK-11 | S-ASK.steps.folded | Fold to "4 steps · 3s", collapse 360ms | 120ms crossfade |
| M-ASK-12 | S-ASK.steps.open | Chevron 180° in 260ms; body opens 360ms spring | instant open |
| M-ASK-13 | S-ASK.composer.busy | Send becomes Stop | swap |
| M-ASK-14 | S-ASK.turn.answer | Words fade in, 320ms each, ease out | whole sentence at once |
| M-ASK-15 | S-ASK.readchip | Chip enters with its sentence | with sentence |
| M-ASK-16 | S-ASK.toolcard.skeleton | Skeleton in | 120ms fade |
| M-ASK-17, 18 | S-ASK.toolcard.putt-profile | Crossfade 260ms, marks grow 360ms once | fade only, marks drawn |
| M-ASK-19 | S-ASK.toolcard.season | Line draws against last season's band | drawn |
| M-ASK-20 | S-ASK.toolcard.miss-pattern | Wedges and dots draw | drawn |
| M-ASK-21 | S-ASK.toolcard.ask-about | Bar tap fills composer | fill only |
| M-ASK-22 | S-ASK.readchip.popover | Popover opens from chip | 120ms fade |
| M-ASK-23, 24 | S-ASK.sources.open | Sources well opens | 120ms fade |
| M-ASK-25, 26 | S-ASK.followups | Chips in together, 260ms, spring; press 0.97 | fade |
| M-ASK-27 | S-ASK.artifact.card | Card in; tile scan 1.1s linear | no scan |
| M-ASK-28 | S-ASK.artifact.pane | Pane widens to 452, 462ms smooth spring (desktop) | 120ms fade |
| M-ASK-29 to 32 | S-ASK.artifact.push | Push in from the right, 462ms; back; writing | 120ms fade |
| M-ASK-33 to 37 | S-ASK.brief.q1, q2 | Question slides 420ms send spring; picked check pops 250ms pop spring | crossfade, no slide |
| M-ASK-38 | S-ASK.brief.free | Free line opens and fills | crossfade |
| M-ASK-39 | S-ASK.brief.folded | Answers fold to pills 40ms apart | together |
| M-ASK-40 | S-ASK.flow.f_event.worked | Worked out pills pop 70ms apart | in place |
| M-ASK-41 | S-ASK.flow.f_event.draft | Days rise 40ms apart; column scan 300ms; dots pop amber or green; free slot pops and breathes | days and dots appear |
| M-ASK-42 | S-ASK.flow.f_event.confirm | Fields fill 260ms each | in place |
| M-ASK-43, 44 | S-ASK.flow.f_event.commit | Button to capsule 280ms; sweep 900ms linear | 120ms crossfade, sweep stays |
| M-ASK-45 to 50 | S-ASK.flow.f_event.receipt | Flight 462ms short arc into the slot; edge flash 900ms; check draw 240ms; ring 620ms; Draft chip spring | no flight, 120ms crossfade |
| M-ASK-51 | S-ASK.flow.f_event.receipt | Undo ring drains linearly over 8000ms (8600ms clip) | ring still runs 8000ms |
| M-ASK-52 | S-ASK.flow.f_event.undone | Undo press to "Undone. The meeting was removed." | 120ms crossfade |
| M-ASK-53 | S-ASK.flow.f_event.told | Coins light 90ms apart on the pop spring | all at once |
| M-ASK-54 | S-ASK.flow.f_event.cancelled | Cancel press, draft greys to `saturate(0)` | 120ms |
| M-ASK-55, 56 | S-ASK.flow.f_event.draft, .confirm | Draft build and fill to confirm | in place |
| M-ASK-57 | S-ASK.flow.f_annc.draft | Lock preview fades in; banner drops 26px with scale 0.96 on the pop spring, 200ms in; old rows rise 50ms apart | banner and post in place, 120ms fade |
| M-ASK-58 | S-ASK.flow.f_annc.told | Coins 90ms apart; Got it count ticks to 2 of 7 with 0.85 to 1 pop | all at once |
| M-ASK-59, 60 | S-ASK.flow.f_travel.draft | Route draws 1.1s; van rides it; flag pops; room pairs 90ms apart; chips 50ms apart | route complete, van at course |
| M-ASK-61 | S-ASK.flow.f_board.draft | Board scales in from 0.97; tiles pop 90ms apart; bars grow | tiles complete |
| M-ASK-62 | S-ASK.flow.f_board.receipt | Board shrinks into the player's thread composer | thumbnail fades in |
| M-ASK-63 | S-ASK.flow.f_poll.draft | Options rise 160ms apart; "Free for 7" checks pop | together |
| M-ASK-64 | S-ASK.flow.f_qual.draft | Round cards slide 24px, 90ms apart; spot bar fills a seat every 80ms | together |
| M-ASK-65 | S-ASK.flow.f_lineup.tie | Coins fly into seats 140ms apart; tied rows wobble amber | coins in seats, no wobble |
| M-ASK-66 | S-ASK.flow.f_lineup.receipt | Lands "Lineup set"; lock pops 70ms apart belong to the separate Lock card | in place |
| M-ASK-89 | S-ASK.flow.f_lineup.lock, .locked | Lock card rises 6px on the send spring after Told; on Lock lineup the capsule shows "Locking…" for the call, then each seat's lock pops from scale 0.4 and -20° 70ms apart; receipt fades in | card and locks appear in place, 120ms fade |
| M-ASK-67 | S-ASK.flow.f_task.draft | Due ring sweeps (reveal spring); assignees pop 80ms apart; bell rings once | ring filled, bell still |
| M-ASK-68 | S-ASK.flow.f_goal.draft | 8 rounds draw 900ms; goal band grows from centre (settle); arrow draws | complete |
| M-ASK-69 | S-ASK.flow.f_goal.told | Tag springs to Accepted | swap |
| M-ASK-70 | S-ASK.flow.f_note.draft | 18 bars grow 20ms apart; pin drops 26px; note pops | in place |
| M-ASK-71 | S-ASK.flow.f_drill.draft | Tees drop 80ms apart; 8 balls 60ms apart; roll 900ms | complete, no roll |
| M-ASK-72 | S-ASK.flow.f_task.confirm | Fields fill 260ms each | in place |
| M-ASK-73 | S-ASK.save | Save card docks above the footer | 120ms fade |
| M-ASK-74, 75 | S-ASK.save.folder-list | List opens in place, 360ms | 120ms crossfade |
| M-ASK-76 | S-ASK.save.new-folder | New folder field, created folder to top | in place |
| M-ASK-77, 78 | S-ASK.save.receipt | Page drops into the folder icon, 462ms arc; folder squash 1.08 × 0.94 then settle; count ticks; Draft chip to Saved | no flight, 120ms crossfade |
| M-ASK-79 | S-ASK.publish | Publish sheet rises to 90% | 120ms fade |
| M-ASK-80 | S-ASK.publish.receipt | Plan fans out to 7 avatars plus Practice plans | in place |
| M-ASK-81 | S-ASK.publish.told | Badges turn from document to check after the window (10.5s clip) | all at once |
| M-ASK-82 | S-ASK.moment.focus.receipt | Chip flies into the empty focus slot; avatar pings | no flight |
| M-ASK-83 | S-ASK.player.out | Out card rises 260ms; Request more pops 420ms later | fade |
| M-ASK-84 | S-ASK.player.allowance | Meter on player home | static |
| M-ASK-85 | S-ASK.tone.detailed | Segmented control moves to Detailed | swap |
| M-ASK-86 | S-ASK.flow.f_event.worked | Pill press 0.97 and change | no scale |
| M-ASK-87 | S-ASK.artifact.why-popover | Why popover opens | 120ms fade |
| M-ASK-88 | S-ASK.flow.plan.receipt | "Add to calendar" press through receipt | as M-ASK-45 to 50 |

1. Each clip matches the design page clip with and without `reducedMotion: 'reduce'` (SHARED-6, SHARED-12).
2. CSS quality: no transition on layout properties, no `transition: all`, outer shadows from `--ch-*` tokens (`npm run clubhouse:css`). [P §0]

## Part 2. Per PR

Every PR: draft only (SHARED-8, SHARED-9); runs `clubhouse:catalog`, `clubhouse:css`, `flags:check`, `npm test`, `npm run lint`, `typecheck` once at the end; keeps `playwright.clubhouse.config.ts` green on chromium and webkit with motion no-preference and reduce; adds a changelog fragment under `docs/clubhouse/pages/P013-coachhelm/changes/`; touches no file in P §1 (shell, quick chat, Fairway chat, shot tracking, `tokens.css`, `lib/motion.ts`, today's Ask CSS); attaches side-by-side shots at 390, 430, 1440, light and dark, XXL, with each difference listed as matches, fixed, or can't match as drawn. Pre-deploy check for every PR: `coachhelm_ask_v2` and `coachhelm_player_ask_v1` read false in production, preview and development, and no held migration is applied.

### AK0 Plumbing
- Must pass: S-ASK 2 to 4; S-ASK.flag-off 1 to 4; S-ASK.loading 2.
- Tests added: flag registry test; `ask-flag.test.ts` (player flag needs both); route snapshot with the flag off (`CH-13820`, class list); preview route renders.
- Done when: both flags off gives byte-identical output to 75b4956 for the Ask route, stream route and `buildCoachTools`; `flags:check` passes with both false everywhere; the preview loads the design fixtures (roster of 7: Josie, Jonah, Theo, Eli, Maya, Ana, Sam) and renders today's Ask with `v2` false and an empty `.ch-ak-` shell with `v2` true. Waits for BUILD_BRIEF PR 1 tokens and Messages 11a springs or carries exactly their block. [P §3]

### AK1 Answer card and steps
- Must pass: S-ASK.turn.user 1 to 3; S-ASK.turn.answer 1 to 4; S-ASK.steps 1 to 14; S-ASK.composer 4, 5; M-ASK-02, 04 to 14.
- Tests added: `agent-tools.progress-labels.test.ts` (done label for every tool, no stray digit); `coachhelm-thread.test.ts` (part replacement, failed state, fold receipt, two-request turn); `coachhelm-thread-ui.test.tsx` (Stop, `aria-live` on the live list only, chevron toggles).
- Done when: putts, jonah and trend scenes match S-ASK.steps, .steps.folded and .steps.open at 390 and 1440 light and dark; the step clip matches with Reduce Motion showing no breath, shimmer or draw and folding with the 120ms crossfade; no step row before its `data-progress` part; no percentage or timer; a throwing read gives an amber row and the turn continues. [P §4]

### AK2 Read chips and Sources
- Must pass: S-ASK.readchip, .readchip.popover, .sources, .sources.open 1 to 5; S-ASK.turn.answer 6; M-ASK-15, 22 to 24.
- Tests added: marker parser (adjacent, at end, unknown ref); `route.grounding-persistence.test.ts` case for markers; popover keyboard and focus return; flag-off prompt snapshot unchanged.
- Done when: putts scene shows the three chips in the drawn order and "3 reads"; every popover string is in the envelope or the fixed labels; `[e9]` with two reads draws no chip and leaves the audit unchanged. [P §5]

### AK3 Tool cards and Follow-ups
- Must pass: S-ASK.toolcard 1 to 3, 9 to 11; S-ASK.followups 1, 2; M-ASK-16 to 18, 21, 25, 26.
- Tests added: skeleton shape per block type; crossfade once per artifact id; tap fills the composer and does not send; follow-ups at most three.
- Done when: putts, jonah and trend visuals match skeleton and drawn states light and dark; scrolling off and back does not replay the grow (Playwright); Reduce Motion swaps with the 120ms crossfade and marks appear drawn. [P §6]

### AK4 Confirm, commit, receipt and Undo (needs HM1 before the flag can be on)
- Must pass: Kit pieces 1 to 7; Receipt, Undo window and Told 1 to 16; S-ASK.flow.plan.* 1 to 4; S-ASK.moment.cal.* and .moment.focus.* 1, 2, 4; S-ASK.flow.f_annc.* 3, 8 to 13 on today's announcement write; M-ASK-43 to 54, 58, 82, 88.
- Tests added: `undo-hold.test.ts` (no domain row before `run_at`; cancel inside 8s leaves `cancelled` and the action mock uncalled; cancel after `run_at` refused; release runs once against the sweeper; Open runs at once); `agent-tools.confirm-gate.test.ts` (receipt `held` first under `askV2`); notification spies (zero during the window, one batch after, zero after Undo); UI (buttons lock after one tap; ring stops at 8000ms; reload mid-window shows the remaining ring; reload after shows the durable receipt without Undo); HM1 written with HOLD header, rollback line, VERIFY query and pgTAP file, not run.
- Done when: the plan scene's calendar confirm and the focus moment match draft filling, confirm, adding, receipt, told, undone, cancelled and failed at 390 and 1440 light and dark; the commit clip (capsule, flight, edge flash, ring, Draft chip, coins 90ms apart) matches with Reduce Motion showing no flight, 120ms crossfades and all coins at once; nothing in `golf_events`, `golf_tasks`, `golf_player_focus_areas` or `golf_announcements` before the press; Undo inside 8s leaves no row and no notification; Told only after the window; the announcement confirm reads "Post to 7 players", shows the message word for word, and players are told only after Undo closes; without HM1 the build falls back to today's immediate write with no Undo. [P §7]

### AK5 Artifacts
- Must pass: S-ASK.artifact.card 1 to 3; S-ASK.artifact.pane, .push, .versions, .why-popover, .edit 1 to 6; M-ASK-27 to 32, 87.
- Tests added: version arrows; deep state restore on reload; phone push and back keeps the thread scroll.
- Done when: the plan scene's artifact matches artifact writing, pane open (desktop) and push screen (phone) light and dark against lane 6's printed page; the 452 pane clip and phone push match; Save draft… and Publish… make no network call with AK9 absent. The builder flag name (`coachhelm_practice_plans_v1` or `golf_practice_plans`) is settled before merge. [P §8] (fixed 4 Nov: settled, two flags, DECISIONS.)

### AK6 Shot reads and two blocks
- Must pass: S-ASK.toolcard 4, 6, 9, 12; Corrections 5; S-ASK.answer.jonah; M-ASK-17, 18, 20; SHARED-10.
- Tests added: direction counting with null counted apart; unit conversion; band edges left-inclusive; empty window envelope; block compile refusal; renderer snapshots; Fairway renderer ignores a v2 block; v1 composition restore.
- Done when: the miss pattern matches the 64-shot fixture; the putt profile matches with "3 to 5 ft"; every figure traces to a DERIVE row; a grep of the diff shows no write to `golf_shots`, `golf_rounds` or the round RPCs. [P §9]

### AK7 Engine reads, calendar, course, seasons and two blocks
- Must pass: S-ASK.toolcard 5, 7, 8; S-ASK.turn.answer 7; Corrections 6; M-ASK-19.
- Tests added: no exposure row from `get_root_causes` (spy); calendar free slot across DST; season band method; canary wrap on engine reads.
- Done when: trend scene matches season compare and recap matches hole strip (red only under par); jonah's root-cause detail comes from the fixture with no exposure; `get_team_patterns` is absent with `coachhelm_team_pattern_v1` off. [P §10]

### AK8 Tone and CoachHelm knows (HM2)
- Must pass: S-ASK.tone 1 to 4; S-ASK.knows 1 to 3; S-ASK.history 1, 2; M-ASK-85.
- Tests added: same fixture turn in three tones gives identical tool calls and figures; no fact row from any chat turn (DB); column check hides the UI; HM2 written and held.
- Done when: the history panel matches "history with tone and knows"; the DB assertion and the three-tone comparison pass. [P §11]

### AK9 Practice brief and Save to a folder
- Must pass: S-ASK.flow.plan.reads and S-ASK.brief.* 1 to 7; S-ASK.save.* 1 to 8; S-ASK.publish.* 1 to 3; S-ASK.moment.fold.* and .moment.pub.* 3; M-ASK-33 to 39, 73 to 81.
- Tests added: brief never asks what a read answered; Skip takes every default; Save writes nothing before the press and nothing after Undo; empty folder made here removed on Undo; Publish tells nobody inside the window.
- Done when: the plan scene matches brief question 1 to 4, brief folded, save card list open, new folder, saved receipt and publish told; the folder clip (arc, squash 1.08 × 0.94, count tick) matches; DB has nothing in `golf_documents` before the Save press and nothing after Undo. Until N-00 and N-10 are applied, Save and Publish show "Comes with the practice builder" and do nothing. [P §12]

### AK10a Player Ask (HM3)
- Must pass: S-ASK.player 1 to 7; S-ASK.composer.at-menu 3; SHARED-11.
- Tests added: tool-set allowlist assertion; `player_id` overwrite per tool; DOM scan of every player fixture answer for other roster names; flag-off fallthrough to the board; history hidden without HM3.
- Done when: player scenes match player answer light and dark at 390; the allowlist and name scan pass; the player sees only PGA Tour and team-average comparisons. [P §13.1]

### AK10b Allowance (HM4)
- Must pass: S-ASK.player.allowance and request IDs 1 to 9; S-ASK.composer.paused; M-ASK-83, 84.
- Tests added: bucket mapping; Monday reset in the team zone; out skips the model; payload grep for "$", token counts and percentages; Request more Undo sends no email and leaves no `ask_credit_requests` row; one request per week.
- Done when: player home meter, out card, request more confirm and request sent match light and dark at 390; no amount ever reaches the client; the Request more mail follows `HELM_CUSTOMER_EMAIL_ENABLED` (lane call, Nick can flip). [P §13.2]

### AK11a Create engine with event, task and round note
- Must pass: Create flows common shape 1 to 6; S-ASK.flow.f_event.* 1 to 6; .f_task.* 1, 2; .f_note.* 1 to 3; Corrections 8, 10; M-ASK-40 to 42, 55, 56, 67, 70, 72, 86.
- Tests added: planner field tests per TF §5; gate tests (no write before press, Undo cancels, Told after the window); note append and restore (DB compare).
- Done when: f_event, f_task and f_note match reads, worked out, question, draft, confirm, landing, receipt, told and undone with the corrections applied; clips match with their Reduce Motion columns; no row before the press; Undo inside 8s leaves no row and no notification. [P §14.1]

### AK11b Announcement, travel, qualifier, goal and quiet flows
- Must pass: S-ASK.flow.f_annc.* 1 to 14; .f_travel.* 1 to 3; .f_qual.* 1, 2; .f_goal.* 1 to 3; Corrections 1 to 4, 9; Contrast 2 (Urgent label, cancelled draft); M-ASK-57 to 60, 64, 68, 69.
- Tests added: urgency only `normal | urgent`; no `publish_at` and no trip id in the payload; title 120 and body 2000 limits; email clause follows the switch; no announcement row and zero notifications after Undo; Got it count from acknowledgements only.
- Done when: each flow matches its states with the corrections applied (retired IDs listed as removed); "Post to 7 players"; "Undone. Nothing was posted." with no `golf_announcements` row; Told only after 8000ms. [P §14.2]

### AK11c Board and poll (drafts only)
- Must pass: S-ASK.flow.f_board.* and .f_poll.* 1 to 6; M-ASK-61 to 63.
- Tests added: no call to `sendGolfPoll`, `sendMessage` or a `golf_messages` insert (spy and grep); prefill fields validated by `takePrefill`; key hash covers new fields.
- Done when: both flows match their states; the receipt says "Nothing is sent until you tap Send"; no `golf_messages` row after the flow; the composer holds the draft; poll stays off until `20261028140800` is applied. [P §14.3]

### AK11d Lineup
- Must pass: S-ASK.flow.f_lineup.* 1 to 8; Corrections 7; M-ASK-65, 66, 89.
- Tests added: absent with `golf_tournaments_v1` off; Undo restores previous entries; Lock card appears only after Told; Not yet calls nothing; Lock calls `golf_tournament_lock_lineup` once and has no Undo; a failed lock leaves no seat locked.
- Done when: the flow lands "Lineup set" and offers Lock as its own card with no Undo. [P §14.4]

### AK11e Drill (HM5) (fixed 4 Nov: waits on N-00 20261026010100, HM5 superseded)
- Must pass: S-ASK.flow.f_drill.* 1, 2; M-ASK-71.
- Tests added: tool absent without `golf_drills.team_id`; gallery message shown. (fixed 4 Nov: without `golf_team_drills`.)
- Done when: the drill flow is absent until HM5 (or N-00 §8.3) and matches its states on a fixture with the column. [P §14.5]

### AK12 Capture and fidelity
- Must pass: Part 3 in full; Contrast 1 to 3; every M-ASK row.
- Tests added: Playwright block `ask-v2` (every ID at 390, 430, 1440, light and dark, reduce, XXL, flag-off parity); axe on every state; focus order through brief, confirm and Undo; 30-question eval for chip marker coverage and an unchanged claim audit pass rate.
- Done when: every ID has a shot pair and a verdict; every motion row has a clip pair; flag-off parity shows zero pixel difference. [P §15]

## Part 3. Side by side

1. Shots: `node ask/capture/capture.mjs --id <ID> --state <state>` writes `screenshots/<ID>__<state>__{design,app}__{light,dark}.png`; `compare` mode puts built left and design right in `screenshots/compare/`. Run per PR for every ID it touches with `--state default,w430,desktop,xxl,reduce`, and `--state all` in AK12.
2. Pass: each screen matches within 2pt on the numbers in Part 1 (radii, paddings, row heights, type sizes, the 452 pane, the 22pt receipt disc, the 38pt composer buttons) in light and dark (SHARED-12).
3. XXL (`--ch-type-scale` 1.36, as SHARED-5; the page's `--k` is 1.36 too): no text clipped, no horizontal scroll at 390 or 430 (SHARED-5).
4. Clips: `node ask/capture/capture.mjs --motion <M-ID>` writes `clips/<M-ID>__{design,app}__{motion,reduce}.webm` with the start ms beside each; the app clip matches the design clip's sequence, stagger and duration within one frame at 60fps, and the reduce clip shows only crossfades plus the 8000ms Undo ring.
5. App side runs on `/clubhouse-preview/coachhelm-ask-v2` and is shot only after `data-ch-ak-ready="1"`.
6. Not drawn IDs (S-ASK.composer.add-menu, .history.sheet, .knows.edit, .settings.sheet, .loading, .error, .flag-off, .steps.stopped, .toolcard.expanded, .brief.change, .kit.failed, .kit.partial, .kit.reloaded, .player.allowance-low) are app-only shots checked against their Part 1 rules.
7. IDs retired by decision (S-ASK.flow.f_annc.brief-3, .f_annc.confirm.later, .f_annc.told.later, .f_qual.brief-2 as drawn, .f_qual.confirm.exempt, .f_note.brief as drawn, .f_note.confirm.private, .f_note.told.private) are listed as "can't match as drawn: removed by decision" with the Corrections item; any frame still showing Important, No push, 2 coaches, 3 to 6 ft, team-average baseline or Lock on the first lineup card is listed the same way.
8. Design pairs in Contrast 2 are listed as fixed with the new ratio; Contrast 3 pairs are listed as exempt with the reason.
9. Design side state links: the page opens any flow at any stage with `#stage?play=<key>&stage=<stage>&device=phone|desk&viewer=coach|player&theme=light|dark&rm=1&ts=xxl` and holds there. Holds (the run waits there for good): start, steps, worked, brief, draft, confirm, adding, receipt, done. Markers (set as the run passes, not held): brief-done, undone, cancelled, told, lock, locked; `&stage=lock` plays on and stops on the Lock card by itself, and `locked` needs the press. The page puts the flow key on `<html data-flow>` and the stage on `<html data-stage>`; capture.mjs waits on those.


## Completeness pass, 4 Nov 2026

Criteria for everything added in 05, 06 and 07 under §Completeness pass, 4 Nov 2026. Numbered CP-1 to CP-71 across the groups so other lanes can cite them. Motion rows M-ASK-90 to M-ASK-112 are checked by Part 3 item 4 like every other row; SHARED-1 to SHARED-12 still apply and are not restated.

### Part 1 additions

#### Conversation, stop, drop and history (05 CP-A, CP-G; 06 CP-E-STOP, CP-E-GONE, CP-E-MORE, CP-E-JUMP)
- CP-1. S-ASK.turn.stopped: Stop while words stream keeps every word already shown, ends at the last whole word, adds "Stopped." in ink2 14 with a Try again link; undrawn visuals leave no skeleton; no follow-ups; Try again sends the same question as a new turn. [05 CP-G]
- CP-2. S-ASK.turn.dropped: a socket closed with no `done` event keeps what streamed, shows the amber 8 dot and "The answer stopped. Try again.", and the composer shows the offline line until the connection returns. Test: kill the stream after 3 parts. [05 CP-G]
- CP-3. Stop and the steps: Stop during steps matches S-ASK.steps.stopped; Stop after the last step uses S-ASK.turn.stopped; never both lines. [05 CP-G, 07 interrupt cases]
- CP-4. No Regenerate control exists anywhere; Try again appears only on a failed, dropped or stopped answer (DOM assertion on a finished answer). [05 CP-G]
- CP-5. While a turn streams, Send is Stop, a second question cannot be sent, typing is kept. [05 CP-G]
- CP-6. Composer text is kept per chat in sessionStorage, survives switching chats and is cleared on send; nothing is kept after the tab closes. [05 CP-G]
- CP-7. Auto-scroll: the thread follows the bottom only when the reader is within 0.9 of a screen of it; otherwise S-ASK.jump shows (40 glass circle, arrow 19, no badge, right 14 at 390 and 18 at 430, 12 above the composer) and tapping it scrolls to the bottom on the smooth spring (Reduce Motion: jumps). [06 CP-E-JUMP, 07 M-ASK-100, M-ASK-101]
- CP-8. Sending scrolls the new bubble to 16 below the scope line (phone) or the top of the thread column (desktop). [07 M-ASK-102]
- CP-9. History with 0 chats shows "No chats yet"; with 31 or more, 30 load first in Today, This week, Earlier (and "Last season" before the latest 1 August), and reaching the end loads 30 more through S-ASK.history.more (44 row, skeleton bar), with no page button and no row stagger. A failed load shows "Couldn't load more. Try again." [05 CP-G, 06 CP-E-MORE]
- CP-10. S-ASK.chat.gone: a `chat=` link to a deleted chat, another owner's chat or another team's chat opens an empty thread with the well notice "That chat isn't available. It was deleted or isn't yours." and New chat focused; the API returns 404 with no title (server test with a second coach's chat id). [05 CP-G, 06 CP-E-GONE]
- CP-11. Cold start into `chat=`: green bar and composer first, two answer-card skeletons, then the chat at the bottom with no scroll animation. [05 CP-G]
- CP-12. Back from a pushed artifact or from any receipt's Open restores the thread scroll exactly (within 2pt). [05 CP-G, CP-I]
- CP-13. Same chat on two devices: a held receipt shows on both with the ring timed to `held_until`; Undo works from either; the second press gets the late line. [05 CP-G]
- CP-14. Day words in drafts and answers use the team zone; a draft made at 11:58 PM saying "tomorrow" keeps the date it showed after midnight; season words turn over on 1 August. [05 CP-G, SHARED-11]

#### Kit edge states (05 CP-A, CP-C, CP-G; 06 CP-E-RELFAIL, CP-E-LATE, CP-E-RECHK)
- CP-15. S-ASK.kit.release-failed: when release is refused, the receipt turns amber in place (22 disc `--ch-loss` 5.57 / 8.53, line in ink 15 / 600), the Draft chip returns to Draft, the draft keeps full colour and its confirmed fields, the Told row never shows, and no notification spy is called. Never red. [06 CP-E-RELFAIL]
- CP-16. Release failure while away: the durable receipt shows the amber state on return and the chat's history row carries an amber dot until opened; no push. [05 CP-G]
- CP-17. Try again on any failed receipt reuses the same proposal id, so two presses write at most one row (DB assertion). [05 CP-C]
- CP-18. S-ASK.kit.undo-late: a DELETE that returns 409 `already_released` removes the ring and Undo, shows "Too late to undo. It's done. Open it to change it." with Open, then the Told row; no frame shows "Undone". [06 CP-E-LATE, 07 M-ASK-106]
- CP-19. S-ASK.kit.recheck: when the execute-time re-check finds a change, the capsule springs back to the button, the On confirm line becomes the change line ("Eli is no longer on the roster. Eli is out of this draft.", "You switched to JV. This draft was for Varsity.", "Wednesday 4:00 is taken now. Pick another time."), the draft redraws, and nothing is written until a new press. [06 CP-E-RECHK, 07 M-ASK-107]
- CP-20. S-ASK.kit.no-hold: with HM1 missing, today's four writes run through today's ActionCard and AskReceiptCard with no ring and no Undo, the / menu drops create commands and the Make anything gallery is absent. [05 CP-D]

#### Every create flow, every stage (05 CP-B, CP-C)
- CP-21. Each cell of the 05 CP-B table resolves: every stage marked ID has a 05 ID and a 06 spec, every stage marked none is unreachable (test: the stage cannot be forced by the model's tool calls), and every flow has a failed state. [05 CP-B]
- CP-22. f_event failed reads "Couldn't add the meeting. Nothing was saved."; partial reads "Added the meeting. Invites didn't reach Theo and Eli. Check the event before you try again." with Open and no Try again. [05 CP-C]
- CP-23. f_annc failed reads "Couldn't post it. Nothing was sent."; partial reads "Posted. Push didn't reach 2 players.", adding the email clause only while `HELM_CUSTOMER_EMAIL_ENABLED` is on; partial never offers Try again. [05 CP-C]
- CP-24. f_travel, f_qual, f_goal failed lines match 05 CP-C word for word; each is one insert with no partial state. [05 CP-C]
- CP-25. f_board and f_poll failed lines ("Couldn't put the board in your message. Nothing was sent.", "Couldn't put the poll in the composer. Nothing was posted."); Try again rebuilds the prefill; nothing is ever written to Messages by Ask. [05 CP-C]
- CP-26. f_lineup set failure reads "Couldn't set the lineup. The earlier lineup stands." and Try again re-reads the version and redraws before asking again (a version clash never retries blind); lock failure reads "Couldn't lock the lineup. It's set but not locked." with Lock lineup again. [05 CP-C]
- CP-27. f_task failed and partial ("Assigned to Eli and Theo. The reminder didn't save." with Open) match 05 CP-C. [05 CP-C]
- CP-28. f_note failure keeps the earlier notes unchanged; when the earlier notes changed since the draft the line "Theo's round notes changed since this draft." shows and the draft redraws before Confirm returns. [05 CP-C]
- CP-29. Quiet flows q_block, q_break, q_term, q_avail, q_recruit each run every kit stage with the TASK_FIELDS §5.16 to §5.20 fields in the kit draft well, no flow visual and no Home surface; On confirm reads "Nobody is told." (q_avail: "Only coaches see it."); Told uses the private lock tile. [05 CP-B, 06 CP-E-QUIET]
- CP-30. Quiet flow failures read "Couldn't add the {blocked time, break, term, note, recruit}. Nothing was saved."; an overlapping term reads "That overlaps Fall 2026. Change the dates." [05 CP-C]
- CP-31. The plan's calendar write fails with "Couldn't add the practice. Nothing was saved." and is partial with "Added the practice. Invites didn't reach 2 players." [05 CP-C]

#### Held migrations and flags (05 CP-D)
- CP-32. `coachhelm_ask_v2` off: the Ask route, stream route and tools match 75b4956 byte for byte, and quick chat's Open full chat opens today's Ask. [05 CP-D]
- CP-33. HM2 missing: phone has no settings button, desktop rail shows only New chat and history, tone is Straight. [05 CP-D]
- CP-34. HM3 missing: the player has no history button and a player `chat=` link opens a new chat with no notice. HM4 missing or `coachhelm_player_ask_v1` off: a player's `?view=ask` lands on their Board. [05 CP-D]
- CP-35. N-00 plans and save migrations (010000 to 010600) missing or `golf_practice_plans` off: Save draft…, Publish… and Edit in builder read "Comes with the Practice tab" and make no network call (request spy); the artifact still opens, versions and prints. [05 CP-D]
- CP-36. `coachhelm_practice_plans_v1` off: /plan, the brief, `draft_practice_plan` and the home plan suggestion are absent; "Build Tuesday's practice" gets a plain answer with one chip "Add a practice to the calendar". [05 CP-D]
- CP-37. Poll fix migration 20261028140800 missing: the gallery tile reads "Polls come back when a fix ships" with no Play and no poll flow runs. [05 CP-D]
- CP-38. `golf_tournaments_v1` off: no f_lineup, no /lineup, no tile, and travel asks the leave time instead of reading tee times. [05 CP-D]
- CP-39. `class_awareness_v1` off: q_break and q_term are absent, the event day strip has no class dots and its pill reads "Calendar". Each missing table or column is detected once per server boot (`42703`, `42P01` or `to_regclass`), never by a failed write. [05 CP-D]

#### Drill flow on the one team bank (05 CP-L; 06 CP-E-DRILLNOTE)
- CP-40. f_drill writes N-00's `golf_team_drills` (held 20261026010100) and nothing else: no `golf_drills.team_id`, no HM5 file, no HM5 entry in HELD.md. It is registered only when `to_regclass('public.golf_team_drills')` is not null; otherwise the gallery tile reads "Drill bank comes with the Practice tab" with no Play. There is no brief and no "Who can see it?" question; the draft shows the fixed line "Only coaches see the drill bank. Players see a drill when a published plan uses it."; On confirm reads "Nobody is told."; the button is "Add to drill bank". [05 CP-L]
- CP-41. Drill write goes through N-00's `createTeamDrill` (or `copyLibraryDrill` for a library drill) and nothing writes `golf_drills`; before 010100 a drill request gets a plain answer and, with `coachhelm_practice_plans_v1` on, the chip "Put it in a practice plan". Fields: `name` 1 to 80, `area` from N-00's list (putting, short_game, bunker, approach, tee, course, fitness, mental), `kind` skill, `minutes` 1 to 180, `setup`, `goal`, `copied_from_drill_id` when copied from the library, `created_by` the coach; a player session cannot insert (RLS test). [05 CP-L]
- CP-42. A name already in the bank (lower, trimmed) fails with "You already have a drill called Gate drill. Rename this one." and the name field open; after the Undo window there is no delete from Ask, and Open goes to Practice, Drills only when the Practice tab is on. [05 CP-C, CP-L]

#### Player allowance (05 CP-E)
- CP-43. Low: under 20% left the meter turns amber with "Running low · resets Monday" and no number. [05 CP-E]
- CP-44. Out mid-turn: the turn that crosses the cap finishes; the next send shows the Out card without a model call (spy). [05 CP-E]
- CP-45. Out and opening a past chat: the chat reads normally and the composer is paused. [05 CP-E]
- CP-46. S-ASK.player.requested: after one request in a week the Out card reads "Requested this week. Ask opens again Monday." with no button; a second insert for the same player and week is refused by the unique key. [05 CP-E, 06 CP-E-REQD]
- CP-47. Week rollover at Monday 00:00 team zone; a usage read failure hides the meter and leaves the composer open while the server still enforces the cap; offline beats paused; coaches have no meter. [05 CP-E]
- CP-48. Request more with the email switch off writes the row with `sent_at` null and the told line "Request logged. Helm Sports Labs will see it."; a failed write shows S-ASK.player.request.failed "Couldn't send your request. Try again later." [05 CP-C, CP-D]

#### Practice plan flow, one flow across two lanes (05 CP-F)
- CP-49. The brief is one Ask first card with the practice-plan lane's three groups (How long, Work on, Who) and "Anything else?", calling `ask_practice_brief` with `{practice_event_id?, date, groups}`; no paged q1 to q4 renders. [05 CP-F]
- CP-50. The plan is drafted by `draft_practice_plan` (no `create_practice_plan` tool exists, so the confirm-gate prefix test stays green) and the pane, push screen and print all render `PracticePlanSheet`. [05 CP-F, 02 §8]
- CP-51. Save writes at once through `savePracticePlanDraft` with a folder name (1 to 60 characters, from `golf_documents.folder`); Undo calls `undoPracticePlanDraft`; Create folder writes nothing until Save. [05 CP-F, 02 §12]
- CP-52. Publish uses the practice-plan lane's inline confirm (no 90% sheet), files at once, tells after Undo closes, and Undo (`undoPublish`) returns the plan to draft with `is_public` false and "Taken back. Nobody was told." [05 CP-F]
- CP-53. The calendar card shows only when the plan's date has no practice event; with a `practice_event_id` from the brief the plan attaches to that event and no card appears. [05 CP-F]
- CP-54. Each lane's capture runs from its own folder; the practice-plan lane's `S-ASK.steps`, `S-ASK.failed`, `S-ASK.undone`, `S-ASK.cancelled` and `S-ASK.toast` shots are not read as this lane's IDs. [05 CP-F]

#### Coach and player, piece by piece (05 CP-H)
- CP-55. Player composer: @ lists only their own rounds and events, / lists only /recap, + shows only "Attach a round". [05 CP-H]
- CP-56. Player answers, chips, popovers and tool cards show only their own data plus team average and PGA Tour benchmarks, never a teammate's name, bar or dot (fixture with seven players; DOM text scan for the other six names). [05 CP-H]
- CP-57. Player has no artifacts, no create flows, no Make anything gallery, no CoachHelm knows and no tone control in the DOM; tone is Encouraging. [05 CP-H]
- CP-58. Player errors read "Couldn't load your Ask"; coach errors read "Couldn't load your team". [05 CP-H]

#### Entry points and deep links (05 CP-I)
- CP-59. `?view=ask` opens the last open chat or Ask home; `&chat=<id>` opens that chat at the bottom (fixed 4 Nov wiring: `&c=<id>` from `conversationHref`). [05 CP-I]
- CP-60. `&seed=read:<insightId>`, `seed=station:<id>` and `seed=player:<rosterId>` open a new chat with the composer filled and the read pinned as an @ chip; nothing is sent; a seed the viewer can't see is dropped silently. [05 CP-I]
- CP-61. Every receipt's Open goes to the destination listed in 05 CP-I and browser back returns to the chat at the same scroll. [05 CP-I]
- CP-62. Ask sends no push, bell or email of its own to the coach or player; players hear only through the destination's own notifications. [05 CP-I]
- CP-63. Quick chat's Open full chat opens the same conversation, with a held receipt keeping its remaining ring. [05 CP-I, CP-K]

#### Keyboard, focus and VoiceOver (05 CP-J; 06 CP-E-FOCUS)
- CP-64. Focus ring: 2 `--ch-accent` outline, offset 2, on `:focus-visible` only; never on a mouse press. [06 CP-E-FOCUS]
- CP-65. Tab order on phone keyboards and desktop follows 05 CP-J; desktop Enter sends and Shift+Enter adds a line; phone Return adds a line. [05 CP-J]
- CP-66. Esc closes one layer at a time in the 05 CP-J order and never stops a stream; focus returns to the opener; after Confirm focus moves to Open, after Undo to the receipt line, after Cancel to the composer. [05 CP-J]
- CP-67. VoiceOver: each turn is a group "CoachHelm answer"; the live steps list is `aria-live="polite"` and announces each step once; the Undo ring is "Undo, 8 seconds" and announces "Undo closed" once; labels match 05 CP-J. [05 CP-J]
- CP-68. Every control meets 44 × 44 by its `::after` extension (axe plus a hit-box script). [05 CP-J]

#### Hand-offs and layout (05 CP-K; 06 CP-E-MID)
- CP-69. `src/clubhouse/screens/coachhelm/chat/ask-links.ts` exports `askAboutHref` and the alias `askAboutReadHref`; both return null with `coachhelm_ask_v2` off and, for a player, when player Ask is off or the read isn't theirs (unit test per case). [05 CP-K]
- CP-70. Board and poll hand-offs write only `ChPrefill` (`conversationId`, `poll`, `attachment`) to sessionStorage and work with the Messages redesign flag on or off; the Messages back key returns to Ask with "Nothing is sent until you tap Send". [05 CP-K]
- CP-71. S-ASK.desk-mid at 1024 × 768: sidebar 232 unchanged, rail hidden behind a 36 history button and opening as a 280 overlay, thread fluid with 24 gutters and max 680, the artifact pane as a right overlay of min(452, main minus 64) over a scrim; no horizontal scroll at 821, 1024 or 1279; resizing across 821 or 1280 switches layout with no animation. [06 CP-E-MID, 07 M-ASK-108, M-ASK-109]
### Part 2 additions (per PR)

These add to each PR's Must pass list above; nothing above is removed.

| PR | Adds to Must pass | Tests added |
|---|---|---|
| AK0 Plumbing | the 32 new IDs load on `/clubhouse-preview/coachhelm-ask-v2?id=` with fixtures; CP-32 | preview route test lists all 304 IDs |
| AK1 Answer card and steps | CP-1 to CP-8, CP-71; M-ASK-94 to M-ASK-97, M-ASK-100 to M-ASK-104, M-ASK-108, M-ASK-109 | `coachhelm-thread.test.ts`: stop mid-words, dropped stream, no Regenerate, draft kept per chat; Playwright at 1024 × 768 |
| AK2 Read chips and Sources | CP-59, CP-60, CP-69; M-ASK-98 | `ask-links.test.ts` (null when off, player cases, alias) |
| AK3 Tool cards and Follow-ups | CP-56 (marks); M-ASK-99 | name scan over every player tool card |
| AK4 Confirm, commit, receipt and Undo | CP-13, CP-15 to CP-18, CP-20, CP-61 to CP-63; M-ASK-105, M-ASK-106 | release refused (DB), DELETE after release returns 409, Try again idempotency, notification spies stay at zero on failure |
| AK5 Artifacts | CP-12, CP-50 | back from push restores scroll |
| AK7 Engine reads | CP-14, CP-39 (class dots) | zone test at 11:58 PM and across 1 August |
| AK8 Tone and CoachHelm knows | CP-9 to CP-11, CP-33; M-ASK-90 to M-ASK-93, M-ASK-110, M-ASK-111 | history paging at 0, 30, 31 and 95 chats; 404 for another coach's chat |
| AK9 Practice brief and Save | CP-35, CP-36, CP-49, CP-51 to CP-54 | Save inert makes no request; one-card brief input shape; publish Undo to draft |
| AK10a Player Ask | CP-34, CP-55 to CP-58 | teammate name scan; DOM absence list for player |
| AK10b Allowance | CP-43 to CP-48; M-ASK-112 | unique request per week; cap crossing mid-turn |
| AK11a Create engine | CP-19, CP-21, CP-22, CP-27, CP-28, CP-31; M-ASK-107 | re-check per changed field; f_note earlier notes changed |
| AK11b More creates and quiet flows | CP-23, CP-24, CP-29, CP-30, CP-38 (travel leave time) | each quiet flow through every kit stage; overlapping term |
| AK11c Board and poll | CP-25, CP-37, CP-70 | prefill with the Messages flag on and off |
| AK11d Lineup | CP-26, CP-38 | version clash re-read; lock failure |
| AK11e Drill | CP-40 to CP-42 | RLS (player insert refused), unique name, `to_regclass` gate |
| AK12 Capture and fidelity | CP-64 to CP-68; every CP-A ID shot | registry gains the 32 IDs with `nd: true`; axe and hit-box script; focus order |

### Part 3 additions (side by side)

1. The 32 IDs in 05 CP-A are not drawn: app-only shots, checked against CP-1 to CP-71 and their 06 specs, listed beside item 6 above.
2. `S-ASK.desk-mid` is shot at 1024 × 768 (and at 821 and 1279 for the no-scroll check), light and dark.
3. Quiet flows are shot at every kit stage with `&stage=`, light and dark, at 390.
4. M-ASK-90 to M-ASK-112 have app clips only; each is judged against its row (timing within one frame at 60fps) and its reduce clip shows only `CH_FADE_MS` crossfades.

### Added by the lead (cross-lane with Messages, 4 Nov)
CP-72. AK11c: opening a board, poll or message receipt's "Open" twice lands the draft both times (a fresh prefill key per tap); with `returnTo: 'ask'` the Messages back key returns to the same Ask conversation once, and a second Back goes to the inbox. Nothing sends or uploads before the coach's Send (messages MSG-CP-61 to 69).
CP-73. AK11a announcement: the coach's count in Ask's receipt and in Messages reads "n of N acknowledged" from `golf_announcement_acknowledgements`, the same words in both places.
CP-74. AK9: for a day with no practice event, the event confirm shows before Save and Save is disabled until the event commits; Undo on the event removes the draft with "No practice, so no plan was made."; for a day with a practice event, no "Want it on the calendar?" appears and Save is live at once (practice-plan 02 §C.6, coachhelm S-TASK.plan.needs-event).

## Wiring, 4 Nov 2026

Checks for the wiring in 06 "Wiring, 4 Nov 2026" (groups W1 to W8). Each names the screen IDs it proves. Run against helmv3 with the held migrations in the state the check says.

W-ASK-1. S-ASK, S-ASK.flag-off: with `coachhelm_ask_v2` off, the route, tools and parts are today's (no new tool key in the `buildCoachTools` result, no `data-action-receipt` with `status: 'held'`); on, every new tool sits inside the `teamTools` block, so a Fairway team's chat never lists one.
W-ASK-2. S-ASK, S-ASK.player: a signed-in player calling `POST /api/coachhelm/v3/chat/stream` with coach-only flags on gets 403 from `resolveCoachChatContext` (`context.ts:89`) while `coachhelm_player_ask_v1` is off.
W-ASK-3. S-ASK.steps.*: a failed read draws the amber step from `unavailableEnvelope` and no chip; the fold reads "N steps · Ns" from the parts, not from a client timer.
W-ASK-4. S-ASK.history, S-ASK.history.more: the list loads 30 rows a page through `listConversationsPage`; a 31st row appears only after "Show more".
W-ASK-5. S-ASK.chat.gone: `?view=ask&c=<another coach's id>` returns 404 from `/api/coachhelm/v3/chat/conversations/[id]` and the page shows S-ASK.chat.gone with no title from that chat in the network response.
W-ASK-6. S-ASK.tone, S-ASK.knows: before HM2 runs, the tone control, the CoachHelm knows list and the settings sheet are absent and the console shows no error; after HM2, a fact of 281 characters is refused by the CHECK and the field keeps the text; no model tool writes `golf_coachhelm_coach_facts` (grep for the table name finds only `saveCoachFact` and `deleteCoachFact` writers).
W-ASK-7. S-ASK.kit.*: after HM1, the primary press writes the ledger row as `held` with `run_at` about 8s ahead, the receipt ring is timed from `held_until`, and the domain table has no new row until the window ends.
W-ASK-8. S-ASK.kit.undone, S-ASK.kit.undo-late: Undo inside the window sets `cancelled` and the domain table and `notifications` stay unchanged; Undo after `run_at` changes 0 rows and shows "Too late to undo. It's done. Open it to change it."
W-ASK-9. S-ASK.kit.*: release runs once: closing the tab inside the window still releases (from `after()` or the next request's `sweepHeld`), and two triggers together (ring end and sweep) leave one domain row and one set of notifications.
W-ASK-10. S-ASK.kit.release-failed: when the release write is refused, the receipt turns amber with the CP-C line and no player gets a bell row or push.
W-ASK-11. S-ASK.kit.* receipts: the success receipt is decided by a read-back of the domain row; a forced cache error after the insert still shows the success receipt, and a refused insert with no row shows failed.
W-ASK-12. S-ASK.kit.no-hold: before HM1 runs, only today's four writes (recurring practice, focus area, task, team update) appear, they write at once through today's `AskActionCard`, and no create flow from W5 is offered.
W-ASK-13. S-ASK.flow.f_annc.told: the "Seen by" coins come from the route's admin read of bell rows with `data.announcement_id` equal to the run's id, and "n of N acknowledged" matches Messages for the same post (CP-73).
W-ASK-14. S-ASK.flow.f_event.told: an event with RSVP off notifies nobody (no `notifications` row, no push) and the Told row reads from `golf_event_attendance`; with RSVP on, invitees get the invite only after the window ends.
W-ASK-15. S-ASK.flow.f_event: a double release with the same run key returns the same `golf_events` row (`requestId` from the run key), never two events.
W-ASK-16. S-ASK.flow.f_qual: the qualifier email and push go out after the window ends, never on the press; Undo inside the window leaves no `golf_qualifiers` row and no email.
W-ASK-17. S-ASK.flow.f_note: a note added through Ask appends to the round's existing `coach_notes` and never replaces it; a note changed since the draft shows f_note.failed with the redraw.
W-ASK-18. S-ASK.flow.f_lineup: set goes through `setTournamentEntries` with the version read in the draft; a stale version refuses and redraws; lock has its own confirm, no Undo and no hold.
W-ASK-19. S-ASK.flow.f_board, S-ASK.flow.f_poll: no `golf_messages` row, poll row or push exists after the receipt; Open twice lands the draft twice; the poll flow is absent until held `20261028140800` runs.
W-ASK-20. S-ASK.flow.f_drill: the tool is not offered while `golf_team_drills` is missing; a second drill with the same name in other case shows "You already have a drill called {name}. Rename this one."
W-ASK-21. S-ASK.flow.plan.*: for a day with no practice, the event confirm comes first and Save stays disabled until the event commits; Save calls `savePracticePlanDraft` and adds no second save path; Publish passes `notify: 'defer'` and players are told only after the window (CP-74).
W-ASK-22. S-ASK.player: with HM3 and HM4 run and both player flags on, a player's network responses (stream, `data-evidence` parts, stored `ui_parts`) carry no teammate's roster id, name or figure; the team average shows only when 5 or more other players have the figure, else "—".
W-ASK-23. S-ASK.player: a player's tool list holds no key matching `^(create|set|add|draft|save|publish|request)_`; a forged `player_id` in a tool call is overwritten with the session's.
W-ASK-24. S-ASK.player, HM3: a coach cannot read a player's conversation and a player cannot read a coach's or a teammate's (`golf_coachhelm_chat_conversations` select as each role returns no row); the one-owner CHECK refuses a row with both or neither owner.
W-ASK-25. CP-E meter, S-ASK.player.out: the meter shows only plenty, low or out; no network response to the player holds `cost_micros` or `cap_micros`; anon and authenticated selects on `ask_usage_weekly` and `ask_credit_requests` fail.
W-ASK-26. S-ASK.player.requested: Request more once per week; a second press that week shows the already-requested state (23505); Undo inside 8s leaves no row; with `HELM_CUSTOMER_EMAIL_ENABLED` off, `sent_at` stays null and the copy reads "Request logged. Helm Sports Labs will see it."
W-ASK-27. CP-I, CP-K: every Open target lands on the routes in 06 W8; a chat link is `?view=ask&c=<id>` (`conversationHref`), and a link built with `chat=` is not produced anywhere.
W-ASK-28. Shot tracking: the Ask PRs change no file under `hooks/golf/use-shot-tracking.ts`, `submit_round_atomic` or the partial save RPC (diff check).
