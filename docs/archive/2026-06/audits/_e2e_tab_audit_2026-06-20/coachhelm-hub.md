## CoachHelm AI / Intelligence hub + Chat drawer [coach]

**Audited:** 2026-06-20
**Role:** coach
**Routes / surfaces:**
- `/golf/dashboard/intelligence` (the Intelligence Hub / "Team Brief")
- `/golf/dashboard/coachhelm/chat` (chat full-history page)
- Persistent coach **Chat drawer** (mounted in the dashboard layout, coach-only)
- API: `POST /api/coachhelm/v3/chat/send`, `GET /api/coachhelm/v3/chat/conversations`, `GET /api/coachhelm/v3/chat/conversations/[id]`

---

### End-to-end wiring (actual)

**Intelligence Hub page** (`src/app/golf/(dashboard)/dashboard/intelligence/page.tsx`)

- Role gate: `getGolfSessionProfile()` → if `!session` redirect `/golf/login`; if `!coach` and `player` exists → `<FeatureUnavailable>` pointing players at `/golf/dashboard/coachhelm`; if neither → redirect login (page.tsx:30-46). **Correct coach gate; no player leak.**
- Resolves team via `resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id)`; null → redirect `/golf/dashboard` (page.tsx:54-58).
- Fetches `getTeamOverview(teamId)` + `getTeamCategoryInsights(teamId)` in parallel (page.tsx:62-65). Both are `'use server'`, both re-check `session.coach` and return `Unauthorized` if absent (team-category-insights.ts:304-307, 628).
- **Flag fork:** `isRedesignEnabled()` ON (the LIVE prod path per memory) → renders `<FairwayBrief>` inside `.fairway-ds` scope, also fetching `getAlertCounts(coach.id)` for the Signals badge `critical` count (page.tsx:72-86). OFF → legacy `LargeTitleHeader` + `TeamCompositeCard`/`TeamShotOverview` + `TeamCategoryView` + `IntelligenceCommandCenter variant="widget"` (page.tsx:88-160).

**Hub tiles data** — all real, not placeholder:
- `getTeamOverview` reads `golf_team_members` (active) → `golf_player_stats_cache` (18 real columns) → grades each metric vs fixed D2/D3 benchmarks (team-category-insights.ts:333-417). Empty roster → honest `playerCount:0, statsRowCount:0` with a fabricated `50`-across that the UI deliberately gates behind `hasTeamStats` (FairwayBrief.tsx:239-244).
- `getTeamCategoryInsights` reads `golf_team_members` → `golf_player_stats_cache` + `golf_players` + `golf_rounds` (team-category-insights.ts:660-712).
- FairwayBrief consumes those props unchanged: weakest-category hero, "other areas" bar strip, team-pulse line, category-detail rows. It applies two honesty guards — empty cache → "awaiting", and implausible per-round SG (|value|>10) → "calibrating" instead of asserting a false weakness (FairwayBrief.tsx:210-213, 299-303, 368-406).
- Deep-analysis `IntelligenceCommandCenter` is lazy + collapsed-by-default; it starts with empty `initialInsights/Patterns/Predictions` and only populates after the coach clicks **Analyze** → `generateTeamInsight()` (IntelligenceCommandCenter.tsx:1371-1418). This is intentional (heavy compute), not a dead tile.

**Chat drawer** (`src/components/golf/coachhelm/v3/Chat/ChatDrawer.tsx`)
- Mounted at `src/app/golf/(dashboard)/dashboard/layout.tsx:28` ONLY when `isCoach` (`!!session?.coach`). **Correct coach-only mount.**
- Sends via the shared `useCoachChatSend` hook → `POST /api/coachhelm/v3/chat/send` with `{ conversation_id?, user_message }`, optimistic user bubble, `pending-` rollback on error (useCoachChatSend.ts:106-153).
- `ChatComposer` Send button + Enter-to-send are wired (ChatComposer.tsx:29-41,65-72). Quick-prompt chips call `handleSend` (ChatDrawer.tsx:199-217). "New" clears local state (does not delete server thread). "History →" links to `/golf/dashboard/coachhelm/chat` (real route). Close button wired. **No dead controls.**
- `ChatMessageList` renders user/assistant bubbles and a compact "Looked up <tool>" pill for `role:'tool'` messages (ChatMessageList.tsx:91-131). Loading = "Reading the numbers…" thinking dots; empty = quick-prompt panel; error = red banner. **All three states present.**

**Chat backend** — REAL, not a stub:
- `send/route.ts`: `supabase.auth.getUser()` (401 if none) → `golf_coaches` lookup (403 if not a coach) → zod-validates body → loads/creates conversation (ownership-checked, 404 on mismatch) → appends user turn → **W30 budget gate** via `checkBudget` (429 if exhausted) → builds `buildCoachChatAgent` (a real `ToolLoopAgent` on Sonnet) → `agent.generate()` → persists tool ledger + assistant turn + logs cost to `golf_coachhelm_llm_calls` + `recordSpend` → returns full message list (send/route.ts:52-201). Upstream-quota errors degrade to 503 (send/route.ts:208-225).
- 10 tools (`tools.ts`): 9 read tools query real `golf_*` tables (`golf_players`, `golf_rounds`, `golf_goals`, `golf_player_standing`, `golf_coach_insights`, `golf_team_members`) and apply `applyInsightVisibility` so the agent never quotes archived/dismissed/v2-phantom insights. 1 mutating tool, `create_goal_for_player`, inserts into `golf_goals` with all columns verified against `database.ts` (correctly omits the GENERATED `window_days`).
- Persistence (`persistence.ts`) reads/writes `golf_coachhelm_chat_conversations` + `golf_coachhelm_chat_messages`; RLS policy `chat_conversations_coach_only` (= `current_coach_id()`) is enabled (migration 20260527000000:18519, 18944), so the un-`.eq`'d `listConversations` is correctly scoped by RLS.

---

### Expected vs actual (feature-doc #16 + #12)

- #16 says the page renders `IntelligenceCommandCenter (variant="page")`. **Diverged:** the page now renders the redesigned `FairwayBrief` (flag-on, live) with `IntelligenceCommandCenter variant="widget"` demoted into a collapsed disclosure. This is a deliberate, documented redesign — not a regression. The CommandCenter, its actions, and the data contract are preserved.
- #16 tables (golf_patterns_v2, golf_predictions, golf_coach_insights, golf_coach_philosophy, golf_learned_behavior) — the brief tiles actually read `golf_player_stats_cache` + `golf_coach_insights`; patterns/predictions surface only inside the deep-analysis CommandCenter after Analyze. Consistent with the engine pipeline.
- #12 Chat is not in the feature doc's data flow at all (the doc predates W32 chat). The chat surface is fully wired to a real Sonnet tool-loop agent — exceeds the doc.
- Open Known Gaps from #12 that touch this surface: "Philosophy priority/weights unused" and "N+1 in team alerts" are engine-internal and out of this tab's scope. The chat agent's `get_team_patterns` does an N+1-free aggregation in memory (no per-player query loop).

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|----------|----------|-----------|-------|--------|-----|
| HIGH | dead-control | `src/lib/coachhelm/v3/chat/agent.ts:9-13,45-50,156-162` + `src/components/golf/coachhelm/v3/Chat/*` | `create_goal_for_player` is the one mutating chat tool. agent.ts states the write is gated by a UI "Confirm/Edit/Cancel dialog" ("The UI is the real gate; the instructions are the soft fence"). That dialog does NOT exist anywhere in the chat UI — `ChatDrawer`, `ChatMessageList`, `ChatComposer`, `AskWorkspace`/`AskThreadPane` have no confirm step (grep for confirm/propose/dialog in the chat tree finds only the drawer's `role="dialog"`). The ONLY guard is the LLM system prompt. | A model misfire or prompt-injected message ("yes, confirm") writes a real `golf_goals` row (assigns a goal to a player) with no human approval. The documented load-bearing safety control is absent. | Add a real client-side confirm gate: render a Confirm/Edit/Cancel card when the agent proposes a goal and only POST the create on explicit click — OR move goal creation out of the tool-loop into an explicit coach action. Until then the comments overstate the safety. |
| MEDIUM | no-error-state | `src/app/golf/(dashboard)/dashboard/coachhelm/chat/ChatHistoryClient.tsx:42-78` | Legacy (flag-off) chat history client `fetch`es `/conversations/[id]` and `/chat/send`; the send/load wiring exists but the surrounding rail has only an empty state ("No conversations yet"), no visible error UI for a failed send/load on this legacy page (the drawer + AskWorkspace handle errors; this fallback does not surface them as clearly). | On the legacy path a failed send/load is silent to the coach. Low blast radius since redesign-on is the live path. | Surface a fetch/send error banner on `ChatHistoryClient` to match the drawer/AskWorkspace. |
| LOW | type-mismatch | `src/app/golf/(dashboard)/dashboard/insights/page.tsx:28-44` vs `src/components/fairway/pages/coachhelm/FairwayBrief.tsx:172-175` | FairwayBrief deep-links to `/golf/dashboard/insights?category=<token>`; the insights page `searchParams` interface declares `categoryChips` but NOT `category`. The value is still consumed at runtime because `FairwayCoachHelmSignals` reads `sp.category` (FairwayCoachHelmSignals.tsx:271-272, filters at 479-480) — so the LIVE (redesign-on) deep-link works. But the typed contract is wrong and the legacy `InsightsPageContent` (flag-off) would silently ignore `?category=`. | No live-user impact (both ends are redesign-on). Future maintainer could "clean up" the unread param and break the deep-link. | Add `category?: string` to the insights page `searchParams` type to make the contract honest; or unify on `categoryChips`. |
| INFO | incomplete-feature | `src/components/golf/coachhelm/v2/IntelligenceCommandCenter.tsx:1371-1418` | The demoted "Deep analysis" command center starts empty and requires a manual **Analyze** click (`generateTeamInsight()`) to populate insights/patterns/predictions — no auto-load on expand. | Coaches must click Analyze to see deep insights; expected for a heavy job, but a first-time coach may perceive the panel as empty. | Optional: trigger Analyze on first expand, or label the empty state "Run analysis to populate". |
| INFO | correctness | `src/lib/coachhelm/v3/chat/agent.ts:1-13,33` | Header comment + memory note say "6 write tools"; actual is 9 read + **1** write tool (`create_goal_for_player`). Doc drift only — code is correct. | None (documentation accuracy). | Update the comment/memory to "10 tools, 1 mutating". |

---

### Coverage notes
- Could not click through the running app — all findings are code-grounded. The HIGH goal-write finding should be live-verified: in the chat drawer, type "create a goal for <player>" then "yes" and confirm whether any UI confirm appears before the `golf_goals` row is written (expectation: none appears, write proceeds).
- RLS on chat tables confirmed via migration; runtime RLS effectiveness (cross-coach isolation) not live-tested.
- Did not exhaustively read the v2 CommandCenter sub-tabs (insights/patterns/predictions render bodies); confirmed the data source + action wiring is real and auth-gated.
