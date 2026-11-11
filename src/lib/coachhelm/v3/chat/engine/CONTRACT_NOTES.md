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
