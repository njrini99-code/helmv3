# Feature: CoachHelm AI

<!-- schema-drift-banner -->
> **⚠️ 1 identifier named below does not exist in the database.**
> Verified 2026-08-19 against production. `golf_insight_evidence`
>
> It is described here as if live. Do not query, type, or build on it —
> check `src/lib/types/database.ts` (or `memory/glossary.md`'s AUTOGEN blocks)
> before trusting any table name in this file. Declared absent
> below so `npm run docs:schema-drift` exempts them structurally
> instead of carrying them in the numeric baseline. Removing this
> reference entirely is a ratchet-down — re-run
> `node scripts/check-doc-schema-drift.mjs --update` after.

<!-- schema-drift-absent: golf_insight_evidence, golf_round_recap_locks -->


## Status

- active

## Current State

CoachHelm is the golf intelligence layer. It turns round, shot, standing, player, and team context into coach-facing and player-facing insights, recommendations, narratives, and follow-up surfaces.

The feature currently spans two generations:

- **V2**: established insight mining, prediction, learning, NLG, post-round triggers, and coach/player feedback loops.
- **V3**: newer generator framework for composite insights, counterfactuals,
  player genome, provider ingest, goals, intent, LLM narratives, practice
  recommendations, qualifying, and chat.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/coachhelm/**`
- `src/app/golf/(dashboard)/dashboard/analytics/coachhelm/**`

### Components

- `src/components/golf/coachhelm/**`

### Actions And APIs

- `src/app/golf/actions/coachhelm-data.ts`
- `src/app/golf/actions/coachhelm-analytics.ts`
- `src/app/golf/actions/insight-delivery.ts`
- `src/app/golf/actions/insight-management.ts`
- `src/app/golf/actions/intelligence-dashboard.ts`
- `src/app/golf/actions/player-feedback.ts`
- `src/app/golf/actions/v3/**`
- `src/app/api/cron/coachhelm*.ts`
- `src/app/api/cron/v3/**`

### Engine Code

- `src/lib/coachhelm/v2/**`
- `src/lib/coachhelm/v3/**`
- `src/lib/coachhelm/v3/chat/engine/**`: the chat turn engine on `@anthropic-ai/sdk` (see "CoachHelm chat: the engine").
- `src/lib/coachhelm/v3/analyst/**`: the analyst, the first slice of the insight engine's replacement. A typed fact sheet per player (35 measures over last 10 / previous 10 / season, measured and estimated strokes gained kept apart, team blocks coach-only), `findNotable` (one season priority per player traced to a band and a counted pattern, at most three tested signals), and a read-only dry run (`scripts/coachhelm/analyst-dry-run.ts`, refuses production). Pure; not wired to any surface, cron or table yet. Contract: `src/lib/coachhelm/v3/analyst/README.md`.
- `src/app/api/coachhelm/v3/chat/stream/route.ts`: the chat endpoint; it binds the Clubhouse screens' loaders for the tools.

## Core Data

- `golf_coach_insights`
- `golf_insight_evidence`
- `golf_insight_player_feedback`
- `golf_insight_generation_log`
- `golf_insight_effectiveness`
- `golf_patterns_v2`
- `golf_predictions`
- `golf_player_focus_areas`
- `golf_player_stats_cache`
- V3 tables such as CoachHelm settings, player genome, ingest, qualifying, budget, chat, and outcome attribution tables.

Use `memory/context/golfhelm-database.md` for exact columns and `memory/glossary.md` for table lookup.

## Business Rules

### CoachHelm chat: the engine (rebuilt 2026-11-10)

This section is the current truth for how a chat turn runs (coach Ask, quick chat, the practice helper, Fairway's
chat and the player's Ask). It replaces what older entries below say about the stream route: the held answer text, the
withheld card, the repair pass, the `<<<CLAIMS>>>` / `<<<CITES>>>` blocks as a gate, `denyAbandonedApprovals`, the
dangling-tool-call filters, `prompt-cache.ts`, `ask-perf.ts` and the AI SDK (`ai`, `@ai-sdk/*`) in the chat path. Those
entries are history. The tool list and the prompt are described where the tools are.

- **The server owns the conversation.** The browser sends one thing per request to
  `POST /api/coachhelm/v3/chat/stream`: `{ conversation_id, client_turn_id, surface, message, screen? }` or
  `{ conversation_id, client_turn_id, surface, decision: { key, approved } }`. It never sends the thread. The server
  loads the stored turns, appends, runs the turn and stores the exact result (`src/lib/coachhelm/v3/chat/engine/`:
  `turn.ts` one request, `loop.ts` the model loop, `store.ts` the stored conversation, `tasks.ts` the action gate,
  `model.ts` the only file that calls `@anthropic-ai/sdk`, `protocol.ts` the wire events and the reducer, `tool.ts`
  the tool contract).
- **A model per surface** (`engine/model.ts`; owner decisions 2026-11-10): `SURFACE_MODEL` names the model a surface
  runs on and `MODEL_PROFILES` holds each model's settings (`profileFor(surface)` is the one lookup). Ask, quick chat
  and the practice helper run on **Claude Sonnet 5.5** (`claude-sonnet-5-5`, `MODEL_FOR_TASK.coach_chat`) at effort
  `medium`; a player's read-only Ask runs on **Claude Haiku 5.5** (`claude-haiku-5-5`, `PLAYER_CHAT_MODEL`) at effort
  `high`. Switching a surface is one line; `CHAT_MODEL_OVERRIDE` puts every surface on one model for an eval run and
  is null otherwise. Both are called directly with `ANTHROPIC_API_KEY` (no gateway fallback: a missing key is a
  logged, coach-readable failure). `max_tokens` 16000, streamed. Thinking is adaptive (never `disabled`: Sonnet 5.5
  rejects that); depth is `output_config.effort`, sent on every request. No sampling parameter is sent. `tool_choice`
  is `auto` (never forced: Sonnet 5.5 rejects a forced tool); the step after the last allowed read is sent with `none`
  so the model answers from what it has. At most 12 model calls plus that closing call per coach turn
  (`CHAT_MAX_STEPS`), 8 for a player.
- **Optional features are one object per profile** (`ChatFeatures`; `chatFeatures(surface)`), each a field that turns
  it off: `dropStaleThinking` (`thinking.block_binding.prefix_mismatch_behavior: 'drop_block'`, beta
  `thinking-binding-controls-2026-08-01`), `strictTools` (`strict: true`; the engine still validates every input with
  zod), `citations` (below), `compaction` (`compact_20260112` at the default trigger, beta `compact-2026-01-12`),
  `programmaticReads` (below), and on Sonnet 5.5 only `progressNotes` (`thinking.display: 'updates'`, beta
  `thinking-display-updates-2026-08-18`: the model's short progress updates reach the thread as `note` events) and
  `refusalFallback` (next item). Built and off: `taskBudgetTokens` (null). If the API rejects a request (HTTP 400)
  that carries any of them, the loop sends that call once more as a plain request (no beta, no `strict`, no code
  tool, no `fallbacks`), keeps the rest of the turn plain, completes the turn and logs `v3.chat.stream.degraded` as
  an error: the coach loses the feature, not the answer.
- **Refusal fallback (Sonnet 5.5 only).** Requests carry `fallbacks: 'default'` (beta
  `server-side-fallback-2026-07-01`): when the model declines for a category the API retries, the API answers with a
  substitute model inside the same response. The loop keeps the words already streamed, drops from the echoed turn
  what the declining model left before the handover (`echoable()` in `engine/loop.ts`), bills each attempt at the
  rates of the model that ran it (`usage.iterations`) and logs the substitute's id (`fallbackModel` in
  `v3.chat.stream.turn`). If the substitute declines too, the turn is an ordinary declined turn. Haiku 5.5 has no
  such fallback and is never sent the parameter.
- **The model's code calls the reads (programmatic tool calling): ON for Ask, quick chat and the practice helper,
  OFF for a player.** The model may write code that calls the read tools in Anthropic's code execution sandbox and
  works a figure out there, so a question across many players or rounds is one model call instead of one per read.
  **With this on, the results of those reads (players' names and figures) pass through Anthropic's code execution
  container. Anthropic retains that container's data for up to 30 days and the feature is not eligible for zero data
  retention. The owner chose this on 10 Nov 2026** ("It's not minors. Turn it on."). The switch is
  `programmaticReads` in each model profile's features in `engine/model.ts` (a player's is always off). What does not change: every read the code calls is validated
  by the tool's zod schema, runs with the signed-in coach's session client under row-level security and the same
  ownership checks, and its envelope reaches the store, the evidence parts (marked `via: 'code'`) and the grounding
  check. A task can never be called from code, and no card is prepared while code is waiting on a read. Reads are not
  `strict` while this is on (the API does not allow both); tasks stay strict. An answer computed in code carries no
  citation markers; its sources are the turn's `via: 'code'` evidence parts. Each run of the code also leaves one
  `data-computed` part (`ChatComputed`: the reads it called by evidence ref, how many, how many players, the window
  they share, and a method sentence when the code began with a `# Method:` line), stored with the turn; its progress
  row reads "Working out the figures", or "Working it out across the team" once its reads cover a second player.
- **Stored model messages are exactly what the API returned**, appended only: thinking blocks with their signatures,
  text (with the API's citation objects) and tool calls in order, each tool-result message, and the per-turn system
  message. The model's thinking is never sent to the browser; on Sonnet 5.5 the short progress updates it writes
  between steps are (`note` events). A thinking block is valid only while `system`, `tools` and every
  earlier message are unchanged, so **nothing that changes during a conversation's life is in the prompt or a tool
  definition**: no date, no screen, no notes, no count. A deploy that changes the prompt or a roster edit still
  changes the prefix; `drop_block` makes the API drop the blocks it can no longer verify (the count is in the turn's
  log line, `calls[].dropped_thinking`) instead of failing the coach's question. The same covers a conversation whose
  model changes with a deploy: Sonnet 5.5 reads the blocks Haiku 5.5 wrote, and a block a model cannot read is dropped
  by the API, not rejected.
- **The per-turn system message.** Today's date, the screen the chat was opened from (`screen` in the body, checked
  against the caller's own team by `context/screen-context.ts`), the conversation's tone, and on a conversation's
  first kept turn the coach's standing notes (`context/notes.ts`) are sent as one `{ role: 'system' }` message
  straight after the coach's message and stored with the turn. A decision request sends none. The coach's own words
  are never inside a `tool_result` and never in the same block as the app's.
- **Asking about a thing that was tapped.** A new message may carry `about: { evidence_ref, key }`: a typed
  reference to one element of a read this conversation stored (a figure, a player in a read, a point of a trend, a
  round, a hole). `engine/about.ts` resolves it against the conversation's stored reads only and adds one line to the
  turn's system message, built from the stored read. A reference that names nothing stored is ignored. The browser
  never sends words for it.
- **Refusals.** `stop_reason: 'refusal'` is an answer, not a fault: words already streamed are withdrawn, the coach
  gets one sentence they can act on, the turn is stored `complete` with that sentence as the reply (the model's
  refused content is not kept), and `stop_details.category` is in the turn's log line (`refusalCategory`).
- **Prompt caching**: tools, then the policy block (1 hour, `ttl: '1h'`, which covers the tools), then the team block
  (5 minutes); the conversation tail is cached by the request-level `cache_control`, so no marker is written into a
  stored message. The model's minimum cacheable prefix is 512 tokens. `cache_read` and the two kinds of cache write
  are logged per model call (`v3.chat.stream.turn`).
- **Cost.** Each model call is priced at the rates of the model that ran it (`callCostUsd`, `CHAT_RATES`): Sonnet 5.5
  (and Sonnet 5, when a fallback answered) $2 in / $10 out per million tokens on one rate card; Haiku 5.5 $0.10 /
  $0.50 for a prompt of 100K tokens or fewer and $0.50 / $2.50 above. For both, a cache read is 0.1x input, a
  five-minute write 1.25x, a one-hour write 2x. A Haiku call over 100K prompt tokens logs
  `v3.chat.stream.long_prompt`. The ledger row's `model_id` is the surface's model; a player's turn is written with
  `task: 'coach_chat'` (the ledger's `task` CHECK has no player key) and the Haiku id. The pre-flight budget estimate
  is 12,000 tokens in and 2,500 out at the surface model's rates (`MODEL_COST_USD_PER_MTOK`): about $0.049 a turn on
  Sonnet 5.5.
- **The eval** (`scripts/coachhelm/ask-eval.mjs`): asks the data questions and the golf-sense questions on a dev
  server over the wire protocol, as the staging coach and a staging player, and writes a report with the engine's
  own verdicts, the figures, golf sense, the reads used, the writing rules and the logged figures check in separate
  columns. A dry run (no model call, nothing written) unless `--apply` is passed; it refuses any project but
  staging and stops at `--max-usd` (default 25). Every run with `--apply` is a live spend and needs the owner's
  approval.
- **Text streams live.** There is no audit between the model and the coach. After the turn a deterministic check
  compares the numbers in the answer with the numbers the conversation's reads returned and LOGS the result
  (`grounded`, unmatched tokens in `golf_coachhelm_llm_calls`). It never hides, delays or rewrites an answer.
- **Reads** run in parallel and go back to the model in one message. Each read gets an `evidence_ref` (`e1`, `e2`, ...,
  unique in a conversation for turns this engine wrote) and an evidence part. A tool input is validated against the
  tool's zod schema before anything runs; an invalid one is an error result the model is told about. What the model is
  handed is the read's `model_text` (finished, labelled lines, one figure a line) when it has one, else the envelope's
  JSON; the whole envelope still goes to the thread, the store and the grounding check.
- **Grounding by citation.** A read goes back as a `search_result` block (source `read:eN`, one text block per line,
  citations on). The API attaches to each sentence the read it drew on, and the engine turns that into the ` [eN]`
  marker the thread already draws (`read-markers.ts`). The model is not asked to write markers. Stored `content` has no
  markers. With `citations` off a read goes back as `[eN] lines` text and nothing marks a sentence.
- **Tasks.** A mutating tool call is never run by the model. The engine builds the real plan (`plan`), records it in
  `golf_coachhelm_action_runs` (`proposed_input = { v: 2, input, proposal, seal }`, the seal an HMAC only the server
  can produce, checked before anything is committed), shows the card and ends the stream with the turn stored
  `complete` and waiting. The ledger key is the planner's key plus a hash of the conversation and the model's
  `tool_use` id, so a retried Confirm of one card is one key and an identical request made later is a new one.
  Confirm or Cancel is a new request carrying that key. It continues the SAME assistant turn and the same stored row.
  Confirm claims the row (so two Confirms cannot both run) and, when the hold column exists, holds it for the
  8-second Undo window: the card shows "held, Undo until ..." at once (and is stored so), **the open request waits
  the window out, commits the STORED proposal, and only then gives the model the tool_result** (committed, undone by
  the coach, failed with the reason) for its closing words. The plan is not built a second time. The wait does not
  stop if the browser goes away: the write lands once and the stored turn shows the receipt. A second Confirm during
  the wait changes nothing. Cancel calls `recordDenial`. A new message while a card waits counts as Cancel unless the
  ledger says the card was already confirmed: the model is given the card's real outcome, then the coach's words as
  their own text block. A task that committed is never stored as a failed turn because the closing words did not
  arrive: the receipt is the record. The result of `recordProposal`, `recordOutcome` and `recordDenial` is checked; a
  proposal that cannot be recorded shows no card.
- **Idempotency.** A retried `client_turn_id` that already has an answer is sent the stored turn as events, with no
  model call. A retry of a failed turn runs again and replaces the failed row (one question, one assistant row). A
  repeated decision for a key that was already answered is sent the stored outcome.
- **Storage.** `ui_parts` keeps its shapes (text, `data-progress`, `data-evidence`, proposals, receipts, visuals,
  artifacts, and a `tool-<name>` part whose `approval.id` is the card's ledger key), written by the same reducer the
  browser folds the stream with (`applyChatEvent`), so a reload restores what was on screen and a waiting card can be
  confirmed after a reload. The held migration `20261110120000_coachhelm_chat_model_messages.sql` adds
  `model_messages` and `pending_decision` to `golf_coachhelm_chat_messages`. The code runs WITHOUT it: earlier turns
  are then replayed to the model as text (with a line per card from the stored parts), and a waiting card's turn is
  kept in its ledger row (`proposed_input.resume`) so Confirm still continues the same turn. Conversations written by
  the previous stack replay as text and still restore; their old cards are not offered for Confirm.
  Both new columns are readable and writable by the owning coach under the table's existing policy, like `ui_parts`
  (self-only). Restricting them to the service role is an open decision.
- **A failed turn** (a model error, a truncated tool call, a stop) is stored `failed` with a
  `data-turn-incomplete` note and only the question in its model messages, so nothing half-finished is replayed. The
  coach is sent one sentence from `classifyProviderFault` or the generic line; provider text never reaches the browser.
- **The player's Ask** runs on the same runner with the player's tool set, no ledger (a task call is refused before
  it is planned) and loaders bound to the player's own id. Nothing is stored for a player yet (player conversations
  are the held migration `20261101090200`), so each player question is answered on its own; the browser's copy of the
  thread is not replayed to the model.
- **Wire protocol** (`engine/protocol.ts`, server-sent events): `message_start` (with `started_at` and the resolved
  screen as `context`), `phase` (`thinking`, before each model call), `text_delta`, `text_discard`, `read_started`,
  `read_finished` (with `detail` and `picture` when the read has them), `note`, `evidence`, `visual`, `proposal`,
  `receipt`, `part`, `decision_needed`, `decision` (`reason: 'superseded'` and `message_id` when a new question
  withdrew a card in an earlier message), `usage`, `error` (with `kind`), `done` (with `duration_ms`). Every addition is
  an optional field; there is no version marker and an older stored thread restores unchanged. `useCoachHelmChat`
  keeps its interface, adds `phase` and `error.kind`, keeps `started_at` and `context` on the message's `metadata`,
  takes an optional `screen` it passes on with each new message (no caller supplies one yet), and is the only client
  of the protocol.
- **A failure's kind** is a closed set (`ChatErrorKind`): the server names it on the stream (`model`, `truncated`,
  `lost`, `card_retry`, `card_gone`) and in a refused request's body (`budget`, `off`, `rate`, `signed_out`, `gone`);
  the hook names a dropped connection (`offline`, `lost`, `card_retry`). A refusal by the model is not a failure.
- **An undone card** is stored as a receipt with `status: 'cancelled'` ("Undone. Nothing was written."); a turn undone
  before 10 Nov 2026 still holds its `held` receipt and the card's own GET says what became of it.
- **Where a task lands.** A proposal says where its row will appear (`lands: { kind, home, day? }`), and a receipt's
  `created[]` names the row it wrote (`id`, `ids`) with a link to the thing itself where the app has one, so the page
  behind quick chat can keep a place for the row and mark it. Ids are set where the app's own action returns the row
  (events, blocked time, recruits, tasks, team updates, a practice series, qualifiers) and left out elsewhere.
- **The surface a conversation was started on** is stored on the conversation (`surface`, held migration
  `20261110130000`) and returned by `GET /api/coachhelm/v3/chat/conversations`. Without the migration it is null.
- **Reading a sample plan's layout** (`coachhelm-plan-format.ts`) is not a chat turn. It runs on `PLAN_FORMAT_MODEL`
  (`anthropic/claude-sonnet-5-5`), the model it ran on before the chat moved, not on `coach_chat`'s.
- **A turn's facts** are stored as the part `data-turn-meta`: `started_at`, `duration_ms` (summed over the requests
  that worked on the turn), `reads`, and `declined` when the model refused.
- **Screens bound for the tools** (`stream/route.ts`, the only file that may import a Clubhouse loader): Stats, Team
  Stats, Roster, Rounds, Qualifiers, the Round page (`roundReview`) and, while the release flag
  `golf_tournaments_v1` (`config/feature-flags.yml`, not a table) is on, the Tournaments home. An unbound or failing
  loader reads as unavailable, never as empty. `find_in_app` is offered, and the browser's `screen` is used, only
  where Clubhouse is on for the team.
  <!-- schema-drift-absent: golf_tournaments_v1 -->
- **Hold release**: the Confirm request itself, as above. The fallbacks for a function that died mid-window are
  unchanged: the card's own `GET /api/coachhelm/v3/chat/actions/[key]` when its ring ends, and a sweep on the coach's
  next chat request. A held row is rebuilt from the stored, sealed proposal (`held-runner.ts`). There is still no cron.
- **Editing a card before confirming.** A card lists the fields the coach may change (`ActionProposal.editable`). An
  edit is a request with no model call (`decision: { key, edits, revision }`): the task plans again from the stored
  plan and the edits (`TaskTool.revise`, the same checks as `plan`), the result keeps the card's key, is sealed again
  and replaces the stored plan only while the card is still waiting. An edit the task refuses, or one to a card
  already answered, leaves the card exactly as it was and says why (a `data-card-revision` part beside the card, not
  stored). An edited card carries `revision`; a Confirm or an edit names the revision on screen, and one that names
  another is answered with the card as it stands and writes nothing, so a card changed in one tab cannot be confirmed
  from a stale copy in another. The plan that is committed is the one the ledger row held when it was claimed.
- **Steps of work.** Each read, calculation and draft is a step: a `data-progress` row (`ChatStep`) with its kind,
  its state, clock readings for when it began and ended, who it is about (players only from the caller's own roster
  and named from it; a player's steps name only that player), what it counted, the read it produced
  (`evidence_ref`, openable as soon as the step is done) and, for a read the model's code called, the step it ran
  under. Every step event carries the turn's sequence number, and each state change is sent once. A running
  calculation re-sends its tally at most every 250 ms. Nothing is estimated and no step is announced before it is
  running. `done.work` and `data-turn-meta` give the turn's step count and the time at least one step was running.
  The rows are stored with the turn; `restoreUIMessages(rows, { steps: true })` keeps them on reload.
- **A draft is shown as it is written.** A tool whose input is a draft (`ToolBase.draft.fields`) has those fields
  streamed to the thread while the model writes them (`draft_delta`, at most every 150 ms): whole values, the
  finished items of a list, words up to the last whole word, never a half-written item (`engine/draft.ts`). Nothing
  shown is validated; the complete input still passes the tool's schema and planner before any card exists, and a
  draft that fails either ends as failed in front of the coach (`draft_done`).
- **Several cards in one answer.** Each task the model asks for is its own sealed ledger row and card, decided on its
  own in any order; the model is asked for closing words once, after the last decision. "Approve all"
  (`approve_all: { cards: [{ key, revision }] }`) confirms the named cards in the order proposed after ONE shared Undo
  window (the same `held_until` on each), writing them one at a time. A card the coach undoes is skipped. The first
  failure stops the batch: later cards are not run, their rows go back to waiting (`decision_reopened`) and the coach
  decides again. If any named card is not the revision on screen, nothing is confirmed. The hook sends card requests
  one at a time, queueing presses made while a Confirm is still open.
- **A browser that missed how a card ended** (a Confirm whose connection dropped while the write went on) is told on
  the coach's next question: that response begins with the earlier message's recorded `decision` and `receipt`
  events, each carrying `message_id`, and the hook folds them into that message. No reload is needed.
- Tests: `src/app/api/coachhelm/v3/chat/stream/__tests__/route.turns.test.ts` (the route against a scripted model and
  an in-memory database) and `src/components/golf/coachhelm/chat/__tests__/useCoachHelmChat.test.tsx`.

- One-team canary (`src/lib/coachhelm/canary.ts`, env `HELM_COACHHELM_TEAMS`,
  2026-10-21): the v3 flags `coachhelm_reads_v1_copy`,
  `coachhelm_data_gap_prompt_v1`, `coachhelm_data_prompts_v2` (the Slice 8b
  shot-entry prompts, `src/lib/golf/data-prompts/flag.ts`),
  `coachhelm_corrections_v1`,
  `coachhelm_recheck_v1`, `coachhelm_stale_refresh_v1`, `coachhelm_support_v1`, `coachhelm_team_pool_v1`,
  `coachhelm_verdicts_v1`, `coachhelm_root_cause_diagnosis` and
  `coachhelm_insight_angles_v1` are read through `isCoachHelmFlagEnabled`. Unset, empty or `*`: the global flag
  decides, exactly as before, and no team is read. To run a wave on one team,
  set `HELM_COACHHELM_TEAMS=<golf_teams id>` in Vercel production, redeploy,
  then turn the wave's flag on: it is on only inside a team scope that holds
  that team. Scopes are set by `analyzePlayer` (generators, support pass,
  upserts), the player feed reads in `insight-delivery.ts`
  (`getInsightsForPlayer`, `getTopInsightForPlayer`,
  `getRoundTakeawayInsight`), the coach chat read tools (the chat's team), the
  shot-entry ask loader, the lifecycle cron (checkpoint job per player, the
  scan's round-based archive rule, and the verdict job, which judges only
  listed players' focus areas), the roster sweep (each player's freshness
  decision in their teams' scope, from the roster it already loads), the
  corrections action (after the read and the player's teams load), the
  prescription stamp on every focus-area create path (the player's teams;
  `createFocusArea` also reads the flag in the focus area's team), and the
  coach feeds (`getInsightsForCoach`, `getInsightsForCoachWithMeta`,
  `getTopInsightsForPlayers`), whose fold and 3 + 1 cap are decided per player
  from one batched team read, so a mixed feed folds only the listed players.
  Anything else outside a scope reads the flag as off during a canary, which
  is today's production state. A team read that fails also reads as off. To widen, add ids; to finish, unset the
  variable. Never used for auth, RLS or the Clubhouse release flag.
- Support and the claim ladder (Slice 1, 2026-10-20, flag
  `coachhelm_support_v1`, off): after the generators and composites write a
  player's rows for a run, `v3/support/run-pass.ts` adds `support` (gap to the
  benchmark, 95% range, one-sided p, Benjamini-Hochberg q across every
  candidate of the run at q <= 0.10), `ladder` / `what_ladder` (Seen
  repeatedly / Observed / Likely / Working hypothesis / Not enough yet),
  `ladder_reasons`, `strokes_shrunk` and `shrink` to `evidence`, writes one
  `golf_coachhelm_run_log` row (migration 20261020114500, applied; a missing
  table is "not available"), and records `rank_factors` on exposures. With the
  flag on nothing else on the row changes (confidence, copy, priority,
  lifecycle), and no surface reads the ladder yet. Contract and the back-test
  numbers: "Support and the claim ladder" in
  `docs/architecture/coachhelm-evidence-contract.md`. Slice 1b fixed the
  tested direction (the row's claim; two-sided p to BH when the side follows
  the data), one BH m for gated and ungated callers (written + gated out +
  refused), shared floors with per-arm minimums, a leave-one-out team
  benchmark with its variance, `support.run_at` / `run_id`, and strips the
  ladder keys from the player feed ("Slice 1b fixes" in that section).
  Slice 1c rates the six insight-angle families (matched by metric, tested
  from `detail.gap_input`, floors and caps from `ANGLE_FAMILIES`) and moves
  the Slice 4 verdicts onto `support/shrink.ts` ("Slice 1c" in that
  section).
  <!-- schema-drift-absent: golf_coachhelm_run_log -->
- Honest root cause (supercharge Slice 2, 2026-10-20), behind
  `coachhelm_root_cause_diagnosis` (OFF; off writes the old template
  unchanged):
  - A leak read's cause is counted (a recorded path on ≥ 4 and ≥ 30% of ≥ 10
    failing events over ≥ 3 rounds, seen in ≥ 2 rounds), likely from totals
    (one par × length slice against the rest, both arms ≥ 10 and printed,
    lift ≥ 1.25, interval above zero after Bonferroni widening over the
    slices tried) or not traced (a count-down, or a data gap naming the one
    missing shot field). Contract:
    `docs/architecture/coachhelm-evidence-contract.md`.
  - Paths with an unrecorded step, no costly shot, or the ordinary putt miss
    are not patterns. Tee (`sg_ott`) and opening-hole reads stop at likely; a
    repeated path there is `pattern_only`.
  - Counted maps to diagnosis level "observed", likely to "hypothesis". A
    not-traced read is never drawn as a cause (`reads/cause-state.ts`); the
    coach `DiagnosisPanel` shows it with no chip and no "Likely because".
  - No stamped window (or a zero-day one) means nothing is traced; there is
    no one-year fallback. Rolling generators load their own N-day window.
- One-tap data-gap prompt (supercharge Slice 8a, 2026-10-20), behind
  `coachhelm_data_gap_prompt_v1` (OFF): a putt `miss_direction` data gap is
  asked in Fairway shot entry after a missed first putt from that band, with
  a counter toward `target_count`; one tap writes the miss tag through the
  round's autosave. Contract: the evidence contract's Slice 8a section;
  entry side: `memory/features/shot-tracking.md`. Clubhouse shot entry asks
  it too (CH-11960, 2026-10-22).
- Course plan (supercharge Slice 7c, behind `coachhelm_course_plan_v1`,
  OFF; `src/lib/coachhelm/course-plan/build-plan.ts`, actions in
  `src/app/golf/actions/coachhelm-course-plan.ts`): the coach reads a plan
  for a player they coach (`listCoursePlanCourses`, `getCoursePlan`). The
  player reads their own (2026-10-22, CH-13916 on their Clubhouse Board)
  through `listMyCoursePlanCourses` and `getMyCoursePlan`, which take no
  player id: the player is the `golf_players` row whose `user_id` is the
  session user; no row answers forbidden, a lookup error answers failed
  (logged). Only the player copy comes back (title, at most three lines,
  the thin-history line below six rounds, or the line that says nothing
  stands out); never the coach copy, never a club.
- `upsertInsightV3` throws `InsightOwnershipLookupError` when the team or
  staff lookup keeps failing, instead of writing the row with no owner.
- Every read that decides "is there already a row?" fails closed
  (2026-10-21): a dedup lookup error, or an ownership lookup that throws
  instead of returning an error, is logged and thrown as a retryable
  `InsightOwnershipLookupError`; nothing is written and the next run writes
  it. Only a genuine no-team or no-staff answer lands an orphan.
- Idle-player stale refresh (`v3/engine/stale-refresh.ts`, behind
  `coachhelm_stale_refresh_v1`, OFF): the nightly roster sweep also re-runs
  an analyzed player whose newest analysis (newest visible-read refresh
  stamp or `post_round_v2` engine run) is 14+ days old, who has an open read
  and a completed round in the engine's 90-day window: at most 6 a night,
  after the freshness picks and under the same time budget, logged with
  `logServerEvent` (`cron.coachhelm.rosterSweep.staleRefresh`). A lookup
  error means no stale refresh that night. A player the engine would park
  for its owner (no coach, CoachHelm off for the coach or team) is skipped
  with the engine's own check (`src/lib/coachhelm/engine-owner.ts`) and
  never takes a slot; those checks stop once the cron's time budget is
  spent or after 24 a night, keeping the picks found so far. The night's
  window is a write-free rotation: the stale players ordered oldest first,
  starting at offset (day index x 6) mod n and wrapping, so each gets a turn
  within ceil(n / 6) nights. A pick whose run writes nothing stays stale
  but cannot hold a slot every night; a productive run re-anchors the
  player and drops them out. The sweep writes no marker row (a row in
  `golf_insight_generation_log` would count as a failed run in
  `get_admin_coachhelm_rollup`).
- Team pool benchmark (supercharge Slice 7a, 2026-10-20), behind
  `coachhelm_team_pool_v1` (OFF; off reads nothing and writes nothing new):
  - Putt make by band, approach green-hit by band, sand save, par 3/4/5
    scoring and penalties-per-round reads get `evidence.comparison`, with the
    teammates' pooled attempts in the read's window as `primary` ("Team pool
    72% (240 putts)") and the Tour as a further line (`v3/team-pool/`).
  - The player's own attempts and test rounds never count. Approach and
    sand pools use every completed round (as the player's value does); the
    rest use countable rounds; the floors count countable rounds. No line under 5 rostered players with rounds, 4 teammates with 3+
    rounds and attempts in the family, or 100 pooled attempts. No program
    pool. Strokes, standing and the flat `comparison_*` fields stay Tour.
  - The Clubhouse Deep dive Read and the Fairway `EvidencePanel` print the
    team line (`reads/team-pool-line.ts`). Contract:
    `docs/architecture/coachhelm-evidence-contract.md`.
  - The support pass tests a one-sample read against that pool with its
    pooled count (`benchmark_basis: 'team_pool'`, exact variance) and
    shrinks toward it (`prior_source: 'team_pool'`); without the line it is
    exactly Slice 1b (leave-one-out team mean). An angle's own composed
    `comparison` is kept; the team line is only appended.

- Coach Monday brief (task chs-28, 2026-10-21), behind
  `coachhelm_monday_brief_v1` (production OFF, preview on):
  - `v3/monday-brief/brief.ts` (pure): per team, at most 5 items: the team
    pattern's first row (Slice 7b, only with `coachhelm_team_pattern_v1`
    on), then one read per player at Likely or above, most strokes first
    (`strokes_shrunk`, else the raw estimate); rows print raw strokes. Never
    strengths, Watching, Working hypothesis, reads 2+ countable rounds
    behind their `metadata.last_refreshed_at` (S3), Cleared, the retired side
    of a Contradicted pair, Under review, or a read the pattern row already
    covers. Fail closed: a read missing ladder, `support.direction`, an
    estimated strokes value, a title, a refresh day or a roster name is left
    out. Counts line for the 7 days before the brief: new (Likely+ findings
    created), cleared (recheck cleared), contradicted (pairs once), out of
    date (Likely+ findings 1+ rounds behind).
  - `v3/monday-brief/loader.ts` reads roster, visible reads and countable
    rounds; any failed read answers null (never a partial brief).
  - Clubhouse view `?view=monday-brief` (coach only; the route checks the
    flag), the landing of the Monday email.
  - Coach Brief (par-05), same flag: `?view=brief`
    (`clubhouse/data/coachhelm-coach-brief*.ts`, `views/CoachBrief.tsx`), the
    team view behind `/intelligence`. `loadBriefInputs` (shared with the
    Monday brief) gives the roster, reads, rounds and every team pattern;
    `computeMondayBrief(..., maxItems: Infinity)` lists every player's top
    read. Beside it: live focus areas (session client), active goals and
    standing (service client, scoped to the roster read), and the Track
    record line with `coachhelm_track_record_v1`. A section's failed read is
    named, never drawn empty; nothing is recorded as shown. The board's
    button reads "Brief". `/intelligence` maps old views to `&section=`
    (`intelligenceTarget`): signals to week (patterns filter to patterns),
    players to working, effectiveness to record; `?player=` the board.
  - Delivery: `/api/cron/coachhelm-monday-brief`, vercel.json `0 5 * * 1`
    (Mondays 05:00 UTC). Flag off: returns before any read. On: emails the
    primary coach of each in-season team a non-empty brief through
    `v3/foundation/email.sendEmail` (so `HELM_CUSTOMER_EMAIL_ENABLED` must be
    on too), only when `golf_coach_philosophy.email_digest_enabled` is
    explicitly true (opt-in; a missing row sends nothing). Idempotency key
    `coachhelm-monday-brief:<coach>:<team>:<ISO week>`.

- Team pattern and same-day field (supercharge Slice 7b, 2026-10-21),
  behind `coachhelm_team_pattern_v1` (OFF; off reads nothing new):
  - `v3/team-pattern/pattern.ts` (pure): a cause family (support family,
    metric band, miss side) shared by at least 3 players AND at least 30%
    of the players with 3+ countable rounds, each at Likely or above on
    `evidence.ladder`. Up to 4 rows, most team strokes (summed
    `strokes_shrunk`) first; families under the threshold are counted only.
    Computed at delivery from the reads the Clubhouse coach board already
    loads; coach only. Needs `coachhelm_support_v1` writing the ladder.
  - `v3/field-day/field.ts` (pure): rounds where 3+ teammates played one
    course on one day get a score relative to the team's mean that day. The
    bad-day-floor read does not fire when most bad rounds were hard days
    for the whole field; the pressure read records both sides as audit
    detail (`detail.field_day`, "Relative to the team on the day").
  - LPGA approach: production has LPGA proximity rows for the three bands;
    green-hit by band has no LPGA figure, so a women's approach read stays
    absent and a women's standing omits the marker. Never PGA numbers.

- Genome `scoring_trend` (2026-10-24): the result carries an optional `se`,
  the change's Welch standard error from both windows' own spreads.
  Clubhouse's Momentum says Improving/Regressing only past it; rows stored
  before have no `se` and read "No clear change" until the nightly run.
- Wave 6 (2026-10-18):
  - Persona (`v3/genome/persona.ts`): `driver_usage` and `miss_side_bias` are
    style dims, never strengths or watch-outs; they only feed the course
    profile.
  - Program pulse movement rows read "N players are scoring worse/better over
    their last three rounds", each mover's change in strokes (±N.N strokes,
    true minus).
  - `putt-slope-bias` writes "Downhill putts from {band}", no "(n=…)" aside,
    label "Make rate, downhill vs level, same distance"; signature unchanged.
  - Standing projections use the player's real attempts per round from
    `golf_player_stats_cache`; without attempts a component is capped at how
    far its parent strokes-gained category trails the Tour, so a part can never
    be worth more than its whole.
- LLM work must never run client-side.
- Player-facing confidence is shown as a word ("Solid read" / "Early read" /
  "Thin read, n=8") from `src/lib/coachhelm/confidence-label.ts`, never as a
  percentage; the numeric confidence still drives ranking.
- The performance predictor, composite rating, Game Fingerprint (including
  its SG metrics), team health categories and program pulse read countable
  rounds only (see "Countable rounds" in `memory/features/stats-analytics.md`).
- Test rounds (OD-03, 2026-09-27): the CoachHelm display loaders
  (`coachhelm-data.ts`, `insights.ts`, `player-fingerprint.ts`,
  `shot-analytics.ts`) skip `golf_rounds.is_test` rounds. The engine, crons
  and cached stats do not read the flag.
  Prediction bands wider than `MAX_PREDICTION_BAND_STROKES = 8` are not shown.
  The scoring trend (`getPlayerTrendAnalysis`) and the per-category SG trend
  (`fetchSgTrendsByCategory` → `computeSgTrends`) read countable rounds too,
  with a nine-hole round's to-par, putts and SG scaled to 18 holes as Stats
  does. `computeSgTrends` also skips any single-category SG beyond
  `MAX_PLAUSIBLE_ROUND_SG = 10` per 18 as a backstop.
- The pressure-gap insight (`v3/generators/pressure-gap.ts`) follows the one
  rule in `src/lib/golf/metrics/pressure-gap.ts`: countable rounds, each
  round's to-par on an 18-hole basis, and tournament, qualifier and legacy
  'qualifying' rounds on the pressure side. Standing's SQL
  (`refresh_player_standing_round_metrics`) follows the same rule from
  migration `20260924140000_golf_standing_pressure_gap_parity.sql`, which is
  held and applies after OD-01's `20260924120000`. Both keep a 90-day window
  and at least 3 rounds per side.
- Coach-facing insight reads must scope through assigned teams, not broad player access.
- Player-facing feedback must be tied to the authenticated player and revalidate the affected dashboard surfaces.
- Coach-to-team ownership is via `golf_team_coach_staff`; do not infer it from `golf_coaches.team_id`.
- V2/V3 scoring and generator logic should stay pure where designed as pure engine code; Supabase access belongs in loaders, actions, or orchestration boundaries.
- Insight lifecycle is decided only by `src/lib/coachhelm/v2/insights/lifecycle-policy.ts` (see `docs/architecture/coachhelm-evidence-contract.md`). A `tentative` row is promoted to `detected` on the first write whose freshly recomputed confidence clears the 0.4 floor; the nightly lifecycle cron only demotes/archives/resolves and never promotes. Promotion is pausable per team via `golf_team_coachhelm_settings.preferences.tentative_promotion_enabled = false`.
- Every lifecycle write (`upsertInsight`'s `updateExisting`, the lifecycle
  cron's per-row update) is an optimistic compare-and-set on `lifecycle_state`,
  guarded by the value observed at read time. A concurrent coach action
  (dismiss/acknowledge/archive/resolve) or another concurrent engine write
  always wins; the loser logs a warning and returns without clobbering — never
  retries blind. `detected → matured` requires `MATURATION_CONFIRMATIONS` (3)
  DISTINCT evidence revisions (`${sample_n}|${window_end}`) recorded while the
  row is `detected`; the count resets to empty on every promotion/resurrection
  so movements from before the row was visible never count. The lifecycle cron's
  Rule 1 healthy-band check is direction-aware (`isNegativePolarityMetric` from
  `tone-derivation.ts`): a player at least as good as the comparison is always
  healthy regardless of gap size; only the adverse direction is gated by the 20%
  closeness bar.
<!-- schema-drift-absent: golf_coachhelm_player_state -->
- Checkpoint lifecycle (Slice 3, `src/lib/coachhelm/v3/lifecycle/`), behind
  `coachhelm_recheck_v1` (default off) and the held table
  `golf_coachhelm_player_state` (migration on HOLD in
  `supabase/migrations/HELD.md`; not in production). With the flag off the cron and upsert behave
  as before and the job makes no query; a missing table or corrections table
  (42P01 / PGRST205) means "not available". With it on, the cron runs
  `runCheckpointLifecycle` after its age scan and before the rollups:
  - A player checkpoint is 3 countable rounds since the last one; a family
    checkpoint is each 20 attempts in one shot family. The first run only
    sets a baseline.
  - At a covering checkpoint, weakness `putt_distance` and `par_scoring`
    reads are rechecked over the newest 15 countable rounds (or 90 days when
    that has more attempts): Cleared when the point is at or past the
    benchmark and the 90% bound beats the old point. The record goes on
    `evidence.recheck`.
  - Opposing supported reads on one subject pair as Contradicted (newest wins
    and the older is retired); a driver read plus a penalty read with a
    counted driver-to-penalty link pair as one strategy item.
  - A `wrong_cause` or `not_this(wrong)` correction, or a round whose hole sum
    does not match `total_score`, sets Under review until the next checkpoint.
  - v3 reads stop using the 30/90-day age rules and archive instead when
    Cleared for 2 more checkpoints, Contradicted-and-retired, or Out of date
    for 3 checkpoints (`metadata.archived_by = 'coachhelm-lifecycle'`).
    `addressed` reads never archive here. The lifecycle state lives in
    `metadata.coachhelm_lifecycle` and is mirrored onto evidence, because a
    generator re-emit replaces evidence; upsert does not resurrect a row
    retired by `engine-recheck` or `engine-contradiction`.
  - `delivery-shape.ts` turns these into Cleared / Contradicted / Under review
    lines; no surface renders it yet.
- Honest-mode confidence (`factors_measured=false`) is `sample_adequacy × freshness` (`honest_v2`); it is a support score, never a probability, and can never rise as evidence ages.
- Citations, evidence, and baseline comparisons are part of the trust contract. Do not emit fabricated comparisons or uncited claims.
- Claim honesty (2026-09-12, repair plan Package 2): prose states what was
  measured, hands unmeasured causes to the coach as a check, and frames the
  action as a recommendation (`approachAxisReading` observation/check/action in
  `v3/engine/diagnosis.ts`; the round builders in `v2/orchestrator.ts`; the
  short-side and pressure-decel composites). Heuristic severities go in
  `ComposedInsight.rankScore`, never `strokeImpact`. A row whose `your_value`
  is not the registry quantity for its metric id declares `evidence.polarity`
  (approach_miss: green-hit percent under `approach_proximity_*ft`). Every
  comparison is the team's Tour (Q-88, 2026-09-30): the PGA Tour for a men's
  or unknown team, the LPGA Tour for a women's team, `comparison_source:
  'pga_baseline'` with a label naming the tour. No generator, counterfactual
  or measured impact reads `golf_player_standing.level_avg`; a metric with no
  Tour value (green-hit by band for the LPGA) gets no comparison, and
  `approach_miss` writes no card for a women's team. Stored insights carrying a
  college source (`d2_avg`, `estimated_target`, `cohort_avg`) render without
  that tick (`v2/insights/tour-only.ts`). Goal targets still aim at the cohort
  (audit row 21), but the card prints only the Tour. Specific-hole rankings key on (`course_id`,
  `hole_number`); derived tee distances carry `distance_method:
  'derived_progress'`. The metric identity table lives in
  `docs/architecture/coachhelm-evidence-contract.md`.
- Season Standing (2026-10-24, Clubhouse A+ rows 104/105/121, owner decision
  9; migrations `20261024150000` and `20261024151000`, both HELD, so their
  objects are named here by migration until they are applied and
  `db:types` picks them up): Clubhouse Standing reads the season table that
  `20261024151000` creates, through `loadPlayerSeasonStandingMap`. Every metric
  there covers 1 August onward in the team's `golf_team_settings.timezone`,
  and each row carries `rounds_n` (the rounds it was built from) and
  `season_start`. It is written by `refresh_player_standing_season` from the
  nightly standing-refresh cron and from `/api/cron/v3/standing-refresh-dirty`
  (every 5 min). That pass refreshes the teams a round save marked dirty
  (`markTeamStandingDirty`, through the queue table `20261024150000` creates;
  3-minute debounce, 30-minute cap). `golf_player_standing` (lifetime cache
  metrics, 90-day pressure rows) is unchanged and still feeds Fairway and
  every generator. While the season table is missing, Clubhouse falls back to
  `golf_player_standing`, labelled "All time" with no row counts.
- Standing Tour basis (2026-09-22, Package 7B / addendum A2): the three
  `approach_proximity_*` standing rows carry a `basis` column
  (`'on_green' | 'all_shot' | null`) written by
  `refresh_player_standing_shot_metrics` (migration
  `20260922120000_v3_standing_shot_metrics_all_shot_proximity.sql`). The RPC now
  computes `player_value` as ALL-SHOT proximity (misses included), matching
  `pga_value`'s basis, with 175+ yd par-5 approaches that miss the green
  excluded as likely lay-ups (`layup_excluded_n`) rather than counted as
  misses; the pre-migration on-green-only figure is preserved in
  `on_green_proximity_feet`. `v3/standing/tour-basis.ts`'s
  `isStandingTourComparable(metricId, basis)` now reads that column: a row is
  comparable ONLY when `basis === 'all_shot'` — `null`/`'on_green'`/absent
  all fail closed (a not-yet-refreshed row stays withheld, same as before
  this migration). When comparable, every standing loader stops stamping
  `pga_omitted: true`/`pga_omitted_reason: 'basis_mismatch'`, so the tile,
  goal target, and engine suggestion draw the Tour marker; when not, the
  omission is unchanged from the #1938 behavior (the team tick was always
  fine either way — same basis on both sides). `StandingStrip`/`StandingBar`
  caption the omission (`pgaOmissionNote`).
  `ApproachMissGenerator.standingTourComparable` no longer force-overrides
  this — it trusts the loader's basis-aware `standing.pga_omitted`.
- Benchmark provenance (2026-09-23, repair plan N16): a `comparison_source` name is not itself a promise the number is measured. Every `BaselineEntry` in `src/lib/coachhelm/v2/insights/baseline-registry.ts` and every per-gender anchor in `src/lib/coachhelm/v3/counterfactual/cohort-baselines.ts` carries `provenance: 'measured' | 'derived'` plus a `sourceNote` next to the value. A `'derived'` entry's `label` must read as a target/estimate and must never say "average"/"avg"/"norm"/"measured" — enforced by `baseline-registry.test.ts`'s `N16: derived entries never carry measured-sounding wording` block and `cohort-baselines.test.ts`'s `typed provenance metadata` block. Since Q-88 every putt-make/scrambling/GIR anchor is `'measured'` and read from `TOUR_STANDARDS` (`golf_pga_standards`, PGA for men and LPGA for women, read 2026-09-30); the women's college estimates are gone, but the men's green-hit-by-band anchors (`GREEN_HIT_ANCHORS`) are `'derived'` too — an approximate Tour band figure the `approach_miss` generator has always printed, not part of that verification pass. `baselineRegistry` itself has no live caller anywhere in the codebase (dead code, kept corrected regardless — see that file's own LIVENESS note); `d1_avg`/`d3_avg`/`naia_avg`/`juco_avg` have zero producers. Full contract: `docs/architecture/coachhelm-evidence-contract.md`'s "Provenance: measured vs. derived" section.
- Severity ordering (2026-09-12, N5): `golf_coach_insights.priority` is TEXT
  and sorts alphabetically at the database. Never `.order('priority')`. Rank
  feeds with `rankEvidenceInsights`; order a "sort by priority" list with
  `compareBySeverity` from `v3/ranking/score.ts` over the full set, then
  paginate.
- Top-N selection audit (addendum A6, 2026-09-23): every reader that picks a
  top-N/top-1 `golf_coach_insights` row must apply eligibility
  (`applyInsightVisibility` + the player-feedback overlay on player-facing
  surfaces) BEFORE any DB `.limit()`/client `.slice()`, and rank survivors
  with the canonical composite (`scoreInsight`, via
  `rankEvidenceInsights`/`rankEvidenceInsightsScored` in
  `app/golf/actions/insight-delivery-ranking.ts`), never an ad-hoc formula —
  truncating before ranking can silently drop a genuinely higher-priority
  row that's merely older than the cutoff. Fixed four real instances of this
  bug: the Hub's urgent-priority fast path (`getTopInsightForPlayer`) used
  to take `.limit(1)` by `created_at DESC`, so 2+ open urgent rows could
  return the newest rather than the best-by-composite (URGENT_SHORT_CIRCUIT
  lifts all urgent rows equally; among them the composite still decides) —
  now fetches up to 20 urgent candidates and ranks them through the same
  pipeline. The round-review takeaway (`getRoundTakeawayInsight`) used to
  `.limit(20)` its ±24h window before ranking with neutral `{}`/`[]`
  weights/goals and no collapse/dedupe/feedback-overlay — now paginates the
  full window via `fetchAllRowsResult`, ranks with the player's real
  weights/goals, and applies the same collapse/dedupe/overlay every other
  player-facing surface applies. The team dashboard's `getTeamInsightsSummary`
  used to derive `topInsight`/`activeInsights`/`urgentInsights` from the SAME
  paginated table-body page (newest ≤100 rows for the whole team) — a
  player's true worst row past that boundary was invisible — now a separate
  full-team `fetchAllRowsResult` fetch (uncapped) feeds the summary while the
  table body keeps its existing pagination. The coach chat tool
  `getPlayerInsights` (`v3/chat/read-tools.ts`) used to be pure
  `.order('created_at' desc).limit(input.limit)` with zero ranking — now
  routes through the same `rankEvidenceInsights` → `collapseParScoring` →
  `dedupeBySubject` pipeline via a new `mapRowToRankable` helper in
  `insight-delivery-ranking.ts`, coach-facing (no player-feedback overlay,
  matching the coach feed's documented rule). The roster card
  (`getTopInsightsForPlayers`) keeps its existing neutral-weights/no-goals
  batched-sweep ranking (a deliberate one-query-for-the-whole-roster
  tradeoff), but its docblock's claim of guaranteed agreement with the
  per-player feed's head was corrected — false whenever a player has an
  active goal or non-default coach weight. Deliberately NOT routed through
  `scoreInsight` (different domains, not an oversight): the goal-suggestion
  writer's metric-severity ranking and `getPlayerWeakestAreas`/weekly-digest
  pattern rollups. `insights.ts`'s `getTopInsightsByStrokeImpact` (legacy V2
  ad-hoc `strokeImpactScore` sort) has zero real callers left — a dead-code
  finding, left in place. A client-observed "viewed" signal (as opposed to
  "delivered") remains separate future work (Package 9/11, addendum N11). Out
  of scope for A6: issue grouping and parent/child claim links (need
  addendum A1–A4 evidence-packet work first). See
  `docs/architecture/coachhelm-evidence-contract.md`'s "Top-N selection
  audit" section for the full surface-by-surface table, and
  `src/test/coachhelm/v3/cross-surface-topn-agreement.test.ts` for the test
  proving the feed, the Hub/PracticeRx pick, and the chat tool now agree on
  the same leading insight from one shared fixture.
- Duplicates, folds and caps at delivery (CoachHelm Slice 0, 2026-10-20).
  `dedupeBySubject` (`insight-delivery-ranking.ts`) keeps the NEWEST copy of
  one read (same subject key, same `insight_type`): stored `updated_at`, then
  `evidence.window_end`, then `created_at`, compared as instants, at the
  survivor's own rank position (ported from PR #2073). A row another
  generator wrote on the same subject still loses to the higher-ranked row,
  as before. Unflagged: it only changes which of two copies is shown.
  Behind `coachhelm_reads_v1_copy` (off everywhere), `deliverReads`
  (`insight-delivery-reads.ts`, pure) runs after collapse, dedupe and the
  player's dismissals on the player feed, the coach feed and team sweep,
  the Hub pick, the round-review takeaway, the roster sweep and the coach
  chat tool: overlapping reads fold into one (`FOLD_PAIRS`: driver with
  penalties, penalties with big numbers, three-putts with 25+ ft putts, and
  one metric across categories). The one that stays is the group's
  highest-ranked finding, else strength, else note; it names the others in
  `also` and in one added sentence. A read someone acted on (acknowledged,
  addressed, rated by the player, or the source of a live focus area,
  `src/lib/coachhelm/delivery/pinned-reads.ts`) never folds. Then each
  player holds 3 open
  reads and 1 strength (a note or a measured zero is never an open read;
  same classification as the Clubhouse Board). `includeMore: true` on
  `getInsightsForPlayer` or `getInsightsForCoachWithMeta` skips the cap: the
  Clubhouse Board (caps itself), the Deep dive, the game Fingerprint and the
  Scouting report pass it, and the chat tool never caps. This flag writes
  no `rank_factors`; that column is Slice 1's (`coachhelm_support_v1`).
  Paths that read insights without `deliverReads` are
  unchanged: `insights-coachhelm.ts` `loadEvidenceBackedInsights`,
  `signal-groups.ts`, `insights-feed.ts`, `intelligence-dashboard.ts`.
- Budget-sensitive LLM behavior should use team settings and persisted usage, not hardcoded token math.
- The enable gate (`src/lib/coachhelm/v2/gate.ts`) fails closed: a failed read
  of the coach or player row (LIVE-17), the coach's settings, staffed teams, a
  player's active memberships or the teams' settings answers
  `effectivelyEnabled=false` ("CoachHelm settings lookup failed") and logs it; a
  missing row still means the enabled default (Q-146, 2026-10-01;
  `src/test/coachhelm/v2/gate-batching.test.ts`).
- Post-round analysis returns a typed `AnalysisOutcome` (repair plan R3,
  2026-09-12; `src/lib/coachhelm/v3/engine/analysis-outcome.ts`):
  `succeeded | partial | waiting_for_data | not_applicable | disabled |
  retryable_failure | permanent_failure`, each with a retry policy. The engine
  (`triggerPlayerInsightsAfterRoundImpl`) names its own state with a `code`
  on every `success: false` envelope and preserves a caught exception as
  `cause`; `postRoundTrigger`, the safety-net cron, the pgmq consumer and the
  roster sweep branch on that code. No consumer may classify an outcome from
  the message text, and no expected state (under the round floor, no roster,
  switched off) may be stamped as a failure — it parks the round. The safety
  net's never-processed sweep selects only rows with a NULL reason; parked
  rows wake on a newer analyzed round (coverage), a new active membership,
  or both CoachHelm switches being on, or (floor-parked) the player's
  completed-round count meeting the coach's current `min_rounds_for_signal`,
  so a coach lowering the floor wakes them on the next tick; transient
  failures retry one tick apart up to `RETRY_MAX_ATTEMPTS` and then stay
  failed as `:exhausted`. A failed wake-decision read is logged and leaves
  the round parked.
- **Database fan-out is bounded (#2061, 2026-09-24 pool exhaustion).**
  `analyzePlayer` runs its ~21 Tier-1 generators through
  `runTier1Generators` (`src/lib/coachhelm/v2/tier1-runner.ts`): at most
  `TIER1_GENERATOR_CONCURRENCY` (4) in flight, not all at once, and each
  generator retried ONCE after a short backoff (250–500ms) when it fails on
  a transient database fault — a v2 rejection or a v3 `{ status: 'failed' }`
  receipt whose error is a statement timeout (57014), pool timeout
  (PGRST003), unreachable schema cache (PGRST002), deadlock or connection
  fault. Never a second retry, never a retry of a non-transient failure.
  The settled array keeps input order, so the caller's summary is unchanged.
  `generateAlerts` (`src/app/golf/actions/alerts.ts`) analyzes at most 4
  players at once instead of the whole roster. The transient definition
  lives in one place, `isTransientDbError`
  (`src/lib/supabase/bounded-query.ts`), which
  `classifyDashboardFailure` now uses too — so a PGRST003/PGRST002 on the
  player dashboard takes the page's one server-side retry and soft state
  instead of the hard error.
- Learning from corrections (Slice 6a, 2026-10-20, flag
  `coachhelm_corrections_v1`, off). `recordCoachHelmCorrection`
  (`src/app/golf/actions/coachhelm-corrections.ts`) writes one append-only
  `golf_coachhelm_corrections` row (migration 20261020121000, applied): kind
  `not_this` (reason `wrong` / `not_important` / `already_know`),
  `wrong_cause` (optional alternative), `already_on_it`, `snooze`,
  `confirm`. Author, role, player and team come from the session and the
  insight, never the client; a player may only say `not_this` or `confirm`
  on their own read. Flag off or a missing table (42P01 / PGRST205) returns
  `not_available` and writes nothing. The coach weight W
  (`v3/corrections/coach-weights.ts`, pure) starts at 1.0 per coach x
  `insight_type`, moves -0.1 per Not this and +0.05 per Good read, clamps to
  0.5-1.5 at every step, counts one vote per author per read (the newest),
  and hands a family off at >= 10 verdicts. W enters ranking through
  `v3/ranking/score.ts` only: `loadCoachWeightsForPlayer` (per-player feeds)
  and `loadCoachWeightsForPlayers` (the coach team feed and the roster cards,
  one batched read per table, applied per player), for each player's primary
  coach; a calibrated outcome weight still wins for its family. The loader
  pages a coach's full correction history (`fetchAllRowsResult`), since W is
  clamped per step and a truncated history would drift. Flag off: no
  corrections read, weights and ranks unchanged (the batch paths keep `{}`).
  Players' own surfaces stay neutral because RLS hides a coach's corrections
  from them. RLS: a coach sees a row only through the player's active teams,
  never the row's own `team_id`, and a player may only tag `team_id` null or
  a team they are active on.
  Precision counters (`v3/corrections/precision-counters.ts`, pure): per
  family x rung, `shown` (distinct reads, rung of the newest exposure's
  `rank_factors.ladder`, else `unrated`), `held` / `cleared` /
  `contradicted` (newest recheck outcome; Slice 3 supplies them),
  `not_this`, and `confirm` (Good read, added by Slice 6b).
  The chips (2026-10-21, same flag): the Clubhouse coach card draws all five
  under "Why do you think so?" (`screens/coachhelm/Corrections.tsx`); the
  player's Board and Deep dive draw Not this and Good read on their own
  reads. `data/coachhelm-corrections.ts` reads the viewer's own last answer
  per read (`selectOwnCorrections`); flag off it reads nothing, and a missing
  table draws no chips. Optimistic with rollback; no Undo (append-only), so
  Change records a new answer. Show later holds the read back for
  `SNOOZE_CHECKPOINTS` (2) rounds posted after the answer, counted on load.
- Track record (Slice 6b, 2026-10-21, flag `coachhelm_track_record_v1`,
  off; 02 §9, 03 §7.3). Clubhouse coach view
  `/golf/dashboard/coachhelm?view=track-record`, linked from the coach
  board only with the flag on. Computed on read, no rollup table:
  `golf_coachhelm_shown_reads(team, since)` (migration
  20261021090000, applied, SECURITY DEFINER, coaches of the team only) returns one
  row per read shown since the season start (newest exposure, its
  `rank_factors.ladder`); `src/clubhouse/data/coachhelm-track-record.ts`
  adds each read's family, `evidence.ladder` and lifecycle block, plus the
  corrections, and `v3/track-record/track-record.ts` (pure) counts them.
  Rules: a read's level is its exposure's ladder, else its current
  `evidence.ladder`, else unrated (program line only); the outcome comes
  from `metadata.coachhelm_lifecycle` (`v3/track-record/outcome.ts`:
  contradicted when retired on an opposing direction, else the newest
  recheck's cleared / holds, else history); "held" is of rechecked, never
  of shown; below 10 rechecked a level or family says "Not enough yet";
  targets are 02 §8's bars (8, 7, 6 in 10; Not enough yet under 5, over 6
  means the floors are too strict; Working hypothesis none). No percent is
  printed. A missing function (42883 / PGRST202) is "not available"; a
  missing corrections table leaves the corrections line out; any other
  failed read is the view failing, never zeros. The view is off (CH-13965)
  when CoachHelm is off for the selected team, even if another team the
  coach staffs is on; a coach's correction counts only when its `team_id`
  is this team (a player's own corrections always count).
  <!-- schema-drift-absent: golf_coachhelm_shown_reads -->
  (Applied in production 2026-10-21, but `database.ts` is not regenerated yet
  (PR #2203), so the loader reads it through the untyped `rpc` cast. After the
  regen, drop the cast and this comment.)
  <!-- schema-drift-absent: golf_coachhelm_corrections -->
  (Applied in production 2026-10-21, but `database.ts` is not regenerated yet
  (PR #2203). After the regen, drop this comment.)
- **Coach voice (2026-10-21).** Every v3 generator and composite rule writes
  `evidence.coach_copy`: the same read in the third person ("the player",
  then "they"), the same numbers, the coach's action, no club words. One
  template per read renders both voices (`v3/engine/coach-voice.ts`
  `inBothVoices`); the player's `title`/`content` are unchanged. The base and
  the composite runner store the copy only when `coachCopyIssues` passes,
  else log it and store none. Rule-based, no LLM, no flag or migration; rows
  get it on their next re-analyze. Contract:
  `docs/architecture/coachhelm-evidence-contract.md` "Coach voice".

### CoachHelm chat: the tools, the prompt and the grounding check (rebuilt 2026-11-10)

This section is the current truth for what the chat can read and do. The two sections after it (whole-team reads,
Ask's wider reads) describe the previous tool set and are history; the mapping from every old tool to its
replacement is `src/lib/coachhelm/v3/chat/TOOLS.md`.

- **The list** is `toolsFor(surface, who)` in `chat/registry.ts`, on the contract in `chat/engine/tool.ts`. A coach
  has 53 tools (56 with the `golf_tournaments_v1` flag on; the previous stack had 67 and 71), fifteen of them
  registered for the context work (`find_in_app`, `save_note`, `remove_note` and the twelve task tools of
  `chat/tasks/list.ts`, from `chat/context/**` and `chat/tasks/**`, always last in their group), the same list on
  the Ask tab and in the practice helper so they share one cached prefix; quick chat has `send_message` in place of
  `publish_artifact` and no `write_artifact`, `draft_message` or `draft_poll`. A player has 10, all reads. Tool
  definitions plus the whole cached policy are 21,870 tokens on Ask by characters / 4, and 22,284 with the flag on
  (26,063 before, measured the same way); `__tests__/registry-size.test.ts` is the measurement and holds three
  lines: 12,000 for the registry's own tools and rules (11,997 on 10 Nov), 26,000 for the whole cached prefix, and
  24,000 with the flag on, past which rarely used tasks are to be deferred behind tool search.
- **The cached policy** is `policyBlock(surface)` in `chat/instructions.ts`: this file's rules (`rulesBlock`), then
  golf as the app measures it, then where things are in the data (`knowledgeBlocks` from `chat/knowledge/`), in that
  order and the same bytes for every team and day. The rules do not list which read answers which question; the
  data map does. For a coach they say when to work in code (`code_execution`, offered by the engine behind
  `CHAT_FEATURES.programmaticReads`): a question across many players or rounds, or a calculation across reads;
  otherwise the read is called directly, and a task is never called from code. The sentences are worded "if you
  have", so the bytes are the same with the switch on or off. `teamBlock(who)` follows it: the team, its timezone, when a season runs, the roster with ids.
- **One number, one source.** `get_player_stats`, `get_team_stats`, `get_rounds`, `get_season` and `get_qualifiers`
  (`chat/readers.ts`), and `get_round` and `get_tournaments` (`chat/readers-direct.ts`), do not compute their
  figures: they call the Clubhouse screen's own loader for the window asked
  (`loadPlayerProfile`, `loadTeamStats`, `loadTeamRounds`, `loadRoster`, `loadQualifierList` / `loadQualifierDetail`,
  `loadRoundReview`, `loadTournamentsHome`)
  and label what it returned. The route binds those loaders (`chat/screen-loaders.ts` lists each binding; `src/lib`
  does not import `src/clubhouse`). There is one team average, Team Stats'. Places in a ranking, gaps to the team
  and per-player counts and averages over the Rounds list are worked out in the reader, so the model adds nothing
  up. A loader that is missing or fails is an `unavailable` read, never an empty one.
- **Read directly** through the session client, because no screen computes them (`chat/readers-direct.ts`): one
  round (`get_round`, with its tallies counted), logged approach shots (`get_shots`), tournaments, the schedule
  with replies, travel and attendance (`get_schedule`), CoachHelm's signals, causes, focus areas, goals and tasks
  (`get_coachhelm`), practice (`get_practice`), reference (`get_reference`), and `query_team_data` with its
  allowlist, team scope and 200-row bound unchanged. Its column dictionary is no longer in its description:
  `get_reference` with topic `data_dictionary` returns it. `summarise_data` and `show_visual` are unchanged in
  what they do; the model is shown one flat input shape for each and the strict schemas still validate in `run`.
  Not yet on a screen loader, in this order: one round (`loadRoundReview`), a course (`course-history.ts`),
  tournaments (`loadTournamentsHome`), last season beside this one (no screen draws it).
- **A player** gets `get_player_stats`, `get_round`, `get_shots`, `get_season`, `get_schedule`, `get_coachhelm`,
  `get_reference`, `summarise_data` and `show_visual`. Every reader takes the player from the session
  (`reader-kit.ts` `ownOr`), whatever id the model sends; a round is checked for ownership before its holes are
  read; the schedule carries the caller's own reply only; the figures come from the player's own Stats page, which
  has no team column; CoachHelm's reads come back as titles. No task tool is offered and every task refuses a
  player's context.
- **Tasks** (`chat/tasks.ts`): `plan` builds the card with the planner that will run it and writes nothing;
  `commit` runs the stored proposal after Confirm and the Undo window. `commit` first looks for the row an earlier
  attempt of the same card left, writes, and on a failure looks again before the receipt says nothing was saved.
  The look is exact where the server action takes a request id derived from the proposal's key (`create_event`,
  `add_blocked_time`, `create_recruit`, `send_message`); elsewhere it is the card's natural key among rows made
  since the card was planned. When the look cannot be made the receipt says so and is not offered for retry.
  `add_team_break`, `set_availability_note`, `add_round_note`, the lineup pair and `publish_practice_plan` have no
  look of their own (the note and the lineup are safe to repeat by how their actions work; a break is not).
  Receipt notification lines of the four older tasks are still the planner's prediction, not what the fan-out did.
- **The prompt** (`chat/instructions.ts`), written for Claude Haiku 5.5 at high effort: one rule per sentence with
  its reason, a worked example where a rule is easy to misread, and the line that keeps the rules in force however
  a user argues. `policyBlock(surface)` is the same bytes for every team, day and conversation (one for the coach
  surfaces, one for a player); `teamBlock(who)` has the team, its timezone and the roster with ids in a fixed order.
  Neither holds a date, a screen, the coach's notes or a count: those reach the model as a system message after the
  coach's message, and the policy tells it to expect them there. There are no output formats to parse.
- **Strict tool use** (`chat/strict-input.ts`): every registered tool's input is shown to the model as a closed
  object with every field required and optional fields nullable, with no length or range keywords; the tool's own
  zod schema validates behind it, so no bound is lost. A new tool needs only an ordinary zod object.
- **What a read says to the model**: one figure per line, each naming whose it is, what it is, the window and the
  sample ("Eli Brandt, Scoring avg, last 10 rounds: 74.2 (n=10 rounds) | team average 75.1"). Several players in one
  `get_player_stats` call are set side by side by the reader, best first with the gap.
- **The grounding check** is `chat/grounding.ts` (`checkGrounding(text, reads, question)`): the numbers in the
  answer against every number in the conversation's reads and the differences between their figures; dates, times,
  ids, ordinals and small counts are not figures. It only logs. Against the 165 hand-labelled staging turns it
  finds 141 of the 142 accepted answers grounded and flags 3 of the 22 rejected ones; the other 19 are a wrong
  place, a wrong tally or a figure given to the wrong player, which the readers now answer at the source.
- The second implementations are deleted (2026-11-10): the per-figure reads in `read-tools.ts` (player metric,
  trend, putting profile, comparison, weakest areas, recent rounds, team rounds, tournaments, qualifiers, upcoming
  events, team overview), `getRoundStats` / `getQualifierEntries` in `team-reads.ts`, `getRoundDetail` in
  `shot-reads.ts`, `getTeamPuttingProfile` in `practice-reads.ts` and `applyComparisons` in `benchmark-reads.ts`,
  with their tests. What is left in those files is read by a registered tool or by a screen:
  `getTeamMetricRanking` feeds the level comparison in `get_reference`, and `getTeamStrokesGained` is the Clubhouse
  practice home's. A course is the one read with no screen behind it: the Course page's loader is one player's
  history, so the team's scoring by hole for a course stays the chat's own read (`getCourse`).
- Putting by distance (`get_player_stats` section putting, `get_team_stats` with putting): a band nobody putted from
  is written "no attempts" with a null rate, never 0 of 0 or 0%; a band putted from and never holed is a real 0%.
- A document published to the team (`publish_artifact`) says on its card, before Confirm, "Players on <team> will be
  able to see this" with the active player count.
- Tests: `chat/__tests__/registry-readers.test.ts`, `registry-tasks.test.ts`, `registry-size.test.ts`,
  `instructions.test.ts`, `strict-input.test.ts`, `grounding-fixtures.test.ts`.

### CoachHelm chat: what it knows (golf, and where things are) (2026-11-10)

The model is small, so what it knows about golf and about the team's data is written into the cached prompt, not left
behind a tool. `src/lib/coachhelm/v3/chat/knowledge/` owns it; `knowledgeBlocks(surface)` returns two strings that
are byte-identical for every team, day and conversation and sit after the policy inside the one-hour cache block
(`tools → policy → golf → data map → team`). The wiring into `instructions.ts` is described in
`chat/engine/CONTRACT_NOTES.md` (K1 to K5).

- **Golf** (`knowledge/golf.ts`): what each figure means and which way is good, how the figures relate, college
  golf, from a number to something to do, where to be careful, and what the assistant does not do (a swing or body
  diagnosis, medical advice, a label on a player, a promise, a figure from memory). It states this app's own
  definitions: strokes gained (the per-shot sum, the Tour benchmark by the team's gender and why it is the yardstick,
  why a college player's figures are negative and what to read instead, what a scorecard estimate cannot support), a counted round, the windows, the season from
  1 August, which figures need hole-by-hole scoring or logged shots, how a qualifier is ranked, how team figures pool.
  `knowledge/SOURCES.md` gives the `file:line` behind each and lists every place the app defines one thing two ways;
  `knowledge/__tests__/app-definitions.test.ts` fails when the code and the text part ways. It contains no benchmark,
  Tour average or "good" threshold (`golf-block.test.ts` guards it): every figure comes from a read.
- **The data map** (`knowledge/data-map.generated.ts`, GENERATED: `npm run coachhelm:data-map`, never hand-edited):
  what exists, which read answers which question, the exact tables and columns of `query_team_data`, what the status
  values mean, and what is not recorded. Built by `scripts/coachhelm/gen-data-map.ts` from `database.ts`, the
  allowlist and the registry, with the plain meanings in `knowledge/data-map.source.ts`. It names no table outside
  the allowlist and no column outside its table's list, and it is the same bytes with the tournaments flag on or
  off. A player's map names no table and nothing about the team. `data-map.test.ts` recomputes it and fails when a
  named table, column, status value or read is gone, or when the registry gains a read the map does not explain.
- **The on-demand reference** (`get_reference`, topic golf) is served by topic (`knowledge/reference-topics.ts`), and
  the prompt names the topics. The research document's men's Tour tables are withheld (a Tour or level figure comes
  only from topic standards, which uses the team's own tour), as are sections with unsourced college figures, vendor
  claims and a body-and-swing causal chain; five sentences are cut from sections that are otherwise served (four
  unsourced, one a note to the document's editors). The text is served written out, not in the document's
  shorthand (`knowledge/reference-plain.ts`: an explicit expansion table, so "SG", "GIR", "FW", "HCP", "ft", "yds",
  "~" and arrows never reach the model; links are left as they are; headings and table headers are in sentence
  case), and with every pointer to the document itself removed (chapter numbers, "Research doc §N", "see section
  N"). `reference-plain.test.ts` holds the served text to the eval's writing rules and to the document's numbers.
  `stripSelfReferences` is exported for any other text a model reads.
- **The golf-sense eval** (`knowledge/eval/golf-sense.json`): 76 questions (fourteen of them on strokes gained: what a
  Tour-based figure means and why; seven on writing alone) with what a correct answer must and must
  not state and which reads it should use, and nine writing rules held against every answer (they follow the
  prompt's "How your answers read": no sample notation, heading, bold label on a list item, abbreviation, wrong
  capitals, hyphen for a minus sign or date written as digits), in the shape `scripts/coachhelm/ask-eval.mjs` scores. A question that ends
  in a yes/no question fails past six sentences (the answer, at most three supporting points, one caveat or offer). Not yet run: a run
  is a live spend against staging and needs the owner's approval.
- When a read tool is added, renamed or removed, or the allowlist changes: update `data-map.source.ts` and run
  `npm run coachhelm:data-map`.

### CoachHelm chat: where the coach is, what it has been told, and what it can do after a thing exists (2026-11-10)

Code: `src/lib/coachhelm/v3/chat/context/**` and `src/lib/coachhelm/v3/chat/tasks/**`. The wiring each part asks of the
route and the registry is in `engine/CONTRACT_NOTES.md`, sections C1 to C7.

- **Where the person is.** The browser may send a `screen` value with a new message (`context/screen-schema.ts`;
  `screenContextFromPath` builds it from the address). `turnContext` (`context/screen-context.ts`) checks every id in
  it against the signed-in person's own team with the session client and writes one line for a system message after
  the user's message: "Today is Tue 10 Nov 2026. The coach is on Stats, looking at Avery Lane over the last 10
  rounds." An id that is not theirs is dropped; a value that does not parse is ignored and the turn runs. The line
  never holds an id or an e-mail address. A player's line holds the screen, the window and their own round only: no
  name and no title somebody else typed. It is never in the prompt or a tool definition.
- **Where things are.** `context/app-map.ts` lists every Clubhouse place per role with its address; a test holds each
  address to a real page and a rebuilt route for that role. `find_in_app` names matching places to the model and
  attaches a `data-app-link` part (a button); the model is never given an address. The route offers the tool only
  where Clubhouse renders for the team.
- **What the coach has told it.** `save_note` and `remove_note` (`context/notes.ts`) write the coach's own standing
  notes through `saveCoachFact` and `deleteCoachFact`, at once, with a `data-coach-note` chip. Notes reach the model as
  a system message on a conversation's first turn; the tone goes with every turn. Without held migration
  20261101090100 there are no notes and nothing fails. A player has none. Anthropic's memory tool is not used
  (CONTRACT_NOTES C3 says why).
- **What it can do after a thing exists.** Twelve task tools on the contract (`tasks/list.ts` is their order):
  `send_event_reminder`, `record_attendance`, `update_event`, `cancel_event`, `set_focus_area_status`,
  `set_goal_state`, `mark_signal_handled`, `set_qualifier_coach_pick`, `set_task_reminder`, `dismiss_signal`,
  `log_focus_progress`, `record_focus_outcome`. Each wraps the app's own action, makes that
  action's permission check first in `plan`, and reads back before a receipt says nothing was saved. Each card says
  what the player will see on their own pages, established from the page's code and held by a test that reads it
  (a focus area's value shows, an entry's note does not; an outcome completes the focus area and credits the signal
  it came from, and if that second half fails the receipt is `partial`). Seven of the cards can be edited in place
  before Confirm (`editable` and `revise`, through `editing` in `tasks/kit.ts`): `update_event` (date, start, end,
  place, title), `set_task_reminder` (date, time), `log_focus_progress` (value, note), who gets a
  `send_event_reminder` (chosen from the active roster), and the reason on `cancel_event`, on closing a goal with
  `set_goal_state`, and on `set_qualifier_coach_pick`. `dismiss_signal`'s card says that after the Undo window no
  screen brings the signal back (the app's restore is reached only from the board's own Undo). An edit is merged into the
  input the card was planned from, held to the tool's own schema, and planned again with every read and check; the
  thing the card is about (the event, the task, the focus area) is never a field. `cancel_event` is
  the app's soft cancellation and never the row delete; `update_event` and `cancel_event` act on one date, as the
  Calendar does for "this date only". Where something is sent the card names who gets it and shows the words, and a
  test pins those words to the app's own lines.
- **What is not a tool, and why.** `tasks/INVENTORY.md`: all 304 actions that change something, the tool for each or
  the reason there is none, and the list left for later in order. Deleting, removing a person, roles, accounts,
  consent and sending outside the team are never tools.

### Coach chat read tools: whole-team reads (2026-10-25)

`get_team_rounds`, `get_tournaments` and `get_qualifiers`
(`src/lib/coachhelm/v3/chat/read-tools.ts`) read the active roster at once, so
"who played best in the qualifier" no longer falls back to one player at a
time. Rules they keep: rounds are scoped by the roster's player ids (not
`golf_rounds.team_id`, which counts former players and misses rounds logged
under another team), every `.in()` goes through `chunkIds`, and
`get_tournaments` is registered only while the tournaments release flag is on.
`get_team_rounds` and `get_qualifiers` are registered only while Clubhouse is
on for the coach's team (`isClubhouseForTeam`, 2026-10-28): the engine is
shared with Fairway's chat, and these were built for Clubhouse's Ask. The
chat route decides it and passes `teamTools` to `buildCoachTools`.
`get_team_rounds` returns one `Measurement` per player (three or more draw as
a ranking) and a weekly team `MeasurementSeries` (drawn as a trend), so the
Ask thread charts it from the evidence's shape; averages are computed
server-side so the numeric audit can trace them.

### Ask's wider reads: benchmarks, golf reference, typed reads, query_team_data (2026-11-08)

Registered with Ask v2 only (`askV2`; Fairway's chat is unchanged). All read through the caller's RLS session (`sb`), never the service client, and put every figure in `detail`/`measurements`, because the numeric audit accepts nothing outside an envelope.

- `get_benchmarks` (coach and player; `benchmark-reads.ts`): `golf_pga_standards` for the team's tour (`golf_teams.gender` womens gives the LPGA rows, with no fallback to the men's value; an unreadable gender claims no benchmark), levels pga/korn_ferry/d1/d2/d3/hs with Tour percentiles and the row's source; plus `golf_player_standing` for one player (a coach names a roster player; a player gets only the session's own row, the team average, and place in the team, shown from 5 teammates like the Standing page). Any Tour comparison is recomputed from the right tour's row; the row's own `pga_value`/`pga_delta` are men's-anchored and are not returned. Approach-proximity rows compare to the Tour only when `basis` is `all_shot` (`isStandingTourComparable`). `applyComparisons` also fills `comparisons` and `benchmark` on the measurements and series other reads return (Tour value only; Ask's `sg_tee`, `sand_save_pct`, `penalties_per_round` map to the standards' names).
- Three references (owner, 2026-11-08): every benchmark comparison, coach and player, carries the same three in this order: (1) the player's level (Division I/II/III average; the team's level is the newest `golf_team_seasons.division`, else the program's Division on Settings, Team (`organizations.division`, free text such as "NCAA D1", parsed by `levelFromDivision`); nothing else is guessed) with the player's place among the college players of the same gender on Helm when `golf_player_standing` has one; (2) the team figure and the player's place in the team, over the SAME window as the figure. The team figure is Team Stats' own POOLED one (`teamFiguresOver` in `player-figures.ts`: every player's newest rounds in the window pooled, practice cut as Stats cuts it, its strokes-gained legs identical to `teamStrokesGainedOver`'s; carried on `get_team_metric_ranking` as `detail.team_figure` and labelled "Team, all players' last 10 rounds pooled"), not a mean of the players; for all recorded rounds (no pooled Stats window) it is the mean of the players' stats-cache figures and says so. The place comes from the same per-player values as `get_team_metric_ranking` (`BenchmarkSource.cohort` calls the ranking itself; on a ranking read the comparison uses the read's own values): the place is a rank (`Comparison.place` of `place_of`, 1 best by the metric's direction, ties share a rank), never a percent, and needs five players with a figure; a window the figure does not state, or a player asking for a windowed team figure (a player cannot read teammates' rounds), gets a stated gap, and the nightly standing's all-history team figure is used only beside an all-recorded-rounds figure and labelled so; the level's place (share of college players) is always over all recorded rounds and says so; (3) the Tour (the team's tour: PGA or LPGA). Level first, Tour last. A missing one is a `Comparison` with `value: null`, a `note` and a short `missing_reason` the chip and card print (level: "not set" when no division is on record, "no college figure" for strokes gained, which still shows the team and the Tour's 0 baseline; team: "fewer than 5 teammates" / "no team average yet"; Tour: "not compared" where the Tour is measured differently), never dropped and never replaced by another; the chip's verdict is graded against the level, falling back to the Tour only for the grade, with the level line still stating it is not available. A team-level figure (a team average, a ranking) gets level and Tour only. A player sees the team average and their place in the team, never a teammate's name or figure. `get_benchmarks` takes the same `window` (default last10), reads the player's figure for it, and each row says its `window`/`window_label` and keeps the standing's all-rounds figure as `standing_value` when they differ. Carried as `Measurement.comparisons` (`applyComparisons` in `benchmark-reads.ts`, `provenance.ts` `Comparison`) and `detail.standing.rows[].comparisons` plus `gaps{vs_level,vs_team,vs_tour}` on `get_benchmarks`; `levels` defaults to the team's level and the Tour (only the Tour, with a "Level not set ... Settings, Team, Division" note, when no division is on record). The chip (`CoachComposition` headline) and the benchmark card (`benchmarkBlock`) draw all three with `comparisonWords`. The card stacks per metric (short label such as "5–10 ft makes", the value, the track, then the three in words, "D3 50% · Team 33% · Tour 66%", each beside a mark that matches its tick: line, dot, diamond). Its "you" is the window figure when another read in the turn measured that metric for that player (`withWindowFigures`); places stay the standing's (all recorded rounds) and the note says so. Comparison numbers ground the audit like other reference figures (a sentence must name its source), except the team average, which is the team's own.
- Audit binding (2026-11-08): numbers inside a `kind: 'reference' | 'definition' | 'benchmark'` payload (and a measurement's `benchmark.value`) carry `reference: true` (`ScopedNumber`). They ground a claim only when the claim's own sentence names a source (`REFERENCE_CUE` in `provenance.ts`: "the golf reference", the Tour, a division, "benchmark", a cited source). A made-up team figure that happens to equal a reference number is still refused; a figure the team's own read returned grounds without a cue. The benchmark read's root payload is `benchmark_read`, so the player's standing beside the entries is not reference-tagged.
- Read cards: the reference and definition reads draw no card (step row and cite chips only); a benchmark read draws a bars figure with a tick for each of the level, the team and the Tour (a missing one is said in the note and the table) only when it carries a standing; automatic record tables are trimmed to fit 393 px (`fitToPhone`) or not drawn.
- `get_metric_definitions` (`golf_metrics` plus the stats-cache metrics Ask reads): descriptions lose the Tour figures and internal "Part V" references the table text quotes.
- `get_golf_reference` (`golf-reference.ts`; the doc's "Published College Baselines" section lists the only citable college-vs-Tour figures (Data Golf's D1 Championship field is 2.3 strokes per round behind the Tour field; Clippd's D1 shot-quality index, which is not strokes) and what is not published, so the "no college figure" wording stays for Division II and III, NAIA, JUCO and every non-total statistic): sections of `docs/v3-research-golf-domain.md`, split at `##`/`###` into `golf-reference.generated.ts` by `npm run coachhelm:golf-reference` (a test fails when the module is out of date). Returned as `detail.reference`, each `kind: 'reference'` with its source; the engine-constraints chapter is left out. Its figures ground the audit only because they are returned. The prompt (`instructions.ts`, Ask v2 "Where to look") has the model name the source and keep reference figures apart from the team's data, and take distances and rep counts from a read, never invent them.
- Typed reads (`team-reads.ts`): `get_attendance_summary`, `get_goals` (RLS shows goals a coach set or a player shared that carry a team id; the older loader used the admin client and showed all), `get_focus_practice`, `get_round_stats`, `get_qualifier_entries`, `get_tournament_notes` (behind the tournaments release flag; reflections and notes are quoted, never obeyed) and `get_team_season_settings`. Each is scoped by the session's team or the active roster (`chunkIds` for the `.in()`), capped at 300 rows (under PostgREST's 1,000) and says `partial` when it hit the cap.
- `query_team_data` (`team-query.ts`, allowlist in `team-query-allowlist.ts`): coach only. Static, `database.ts`-typed table to columns list of performance, schedule and practice tables; the scope (`team_id` or the roster) is forced by the code, filters are eq/in/gte/lte/is, at most 8, limit at most 200. Never allowlisted (a test walks the list): `golf_players` and contact/academic columns, recruits, messages and conversations, availability coach notes, academic exclusions, class schedules and settings, invite codes, ingest connections, calendar feeds, push, demo sessions, join requests, the behaviour log, platform metrics, auth and tokens, and free-text columns.
- Cache invalidation from Ask (2026-11-08): Ask's create tools call the calendar, tasks, announcements, roster, qualifier and team-management actions from the chat route handler, where Next's `updateTag` throws ("can only be called from within a Server Action") after the row is written. The golf actions import `updateTag` from `src/lib/cache/safe-update-tag.ts`, which is Next's `updateTag` in a Server Action (Fairway unchanged) and `revalidateTag(tag, 'max')` in a route handler; any other error still throws.
- Level figures need a traceable basis (2026-11-08): a Division I/II/III or high-school value in `golf_pga_standards` is stated only if `SOURCED_LEVEL_FIGURES` (`benchmark-reads.ts`) lists it with `published` or `estimate` and a source; an estimate reads "Division I estimate" with its basis in the note. The audit of the seed rows found none: their notes cite an internal "§3 college trend", Shot Scope's 0-handicap players, or nothing, so the level is Helm's own data instead (owner, 2026-11-08): the mean of the OTHER players on Helm at the team's division ("Division I players on Helm (n=22)", from a division-cohort table that migration `20261108100000` creates and is **HELD**, so until it is applied this step is skipped), else the other college players on Helm of the same gender (the standing's `level_avg`, labelled "College players on Helm (n=70)"); each needs 8 others, else "not enough Division I players on Helm yet". The player is left out by `(avg*n - own)/(n-1)`, and the level row carries `your_value`, the player's own all-recorded-rounds figure (the standing's `player_value`): the card and the answer set that against the level ("over all recorded rounds you're at -3.83 against -2.9 for Division I players on Helm, ahead of 40%"), the gap to the level is from it, a window figure is graded against the Tour and never the level, and the team and the Tour rows keep the window figure; the place stays ("ahead of 90% of 71 college players on Helm", all recorded rounds). Only aggregates are read: no player's figure comes back. A sourced published or estimated figure in `SOURCED_LEVEL_FIGURES` would still take precedence. A benchmark's `source` is the Tour's; each level states its own.
- Rounds (2026-11-08): `get_recent_rounds` (coach and player) lists the rounds Stats counts for "last N" (the figures source names them, practice left out) so the list and the scoring figure agree, and carries each round's stat line (putts, three-putts, greens, fairways, up-and-downs) for the player's own rounds. `round_lines` and the stat line read `three_putts` and `total_putts` as empty, never 0, for a round with no putts recorded (the cache writes 0). A cache rate with no hole count beside it (three-putt rate) is sampled over rounds, not holes.
- A coach never reads the model's notes (2026-11-08): `coverage_note` is for the model. A cut list's caption comes from the read's detail (`rows-caption.ts`: "Newest 5 of 124 rounds"; a summary carries `detail.caption`, "Worked out from the newest 5 of 124 rounds"); a note that names columns or instructs the model is not drawn; a figure card's title names the field in a coach's words and what it covers (`summary-labels.ts`: "Putts per round, 3 tournament rounds"); a model visual that plots the same metric for the same players as a read's chart folds that chart.
- Answer layout (2026-11-08, `coachhelm-chat-thread.ts`): a failed read the model then repeated with success is not drawn (steps say "One calculation was retried" / "One read was retried", no field names); an unrecovered `summarise_data` failure reads "That calculation could not be completed." Once a `summarise_data` result exists, the reads it names in `detail.sources` (by evidence ref) fold into the reads disclosure and any other read stays drawn (a summary that names none folds every `team_data` read before it); two reads listing the same player's same rounds draw one table (the one with three-putts, then putts); a figure's card title comes from `detail.titles` ("Owen Carter vs team (pooled), strokes gained approach"), while the labels the model reads stay as they are; a cut record list is captioned "Newest 5 of 127 rounds" from `detail.noun` and the order (the model's `coverage_note` never reaches the coach); a putts or three-putts cell of a round in progress reads "In progress" and a 0 with no putts recorded is empty, never 0; a record list longer than the table draws (8 rows) folds into the reads; a recent-rounds table draws every round it lists; a missing reference is one sentence per metric ("SG Putting: no level figure (no college figure), no team figure (all rounds only)."); a read's inline chip is drawn once per paragraph, list or table, and reads "By player · Jun 9–Sep 26" (the dates, never a count of days); the benchmark line reads "PGA Tour (2024): 0.0"; its list is the answer's table, its figures one figure card. A generic record table orders columns by a fixed priority (who and when, then the asked figure, then course and score, then status-like labels last), five at most, trimmed to 393 px, identical live and after a reload.
- (Superseded 2026-11-10 by "CoachHelm chat: the engine" above; `prompt-cache.ts` and `ask-perf.ts` are deleted.) Speed and cost of a turn (2026-11-08, `chat/stream/route.ts`, `player-turn.ts`, `prompt-cache.ts`, `ask-perf.ts`): the reads before the model (gate, rate limit, conversation, answered-turn lookup, prior evidence, and for a new conversation the budget) run in ONE wave and are applied in the old order, so a coach is told the same thing for the same fault; a continued conversation reads its budget only after the answered-turn lookup (a retry runs neither the model nor the budget gate). Only the answer's own row is written before the stream closes; the conversation touch, proposal links, cost ledger and log lines run in `after()` (awaited where `after` does not exist, so tests and scripts are unchanged), because the stream stays open until `onFinish` returns (about a second a turn). The system prompt is two blocks (`buildInstructionBlocks`: `stable`, byte-identical for every team, one-hour cache, behind the tool definitions; `dynamic`: standing notes, team, date, roster, five-minute cache), plus one breakpoint on the last message moved forward every step (`withTailBreakpoint`), so a step pays fresh tokens only for what the step before it added. New prompt text that names a team, a coach or a date goes in `dynamic`, never `stable`. Ask v2's `dynamic` block lists the roster's player ids for the tools, so a named player is read in the same step instead of after `find_player` (the tools still refuse an id that is not on the roster; the prompt keeps ids out of answers). Measuring: a development request with `x-ask-perf: 1` ends with a transient `data-ask-perf` part (phase marks, per-step tokens split fresh / cache read / cache write, time to first output); `x-ask-perf: capture` adds the last model request for replay; `x-ask-effort: low|medium|high` varies the model's effort. Never on in production. The largest remaining cost is output: the `<<<CLAIMS>>>` and `<<<CITES>>>` blocks are about half of a cited answer's output tokens (about 5 s and $0.014); effort low or medium roughly halves the wait but makes the model read less, which is an owner decision (`ask-perf-baseline.md`).
- A turn that ends with no answer (the stream died: a reload, a timeout, a crash; no error, no stored assistant text, or only progress steps) is not left as the question alone: `answerNeverCame` (`coachhelm-chat-thread.ts`) makes `Ask.tsx` show "This answer didn't finish coming through." with Try again, which `regenerate`s the same question (no second copy). Not shown while streaming, after an answer, or over a real error.
- Data dictionary and `round_lines` (2026-11-08): `data-dictionary.ts` holds, for every allowlisted table and column (typed against the allowlist; a test fails on a gap), the unit, meaning, sign and when it is empty, built from `database.ts`, the SQL that fills the caches and the CHECK constraints; a column whose unit the code does not show is `unknown` and listed in `UNKNOWN_ENTRIES` (today: `golf_player_focus_areas.priority`). `describeQueryTables` prints each column with its unit and the reading guide (`DATA_QUIRKS`: several rounds a day, total-only rounds, round types, SG against the team's baseline, units and signs); `DATA_READING_PROMPT` is the compact system-prompt version. Every `query_team_data` envelope carries `detail.units`, and a generic table puts ft/yd/% in its headings. `round_lines` (`team-round-lines.ts`) is a virtual source: the roster's `golf_rounds` (test rounds out) plus `golf_round_stats_cache` for the same ids, merged in code through the caller's session (no view, no migration), one row per round with `three_putts` from the stat line and empty (never zero) where a round has none. Without an `order`, a read follows the question's own date (the filtered date, else an asked-for date column), never `updated_at`. Every read counts rows exactly (`count: 'exact'`): a cut result is `coverage: 'partial'` with "the first N of M rows", `detail.total_rows` and `detail.truncated`, and the prompt tells the model to say so.
- Windows (2026-11-08): `get_putting_distance_profile` and `get_player_weakest_areas` take the same `window` as `get_player_metrics` (last5/last10/last20/season, default last10, `cache` explicit). Putting by distance reads the window's rounds and shots in the Stats page's six bands (`loadPlayerPuttBands`, handed in by the route as `puttBands`, same cut as `stats-player.ts`). The player's own Ask has the same tool with the same `window` input and no `player_id` (forced to the session player; `buildPlayerTools({ puttBands })`, `runPlayerTurn` passes it from the route); `ask-putt-bands-parity.test.ts` pins both roles to the Stats bands; weakest areas compares the round-based areas for the player and each teammate over the window and marks the shot-level areas it can only take from the cache. Every window-bearing read is stamped `window_label` on its envelope (`window-label.ts`; "all recorded rounds" when the figures were the cache's), and the Ask scope line shows the last turn's labels, falling back to the question's words before any read.
- Not included: season-window standing (the season standing table has no authenticated policy and is read by service client elsewhere), and any player-side typed reads.

### Coach chat visuals (2026-10-25)

`show_visual` (always registered; the `coachhelm_visual_artifacts_v1` flag was
removed 2026-10-29 at the owner's request) takes a scene and the
`evidence_ref`s the read tools returned this turn. `chat/visuals/compile.ts`
resolves them, refuses what cannot be drawn honestly and returns a hashed
`ValidatedVisualArtifact`; the message keeps it as `data-visual-artifact`, so a
reload draws the same chart. See `docs/architecture/coachhelm-agentic-visuals.md`.
No model text puts a figure on screen: a title or a note with a digit is
refused or dropped (`figure_in_text`). The artifact's `evidenceRefs` name only
the reads it draws in full (a leg or the total and nothing else), and the
thread hides only those reads' evidence blocks, so a read named alongside
stays visible (2026-10-27).

Model-designed visuals (2026-10-29). `show_visual` `kind: "compose"` lets the
model design the visual: building blocks (headline, kpis, trend, bars, split,
compare, note), their order and emphasis, a title, a lede and a layout, each
block naming the read it draws from. `chat/visuals/compile-composition.ts`
copies every figure from those reads, drops a block it cannot draw honestly
(and tells the model why), refuses a digit in any model-written text, and
returns a hashed `ValidatedComposition` (`chat/visuals/composition.ts`) kept as
`data-visual-composition` and replayed on reload. The playbook the model
composes by is `VISUALS_SECTION` in `chat/instructions.ts`, mirrored with the
card anatomy, motion spec and message mechanics in
`docs/architecture/coachhelm-visual-playbook.md`. Fairway draws compositions
and the `sg_anatomy` artifact in `ChatThread` (`CompositionVisual.tsx`, figures
in `EvidenceFigures.tsx`, motion in `EvidenceMotion.tsx`); visuals that arrive in
a live answer animate in, restored threads and reduced motion render final.
Coach chat runs on Claude Sonnet 5.5 at effort medium (`MODEL_FOR_TASK.coach_chat`) and a player's Ask on Claude Haiku 5.5 at effort high (`PLAYER_CHAT_MODEL`), each from its profile in `chat/engine/model.ts` (2026-11-10).
Fixture for screenshots: `/fairway-preview/coachhelm-evidence` (`?live` replays
the motion; dev only).

## Clubhouse redesign behind flags (all off, migrations held)

<!-- schema-drift-absent: golf_coachhelm_coach_facts, golf_practice_plans -->
These features are always on (their flags were retired 2026-11-07, see
`docs/clubhouse/changes/2026-11-07-coachhelm-flags.md`). Every migration named here is written and not
applied. `supabase/migrations/HELD.md` is authoritative for them.

- The redesigned Ask: answer card, live steps, read chips, artifacts, create flows, Undo hold.
- The read as its own view (`?view=read`). Read only.
- One file per player for a coach (`?view=player`). No new writes.
- The coach's Team view in Clubhouse. Read only.
- The top-bar Helm key and Glass quick chat.
- A player's own read-only Ask.
- Ask drafts, files and publishes practice plans.

Screens and data:

- Read: `src/clubhouse/screens/coachhelm/read/ReadPage.tsx`, `src/clubhouse/data/coachhelm-read-view.ts`.
- Player file: `src/clubhouse/screens/coachhelm/file/PlayerFile.tsx`, `src/clubhouse/data/coachhelm-file.ts`.
- Team board: `src/clubhouse/screens/coachhelm/team/TeamBoard.tsx`, `src/clubhouse/data/coachhelm-team.ts`.
- Quick chat: `src/clubhouse/shell/quick-chat/QuickChatProvider.tsx`.

Ask v2 rules:

- `src/app/api/coachhelm/v3/chat/stream/route.ts` also serves Fairway's chat. It
  uses Ask v2 only when the flag is on and Clubhouse is on for the team.
- The Undo hold lasts 8 seconds (`src/lib/coachhelm/v3/chat/undo-hold.ts`). Undo
  inside it leaves no row and tells nobody.
- `20261101090000_coachhelm_action_runs_hold.sql` adds the column the hold needs.
  Without it, the write runs at once and no Undo is offered.
- A player reaches the stream route's player branch only with no coach row
  (`CoachContextError.reason === 'not_a_coach'`). Any other coach denial stays
  denied, and a failed coach lookup is a 500. `runPlayerTurn` confirms a player
  row, then applies `isCoachHelmEnabledForPlayer` before the rate limit and
  model.
- Player Ask returns no teammate's data and no guessed cause
  (`src/lib/coachhelm/v3/chat/player-tools.ts` (this file was removed in the 2026-11-10 CoachHelm chat rebuild)): `get_upcoming_events` carries
  the
  player's own `my_rsvp` (`accepted`, `declined`, `no_reply`) and no counts or
  names; `get_round_detail` reads only their own rounds; `get_my_reads` titles
  pass
  `playerTitle`.
- What a player may read of a cause has one owner,
  `src/lib/coachhelm/reads/player-cause.ts`. Only a counted sequence is theirs.
  The
  Clubhouse mapper (`toChInsight`) applies it for any viewer but a coach, and
  `assignAs` for every viewer, since the player reads the saved focus area.
- `src/app/api/coachhelm/v3/chat/actions/[key]/route.ts` is new. `GET` returns the
  receipt and `DELETE` undoes a held action. It answers 404 for another coach's key
  and when the flag is off.
- `20261101090100_coachhelm_ask_tone_and_facts.sql` adds per-chat tone and
  `golf_coachhelm_coach_facts`. Tone and knows stay hidden until it is applied.

New server actions:

- `src/app/golf/actions/coachhelm-ask.ts`: `saveCoachFact`, `deleteCoachFact`,
  `setChatTone`, `readQuickChatWeek`.
- `src/app/golf/actions/coachhelm-practice-plans.ts`: `savePracticePlanDraft`,
  `undoPracticePlanDraft`, `listPlanFolders`. Saving needs
  the plan tables.
- `src/app/golf/actions/coachhelm-plan-format.ts`: `readPlanFormat`,
  `setPlanFormat`, `undoPlanFormat`. A format is layout only. A new plan's drills,
  times and groups never come from the sample.

Player Ask and its allowance are in `memory/features/player-coachhelm-development.md`.
Plan storage and publishing are in `memory/features/team-operations.md`.

### Ask v2 surfaces and hand-offs (sweep, 2026-11-06)

- The chat request carries `surface`. `send_message` is registered only for
  `quick_chat`. Left out, the surface is the Ask tab, which can't send.
- The Ask tab's `draft_message`, `draft_poll` and `draft_board` write
  `data-handoff` parts and nothing else. Messages takes the words, the poll or the
  picture (`screens/messages/prefill.ts`), and the coach sends.
- `write_artifact` writes `data-artifact`, kept by `restore.ts`. Its words join
  the text `computeTurnVerdict` audits. `publish_artifact` is a held flow.
- `create_drill` registers only with the practice plans flag; otherwise
  `drill_bank_status` says the bank isn't on yet.
- `landing-rows.ts` reads the rows a draft lands between, for the card only. A
  failed read draws the new row alone.

## UI Contract

- Coach views need fast triage: new, acknowledged, dismissed, resolved, and priority states must be visible.
- Player views need clear actionability: what changed, why it matters, and what to do next.
- Loading states should use skeletons that match final layout.
- Empty states should stay compact and explain whether there is no data, no permission, or no insight yet. The Ask page's `ProgramOpening` renders a compact honest empty state when the program pulse has no items (2026-08-26) — it must never return nothing and leave the column blank.
- Mobile views must use the shared app shell, Standard or Action headers, and bottom-nav clearance from `AGENTS.md`.
- The Ask composer autofocuses only on fine-pointer (desktop) clients (2026-08-26). On touch, no CoachHelm surface may focus a text input on open — iOS answers that focus with a keyboard over an unread page.
- The phone Ask drawer (`CoachHelmDrawer`) lifts by `--keyboard-height` and the composer drops its home-indicator pad while `body.keyboard-open` (2026-09-02) — the WebView never resizes for the keyboard, so a `bottom-0` drawer put the composer under the keys exactly like the messages screen.
- A failed Ask request never shows its response body (2026-09-30). `POST /api/coachhelm/v3/chat/stream` refuses with a status and a JSON body, and the AI SDK makes that body `error.message`, so the notice used to print `{"error":"Too many requests. Please slow down."}`. `describeChatError` (`src/lib/coachhelm/v3/chat/error-message.ts`) maps by status, reading the error's `statusCode`/`responseBody` structurally: 429 with a `reason` (the three budget refusals) keeps the server's own sentence and offers no Try again; 429 without one reads "You're asking quickly. Wait a moment, then try again."; 404 with `Conversation not found` reads "That conversation isn't available. Start a new chat." and offers Start a new chat (retrying the same id would 404 forever; a 404 from a missing active team gets the generic sentence); 401 "Your session ended. Sign in again, then retry."; 403 with `CoachHelm is off for your team.` (the CoachHelm gate, CH13-20) "CoachHelm is turned off for your team." and any other 403 "Ask CoachHelm is for coaches.", both with no button; 400, 500 and anything else "Something went wrong while answering. Try again." An error with no `statusCode` is a stream fault (`new Error(chunk.errorText)`) and keeps the server's provider sentence; a browser network failure ("Failed to fetch", "Load failed") reads as the generic sentence. `CoachHelmChat` renders it for both the page and the drawer. Start a new chat under a lost conversation is owned by the host: `AskSurface` (the Ask page and the Intelligence tab) mounts a fresh thread and drops `c` (and `q`) from the address bar with `history.replaceState`, so a reload does not reopen the dead thread; the drawer never writes the URL and resets the hook alone. Tests: `src/lib/coachhelm/v3/__tests__/chat-error-message.test.ts` (this file was removed in the 2026-11-10 CoachHelm chat rebuild) (real `DefaultChatTransport` against a stub `fetch`), `CoachHelmChat.error.test.tsx` and `AskSurface.lost-conversation.test.tsx`.
- A retry of a turn that already has an answer gets that answer back as a message stream (2026-09-30). The stream route used to answer the idempotent-replay branch with `{replayed: true, messages}` as JSON with a 200, which the chat client parsed as an empty stream: Try again ended with the question and no answer and no error, while the answer sat in the database until a reload. `storedTurnChunks` (`chat/restore.ts`) turns the stored row into the same chunks a fresh answer sends (prose and `data-*` parts, what a reload shows); tool parts are not replayed, so a replayed action card cannot be confirmed, as after a reload. Only a non-`failed` row replays (`findAssistantTurn`). Tests: `src/lib/coachhelm/v3/__tests__/chat-replay.test.ts` (the real `Chat` and `DefaultChatTransport`) and a case in `route.test.ts`.
- Ask's refusals (2026-11-05). Live, 3 of 3 turns were refused, and production's ledger had 9 of 20 `coach_chat` turns refused in 30 days. What holds now (contract: `docs/architecture/coachhelm-evidence-contract.md`):
  - A thin figure is allowed when its sentence states the measurement's exact sample ("72.5 over his 2 rounds"); owner's decision. No sample, or the wrong one, is refused.
  - A "because" refuses an answer only when the cause is about play and names nothing measured. A figure's reason for being missing does not.
  - A number matches at its own written precision, so 72.95 no longer passes against 72.55. "18-22" is a range, "-3.83 (Bo Ray)" is Bo's, and "September 25 and 26" is two dates.
  - `get_season_scoring` answers "this season" on Roster's rule, and `compare_seasons` and `get_team_rounds` count the same rounds. A round posted as a total only counts, which is why 12 of Demo University's 15 season rounds used to read as incomplete.
  - A single practice with a start reaches a draft card with the usual 2.5 hours on it, marked as assumed (`USUAL_PRACTICE_MINUTES`, production's mode across 78 practices). Confirm is unchanged. Only a practice gets this default.
  - Player Ask's audit reads the same evidence and dates, and now writes its ledger row. Its old insert named columns the table doesn't have, so no row was ever written. It still streams live, so it records rather than withholds.
  - Follow-ups: the prompt tells the model to read again instead of restating an earlier answer's player figures, because the player guard (`route.ts`) drops them. A live model call has to prove the prompt changes hold.

- The grounding audit does not flag a plain calendar year (2026-09-30). `auditNumericClaims` blanks a year, or a season span like "2025-26", out of the text after the date audit and before the number scan (`CALENDAR_YEAR` in `provenance.ts`): 1900-2099 only, an integer that is not the start of a decimal or a signed, prefixed or percent value, and not followed within two words by a unit of measurement (yards, feet, meters, miles, mph, pounds, degrees). "1250 yards", "2050 yards", "2026%" and "2026.5" are still flagged; a dated expression ("Aug 16, 2026") is still audited as a whole. Putts, strokes, shots and rounds are deliberately not on the unit list ("in 2026 putts per round fell", "in 2026 she shot 84" are ordinary years). The typed claim gate (`claim-validator.ts`, flag `coachhelm_chat_claim_gate`, off) has its own uncited-number scan and was not changed. Tests: `chat-provenance.test.ts`, "calendar years".
- (Mechanism superseded 2026-11-10: the server now holds the waiting card and declines it itself, see "CoachHelm chat: the engine" above; `denyAbandonedApprovals` is deleted.) A Confirm card the coach never answers is a Cancel when they ask something else (2026-09-30). The server half of Confirm is proven through the real `streamText` (`src/lib/coachhelm/v3/__tests__/chat-approval-server.test.ts` (this file was removed in the 2026-11-10 CoachHelm chat rebuild): an approved thread runs the gated write once, a declined one does not). The browser resends the whole thread with every question, so an unanswered `approval-requested` card followed by a newer user message used to reach the SDK as a tool call with no result, and the request died with "Tool result is missing for tool call …" before the model ran (production 2026-08-26 18:54:06, the only proposal recorded after the July Confirm fix), for every later question in the thread until the card was answered. That was ai 7.0.37; on ai 7.0.128 `convertToModelMessages` strips such a card itself, so the request survives but the proposal silently vanishes from the prompt (the "why the guard exists" case in that test pins this). `denyAbandonedApprovals` (`src/lib/coachhelm/v3/chat/abandoned-approvals.ts` (this file was removed in the 2026-11-10 CoachHelm chat rebuild), called in `chat/stream/route.ts` before `convertToModelMessages`) turns any still-pending card that has a newer user message after it into a denial: nothing is created and the model reads that the coach did not confirm it. `ChatThread` draws the same card as "Cancelled. Nothing was created." (it is not drawn as cancelled when a receipt for its idempotency key exists anywhere in the thread, since after a reload the approval state is not replayed and the receipt is the only proof the write ran). The `golf_coachhelm_action_runs` row is not updated: it stays `proposed`.
- A question started on the Brief tab (`CoachIntelligenceHome` → `?q=` → the Ask page) auto-submits exactly once through `PromptComposer`'s own `submit()` (2026-09-02). Since 2026-09-24 (audit DATA-15) that auto-submit requires a hand-off token: the Brief tab calls `markAskHandoff(question)` just before navigating, and `AskSurface` auto-sends only when `hasAskHandoff(question)` matches (same question, under 60 s old, one use; `src/lib/golf/ask-handoff.ts`, sessionStorage). A bare, pasted, emailed or crawled `?q=` link only pre-fills the composer, so it can no longer spend an LLM call or create a conversation on its own. `AskSurface` strips `q` from the URL the moment the submit is kicked off, before the server has minted a conversation, so a refresh or back-navigation in that window cannot resend it. `PromptComposer` also now restores the just-submitted text into the field on a failed turn (never on success) instead of the previous unconditional clear-on-submit, so a failure does not force retyping. See `src/components/golf/coachhelm/chat/PromptComposer.tsx`, `CoachHelmChat.tsx` (`autoSubmitInitialInput`), and `AskSurface.tsx`.
- A route's `loading.tsx` reserves the page's paint at t=0 — for a
  `'use client'` page holding its own `loading` state that is that
  component's loading branch, not its settled layout. A route whose
  `page.tsx` is a pure `permanentRedirect` shim renders `bg-canvas` only:
  no geometry, and no real `<h1>` for a screen that never mounts.
  Reference implementation: `dashboard/alerts/loading.tsx`.

## Known Risk Areas

- **Chat entries below dated before 2026-11-10 describe the previous chat stack** (the AI SDK route with its held text,
  prose audit, verdict parts, repair pass, claims and cites blocks and client-held thread). They are kept as the record
  of why the rebuild was made. What runs now is in "CoachHelm chat: the engine" under Business Rules. Files and tests
  those entries name that no longer exist: `chat/abandoned-approvals.ts`, `chat/stream-blocks.ts`,
  `chat/repair-pass.ts`, `chat/repair-feedback.ts`, `chat/prompt-cache.ts`, `chat/ask-perf.ts`, `chat/ui-parts.ts`,
  `computeTurnVerdict` in `chat/verdict.ts` (the file now only holds the note for a stored failed turn), and the tests
  `chat-verdict*.test.ts`, `chat-approval-server.test.ts`, `chat-approval-delivery.test.ts`,
  `chat-approval-persistence.test.ts`, `chat-incomplete-tool-calls.test.ts`, `chat-replay.test.ts`,
  `chat/stream/route.test.ts`, `route.grounding-persistence.test.ts` and `route.request-dates.test.ts`. The production
  failure that started it (a confirmed action stored as a failed turn, 37 of 62 answers stored failed) was the AI SDK's
  stream reducer throwing on an approval continuation; the one-line fix for the previous stack is commit `92212c6ccc`.

- Generated insight evidence can drift from real data if adapters or fallback paths skip citation validation.
- **Coach chat's grounding audit (`auditNumericClaims`, `src/lib/coachhelm/v3/chat/provenance.ts`) is precision-sensitive: a false positive discards a correct answer exactly like a real fabrication does, and both look identical to the coach.** Issue #1540 / repair plan N15 (2026-09-22): ~46% of chat replies (33 of the last 30 days, all-time 33 failed/29 complete/8 null) were marked `'failed'`, almost all real, tool-sourced answers wrongly flagged. Two dominant causes, both fixed:
  1. `collectNumbers` only walked numeric leaves, so `get_player_insights`' own pre-composed prose (`detail.insights[].content`/`.title` — team averages, attempt counts, even that insight's own PGA Tour comparison) was invisible to the audit; a chat turn that faithfully restated an insight's own wording was flagged as fabricating it. Fixed by scanning string leaves for numeric substrings too (skipping whole-string UUIDs/ISO timestamps so an id never "supports" an unrelated number).
  2. A distance-band bucket label with both bounds over 12 (`'15-25 ft'`, `'10-15 ft'` — see `PUTT_DISTANCE_BUCKETS`, `metrics-catalog.ts`) read as two bare numeric claims, one of them negative once the hyphen was misread as a sign. Fixed by registering a series point's `bucket` label the same way tool prose numbers are registered.
  3. Separately, the audit only ever saw the CURRENT request's fresh tool calls — a model answering from a prior turn's already-fetched data (no new tool call this turn) had no anchors for numbers the coach had already been shown. `chat/stream/route.ts`'s `priorTurnEvidence()` now seeds the audit from THIS conversation's own persisted `ui_parts` (never the client-sent thread — that would let a forged request inject fake "evidence").
  A `'failed'` row now also records why: `golf_coachhelm_llm_calls.citations` carries `{reason: 'verification_failed', unmatched_tokens}` (mirrors `compose.ts`'s shape) instead of `null`, and the live stream carries a `data-grounding-flag` part with the same note appended to `content` on persistence — before this fix the flag only ever reached the DB row, so a coach watching the answer stream in never saw it until a reload; `restore.ts`'s `REPLAYABLE` set now also includes `data-grounding-flag`, so the flag survives a reload instead of only the original streaming session. See `src/test/coachhelm/v3/chat-provenance.test.ts` for the reproduced false positives.

  Independent review of the fix (2026-09-22) found the live audit itself had a real regression: it checked `result.text`, which in `ai` 7.0.79 is the LAST agent step's text only (`StreamTextResult#text`), so a fabrication planted in an earlier step of a multi-step turn was invisible to it, and `onFinish` reused that narrow verdict instead of re-checking the full persisted text. Fixed by accumulating every `text-delta` chunk in the stream-forwarding loop and auditing exactly that string in both places. A provider error or a dropped connection mid-generation is now also tracked explicitly (`streamErrored`) and forces the turn to `'failed'` regardless of what the numeric audit finds — previously a stream error could leave a partial, unaudited answer stored as `'complete'`. `priorTurnEvidence` (cross-turn evidence carryover) now validates every stored envelope with `ToolEnvelope.safeParse` before trusting its shape (a legacy or forged `ui_parts` blob can no longer crash the turn). Player-scoping is two-phase: it splits carryover into `shared` (team/round-level evidence with no player entity — always safe) and `deferred` (anything player-scoped, or entity-less, e.g. `get_player_insights`, which returns no `entity` at all and so cannot be assumed safe). `execute` then unions the current turn's own tagged player id(s) with `deferred`'s before deciding whether to fold `deferred` in, so the current turn's context — not just prior turns' — governs the decision (a number about player A must not "support" a claim about player B). This is a heuristic bounded by what's tagged: an entity-less envelope secretly about a second, untagged player is indistinguishable from one about the single tagged player. A second-round fix (2026-09-23) closed a related hole: when THIS turn makes zero fresh player-scoped tool calls at all (the model answering entirely from memory), `deferred` is never folded in, even if it names only one player — with no fresh evidence of who this turn is actually about, "only one player on record" can't be trusted (production shape: turn 1 fetches Alice's putts; turn 2 asks about Bob and answers from memory with no tool call, and Alice's carried-over number would otherwise "support" a claim about Bob). `shared` (team/round-level) evidence is unaffected and still always carries over, including on a zero-tool-call turn. Carryover is capped to the last 5 assistant turns via a bounded, descending `listRecentMessages` query (avoiding both PostgREST's 1,000-row cap and an unbounded evidence window), and the pairwise-differencing anchor cap (`PAIRWISE_ANCHOR_CAP`) now evicts its oldest member instead of silently disabling differencing once exceeded. Known, accepted, self-only risk (not changed here): `chat_messages_coach_only` is a `FOR ALL` RLS policy, so a coach can edit their own persisted `ui_parts`, including a stored evidence envelope.

  Repair plan §14.10 ("chat publication waits for validation," 2026-09-23) closed two remaining gaps the `streamErrored` tracking above didn't cover. First, a disconnect-specific hole in `onFinish`'s own fallback: `execute`'s forwarding loop only ever set its verdict variable at the very end of the loop, so a client disconnect or platform teardown mid-generation left it unset when `onFinish` ran (the AI SDK's `handleUIMessageStreamFinish` wraps the stream in a `TransformStream` whose `cancel()` calls `onFinish` concurrently with, not after, `execute`'s own loop — confirmed by reading `ai`'s `dist/index.js` directly). The old fallback re-audited whatever partial fragment had accumulated and treated a fragment with no numeric claims in it as grounded, persisting a truncated, mid-sentence answer as `status: 'complete'` — indistinguishable from a real answer on reload. Fixed: a still-unset verdict at `onFinish` time is now unconditionally `{outcome: 'rejected', reason: 'stream_incomplete'}`, never re-audited. Second, a rendering gap: a rejected turn's already-streamed tokens stayed visible as ordinary prose with the failure note merely appended below them, both live and on reload — a coach could still read (and act on) the unverified text. `computeTurnVerdict` (`src/lib/coachhelm/v3/chat/verdict.ts`) now decides accepted/rejected as one ordered list of checks — stream completeness first (short-circuits everything else), then the numeric audit, with an explicit seam for `claim-validator.ts` (#1991, not wired) to add a third check later without changing the function's signature or any caller. On rejection, `route.ts`'s `onFinish` still persists the model's raw stripped text as `content` (`content: text`, route.ts:~869) — the failure note lives only in `ui_parts`/`status`, kept out of `content` so it never leaks into the NEXT turn's model context via `convertToModelMessages` on the client's replayed thread — and `ChatThread.tsx`/`restore.ts` render ONLY that note (plus, see below, any action parts) for the turn: never the raw text, never any evidence part, both live (as soon as the verdict part arrives) and on every subsequent reload. The wire-level part type for an ungrounded-claims rejection stays `data-grounding-flag` (production already has rows carrying it); a stream-incomplete rejection gets its own new, additive `data-turn-incomplete` type. Review of this PR (2026-09-23, #1997) found the rejection collapse also dropped `data-action-proposal`/`data-action-receipt` — hiding a coach's Confirm card, or a receipt for a write that had already run, behind an unrelated prose rejection. Fixed on both the live-render path (`ChatThread.tsx`) and the reload path (`restore.ts`'s `restoreFailedTurn`, via a shared `ACTION_PART_TYPES` set): a rejected turn now renders its failure note PLUS any `data-action-proposal`/`data-action-receipt` parts from the same turn, never its text or evidence. The same review found the root cause of most such rejections: `agent-tools.ts`'s `proposeGated`/`executeGated` never called `collect`, so a proposal or receipt citing its own number above 12 (e.g. "3 sessions of 90 minutes") had nothing to be checked against and failed `auditNumericClaims` outright. Fixed by routing every plan/receipt through `collect` the same way a read tool's `detail` is (`collectActionNumbers` in `agent-tools.ts`), so a gated action's own numbers count as supported evidence. `streamText`'s call in `route.ts` also now passes `abortSignal: req.signal`, so a client disconnect stops model generation (and spend) instead of continuing to bill for tokens `onFinish` discards anyway. Tests: `src/test/coachhelm/v3/chat-verdict.test.ts` (the ordered-checks logic in isolation) and `src/test/coachhelm/v3/chat-restore.test.ts` (reload behavior for a rejected/incomplete/disconnected turn, including the no-verdict-part disconnect case and the action-parts-survive-rejection case).
- **A session-scoped (RLS'd) `golf_shots` read is ~580x slower than a
  service-role read on the same table** (measured in migration
  `20260817121500`). Every A7/A2/A3 loader (`load-player-context.ts` and
  its callers, e.g. `load-distance-profile.ts`, `load-par-opportunities.ts`)
  correctly uses the page's own session-scoped client, never an admin one
  — that's the right tenancy call, not a bug — but it means enabling a
  flag that turns this load on for a heavy multi-season roster is a real
  page-load-time risk, not just a correctness one. Do not "fix" this by
  switching to an admin client. Run a heavy-roster load check in preview
  before flipping `coachhelm_a7_distance_profile_surface` or
  `coachhelm_a7_scoring_surface` on for any environment (both flags'
  `cleanup_plan`/ledger entries name this explicitly).

  Addendum A7 slice 1 (2026-09-23) wired `claim-validator.ts` (#1991, typed claim gate — see the "Provenance" section below) into `computeTurnVerdict` as its THIRD and last check, after stream completeness and the numeric audit: `reason: 'claim_validation_failed'` fires when a claim in the model's structured claims block cites a real value under the wrong player, window, unit, or denominator, or asserts a cause chat evidence never carries backing for. `extractAndValidateClaims`/`stripAllClaimsDelimiters` moved out of `compose.ts` into a new shared `src/lib/coachhelm/v3/llm/claims-block.ts` so chat and compose() share one parser rather than two copies drifting apart (compose()'s own behavior is unchanged; its `__testables` re-exports the same functions). `ClaimReference`/`EvidencePacketEntry` gained optional `unit`/`denominator` fields and `checkClaim` gained `wrong_unit`/`wrong_denominator` — both optional, so every existing compose() caller (which never sets either) is unaffected.

  The gate is opt-in PER TURN, mirroring compose()'s own contract: `chat/claims-packet.ts`'s `buildSinglePlayerPacket` returns a packet only when this turn's fresh, player-scoped measurements resolve to exactly one player and one shared window; a team or multi-player turn has no single (player, window) to validate against and is judged by the two checks above only — failing closed on an ambiguous turn would reject most of chat. The system prompt (`instructions.ts`'s "Claims block" section) asks the model to append a `<<<CLAIMS>>>[...]<<<END_CLAIMS>>>` block after every answer UNCONDITIONALLY (built before any tool call, so it cannot know in advance whether a packet will resolve) — copying `metric_id`/`player_id`/`window_start`/`window_end`/`unit`/`denominator` verbatim from the tool result it cites, never inventing them; an empty array when it cited nothing player-specific. A missing or malformed block on an ENGAGED turn is treated as a rejection, not silence-as-acceptance, same as compose()'s own contract for an opted-in packet. `extractAndValidateClaimsSafe` (`claims-block.ts`) wraps the parser to fail closed — reject, never crash or silently accept — if validation itself throws (a caller-side bug building a packet, not something `validateClaims` is expected to do on its own).

  Streaming makes stripping the block a live problem, not just a persistence one: `execute`'s forwarding loop withholds up to `CLAIMS_OPEN.length - 1` trailing characters of every text-delta (in case the opener splits across two chunks) and, once the opener is found, withholds everything into a small buffer — a raw JSON fragment a coach must never see live, in the persisted `content`, or in a saved `ui_parts` text part — until the closer is found. **#1999 re-review (2026-09-23), SHOULD-2:** the first version of this withheld everything for the REST of the text part once the opener was seen, even past the closer, while `content` (`extractAndValidateClaims`) only ever strips the delimited block itself and preserves any prose that follows it — a tested contract (`compose.test.ts`'s "strips a single well-formed block ... including one in the MIDDLE of the prose"), not an anomaly. That mismatch meant a coach could see LESS live/in `ui_parts` than what got persisted. The forwarding loop now resumes once the closer is seen (re-entrant per chunk, so an opener+closer in one delta, or a closer immediately followed by a second opener, are both handled without waiting for another chunk), keeping the two channels in agreement — proven by route-level tests for a split opener, a partial opener flushed at EOF, text after the block, and multiple blocks. `verdictPartType` maps `'claim_validation_failed'` onto the EXISTING `data-grounding-flag` wire part rather than a third type — from the coach's point of view both are the same signal ("a number in this answer didn't check out"), and `restore.ts`/`ChatThread.tsx` already collapse either to just the note. Tests: `src/test/coachhelm/v3/situational-explanation.test.ts` (this file was removed in the 2026-11-10 CoachHelm chat rebuild) — adversarial fixtures for wrong-player, wrong-window, wrong-unit, wrong-denominator, and unsupported-cause (both a mechanics and a psychology framing, written with no causal connective word, so the rejection comes from the model's own `claim_type:"causal"` tag against evidence with no causal backing, not from regex word-matching), plus a passing control, a not-engaged team/multi-player turn staying accepted, a malformed-block rejection, a forced-throw fail-closed case, and two ordering tests proving the typed gate never runs once an earlier check already rejected the turn.

  **Known risk, not closed here:** the false-positive lesson from N15 above (46% of chat replies wrongly flagged before that fix) applies to this gate too, and more sharply — an untagged causal-sounding sentence with no explicit connective word is invisible to `CAUSAL_LANGUAGE_RE`'s prose-level check, so a model that fails to tag its own claim `claim_type:"causal"` slips through un-flagged (a false NEGATIVE, the opposite failure mode from N15's false positives). Watch the `v3.chat.stream.claim_validation` `logServerEvent` rate the way N15 was diagnosed from `v3.chat.stream.ungrounded`'s.

  **Fixed in review (2026-09-23):** `validateClaims`'s "uncited number" scan originally only treated a claim's or packet entry's own VALUE as citable — not `sample_n`/`denominator` — so an honest answer that states its attempt count in prose ("across 43 attempts") without a claim separately naming 43 tripped `uncited_number` on otherwise correct text, even though the legacy numeric audit already treats a denominator as supported. `validateClaims` now also credits the `denominator`/`sample_n` of every packet entry an ACCEPTED claim actually cites (never every entry in the packet, so an unrelated metric's denominator can't "support" a fabricated number about a different one it was never cited alongside). Because this gate collapses the whole turn to a failure note on rejection (repair plan 14.10's "state it, don't hide it"), a false positive here is more visible than round-recap's one-shot cached fallback, so the wiring stays behind a NEW, separate, default-off flag — `coachhelm_chat_claim_gate` (`config/feature-flags.yml`) — rather than shipping live off the fix alone: `chat/claims-packet.ts`'s `buildSinglePlayerPacket` is only called, and the typed gate only engages, when the flag is on. Off (everywhere, today), `route.ts` passes `claimsPacket: null` and chat's turn verdict is judged by stream completeness and the numeric audit only, unchanged from before this gate existed. Promote to `release` or remove per the flag's own `cleanup_plan` once a shadow-log rate confirms no other prose shape trips it.

  **#1999 re-review (2026-09-23), MUST:** the flag above only gated whether anything ever READ a claims block — `instructions.ts`'s "Claims block" section was appended to the system prompt UNCONDITIONALLY, so flag-off (the default everywhere) still paid tokens and latency for the model to generate a block, have it withheld from the stream, and then strip it for nothing. `buildInstructions` now takes a `claimsBlockEnabled` boolean (`route.ts` reads `coachhelm_chat_claim_gate` once and passes the same value into both `buildInstructions` and the packet gate, so the prompt and the validation gate can never disagree about whether this turn asked for one) and only appends `CLAIMS_BLOCK_SECTION` when it's true — flag-off is now byte-identical to before this gate existed, matching #1997's own contract. See `src/lib/coachhelm/v3/chat/instructions.test.ts` (this file was removed in the 2026-11-10 CoachHelm chat rebuild).

  **#1999 re-review, NICE:** `checkClaim` (`claim-validator.ts`) now floors `sample_n === 0` regardless of `kind` — a `'measurement'` entry is exempt from `MIN_SAMPLE_N` because "the count IS the fact," but zero support is never a fact, it's a builder bug or a genuinely empty window, so it is checked before the `'measurement'` exemption rather than being able to hide behind it.
- Safety-net fallback behavior can mask generator failures if logs are ignored.
- Course-management "worst holes" and hole-1 "warmup" insights require at
  least five samples, matching the persisted insight writer's Rule 1
  validation contract (`upsertInsight` throws `InsightEvidenceRefusal` below
  the floor). `generateWorstHolesInsights` and `generateWarmupHoleInsight`
  (`src/lib/coachhelm/v2/mining/course-management.ts`) route that refusal
  through `isEvidenceRefusal()` and log it as a quiet, non-paging event —
  the same pattern `v3/composite/synthesis.ts` uses. Before this was wired
  up, the refusal reached `logServerError` unconditionally and paged as a
  production incident (fingerprint `ea766422`, "worst_holes upsert failed").
- A completed round's CoachHelm terminal state is written only through the
  service-only `record_round_coachhelm_terminal_state` RPC. It may update
  processing metadata but cannot modify score, shots, identity, or status.
- Round-review feedback and player acknowledgement paths can become stale if revalidation misses player or coach routes.
- V3 feature surface is expanding quickly; registry/docs must be updated when new generators, tables, or cron routes land.
- A caller-side discard after `compose()` must be written back to the call log. `round-recap.ts` runs `checkRecapStyle` on a reply `compose()` already logged as a verified success; on a violation the player gets the template, so it calls `markCallFellBackToTemplate(call_log_id, {reason: 'style_violation', violations})` (`compose.ts`), which sets `fallback_to_template=true` and merges the reason into `citations` (`verified` unchanged). Before 2026-10-13 that write was missing and `golf_coachhelm_llm_calls` / the Bridge AI-availability read counted style-rejected recaps as model output (Bridge 1cd457e7, `memory/incidents/coachhelm_ai/INC-2026-10-13-recap-style-fallback-logged-as-llm.md`).
- `compose.ts`'s numeric scan (`citations.ts`) checks a value appears somewhere in the flat evidence set — it cannot catch a REAL value cited under the wrong metric, player, or window. Package 8 slice 1 (2026-09-23, repair plan 14.10) added `src/lib/coachhelm/v3/llm/claim-validator.ts` as an opt-in second gate: a caller passes typed `ClaimReference[]` (claim id, metric id, value, player id, window) plus an `EvidencePacket` scoped to one player/window, and `validateClaims` checks each claim in a fixed order (player → window → metric exists → value, distinguishing a misattributed `wrong_field` from a fabricated `value_mismatch` → the `MIN_SAMPLE_N` floor → causal backing via reused `CausalityLevel`/`DiagnosisDriver`), plus an `uncited_number` vacuous-pass guard so a claim-free response with an unexplained number still fails. `compose.ts` wires it in as an EXTRA gate (delimited `<<<CLAIMS>>>` JSON block, zod `safeParse`, always stripped before either verifier runs or before any text reaches a player) behind the existing single corrective retry and budget re-gate; both gates' failures share that one retry. 2026-09-23 review-fix round: `EvidencePacketEntry.kind: 'measurement' | 'aggregate'` exempts a single-round's own direct facts from the `MIN_SAMPLE_N` floor (default `'aggregate'`, fails safe); `<<<CLAIMS>>>` delimiter handling now treats more than one block or an unterminated opener as malformed and strips every delimiter occurrence, not just the first; `uncited_number` also exempts a number present in any packet entry and narrow structural context (hole numbers, par values, written dates); a causal-language detector scans the PROSE independent of a claim's own `claim_type` label, since a model can under-tag a causal sentence as `'fact'`. **Package 8 slice 2 (2026-09-23) wired it into `round-recap.ts`'s `generateLLMRecap`** — the only live, persisted (`golf_rounds.ai_recap`) LLM-text surface among every `compose()` caller surveyed (`round-review.ts` stays unwired: zero production callers, and no new persistence path into `golf_round_reviews` was added — that remains an owner product/cost decision, not a slice). `buildRecapEvidencePacket()` (`recap-evidence.ts`) reuses the SAME `fir`/`gir` `pct()`-rounded values already in the prompt's `facts` block (recomputing independently risks a rounding-drift false rejection); round-level facts are `kind: 'measurement'`, season aggregates (`sample_n` = `stats.rounds_played`) are `kind: 'aggregate'` and withheld for a non-18-hole round exactly like the prompt already withholds them. Gated behind `coachhelm_recap_claim_packet` (`config/feature-flags.yml`, type `experiment`, default off everywhere) — off, no `evidence_packet` is built or passed, and behavior is unchanged from before this flag existed. `src/app/golf/actions/__tests__/round-recap-claim-gate.test.ts` forces the flag on and exercises the REAL `compose()` → `claim-validator.ts` pipeline (not a mocked `compose()`), proving a rejected claim and a malformed claims block each discard to the deterministic recap and that `save_round_ai_recap` only ever receives that deterministic text, never the discarded prose. **Package 8 revision-keyed provenance + single-flight (2026-09-23, migration `20260923080000_recap_provenance_and_single_flight`)**: `save_round_ai_recap`'s UPDATE now guards `AND ai_recap IS NULL` so a concurrent call that loses the generation race persists nothing instead of silently overwriting the winner (cheap half of single-flight only — a lock taken before the LLM call itself, to stop the double LLM spend, is deferred as an owner product/cost call). A new table, `golf_round_recap_provenance` <!-- schema-drift-absent: golf_round_recap_provenance --> (round_id PK/FK, not new `golf_rounds` columns), records `source: 'llm'|'deterministic'`, the `golf_coachhelm_llm_calls` `call_log_id`, `claim_packet_engaged`, and `stats_rounds_played_at_generation` — the `golf_player_stats_cache.rounds_played` snapshot the prose was generated against, since that stats cache keeps changing after generation even though a completed round's own score/shot data is permanent. `round-recap.ts` writes this best-effort via the admin client after a successful persist; a write failure (including the migration not yet being applied) is logged and swallowed, never blocking the recap. See `docs/architecture/coachhelm-evidence-contract.md`'s "Typed claim validator" section for the full writeup.
- **Package 8, recap single-flight lock (PR #2046) went further than the deferred-lock note above says**: rather than staying deferred, migration `20260923100000_round_recap_single_flight_lock.sql` (still unapplied in prod as of this entry) adds a real pre-LLM-call lease table, `golf_round_recap_locks`, gated behind `coachhelm_recap_single_flight_lock` (default off). It generalizes past a recap-only lock: the PK is `(round_id, revision, kind)` with `kind: 'recap' | 'round_review_narrative'`, so a second LLM-text surface can share the table without colliding with a live recap lock on the same round/revision. `claim_round_recap_lock`/`release_round_recap_lock` are service-role-only (`REVOKE EXECUTE ... FROM PUBLIC, anon`, no grant to `anon`), RLS enabled, and take `kind` as a required argument. The claim/release/wait helpers live in a shared server-only lib (not `'use server'` — a `'use server'` file's every export becomes a client-callable endpoint, so the lock primitives can't live in `round-recap.ts` itself), imported by both `round-recap.ts` and the new `round-review-narrative.ts` action. A losing caller of one `kind` polls only that kind's own result column, never the other surface's — the narrative loser polls `golf_round_reviews.ai_narrative`, never `golf_rounds.ai_recap`.
- **Package 8, round-review narrative (PR #2046, 2026-09-23)**: new surface `getRoundReviewNarrative` (`src/app/golf/actions/round-review-narrative.ts`) generates a lazy, cached 3-5 sentence paragraph for the Round Review page, persisted on a new `golf_round_reviews.ai_narrative` column (same migration as the lock generalization above, so schema and lock ship atomically). Gated behind `coachhelm_round_review_narrative` (`config/feature-flags.yml`, default off) — checked FIRST, before any DB read, so flag-off is zero cost. Own compose task key `round_review_narrative` (`src/lib/coachhelm/v3/llm/round-review-narrative.ts`, Haiku tier, `FALLBACK_PRIORITY` 4) — deliberately its own composer rather than reusing the existing `round_review` task (`composeRoundReview`), which is an ephemeral, never-persisted 80-150 word surface with a different job. Guard: never overwrite a published or coach-annotated review — "coach-annotated" means `coach_notes` OR `coach_feedback_text` OR `coach_rating` is set (deliberately not `coach_viewed_at`) — enforced in the persisting UPDATE's own WHERE clause (`ai_narrative IS NULL AND status <> 'published' AND those three IS NULL`), not just an earlier read, so a race with a coach annotating a moment later can't lose; on a 0-row UPDATE the code re-reads the actual stored `ai_narrative` rather than trusting its own (possibly discarded) generated text. NULL-status trap: Postgres `<>` never matches NULL, so both the UPDATE's WHERE (`.or('status.is.null,status.neq.published')`) and the read-guard (`=== 'published'`, never `!==`) treat NULL status as "not published, allowed." Billing follows the same DS-44 pattern as `round-recap.ts`: a deliberately unshared copy of `resolveBillingCoachId` resolves the player's active team's primary coach; when none is on file, `compose()` is skipped entirely (never pass `coach_id: null` into a user-initiated `compose()` call — it bypasses the budget gate) and the deterministic template fallback is used directly. RLS note for the PR body: `golf_round_reviews`'s existing RLS lets the owning player UPDATE their own row directly, so a player could write `ai_narrative` via PostgREST — no worse than the `summary`/`coach_notes` columns already on that row; this server action is the only code path that sets `ai_narrative` from a real generation. On the Round Review page, `buildNarrative()` (`buildReviewViewModel.ts`) gained a new top-priority tier — a non-empty `ai_narrative` wins over the existing `v2Body` / persisted composed body / `v1Summary` fallback chain; flag off or ungenerated falls through unchanged. Environment note: this PR's implementation could not run a live Supabase check (no MCP connection, no `SUPABASE_ACCESS_TOKEN` in this worktree) to confirm `golf_round_reviews.status` actually contains NULL rows in prod or to inspect `pg_policies` directly — the NULL-status and RLS handling above are defensive-by-code, not live-verified.
- **`CoachHelmSubNav.tsx`'s header comment can lag the `COACH_TABS` array it
  describes.** A skeleton or nav consumer that hand-draws the tab strip from
  the file's header comment rather than importing `COACH_TABS`
  (`src/components/fairway/pages/coachhelm/CoachHelmSubNav.tsx`) can drift —
  one skeleton was written against a stale "single Brief tab" claim while the
  array actually carried two (`brief` + `ask`), and the strip grew a second
  tab on hydrate. `resolveTabFromPath` branches on `tabs.length === 1`, so
  this matters beyond cosmetics. Only `PLAYER_TABS` is genuinely one tab.
  When a consumer needs the coach tab count, read the array, never the file
  header. (STU, source: `coachhelm-subnav-doc-contradicts-code.md` dated
  2026-08-15; verified 2026-09-05 that `COACH_TABS` is still the live
  constant name in that file.)
- **The 2026-07-19 "Spine & Stage" redesign is the current architecture for
  CoachHelm, Stats and Round Review**, and its 8 legacy routes
  (my-development, my-game-profile, my-standing, alerts, insights, patterns,
  development, analytics) are now permanent-redirect shims forwarding query
  params onto `?area=`/`?view=` — treat those params as the canonical nav for
  these surfaces rather than resurrecting the retired tab routes. New summary
  UI on these pages should compose from `src/components/fairway/modules/`
  (present in this repo) rather than reintroducing a DetailGrid-style text
  table. (STU, source: `spine-stage-redesign.md` dated 2026-07-20; verified
  2026-09-05 that `src/components/fairway/modules/` exists.)
  **Exception, 2026-09-24:** the Player CoachHelm overview
  (`/golf/dashboard/coachhelm`, no `?view=`) no longer uses the spine or the
  bento. It is `PlayerHubFeed` (`components/golf/coachhelm/home/`), a
  single-column read of trends, root-cause insight units, patterns and the
  plan, built by `buildPlayerHubViewModel.ts` (one source per number, one sign
  convention: a signed number is always + better / − worse). Stats owns the
  SG hero, snapshot and standing; the overview does not repeat them. The
  section tabs are the only navigation, so CoachHelm drills render no "Home"
  back chip (`DrillPanel` renders one only when `onBack` is passed).
  Its plan section (`HubPlanBoard`, HUB-19, 2026-09-25) edits in place: a row
  opens to log a new value or mark the focus area complete, through the
  unchanged `updateFocusAreaProgress` / `completeFocusArea` actions (Undo via
  `reactivateFocusArea`), applied with `useOptimistic` and rolled back with a
  danger toast on failure. Only actionable statuses open; create, accept and
  decline stay on Development. Its controls are secondary or ghost, so "Log a
  round" stays the overview's one primary action.
- **A "Rendered more hooks than during the previous render" / React #310
  report on this surface is not automatically the same bug twice.** On
  `/golf/dashboard/stats` it was a Turbopack HMR/Fast-Refresh and stale-chunk
  deploy-churn artifact (exhaustive audit found zero rules-of-hooks
  violations) — but the identical error message on
  `/golf/dashboard/qualifiers/new` was a real production crash, caused by
  `FairwayCoursePicker` calling `useReducedMotion()` directly instead of
  `useReducedMotionGuard()` (the guard defaults `null` — framer-motion's
  SSR/pre-hydration value — to `false`, avoiding a server/client render
  mismatch). Before dismissing a "more hooks" report as the known false
  positive, check the route, the Sentry `environment` tag, `handled`, and
  whether the chunk hashes are prod- or localhost-shaped. Any use of
  `useReducedMotion()` in this codebase should go through
  `useReducedMotionGuard()` from `@/lib/coachhelm/v3/motion`. (STU, source:
  `coachhelm-stats-hooks-310-false-positive.md` dated 2026-07-30, updated
  2026-08-19; verified 2026-09-05 that src/lib/coachhelm/v3/motion exists.)
- **Outcome measurement now covers v3 insights** (2026-09-22,
  `agent/coachhelm-outcome-measure`): `backfillInsightOutcomes`
  (`v2/analytics/effectiveness-writer.ts`) previously only mapped v2-era
  metric names to round columns, so `outcome_status`/`OutcomeBadge` were
  effectively NULL on every v3-authored insight. It now also resolves v3
  `evidence.metric` ids through the v3 metric registry
  (`lookupMetricSource`/`averageInWindow`/`improvementSign`), keeps the
  legacy mapping as a fallback, and leaves intentional-null metrics
  unmeasured on purpose. It also now populates
  `outcome_metric_name`/`outcome_metric_before`/`outcome_metric_after`, not
  just `outcome_status`. Candidate selection is paginated and
  pre-filtered to measurable rows (`FETCH_PAGE_SIZE`/`MAX_FETCH_PAGES`) so a
  page of permanently-unmeasurable rows can't starve the per-tick backfill
  budget — same pattern as the `causality-attribute` cron.
- **Learned personalization of v2 alert thresholds is wired but flagged off**
  (2026-09-22, `agent/coachhelm-learning-cleanup`): `BehaviorLearner`'s
  `getLearnedPreferences()`/`getPersonalizedThreshold` are now consulted in
  `orchestrator.ts`'s `generateAlerts()`, but only applied to
  `philosophy.declineThreshold`/`pressureGapThreshold` when the
  `coachhelm_v2_alert_personalization` feature flag (default OFF in every
  environment, see `config/feature-flags.yml`) is on. With the flag off the
  computed thresholds are shadow-logged
  (`coachhelm.learned_personalization.shadow`) instead of applied, so alert
  generation is unchanged until an owner turns the flag on with evidence to
  support it. Also fixed upstream: `'feedback'`-type interactions (from
  `rateInsight`) are now correctly bucketed into `BehaviorLearner`'s
  ack/dismiss counts, and `rateInsightImpl` now records a real `insight_type`
  in interaction metadata so per-type bucketing works. **Flag split
  2026-09-23**: this consumer used to share `coachhelm_learned_personalization`
  with the unrelated v3 coach-weight read below — flipping it for one would
  silently have turned on the other. It now has its own id,
  `coachhelm_v2_alert_personalization`, copied value and environments
  exactly (false everywhere) so the split changed no runtime behavior;
  `orchestrator-personalization-gate.test.ts` proves `generateAlerts` reads
  that id and never the v3 one.
- **v3 ranking's coach-weight multiplier is wired but flagged off** (2026-09-23,
  PR #1980 review follow-up): `loadCoachWeightsForPlayer`
  (`v3/ranking/score.ts`) is gated behind `coachhelm_learned_personalization`
  (default OFF) — as of the 2026-09-23 flag split above, this id is
  exclusive to this v3 read path; the v2 alert-threshold consumer that used
  to share it now reads its own `coachhelm_v2_alert_personalization`.
  Production's `golf_coachhelm_coach_weights` (4
  rows, sample_n up to 36, weights 0.77-1.60 as of 2026-09-23) was built
  entirely from v1's outcome attribution — the pre-N10 formula that
  algebraically cancelled to post-vs-ambient instead of the observed lift
  (see `v3/causality/attribute.ts`'s file header) — so per the 2026-09-12
  repair plan §6.7 step 8, those weights stay neutral (every insight gets
  `coach_weight = 1.0` in `scoreInsight`'s composite) until outcome quality
  under the corrected v2 attribution justifies applying them. The write
  side is NOT gated: the `causality-attribute` cron's `updateCoachWeight`
  keeps computing and persisting weights unconditionally (in shadow), so
  the data keeps accumulating for whenever an owner flips the flag with
  evidence to support it. Resetting the 4 existing rows (built from the v1
  formula) is a separate owner decision, not made here.
- **Insight angles (Slice 5a, 2026-10-20) are wired but flagged off.**
  Five deterministic generators in
  `src/lib/coachhelm/v3/generators/insight-angles/` (lie approach, bad-day floor, three-putt chain, tee-miss
  cost, approach-miss compass) join the tier-1 run at one call site,
  `insightAngleGenerators(playerId)` in `v2/orchestrator.ts`, which returns
  no entries while `coachhelm_insight_angles_v1` is off (default, every
  environment); each generator's `run()` (`angle-generator.ts`) also
  returns before any read, write or sweep while it is off. With it on, the
  five share one lazy set of reads per call (`createAngleLoaders`), never
  cached across calls. Contract per family lives in `ANGLE_FAMILIES`
  (`angle-data.ts`): metric (each its own id, never an existing one: the
  three-putt angle writes `three_putts_per_18`, while `three_putt_chain`
  stays composite C6's), insight type, sample unit, floor and per-side
  floor, round floor, Slice 1 gap kind, impact kind, benchmark (and
  fallbacks), κ in the gap input's unit, and ladder cap, each citing
  `docs/v3-research-golf-domain.md`. Every row writes `sample_unit`,
  `rounds_n`, `newest_round_id`, `source_round_ids` (the rounds counted,
  so it matches `rounds_n`), `comparison.primary`, `detail.gap_input` (the
  Slice 1 `GapInput` shape) and `detail.test` (its z gate) over the newest
  40 countable rounds. Those three round fields survive the Slice 0b window
  stamp (`keepComposedRounds` in `engine/source-rounds.ts`), and each angle
  is stamped and judged under its own family key `angle:<family>`
  (`AngleGenerator.readFamilyKey`), so no 0b floor keyed by a shared
  insight type can hold it back; its own floors apply. Slice 1c gave each
  angle family its own entry in `support/families.ts` (matched by metric),
  so with `coachhelm_support_v1` on the support pass tests every angle row
  from its `detail.gap_input`. Team benchmarks need 5+
  teammates (the `07` §6 privacy floor); below that there is no comparison
  and no read. The three-putt benchmark follows owner rule Q-88: the Tour
  figure from
  `golf_pga_standards` (PGA or LPGA by the player's cohort) when one is
  stored, else the teammates' median, else nothing; no GolfHelm-wide pool
  number. Tee-miss cost, fairway exposure and the bad-day floor are
  `rough_estimate` (`estimated: true`, worded as a rough estimate, never as
  a measured saving) and carry no counterfactual; the Team Brief and the
  strokes-available roll-up also skip any `estimated` row. The bad-day row
  always files under `scoring` (its SG area split stays in
  `detail.driver_area`). Without the player's SG scale
  (`sg_scale_for_player` error, logged) the SG-based angles say nothing.
  The cause stays `inferred_hypothesis`, and counted shot sequences go to
  `detail.sequence` until the Slice 2 root-cause ladder can read them.
  `coach_copy` is written like every v3 read (coach voice, below). Turning
  the flag off stops new rows but does not sweep rows written while it was
  on; the flag's `cleanup_plan` lists the signature prefixes to archive.
  Tests: `insight-angles/__tests__/` (`contract.ts` asserts the family
  contract on every composed row).
- **Counted families (Slice 5b, 2026-10-21), same flag, off.** Six more
  angle families join `ANGLE_FAMILIES` and `insightAngleGenerators`:
  par-3 tee shots (`par3_tee`), strokes gained per approach in three
  bands (`approach_sg_50_125`, `approach_sg_125_175`,
  `approach_sg_175_plus`), lag leave (`lag_leave`, first putts from 30+ ft
  finishing inside 5 ft) and under-reading (`under_reading`, low-side
  share of side-tagged misses on breaking putts). With the flag on, par-3
  tee shots (`lie_before = 'tee'`) also leave the legacy approach-miss
  bands (`bandApproachShots`). The SG families and lag leave compare to a
  team pool (`counted-shots.ts`: teammates with 3+ countable rounds,
  newest 40 rounds each, 5+ teammates, 100+ pooled attempts, the player
  never in their own pool, all priced at the player's SG scale) with a
  Welch test; no Tour fallback. Lag leave is `rough_estimate` and feeds the
  three-putt chain's lag line (`detail.lag_leave`). Under-reading is
  `unsized` (no strokes; support keeps it with the coach) and writes
  nothing unless 60%+ (and 20+) of breaking-putt misses carry a low/high
  tag. Composites, flag on (`ctx.counted_families`): C6 needs the
  `three_putts_per_18` and `lag_leave` rows; C8 reads the 50-125 yd SG row
  plus weak scrambling; `urgent` maps to `high`. Composite C4 (flyer lie)
  is deleted outright (it never fired), leaving 8 rules. Support families
  for all six live in `support/families.ts`. Tests:
  `insight-angles/__tests__/counted-families.test.ts`,
  `composite/__tests__/counted-composites.test.ts`.
- **v2 coach-alert family (bubble_player, pattern_detected, streak,
  surge_player, plateau, tournament_pressure, closing_holes, par_3_issues,
  recurring_weakness, team_trend, scoring_decline) is still live-written,
  100% dark on read** — no v3 successor exists yet, `engine_version` is
  never stamped `v3` for these, so `applyInsightVisibility` excludes them
  from every coach/player surface. Planned retirement PR (sequenced after
  `agent/coachhelm-outcomes` lands on main) not yet done as of 2026-09-22.
- **"Delivered" (not "Shown") is the honest label for the exposure count**
  (N11, 2026-09-23): `recordExposureForReturned` (`insight-delivery.ts`)
  writes `golf_insight_exposure` on every server render that returns an
  insight to a surface — proof of reach, not of attention. The Fairway
  effectiveness page (`FairwayEffectiveness.tsx`), its trust chip
  tooltips/aria-labels, and the KPI band all read "Delivered", with a hint
  that it counts delivery, not a confirmed view. Copy-only: `TrustSignal
  .shown` and the DB column names are unchanged. A client-observed
  "viewed" signal (debounced, in-viewport) is future work (Package 9/11),
  not implemented by this fix. See "Delivered vs. viewed" in
  `docs/architecture/coachhelm-evidence-contract.md`.

- **`src/lib/coachhelm/v3/context/` is a new, pure-core-only package**
  (2026-09-23, `agent/coachhelm-evidence-facts`, repair-plan addendum §13,
  work packages A0/A1) — `types.ts` (`ShotFact`, `HoleContext`,
  `AnalysisScope`, `holeIdentityKey`), `normalize-shot.ts`
  (`normalizeShotValue`/`normalizeShot` — independent feet/yards/percent/
  count/strokes conversion, strict zero-vs-missing separation), and
  `build-hole-sequence.ts` (`buildHoleSequence` — validates a hole's shots
  against its authoritative `HoleContext` totals: order, termination, and
  penalty representation, not just a matching row count — a hole
  terminates on `result === 'hole'` OR `putt_made === true`). Nothing here
  reads a table. See `docs/architecture/coachhelm-evidence-contract.md`'s
  "Situational fact types" section and the seven named fixtures in
  `src/test/coachhelm/v3/fixtures/situational-intelligence.ts` (A0) for the
  concrete scenarios this package is proven against.
- **`src/lib/coachhelm/v3/ranking/situational-ranking.ts`** (2026-09-23,
  addendum §13, work package A6 slice 1, pure core, not wired to
  `ranking/score.ts` or delivery yet) — `groupIssues(packets:
  IssueSourcePacket[]): Issue[]` is the issue-grouping/parent-child-claim
  work the A6 top-N audit above explicitly deferred. A3
  (`par-opportunities.ts`), A2 `distance-profile.ts`, A4
  `sequence-attribution.ts`, and A5's `hypothesis-policy.ts` can each
  surface something about the SAME underlying shots from a different
  angle; this module groups packets whose adapter-stated `sourceShotIds`
  transitively overlap (union-find) into one `Issue`. **Grouping runs
  BEFORE eligibility filtering** (revised 2026-09-23 review fix): an
  ineligible packet still participates in union-find so it can act as a
  bridge between two eligible ones without splitting a real chain; only
  after grouping is each connected group filtered down to its eligible
  members to decide what surfaces. An accepted issue carries: a
  content-addressed, input-order-independent `id` (from its eligible
  members' shots only); `claims` (parent/child links — every eligible
  member survives unmerged, owner first when one exists then sorted by
  `claimId`, so drill-down is never lost); `impactOwnership` (a **signed**
  `strokesImpact` — negative is a loss, positive is a gain — and only a
  real NEGATIVE number may own; a strength, `0`, or `null` never owns,
  and a group with no loss has `ownerClaimId: null`; among losses, the
  largest magnitude wins, ties broken by a fixed origin order then
  `claimId` — every other member contributes zero additional impact, so
  three perspectives on the same shots never triple the estimate);
  `opportunityFrequency` (distinct source-shot/round counts, the union
  across eligible members); and `policyInput` (the
  `strokesImpact`/`confidence`/`sampleSize` a later ranking policy would
  consume, mirroring ONLY the owner — including the owner's OWN sample
  size, never the union — "one issue, one leading priority" by
  construction; every field `0` when there is no owner). `groupIssues`
  rejects a duplicate `claimId` outright rather than silently dropping a
  claim, and a `null` hole/shot number no longer collides with another
  unknown shot (each renders to a fixed marker excluded from union-find,
  then disambiguated by its packet's own `claimId` when an issue's shots
  are built, so identity stays reproducible — A5's own `shotClaimId`
  (#1993) picked up this same fix in its slice 2).
  Tested against real `computeParOpportunities` (A3),
  `computeDistanceProfile` (A2, #1989), and `attributeSequence` (A4,
  #1988) metric values on one shared par-5 fixture, each wrapped by a
  small test-local adapter — `sourceShotIds` itself is still test-supplied
  (neither `MetricResult` nor `SequenceAttributionResult` carries per-shot
  provenance yet), so this proves the real values/statuses drive
  eligibility and ownership correctly, not that a real adapter's shot-id
  derivation is proven. Full contract in
  `docs/architecture/coachhelm-evidence-contract.md`'s "Issue grouping and
  ranking-input unification" section.
- **`src/lib/coachhelm/v3/reasoning/hypothesis-policy.ts`** (2026-09-23,
  `agent/coachhelm-hypothesis-policy`, addendum §13, work package A5
  slice 1 + slice 2) — `buildHypotheses(metrics, facts)` proposes a small,
  NAMED set of candidate explanations for a round's shot data
  (`short_bias`, `rough_gap`, `recovery`, `par5_opportunity_loss`, plus a
  non-family `'insufficient'` entry naming two competing families instead
  of picking one) — never a fabricated cause, never a
  psychology/fatigue/mechanics inference. `metrics` is now the real,
  merged `MetricResult` (`src/lib/coachhelm/v3/metrics/types.ts`, #1990;
  slice 1 read a structural subset before #1990 landed). Slice 2:
  `MetricResult.dimensions` means a real call can hand back several rows
  per `metricId` (a distance band, or a specific par-5 hole) —
  `metricClaimId`/`findMetric` take an optional dimensions filter so a
  hypothesis reads the ONE row describing its own shot/hole, never an
  arbitrary first match; `rough_gap` matches its corroborating metric to
  its own triggering shot's distance band, and `par5_opportunity_loss` now
  emits one `Hypothesis` PER dimensioned opportunity row (a round with
  several par-5s yields several) instead of reading one arbitrary row and
  dropping the rest. Slice 2 also found that `approach_measured_
  contribution` (A2's real producer) is a plain eligible-attempt COUNT,
  never negative — not the signed strokes-gained value slice 1 assumed.
  Follow-up (still slice 2): rather than name that real, present count
  metric as `rough_gap`'s corroborator, `findMetric`/`missingInputs`/
  `prerequisites`/every claim id key on a DISTINCT id,
  `approach_rough_gap_strokes_contribution`
  (`ROUGH_GAP_STROKES_METRIC_ID`), naming the honestly not-yet-existing
  strokes-shaped signal — no producer emits it today, so `rough_gap`
  always stays a stated gap until one does (likely A4's
  `sequence-attribution.ts` `SequenceEvent.measuredContribution`, adapted
  to a `MetricResult` row under this id — that adapter is deliberately not
  built yet). `shotClaimId` no longer renders a missing
  `hole_number`/`shot_number` as the literal string `'null'`; it now
  matches `ranking/situational-ranking.ts`'s own fixed `'unknown'` marker
  scheme so ids from both modules interoperate without translation (that
  module's own doc comment named this exact fix as owed here). `ShotFact`
  carries no `par` and no
  miss-direction field, so `short_bias`/`par5_opportunity_loss` can only
  come from a `metrics` row, never guessed; `rough_gap`/`recovery` come
  from an approach shot with `lie_before === 'rough'`, split on the
  ingest-tagged `intent` (never inferred from distance/outcome) — an
  `'unknown'` intent (what nearly every real shot normalizes to today)
  produces `'insufficient'` with a `nextCheck` naming both competing
  families, instead of guessing which applies. States (review-driven fix,
  2026-09-23, adds `'no_data'`): `'no_data'` (entire content is a stated
  gap — no supporting or contradicting claim, only `missingInputs`),
  `'candidate'` (a real supporting claim exists but isn't corroborated, or
  was but got contradicted), `'supported_association'` (a `status:
  'supported'` metric agrees and nothing contradicts — an association,
  never causal). `'coach_annotated'` was briefly a fourth state in slice
  3's draft, then DROPPED (review decision, 2026-09-23): `mergeCoachAnnotation`
  deliberately never sets `state` to it (the addendum is explicit that a
  coach's judgment layers onto the evidence, never replaces it), so nothing
  could ever produce it — a state with no producer was removed rather than
  kept as dead code; a "reviewed" read belongs at the call site
  (`coachAnnotation != null`). No `'proven'` state exists. `recovery` (no metric ever corroborates it, and
  its own triggering shot is deliberately not cited as its own support)
  and `short_bias`/`par5_opportunity_loss` with an absent metric resolve
  to `'no_data'`; `rough_gap` and `'insufficient'` keep a real fact-based
  supporting claim and floor at `'candidate'` instead. `description` is a
  function of `state`, not a fixed per-family string — hedged wording
  below `'supported_association'`, association wording at it, never
  "proven" or a causal verb (tested per state). A contradicting claim
  always caps state at `'candidate'` (never `'no_data'`), even overriding
  what the primary metric alone would have elevated; `short_bias` also
  gained a documented refute floor (`SHORT_BIAS_REFUTE_MAX_PERCENT`,
  alongside its existing support floor) so a metric can actively
  contradict it, not just fail to support it. `Hypothesis.family` and
  `NextCheck.distinguishes` share one exported `HypothesisFamily` union. A
  missing prerequisite is reported as a `Hypothesis` with empty claims and
  a populated `missingInputs`, never silently omitted. Claim ids
  (`metricClaimId`/`shotClaimId`) always resolve back to an element of the
  `metrics`/`facts` a call was given (tested). Slice 3 (2026-09-23,
  addendum §8.3) added `mergeCoachAnnotation`/`reopenIfContradicted`: a
  coach's judgment layers onto a hypothesis in a new `coachAnnotation`
  field (author, date, note, and separate supporting/contradicting claim-id
  snapshots) without touching `state`/`description`/`prerequisites`/the
  claim arrays/`missingInputs`. `reopenIfContradicted` flags
  `reopened: true` the moment a fresh contradicting claim wasn't already
  known at annotation time — checked against the CONTRADICTING snapshot
  specifically (never a union of both), since a claim id can flip sides
  between calls (e.g. `short_bias` reuses one undimensioned id on both
  sides). **`diagnosis.ts` remains unwired**: `diagnosis.ts`
  (`engine/diagnosis.ts`) is a narrow pure `AxisTally`→text helper with one
  caller, the DB-backed `generators/approach-miss.ts` — not a fit for this
  module's pure-core `Hypothesis[]` shape without a much larger change than
  "wire it in." Wiring hypotheses into a generator's reading belongs to
  that DB-backed GENERATOR layer, not `diagnosis.ts` itself — a future
  slice, reported back rather than forced here. **`personal-context.ts`
  was built** (owner decision, 2026-09-23: a code-level mapping table, not
  a DB table): `resolvePersonalContextHints(goals, focusAreas)` is pure,
  never touches a `MetricResult`, and returns a per-family "prioritize
  this" hint attributed to the goal/focus-area id behind it. Checked
  against every registered `MetricId` (`metrics/registry.ts`) and every
  `FocusAreaCategory` (`insight-types.ts`), exactly ONE honest mapping
  exists — `scoring_par_5` → `par5_opportunity_loss` (same holes, coarse
  average vs. conversion-rate breakdown); the focus-area table is empty
  (e.g. `short_game`'s `shot_type: 'around_green'` is a different shot
  type from `recovery`'s `shot_type: 'approach'` — the shared word
  "recovery" is not a shared measurement domain). No "intervention"
  type/loader exists anywhere in the codebase — interventions stay out of
  scope. See `docs/architecture/coachhelm-evidence-contract.md`'s
  "Controlled hypotheses" section for the full per-entry rationale and
  exclusion list.

- **`situational-ranking.ts` slice 2** (2026-09-23, addendum §13, A6 slice
  2, still pure core, still not wired to a live ranking read, no flag
  needed): sequence packets now gate `eligible` on the #2020 rollup's own
  per-kind `status: 'supported'`, not on a single event's own resolution —
  closes a real gap where one hole's one event could found/own an issue
  with zero population behind it. New `Issue.evidenceKey: string | null`
  (owner-derived, stable across shot-set churn, distinct from the
  shot-set-addressed `id`) backs the new
  `applyMaterialChangeSuppression(issues, activeInterventions)` — pure,
  never drops an issue from its output, suppresses only an exact
  `evidenceKey` match unchanged/under 50% worse than its intervention's
  baseline, and resurfaces at or past that threshold (mutation-verified at
  the boundary). New `issueToRankableInsight(issue): RankableInsight` pure
  adapter proves "one issue, one leading priority" at the ranked-output
  level via `rankInsights`. Full contract in
  `docs/architecture/coachhelm-evidence-contract.md`'s "Issue grouping and
  ranking-input unification (A6 slice 2)" section.

- **`src/lib/coachhelm/v3/eval/shadow-harness.ts`** (2026-09-23, addendum
  §13, work package A10 slice 1, pure, not wired) — `runShadowEvaluation
  (snapshot)` runs A2/A3/A4-both-layers/A5/A6 over one de-identified
  `ShadowSnapshot` and reports per-family status counts, a duplicate-issue
  rate, and two invariant counters (`countUnsupportedCauseClaims`,
  `countDuplicateLeadingPriority`) that must both read `0` on any real
  snapshot for the report to be trusted — both mutation-verified and
  unit-tested against a hand-built violating input, not just the real
  fixture matrix. Corrects a stale claim in this file and the evidence
  contract's A5 section: `par5_opportunity_loss` is NOT metric-producer-
  less like `short_bias`/`recovery` — A3 emits both metrics it cites, and
  it reaches `'supported_association'` on real input (proven by this
  slice's established-roster snapshot). Full contract in
  `docs/architecture/coachhelm-evidence-contract.md`'s "Shadow-mode
  evaluation harness" section.
- N13 sweep (repair plan, 2026-09-23): audited every CoachHelm action/route
  under `src/app/golf/actions` and `src/lib/coachhelm` for a catch-all that
  discards the real exception and returns one generic "session expired"-style
  code. `triggerPlayerInsightsAfterRoundImpl` (`insights.ts`) was the
  original N13 site and is already closed by the `AnalysisOutcome` taxonomy
  above (Package 4, #1960) — `classifyThrown()` splits auth/provider/DB/
  validation/unknown and only the stable `code` (never `.message`, which can
  carry raw exception text) reaches the player-visible
  `golf_rounds.coachhelm_failure_reason`. `golf.ts`'s two "session expired
  mid-round" sites are correctly gated on an actual `!user` check with an
  `isTransientAuthCheckFailure()` split (regression-tested, see
  `golf-shot-edit-transient-auth.test.ts` /
  `golf-save-partial-round.test.ts`) and only fire on genuine auth failure.
  `admin-data.ts`'s `likelyCause: 'The user session expired…'` is an admin
  diagnostic label generator over already-logged incidents, not a swallowed
  user-facing exception. No new violation found; nothing else in scope
  matched. Verified via `grep -rniE "session expired" src/lib/coachhelm
  src/app/golf/actions`.
- Swallowed round-review compute errors (2026-09-23,
  `src/app/golf/actions/round-review-system.ts`, governed day-to-day by
  `memory/features/golf-round-lifecycle.md` — noted here because it's the
  N13 companion fix): `generateAndStoreRoundReview`'s compute path
  (`computeAndStoreRoundReview`) now returns a typed, additive
  `GenerateReviewFailureCode` (`unauthenticated | unauthorized |
  round_not_found | round_not_completed | db_error | save_failed |
  unknown`) on every failure branch, and every genuine DB error is logged
  via `logServerError` with the action name and `roundId`/`playerId` — a
  bare `roundError && roundError.code !== 'PGRST116'` check keeps a real "no
  rows" (round not found) un-logged while catching everything else. The
  `golf_shots`/`golf_holes` reads previously did not check `error` at all:
  a transient failure fell back to an empty array and the compute continued
  to a SUCCESSFUL upsert (`ignoreDuplicates: false`), which could silently
  overwrite a good existing review with empty content while still returning
  `success: true`. Both reads now fail the compute instead. `code` is
  additive next to the existing free-text `error` (never a replacement —
  `useRoundReviewV2.ts` and `review/page.tsx` still read `.error`) and wires
  into `withAdminObserved`'s existing `extractActionSoftFailure` telemetry
  with no extra plumbing.

- **A1 slice 2 (2026-09-23, `agent/coachhelm-player-context`, based on
  `main` — formerly stacked on #1981's branch, now merged as
  `99ae02c05`): `load-player-context.ts` and the shot-source adapter.**
  `context/load-player-context.ts`'s `loadPlayerContext(scope, deps)` is
  the first DB-backed A1 function — scopes strictly by `player_id` (never
  `team_id`; this filter is the ONLY authorization check inside the
  module — callers must pass an already-authorized `player_id`), and
  additionally scopes rounds to `status = 'completed'`, matching every
  sibling reader. Bounds rounds by `window_start`/`window_end`, and bounds
  holes/shots by `analysis_cutoff` against their own `created_at` (the
  closest available proxy for "observed"), comparing timestamps as
  instants (`Date.parse`) rather than raw ISO strings. A shot edited after
  the cutoff (`updated_at` > cutoff) is excluded as `edited_after_cutoff`;
  a shot whose owning hole was itself excluded (any reason) is excluded as
  `hole_excluded` — both new `coverage.shotsExcludedByReason` keys added
  in the post-review pass. `HOLE_COLUMNS` now also selects
  `golf_holes.yardage`, mapped onto a new `HoleContext.yardage: number |
  null` field (added for #1990, A3 par-opportunities). Enforces the
  `HoleContext.total_strokes` null-score exclusion against a live source
  for the first time. DB
  dependency is injected (`deps.supabase`), never constructed inside, so
  tests use a fake client. `context/adapters/shot-source-adapter.ts`'s
  `approachShotToShotFact` additively maps `engine/shot-source.ts`'s
  `ApproachShot` onto `ShotFact`; `shot-source-adapter.test.ts` compares the
  existing broad approach totals before/after normalization on fixed
  fixtures (see the evidence-contract doc's "Player-context loader and
  shot-source adapter" section for what differs and why). **Still not
  wired to a generator**: no change to `engine/generator-base.ts` or any
  generator's output, no `evidence-packet.ts` — those remain later slices.

- **A2 distance profile (2026-09-23, `agent/coachhelm-distance-profile`):
  pure metrics only, not wired to a generator.** `metrics/distance-profile.ts`'s
  `computeDistanceProfile(facts, scope, holes)` computes five per-band
  `MetricResult`s (green hit, on-green proximity, direction coverage,
  severe outcomes, measured contribution) over `ShotFact[]`, reusing the
  Package 7B / addendum A2 all-shot proximity semantics already shipped in
  the `20260922120000_v3_standing_shot_metrics_all_shot_proximity` SQL
  migration: the same three yard bands, on-green predicate, 175+ yd par-5
  lay-up exclusion, and support floors. `holes: readonly HoleContext[]`
  is REQUIRED (not an optional side map) — a 175+ yd shot whose hole isn't
  resolvable from it is excluded with reason `missing_par`, never silently
  kept. Adds `miss_direction` to `ShotFact`
  (raw passthrough, threaded through `normalize-shot.ts`,
  `load-player-context.ts`, and the shot-source adapter). Every
  `MetricResult.distanceMethod` is `'recorded'`, never `'derived_progress'`
  — see the evidence-contract doc's "Distance profile" section for why
  that second `TeeStrategyShot`-style mode cannot arise here. Adopted
  #1990 (A3)'s shared `metrics/types.ts` `MetricResult`, both now landed
  on `main` (dropping this module's own `id`/`band`/`playerId`-shaped
  row): band lives in `dimensions.band`, exclusions in
  `exclusions.layup`/`.missing_par` (non-zero only), and `status`
  replaces `support` — `'insufficient'` still reports a real computed
  `value`, never null, per `types.ts`'s "state it, don't hide it"
  contract; only a zero-denominator row (`status: 'invalid'`) nulls
  `value`. **Do not** wire this into `approach-miss.ts` yet — that's a
  later slice, behind a flag. **`failedFloors?: readonly SupportFloorGap[]`**
  (`metrics/types.ts`, #2008 review) is absent unless `status ===
  'insufficient'`, in which case it names every real floor
  (`'rounds'`/`'attempts'`/`'greens'`) that row's OWN gating population
  failed — a row can fail more than one floor at once (the proximity row's
  rounds/attempts/greens all fail together in the fixture that proves
  this), and `failedFloors` names all of them, never just the first.
  `describeSupportGap(row)` moved to its own module,
  `metrics/support-gap.ts` — a client component ('use client') needs it as
  a runtime value, and that file has no value import of anything
  server-only, unlike `distance-profile.ts` itself (which value-imports
  `bucketApproachDistance` from `engine/shot-source.ts`, importing
  `createAdminClient`); `distance-profile.ts` re-exports it unchanged for
  every server-side caller.

- **`src/lib/coachhelm/v3/metrics/par-opportunities.ts` is a new, pure
  metrics module** (2026-09-23, `agent/coachhelm-par-opportunities`,
  addendum §13, work package A3) — `computeParOpportunities(facts, holes,
  scope): MetricResult[]`, built on the A1 types above. **Not wired into
  any generator, composite, or the feed** — pure core + tests only, same
  posture as A0/A1. Two families: `par_length_scoring` (identity-agnostic
  avg strokes-to-par by par + a length band per par split at CONSTANT,
  versioned yardage cutoffs — `PAR_LENGTH_BANDS`/`PAR_LENGTH_BAND_VERSION`,
  not player-derived, so a boundary never drifts between a lifetime,
  recent, or as-of scope — falling back to the par-only aggregate when a
  band can't clear the sample floor on its own) and
  `par5_regulation_opportunity_rate` / `par5_green_in_two_rate` /
  `par5_putting_conversion_rate` (specific-hole, keyed by
  `holeIdentityKey`, three separate metrics on purpose — green-in-two is a
  strictly narrower eagle-look rate, never folded into opportunity or
  conversion). `HoleContext` gained a `yardage: number | null` field
  (`golf_holes.yardage`) to support the length grouping — the live
  producer (`load-player-context.ts` selecting it) is in #1986, so this
  slice's bands fold to `'all'` in production until that lands. The
  same-hole-number/different-course collision A3 was scoped to fix in
  `par-type.ts`/`course-mgmt.ts` turned out already fixed there
  (course-mgmt.ts's `worst_holes`, PR #1936, pinned by
  `course-mgmt-hole-identity.test.ts`); `par-type.ts` never grouped by a
  specific hole. See
  `docs/architecture/coachhelm-evidence-contract.md`'s "Par/length +
  par-5 opportunity metrics" section and
  `src/test/coachhelm/v3/par-opportunities.test.ts` for the fixtures,
  including the two-course same-hole-number case.
- **`src/lib/coachhelm/v3/metrics/sequence-attribution.ts`** (2026-09-23,
  `agent/coachhelm-sequence-attribution`, addendum §13, work package A4
  slice 1) — `attributeSequence(facts, hole, scope)` partitions one hole's
  A1-validated shots into non-overlapping events (a penalty always its own
  singleton, §7.3 views — `tee_to_next`, a CHAINED `approach_to_recovery`
  covering repeated recovery attempts, `first_putt_to_next_putt` always a
  singleton for the first putt, and a CHAINED `putting_sequence` covering
  every putt after the first — plus an `'other'` residual) and computes a
  strokes-gained-style `measuredContribution` per event by reusing the
  CANONICAL, DB-synced baseline (`getExpectedStrokes` in
  `src/lib/utils/golf-stats-calculator-shots.ts`, kept in sync with
  `public.sg_expected_strokes()`) — no second baseline invented.
  `src/lib/golf/strokes-gained.ts` is quarantined dead code with similar but
  unpatched-on-drift tables and must never be imported for this. On the
  green, `distanceFeet` passes straight through (no feet→yards round trip);
  an unmapped lie resolves via the fairway table (matching the DB
  function's ELSE branch), not a gap. Summed contributions telescope to
  `expectedStrokesAtStart - hole.total_strokes` whenever every event
  resolves one. Suppresses the whole hole (no events, no total) when
  `buildHoleSequence` reports the sequence incomplete, but still reports
  `lostStrokesVsPar` (`total_strokes - par`), which reads only the hole's
  authoritative totals. When an event's endpoint state can't resolve
  against the baseline (a missing lie, or a missing distance — e.g. a
  penalty with no usable after-distance, a real pattern in production),
  that event's `measuredContribution` is `null` with a `baselineGap`
  reason and a non-null `heuristicScore` (the event's own known ending
  distance, when it has one), the hole-level total becomes `null` rather
  than a silent partial sum, and the shortfall shows up in `exclusions`
  (counts) plus `lostStrokesVsPar`. An explicitly tagged `intent: 'layup'`
  is excluded from the missed-green/recovery view (a deliberate lay-up is a
  different named family, never inferred here); a par-3 tee shot is the
  green attempt, never `tee_to_next` — both decided by `hole.par`/an
  explicit tag, never inferred from distance or outcome. `lie_after` →
  next shot's `lie_before` continuity is assumed, not validated. **Not
  wired to anything yet**: no `v2/orchestrator.ts` or composite consumer;
  `hypothesis-policy.ts`'s A5 slice 2 (2026-09-23) did the `MetricResult`
  swap (`MetricResult` merged via #1990) but did not add attribution
  consumption — that remains a later slice. See
  `docs/architecture/coachhelm-evidence-contract.md`'s "Sequence
  attribution" section.
- **`computeSequenceAttribution(facts, holes, scope): MetricResult[]`**
  (same file, addendum §13, A4 slice 2) rolls `attributeSequence`'s
  per-hole events up into the shared `MetricResult` (`metrics/types.ts`,
  already consumed by A2/A3), mirroring `computeParOpportunities`'s
  argument order and `factsInScope` scoping. One
  `sequence_event_strokes_gained` row per `SequenceEventKind` (mean
  `measuredContribution` over every ATTRIBUTED hole's resolved events of
  that kind; an unresolved event's `baselineGap` lands in `exclusions`,
  never the denominator) plus one `sequence_hole_coverage` count row (a
  suppressed hole contributes no events but is still counted here).
  Floors: `SEQUENCE_MIN_EVENTS`/`SEQUENCE_MIN_ROUNDS` per event-kind row,
  `SEQUENCE_MIN_HOLES`/`SEQUENCE_MIN_ROUNDS` for coverage. **Sign
  convention is the OPPOSITE of `ScoringSection.tsx`'s
  `formatStrokesVsPar`** — positive means strokes GAINED here, positive
  means MORE strokes than par (worse) there; never reuse that formatter
  without flipping the sign. Still not wired into any generator/composite.
  See `docs/architecture/coachhelm-evidence-contract.md`'s "Sequence
  attribution rollup" section and
  `src/test/coachhelm/v3/sequence-attribution.test.ts`'s
  `computeSequenceAttribution` describe blocks.

- **`src/lib/coachhelm/v3/evaluation/comparable-opportunities.ts` is a new,
  pure evaluation module** (2026-09-23,
  `agent/coachhelm-comparable-opportunities`, addendum §14.12, work package
  A9) — `computeComparableOpportunities(input):
  ComparableOpportunitiesResult`, built on the A1 types and A3's shared
  `MetricResult`. **Not wired into `causality/attribute.ts` or any UI
  surface** — pure core + tests only, learning weights untouched. The
  SHOT-LEVEL counterpart to `attribute.ts`'s round-level before/after
  average: compares a rate or mean over MATCHED opportunities on either
  side of an actual `interventionAt` instant, so a change isn't confounded
  by facing easier/harder shots after the intervention. A SINGLE `spec`
  (`MatchingSpec`: distance band, lie, shot role, plus version ids) is
  applied identically to both sides (PR #1992 review, MUST 1 — an earlier
  revision took a baseline/follow-up spec pair and rejected only on
  version-string mismatch, which didn't guard the actual band/lie/role
  definitions; one shared spec makes "matched on the same definition" true
  by construction instead). A shot recorded at exactly `interventionAt` is
  assigned to follow-up, never baseline; no calendar-day buffer is needed
  around that boundary, unlike `attribute.ts` (see the module header).
  Support floor (`MIN_OPPORTUNITY_N` = 5, `MIN_DISTINCT_ROUNDS` = 2)
  downgrades an under-supported side's `MetricResult.status` to
  `'insufficient'` (value still reported) and the top-level `status` to
  `'insufficient_evidence'`; for a `'mean'` outcome, a matched shot with a
  `null` value is dropped BEFORE eligibleCount/observedCount/denominator/
  distinctRounds are computed (MUST 2 — a round contributing only a
  null-valued shot must not satisfy the round floor) and counted under
  `exclusions.missing_value` (SHOULD 3). `multipleInterventions` downgrades
  a supported result to `'observed_change_limited'`. No field is ever named
  `lift`, `improvement`, or `proven` — the output field is `observedChange`
  (direction-agnostic `followUp.value - baseline.value`) plus a
  `methodVersion` string (`'comparable_opportunities_v1'`), independent of
  `attribute.ts`'s `attribution_method_version` (migration 20260922230000).
  Also discloses course mix and opportunity-count imbalance between sides,
  derived from each side's own contributing-shot population.
  See `docs/architecture/coachhelm-evidence-contract.md`'s
  "Comparable-opportunities outcome measurement" section and
  `src/test/coachhelm/v3/comparable-opportunities.test.ts` for the
  fixtures, including the version-mismatch-rejection and
  exactly-at-the-instant boundary cases.
- Chart honesty (2026-09-23, Package 11): `PuttHeatmap` (`v3/PuttHeatmap/index.tsx`)
  plots a real `distance_feet` radius but only a real angular position when
  `miss_direction` was logged — a make or an unlogged-direction miss gets a
  seeded (not measured) angle. The component now carries an on-screen
  disclosure caption for this, matching the honesty pattern `HoleShotPath`'s
  "Distances are player-logged, not GPS-measured" footer already
  established for its own stylized axis. The underlying plotting geometry
  in `./geometry.ts` was left unchanged — this is a labeling fix, not a
  data fix.
- **A7 Game Fingerprint mount (2026-09-23, `agent/a7-distance-profile-surface`,
  addendum §13 A7 slice 1) — the FIRST place A2's pure metric core actually
  reaches a page.** `metrics/load-distance-profile.ts` composes
  `loadPlayerContext` (A1) + `computeDistanceProfile` (A2) into one
  server-only loader; `DistanceProfileSection` renders its `MetricResult[]`
  (via `buildDistanceProfileViewModel`) inside the Game Fingerprint page's
  Approach section, through a new optional `sectionAddenda` prop on
  `FairwayPlayerGameFingerprint` (keyed by `FingerprintSectionKey`, e.g.
  `approach`/`scoring`). Flag-gated
  (`coachhelm_a7_distance_profile_surface`, default off everywhere) and the
  loader is SKIPPED (not just unrendered) while the flag is off — see
  `loadDistanceProfileAddendumIfEnabled` in `page.tsx`, pulled out of the
  page's `Promise.all` specifically so that gate is unit-tested directly,
  not just implied by the ternary it replaced. `loadDistanceProfileAddendum`
  itself never rejects: any throw (including from the loader) degrades to
  `null` (no addendum) plus a `logServerError` call, so one addendum's
  failure can never fail the page's whole parallel fetch. Reuses the page's
  own session-scoped Supabase client — never admin — so RLS still applies;
  see this doc's "Known Risk Areas" section on that client's `golf_shots`
  read cost.
  `sectionAddenda` absent (every existing call site) renders byte-for-byte
  the same markup as before this prop existed — a #2008 review caught a
  version of this claim that was true component-for-component but not
  actually true of the rendered DOM (an unconditional wrapper div around
  every section), fixed by only wrapping a section when it actually has an
  addendum.
- A7's slice-2 counterpart (`agent/a7-scoring-surface`, PR #2010, stacked
  on this branch) mounts A3's par-opportunities metrics into the Scoring
  section the same way, behind its own independent
  `coachhelm_a7_scoring_surface` flag — see this doc's own future update
  once that PR lands, and `player_coachhelm_development`/`admin_platform`'s
  ledgers for the flag/loader detail in the meantime.

- **A9 slice 1 wires the pure core above into the `causality-attribute` cron**
  (2026-09-23, `agent/coachhelm-comparable-attribution`, addendum §14.12) —
  `src/lib/coachhelm/v3/causality/comparable-attribute.ts`
  (`computeComparableAttribution`/`writeComparableAttribution`,
  `isShotLevelAttributionMetric`), gated behind
  `coachhelm_comparable_opportunity_attribution` (default off everywhere).
  Targets the three "needs-shot-level-join" `intentional-null` metrics
  (`approach_proximity_{50_125,125_175,175_plus}ft`, `metric-sources.ts`) —
  `attribute.ts`'s round-level average has no per-shot opportunity concept
  for them, so they've sat permanently skipped since W22. Flag off: these
  metrics are still dropped by the cron's pre-filter exactly as before this
  slice; `computeComparableAttribution` is never called. Flag on: the
  pre-filter lets them through, and the cron's main loop routes them to this
  module instead of `computeAttribution`, bypassing `recordInsightOutcome`
  and `updateCoachWeight` entirely for these rows.
  **Never simulates an exposure (addendum rule)**: `interventionAt` is the
  insight's FIRST real `golf_insight_exposure.shown_at` row — never a
  `created_at` proxy the way `attribute.ts`'s round-level path uses one. Zero
  exposure rows → `{ok: false, reason: 'no-exposure-record'}`, retried next
  run, not treated as a permanent skip. A genuine DB error on that lookup is
  its own typed skip (`{ok: false, reason: 'exposure-read-failed', error}`),
  logged via `logServerError` and counted under
  `summary.comparable_exposure_read_failed` — never misread as "no exposure
  yet" (PR #2007 review, SHOULD decision; see the matching note further
  down this section). Baseline/follow-up windows reuse `attribute.ts`'s own
  `PRE_WINDOW_DAYS`/`POST_WINDOW_DAYS` (now exported) around that instant.
  **The cron's 21-day candidate-age filter does NOT guarantee this path's
  follow-up window has closed** (review catch, 2026-09-23): `interventionAt`
  is the real, independently-timed `shown_at`, which can land long after
  `created_at` — an insight created 30 days ago but first shown 3 days ago
  still has most of its 21-day follow-up window open. Measuring early would
  permanently record a row built from a truncated slice (the insert is
  idempotent, PK on `insight_id` — it could never be corrected once the
  window actually closes), so `computeComparableAttribution` checks
  `followUpWindow.end` against now and returns
  `{ok: false, reason: 'follow-up-window-open'}` (counted in
  `summary.comparable_follow_up_open`, retried next run, same as
  `no-exposure-record`) before calling `loadPlayerContext` at all.
  `loadPlayerContext` (A1) loads the combined-window shot/hole facts.
  **Never feeds the learning loop (this slice)**: every
  written row carries `lift: null` unconditionally — there is no parameter
  that could set it otherwise — so a `method_version:
  'comparable_opportunities_v1'` row can never move a coach weight. Whether
  it ever should is an explicit, separate decision (A9 slice 3, a decision
  doc, not code). Reuses the cron's own `isUnknownColumnError` detection
  (duplicated, not imported) for the same still-unapplied migration
  20260922230000 `method_version` column, but — unlike the round-level
  path — never degrades to a NULL-labeled insert on it (see the MUST 3
  review fix below); `summary.comparable_attributed`
  /`comparable_no_exposure_record`/`comparable_insufficient_evidence` are
  counted separately from the
  round-level `attributed`/`intentional_no_lift`, and
  `summary.method_version_column_missing` is the same flag the round-level
  degrade path already sets. See `src/lib/coachhelm/v3/causality/
  comparable-attribute.test.ts` (this module's own DB-orchestration logic)
  and `src/test/api/cron/causality-attribute.test.ts`'s A9 slice 1 describe
  block (the cron's wiring — flag on/off, pre-filter, summary counters,
  never touching the weight/outcome-ledger tables).
  **PR #2007 review fixes (2026-09-23), three MUSTs**:
  1. The follow-up window can still be open even once the cron's own
     21-day candidate-age filter admits a candidate — that filter
     guarantees the ROUND-LEVEL path's window has closed (anchored to
     `created_at`), not this path's (anchored to the real, independently
     timed `shown_at`). `computeComparableAttribution` now returns
     `{ok: false, reason: 'follow-up-window-open'}` before ever calling
     `loadPlayerContext`, retried next run like `no-exposure-record`.
  2. **P1 starvation, reintroduced and now fixed**: with the flag on,
     every shot-level candidate since W22 was passing the cron's P1
     pre-filter on metric alone — including old `no-exposure-record`/
     `follow-up-window-open` ones — refilling every run's fixed work-list
     slots oldest-first and starving round-level attribution, the same
     stall the pagination rewrite originally fixed. Fixed: the route now
     bulk-fetches each page's shot-level candidates' first exposure in one
     `.in()` query (already page-bounded, <= `FETCH_PAGE_SIZE`) and drops
     a candidate with no exposure or an open window BEFORE it ever takes a
     `todo` slot or costs a `loadPlayerContext` call.
     `computeComparableAttribution`'s own per-candidate checks stay as a
     backstop. **Residual gap, resolved with no schema change**: once a
     shot-level candidate's window IS closed, an `insufficient-evidence`
     result has no honest terminal row to write — `golf_insight_
     outcome_attribution.baseline_value`/`post_value`/`delta` are all
     `NOT NULL numeric`, so a truly empty side (zero contributing shots)
     has no real number to write, and even a real-but-underpowered pair of
     values has no existing column to flag "measured, but below the
     support floor" as distinct from a certified `observed_change` row.
     The task owner's decision: no migration — cap the retry window
     instead. The bulk pre-filter now also drops a candidate once
     `firstExposure + POST_WINDOW_DAYS + RETRY_GRACE_DAYS` (14 days) has
     passed, counted under its own `summary.comparable_retry_horizon_
     expired` counter — permanently, it never takes a `todo` slot again.
     This bounds each insight's cost at roughly `RETRY_GRACE_DAYS` daily-
     cron `loadPlayerContext` calls after its window closes, instead of an
     unbounded number, with no schema addition.
  3. **`method_version` degrade mislabeling**: retrying the insert without
     `method_version` on an unknown-column error (the round-level path's
     own degrade pattern) would write a `NULL`-labeled row here too — but
     `NULL` means "v1" (the round-level method) by that migration's own
     comment, so a comparable-opportunities row written that way would be
     silently, permanently misread as a round-level row. Fixed:
     `writeComparableAttribution` now writes NOTHING on an unknown-column
     error (`written: false, methodVersionColumnMissing: true`, no
     retry-insert) — this flag's enable criteria (`config/
     feature-flags.yml`) now requires migration 20260922230000 applied
     before it can ever go on in production, alongside A9 slice 2
     (confounding detection) landing first, since a slice-1 row is
     permanent (idempotent insert, PK on `insight_id`) and can't be
     relabeled later.
  Also: a genuine exposure-lookup DB error is its own typed skip
  (`exposure-read-failed`, both at the bulk pre-filter and the
  per-candidate backstop), logged distinctly and never folded into
  `no-exposure-record` (which means "legitimately never shown yet"). The
  first-exposure lookup is the insight's first exposure on ANY surface
  (player or coach) — there is no surface filter.
  **Re-review catch (2026-09-23): the bulk exposure fetch needed
  pagination.** `golf_insight_exposure` has no uniqueness constraint on
  `insight_id` (an insight can be re-shown/re-ranked any number of
  times), so a page's shot-level candidates could legitimately produce
  more than PostgREST's 1,000-row cap — an unpaginated `.in()` would
  silently keep only the globally-earliest 1,000 rows and permanently
  misread a later candidate's real exposure as `comparable_no_exposure_
  record`, since a page is never re-fetched. Fixed by routing the fetch
  through `fetchAllRowsResult` (`src/lib/supabase/fetch-all-rows.ts`),
  with `id` added as an `.order()` tiebreaker after `shown_at` so
  `.range()` page boundaries stay stable.

- **A9 slice 2 adds confounding-intervention detection**
  (2026-09-23, `agent/coachhelm-comparable-confounding`, addendum §14.12) —
  `src/lib/coachhelm/v3/causality/confounding-check.ts`
  (`detectConfoundingInterventions`), called from
  `comparable-attribute.ts` right after the follow-up-window-open gate
  (never before — the write is permanent, so checking before the window
  has closed could miss a confounder that lands later in it) and before
  `loadPlayerContext`. Replaces slice 1's hardcoded
  `multipleInterventions: false`, which PR #2007's review flagged as the
  real enable-blocker for this flag (a confounded row written under that
  hard-code could never be relabeled once slice 2 shipped).
  **What counts as a confounder**: ANY other insight whose FIRST-EVER
  `golf_insight_exposure` to this player lands inside
  `[baselineWindow.start, followUpWindow.end]` — the window starts at
  BASELINE start (not `interventionAt`), since an intervention landing
  during the baseline contaminates it just as much as one landing during
  follow-up. Matched on ANY metric, not just this insight's own
  `target_metric_id` — insight→metric mapping isn't reliable enough to
  trust as a filter, and a swing/practice change can plausibly move a
  totally different metric than the one it surfaced on. Erring toward
  flagging costs no data (a "limited" result is still written, see below).
  **What does NOT count**: this insight itself, or a re-surfacing of it.
  `golf_coach_insights` carries no lineage/supersession key today (only
  `signature`, which identifies the generating RULE, not an identity
  chain across re-creates) — if one is ever added, its chain should be
  excluded here too.
  **Deferred (named follow-up, not shipped in slice 2)**: focus-area/
  drill-change confounders (repair-plan addendum item (c)) are not
  checked — there is no existing player-scoped table with a reliable
  activation timestamp for a focus-area change to join against without
  inventing one.
  **Query**: player-scoped (`.eq('player_id', ...)`), excludes this
  insight (`.neq('insight_id', ...)`), filtered to `shown_at <= windowEnd`
  (an insight first exposed after the window closes can't confound it),
  paginated via `fetchAllRowsResult` (a player's cumulative exposure
  history can exceed PostgREST's 1,000-row cap), ordered `insight_id,
  shown_at, id` so the first row of each `insight_id` group is that
  insight's true minimum `shown_at`. **A failed query never silently
  reads as "no confounder found"** (the wrong direction for a downgrade
  flag) — it returns a typed failure, and the caller returns
  `{ok: false, reason: 'confounder-read-failed', error}` (own summary
  counter `comparable_confounder_read_failed`, own log action
  `cron.v3.causality.comparable-confounder-read`, retried next run, never
  a permanent skip).
  **Write-layer method_version**: a confounded write is still written,
  never skipped or dropped — under the distinct `method_version`
  `'comparable_opportunities_v1_limited'`
  (`COMPARABLE_OPPORTUNITIES_LIMITED_METHOD_VERSION`, `comparable-
  attribute.ts`) instead of the clean `'comparable_opportunities_v1'`. No
  migration and no CHECK constraint on the column — either string
  round-trips today. The cron's own summary splits the two:
  `comparable_attributed` (clean) vs. `comparable_attributed_limited`
  (confounded) — a reader must be able to tell them apart from the
  summary alone, without re-deriving `method_version`. Every current
  reader of `golf_insight_outcome_attribution`/`method_version` was
  grepped (2026-09-23): the only other reads are the round-level
  `attribute.ts` path (its own, unrelated `'v2_observed_delta'` literal)
  and the cron's own anti-join `.select('insight_id')` (never reads
  `method_version` at all) — nothing today does an equality/switch check
  on this column that could misclassify the new value.
  See `docs/architecture/coachhelm-evidence-contract.md`'s
  "Comparable-opportunities outcome measurement" section (both
  `method_version` values documented there too),
  `src/lib/coachhelm/v3/causality/confounding-check.test.ts` (the query/
  grouping logic itself), `comparable-attribute.test.ts`'s "A9 slice 2"
  describe block (this module's orchestration — call ordering, window
  bounds, method_version selection), and `causality-attribute.test.ts`'s
  matching cases (the cron's counters/logging). Flag
  (`coachhelm_comparable_opportunity_attribution`) stays default-off —
  slice 2 removes one enable blocker, but migration 20260922230000 still
  isn't applied and no real-world shadow evidence exists yet.

- **A9 slice 3 adds the coach-facing READ of `golf_insight_outcome_
  attribution`** (repair-plan §14.12). Nothing before this slice ever read
  this table back for display — confirmed by the repair-plan §14.12
  observed-outcome-language audit (2026-09-23), which found only a
  completely different, human-self-report column
  (`golf_coach_insights.outcome_status`) rendered anywhere.
  `src/lib/coachhelm/v3/effectiveness/attribution-read.ts`: a pure,
  flag-unaware DB loader — `readAttributionForInsight` (single insight)
  and `readAttributionForPlayer` (player-scoped: resolves the player's own
  insight ids first, then reads attribution rows for those ids, chunked at
  `chunkIds`'s 200-id cap and paginated per chunk via `fetchAllRowsResult`
  — both PostgREST caps `.claude/rules/database.md` names). **Never empty
  on failure**: a real read failure returns `{ok: false}`; a legitimate
  "not attributed yet" is `{ok: true, rows: []}` — collapsing these would
  let the UI show "no evidence" for what might be an outage. Same
  unknown-column degrade as the write side (`isUnknownColumnError`,
  duplicated per-file by this codebase's own established convention) —
  every row reads back `method_version: null` until migration
  20260922230000 is applied, exactly like the write side's pre-N10 shape.
  `src/lib/coachhelm/v3/effectiveness/attribution-view-model.ts`: pure
  labeling — `'v3_did_prewindow'` (round-level, 2026-09-28: lift against a
  matched pre-window control with an interval) is `'controlled_change'`,
  never clean; `null` rows are no longer returned by the primary read
  (legacy v1 math, deep audit row 35); `null`/`'v2_observed_delta'` (the round-level path, which
  predates the A9 slice 2 confounding check entirely) both collapse to
  `'earlier_method'`, never `isClean`; `'comparable_opportunities_v1'` is
  `'observed_change'`, the ONLY `isClean: true` value (it's the only
  method whose own pipeline actively ran `detectConfoundingInterventions`
  and found nothing); `'comparable_opportunities_v1_limited'` is
  `'observed_change_limited'`, never clean (limited ≠ clean — a
  healthy-sample-size limited row is still `state: 'result'`, just with
  `isClean: false`); any unrecognized version string is `'unknown'`, a
  neutral fallback, never clean. Sample size uses the same `< 3` floor
  `event-ledger.ts`'s `deriveTrustStatus` established for "too few
  measured outcomes" (`MIN_SUFFICIENT_ROUNDS`) — below it on either side
  is `state: 'insufficient'` regardless of method. `src/app/golf/actions/
  insight-attribution.ts`: the flag gate — `coachhelm_comparable_
  opportunity_attribution` is checked BEFORE any Supabase call, so an off
  flag makes zero DB calls; a failed read or unauthenticated caller both
  return `null`. `AttributionReadout.tsx`
  (`components/golf/coachhelm/insight-card/`) renders nothing for `null`
  (flag off / unauthenticated / failed read, all collapsed by the action)
  but DOES render the real `'missing'` state (a quiet "Not attributed
  yet") — silence there would read as "proven to do nothing" rather than
  "not measured yet". Wired into `FairwayPlayerInsight.tsx`'s hero insight
  slot only (beside `InsightCard`'s `OutcomeBadge` — a DIFFERENT column,
  the human self-report one). No migration applied by this slice; flag
  stays default-off. This slice does NOT decide whether these rows should
  ever feed `nextWeight` (still the open, separate decision the slice 2
  entry above already named) — it is read-only, display-only. See
  `attribution-read.test.ts`, `attribution-view-model.test.ts`,
  `src/test/golf/actions/insight-attribution.test.ts`, and
  AttributionReadout.test.tsx (removed, with AttributionReadout.tsx and
  FairwayPlayerInsight.tsx, in the 2026-09-24 golf audit dead-code sweep).

## Tests To Prefer

- Unit tests under `src/test/coachhelm/**`.
- Cron/API tests under `src/test/api/cron/coachhelm*.test.ts`.
- Component tests under `src/test/app/golf/dashboard/coachhelm/**`.
- Browser validation for changed coach/player surfaces when UI or route behavior changes.
- `src/app/golf/actions/__tests__/round-review-error-codes.test.ts` — typed
  failure codes and logging for `generateAndStoreRoundReview`'s compute path
  (2026-09-23).

## Related Docs

- `memory/context/coachhelm-ai.md`
- `memory/context/golfhelm-features.md`
- `docs/architecture/coachhelm-evidence-contract.md`
- `docs/v3-research-golf-domain.md`
- `docs/v3-testing-standards.md`
