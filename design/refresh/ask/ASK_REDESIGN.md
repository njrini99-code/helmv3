# CoachHelm Ask redesign (lane 4, 31 Oct 2026)

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 5 rows).

> Shared values (START_HERE): wherever this file says the Reduce Motion fade is 120ms, that is the design page's own fade. The build uses `CH_FADE_MS` from `lib/motion.ts` (180ms today, opacity only, linear), and the page behind a push moves 24% (`CH_UNDERLAY_SHIFT` 0.24). Clip checks compare against those values.

Steps, confirm, commit, receipt and Undo follow the shared kit in `../coachhelm/AGENT_KIT.md` so Ask and the top-bar chat match. Ask-only pieces are listed under that file's Lane notes.

Design page: https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA (source: `coachhelm-ask.html` beside this file).
Follows `../DESIGN_LANGUAGE.md`. Plan only: no deploys, migrations or flag flips. Nothing here changes what shot tracking collects.

Other lanes (top-right quick chat, practice plan wizard) use the same pieces in section 3, so all three look and move alike.

---

## 1. Today (helmv3 main, 75b4956)

- UI: `src/clubhouse/screens/coachhelm/chat/` (Ask, Thread, Composer, Evidence, EvidencePanel, History, Home, ActionCard, visual/CoachComposition, visual/CoachVisualArtifact). Phone: green bar, Board | Ask segmented, steps as a plain checklist, composer with + and @.
- Server: `src/app/api/coachhelm/v3/chat/stream/route.ts` (AI SDK `streamText`, typed tool parts). Tools: `src/lib/coachhelm/v3/chat/agent-tools.ts`, reads in `read-tools.ts`, metric list in `metrics-catalog.ts` (15 metrics).
- Reads (17): find_player, get_team_overview, get_player_metrics, get_player_trend, get_putting_distance_profile, compare_players, get_team_metric_ranking, get_player_weakest_areas, get_recent_rounds, get_player_insights, get_focus_areas, get_upcoming_events, get_open_tasks, get_team_travel; get_team_rounds and get_qualifiers behind the Clubhouse team gate; get_tournaments behind `golf_tournaments_v1`.
- Visual: `show_visual` (compose blocks headline, kpis, trend, bars, split, compare, note; plus sg_anatomy). Trusted code fills the figures from reads; a digit in model text is refused. Keep this; it is the evidence rule in code.
- Writes, confirm gated: create_focus_area, create_task, create_team_announcement, create_recurring_practice.
- Coach only: the policy says "Your user is the head coach". Tone is fixed.

## 2. Gaps against "full visibility"

| Area | Today | Needed |
|---|---|---|
| Shots | none | `golf_shots`: miss_direction (8 ways), distance_to_hole_before/after, lie_before/after, club_type, putt_distance_feet, putt_made, putt_break/slope, is_penalty |
| CoachHelm engine | insights only | root causes (`intel/causes/*`), team patterns (`v3/team-pattern`), genome dimensions, causality chains, track record, corrections, the Board's per-player reads |
| Rounds | recent per player | hole by hole for any round; course and hole difficulty (`golf_course_tee_holes`) |
| Practice | none | practice reviews, plans, drill bank (when built, behind their flags) |
| Calendar, classes | 60 days of events | any event, class conflicts (`golf_class_exceptions`, class settings), attendance |
| Documents | none | titles and plans; save artifacts on Save |
| Messages | none | stays out. Ask drafts, the coach sends from Messages |

Shots store a direction and a distance left, not a map position. The miss pattern chart on the page is drawn from those two fields only.

## 3. Pieces (shared by Ask, quick chat and the practice wizard)

Where they live: new `src/clubhouse/screens/coachhelm/chat/parts/` folder, one file each. Thread.tsx renders an assistant turn as one card (law 1: text lives on a surface); chips sit under the card.

1. **Steps** (shared: `coachhelm/AGENT_KIT.md` ①). Sits inside the answer card with no card of its own. One row per announced step: breathing green dot plus a slow shimmer on the label while it runs, a check that draws in 240ms when done, an amber ring with a bar if a read fails (never red). No timer. When the answer lands it folds to "4 steps · 3s" with a chevron. Ask-only addition: a done row keeps one short line of what it read ("38 rounds so far"), because answers cite their data. Source: AI SDK tool part `state` plus the `progress()` label already in agent-tools.ts; add a past-tense label and a detail string per tool.
2. **Tool card** (`ToolCard.tsx`). Each read that has a visual shows a skeleton shaped like its card while `input-available`, then crossfades (260ms) into the chart; marks grow 360ms once. Maps to `show_visual` / `data-visual-composition`.
3. **Read chips** (`ReadChip.tsx`, `Sources.tsx`). After each sentence with a figure, a pill named for its read ("Putts · 30 days"), not a footnote number. Tap opens a popover: read name, window, sample, computed time, "Open in Stats". Under the answer, "4 reads" expands the full list in a well. Data: `data-evidence` parts already carry ref, window and sample; the chip is placed where the model cites `evidence_ref`.
4. **Visual kit** additions to `visuals/composition.ts` blocks: `miss_pattern` (8-way wedges plus dots by distance left), `putt_profile` (make rate by distance with the season tick), `season_compare` (line against last season's band), `hole_strip` (to par by hole, red only under par). Every bar and dot is tappable: tap fills the composer with "Ask about this".
5. **Artifact** (`ArtifactCard.tsx`, `ArtifactPane.tsx`). Card in the stream (tile, title, kind, "Open"); while writing the tile scans. Desktop: a right pane widens to 452px (462ms smooth spring) beside the chat, which stays usable. Phone (matches lane 6): the artifact pushes in from the right as its own screen under the green bar, with "< Ask" to go back and a glass dock holding Save draft… and Publish…. Header: title, meta, "1 of 3" version arrows, close (desktop). Desktop footer: Edit in builder, Save draft…, Publish…. Save draft… opens the folder sheet (item 12); Publish… opens the kit confirm in a sheet and fans the plan out to players. Kinds: practice_plan, player_report, lineup, round_recap. A practice_plan in the pane reuses lane 6's printed page (stays light in dark mode, group columns A/B/C with `--gA`/`--gB`/`--gC`, the stations × turns rotation grid, hole chips, one Why line per block in the coach copy only); see `practice-plan/COACHHELM_PRACTICE_PLAN.md` §12 and §13. The design page's plan pane still shows the earlier layout. Old cards open their old version.
6. **Confirm, commit, receipt** (shared: `coachhelm/AGENT_KIT.md` ② to ⑤, replaces the ActionCard look). The draft is the real object (an event chip with its date block), filling field by field with a green write head; optional gaps show "Not set". Then "On confirm: 7 players get an invite once Undo closes", Cancel on the left, "Add to calendar" on the right. On press the button becomes an "Adding…" capsule with a sweep, the event lifts and flies into its day on a mini week (462ms), then the receipt: 22pt check, "Added to calendar · Tue Nov 3, 3:00 PM", Open, and Undo with an 8 second draining ring. Invites wait until Undo closes. Same gate as today (`proposeGated` / `executeGated`), nothing written before the press. Messages stay the coach's: Ask offers "Draft a message to the team", which opens Messages with the draft.
7. **Follow-ups** (`FollowUps.tsx`). Three chips under the card, drawn from the reads just made, together in 260ms.
8. **Composer** (`Composer.tsx`). Glass. A scope line above the thread on phone ("Reading Varsity · last 30 days"). @ menu: players, rounds, events, qualifiers, documents. / menu: /plan, /lineup, /recap, /compare. Mentions pin ids into the request so reads are exact.
9. **Tone**. Straight (coach default), Detailed, Team talk; players get Encouraging. A per-chat setting in the history panel and a sheet on phone. Changes wording only; numbers and chips are identical.
10. **CoachHelm knows** (desktop history panel, phone settings sheet). An editable list of standing facts the coach gave ("Practice runs 2h 30m on weekdays"). Coach-written only; nothing inferred is saved.
11. **Practice brief** (`PracticeBrief.tsx`, Nick: "it should ask you what you want in the practice plan and then create it"). Before any plan is drafted, a card asks four questions one at a time: length (default from the free window on the calendar), what to work on (multi-select, data-backed options tagged "Focus area" / "Slipped this month"), how to split the team, and where plus a free "anything else" line. Defaults are picked from reads, so a coach can tap Next four times. "Skip, just build" takes every default. Dots show progress; Back works; questions slide 420ms (send spring). On the last Next the card folds to a row of answer pills with "Change answers", and only then do the drafting steps run. The same card opens from /plan and inside the practice wizard lane, so all three ask the same way. Data: one `ask_practice_brief` tool part that returns the questions and defaults; answers go back as the user turn.
12. **Save to a folder** (kit ⑦ draft 2, Nick: "save to folder or create folder"). Save draft… opens a save card docked above the artifact's footer: plan thumbnail, then an inline "Save to [Practice plans ⌄]" row (defaults to the last folder used, shows its count). Tapping it opens the folder list in place inside the card: folders with counts, a check on the chosen one, then New folder, which turns into a name field with Create (Enter creates, Escape closes); the new folder appears at the top, already chosen, and the "On save" line names it. The primary names the target ("Save to November"). On press: capsule, the page drops into the row's folder icon on a short arc (462ms), the folder squashes 1.08 × 0.94 and settles, the count ticks up, the Draft chip springs to Saved, receipt "Plan saved · Documents · November" with 8s Undo, then "Only you can see it. Players are told when you publish." The artifact header gets a location chip. Undo takes the plan out and removes a folder made here if it is left empty. Saves only on tap. Server: the Documents lane's folders table, `create_document_folder`, and `save_practice_plan(folderId)`. (fixed 4 Nov: folders are names in today's free-text `golf_documents.folder`, the practice-plan lane's default 1; Save calls that lane's `savePracticePlanDraft` and Undo its `undoPracticePlanDraft`; no folders table and no `create_document_folder` unless Nick flips to N-10.)
13. **Task moments** (one per write, all on the kit). Calendar: a real week grid with existing events; the open slot pulses; the draft flies into it; invites go out after Undo closes with a check per player avatar. Focus area: Jonah's player card with his current focus areas; the new chip flies into the empty slot and his avatar pings. Publish: the plan fans out to each player's avatar plus a copy into Practice plans; badges show a document while Undo is open and turn to checks once players are told. Folder: the same inline Save row as item 12. Every receipt ends with the kit's four finishing beats (⑤ draft 2): edge flash, check ring, the Draft chip springing to Added / Saved / Set / Published, and the Told row after Undo closes. Each shows a stage bar (Draft, Confirm, Adding, Receipt, Invites) on the design page only.
14. **Messages surfaces** (Nick pointed at the Messages page's look). Answer cards use the receive drop-shadow filter (`--shadow-recv`), 22px radius and 22px gaps; the user bubble uses the sent gradient and filter; inner cards use 0.5px hairlines; the composer is glass with the float shadow at 26px. Motion uses the same six springs as Messages (smooth 462ms, settle, reveal, send, pop, lift), converted to `linear()` easings, each with a Reduce Motion crossfade at 120ms.

15. **Create flows: everything Ask can make** (Nick: "Create event, create announcement, create travel, create a visual board to share with player in messages, what else am I missing? They all need it. And the logic of what it asks and the visuals need to be beautiful"; "The animation and motion needs to be spot on"). One engine, `CreateFlow.tsx`, and one shape for every tab:
    - **Reads** run as steps, each with a past-tense line.
    - **Worked out**: a row of pills for everything Ask inferred, each naming its source ("Wed Nov 4 · 4:00 PM · Calendar and classes"). Tap a pill to change it. Pills pop 70ms apart.
    - **Questions**: the practice brief card (item 11) with only what Ask could not work out, one to three questions, defaults picked from reads, "Skip, use my picks". Never ask what a read answers.
    - **Live draft**: a bespoke visual that builds itself, then the kit's field-by-field fill, then the confirm with an "On confirm:" line naming exactly who is told and when.
    - **Home**: a mock of the real place it lands (a list row slot, a week slot, a player card, a Messages composer). The draft flies there on the 462ms arc; receipt with 8s Undo; Told row after Undo closes.
    - **Messages rule**: anything that is a chat message (board, poll) lands in the coach's composer as a draft with "Open in Messages"; Ask never sends it.

| Flow | Tab, table | Asks | Works out | Visual and motion | Lands | Reduce Motion |
|---|---|---|---|---|---|---|
| Event | Calendar, `golf_events` | Who it's for, where | The one slot all are free (events plus classes), length, reminder | Days rise 40ms apart; a highlight scans each column 300ms; a dot pops amber (busy) or green (free); the free slot pops and breathes | The slot on the week; invites after Undo | Days and dots appear; event fades in 120ms |
| Announcement | Messages, `golf_announcements` | Urgency (Normal or Urgent; urgent is never held back during class), Got it | Title and body from the coach's words and the trip's times, recipients (players only) | Lock screen preview; the banner drops 26px with the pop spring; every announcement pushes and emails (email only while the customer email switch is on); no scheduled send | Top of Announcements; Got it count ticks after Told | In place, 120ms fade |
| Travel | Hub, `golf_travel_itineraries` | How you get there, room pairing, uniform | Leave time from the first tee time, hotel and gear list from last trip | Route draws 1.1s; van rides it; flag pops; room pairs slide together 90ms apart; uniform and gear chips pop 50ms apart | Hub trips strip | Route complete, van at the course |
| Board for a player | Messages composer (attachment) | Which visuals, whether to add a note | Rounds to use, what to lead with (focus area) | Board scales in from 0.97; tiles pop 90ms apart; bars grow and lines draw inside | Shrinks into the player's thread composer; coach sends | Tiles complete; thumbnail fades in |
| Poll | Messages team chat, `golf_messages` kind poll | Which nights, when it closes | Nights all are free, which chat | Options rise 160ms apart; "Free for 7" check pops on each | Team chat composer; coach posts | Options and checks together |
| Qualifier | Qualifiers, `golf_qualifiers` | Rounds | Squad size (5 spots) from the entry, coach's picks (none), two free days, all 7 players from the Roster (no exemption, no tie rule: neither has a field) | Round cards slide in 24px, 90ms apart; coins pop; the spot bar fills a seat every 80ms | Qualifiers list | Together |
| Lineup | Tournaments, round lineups (behind `golf_tournaments_v1`) | Only the tie for the last spot | Spots 1 to 4 from qualifier scores, order | Card shows first; top four coins fly from standings into seats 140ms apart; tied rows wobble in amber until the coach picks; "Set the lineup" lands with Undo; after Told a separate Lock card rises, and on Lock lineup a lock pops into each seat 70ms apart, with no Undo | Lineup set, then locked | Coins in seats, no wobble |
| Task | Tasks, `golf_tasks` plus assignments, reminders | Reminder time, repeat | Who (focus areas), due (calendar), what counts | Due ring sweeps to days left (reveal spring); assignees pop 80ms apart; the bell rings once | Each player's Home, To do | Ring filled, bell still |
| Goal | Stats, `golf_goals` | How far and by when, whether the player accepts | Metric, baseline, what's realistic (best stretch) | Last 8 rounds draw 900ms, dots amber; goal band grows from its centre (settle); arrow draws to it | The player's card; tag springs to Accepted | Complete |
| Round note | Rounds, `golf_round_reviews` | Nothing: always shared, added under the earlier notes, Undo puts them back | The hole (worst score) and what happened (shot tracking) | 18 bars grow 20ms apart; pin drops 26px onto the hole with its shadow; note pops from the pin | Coach notes on the review | In place |
| Drill | Practice, `golf_drills` (fixed 4 Nov: `golf_team_drills`, N-00 010100) | Who can see it (fixed 4 Nov: not asked; the bank is coach-only) | Skill, time, goal from the original drill | Green fades up; gate tees drop 80ms apart; 8 balls pop around the ring 60ms apart; one ball rolls through the gate into the cup (900ms) | Drill bank | Diagram complete, no roll |

Also on the same engine, no new visual: block time (`golf_coach_blocked_time`), team break or class exception (`golf_team_terms`, `golf_class_exceptions`), recruit prospect (`golf_recruits`), availability note (`golf_player_availability_coach_notes`). Existing flows already on the kit: practice plan, focus area, save to a folder. Lift waits until Lift has a table. Nothing here changes what shot tracking collects; flows only read stored shots.

Motion: all from `tokens.css` (`--ch-ease`, `--ch-ease-spring-smooth`). Reduce Motion: no movement, `CH_FADE_MS` (180ms) fades; the stream shows whole sentences.

## 4. Tools to add (plan)

Reads (all team-scoped through `CoachChatContext`, all returning window, sample and computed time like today's reads):
- `get_shot_pattern(player_id?, club_or_band, since_days)` → miss_direction counts, distance-left distribution, inside-15/25 ft counts, lie split. From `golf_shots`.
- `get_proximity_by_band(player_id?, bands)` → average distance left by approach band.
- `get_round_detail(round_id)` → hole by hole: score, putts, penalties, GIR, shots.
- `get_root_causes(player_id)` → the Board's open causes (tee, approach, chip, putt) with confidence and since.
- `get_team_patterns()` → `v3/team-pattern` output.
- `get_practice(since_days)` → practice reviews, plans (when built), drill bank.
- `get_calendar(from, to)` → events, class conflicts, attendance.
- `get_course(course_id)` → tees, holes, difficulty from team scoring.
- `compare_seasons(metric_ids, player_id?)` → this season against last with last season's usual range.

Writes (confirm gated, same pattern as create_recurring_practice):
- `create_event` (single event; recurring stays as is)
- `create_practice_plan` (artifact, saved to Documents only on Save; Publish notifies players, Nick's exception) (fixed 4 Nov: the shared `draft_practice_plan`, practice-plan default 8)
- `save_document(artifact_id, folder_id)` and `create_folder(parent_id, name)`, both from the Save sheet only, never from the model on its own (fixed 4 Nov: the practice-plan lane's `savePracticePlanDraft({folder})` and `undoPracticePlanDraft`; no `create_folder`)
- Round 4, one tool per flow, each returning a draft first and writing only on the confirm press: `create_event`, `create_announcement`, `create_trip`, `create_qualifier`, `set_lineup` (calls `golf_tournament_set_entries` then `lock_lineup`), `create_task`, `create_goal`, `add_round_note`, `create_drill`. Drafts only, never sent by Ask: `draft_board` and `draft_poll` put an attachment or a poll into the coach's Messages composer through `messages/prefill.ts`.

Player view (decided by Nick: own switch, "just stats and visuals"): the same route with `role: 'player'`; every tool forces `player_id` to the signed-in player; no ranking or compare tools; policy says "you". **No write tools at all**: the player toolset is reads plus `show_visual`. Where the coach view would offer a confirm card, the player view shows the read-only thing instead (for example the drill their coach set, as a card with no button).

Player weekly allowance (Nick: "a 5 dollar weekly allowance … don't tell them it's 5 dollars, if they run out explain why and then a button pops up that'll send the company email requesting more credits"):
- Server-only cap: `PLAYER_ASK_WEEKLY_CAP_USD = 5`, in server config, never sent to the client.
- Usage: after each player stream (`onFinish`), add the request's model cost (input and output tokens times the model's price) to `ask_usage_weekly (player_id, team_id, week_start, cost_micros)`. `week_start` is Monday in the team's time zone. New table, held like the other migrations.
- Before each player request: if used ≥ cap, skip the model call and return one `data-allowance` part with state `out` and the reset day. The client only ever gets a bucket: `plenty`, `low` (under 20% left) or `out`. No dollars, tokens or percentages anywhere in the UI.
- UI: a quiet "Ask this week" meter on the player's Ask home ("Plenty left · resets Monday"; amber fill when low). When out: a card, "You've used this week's Ask", one plain reason (answers that read many rounds or draw charts use more; resets Monday morning), a line that past answers and stats still open, and the composer paused ("Ask is paused until Monday"). A moment later "Need more before Monday?" pops in with **Request more**.
- Request more: a confirm card (To: Helm Sports Labs support, From: player and team, a one-line note), "On confirm: one email goes to Helm Sports Labs once Undo closes. Your coach isn't emailed." Send request → receipt with 8s Undo → sent server-side by `request_ask_credits` through the app's existing transactional mail sender (confirm which one helmv3 uses before building) to a company address held in server config. One request per player per week; logged in `ask_credit_requests`. A design and data plan only; nothing is built or sent yet.

## 5. Build order (PR-sized, each behind `coachhelm_ask_v2`, off in prod)

1. Answer card, Activity line, past-tense labels (UI only).
2. Read chips and Sources from existing `data-evidence`.
3. Tool card skeletons; Follow-ups.
4. Confirm card and receipt on the four existing writes.
5. Artifact pane and sheet; practice_plan artifact (shares the wizard lane's plan model).
6. Shot reads and `miss_pattern`, `putt_profile` blocks.
7. Engine reads (root causes, patterns), `season_compare`, `hole_strip`.
8. Tone, CoachHelm knows (needs a small table, held like the other migrations).
9. Practice brief and Save to a folder (with the Documents lane's folder model).
10. Player view (own flag, read-only toolset), then the allowance table, meter, out card and Request more (held migration).
11. Create flow engine (`CreateFlow.tsx`, Worked out pills, home surface mocks) with event, task and round note first (tables exist), then announcement, travel, qualifier and goal, then board and poll (Messages prefill), then lineup (behind its own Tournaments switch) and drill (after the drill team call below).

## 6. Decided (Nick, 31 Oct)

1. Players get their own Ask behind its own switch: stats and visuals only, no writes, with the hidden weekly allowance above. Their comparisons are against PGA Tour marks (`golf_pga_standards` only) and the team average, never a named teammate (Nick 15:26: "They see against pga tour and team averages").
2. Artifacts save to Documents only on tap, through the folder picker; a published plan also files a copy in Practice plans.
3. Steps stay open while working and fold when done.
4. Announcements post on the coach's press of Post, with 8s Undo; players are told once Undo closes (see 6b).

## 6b. Round 4 calls (1 decided by Nick; 2 to 7 settled as defaults Nick can flip, per his "Handle any other questions they have", 31 Oct)

1. Announcements: decided by Nick, 31 Oct ("Yes"). Ask posts on the coach's press of "Post to 7 players", with 8s Undo; players are told only when Undo closes. Not a draft. Boards and polls stay drafts in the Messages composer.
2. `golf_drills` has no `team_id`, so a drill Ask saves would be in every team's bank. A team drill bank needs a held migration (`team_id` plus a policy) before the drill flow ships. Default: the drill flow is built but stays off, and the migration is written and held, not run; applying it is Nick's call. Flip: ship it with a coach-only bank (no team scope), not recommended because other teams would see the drills. (fixed 4 Nov: superseded by N-00 20261026010100; Ask's drill flow waits on that held migration, and HM5 is not written.)
3. Default: the lineup flow sits behind `golf_tournaments_v1` like the rest of Tournaments, so it only shows where Tournaments is on. Flip: its own switch.
4. Default: no Lift flow until Lift has a table; the gallery lists it as waiting. Flip: none needed, it is added when Lift ships.
5. Lineup: "Set the lineup" calls `golf_tournament_set_entries` with Undo; Lock is its own card after Told, calling `golf_tournament_lock_lineup`, with no Undo because the lock can't be undone. Flip: set and lock in one press, not recommended.
6. Request more follows `HELM_CUSTOMER_EMAIL_ENABLED`; with it off the request is logged and no email goes. Flip: send it outside the switch.
7. Qualifier and round note follow the fields that exist: no exemption question or tie rule; the note is always shared and appends. Flip: add the fields first.

## 7. Research kept (sources in the thread's notes)

Claude artifacts pane and versioning; ChatGPT "Thought for 5s" and tappable charts; Perplexity named source chips and steps disclosure; Claude Code and Cursor live todos and approval prompts; AI SDK typed tool parts (skeleton per state); assistant-ui approval states; Arccos round summary and practice focus; WHOOP's tone backlash (keep it non-judgmental and switchable); Oura's opt-in check-ins.


## Completeness pass, 4 Nov 2026

| Section above | Now |
|---|---|
| §12 Save to a folder | folders are names; Save writes at once; see 05 CP-F |
| Drill row in the create table | writes `golf_team_drills`; no "Who can see it?"; see 05 CP-L |
| Tools list | `draft_practice_plan` and the practice-plan lane's save path; see 02 §8 and §12 |
| §6b item 2 | HM5 superseded by N-00 20261026010100 |
| Failures, stop, drop, history, deep links, keyboard | defined in 05 under this heading (CP-B to CP-K) |
