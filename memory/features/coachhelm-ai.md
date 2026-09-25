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

- LLM work must never run client-side.
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
- Honest-mode confidence (`factors_measured=false`) is `sample_adequacy × freshness` (`honest_v2`); it is a support score, never a probability, and can never rise as evidence ages.
- Citations, evidence, and baseline comparisons are part of the trust contract. Do not emit fabricated comparisons or uncited claims.
- Claim honesty (2026-09-12, repair plan Package 2): prose states what was
  measured, hands unmeasured causes to the coach as a check, and frames the
  action as a recommendation (`approachAxisReading` observation/check/action in
  `v3/engine/diagnosis.ts`; the round builders in `v2/orchestrator.ts`; the
  short-side and pressure-decel composites). Heuristic severities go in
  `ComposedInsight.rankScore`, never `strokeImpact`. A row whose `your_value`
  is not the registry quantity for its metric id declares `evidence.polarity`
  (approach_miss: green-hit percent under `approach_proximity_*ft`). Women's
  cohort anchors ship as `comparison_source: 'estimated_target'` with a
  `target (est.)` label. Specific-hole rankings key on (`course_id`,
  `hole_number`); derived tee distances carry `distance_method:
  'derived_progress'`. The metric identity table lives in
  `docs/architecture/coachhelm-evidence-contract.md`.
- Root-cause diagnosis (2026-09-24). `evidence.diagnosis` is resolved by
  `v3/engine/root-cause.ts` in `BaseGenerator.run()`:
  - strength and neutral rows ship no diagnosis;
  - a leak with a repeated recorded shot path (A4 rollup floors, and gate
    `coachhelm_root_cause_diagnosis`, ON since 2026-09-25 and independent of
    the Round Review `coachhelm_a4_sequence_attribution_surface` flag) ships
    `observed_sequence` with its count and denominator; with the gate off
    the same checks run and the row ships the `inferred_hypothesis` below;
  - every other leak ships an `inferred_hypothesis` that names the checks
    that fell short, plus the A5 hypothesis label where one applies.
  `Diagnosis.basis` is additive and optional. The contract is in the
  evidence contract doc under "Root-cause diagnosis".
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
- Benchmark provenance (2026-09-23, repair plan N16): a `comparison_source` name is not itself a promise the number is measured. Every `BaselineEntry` in `src/lib/coachhelm/v2/insights/baseline-registry.ts` and every per-gender anchor in `src/lib/coachhelm/v3/counterfactual/cohort-baselines.ts` carries `provenance: 'measured' | 'derived'` plus a `sourceNote` next to the value. A `'derived'` entry's `label` must read as a target/estimate and must never say "average"/"avg"/"norm"/"measured" — enforced by `baseline-registry.test.ts`'s `N16: derived entries never carry measured-sounding wording` block and `cohort-baselines.test.ts`'s `typed provenance metadata` block. Women's cohort anchors are always `'derived'` (LPGA/NCAA figures discounted to college, never a measured women's-college population stat); men's putt-make/scrambling/GIR anchors are `'measured'` (`golf_pga_standards`, verified 2026-06-06), but the men's green-hit-by-band anchors (`GREEN_HIT_ANCHORS`) are `'derived'` too — an approximate Tour band figure the `approach_miss` generator has always printed, not part of that verification pass. `baselineRegistry` itself has no live caller anywhere in the codebase (dead code, kept corrected regardless — see that file's own LIVENESS note); `d1_avg`/`d3_avg`/`naia_avg`/`juco_avg` have zero producers. Full contract: `docs/architecture/coachhelm-evidence-contract.md`'s "Provenance: measured vs. derived" section.
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
- Budget-sensitive LLM behavior should use team settings and persisted usage, not hardcoded token math.
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

## UI Contract

- Coach views need fast triage: new, acknowledged, dismissed, resolved, and priority states must be visible.
- Player views need clear actionability: what changed, why it matters, and what to do next.
- Loading states should use skeletons that match final layout.
- Empty states should stay compact and explain whether there is no data, no permission, or no insight yet. The Ask page's `ProgramOpening` renders a compact honest empty state when the program pulse has no items (2026-08-26) — it must never return nothing and leave the column blank.
- Mobile views must use the shared app shell, Standard or Action headers, and bottom-nav clearance from `AGENTS.md`.
- The Ask composer autofocuses only on fine-pointer (desktop) clients (2026-08-26). On touch, no CoachHelm surface may focus a text input on open — iOS answers that focus with a keyboard over an unread page.
- The phone Ask drawer (`CoachHelmDrawer`) lifts by `--keyboard-height` and the composer drops its home-indicator pad while `body.keyboard-open` (2026-09-02) — the WebView never resizes for the keyboard, so a `bottom-0` drawer put the composer under the keys exactly like the messages screen.
- A question started on the Brief tab (`CoachIntelligenceHome` → `?q=` → the Ask page) auto-submits exactly once through `PromptComposer`'s own `submit()` (2026-09-02) — it previously only pre-filled the composer, so the coach had to press Send a second time on the page it navigated to. `AskSurface` strips `q` from the URL the moment the submit is kicked off, before the server has minted a conversation, so a refresh or back-navigation in that window cannot resend it. `PromptComposer` also now restores the just-submitted text into the field on a failed turn (never on success) instead of the previous unconditional clear-on-submit, so a failure does not force retyping. See `src/components/golf/coachhelm/chat/PromptComposer.tsx`, `CoachHelmChat.tsx` (`autoSubmitInitialInput`), and `AskSurface.tsx`.
- A route's `loading.tsx` reserves the page's paint at t=0 — for a
  `'use client'` page holding its own `loading` state that is that
  component's loading branch, not its settled layout. A route whose
  `page.tsx` is a pure `permanentRedirect` shim renders `bg-canvas` only:
  no geometry, and no real `<h1>` for a screen that never mounts.
  Reference implementation: `dashboard/alerts/loading.tsx`.

## Known Risk Areas

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

  Streaming makes stripping the block a live problem, not just a persistence one: `execute`'s forwarding loop withholds up to `CLAIMS_OPEN.length - 1` trailing characters of every text-delta (in case the opener splits across two chunks) and, once the opener is found, withholds everything into a small buffer — a raw JSON fragment a coach must never see live, in the persisted `content`, or in a saved `ui_parts` text part — until the closer is found. **#1999 re-review (2026-09-23), SHOULD-2:** the first version of this withheld everything for the REST of the text part once the opener was seen, even past the closer, while `content` (`extractAndValidateClaims`) only ever strips the delimited block itself and preserves any prose that follows it — a tested contract (`compose.test.ts`'s "strips a single well-formed block ... including one in the MIDDLE of the prose"), not an anomaly. That mismatch meant a coach could see LESS live/in `ui_parts` than what got persisted. The forwarding loop now resumes once the closer is seen (re-entrant per chunk, so an opener+closer in one delta, or a closer immediately followed by a second opener, are both handled without waiting for another chunk), keeping the two channels in agreement — proven by route-level tests for a split opener, a partial opener flushed at EOF, text after the block, and multiple blocks. `verdictPartType` maps `'claim_validation_failed'` onto the EXISTING `data-grounding-flag` wire part rather than a third type — from the coach's point of view both are the same signal ("a number in this answer didn't check out"), and `restore.ts`/`ChatThread.tsx` already collapse either to just the note. Tests: `src/test/coachhelm/v3/situational-explanation.test.ts` — adversarial fixtures for wrong-player, wrong-window, wrong-unit, wrong-denominator, and unsupported-cause (both a mechanics and a psychology framing, written with no causal connective word, so the rejection comes from the model's own `claim_type:"causal"` tag against evidence with no causal backing, not from regex word-matching), plus a passing control, a not-engaged team/multi-player turn staying accepted, a malformed-block rejection, a forced-throw fail-closed case, and two ordering tests proving the typed gate never runs once an earlier check already rejected the turn.

  **Known risk, not closed here:** the false-positive lesson from N15 above (46% of chat replies wrongly flagged before that fix) applies to this gate too, and more sharply — an untagged causal-sounding sentence with no explicit connective word is invisible to `CAUSAL_LANGUAGE_RE`'s prose-level check, so a model that fails to tag its own claim `claim_type:"causal"` slips through un-flagged (a false NEGATIVE, the opposite failure mode from N15's false positives). Watch the `v3.chat.stream.claim_validation` `logServerEvent` rate the way N15 was diagnosed from `v3.chat.stream.ungrounded`'s.

  **Fixed in review (2026-09-23):** `validateClaims`'s "uncited number" scan originally only treated a claim's or packet entry's own VALUE as citable — not `sample_n`/`denominator` — so an honest answer that states its attempt count in prose ("across 43 attempts") without a claim separately naming 43 tripped `uncited_number` on otherwise correct text, even though the legacy numeric audit already treats a denominator as supported. `validateClaims` now also credits the `denominator`/`sample_n` of every packet entry an ACCEPTED claim actually cites (never every entry in the packet, so an unrelated metric's denominator can't "support" a fabricated number about a different one it was never cited alongside). Because this gate collapses the whole turn to a failure note on rejection (repair plan 14.10's "state it, don't hide it"), a false positive here is more visible than round-recap's one-shot cached fallback, so the wiring stays behind a NEW, separate, default-off flag — `coachhelm_chat_claim_gate` (`config/feature-flags.yml`) — rather than shipping live off the fix alone: `chat/claims-packet.ts`'s `buildSinglePlayerPacket` is only called, and the typed gate only engages, when the flag is on. Off (everywhere, today), `route.ts` passes `claimsPacket: null` and chat's turn verdict is judged by stream completeness and the numeric audit only, unchanged from before this gate existed. Promote to `release` or remove per the flag's own `cleanup_plan` once a shadow-log rate confirms no other prose shape trips it.

  **#1999 re-review (2026-09-23), MUST:** the flag above only gated whether anything ever READ a claims block — `instructions.ts`'s "Claims block" section was appended to the system prompt UNCONDITIONALLY, so flag-off (the default everywhere) still paid tokens and latency for the model to generate a block, have it withheld from the stream, and then strip it for nothing. `buildInstructions` now takes a `claimsBlockEnabled` boolean (`route.ts` reads `coachhelm_chat_claim_gate` once and passes the same value into both `buildInstructions` and the packet gate, so the prompt and the validation gate can never disagree about whether this turn asked for one) and only appends `CLAIMS_BLOCK_SECTION` when it's true — flag-off is now byte-identical to before this gate existed, matching #1997's own contract. See `src/lib/coachhelm/v3/chat/instructions.test.ts`.

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
  **Recompute tool (2026-09-24).** `scripts/coachhelm/recompute-coach-weights.ts`
  (logic in `v3/causality/recompute-weights.ts`) replays the weights from
  the stored attributions using the current math:
  - it keeps round-level rows only;
  - it keeps insights that are cron-eligible today;
  - it takes the direction-corrected observed lift from the stored
    baseline/post values;
  - it applies the same `nextWeight` EMA as the cron.
  The default is a dry run (SELECT only). `--apply` upserts, and `--prune`
  deletes keys with no support; running either is the owner decision above.
  The 2026-09-24 dry run used 54 attributions (34 ineligible, 11 null
  lift) and produced 12 keys:
  - coach `09256463…` course_management and par_scoring reproduce the
    live values exactly;
  - coach `0fc49ef3…` falls from n=24/36/11/12 to n=2/3/1/3.
  Only 2 keys would stay calibrated (n>=10).
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
  labeling — `null`/`'v2_observed_delta'` (the round-level path, which
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
  `src/test/golf/components/AttributionReadout.test.tsx`.

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
