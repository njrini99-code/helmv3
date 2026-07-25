# CoachHelm Command Center — implementation plan

Branch `feat/coachhelm-command-center`, cut from `origin/main` @ `3a836a692`.

## Start-state findings

| Check | Result |
|---|---|
| main HEAD | `3a836a692` — #1056 (mobile overflow + Fairway green palette) |
| Vercel production | `dpl_7kwtUAZcR6JDNoZQcq1iENbGTJUe`, promoted 2026-07-25 11:22 ET |
| Prod↔main drift | Prod deploys are **manual CLI promotes** (`vercel.json` sets `git.deploymentEnabled: {"*": false}`), so the deployment carries **no git SHA** in its metadata. Prod is at most 4h old and predates today's merges. Work targets `main`, not the prod snapshot. |
| AI SDK | `ai@7.0.2` → bumped to `7.0.37` (still v7, not a downgrade). `@ai-sdk/react` pins `ai` **exactly**, version-for-version, so the family had to move together: `@ai-sdk/react@4.0.40`, `@ai-sdk/anthropic@4.0.20`. Verified single `ai` copy in the tree and a clean `tsc` on the pre-existing call sites before building anything on top. |
| Approval API | `ai@7` ships first-class tool approval: tool-level `needsApproval`, `ToolApprovalRequest`/`ToolApprovalResponse` parts, `lastAssistantMessageIsCompleteWithApprovalResponses`. No hand-rolled gate needed. |

### Live schema (read-only inspection, no mutations)

- `golf_teams.timezone` — **NOT NULL**, so the team's real timezone is always available server-side.
- `golf_event_attendance` carries **both** `status` (RSVP) and `attendance_status` (actual attendance). They are already distinct columns; the vertical slice must keep them that way.
- `golf_events` has `recurrence_rule`, `parent_event_id`, `requires_rsvp`, `rsvp_deadline`, `metadata jsonb`.
- `golf_coachhelm_chat_messages` has `tool_calls`/`tool_results jsonb`. RLS on both chat tables is `coach_id = current_coach_id()` (conversations) and an `EXISTS` join through the conversation (messages).

### Verified defects in the current chat

1. Non-streaming: the client POSTs and blocks on a complete JSON body.
2. Grounding check is `requiresDataGrounding(text) && toolCalls.length === 0` — it proves *a* tool ran, never that the numbers in the prose came from one.
3. `get_team_overview` silently `.filter()`s roster rows whose `golf_players` join is null → a 7-player roster can report 6.
4. One propose-only mutation (`create_goal_for_player`); no other actions.
5. `ChatDrawer` still uses retired `warm-*`/`cream-*` classes.

## Build order

1. **Provenance envelope + tool layer** — every statistic returned inside a typed `Measurement` carrying metric/unit/value/entity/window/sample size/as-of/coverage/source/method. `get_team_overview` returns authoritative counts + coverage warnings instead of dropping players.
2. **Streaming transport** — `streamText` + `toUIMessageStreamResponse`, `useChat` on the client, typed data parts for charts/receipts. Preserve auth, ownership, idempotency, budget, cost logging, gateway abstraction.
3. **Durable UI parts** — extend the message ledger so charts/mentions/approvals/receipts survive reload.
4. **Action framework** — read / draft / confirm-required / destructive, with an RLS-protected `golf_coachhelm_action_runs` audit table and idempotency keys.
5. **Recurring practice vertical slice** — reuses `createRecurringEvent`; no duplicated recurrence/notification rules.
6. **One shared chat system** — a single conversation store, composer, message renderer, tool-part renderer used by both the full page and the drawer.
7. **Brief redesign** — AI-first opening + deterministic Program pulse; Signals/Players/Effectiveness preserved below.

## Deliberately deferred

Recorded honestly in the PR rather than faked.
