DRAFT — needs owner approval before build (clubhouse.md: no board)

# Intelligence (coach): draft spec for a Clubhouse screen

Status: DRAFT. There is no owner board for this screen, so nothing here is built and nothing here is approved (`.claude/rules/clubhouse.md`, "Phone": a screen without a board needs a draft the owner approves first). This file covers desktop and phone. Catalog codes are TBD, and the page has no page ID until its build starts (`docs/clubhouse/README.md`, "Page IDs and numbers").

Written 2026-09-30 on `agent/clubhouse` at `21188ce5d`. Every claim about production is cited as `file:line` in the Fairway code as it is on that commit. Numbers about data come from read-only SQL on the production database on the same day. Anything under a "Proposed" heading is a proposal, not fact.

## Recommendation in brief

1. `.claude/rules/golf-feature-ownership.md:27-32` lists three areas (signals with alerts, patterns and insights filters; players; effectiveness). That is out of date. Production's `/intelligence` has four views, `home`, `lab`, `chat` and a deep-link-only `players`, and no Effectiveness view: `?view=effectiveness` opens Home (sections 1.1 and 1.7).
2. Build one Clubhouse screen at `/golf/dashboard/intelligence` with three views: Signals (production's The Lab), Players and Team (production's Home).
3. Signals first. It is the only place a coach sees every open signal (up to 218 on one real team, against the board's one top signal per player), the 71 open patterns, and the team roll-ups, and the only place Mark reviewed exists. It reuses `getSignalGroups` and the existing writes unchanged, and adds the Undo that production lacks, using the reversals that already exist server-side (an insight's prior lifecycle state needs one extra read, section 4 gap 2).
4. Players second. It is the coach's only roster-wide view of focus areas (about 15 inbound addresses point at it). Clubhouse Stats already covers one player's focus areas and adding one; nothing covers due for review, completing, recording an outcome, or logging progress across the roster.
5. Team third and lean. The numbers reuse `loadTeamIntelligence` and its pure modules. The four cause visuals (4,939 lines of Fairway UI) are not rebuilt: Clubhouse Stats already draws shot charts for one player, so each contributor leads there.
6. Chat is not built here. Q-85 says a third of its replies fail and it shows raw JSON errors, and the Clubhouse layout mounts no drawer (`layout.tsx:64-66`). `?view=chat` shows the "not rebuilt" page, as `routes/coachhelm.tsx:23` does for its unbuilt views.
7. Effectiveness is dropped. Production already dropped it: `FairwayEffectiveness` is mounted on no page, and the ledger it would score is thin: 6 coach actions and one focus area with a recorded outcome (section 1.8).
8. Folded into CoachHelm: the greeting and status line (the board already says "N open signals across M players"), the program pulse (board only), and the per-player top insight and its Assign and Dismiss (the board's `FocusCard`). The Signals dossier draws that same card so one insight reads the same on both.
9. Entry: no new sidebar item. The CoachHelm board gets one link to Signals, and the sidebar's CoachHelm item stays lit on `/intelligence`. Phone: Signals is a screen pushed from CoachHelm, not a tab.
10. Ten questions for the owner are in section 5. The first is whether the bundle's `m-ch.jsx` sketch is the intended design.

## 0. Sources read

`AGENTS.md`, `.claude/rules/clubhouse.md`, `.claude/rules/golf-feature-ownership.md`, `docs/clubhouse/README.md`, `MOBILE.md`, `phone/coachhelm.md`, `phone/roster.md`, `catalog/README.md`, `PROGRESS.md` (D-42, D-64, D-70, D-71, Q-76, Q-77, Q-85, Q-86), `CLICKABLES.md:960-975`. Design: `design/handoff/Coach - CoachHelm.html`, `Coach and Player - CoachHelm - Mobile.html`, `helm3.jsx`, `coachhelm2.css`, `m-ch.jsx`, `ch2-data.js`. Clubhouse: `src/clubhouse/screens/coachhelm/*`, `data/coachhelm*.ts`, `routes/coachhelm.tsx`, `shell/nav.ts`, `ui/*`, `lib/use-action.ts`, `lib/haptics.ts`, `lib/motion.ts`, `screens/stats/StatsPlayer.tsx`. Production: `intelligence/page.tsx` and every component and action listed in section 1.

## 1. Inventory of production Intelligence

Paths: `page.tsx` is `src/app/golf/(dashboard)/dashboard/intelligence/page.tsx`. `TriageDesk.tsx` is `src/components/golf/coachhelm/triage/TriageDesk.tsx` (its sibling files live in that folder). `Home` code is under `src/components/golf/coachhelm/intel/`.

### 1.1 The views and addresses

The page mounts `CoachIntelligenceHome`, which mounts `TriageDesk`. `TriageDesk` owns a top toggle of Home, The Lab and Chat (`TriageDesk.tsx:5-28`, `ViewSwitch.tsx:47-51`), backed by the query string. `view`, `filter`, `signal` and `id` are read in the browser; only `player` and `c` are read on the server (`page.tsx:82-96`).

| Address | What production does | Cite |
| --- | --- | --- |
| `/intelligence`, no `view` | Home. A `signal`, `id` or `filter` in the query means The Lab instead | `buildTriageViewModel.ts:57-80` |
| `?view=home` | Home | `:63-67` |
| `?view=lab` | The Lab | `:63-67` |
| `?view=signals` | The Lab (legacy value, kept for the old routes) | `:68-69` |
| `?view=effectiveness` | Home. The scoreboard tab is retired | `:70-71` |
| `?view=chat`, with `&c=<conversationId>` | Chat; `c` reopens that thread and is never cleared on other views | `TriageDesk.tsx:270-273`, `page.tsx:186` |
| `?view=players`, with `&player=<id>` and `&playersTab=areas` | Players. No toggle segment points at it, but the address stays reachable. A `player` id not on the roster is ignored | `TriageDesk.tsx:25-28,106-126`, `page.tsx:405-409` |
| `&filter=all\|urgent\|patterns\|category:<x>` | The queue chip. `alerts` maps to urgent, `insights` and the removed `new` map to all, anything else to all | `buildTriageViewModel.ts:91-118` |
| `&signal=<id>` or the legacy `&id=<id>` | Opens that signal's dossier; a stale id degrades to the default | `TriageDesk.tsx:113-118,472-477` |

The old routes are permanent redirects into these addresses (`next.config.mjs:321-348`): `/alerts` to `view=signals&filter=alerts`, `/patterns` to `filter=patterns`, `/insights` to `filter=insights` (and it forwards `id`), `/development` to `view=players` (and forwards `player`), `/analytics/coachhelm` to `view=effectiveness`. Roughly fifteen Fairway components link to `?view=players` (`buildTriageViewModel.ts:31-37`; for example `FairwayCoachRoster.tsx:177`, `GenomeDetailView.tsx:304`, `ScoutingReport.tsx:88`). Those matter only to people on the Fairway UI. A Clubhouse coach reaches the screen through bookmarks, the redirects above, and links Clubhouse itself writes; no Clubhouse code links to `/intelligence` today (`grep` of `src/clubhouse`).

### 1.2 The page around the views

| Behaviour | What happens | Cite |
| --- | --- | --- |
| No session | Redirect to `/golf/login` | `page.tsx:120-121` |
| A player, not a coach | `FeatureUnavailable`, "Open CoachHelm" | `:124-134` |
| Coach with no team | Redirect to `/golf/dashboard` | `:148-152` |
| No active players | `EmptyState` "No active players yet", "Invite players and log rounds. CoachHelm names what to work on as the stats cache builds.", action Open Roster. Shown only when the overview read succeeded | `CoachIntelligenceHome.tsx:117-131` |
| Overview read failed | Danger notice "Couldn't load team intelligence" with Try again (`router.refresh`); a failed read is kept apart from an empty roster | `:106-116,140-158` |
| Route loading | One Home-shaped skeleton for every view, because `loading.tsx` cannot read `?view=` | `intelligence/loading.tsx:1-25` |
| Route error | `RouteErrorBoundary`, "Failed to load Brief" | `intelligence/error.tsx:5-24` |
| Freshness | `force-dynamic`, so players' new rounds show at once | `page.tsx:77-80` |

The page reads eleven things in parallel (`page.tsx:201-239`): `getTeamOverview` (used only to tell a failed overview from an empty roster), `getAlertCounts` (only a badge count for Players), `getSignalGroups`, causal relationships and coach intents (each degrades to empty on error), `getTeamCategoryInsights`, the team timezone, the Players roster chain (`loadPlayersDrillData`, `:427-647`), the greeting inputs (`loadCommand`, `:652-675`), the Chat tab's inputs (`loadChatTab`, `:683-722`, null on failure), and Team intelligence (`:163-181`, which never rejects and turns a failure into "Team intelligence did not load. The rest of the page is unaffected."). The Chat inputs load on every view, not only Chat (`:182-186`).

### 1.3 Home (the default view): greeting, Scan team, Team intelligence

**Greeting and status line** (`CommandOpening.tsx:32-80`): "Morning, {first}." (or Afternoon, Evening, "Welcome back" before the clock is read), else the team name; then "{team} · N active players · last round {today, yesterday, N days ago, or a date}", or "no rounds recorded yet" (`:63-80,102-108`). Data: `getCoachChatContext` and `getCoachProgramPulse` (`page.tsx:662`). If either fails the page draws a screen-reader-only "CoachHelm" heading instead (`CoachIntelligenceHome.tsx:133-138`).

**Last scan and Scan team** (`TriageDesk.tsx:354-357,396-416,503-514,528-535`):
- The caption is "No scans yet", or "Last scan just now, Nm ago, Nh ago, Nd ago" (`buildTriageViewModel.ts:372-385`). It comes from the newest `golf_insight_generation_log` row, else the newest signal (`signal-groups.ts:295-306`).
- Scan team calls `refreshTeamAnalysisAsCoach` (`insights.ts:3720`, impl `:3641-3716`). It reruns the CoachHelm engine for every active player on the coach's team, three at a time, then `router.refresh()`. It is limited to 5 calls per minute per coach (`action-rate-limit.ts:27`), and the refusal reads "Too many analyze requests in the last minute — please wait a moment and try again." (`:48-56`).
- The button reads "Scan team", or "Scanning" while busy (`:503-514`). Outcomes: error toast with the server's text or "Could not scan the team. Try again." (`:401,413`); warning toast "Scan finished with N player(s) needing another pass." when some players failed (`:404-407`); success toast "Scan complete, team signals refreshed." (`:410`).

**Team intelligence** (`TeamIntelligence.tsx`): four theme cards for the team's stored strokes gained per round, with the cause visual and player spotlight for the chosen theme and a contributor list beside them. Every figure comes from `TeamIntelligenceData` and nothing is estimated (`:1-15`).

| Control | What it does | Cite |
| --- | --- | --- |
| Round type: All rounds, Practice, Qualifier, Tournament, each with a count | Filters the rounds in the slice | `:63-68,283-290` |
| Window: Season or Last 30 days | Season is the calendar year to today | `:293-300`, `aggregate.ts:27-40` |
| Compare: vs {tour baseline} or vs Team avg | Shifts each player's SG by the team mean | `:301-309,255-257` |
| Theme card (Off the tee, Approach, Around the green, Putting; short forms Tee and Around green on a narrow card), a toggle with `aria-pressed` | Chooses the theme. The default is the theme losing the most strokes | `:103-222,250-253` |
| Each card shows | SG per round, the change with Improving, Slipping or Flat (0.15 threshold), a sparkline, "SG / round · N rounds", "· M without SG", "Last 30 days …" beside the season, and "~X strokes / round per player available" with "K of N current players carry a measured leak" | `:129-142,167-219` |
| Cause visual: TeeCause, ApproachCause, ChipCause, PuttCause | Shot-level charts for the theme, filtered to the chosen player. 1,160, 1,403, 1,077 and 1,299 lines of Fairway UI | `:56-61,365`, `intel/causes/*` |
| Player spotlight | The chosen player, or the one losing most: six tiles against the team, the last 8 rounds against the team line, "Open profile" (a link to `/golf/dashboard/roster/{id}`) | `PlayerSpotlight.tsx:97-213`, `TriageDesk.tsx:541` |
| Who's contributing | Whole team row, then players worst to best with SG, a small bar, chips, a sparkline and round count. A tap filters the cause visual and spotlight; a second tap clears | `ContributorList.tsx:111-225` |

States: no players "No players on the roster yet" (`TeamIntelligence.tsx:406-407`); the payload failed, a danger notice with Try again (`:402-405`); no rounds in the slice, "No rounds in the last 30 days" with "Show the season", else "No rounds in this slice" with "Show all rounds" (`:314-334`). When the slice is already all rounds this season, that second button changes nothing (`:327`), so a team that has never posted a round meets a dead button. If `getTeamCategoryInsights` fails the strokes-available line is silently left off every card (`TriageDesk.tsx:540`).

Data: `loadTeamIntelligence` (`src/lib/golf/team-intelligence/loader.ts:70-164`) reads `golf_team_members`, `golf_teams` (gender), `golf_team_settings` (`sg_baseline`), `golf_pga_standards`, `golf_players`, `golf_rounds` (this season, completed, not test, countable, with the four stored `strokes_gained_*`) and every `golf_shots` row in those rounds, and throws on any failed read. The strokes-available figure comes from `getTeamCategoryInsights` (`page.tsx:226`, `intel/strokes.ts:22-44`).

### 1.4 The Lab (`?view=lab`): signal queue and dossier

`getSignalGroups` (`signal-groups.ts:90-316`, exported at `:324-328`) returns every open signal for the team, and everything after that is client-side (`TriageDesk.tsx:30-35`).

What a "signal" is:
- An insight: an active, not dismissed `golf_coach_insights` row that passes the shared visibility contract (v3 engine, lifecycle detected, matured, addressed or resolved), for players still on the roster (`:144-153,204`).
- A pattern: an active `golf_patterns_v2` row in state detected or confirmed, excluding the `contextual` type (`:169-191`). Patterns have no evidence blob (`:246-249`).
- A team roll-up (`team_synthesis`): derived from the per-player signals of players with a recent countable round, with the synthetic id `team:<metric>` (`:252-288`, `signal-grouping.ts:15-33`). It has no row behind it.

Rows are collapsed to one per player and metric, largest measured leak kept, the rest counted as "+N earlier" (`signal-grouping.ts:166-206`); grouped by player with the Team group pinned first; groups ordered worst severity first, then volume, then name (`:242-320`).

| Control | What it does | Cite |
| --- | --- | --- |
| Filter chips: All, Urgent, Patterns, one per category present, each with a count taken against the whole queue | Filters the queue; the address follows (`?filter=`) | `SignalQueue.tsx:104-113,157-206`, `buildTriageViewModel.ts:120-142` |
| Player group header (portrait, name, count, worst severity chip, chevron) | Collapses or expands the group. Groups start expanded | `SignalQueue.tsx:76,224-269` |
| Signal row (severity dot, category, claim in two lines, "+N earlier") | Opens the dossier; the address follows (`?signal=`). A real link, so a modified click opens a new tab | `SignalRow.tsx:61-129` |
| Arrow Up and Down in the queue | Moves focus and selection across visible rows | `SignalQueue.tsx:131-144` |
| Back from a dossier | Scrolls the queue to the row just closed and highlights it for 900ms | `SignalQueue.tsx:80-93` |
| Dossier header (portrait, "Team roll-up" or the name, category and "Pattern" and "N other open signals", severity chip) | Identity. On a phone it carries Back to the queue | `SignalDossier.tsx:223-258` |
| Title and claim | The claim is retold in the third person for the coach (`toCoachVoice`) | `:261-270` |
| Figure strip: Est. impact ("N.NN est. strokes per round"), Status, and Area or Occurrences | Impact is a generation-time estimate, clamped for one player and unclamped for a roll-up | `:158-199` |
| Evidence block | The shared compact evidence: a standing bar (player, team, Tour) or a benchmark scale, sample, window and a confidence word. The root-cause `diagnosis` is written on the row but only the expanded panel draws it, and The Lab does not use that mode | `:299-308`, `EvidencePanel.tsx:386-470,563-573` |
| Roll-up: "Where it comes from" | Contributors largest first, each with a share bar; a tap opens that player's own signal | `SignalDossier.tsx:429-489` |
| Prescribe (insights only, never a pattern or roll-up) | Opens the prefilled focus-area modal, then `createFocusAreaFromInsight` | `PromoteToFocusAreaButton.tsx:117,125-172` |
| Mark reviewed (not on roll-ups) | `reviewSignal` | `SignalDossier.tsx:322-331` |
| Dismiss (not on roll-ups) | `dismissSignal` | `:327-330` |
| View stats (when the signal has a player) | Link to `/golf/dashboard/stats?player=<id>` | `:332-336` |
| Related context (a player's signals only): Recent trend, Focus areas (active, up to 3), Active goals (up to 3), Other open signals for {name} | Read from data the page already holds; each block has a quiet line when empty | `:341-418` |

Write paths, and what each does to the database:
- Mark reviewed on an insight: `acknowledgeInsight` (`intelligence-dashboard.ts:704-788`) sets `status='acknowledged'`, `acknowledged_at` and `lifecycle_state='addressed'`, records an `acknowledged` action in `golf_insight_action`, revalidates. On a pattern: `markPatternAddressed` (`pattern-management.ts:688`) sets `lifecycle_state='addressed'` (`signal-groups.ts:336-348`).
- Dismiss on an insight: `dismissInsight` (`intelligence-dashboard.ts:600-693`) sets `dismissed`, `status='dismissed'`, `lifecycle_state='archived'` and records `dismissed`. On a pattern: `dismissPattern` (`pattern-management.ts:612`) sets `lifecycle_state='dismissed'`, `is_active=false` (`signal-groups.ts:355-367`). The board's dismiss (`insights.ts:1508`) writes the same columns and the same ledger row.
- Prescribe: `createFocusAreaFromInsight` (`development.ts:1799`) inserts a `golf_player_focus_areas` row with `status='proposed'` for the player to accept (`:1734`), refuses a second active focus on the same metric with `ACTIVE_FOCUS_DUPLICATE_ERROR` (`:1711`), then acknowledges the source insight (`:1757`) and records `create_focus`. The board's Assign uses `createFocusAreaFromInsightV2` (`writes.ts:30-35`, `development.ts:1385-1393,1409-1520`). It also proposes (`:1455`) and records `create_focus`, but it does not acknowledge the insight, and it takes no current or baseline value (its arguments are player, insight, title, description, area, metric, target value and timeframe).
- No write has an Undo in The Lab. The server has both reversals: `reactivateInsight` (`insights.ts:1595`) and `reopenPattern` (`pattern-management.ts:839`).
- Optimistic behaviour: the signal leaves the queue at once; on a failure it is put back without disturbing other changes (`TriageDesk.tsx:418-457`, `buildTriageViewModel.ts:207-259`). A roll-up never reaches the server (`:427`). Toasts: "Marked reviewed." and "Dismissed."; failure "Could not update the signal. Try again." (`:441,445,449,459-460`). Prescribe removes the signal and refreshes (`:462-470`).

Prescribe's modal (`FocusAreaModal.tsx:515-772`): Player (fixed here), Category, Title, Description, "Stat to improve" (a catalog by category, with the player's current value filled in and a suggested target), Custom metric, Current value, Target value and a Timeframe (none, a date, or a number of rounds); it asks before discarding edits, and shows the attached drill as a Practice Rx preview (`FocusAreaModal.tsx:362-381,603-611,798`, `PromoteToFocusAreaButton.tsx:36-38`). Server refusals include the duplicate-focus error and a wrong-way target (`development.ts:397-411,1698-1712`).

States: failed read shows a danger notice "Couldn't load signals" with Try again, and never "All clear" (`TriageDesk.tsx:564-568,576-579`); empty shows "All clear / No open signals right now. Scan the team after new rounds come in." (`:580-586`); a filter with nothing shows "Nothing here / No signals match this filter right now." with no action (`SignalQueue.tsx:215-221`); no signal selected shows "Select a signal" (`SignalDossier.tsx:137-147`); a stale `?signal=` leaves the desktop on the first signal and a phone on the queue (`TriageDesk.tsx:361-369,472-477`). The Lab's page verdict reads "N urgent signals need review across M players." plus who needs the most attention, "Nothing urgent. {name} has the highest-priority open signal.", or "All clear. No open signals right now." (`buildTriageViewModel.ts:343-362`). Urgent and High draw red in production (`SignalRow.tsx:25-30`).

Layout: on desktop the queue is a 380px column beside a dossier, each scrolling on its own; on a phone it is the list or the detail, with Back (`TriageDesk.tsx:128-132,588-626`).

### 1.5 Players (`?view=players`, no toggle segment)

`PlayersGridView` (`src/components/fairway/pages/coachhelm/PlayersGridView.tsx`, 1,517 lines) with `FocusAreaCard.tsx` (1,532), `FocusAreaModal.tsx` (817), `DueForReviewPanel.tsx` (222) and `RosterHealthHeader.tsx` (397). Title "Players", "Assign and track measurable development focus areas across your roster." (`TriageDesk.tsx:648-660`).

| Part | What it shows or does | Cite |
| --- | --- | --- |
| Header: Roster or Focus areas (segmented), and "New focus area" (primary) | Chooses the sub-view; opens the create modal | `PlayersGridView.tsx:834-861` |
| Roster health | Development coverage (the share of the roster with an active focus area), the outcome mix from recorded outcomes ("Did the coaching land?"), counts, and "Who needs your attention" (top 5 by priority: "Trending down · no focus area", "Trending down", "No focus area yet") | `RosterHealthHeader.tsx:41-143,206-268,309` |
| Due for review | Focus areas overdue or due within 7 days by `target_date`, and completed or overdue areas eligible for a follow-up by rounds since starting. Renders nothing when empty. `todayIso` is the team's day, resolved on the server | `DueForReviewPanel.tsx:1-80`, `due-for-review.ts:42-48`, `page.tsx:255-258` |
| Player filter | "Showing {name}" with Clear filter | `PlayersGridView.tsx:905-919` |
| Roster table (desktop) or cards (phone) | Player with an "Insights muted" badge when `alert_posture='silent'`, Rounds, Avg score, Trend, Focus areas (n active, n done), Goals, and per-row Add focus area, Game fingerprint, View genome. A row tap scopes to that player | `:640-800,925-990` |
| Focus-area board | Buckets Active, Pending acceptance, Declined, Completed. Empty: "No focus areas yet / Assign a focus area to a player to start tracking measurable progress." | `:1311-1517` |
| For one player: Goals (read-only) and "What moves together in their rounds" (causal relationships) | Read from the same page props | `:996-1018` |

Focus-area card, coach role (`FocusAreaCard.tsx:1040-1300`): title, category, status, description, a source chip (from an insight or a round review), an evidence-changed badge (behind a flag), criteria checklist and practice-session count (behind a flag), a progress trend, and the actions Edit, Log progress, Mark complete, Delete and the outcome capture "How did it go?" (Improved, No change, Worsened). A completed area collapses to a row with its outcome, a Reopen button and, while unrecorded, the outcome capture. A coach has no Accept or Decline; those are the player's.

Writes (all from `development.ts`, each with a toast): `createFocusArea` (emails the player about the new plan) and `updateFocusArea` through the modal; `completeFocusArea` "Focus area marked complete" or "Could not complete focus area"; `reactivateFocusArea` "Focus area reopened"; `updateFocusAreaProgress` "Progress logged" (value 0 up to 100,000, and only a note adds a point to the trend line); `deleteFocusArea` "Focus area deleted" after a forced-choice confirm "This can't be undone"; `recordFocusAreaOutcome` (completes the area and credits the source insight); `setFocusAreaCriterionMet` (`PlayersGridView.tsx:447-575,1170-1190`, `development.ts:1967`). Two flags gate parts of this: `coachhelm_focus_area_practice_log` and `coachhelm_focus_area_evidence_revision` (`page.tsx:288,475`).

Known production defects, already logged: Q-86 in `PROGRESS.md:312` (a co-staff coach is told "Focus area deleted" while the row survives; an outcome recorded on an area with no source insight still shows "How did it go?").

### 1.6 Chat (`?view=chat`)

`AskSurface` embedded as the third view (`CoachIntelligenceHome.tsx:160-179`). It stays mounted once opened so a streaming reply survives a trip to another view (`TriageDesk.tsx:162-167,631-646`). Its inputs come from `loadChatTab` (`page.tsx:683-722`): team name, roster names, the pulse's openers, a coverage line, an "as of" time, the coach's conversation list and the requested thread's messages. The same component is the standalone Ask page and the floating drawer.

| Control | What it does | Cite |
| --- | --- | --- |
| History toggle | Opens a rail of past conversations (an overlay on a phone); "No previous conversations." when there are none; a row opens that thread (`&c=<id>`) | `AskSurface.tsx:236-240,305-312` |
| New | Starts an empty thread and drops `c` | `:122-129,253-254` |
| Greeting and openers | "What do you want to know about {team}?" with the pulse's findings as tappable questions, the coverage line ("6 of 8 players have recorded rounds") and the "as of" time | `:366-369`, `ProgramOpening.tsx:75-87,104,143` |
| Composer | Text box "Ask CoachHelm" (placeholder "Ask about your program"), an @ picker of players, an "Add context or start an action" menu, removable context chips, Send, and Stop while a reply streams | `PromptComposer.tsx:92,286,359,381,400,415,460,491` |
| Answer | Streams text, charts and receipts, and persists them so a reload reproduces them | `stream/route.ts:5-25` |
| Action cards: Confirm or Cancel | The model can propose `create_recurring_practice`, `create_focus_area`, `create_task` and `create_team_announcement`; nothing runs until the coach confirms ("Confirmed." or "Cancelled. Nothing was created.") | `agent-tools.ts:91-96`, `ActionCards.tsx:127-157` |
| Try again | Shown under a failed answer; a retry reuses the turn's idempotency key | `CoachHelmChat.tsx:278-300`, `useCoachHelmChat.ts:96-100` |

Where it lives: `POST /api/coachhelm/v3/chat/stream` (`useCoachHelmChat.ts:33`), tables `golf_coachhelm_chat_conversations` (`persistence.ts:59-156`) and `golf_coachhelm_llm_calls`. Gates in the route: a rate limit per coach (`stream/route.ts:369`, answer "Too many requests. Please slow down."), a daily dollar budget per program (`:400-411`, answers "You have reached today's analysis limit for your program. It resets tomorrow.", or that analysis is switched off, or that settings could not be verified), a missing conversation (404), and idempotent replays. States: empty thread shows the greeting and openers; a failed load shows "Chat is unavailable / CoachHelm could not load your program context. Try again in a moment." (`TriageDesk.tsx:640-644`).

`PROGRESS.md:311` (Q-85) records why Chat is not ready to copy: 33 of 73 assistant replies in the database have status `failed` (7 coaches); on any non-2xx answer the coach sees the raw JSON body, for example `{"error":"Too many requests. Please slow down."}` (`CoachHelmChat.tsx:278-300`); and all 4 proposed chat actions stayed proposed. A chat that can post team announcements and create tasks writes outward to players, and each answer costs money. The floating drawer is not mounted in Clubhouse (`(dashboard)/dashboard/layout.tsx:64-66`), so a Clubhouse coach has no chat entry today.

### 1.7 Effectiveness, and the stale ownership table

`resolveTriageView` maps `effectiveness` to Home (`buildTriageViewModel.ts:70-71`); `analytics/coachhelm/page.tsx:23` redirects to it; `FairwayEffectiveness` is exported (`fairway/pages/coachhelm/index.ts:100`) and mounted on no page (a search of `src` finds no other use). `CommandPalette.tsx:95` still lists "Insight effectiveness" and lands on Home. `.claude/rules/golf-feature-ownership.md:27-32` still lists `view=signals&filter=alerts|patterns|insights`, `view=players` and `view=effectiveness` as three live areas; the code says otherwise, and AGENTS.md puts live code above prose. That table should be corrected in a separate change.

### 1.8 What the data looks like (read-only SQL, production, 2026-09-30)

| Fact | Value |
| --- | --- |
| Teams; teams with an open insight | 10; 8 |
| Open Lab rows on the largest team (status active, not dismissed, visible lifecycle, v3 engine) | 218 across 12 players, an upper bound because `getSignalGroups` also scopes to the current roster (`signal-groups.ts:204`); 217 after production's player-and-metric collapse. Next teams: 105, 97, 81 |
| Open insights by priority, all teams, same filter | 534 rows: urgent 5, high 42, medium 114, low 373. Without the lifecycle filter the count is 1,029, because 271 are archived and 175 tentative |
| Open patterns (active, detected, not `contextual`) | 71 (70 `conditional`, 1 `compound`, all medium). Including `contextual`: 1,047 |
| Insights with `evidence.diagnosis`, `evidence.standing` | 515 and 433 of those 534 rows |
| Coach actions ever recorded in `golf_insight_action` | 4 `create_focus` and 2 `dismissed` (one actor each), 1 `create_focus` by a player, 0 `acknowledged` |
| Insights with status acknowledged | 5 |
| `golf_player_focus_areas` | 26 rows, 6 with `from_insight_id`; 1 with a recorded `outcome_status` |
| `golf_insight_effectiveness` | 6,961 exposure rows, which the retired scoreboard read. 65 insights carry an `outcome_status` and none has `action_taken` |
| Largest team's season | 250 rounds, 18,772 shots |

Two readings follow. The queue can be long (a coach could face 217 signals, about 18 a player), so a phone list has to be built for that, not for the 5 to 8 signals on the owner's sample data. And the actions are barely used yet, which argues for reusing what exists and not for building a bigger workbench than the demand shows.

## 2. Overlap and recommendation

### 2.1 What the CoachHelm board already covers

The board (`src/clubhouse/screens/coachhelm/CoachBoard.tsx`, spec `phone/coachhelm.md`) draws the program pulse, the team's players each with their top signal and an open-signal count, and the chosen player's focus card with Assign as focus, Dismiss and Undo.

| Production Intelligence piece | On the board? |
| --- | --- |
| Greeting and "N players · last round" | Partly: the header line says "N open signals across M players" (`coachhelm-shape.ts:170-174`). Fold; the status line is not repeated |
| Program pulse | Yes, `getCoachProgramPulse` (`coachhelm.ts:267-270`). Production's Lab and Home do not draw it |
| One insight, drawn with evidence, drill and reasoning | Yes, `FocusCard` (`parts.tsx:99-139`) |
| Assign as focus and Dismiss with Undo | Yes: `createFocusAreaFromInsightV2`, `dismissInsight`, `reactivateInsight` (`writes.ts:30-35`) |
| Every open signal, filters, patterns, roll-ups | No. One top insight per player (`coachhelm.ts:256-264`) |
| Mark reviewed | No |
| Prescribe with a target metric and value | No; the board's Assign sets only the metric |
| Scan team and last scan | No |
| Team strokes gained by theme, Focus areas across the roster | No |

The two screens count nearly the same rows with different rules, so their numbers will sit close together without matching. The board's "open signals" is the feed's visible set (`status` not dismissed) after par scoring is collapsed to one card per player and rows the feed cannot draw are dropped (`coachhelm.ts:43-58`, `coachhelm-shape.ts:120-124`, `insight-delivery-ranking.ts:184-199`). Signals counts `status='active'` rows collapsed by player and metric (`signal-grouping.ts:166-206`), plus patterns and team roll-ups. On the largest team both start from the same 218 rows, 36 of them par scoring, so the board reads roughly 190 and Signals reads 217 plus patterns and roll-ups (SQL, section 1.8). See Q9.

### 2.2 What Clubhouse Stats already covers

- Team stats draws strokes gained by leg against a baseline, a scoring trend, every player's SG and putting by distance (`phone/stats-team.md:5-16`). Home's four theme cards say a rougher version of the same figures, plus a 30-day comparison, round type and "strokes available".
- Player stats (`?player=<id>&tab=game|dev|rounds|overview`, `routes/stats.tsx:20-38`) draws the shot charts for one player (`GameDetail.tsx`, `charts.tsx`: `GreenMiss`, `CupMiss`, `MakeCurve`, `FairwayStrip`) and a Development tab with that player's focus areas, goals, Accept and Decline, and for a coach "Add focus area" (`StatsPlayer.tsx:281-283,512-570`, `ProposalAnswer.tsx`, Q-77).
- Roster draws "Needs a look" chips and per-player focus-area counts (`Roster.tsx:308`, `RosterPeek.tsx:182`).

So the Players view's "Who needs your attention" and roster table repeat Roster, and the four cause visuals repeat, for one player at a time, what Game detail draws.

### 2.3 Design material in the bundle (not a board)

The v2 bundle carries three leftovers of an earlier Brief design: `m-ch.jsx` (`CoachHelmM`, a phone morning-brief card, a filter row, a signal queue and a signal detail with standing, "Why", a recommended action, Assign as focus and Send to), `ch2-data.js` (sample data shaped like the Lab's signals, with `diagnosis`, `standing`, `chain`, `viz`) and `coachhelm2.css` (`.c2-desk`, `.c2-brief`, `.c2-dx`, `.c2-eff`). No board renders any of them (`CLICKABLES.md:971`), the desktop half is absent, and the phone sketch puts the queue on the CoachHelm tab, which the approved phone board (`CoachBoard`) already occupies. This draft borrows their vocabulary (a dark-green summary card with three figures, severity badges, a strokes figure at the row's right, standing markers for Tour, Team and the player, a Why block). It does not treat them as approved. Q1 asks the owner.

### 2.4 Recommendation, view by view

| Production view | Decision | Reason |
| --- | --- | --- |
| The Lab | Build as **Signals**, first | The only full triage of insights, patterns and roll-ups, and the only Mark reviewed. The board deliberately shows one signal per player. Reuses `getSignalGroups` and the writes unchanged, and adds Undo from the reversals already on the server |
| Players | Build as **Players**, second | The only roster-wide place for due for review, completing, outcomes and progress. Stats covers one player and Roster covers "needs a look", so the header block "Who needs your attention" and the roster table are not rebuilt; the focus-area board, Due for review and the outcome mix are |
| Home: Team intelligence | Build as **Team**, third and lean | Adds what Stats does not: the theme trend with the last 30 days beside the season, round type, "strokes available", and who contributes. Numbers reuse the loader and pure modules. Cause visuals are not rebuilt (4,939 lines of Fairway UI); each contributor opens Stats Game detail |
| Home: greeting, status line | Fold into the screen header | The board already has the one-line summary; the status line is the pulse's `active_roster` and `latest_round_at` |
| Home: Scan team, last scan | Keep, in the header of Signals and Team | It is the only way to refresh signals on demand |
| Chat | Not built here; `?view=chat` shows the not-rebuilt page | Q-85; no Clubhouse chat entry exists; a billable LLM feature is an owner decision |
| Effectiveness (`?view=effectiveness`) | Dropped; the address opens Team, as production opens Home | Retired in production and mounted nowhere; the ledger it would score is thin (section 1.8) |
| Program pulse | Stays on the board; its rows gain their own `action.href` links once Signals and Players exist (`coachhelm-shape.ts:193-204` drops them today; `program-pulse.ts:173,437` supply "Review signals" and "Open development") | Avoids drawing the pulse twice |

### 2.5 Addresses in Clubhouse

No new routes. The screen serves `/golf/dashboard/intelligence`, chosen by `isClubhouseFor` in `page.tsx` and a `routes/intelligence.tsx` beside `routes/coachhelm.tsx`, and joins `CH_REBUILT_ROUTES.coach` (`nav.ts:111-125`). A player is not in `CH_REBUILT_ROUTES.player`, so today the shell would show its not-rebuilt page; production's `FeatureUnavailable` is Fairway UI and stays out of the Clubhouse frame. Proposed: the route draws a page `EmptyState` "Intelligence is for coaches" with the sentence production uses ("The Brief aggregates team-wide signals for coaches. Your personal AI coaching surface lives on the CoachHelm dashboard.", `page.tsx:124-134`) and one primary action, "Open CoachHelm" to `/golf/dashboard/coachhelm`, as `routes/coachhelm.tsx` does for its no-team state. A person who is neither a coach nor a player goes to login, as production does (`page.tsx:135`).

| Address | Clubhouse |
| --- | --- |
| `/intelligence` (no view) | Signals while Team is unbuilt; the default is Q4 |
| `?view=lab`, `?view=signals`, `&filter=`, `&signal=`, `&id=` | Signals. `filter` values keep their production meaning; `alerts` opens the top-severity chip |
| `?view=players`, `&player=`, `&playersTab=areas` | Players, scoped to that player; a stale id opens the roster |
| `?view=home`, `?view=effectiveness` | Team once built; before that the not-rebuilt page for "Team" |
| `?view=chat`, `&c=` | The not-rebuilt page for "Ask CoachHelm" (as `routes/coachhelm.tsx:23`). Never Fairway inside the Clubhouse frame (Q-76) and never Home unannounced |

`activeNavItem` (`nav.ts:93-101`) gives no owner to `/golf/dashboard/intelligence`, so the sidebar and tab bar would light nothing. The build maps it to the CoachHelm item.

### 2.6 Entry points

Signals is reached from CoachHelm, because the two are one story: the board says what to work on, Signals is every signal behind it.
- Desktop: a ghost button "All signals" at the right of the board's header, and the pulse rows' own links.
- Phone: a row under the board's header, "All signals" with a chevron, pushes Signals over CoachHelm (a `PhoneScreen`, so the edge swipe returns). Signals' top bar shows "‹ CoachHelm".
- Roster's "View insights" already opens the board on a player (`Roster.tsx:183`); Signals' dossier gets "Open on CoachHelm" back to `coachhelm?player=<id>`.

## 3. Proposed screens

These use the components that exist: `ui/Surface`, `Segmented`, `PillGroup`, `Avatar`, `Badge`, `Button`, `Modal`, `Menu`, `FormLine`, `ScrollRegion`, `SectionBoundary`, `InlineNotice`, `EmptyState`, `Skeleton`, `Toast` and the shell's `PhoneTop`, `PhoneBar`, `PhoneScreen`, `usePhoneStackHistory`, `useChPhone()`. Mutations go through `useAction` (offline refusal CH-1903, slow save CH-1902, error toast with Retry, success and error haptics, Sentry). Every page section sits in a `SectionBoundary`. Colour follows D-42: red only for destructive actions, priority in amber, gains green, losses amber. Type is Instrument Sans in sentence case, tabular numbers, `−` for minus, `—` for no data, no emoji, no exclamation marks.

### 3.1 The frame every view shares

Desktop (over 820px): the CoachHelm header pattern (`Head` in `screens/coachhelm/parts.tsx`): a "Coach" chip, an h1 "Intelligence", one line. The line is the view's own: Signals shows the production verdict (`buildBriefVerdict`), Players the coverage sentence, Team the status line ("Varsity · 12 active players · last round yesterday"). To the right: "Last scan 3h ago" (`formatRelativeScanTime`) and a secondary "Scan team" button on Signals and Team. Under the header a `Segmented` "Signals · Team · Players". A view that is not built yet is not drawn in it (the rule `nav.rebuiltHref` already applies). Max width and padding match `.ch-hl` (1180px, 36px 40px).

Phone (820px and under): `PhoneTop` with "‹ CoachHelm" and the title "Intelligence", and one trailing action, `PhoneIconAction` "Scan team" (Signals and Team only). Below it the same `Segmented`, full width at 44px. Then the view. With one view built the switch is not drawn and the title is that view's name.

Loading, all views: a route skeleton in the shell's skeleton style (150ms delay, 300ms minimum, shared shimmer, `Skeleton`). `loading.tsx` cannot read `?view=`, so it draws the Signals shape, the default.

Motion (D-64): changing view is a base (260ms) crossfade with a 6px settle (`CH_ROUTE`); first paint uses `.ch-reveal` (520ms, 10px rise, at most 10 blocks, 55ms stagger); nothing else staggers; no count-ups. Press is `useChPress` (110ms, about 6px, spring release). Reduced motion removes rise, press and shimmer, and turns pushes and sheets into fades.

Haptics (D-70): switching view or filter is `select`. Every other tap is silent unless listed.

### 3.2 Signals

**Primary action:** Prescribe, on a selected insight. On a pattern the primary is Mark reviewed, because patterns cannot be prescribed. A roll-up has no action of its own; its contributors open the players' own signals. Scan team is secondary everywhere.

**Desktop layout (Proposed).** Two columns as in production (380px and the rest, `TriageDesk.tsx:590`), each in a `Surface`, each scrolling on its own in a `ScrollRegion`.
- Left, "Signals · Worst first". A `PillGroup` of filters with counts: All, Priority, Patterns, then one per category present (Q5 on the word). Player groups follow: a 34px `Avatar`, the name, the count, the worst priority as a word pill, a chevron. Groups start expanded. A row is one button: a priority dot, the category as a small kicker, the claim in two lines, "+N earlier", and at the right the estimated strokes ("0.6 strokes", amber) when known. The selected row is a deeper well, never a green wash (`SignalRow.tsx:1-15`). Arrow keys move selection. Back highlights the row for 900ms, as production does.
- Right, the dossier. First the board's `FocusCard` for the insight (category and priority pill, the claim, the evidence, "This week", "Why we think this"), so an insight reads the same here and on CoachHelm. Around it, the Lab-only parts: a small figure strip (Est. impact, Status, Area or Occurrences); the action row; and Related context in a two-by-two of `Surface` blocks: Recent trend, Focus areas, Goals, Other open signals for {first name}. A pattern draws its claim and figure strip only (it has no evidence). A roll-up draws "Where it comes from", contributors largest first with share bars, each opening that player's own signal.
- Action row: "Prescribe" (primary, `Button` with the flag icon like the board's Assign), "Mark reviewed" (secondary), "Dismiss" (ghost with the archive icon, as on the board), "View stats" (ghost link to `/stats?player=<id>`).
- A signal that already has a live focus area made from it (`golf_player_focus_areas.from_insight_id`, states proposed, active, in progress or paused) shows the board's "Assigned as {first}'s focus" chip in place of Prescribe (the read the board already does, `coachhelm.ts:122-136`).

**Prescribe.** A `Modal` (a centred sheet on desktop, a full-height bottom sheet on phone) titled "Prescribe a focus area for {first}", with the fields production has: Area, Title, Description, Stat to improve (catalog by area, current value filled from the player's stats), Custom metric, Current, Target, Timeframe (none, date or rounds). "{first} sees it as proposed and accepts it to start" (the sentence Stats' sheet already uses, `StatsPlayer.tsx:562-563`). The Stats `FocusAreaSheet` has only Area, Title and Note, so this is a new, larger sheet; its catalog and suggestion logic is `lib/coachhelm/focus-areas/catalog.ts`, unchanged. Save is primary; asking before discarding edits uses the destructive-confirm pattern.

**Phone layout (Proposed).** Not the desktop squeezed: a list, then a pushed detail.
- List: below the switch, a summary card in the owner's sketch style (`m-brief`): the verdict sentence and three figures, Priority, Players, Signals, with "Last scan 3h ago" as its kicker. Under it a row of filter pills that scroll sideways (44px, counts). Then player sections: a header row (36px avatar, name, count, worst priority word), and rows of 56px or more: dot, category, two-line claim, strokes at the right. Each section shows its first 3 signals and "Show N more" (a proposal to keep 217 rows usable; production shows all). Tap pushes the detail.
- Detail (`PhoneScreen` with `usePhoneStackHistory`, so the edge swipe returns): `PhoneBar` with "‹ Signals" and a trailing Dismiss (archive icon). Content: the player's name and a priority pill, the title, the claim, the board's evidence card, "This week", "Why we think this" as a disclosure, then Related context as stacked `Surface` blocks, then "Other open signals" as rows. A pinned footer above the home indicator holds "Prescribe" (primary, full width) with "Mark reviewed" beside it. Prescribe opens a full-height sheet (its footer lifts by `var(--keyboard-height)`, `data-fw-keyboard-aware`).
- After Mark reviewed or Dismiss the detail pops to the list.

**States (Proposed; codes TBD).**

| State | When | They see | How |
| --- | --- | --- | --- |
| Loading | route load | The Signals skeleton: switch, summary card, six rows, and on desktop a dossier skeleton | route `loading.tsx`, shared skeleton |
| Failed read | `getSignalGroups` returns an error | `InlineNotice` "Couldn't load signals" with the server's reason (for example "Failed to fetch signals") and Try again. Never "All clear" | `router.refresh()`; offline shows "You're offline. Reconnect, then try again." (CH-1905) |
| Partial | the recent-rounds read fails while the rest reads | Signals draw; a quiet line "Team roll-ups count the whole roster" because the roll-ups fell back to it (`signal-groups.ts:276-283`). A failed roster, player or signal read is a failed read, not a partial one | inline note |
| First run: no roster | zero active players | `EmptyState size="page"` "Add players to start", one sentence, primary "Open roster" | as CH-13307 |
| First run: no signals, no scan on record | roster exists, `scannedAt` null | "No signals yet / CoachHelm reads posted rounds. Scan the team once players have posted rounds." Primary "Scan team" | page empty (D-71) |
| All clear | no signals, a scan on record | "All clear / No open signals right now. Scan the team after new rounds come in." Secondary "Scan team" | section empty in the panel |
| Filtered empty | a chip with no matching signal | "Nothing here / No signals match this filter." with "Show all signals" | `EmptyState compact` |
| No selection, desktop | none chosen | The first signal opens; the address stays unselected | `TriageDesk.tsx:361-369` |
| Stale link | `?signal=` no longer exists | Desktop: the first signal; phone: the list; no stranded empty detail | resolved from the groups |
| Section crash | a render error | That section only, `SectionBoundary` with a label | contained |

**Write toasts (Proposed; all through `useAction`, all with Retry).**

| Write | Failure title and hint | Success | Notes |
| --- | --- | --- | --- |
| Mark reviewed | "Couldn't mark the signal reviewed" / "It's still in your queue. Try again." | The row shows "Marked reviewed. Undo" in place for the rest of the visit | Undo is `reactivateInsight` (insight) or `reopenPattern` (pattern), each with the state the row had. A pattern's state is in the signal (`signal-groups.ts:242`). An insight's `lifecycle_state` is not (`:147` does not select it, and `status` on an insight is the coach axis, `:216`), so the write reads it first; see section 4 gap 2 |
| Dismiss | "Couldn't dismiss the signal" / "It's still in your queue. Try again." | The row shows "Dismissed. Undo" in place | The board's pattern (CH-13901), not a 4-second toast |
| Prescribe | "Couldn't prescribe the focus area for {first}" / "Nothing was saved. Try again." | "Prescribed. {first} sees it as a proposal and accepts it to start." | A player who already has an active focus on the metric (`ACTIVE_FOCUS_DUPLICATE_ERROR`) is treated as done, as on the board: "{first} already has a focus on this" |
| Scan team | "Couldn't scan the team" with the server's sentence (for example the 5-per-minute refusal, which is short and plain enough to pass `friendlyReason`) | "Scan complete" | Some players failed: an error-toned toast "Scan finished, but N players need another pass" (a `useAction` `refine`, as Approve all does) |

Offline: `useAction` refuses before any request, with `error` haptic and "…: you're offline / Reconnect, then try again. Nothing was changed." and Retry (CH-1903). Because the refusal comes first, nothing has moved yet and nothing needs rolling back. When a write is sent and fails, the signal is put back, as production does.

Scan team runs the engine for every player and can take a while. The generic slow-save toast says "Still saving…" (CH-1902), which is the wrong word for a scan. Proposed: the button reads "Scanning", and a status line under the header says "Scanning N players. This can take a minute." while it runs; the build decides whether `useAction` takes a copy override or Scan team uses its own progress state.

**Haptics.** Filter pill and signal row: `select`. A group header is a disclosure and stays silent. Prescribe (primary): `press` on tap, `success` when it saves (Assign in D-70's list). Dismiss: `warning` before the write, then `success` or `error`. Mark reviewed and Scan team: silent on tap, `success` or `error` from the write. Opening the phone detail: silent (a push). The Prescribe sheet settling: `commit`.

**Motion.** A signal leaving the queue collapses over 260ms; the phone push and pop are the 260ms slide; the sheet rises in 260ms and follows the finger; group chevrons turn in 180ms.

### 3.3 Players

**Primary action:** "New focus area" (primary, as production `PlayersGridView.tsx:858`), opening the same Prescribe sheet with a player picker. Everything else on a card is secondary.

**Desktop layout (Proposed).** The board's own pattern (`ch-hl-cgrid`): a "By player" list on the left and the chosen player's focus areas on the right.
- Above both, one row of two `Surface` blocks: Coverage ("7 of 12 players have an active focus area", with active and done counts) with the outcome mix ("Did the coaching land?", Improved, No change, Worsened from recorded outcomes, and an honest "No outcomes recorded yet"), and Due for review (overdue and due within 7 days, up to 5 and "+N more", and areas ready for a follow-up review). Each due row opens that player. Due for review is absent when nothing is due, as in production.
- Left: an "Everyone" row, then players (`Avatar` 34px, name, "2 active · 1 proposed", the trend word). A player with `alert_posture='silent'` reads "Insights muted" (production `PlayersGridView.tsx:659-668`).
- Right: for the chosen player, their active goals (read-only) and then focus-area cards in buckets Active, Pending acceptance, Declined, Completed. "Everyone" shows the same buckets across the roster, with the player's name on each card.
- Card: title, area chip, status pill (Proposed, Active, Paused, Completed, Declined), a metric line "Putts per round · 32.1 to 30.0 by Nov 12" with a thin progress bar from the baseline and a spark of progress points, a source chip that opens the source signal (`?signal=`) or the round review, and, behind their flags, criteria and practice count. Actions: Log progress and Mark complete (secondary, small), a `Menu` with Edit and Delete (red, behind a confirm). A completed card is one row: outcome, date, Reopen, and "How did it go?" as a three-way choice until recorded.
- Not rebuilt: the roster table and "Who needs your attention" (Roster's "Needs a look" is that), and "What moves together in their rounds" (causal relationships; no Clubhouse counterpart, see Q8).

**Phone layout (Proposed).** A list, then a pushed player screen.
- List: coverage sentence and a Due for review card (tap filters to those players); then one row per player: `Avatar` 40px, name, "2 active · 1 proposed", trend word, chevron, and "Insights muted" when it applies. Trailing top-bar action: a plus, "New focus area".
- Player screen (`PhoneScreen`, history-backed): name and class, then goals, then cards. Card actions sit behind one "⋯" that opens an action sheet (Log progress, Mark complete, Edit, Delete in red), because four small buttons on a card are not 44px targets. Pinned footer: "New focus area" for this player.
- Log progress is a small sheet: the current and target readout, a numeric field (`inputmode` decimal), an optional note ("A note adds a point to the progress trend"), Save progress.

**States (Proposed; codes TBD).**

| State | They see |
| --- | --- |
| Loading | Skeleton: two summary blocks, six player rows, cards |
| Failed read | `InlineNotice` "Couldn't load development data" with Try again. A roster that failed never reads as "No players" (production `PlayersGridView.tsx:814-825`). A failed outcome or review read is only logged in production and the panel then reads "none recorded" (`page.tsx:598-612`); Clubhouse says that read failed |
| First run: no roster | Page empty "Add players to assign focus areas", primary "Open roster" |
| First run: no focus areas | Page empty "No focus areas yet", "Assign a focus area to a player to start tracking measurable progress.", primary "New focus area" |
| Player with none | Section empty "No focus areas for {first} yet", primary "New focus area" |
| Filtered empty | A bucket with none is not drawn; the player filter with no match cannot happen (the list is the roster) |
| Nothing due | Due for review is not drawn |
| Write failures | Each is a `useAction` toast with Retry. "Couldn't mark the focus area complete" / "Nothing was saved. Try again." "Couldn't reopen the focus area". "Couldn't log progress" (value errors are inline before the write: "Enter a number to log progress." and "Value can't be negative, enter 0 or higher."). "Couldn't record the outcome". "Couldn't delete the focus area". "Couldn't save the focus area" (duplicate, wrong-way target and validation text from the server are shown as written) |
| Offline | CH-1903 as everywhere; the form keeps what was typed |

**Haptics.** Choosing a player, a bucket or an outcome: `select`. New focus area (primary): `press`; saves: `success`. Mark complete, Reopen, Log progress, Record outcome: silent on tap, `success` or `error` from the write. Delete: `warning` on the red button, then `success` or `error`.

**Motion.** As Signals. Cards use the first-paint reveal only.

### 3.4 Team

**Primary action:** none. It is a read view; the one action that leads out is "Open {first}'s stats".

**Desktop layout (Proposed).** Under the frame: the filters in one row, Round type as a `PillGroup` with counts (All rounds, Practice, Qualifier, Tournament), Window as a `Segmented` (Season, Last 30 days), Compare as a `Segmented` (vs {baseline}, vs Team avg). Then four theme `Surface` cards in a row (Off the tee, Approach, Around the green, Putting): the SG per round in tabular numbers (a true minus, gains green, losses amber), the change with its word, a spark, "SG / round · N rounds" and "· M without SG", "Last 30 days …" beside the season, and the strokes-available line. The chosen card takes the deep-green "on" treatment the owner's sketch uses. Below, two columns: "Who's contributing" (Whole team, then players worst to best) and the spotlight for the chosen player, or the worst in the theme: six tiles against the team, the last 8 rounds against the team line, and a link "Open {first}'s stats" to `/stats?player=<id>&tab=game`, where that player's shot charts already are. The cause visuals are not drawn.

**Phone layout (Proposed).** A two-by-two of theme cards (44px touch, chosen card dark), a Round type pill row that scrolls sideways, Window as a `Segmented` and Compare inside the contributor header. The contributor list is rows (avatar, name, SG, spark, rounds); a tap pushes the spotlight as a `PhoneScreen` with the tiles, the trend and "Open stats".

**States (Proposed; codes TBD).**

| State | They see |
| --- | --- |
| Loading | Skeleton of the filter row, four cards and the two panels |
| Failed read | `InlineNotice` "Couldn't load team intelligence" with the loader's sentence and Try again |
| Strokes available did not load | Cards draw without that line, and a quiet note "Strokes available didn't load" (production drops it silently, `TriageDesk.tsx:540`) |
| First run: no roster | Page empty "Add players to see where the team loses strokes", "Open roster" |
| First run: no rounds this season | "No rounds this season yet", "Team intelligence reads posted rounds." Primary "Open roster". No dead "Show all rounds" button (`TeamIntelligence.tsx:327`) |
| Filtered empty | "No rounds in the last 30 days" with "Show the season", or "No rounds of this type" with "Show all rounds" |
| Few rounds with SG | The card says "N rounds without SG"; under three rounds a player reads "Early read", as the other Clubhouse pages do |
| Offline | The filters are client-side and keep working. Try again on a failed read says "You're offline. Reconnect, then try again." (CH-1905) |

No writes, so no write toasts. Haptics: theme card, contributor row, filters `select`. Motion: the chosen card's fill changes in 180ms; the spotlight swaps as a 260ms crossfade.

### 3.5 Views that are not built

`?view=chat` (and `&c=`) and, until they ship, `players` and `home` show the shell's `NotRebuilt` page with the view's name (CH-1301), inside the Clubhouse frame.

## 4. Data

**Reused unchanged.**

| Part | Loader or action | Note |
| --- | --- | --- |
| Signals list, scan time | `getSignalGroups` (`signal-groups.ts:324-328`) | Team access and roster scoping happen inside the action (`:56-72,103-119`); grouping, dedupe and roll-ups are the pure functions in `signal-grouping.ts` |
| Queue logic | `buildTriageViewModel.ts` (filter, counts, verdict, optimistic remove and restore, roll-up contributors), `signal-grouping.ts` | Pure; no Fairway import. The precedent for importing `components/golf/**` logic is `coachhelm-map.ts:3-4` |
| Writes: review, dismiss | `reviewSignal`, `dismissSignal` (`signal-groups.ts:346,365`) | |
| Writes: Undo | `reactivateInsight` (`insights.ts:1595`), `reopenPattern` (`pattern-management.ts:839`) | Existing; The Lab does not call them today |
| Prescribe | `createFocusAreaFromInsight` (`development.ts:1799`); catalog `lib/coachhelm/focus-areas/catalog.ts` | |
| Scan team | `refreshTeamAnalysisAsCoach` (`insights.ts:3720`) | |
| One insight's card | `toChInsight` (`coachhelm-map.ts:160-190`) and the board's `FocusCard` | Needs an `EvidenceInsight` (drills and lifecycle), which `getSignalGroups` rows do not carry; see gaps |
| Header line, greeting inputs | `getCoachProgramPulse`, `getCoachChatContext` | Already used by the board |
| Related context | The page's own roster, focus-area, stats and goal reads (`page.tsx:427-647`, `loadActiveGoalsForPlayers`, `loadPlayersStandingMap`) | |
| Players view | `loadPlayersDrillData` reads, and `development.ts`: `createFocusArea`, `updateFocusArea`, `completeFocusArea`, `reactivateFocusArea`, `updateFocusAreaProgress`, `deleteFocusArea`, `recordFocusAreaOutcome`, `setFocusAreaCriterionMet` | |
| Due for review | `computeDueFocusAreas`, `computeFollowUpEligibility`, `loadFollowUpRoundCounts` | Pure and server loaders; the team's day is resolved on the server (`page.tsx:255-258`) |
| Roster health | `computeRosterHealth` (`RosterHealthHeader.tsx:71-133`) | Exported from a Fairway component file; the coverage and outcome-mix arithmetic should be lifted into a plain module rather than importing the component |
| Team | `loadTeamIntelligence`, `aggregate.ts`, `theme-stats.ts`, `strokes.ts`, `getTeamCategoryInsights` | `theme-stats.ts` and `shared.ts` import no Fairway code; `shared.ts` carries some colour constants that the build replaces with Clubhouse tokens |

**Gaps and decisions for the build (the data exists; the plumbing does not).**

1. The dossier's card. `toChInsight` needs an `EvidenceInsight`. The Lab's rows carry the evidence blob and text but no drills and no lifecycle state. Either build a `ChInsight` from the Lab's row and leave "This week" out when there is no drill (never invent one), or read the delivery shape for the selected signal. The first is the smaller change.
2. Undo needs an insight's prior lifecycle state, which `getSignalGroups` does not return. `reactivateInsight(id, prior)` restores to `detected`, `matured`, `addressed` or `resolved`, and defaults to `detected` (`insights.ts:1595-1690`), which would demote a `matured` row (116 rows are active and `matured`, all teams). Options: (a) the Clubhouse write reads the row's `lifecycle_state` just before it acts, no change to a shared action; (b) add `lifecycle_state` to `getSignalGroups`' select (`signal-groups.ts:147`), an additive change to what its header calls a frozen contract; (c) accept the `detected` default. Recommended: (a).
3. Team loads every tracked shot for the season, 18,772 on the largest team, though the lean Team view draws none of them. `loadTeamIntelligence` would need an option to skip shots (an additive change to a shared loader), or the view accepts the server cost.
4. Patterns have no evidence and cannot be prescribed (a `golf_player_focus_areas` row links only to an insight, `PromoteToFocusAreaButton.tsx:8-13,117`). Shown honestly; no invented action.
5. `evidence.diagnosis` (root cause, drivers, recommended action) exists on 515 of the 534 open, visible rows and is not drawn in The Lab (`EvidencePanel.tsx:563-573`). The owner's sketch draws it. Drawing it is a design choice (Q1), not a data gap.
6. Ledger use is thin (section 1.8); nothing here writes a new kind of row.
7. No new table, column or migration is needed for the recommended scope. No new server action is needed either, provided Undo takes option (a) of gap 2 (a read in the Clubhouse write) and Team accepts the shot cost of gap 3 or takes an additive loader option. "Assigned" chips and the Players view use what exists.

**No data, so not drawn.** A "morning brief" written by a model (the sketch's "Morning brief" card is only the deterministic verdict here), any "Send to {player}" (no action shares an insight; the same gap `phone/coachhelm.md:34` records for Share), and a diagnosis or standing on a pattern.

## 5. Open questions for the owner

Each has a recommended answer first.

1. **Is `m-ch.jsx` the intended Brief design?** Recommended: use it as reference vocabulary only, and approve this draft's Signals layout, with Signals pushed from CoachHelm on the phone. Its queue-on-the-CoachHelm-tab conflicts with the approved CoachHelm phone board. If it is the intended design, send a board and this draft is redone against it.
2. **Scope and order.** Recommended: Signals, then Players, then Team; Chat not built; Effectiveness dropped. Alternative: Signals only, with Players and Team showing the not-rebuilt page until wanted. Trade-off: Players has about 15 inbound links from Fairway, none from Clubhouse yet.
3. **Entry.** Recommended: no new sidebar item; one "All signals" link on the CoachHelm board (header on desktop, a row on the phone), and the sidebar's CoachHelm item stays lit on `/intelligence`. Alternative: a separate sidebar entry, which changes the owner-drawn navigation (D-66). This also needs the board's approved design to gain one link.
4. **Which view opens on a bare `/intelligence`?** Recommended: Signals, because the board already gives the program read and the coach's list of jobs is Signals. Production opens Home (Team). Only a bookmark reaches a bare address from Clubhouse; the old-route redirects always carry a `view`.
5. **Priority words and the Urgent chip.** Recommended: the board's three words (Priority, Worth closing, Minor) on every pill, and a filter chip "Priority" covering urgent and high, so `?filter=urgent` and `alerts` open it. Why: production says Urgent, High, Medium, Low (`SignalRow.tsx:32-41`) while the board treats `urgent` as `high` (`coachhelm-shape.ts:14,146`). The chip's meaning would change: production's Urgent is only `urgent`, which is 5 open rows across all teams, against 47 for urgent and high. Alternative: keep production's four words and colour depth.
6. **One assign path.** Recommended: keep both writes as they are, show the "Assigned" chip in Signals for any insight with a live focus area, and revisit merging them on the server later. Why: Signals' Prescribe uses `createFocusAreaFromInsight`, which sets a current and baseline value and marks the insight acknowledged so it leaves the queue. The board's Assign uses `createFocusAreaFromInsightV2`, which does neither, so an insight assigned on the board stays in Signals. Both create a proposal the player accepts (Q-77). The mirror also holds: an insight marked reviewed, or prescribed, in Signals stays on the board, because the board's read excludes only dismissed rows (`insight-visibility.ts:84-88`). Alternative: after the board's Assign, also acknowledge the insight (one more write, a server change).
7. **Long queues.** Recommended: on the phone, three signals per player and "Show N more" (217 rows on the largest team would otherwise be one very long scroll). Production shows every row. Alternative: keep production's full list, groups collapsed after the first.
8. **Causal relationships** ("What moves together in their rounds", `CausalWhyPanel`) and **Goals** in the Players view. Recommended: draw goals read-only (they are one line each) and leave causal relationships out for now; Stats' Development tab shows goals already. Alternative: rebuild the causal panel.
9. **Two nearby counts of open signals.** Recommended: label them differently (the board "open signals", Signals "to review") and put no count on the board's link. Why: the board counts the feed's visible set with par scoring collapsed; Signals counts what The Lab keeps, plus patterns and roll-ups (on the largest team about 190 against 217 plus patterns), and a reviewed signal leaves Signals but stays counted on the board (Q6). Alternative: make Signals apply the board's collapse, which changes production's queue logic and hides rows a coach can act on. Either way a coach on that team faces about 200 signals, which is Q7's point.
10. **Chat.** Recommended: fix the failing replies and the raw JSON errors first (Q-85, a separate production PR), then decide whether Clubhouse gets a chat entry and who pays for it. Until then `?view=chat` shows the not-rebuilt page.

## Not verified

- No board exists to compare against; every layout here is a proposal.
- Run time of Scan team is not measured. The page sets no `maxDuration` (`page.tsx` has none), so whether a scan of a full roster fits the platform limit is not checked.
- Why a third of Chat's replies fail was not investigated; section 1.6 takes the figures from Q-85. The chat inventory covers the controls, gates and states, not the model's tools beyond the four that need confirmation.
- The board's open-signal count on real data was not run (server code needs a session). The "roughly 190" in section 2.1 is 218 rows less 36 par-scoring rows plus at most one per player, from SQL, and ignores rows the feed cannot draw.
- Nothing was built, run in a browser or on a device.
