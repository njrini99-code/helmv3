# Tool contract notes

Changes to `tool.ts` against the contract in the rebuild brief, with the reason for each. ENGINE and TOOLS both write here.

## 2026-11-10 (ENGINE), first version

1. `run` returns `ToolResult`, not a bare `ToolEnvelope`. A `ToolEnvelope` is still a valid return. `ToolResult` adds three optional fields an envelope cannot express:
   - `parts`: UI parts beyond the evidence chip (a visual, an artifact, a brief, a handoff, a practice plan). The brief said "returns it in the envelope"; this is the field.
   - `evidence: false`: the result is not a read of team data (`show_visual`, `write_artifact`, a draft, a refusal), so it gets no evidence chip and no `evidence_ref`.
   - `end_turn: true`: the turn stops after this step (`ask_practice_brief` did this through `stopWhen`).
2. `ToolContext.reads`: the conversation's reads by `evidence_ref`. `show_visual` and `summarise_data` resolved refs through a map that `buildCoachTools` kept in a closure; the engine now owns the refs, so it hands the map in. Refs are `e1`, `e2`, … and are unique within a conversation for turns the new engine wrote.
3. `TaskTool.immediate`: skips the Undo window (`lock_lineup` did this with `immediate: true` on its flow).
4. `commit` receives the STORED proposal. `plan` is not run a second time on Confirm, so what the coach saw is what is written, and a card whose data moved underneath it is no longer silently dropped. `P` must be JSON-serialisable.
5. The engine rewrites `proposal.idempotency_key` before storing it: `<planner key, first 110 chars>:<hash of conversation id and the model's tool_use id>`. Each request by the model is one `tool_use` block, so a retried Confirm of one card is one key and an identical request made later is a new key (the audit's "legitimate repeats are swallowed"). `commit` must derive downstream request ids from the key it is given.
6. No `readBack` on the contract. `commit` reads back itself before returning a failed receipt; the engine records exactly the receipt it is given.
7. The engine, not the tool, calls `recordProposal`, `claimForExecution`, `holdForExecution`, `recordOutcome` and `recordDenial`, and checks their results. A proposal that cannot be recorded shows no Confirm card.
8. `toolsFor` is typed as `ToolsFor` here and implemented by TOOLS in `../registry.ts`. The order of the returned array is part of the cached prompt prefix: keep it stable for a surface.

## What the engine sends the model for each result

- read: `JSON.stringify({ ...envelope, evidence_ref })` without `parts`, `evidence`, `end_turn`.
- a read that threw, or an input that failed validation: an `is_error` result with one sentence.
- task proposed: nothing yet; the turn ends on the card. On the coach's decision the result is one of
  `Committed. <receipt summary>`, `Held until HH:MM:SS (the coach can still press Undo). <summary>`, `Declined by the coach. Nothing was written.`, `Failed: <reason>. Nothing was written.` (or what was), `The coach asked something else instead. Nothing was written.`

## 2026-11-10 (ENGINE), after TOOLS delivered the registry

9. `ScreenLoaders` is TOOLS's type (`../screen-loaders.ts`); `tool.ts` re-exports it, so there is one declaration. The route binds every loader that file lists, in `src/app/api/coachhelm/v3/chat/stream/route.ts` (only a route file may import a Clubhouse loader). A player's request binds only the player's own pages, with a teammate's id dropped before the loader is called.
10. The prompt comes from `instructionBlocks(surface, who, { today, notes })` as `{ policy, team }`; the engine sends them as two cached system blocks in that order.
11. The grounding check is TOOLS's `checkGrounding(text, reads)` (`../grounding.ts`), called after the turn with the conversation's reads. `engine/grounding.ts` is only the default when none is handed in.
12. Not on the contract yet: a detail line for a finished progress row ("38 rounds") and the practice picture. The old `progressEnd` added them from the envelope. If TOOLS wants them back, add `progress_detail?: string` to `ToolResult` and the engine will send it on `read_finished` (the event already has a `detail` field).

## 2026-11-10 (TOOLS)

1. `ScreenLoaders` is defined in `../screen-loaders.ts` (TOOLS) and re-exported by `tool.ts`. Its header lists the
   Clubhouse function the route binds to each field. Every field is optional; a tool whose loader is missing or
   returns null answers with an `unavailable` read.
2. Requested, not yet in `tool.ts` or `loop.ts`: `ToolResult.model_text?: string`. The screen readers set it: the read
   as labelled lines ("Scoring avg: 74.2 | team 75.1", places, gaps), about a seventh of the envelope's JSON. Wanted
   behaviour: when a result has `model_text`, the tool_result content is `[<evidence_ref>] <model_text>` and the
   envelope (with `model_text` kept on it) still goes to the evidence chip, the `reads` map and the grounding check.
   Until then `model_text` rides inside the JSON as one more field: correct, but each Stats read costs the model
   roughly 3,000 tokens where 400 would do.
3. Every `P` TOOLS returns is `ActionProposal & { tool: string; input: unknown; planned_at: string }`, JSON-safe.
   `commit` needs all three back unchanged: `input` is what is written, `planned_at` bounds the look for an earlier
   attempt's row, and `idempotency_key` (as rewritten by the engine) is the seed of every downstream request id.
4. `commit` never touches the ledger. It returns `completed`, or `failed` with a `summary` that says either
   "Nothing was saved." (it looked) or "I could not check whether anything was saved: look in <place> before trying
   again." (it could not look; `retryable` is false). The engine should pass that sentence to the model as it is.
5. `lock_lineup` refuses while the coach's own `set_lineup` for the same tournament is held or running. It finds it
   in the ledger under `proposed_input->proposal->input->>tournament_id` (and the old top-level shape).
6. Hold release, proposed (ENGINE owns `undo-hold.ts`): wait out the hold inside the Confirm request instead of in
   `after()`. The request is already open to stream the closing words: emit the held receipt, `await releaseHeld(...)`
   in the request, emit the final receipt, append the tool_result with what really happened (committed, undone,
   failed) and only then ask the model for its closing words. The write then never depends on `after()` surviving or
   on the coach's next request, and the stored sentence can no longer say "done" about something the coach undid.
   Keep `after()` only as the fallback for a browser that disconnects during the hold (do not abort the wait on the
   request signal), keep the card's GET and the sweep, and run the sweep on any signed-in coach page load, not only
   on a chat request. A cron cannot do these writes: each action reads the coach from the session.

## 2026-11-10 late (TOOLS), for Haiku 5.5 at high effort

7. Strict tool use. Every tool `toolsFor` returns has `input` wrapped by `strictInput` (`../strict-input.ts`):
   `z.toJSONSchema(tool.input, { io: 'input' })` is a closed object with every property required, optional fields as
   `anyOf [..., null]`, and no `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `minItems` or `default`.
   ENGINE can set `strict: true` on every tool as it is; `strictProblems(schema)` in that file lists any violation and
   `__tests__/strict-input.test.ts` runs it over every surface. `tool.input.parse` takes the model's nulls, drops them
   for optional fields and then runs the tool's own schema, so `run` and `plan` receive what they always did. An
   input with optional fields left out (a request sent without `strict`) still parses.
   Caveat for ENGINE: the reference lists no limit on the number of strict tools or of nullable fields, and I could
   not make a live call. If the API rejects 38 strict tools, set `strict` on the task tools first: a wrong field
   there matters more than on a read.
8. `instructionBlocks(surface, who)` no longer uses a date or notes (the third argument is accepted and ignored).
   Neither block holds anything that changes during a conversation: no date, no screen, no notes, no count; the
   roster is in a fixed order. The policy tells the model to expect a system note after the coach's message, in the
   words "Today is Tue 10 Nov 2026. The coach is on Roster, looking at Eli Brandt.", and that the coach's standing
   notes arrive the same way. Until that message is sent the model has no date: the readers that need one
   (`get_schedule`) default to the server's clock, so nothing breaks, but "next Tuesday" is unresolved.
   The roster is still in the team block. If it changes while a conversation is open, the team block changes and
   that conversation's thinking blocks stop matching; `drop_block` covers it. Storing the team block with the
   conversation would avoid even that, and is ENGINE's call.
9. Tool definitions are byte-stable: each tool is one object for the life of the process, descriptions hold no date
   and no count, and the list order per surface is fixed. The list still differs with `golf_tournaments_v1`
   (three tools), which is a deploy-level constant.
10. Reads as search-result blocks: every line of `model_text` now stands on its own ("Eli Brandt, Scoring avg, last
    10 rounds: 74.2 (n=10 rounds) | team average 75.1"), one figure per line, so ENGINE can send each read as one
    search-result block (title = the envelope's `summary`, source = its `evidence_ref`, text = `model_text`) or keep
    it as text. For the direct reads that set no `model_text`, the envelope's JSON is the content either way.
11. Adding a tool from another worker: export a `ReadTool` or `TaskTool` with an ordinary zod object as `input` and
    name the surfaces it belongs to here. TOOLS adds the import to `../registry.ts` at the end of that surface's
    reads or tasks (appending keeps the earlier definitions' bytes and order) and re-measures the prefix.

