---
name: helm-claude-sdk
description: "How Helm calls Claude. Use for any work on CoachHelm chat (Ask, quick chat, the practice helper, the player's Ask), its turn runner, tools, prompt, model settings, cost or evals, and for any new feature that calls a Claude model. Triggers on src/lib/coachhelm/v3/chat/**, src/app/api/coachhelm/v3/chat/**, useCoachHelmChat, @anthropic-ai/sdk, ANTHROPIC_API_KEY, 'the AI', 'the agent', 'the model'."
---

# helm-claude-sdk

CoachHelm chat runs on Anthropic's official SDK (`@anthropic-ai/sdk`) inside this app's own server
route. It is not built in the Claude Console and it is not a Managed Agent: its tools must run as the
signed-in coach or player against our database, behind our confirm step.

## Before you write SDK code

Load the bundled `claude-api` skill and read the TypeScript files it names (README, tool use,
streaming) plus its prompt-caching and model-migration notes. Do not write SDK calls from memory: the
API changed several times in 2026 (thinking, effort, forced tool choice, fallbacks) and a stale shape
is a 400 in production. The installed package's own types under `node_modules/@anthropic-ai/sdk` are
the tie-breaker.

## The rules this app follows

1. **The server owns the conversation.** The browser sends the new message, or a decision on a pending
   action. The server loads the stored model messages, appends, runs the loop and stores exactly what
   the API returned. Nothing the browser holds is replayed to the model.
2. **History is append-only.** Each assistant turn's content blocks (thinking, text, tool use) go back
   exactly as returned, in order. Never edit, reorder or drop an earlier message: current models
   reject a conversation whose thinking blocks no longer match it.
3. **One turn runner** (`src/lib/coachhelm/v3/chat/engine/`) for every surface. A new surface is a
   tool list and a prompt block, not a new loop.
4. **Tools are plain objects on one contract** (`engine/tool.ts`): a read returns labelled, computed
   figures in a `ToolEnvelope`; a task has `plan` (no write) and `commit` (idempotent). The engine,
   not the tool, talks to the stream and the action ledger.
5. **One number, one source.** A figure a tool returns comes from the same loader the screen uses, for
   the same window. The route hands those loaders in; `src/lib` does not import `src/clubhouse`.
6. **Answers stream and are never withheld.** The grounding check logs; it does not hide, delay or
   rewrite an answer.
7. **A task never runs without the coach's Confirm**, and the closing words repeat what the tool result
   says happened (held for Undo, committed, cancelled, failed). The receipt card is the record.
8. **Model settings live in one place** (`src/lib/coachhelm/v3/llm/types.ts` and `engine/model.ts`): a model PROFILE
   per surface (`profileFor(surface)`: Ask, quick chat and the practice helper on Claude Sonnet 5.5 at effort
   `medium`; the player's Ask on Claude Haiku 5.5 at `high`, sent explicitly because it defaults to `medium`), max
   output, the cache breakpoints, and every optional feature as one field of the profile's `features` with a tested
   off path. Sonnet 5.5 is sent `fallbacks: 'default'`; Haiku 5.5 has no server-side refusal fallback and is never
   sent the parameter. A refusal is a complete turn with a sentence the coach can act on. Changing a model or an
   effort is an owner decision; measure it on the eval first.
8a. **A request the API rejects is a fault, not a fallback.** The loop gives up one feature group at a time
   (`FEATURE_GROUPS`) so the coach still gets an answer, logs the API's own reason, and marks the turn
   (`features_dropped`). Never read a degraded turn as proof the configuration works: run the eval with
   `--require-features`. No tool is sent `strict: true`: the API refused these tools for its per-request counts (20
   strict tools, 24 optional parameters, 16 union parameters) and then, within them, with "The compiled grammar is too
   large". The engine's zod check validates every input. Do not set `strict` on a tool yourself; a name goes into
   `STRICT_TOOLS` (`engine/model.ts`) only after a live request with that exact set was accepted.
9. **The prompt prefix is stable, byte for byte.** Tools in a fixed order, the policy, golf and data-map blocks
   identical for every team, then the team block (team, season rule, timezone, roster). Nothing that changes during
   a conversation's life goes in `system` or `tools`: today's date, the screen the coach is on and the coach's notes
   travel as a `{ role: 'system' }` message after the user's message and are stored with the turn. A changed prefix
   invalidates replayed thinking blocks; `drop_block` keeps a deploy from breaking stored conversations. Check
   `cache_read_input_tokens` in the ledger after a prompt or tool change.
10. **Privacy.** Every read uses the signed-in session client, so row-level security applies. A player
    tool overwrites the player id with the caller's own. Thinking is never sent to the browser. No
    prompt, answer, name or figure goes to Sentry or a log.

## Keys, accounts and the Console

- The app reads `ANTHROPIC_API_KEY` (Vercel project env; `.env.local` on a laptop). Never print it.
  Chat has no gateway fallback: a missing key is a logged, coach-readable failure.
- The Claude Console (platform.claude.com) is where the key, billing, usage and rate limits live.
  The `ant` CLI reaches it from a terminal: `ant auth status` shows which credential is active,
  `ant auth login` signs in through the browser (run it yourself; it is interactive), `ant models list`
  lists the models the workspace can call. An exported `ANTHROPIC_API_KEY` overrides a signed-in
  profile.

## Tests and spend

- Unit and route tests use a fake Anthropic client. A test never calls the API.
- A live call costs money. The eval (`scripts/coachhelm/ask-eval.mjs`, with the hand-labelled turns)
  runs only with the owner's approval of the spend, against staging, never production.
- Every local env file points at the production database. Do not run the app or a script that could
  write through it while testing chat.

## Where things are

| What | Where |
| --- | --- |
| Turn runner, wire protocol, tool contract | `src/lib/coachhelm/v3/chat/engine/` |
| Tool registry and tools | `src/lib/coachhelm/v3/chat/registry.ts` and its siblings |
| Prompt | `src/lib/coachhelm/v3/chat/instructions.ts` |
| Route | `src/app/api/coachhelm/v3/chat/stream/route.ts` |
| Client hook | `src/components/golf/coachhelm/chat/useCoachHelmChat.ts` |
| Feature doc | `memory/features/coachhelm-ai.md` |
