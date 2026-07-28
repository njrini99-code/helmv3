# Helm CoachHelm AI Map

**Research date:** 2026-07-26  
**Primary product:** GolfHelm CoachHelm V3 (+ residual V1/V2)  
**Baseball signals/insights:** Separate partial stack — not the same chat tools  

**Important path correction:** Live tools are `src/lib/coachhelm/v3/chat/agent-tools.ts` (+ `read-tools.ts`, `action-planners.ts`, `action-runs.ts`, `practice-planner.ts`). There is **no** `v3/chat/tools.ts`.

---

## 1. Model architecture

| Concern | Detail | Evidence |
|---------|--------|----------|
| SDKs | `ai` ^7, `@ai-sdk/anthropic`, `@ai-sdk/react` | package.json |
| Chat model | `claude-sonnet-5` via Anthropic if `ANTHROPIC_API_KEY`, else AI Gateway `MODEL_FOR_TASK.coach_chat` | stream/route.ts |
| Compose tasks | round_review / hero_narrative → Haiku gateway ids | v3/llm/types.ts |
| Streaming | `streamText`, `createUIMessageStream`, `convertToModelMessages` | stream/route.ts |
| Client | `useChat` + `DefaultChatTransport` | useCoachHelmChat.ts |
| Budget | `golf_coachhelm_llm_budget` daily cap; template fallback | compose.ts, budget.ts |
| Logging | `golf_coachhelm_llm_calls` | admin client |

---

## 2. Prompts & context

| Item | Location |
|------|----------|
| Chat system instructions | `v3/chat/instructions.ts` `buildInstructions` (Anthropic ephemeral cache) |
| Team context | Cookie active team + roster loaded in `resolveCoachChatContext` — tools cannot pass arbitrary team_id |
| Stats to model | Via **tools** reading caches/rounds — not full DB dump |
| User notes/messages | May enter as user chat text — prompt-injection risk (standard) |
| Truncation | Turn idempotency + message persistence; exact token window — SI |

---

## 3. Persistence

| Table | Role |
|-------|------|
| golf_coachhelm_chat_conversations | Threads (coach-only; player chat deferred) |
| golf_coachhelm_chat_messages | Append-only UI parts + tool_calls jsonb |
| golf_coachhelm_action_runs | Proposal/approve/complete ledger + idempotency |
| golf_coach_insights | Engine outputs |
| golf_insight_exposure/action/outcome | Effectiveness ledger |

APIs: `/api/coachhelm/v3/chat/stream`, `/conversations`, `/conversations/[id]`, `/genome/compute`.

---

## 4. Tool inventory

### READ (immediate)

| Tool | Tables | Authz |
|------|--------|-------|
| find_player | roster memory | roster only |
| get_team_overview | golf_rounds | team |
| get_player_metrics | golf_player_stats_cache | roster player |
| get_player_trend | golf_rounds | roster |
| get_putting_distance_profile | stats cache | roster |
| compare_players | stats cache | roster |
| get_team_metric_ranking | stats cache | team |
| get_player_weakest_areas | stats cache | roster |
| get_recent_rounds | golf_rounds | roster |
| get_player_insights | golf_coach_insights + **applyInsightVisibility** | roster |
| get_focus_areas | golf_player_focus_areas | roster |
| get_upcoming_events | golf_events, attendance | team |
| get_open_tasks | golf_tasks | team |

Client: **user-scoped** Supabase (not service role).

### WRITE (Confirm required)

| Tool | Domain action | Tables | Idempotency key pattern |
|------|---------------|--------|-------------------------|
| create_focus_area | createFocusArea | golf_player_focus_areas (+ ledger) | focus:{team}:{player}:{title} |
| create_task | createTask | golf_tasks | task:{team}:{title}:{due} |
| create_team_announcement | createEnrichedAnnouncement | golf_announcements | announce:{team}:… |
| create_recurring_practice | createRecurringEvent | golf_events | plan-derived |

No broad `executeQuery` / `runSQL` tools found — **good**.

Confirmation: `toolApproval` user-approval for `CONFIRM_REQUIRED_TOOLS`; UI `ActionProposalCard`.

---

## 5. Insight pipeline

```
Round complete / safety-net / roster-sweep
  → triggerPlayerInsightsAfterRound (service-role bridge — not public action)
  → orchestrator.analyzePlayer
  → V3 generators.run → upsertInsightV3 (engine_version=v3)
  → composites
  → (+ legacy v2 coach-alert writes that remain DARK to UI)
```

**Visibility gate** (`applyInsightVisibility`): v3 engine OR signature `v3:%`; lifecycle in {detected,matured,addressed,resolved}; status≠dismissed.

---

## 6. Live vs dark (must not test as user-visible)

- v2 coach-alert family written but filtered out  
- InsightTrustChips / FairwayEffectiveness full page largely unwired  
- OutcomeBadge always empty for v3 metrics  
- BehaviorLearner / coach-behavior_log unused  
- Some Fairway player components documented but not mounted  

---

## 7. Authorization summary

| Check | Where |
|-------|-------|
| Coach session | resolveCoachChatContext |
| Team | cookie + golf_teams membership |
| Player id | requireRosterPlayer |
| Writes | Confirm + claimForExecution |
| Budget/spend | admin client only |
| Generators | admin client; cron-protected |

---

## 8. Failure / retry

- Retry Confirm must not duplicate (action_runs unique coach_id+idempotency_key) — tests exist `chat-action-idempotency`  
- Retry question must not duplicate user turn — fix #1069  
- Stream interrupt: empty/failed assistant not stored as success  
- Budget exhaustion → non-LLM template path for compose tasks  

---

## 9. AI-specific testing requirements

1. **Never** assert correctness from assistant markdown alone — re-query stats cache / tables.  
2. Off-roster player_id on every write tool → deny.  
3. Cross-team cookie tampering.  
4. Confirm cancel vs confirm approve.  
5. Double Confirm / refresh mid-approval.  
6. Visibility: archived/tentative/v2 insights absent from Brief/Ask get_player_insights.  
7. Stub Anthropic/Gateway in CI; optional recorded fixtures.  
8. Cost: budget row increments; llm_calls append-only.  
9. Baseball CoachHelm is **out of scope** for these tools unless separately mapped.

---

## 10. Example workflow matrix

| Coach intent | Tools | DB verify | Forbidden |
|--------------|-------|-----------|-----------|
| Poor putting? | get_player_metrics, get_putting_distance_profile, get_player_insights | metrics match cache | Invented numbers |
| Create focus | create_focus_area + Confirm | one focus row + action_runs completed | Duplicate on retry |
| Schedule practices | create_recurring_practice + Confirm | event rows for team | Events on other team |
| Announce | create_team_announcement + Confirm | announcement + recipients | Emailing CRM coaches |
