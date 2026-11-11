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


## 2026-11-10 (CONTEXT), screen context and the app map

CONTEXT owns `../context/**` and `../tasks/**` and edits no ENGINE or TOOLS file except to append here. Neither folder
has an `index.ts` on purpose: `../context.ts` and `../tasks.ts` already own those import paths.

### C1. Where the person is (ENGINE wires)

1. Request body (`stream/route.ts`, the zod body): add `screen: z.unknown().optional()`. Do not validate it there:
   `turnContext` parses it and a value that does not parse is ignored, so an old or broken client still gets its turn.
2. Once per request with a new message (not on a decision request: the turn already has its line), after `ctx` is
   resolved, for a coach or a player alike:
   ```ts
   import { turnContext } from '@/lib/coachhelm/v3/chat/context/screen-context';
   const where = await turnContext(supabase, ctx, body.screen);   // never throws; one to six small reads, in parallel
   ```
   `where.line` is the whole per-turn system message, date included, e.g.
   `Today is Tue 10 Nov 2026. The coach is on Stats, looking at Avery Lane over the last 10 rounds.`
   Append it as `{ role: 'system', content: where.line }` after the user's message and store it with the turn like any
   other message (history stays append-only). With no usable screen it is the date alone, so the date can leave the
   team block (`instructionBlocks(..., { today })`) whenever TOOLS is ready to drop it from the cached prefix.
3. `where.screen` (`ResolvedScreen | null`) holds the checked ids for server code. Suggested, not required:
   `ToolContext.screen?: ResolvedScreen | null`, so a reader can default to "the round on screen". Nothing reads it yet.
4. Client hook (`useCoachHelmChat.ts`), with each new message:
   ```ts
   import { screenContextFromPath } from '@/lib/coachhelm/v3/chat/context/screen-schema';   // pure, no server import
   body.screen = { ...screenContextFromPath(location.pathname, location.search), ...selection };
   ```
   `selection` is what the address does not carry and the screen knows: `{ player_id }` on Roster, `{ thread_id }` in
   Messages, `{ window }` on Stats. The type is `ScreenContextInput`. The Ask tab's `@` mention of one player can send
   `{ player_id }` the same way.
5. What it guarantees (tests in `../context/__tests__/screen-context.test.ts`): an id from another team is dropped (the
   row's team is compared after the read as well as filtered in it); a player's line never names a teammate (a player
   gets the screen, the window and their own round only; no title somebody else typed); the line never holds an id or
   an e-mail address; text from the database is cut to plain characters and quoted; nothing throws.

### C2. Where things are (TOOLS wires, two lines in `registry.ts`)

```ts
import { findInApp, findInAppForPlayer } from './context/find-in-app';
// coachTools: add `findInApp` to `reads` (after `findThread` keeps today's cached order for everything before it)
// playerTools: add `findInAppForPlayer`
```
- `find_in_app({ query, player_id | null })` (the player's has `query` only). It reads no team data and returns
  `evidence: false`, so no evidence chip. The model is given place names and purposes, never an address.
- New UI part, in `ToolResult.parts`: `{ type: 'data-app-link', id: 'app-link-<place>', data: { label, href, place } }`
  (`AppLinkPart` in `find-in-app.ts`). `href` is an in-app path from the app map (`/golf/dashboard/...`), never model
  text. ENGINE: add `'data-app-link'` to `REPLAYABLE` in `restore.ts` so the button survives a reload. The thread draws
  it as a link button under the answer ("Open Roster"); until a screen draws it, the part is ignored and the answer
  still names the place.
- A suggested line for the policy block (TOOLS owns `instructions.ts`): "When the coach asks where something is, or
  your answer sends them to a screen, call find_in_app and name the place; the button under your answer opens it."
- `registry-size.test.ts`: the tool adds about 190 tokens to the coach prefix and 130 to the player's.

### C3. What the coach has told it: standing notes (decision, then wiring)

**Decision: two plain tools, `save_note` and `remove_note`, not Anthropic's memory tool (`memory_20250818`).** Read:
`shared/tool-use-concepts.md` ("Client-Side Tools: Memory"), `typescript/claude-api/tool-use.md` ("Memory Tool",
`betaMemoryTool` and `MemoryToolHandlers`), and the Haiku 5.5 section of `shared/model-migration.md`. Why:
1. Could not confirm this model takes it. The reference shows the tool on Opus and lists it for Fable; the Haiku 5.5
   migration section does not mention it, and no live call is allowed. A tool type the model rejects is a 400 on every
   request of every coach.
2. It does not fit the rows even where it is accepted. The memory tool is a file directory (`/memories`) the model
   keeps for itself: `view`, `create`, `str_replace`, `insert`, `delete`, `rename` on paths. The store here is one row
   per sentence, 1 to 280 characters, per coach and team, under row-level security. A handler would have to invent a
   file, diff edits back into rows and refuse most commands.
3. It is the model's memory; these are the coach's words. The model writes to a memory directory what it works out.
   The table's own rule (held migration 20261101090100, `saveCoachFact`) is that nothing inferred is ever written.
4. It is schema-less and Anthropic-defined: no `strict`, and no description of ours, so the rule the brief wants in
   the description (never a named player's health, never what a coach would not want written down) has nowhere to go.
5. Its protocol has the model look in the directory at the start of a task: one more round trip per conversation,
   where notes arrive here as a system message with the first turn.
6. A schema-less tool in `tools` is a second kind of tool for the engine to carry and a different prefix for the
   player, for no gain over two small strict tools.
The seam, if the eval ever wants it: `readStandingNotes`, `saveCoachFact` and `deleteCoachFact` are the whole store; a
`MemoryToolHandlers` over one virtual file `/memories/coach-notes.md` (one note per line) can sit on them.

**ENGINE wires** (`stream/route.ts`; the route already reads `readAskKnows`, this replaces that call):
```ts
import { firstTurnNotes, readStandingNotes, toneSentence } from '@/lib/coachhelm/v3/chat/context/notes';
const knows = await readStandingNotes(supabase, ctx, isNewConversation ? null : convId);   // null: a player, no migration, or a failed read. Never throws.
// The per-turn system message, after the user's message:
//   every turn:                 [where.line, toneSentence(knows)].filter(Boolean).join(' ')
//   a conversation's first turn: [firstTurnNotes(knows), <the line above>].filter(Boolean).join('\n\n')
```
- `firstTurnNotes` is null when there are no notes: send nothing. It goes once, on the first turn, and stays in the
  stored history. A note saved or removed later answers with the full list in its tool result, so that conversation
  is current without another message; the next conversation gets the new list on its first turn.
- `toneSentence` goes on every turn because the tone switch can move mid-conversation; it is null without the
  migration and for a player.
- `instructionBlocks`'s `notes` option is no longer needed (TOOLS already ignores it); `knowsSection` in
  `../ask-knows.ts` stays only until the route stops importing it.

**TOOLS wires** (`registry.ts`):
```ts
import { noteTools } from './context/notes';
// coachTools: `...noteTools(who)` at the end of the reads, after find_in_app. Nothing for playerTools: noteTools(player) is [].
```
- `save_note({ text })` and `remove_note({ note })` are `kind: 'read'` with `evidence: false`: they save at once and
  are not confirm-gated, as the brief asks ("saved at once with a receipt chip"). They are the only two tools of that
  kind that write, and all they write is the coach's own note through the app's own actions (`saveCoachFact`,
  `deleteCoachFact`: the coach from the session, row-level security on the row). `TASK_TOOL_NAMES` must not list them.
- New UI part: `{ type: 'data-coach-note', id: 'coach-note-<id>', data: { op: 'saved' | 'removed', note_id, text } }`
  (`CoachNotePart`). ENGINE: add `'data-coach-note'` to `REPLAYABLE`. The thread draws it as a small chip ("Noted: …",
  with Remove calling `deleteCoachFact(note_id)`, as `KnowsPanel` does); the panel already lists every note.
- Suggested policy line (TOOLS): "When the coach asks you to remember something for next time, or to stop doing
  something a note says, use save_note or remove_note. Do not save anything the coach did not ask you to keep."
- The server refuses, whatever the model sends: a note naming a roster player beside health, family, grades or
  discipline; contact details or a password; a 31st note; a duplicate. Without the migration both tools say notes are
  not switched on and write nothing.

### C4. What the app can do: two more tasks (TOOLS wires, one line)

The whole list of the app's actions against the tools, with what is left to the app on purpose and what is left for
later in order, is `../tasks/INVENTORY.md`.

```ts
import { eventTaskTools } from './tasks/event-tasks';
// taskTools({ quickChat }) in ../tasks.ts, or coachTools in registry.ts: `...eventTaskTools()` at the END of the tasks
// for all three coach surfaces (appending keeps every earlier definition's bytes). Never for a player.
```
- `send_event_reminder({ event_id, recipients: 'not_replied' | 'invited' | 'named', player_ids })` wraps
  `sendEventReminderToPlayers`. `record_attendance({ event_id, present_player_ids, late_player_ids, no_show_player_ids })`
  wraps `markAttendance`. Both are `kind: 'task'` on the contract as it stands; no change to `tool.ts` is asked for.
- Add both names to `TASK_TOOL_NAMES` (it is built from `taskTools`, so wiring through `taskTools` does it), to
  `WHERE` in `../tasks.ts` only if their receipts should go through `failedReceipt` (they build their own), and to
  `held-runner.ts`'s way back from a ledger row to a tool, which finds a tool by name in the surface's list.
- `P` is `ActionProposal & { tool, input, planned_at }`, the same shape as TOOLS's `TaskProposal`, JSON-safe; `input`
  is what `commit` uses (the checked event id, the resolved player ids and, for the reminder, the exact words shown).
- Hold and Undo: both go through the ordinary 8 second hold. A reminder is sent by `commit`, so nobody hears before
  the window closes.
- The event id comes from `get_schedule`. A suggested policy line (TOOLS): "To remind players about an event or
  record who was at one, read the schedule for the event first, then call send_event_reminder or record_attendance."
- Receipt truth for ENGINE's tool_result: `record_attendance` reads the rows back before it says a mark was not
  saved. `send_event_reminder` cannot read back (a coach cannot read players' notification rows), so when the send
  itself does not confirm its receipt says "may or may not have gone out … sending it again is safe" and
  `retryable` is true: the action's upsert key makes a second send land on the same rows.

### C5. Things CONTEXT found that are not its to fix

1. `src/app/golf/actions/coachhelm-ask.ts` still says of `saveCoachFact` "no chat turn ever calls this" (AK8), and
   the held migration's table comment says "never written by the model". `save_note` now calls it, on the owner's
   instruction of 10 Nov, with the coach's own sentence only. Whoever applies 20261101090100 should change both
   comments; the migration file is ENGINE's lane and the action file is outside every worker's list.
2. `reminderWords` in `../tasks/event-tasks.ts` repeats two lines of `sendEventReminderToPlayersImpl` because a
   `'use server'` file can export only actions. A test pins the action's lines. The clean fix is to move the wording
   into `src/lib/calendar/` and have both import it; the same move for `notifyEventUpdate`'s formatter unblocks
   `update_event` (INVENTORY.md, "Left for later", 1).
3. The scoped typecheck reports 23 errors in `src/components/golf/coachhelm/chat/*.test.tsx` (jest-dom matchers not
   typed in this program). They are there with or without CONTEXT's files; none is in `context/**` or `tasks/**`.
