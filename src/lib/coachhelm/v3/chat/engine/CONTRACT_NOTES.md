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

(Rewritten 2026-11-10 late, for Claude Haiku 5.5. This is what `loop.ts` does now.)

- read, called directly, citations on (the default): the `tool_result` content is ONE `search_result` block:
  `source: "read:<evidence_ref>"`, `title:` the envelope's `summary` (the progress label when there is none),
  `content:` one text block per line of `model_text` (the envelope's JSON as one block when a read sets no
  `model_text`), `citations: { enabled: true }`. A text block is the smallest thing the API can cite, so one figure a
  line gives a citation that points at one figure.
- read with citations off, or called from the model's code (programmatic calling can only be handed text):
  `[<evidence_ref>] <model_text>`, or `JSON.stringify({ ...envelope, evidence_ref })` when there is no `model_text`.
- read with `evidence: false` (find_in_app, the note tools): `model_text`, or the envelope's JSON. No ref, nothing to cite.
- read whose `coverage` is `unavailable`: text as above, never a search result (there is nothing to cite).
- a read that threw, or an input that failed validation: an `is_error` result with one sentence.
- task proposed: nothing yet; the turn ends on the card. The result arrives with the coach's decision and states what
  happened, after it happened: `Committed. <receipt summary>`, `Partly done. <summary> Not done: <...>.`,
  `Failed. <the receipt's own summary>` (TOOLS's sentence, passed on as written), `The coach pressed Undo before it was
  written. Nothing was written.`, `Declined by the coach. Nothing was written.`, `The coach asked something else instead
  of confirming. Nothing was written.` There is no "held" result any more: the model is not asked for closing words
  until the Undo window has closed.
- a task asked for from the model's code: an `is_error` result. Nothing is planned, no card, no ledger row.

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

### C6. Size and strictness of what CONTEXT adds (measured; replaces the estimate in C2)

- Characters / 4 of name, description and the strict schema, as `registry-size.test.ts` counts: the five coach tools
  (`find_in_app`, `save_note`, `remove_note`, `send_event_reminder`, `record_attendance`) are 1,166 together; the
  player's `find_in_app` is 147. TOOLS: re-measure the prefix against the 12,000 target when wiring them.
- All six pass `strictProblems` after `strictInput`, and parse both the strict shape and the plain one
  (`../context/__tests__/strict-shape.test.ts`). They are written as closed objects with every field required and
  nullable where optional, so they are strict with or without the wrapper.
- Nothing in any description or schema changes between requests: no date, no count, no name, no flag.

## 2026-11-10 night (TOOLS), follow-ups

12. Two more loaders for the route to bind (`../screen-loaders.ts` has the types and the header lists them):
    ```ts
    roundReview: (roundId) => loadRoundReview(roundId, isPlayer ? { role: 'player', playerId, teamId } : { role: 'coach', teamId }),
    tournaments: async () => loadTournamentsHome(await tourContext({ role: 'coach', teamId })),   // coach only, and only when golf_tournaments_v1 is on
    ```
    `get_round` and `get_tournaments` read nothing of their own now. Unbound, each answers "could not be read"
    (`unavailable`), never an empty round or an empty season, so a missing binding is visible and not wrong.
    A player's `get_round` checks the round is theirs with the session client before `roundReview` is called, and
    drops a round whose `playerId` is not theirs after it.
13. A course cannot be bound. `loadCourseHistory` (the Course page) is one player's history at a course, keyed by the
    Rounds page's course key with a window; `get_reference` topic course answers the team's scoring to par by hole
    for a `course_id`, which no screen draws.
14. Registered from CONTEXT, as C2 to C4 ask: `find_in_app` after `find_thread`, then `save_note` and `remove_note`
    (coach reads); `find_in_app` last for a player; `send_event_reminder` and `record_attendance` after every other
    task. `TASK_TOOL_NAMES` lists the two tasks and not the two note tools. One policy line for each is in.
15. The team block now holds the team, its timezone, the rule for when a season runs ("from 1 August to 31 July")
    and the roster. No date, no notes, no count. The date line is CONTEXT's `turnContext(...).line`; TOOLS exports
    no second one. `instructionBlocks`'s third argument is still accepted and ignored: stop passing it when convenient.
16. Strict schemas: every registered tool on every surface, CONTEXT's five included, converts to a strict JSON Schema
    (closed objects, every property required, optionals nullable, no bounds or patterns). None cannot.
    `../__tests__/strict-input.test.ts` runs `strictProblems` over all of them. ENGINE can set `strict: true`.
17. Prefix by characters / 4: Ask and the practice helper 13,023 (43 tools: 11,334 of definitions, 1,690 of rules),
    quick chat 12,532 (40), player 3,862 (10). KNOWLEDGE's golf block and data map are not in `policyBlock` yet:
    their export names have not been appended here. When they are, the order is rules, golf, data map.


## 2026-11-10 late (ENGINE), Claude Haiku 5.5 at effort high

E1. `model_text` is wired (TOOLS item 2). The envelope, `model_text` included, still goes to the evidence part, the
    `reads` map, the store and the grounding check; only what the MODEL is handed changed (see "What the engine sends").

E2. **Grounding is search-result blocks with citations, not markers the model writes.** Confirmed in the live docs
    (search results: this model is listed, stable, no beta header) and in the SDK's types
    (`BetaSearchResultBlockParam`, `BetaCitationSearchResultLocation`, `citations_delta`). The API attaches to each
    sentence the read it drew on; the engine turns a citation whose source is `read:eN` into the ` [eN]` marker the
    thread already draws (`../read-markers.ts`), at the end of the cited text block. So for TOOLS:
    - the policy must NOT tell the model to write `[e1]` itself (it would be doubled). It can say "state a figure only
      from a read" as before; the pointing-back is the API's.
    - a `[eN]` the model writes anyway is still drawn by the thread and still stripped from the stored words.
    - the stored `content` and what `checkGrounding` is given carry no markers; the stored `model_messages` carry the
      API's own citation objects and go back unchanged.
    - a read with one figure a line cites best. A read that returns a paragraph is cited as a whole.
    - a citation naming a read this conversation does not have draws nothing.
    `CHAT_FEATURES.citations = false` sends reads as `[eN] lines` text again; nothing else changes.

E3. The per-turn system message. `{ role: 'system', content }` straight after the user's message, stored with the turn,
    replayed in place on every later turn. Its content, from the route: `[firstTurnNotes(knows) on the first kept turn,
    [where.line, toneSentence(knows)] joined by a space]` joined by a blank line (CONTEXT C1 and C3, as specified). A
    decision request sends none. A turn stored as failed keeps only the question (a system message may only stand last
    or before an assistant message). Nothing volatile is in `system` or `tools`; `instructionBlocks(surface, who)` is
    called with two arguments.

E4. A coach's words are never inside a `tool_result`. A message typed while a card waits is sent as
    `[tool_result(the card's outcome), { type: 'text', text: <their words> }]`, then the system message.

E5. Hold release (TOOLS item 6, decided by the lead): Confirm waits the Undo window out inside the open request.
    `startConfirm` (was `confirmTask`) returns `held` with the receipt to show at once and `finish()`, which waits,
    takes the row only if it is still held, commits, and answers with what happened. The held card is stored before the
    wait, so a reload during the window draws it. The wait does not stop when the browser goes away (`after()` keeps the
    function alive until the turn has finished); the card's GET and the sweep are unchanged. A second Confirm while the
    first is waiting changes nothing and calls no model. A card left behind for a new question is asked of the ledger
    first (`settleAbandonedTask`): only a card that is still `proposed` is declined.
    Not changed, and worth a look by whoever owns the card: after an Undo the stored receipt part is still the `held`
    one (there is no `cancelled` receipt status); the card's own GET says cancelled, as before.

E6. Refusal: `stop_reason: 'refusal'` ends the turn `complete` with one sentence as the reply (the model's own content
    is not kept), and `stop_details.category` goes to the turn's log line. No `fallbacks` is ever sent.

E7. `strict: true` is set by the engine on every tool (`modelToolFor`), on the schema `strictInput` produces, passed
    through the SDK's `transformJSONSchema`. A schema the transform cannot express is sent without `strict` rather
    than failing the request. TOOLS's caveat stands (no documented limit on the number of strict tools could be found,
    and no live call was made): if the API rejects the request, the loop sends it once more with no `strict` and no
    beta, the turn completes, and `v3.chat.stream.degraded` is logged as an error. Until someone turns the feature off
    in `CHAT_FEATURES`, every turn then pays one rejected round trip (no tokens are billed for a 400).

E8. (Superseded by E16: ON for the coach surfaces since the owner's decision of 10 Nov 2026.) Programmatic tool calling is built behind `CHAT_FEATURES.programmaticReads`, OFF. With it on: the
    `code_execution_20260120` tool is offered; READ tools get `allowed_callers: ['direct', 'code_execution_20260120']`
    and lose `strict` (the two cannot be combined); a read called from code is answered with a plain string; the reply
    to a pending call holds only `tool_result` blocks and names the container; a task asked for from code is refused.
    Before anyone turns it on:
    - tool results pass through a code execution container Anthropic keeps for up to 30 days and the feature is not
      eligible for zero data retention. These are minors' figures: that is an owner decision, not an eval switch.
    - reads called from code carry no citations (text only), so those answers have no read markers.
    - not handled: a single response that both calls a read from code and asks for a task directly, followed by the
      coach typing instead of deciding (the reply would then hold a text block next to the results, which a pending
      programmatic call does not accept). The container is carried across the card for the Confirm and Cancel paths.

E9. The memory tool: not used (CONTEXT C3 gives the reasons; ENGINE agrees). The seam is one line: a schema-less entry
    in `tools` from `buildModelRequest`, and a branch in the loop's tool dispatch for a tool the registry does not
    hold. Neither exists today.

E10. Off, each one field of `CHAT_FEATURES`: `taskBudgetTokens` (null: the guide says not to send an unmeasured value,
     and it does not say whether the countdown covers a turn or the stored conversation); `progressNotes`
     (`thinking.display: 'updates'`: the reference's availability table does not list this model). On: `compaction`
     at the default trigger, `dropStaleThinking`.

E11. `data-app-link` and `data-coach-note` are in `REPLAYABLE` (`../restore.ts`), so both survive a reload (CONTEXT C2, C3).


## 2026-11-10 (KNOWLEDGE): what TOOLS and ENGINE import from `../knowledge`

K1. Two more blocks of the cached prompt, both byte-identical for every team, day and conversation (tests:
    `knowledge/__tests__/golf-block.test.ts`, `data-map.test.ts`):
    ```ts
    import { knowledgeBlocks } from './knowledge';
    knowledgeBlocks(surface: ChatSurface): { golf: string; dataMap: string }
    ```
    - `golf`: golf as this app measures it (a coach's text for `ask`, `quick_chat`, `practice_helper`; a player's for `player`).
    - `dataMap`: where things are. A coach's lists what exists, which read answers which question, the exact tables and
      columns of `query_team_data`, the status values and what is not recorded. A player's names no table.
    Where they sit: inside the one-hour block, after the policy and before the team block:
    `tools → policy → golf → dataMap → [1h breakpoint] → team → conversation`.
    The smallest wiring, in `instructions.ts` (TOOLS), needs no engine change because `prompt.stable` is one block:
    ```ts
    const k = knowledgeBlocks(surface);
    return { policy: [policyBlock(surface), k.golf, k.dataMap].join('\n\n'), team: teamBlock(who) };
    ```
    Neither block may be built per request from anything else: no date, name, count or flag goes in. The data map is
    the same bytes with `golf_tournaments_v1` on or off (it names `get_tournaments` "only when tournaments are turned on").

K2. Size, characters / 4: golf 3,165 (coach) / 2,917 (player); data map 3,655 (coach) / 686 (player). The new ceiling for
    `__tests__/registry-size.test.ts` is 19,000 for tool definitions + policy + golf + data map: add
    `knowledgeChars(surface)` (exported from `./knowledge`) to `toolChars + policyChars`. Measured on 10 Nov with the
    tournaments flag ON: ask 19,636 (tools 11,177, policy 1,640), quick chat 19,145, player 7,494. So with the flag on
    the coach surfaces are over by about 640; with it off (production) they should clear it. Levers, cheapest first:
    (a) delete the policy's "Which read to use" list (about 250): the data map's "Which read answers which question"
    replaces it and is checked against the registry; keep the policy's two sentences on the default window and on
    calling independent reads together; (b) delete `get_reference`'s description of each topic's contents where the
    data map says it; (c) the tool definitions themselves, which grew past the 12,000 they were measured at.

K3. `get_reference` keeps its shape. `getGolfReference({ topic })` is still exported from `./golf-reference` and still
    takes the model's `about`. New behaviour behind the same call: `about` may be one of the topic names the golf
    block lists (`strokes_gained`, `what_moves_score`, `college_golf`, `course_management`, `lies_and_conditions`,
    `holes_and_courses`, `pressure`, `improvement`), which returns that topic from its start with
    `detail.more_in_this_topic`; any other words are searched as before. A miss returns `detail.topics` (and still
    `detail.chapters`). The Tour tables of the research document are no longer served: a Tour or level figure comes
    only from topic `standards`. Optional for TOOLS: change `about`'s description to "a topic name from the prompt, or
    a few words". No schema change is needed.

K4. A reader named in the data map must exist in the registry and a registry read must be in the map, or
    `npm run coachhelm:data-map` refuses and `data-map.test.ts` fails. When TOOLS or CONTEXT adds a read tool: either
    add a line to `READER_GUIDE` in `knowledge/data-map.source.ts` (it reads team data) or add its name to
    `NOT_DATA_READERS` there (it does not), then run `npm run coachhelm:data-map`. When the allowlist gains a table,
    `QUERY_TABLE_NOTES` needs its one line (it does not compile without it).

K5. For TOOLS, from reading the readers against the screens (not fixed by KNOWLEDGE, the files are yours):
    - `readers.ts` (qualifier board) prints `shortRounds` as "N short, ranked below full cards". `shortRounds` counts a
      player's counted rounds that were not 18 holes (`src/clubhouse/screens/qualifiers/model.ts:220`). The rule the
      board ranks by is `played < most rounds anyone has` (`src/lib/coachhelm/v3/qualifying/ranking.ts:54-57`).
    - `get_rounds` prints the Rounds page's season line, which includes practice rounds; `get_season` leaves them out.
      The golf block and the data map say `get_season` is the season figure. Either drop that line or word it
      "all round kinds".

## 2026-11-10 late (CONTEXT): `find_in_app` only where Clubhouse renders (ENGINE wires; TOOLS agrees)

C7. Every address in the app map (`../context/app-map.ts`) is a Clubhouse page: Team Hub's tabs, Practice,
`?view=ask`, the Settings sections. The stream route also serves Fairway's chat, where some of those addresses are a
different page or a redirect. The registry cannot know which shell a team gets, so it keeps registering `find_in_app`
for every coach and player (one list, stable bytes), and the route, which already knows, drops it by name before the
request is built whenever Clubhouse is not on for that person, with the same check the page uses:
```ts
const tools = toolsFor(surface, ctx).filter((t) => clubhouseOn || t.name !== 'find_in_app');
```
That is two cached tool lists (with and without), each byte-stable. The same value decides whether `turnContext`'s
screen is worth sending: its place names are the Clubhouse navigation's, so with Clubhouse off pass `null` for the
screen and keep the date (`turnContext(supabase, ctx, clubhouseOn ? body.screen : null)`).
Nothing else of CONTEXT's depends on the shell: the notes and the two event tasks are the same in both.

## 2026-11-10 night (TOOLS), after KNOWLEDGE's blocks landed

18. K1 is wired as K1 asks, one level down: `policyBlock(surface)` now returns the whole cached policy (rules, golf,
    data map, joined by a blank line, built once per surface) and `instructionBlocks(surface, who).policy` is that
    string. ENGINE changes nothing: `prompt.stable` is still one block. `rulesBlock(surface)` is the rules alone.
19. Size, characters / 4, tournaments flag off (corrected after items 21 and 22): Ask and the practice helper 19,876
    (tools 11,349, rules 1,707, golf and data map 6,820), quick chat 19,384, player 7,497. The whole-prefix ceiling in `registry-size.test.ts` is
    21,000 by the lead's decision (K2's 19,000 is superseded); TOOLS's own tools and rules keep their 12,000 (11,836).
    K2's lever (a) is taken: the rules no longer list which read answers which question and point at the data map.
20. `find_in_app` stays registered for every coach and player. ENGINE drops it by name in the route when Clubhouse is
    not on for the team (`isClubhouseForTeam`), which gives two byte-stable tool lists. Both policies read correctly
    without it ("If you have find_in_app ... If you do not have it, name the screen in words").
21. Task results: rule 4 of the coach's Tasks rules now names what the loop sends (`Committed`, `Partly done`,
    `Failed`, and the three results that say nothing was written). No rule mentions a held result.
22. Code (E8, `code_execution`): the coach's rules carry four sentences, worded "If you have code_execution", so the
    prompt is the same bytes with `programmaticReads` on or off and reads correctly either way: use it when a question
    spans many players or rounds or needs a calculation across several reads; for one player or one figure call the
    read directly; never do arithmetic in the answer; a task is never called from code, the task tool is called
    directly so the coach gets the card. The player's policy does not mention code. ENGINE: if the tool is offered
    under another name than `code_execution`, or you need other words, say so here and TOOLS changes the sentences.


## 2026-11-10 night (ENGINE): loaders, find_in_app, and what the chat screens asked the protocol for

E12. `roundReview` and `tournaments` are bound in the route (TOOLS item 12). Coach: `loadRoundReview(roundId, { role:
     'coach', teamId })`; player: `{ role: 'player', playerId, teamId }`; `tournaments` for a coach only and only while
     `golf_tournaments_v1` is on (unbound otherwise, which reads as unavailable). One correction to
     `../screen-loaders.ts`, found by binding it: a tournament's `format` on the screen is an object
     (`{ kind, players, counting, holes }`, `TourFormat`), not a string. The type and the two fixture lines in
     `registry-readers.test.ts` say so now; `get_tournaments` passes it through to `detail.format` unchanged.

E13. `find_in_app` is dropped by name in the route when Clubhouse is not on for the coach's team
     (`isClubhouseForTeam`), and the browser's `screen` is ignored then too (CONTEXT C7). The registry still registers it.
     A player only reaches this route with Clubhouse on (`isClubhouseFor('player')`), so a player's list always has it.

E14. `ToolResult.progress_detail?: string` and `ToolResult.progress_picture?: unknown` (was ENGINE item 12). The engine
     sends them on `read_finished` as `detail` and `picture`, and the stored `data-progress` part carries both, in the
     shape the thread already reads. Neither goes to the model. A read that sets no `progress_detail` gets its first
     measurement's sample ("1,412 rounds", "1 round"), which is the old `detailFor`. No tool sets `progress_picture`
     yet: `practice-pictures.ts` is keyed by tool names that no longer exist. TOOLS: return
     `progress_picture: practicePicture(...)`'s `picture` from the reads that should draw one.

E15. Protocol, all additive (there is no version marker in the reducer; every new field is optional and an old
     stored thread restores exactly as before, tested in `src/test/coachhelm/v3/chat-restore.test.ts`):
     - `message_start.started_at` (ISO, when this request began work) and `message_start.context`
       (`{ screen, label } | null`: the screen id and the app map's name for it; null when none was sent, none passed
       the checks, or Clubhouse is off). The hook keeps both on the assistant message's `metadata`
       (`ChatMessageMetadata`).
     - `{ type: 'phase', phase: 'thinking' }` before each model call. Not stored. The hook exposes `phase`
       (`'thinking' | null`), cleared by the first event of the answer. Status stays `submitted` while thinking.
     - `read_finished.detail`, `read_finished.picture` (E14).
     - `decision.reason: 'superseded'` and `decision.message_id` when a new question withdraws a waiting card: the
       event is sent on the new question's stream and names the EARLIER message that holds the card. The stored card
       becomes `approval: { id, approved: false, reason: 'superseded' }`. A Cancel the coach pressed has no `reason`.
     - `error.kind`, one of `ChatErrorKind` (`engine/protocol.ts`). Sent on the stream: `model`, `truncated`, `lost`
       (the answer could not be saved), `card_retry`, `card_gone`. In a refused request's JSON body (`{ error, kind }`):
       `budget`, `off`, `rate`, `signed_out`, `gone`. Set by the hook itself: `offline`, `lost` (dropped connection),
       `card_retry` (a decision whose response was lost). `useCoachHelmChat().error.kind` is always set;
       `chatErrorKind(error)` in `../error-message.ts` gives the same answer for any error object. A stored failed turn
       keeps it: `data-turn-incomplete.data.kind`.
     - `declined` is in the set and is never sent: a refusal is a complete turn (E6). It is marked instead in the
       turn's meta part, `declined: true`.
     - `done.duration_ms` (this request) and the stored part `data-turn-meta` (id `turn-meta`):
       `{ started_at, duration_ms, reads, declined? }`. `started_at` is the turn's and does not move when its card is
       decided; `duration_ms` adds up over the requests that worked on the turn (the Undo window included); `reads`
       counts finished read rows, failed ones included. `turnMetaOf(parts)` reads it; a thread stored before 10 Nov
       2026 has none. It is in `REPLAYABLE`.
     - The final receipt arrives on the Confirm's own stream when the hold ends (E5), so a card need not poll.


## 2026-11-10 late night (ENGINE): the model's code is on; an undone card; where a task lands

E16. **Programmatic tool calling is ON for Ask, quick chat and the practice helper, OFF for a player** (owner, 10 Nov
     2026: "It's not minors. Turn it on."). `CHAT_FEATURES.programmaticReads` is the one switch;
     `chatFeatures(surface)` gives a player the same features without it.
     - The request: `{ type: 'code_execution_20260120', name: 'code_execution' }` is the LAST tool; every READ has
       `allowed_callers: ['direct', 'code_execution_20260120']` and no `strict`; every TASK is direct-only and strict.
       The list and its order are the registry's, the same bytes on every request (`engine/__tests__/registry-tools.test.ts`
       builds it twice, and again three weeks later). Measured as sent (JSON of tools and system, characters / 4,
       tournaments flag off): Ask and the practice helper 21,251, quick chat 20,739, player 8,118; with the switch off
       the coach surfaces are about 380 smaller. Anthropic adds the code tool's own instructions on its side.
     - Every read the code calls goes through the same path as a direct one: the tool's zod schema first (an input
       that fails it is an `is_error` result and nothing runs), the same session client, the same ownership checks,
       the same `ScreenLoaders`. Its envelope reaches the `reads` map, the store and `checkGrounding`.
     - A task called from code is refused (`is_error`, nothing planned, no ledger row). A task asked for directly in
       the same response as a call from code is refused too, with "ask for this change on its own after the code has
       finished": a card never waits on the coach while the code waits on a read.
     - **How the thread learns which reads fed a computed answer.** Three things, all on the stream and all stored:
       (1) a progress row for the code itself, `tool: 'code_execution'`, label "Working it out", open from the code's
       start until its result is back; (2) the usual progress row for each read the code calls, between those two;
       (3) each such read's evidence part carries `data.via: 'code'` beside `tool`, `envelope` and `ref`. An answer
       computed in code has no citations (the code is handed text, and what it prints is not a read), so no `[eN]`
       marker is drawn for it: the `via: 'code'` evidence parts of the turn are its sources. The grounding check will
       log a computed figure as unmatched when it appears in no read; that is expected and logs only.
     - Fallback: if the API rejects a request, the retry is plain: no beta, no `strict`, **no code tool**. A
       conversation that already holds a call from the model's code may not replay without the tool; then the plain
       request fails too and the coach gets the ordinary failure sentence.
     - For TOOLS (`instructions.ts`): the four sentences added in `2a3ea8988e` ("If you have code_execution ...") are
       the wording the engine needs. The model sees the tool under the name `code_execution`. Nothing else is asked.
     - What it means for the data, recorded in the feature doc: read results pass through Anthropic's code execution
       container and its retention applies.

E17. `ActionReceipt.status` has `cancelled`: the coach pressed Undo inside the window and nothing was written. The
     Confirm's stream ends `receipt(held)`, `receipt(cancelled)`, then the closing words, and the stored turn holds
     the cancelled receipt (`summary: 'Undone. Nothing was written.'`, `created: []`). A card left behind that the
     ledger says was undone gets the same receipt. Old stored turns are unchanged: one that was undone before 10 Nov
     still holds its `held` receipt and the card's own GET answers 409 `cancelled`, as before.
     **For whoever owns the cards**: three places today treat any receipt that is not `failed` or `held` as done
     (`src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx:129`, `src/clubhouse/shell/quick-chat/TaskCard.tsx:46`,
     `src/components/golf/coachhelm/chat/ActionCards.tsx:183`). Until they read `cancelled`, a RELOADED undone card is
     drawn as done with the words "Undone. Nothing was written." The live card is right, because Undo is its own state.

E18. What quick chat's landing design asked for (`docs/clubhouse/coachhelm-chat-v3/QUICK-CHAT.md`, Requests 1 to 4):
     - `ActionReceipt.created[].id` and `.ids`: the row the task wrote, and every row when it wrote several. Set
       today for: `create_event`, `add_blocked_time`, `create_recruit` (the row's id is the request id),
       `create_task`, `create_team_announcement`, `create_recurring_practice` (one calendar row that repeats: one id)
       and `create_qualifier`. NOT set where the app's own action does not return the row: `create_focus_area`,
       `create_goal`, `create_trip`, and a second commit of a card found by its natural key. Those land as
       `ST-8.not-found` (nothing marked). Ids are only of rows the confirming coach wrote; nothing here reaches a player.
     - `created[].href` goes to the thing where the app has an address for it: an event is
       `/golf/dashboard/calendar?date=<day>&event=<id>`, blocked time the Calendar on its day, a qualifier its own
       page, a focus area the player (`/golf/dashboard/roster?player=<id>`). Tasks and announcements stay on their section.
     - `ActionProposal.lands: { kind, home, day? }` (`ActionLanding`), set at plan time by `landsFor(tool, input)` in
       `../tasks.ts`: `kind` is the page's row kind (event, blocked_time, task, announcement, trip, qualifier, recruit,
       focus_area, message, lineup, plan), `home` a path of this app, `day` an ISO day where the thing lives on one.
       Left out for a task that adds no row to a list.
     - `GET /api/coachhelm/v3/chat/conversations` rows carry `surface` (`ask`, `quick_chat`, `practice_helper`, or
       null). It needs the held migration `20261110130000_coachhelm_chat_conversation_surface.sql`; without it every
       row lists `surface: null` and nothing fails.
     **For CONTEXT (`../tasks/event-tasks.ts`)**: nothing is required. `send_event_reminder` and `record_attendance`
     add no row to a list, so they need no `lands`. If a task of yours ever writes a row a page lists, return
     `created: [{ kind, count, id, ids, href }]` with the row's own id and a link to the thing, and add its case to
     `landsFor`. `done(...)` in `../tasks/kit.ts` already passes `created` through unchanged.

E19. `ReadTool.direct_only?: boolean`. A tool on the read contract that changes something is sent without
     `allowed_callers`, stays strict, and a call to it from the model's code is refused before it runs. **CONTEXT:
     set `direct_only: true` on `save_note` and `remove_note`** (`../context/notes.ts`); they write the coach's own
     notes at once, and a write should be something the model asks for itself, as a task is. Until that line is in,
     the model's code can call them.


## 2026-11-11 (CONTEXT): six more tasks, one list, the card's certain fields

C8. `../tasks/list.ts` exports `contextTaskTools()`: CONTEXT's task tools in one fixed order, new ones appended.
`registry.ts` calls it after `taskTools(...)` for the three coach surfaces (the lead asked CONTEXT to register its
own; the two lines that named `eventTaskTools` now name this). The names are in `TASK_TOOL_NAMES` and in
`REGISTERED_FOR_OTHERS` in `__tests__/registry-size.test.ts`. A player gets none.

| Tool | Action | Held for Undo |
|---|---|---|
| `send_event_reminder`, `record_attendance` | as C4 | yes |
| `update_event` | `updateGolfEvent` with `expectedUpdatedAt`; one date | yes |
| `cancel_event` | `deleteGolfEvent` with no options (the soft cancellation, never `hard`) | yes: nobody is told before the window closes, because the telling is in `commit` |
| `set_focus_area_status` | `completeFocusArea`, `reactivateFocusArea` | yes |
| `set_goal_state` | `pauseGoal`, `resumeGoal`, `abandonGoal` | yes |
| `mark_signal_handled` | `acknowledgeInsight` | yes |
| `set_qualifier_coach_pick` | `setQualifierCoachPick` | yes |

- Sizes, characters / 4, strict form: the eleven CONTEXT tools are 1,587 together (the first five alone were 1,221
  before their descriptions were cut). Every description is one or two sentences; what a task card shows is the
  policy's to say, not each tool's.
- `record_attendance`'s input fields are now `present`, `late`, `no_show` (were `*_player_ids`). No stored
  conversation holds the old names: the tool was registered the same day.
- Card fields (`../card-types.ts`), filled in `plan` from reads, never from the model's input: `recipients` and
  `not_reached` by id and name, `delivery` (title and body as sent; a cancellation's e-mail is a `variants` entry and
  its `note` says who else is told), `undo`, `lands` for `update_event` and `cancel_event` (`kind: 'event'`, the
  Calendar, the day), and `visible_note` (what the player will see) on the four tasks that send nothing, which carry
  `recipients: []` and `delivery: null`. `../tasks/kit.ts` declares these fields itself (`CardExtras`) as well, so the
  tools build against the contract with or without the commit that adds them to `ActionProposal`.
- Receipts: `created[0].id` is the row's own id for an event, a focus area, a goal and a signal;
  `created[0].href` for an event is `/golf/dashboard/calendar?date=<day>&event=<id>`. Notification entries on
  `update_event` and `cancel_event` are `queued`, not `sent`: a coach's session cannot read players' notification
  rows, so the tool does not claim delivery.
- ENGINE: nothing new is asked of the contract. One thing to know for the tool_result: `settle` (`kit.ts`) returns
  `retryable: false` with "I could not check whether it went through: look in <place> before trying again" when both
  the action reported a failure and the read-back could not be made.
- Not built, with the reason for each: `../tasks/INVENTORY.md`, "Asked for and not possible" and "Left for later".
- E19 is done: `save_note` and `remove_note` carry `direct_only: true`. `find_in_app` reads nothing of the team's
  and writes nothing, so it does not.

## 2026-11-11 (CONTEXT): `set_task_reminder`

C9. A ninth CONTEXT task, appended to `contextTaskTools()` (so last in every coach list): `set_task_reminder({ task_id,
date, time })` wraps `setTaskReminder` (`golf/actions/tasks.ts`). It queues the app's in-app reminder; the card names
every assignee with an account (finished or not, as the app sends it), the coach who assigned the task, and the
words. Its receipt's notification is `queued`: the reminder goes out with the hourly job, not at commit. Held for
Undo like the others. Whole prefix after it, characters / 4: Ask 21,062 with the tournaments flag off and 21,476 with
it on; quick chat 20,545 and 20,959. The twelve CONTEXT tools are 1,751 of that.

## 2026-11-10 (KNOWLEDGE): what the eval harness needs from `knowledge/eval`

K6. `knowledge/eval/golf-sense.json` is plain data (an `.mjs` harness can read it directly); `knowledge/eval/index.ts`
    is the same thing loaded and compiled, for a TypeScript harness and for the tests. Either way, per answer:
    - **Golf sense** (one column): every `facts[].re` must match; no pattern in the question's own `forbid` may match.
      Two rules a data question does not have: skip `tour_figure_from_memory` when the turn called `get_reference`
      (the figure was read, not remembered), and score `readers` against the turn's tool calls (any one listed read
      counts; an empty list means no read of team data is required).
    - **Writing** (its own column, never folded into golf sense): every pattern named in `global_forbid` is held
      against EVERY answer, the data questions in `ask-eval.mjs` included, and `style.max_sentences` where a question
      has it (`sentenceCount(answer)` from `index.ts`; a list line counts as one). `golfSenseQuestions()` already
      appends the global patterns to each question's `forbid`, so a harness using `index.ts` must split them back out
      by name: a `forbid` entry whose `pattern` is in `EVAL_GLOBAL_FORBID` is a writing failure, any other is a
      golf-sense failure.
    - **Names as stored**: call `golfSenseQuestions(names, { people, places })` with the roster's names as `people`
      and the course and event names the turn's reads returned as `places`; the `proper_noun_case` rule then fails
      "eli brandt" or "Tpc Sawgrass". Without them only the fixed names (PGA Tour, NCAA, Division I) are checked.
    - Placeholders to fill from the staging roster: `{player}`, `{player2}`, `{new_player}` (fewer than three
      shot-tracked rounds), `{no_shots_player}` (hole-by-hole rounds, no logged shots), `{teammate}` (a player's turn).
    - Exports: `golfSenseQuestions`, `properNounPattern`, `sentenceCount`, `EVAL_GLOBAL_FORBID`, `EVAL_PATTERN_NAMES`,
      `EVAL_PLACEHOLDERS`, and the types `EvalQuestion`, `EvalFact`, `EvalForbid`.
    The report should show, per question: golf sense pass or fail with the labels that failed; writing pass or fail
    with the rule names that failed; the reads used against the reads expected.

C10. A tenth CONTEXT task, appended last: `dismiss_signal({ insight_id })` wraps `dismissInsight`
(`golf/actions/insights-feed.ts`). Nothing is sent; its card says the signal also disappears from the player's own
page, which is the app's one visibility rule (`lib/coachhelm/v3/insight-visibility.ts`). The row is kept. Whole prefix
after it, characters / 4: Ask 21,214 with the tournaments flag off and 21,628 with it on; quick chat 20,697 and 21,111.

## 2026-11-11 (PLANS): the card is the truth. New fields, exact names and shapes, for ENGINE and the UI workers

PLANS took over TOOLS's task files. The rule every task now follows: the model's input is intent only; `plan` resolves
it against the database with the session client and builds the whole card; `commit` performs the stored plan and
refuses, without calling the app's action, when the world no longer matches the card. Types are in `../card-types.ts`
and re-exported from `../action-types.ts`. Every field is optional, so a card stored before 11 Nov still renders.

P1. `ActionProposal`, added (all built by the server, never from the model's input):
```ts
recipients?: Array<{ id: string; name: string; role: 'player' | 'coach' }>;   // who is SENT something. [] = nobody. The count on the card is recipients.length.
not_reached?: Array<{ id: string; name: string; role: 'player' | 'coach'; reason: string }>;   // named on the card, will not get it ("no account yet")
delivery?: {                    // exactly what a recipient receives. null = nothing is sent. absent = an older card.
  channels: string[];           // 'push' | 'in_app' (the bell) | 'email' | 'message'
  title: string; body: string;  // the notification as a phone shows it
  variants?: Array<{ channel: string; title: string; body: string }>;   // the same notice where another channel words it differently (the bell row)
  each?: Array<{ id: string; name: string; body: string }>;             // when each person gets their own words (a published plan's first stop), in recipients order
  note?: string;                // what cannot be quoted, said plainly (an email's layout; players' own notification settings)
} | null;
visible_to?: 'only_you' | 'coaches' | 'recipients' | 'team';   // E-6, E-24: who can see it once saved
visible_note?: string;                                          // the same in one sentence, with names
undo?: { window: boolean; after: string };   // window false = writes on the press (lock_lineup only). `after`: where it is reversed later, or that it cannot be.
lands?: { kind: string; home: string; day?: string };   // ENGINE's field, unchanged; publish_practice_plan's home is now /golf/dashboard/practice/plan/<id> (the address the app's own notice opens; /practice/<id> is not a page)
impact?: string;   // existing field, now set by lock_lineup: what locking does and that it cannot be unlocked
```
`affects` is now filled for every flow that names players (`{ kind: 'player', id, label }`), including create_event,
create_qualifier, create_goal, the lineup tasks and publish_artifact (the whole roster). E-1.

P2. `TaskVisual`, added fields and one kind:
```ts
{ kind: 'msg'; …; members?: string[] }                        // E-20. Read from the thread; `count` = members that can be named + those that cannot (shown as "N more")
{ kind: 'goal'; …; current?: number | null; unit?: string; better?: 'up' | 'down' }   // E-10. current null = no rounds in the 90 days a goal is measured from
{ kind: 'note'; …; round?: { course: string | null; date: string | null; score: number | null } }   // E-14
{ kind: 'lineup'; seats: Array<{ slot; name; alternate; id?; role?: 'lineup'|'alternate'|'individual'; reasoning? }>;
  tournament?: { id: string; name: string; date: string; end: string | null };
  replaces?: Array<{ slot; name; alternate; id?; role? }>;    // E-21. The lineup saved when the card was made; [] = none. Absent on a lock card.
  locking?: boolean }                                          // E-22. A lock card: `seats` is what gets locked
{ kind: 'series'; title: string; dates: string[]; start: string; end: string | null; where: string | null }   // E-4, create_recurring_practice
```
`publish` (publish_practice_plan) gains `people?: Array<{ id?: string; name: string; role: 'player' | 'coach' }>` (complete,
players first) and `chatPost?: string | null` (the Team chat post word for word). E-19.

P3. Fact labels added (CAPABILITIES 0.7; an unknown label is already drawn as a plain row):
create_event `Notes`, `Will not get it`. create_recurring_practice `Ends`, `Description`, `Will not get it`; its
visual is now `series`. add_blocked_time: `When` carries both days. add_team_break `Days`, `Label`. save_team_term
`Time zone`, `Replaces` (always "Nothing…": the task only adds a term; a same-name or overlapping term gets no card).
create_trip `Flight`, `Hotel address`, `Hotel phone`, `Confirmation number`, `Notes`. create_qualifier `Ends`,
`Entry deadline`, `Description`, `Will not get it`. create_goal `Goal`, `Now`, `Better is` (and `Target` carries the
unit). create_focus_area and create_task `Details`. add_round_note `Round` ("Pine Hill · 2026-11-01 · 74").
set_availability_note `Replaces` is always present and read by the server. create_recruit `Email`, `Phone`, `Notes`.
create_drill `Kind`. set_lineup `Tournament`, `Lineup` (one seat a line), `Replaces`, `Reasoning`. lock_lineup
`Tournament`, `Lineup`, `What locking does`, `Undo`. send_message `To (n)`. publish_practice_plan `To (n)`,
`Will not get it`, `Filed in`, `Team chat`; `What they get` is "<title>\n<the first person's body>".

P4. `ActionReceipt`, added:
```ts
href?: string;                                   // the thing itself = created[0].href (E-12): now set for every task
missed?: Array<{ name: string; reason: string }>;   // people on the card the send did not reach, by name (E-23 shape)
notifications[].to?: string[];                   // who it went to, by name
```
`notifications[].status` is `queued` for notices the app's action hands off after it answers (nothing checks them),
`sent` only where the write itself is the delivery (a message, a goal's in-app row). A receipt is `partial` when the
write landed but not all of it did (an event whose invitations failed; a plan whose Team chat post failed, or whose
told-count is not the card's), with the lines in `partial_failures`.
`created[].id`: now also for a break, a term and a drill (the row's id is the card's request id), a goal, a trip, a
document, a qualifier, a message, and the tournament / round / plan a task changed.

P5. A card that is no longer true. `commit` looks for its own row first (an earlier run of the same card is `completed`,
never stale), then checks the world against the card, then writes. A stale card answers
`{ status: 'failed', error: 'card_out_of_date', retryable: false, summary: <one sentence ending in "Ask for it again." or the like> }`
and calls no action. ENGINE passes the summary to the model as `Failed. <summary>`; the UI should NOT offer Try again
for `error === 'card_out_of_date'` (SPEC's "no Try again" reminder case). When the check itself could not be made:
`error: 'card_not_checked'`, `retryable: true`, or (when the first look also failed) the existing "I could not check
whether anything was saved: look in <place>" receipt. What is checked: every named player is still on the roster and
still has (or still lacks) an account; a whole-team announcement's roster gained nobody; the tournament's version and
seats (set_lineup, lock_lineup); the thread's members (send_message); the plan's version, title, time, place, people,
each person's words and the Team chat post (publish_practice_plan); the note on the round; the saved availability note.

P6. Inputs that were the model's numbers and words are gone from the tool schemas (strict, smaller prefix):
`send_message` is `{ conversation_id, content }`; `publish_practice_plan` is `{ plan_id, version, team_chat }`;
`set_lineup` has no `version` (the server reads it and the write carries the one the card read);
`set_availability_note` has no `existing`; `publish_artifact` has no `players`. A stored conversation that holds an
old call replays fine (history is not re-validated). A PROPOSAL stored before 11 Nov for a task whose card now holds
what the server read (`input.seen`: create_event, create_qualifier, create_goal, set_lineup, lock_lineup, send_message,
publish_practice_plan, add_round_note, set_availability_note, save_team_term) is not run when confirmed after the
deploy: it answers `card_out_of_date` with "This card was made before an update to the app … Ask for it again." and
writes nothing. The four planned tasks (focus area, task, announcement, repeating practice) still run an old card.

P7. For ENGINE, on E-25 and E-27 (yours; PLANS built neither):
- E-27: PLANS's tasks never return `cancelled`; `staleReceipt` is `failed`. The engine's `undoneReceipt` is the only
  source of `cancelled`.
- E-25: nothing in a task or reader marks a computed answer. `summarise_data` is still the server's arithmetic over
  rows already read and is an ordinary read with its own evidence chip.
- E-26 is built: `ToolEnvelope.coverage` may now be `'not_tracked'` (the envelope only; a measurement's coverage is
  unchanged), with `coverage_note` and `nearest?: string[]`. `get_reference` topic `golf` answers it when `about`
  names something the data map says is not recorded (`../not-tracked.ts`, held to the metric catalogue by a test).
  It is a read with an evidence chip, zero measurements, and `model_text` that tells the model to say so first. The
  thread can draw D16's row from `coverage === 'not_tracked'`: `summary` ("Not tracked: Which club was hit."),
  `nearest`. `loop.ts` treats `unavailable` specially (text, not a search result); `not_tracked` goes the ordinary
  way and may be cited, which is right: it is a fact about the app.

P8. Words. `../card-truth.ts` calls `generatePushPayload` for every push it quotes. Bell rows and the practice plan's
notices live inside senders that cannot be called without sending, so they are repeated there and
`../__tests__/card-words.test.ts` reads each sender's source and fails when it changes. Not quoted, and said so in
`delivery.note`: emails (templates), and create_event's bell row (two writers race for it in `after()`:
"You're invited: …" from `sendEventInvitations` and "New event: …" from `fanOutEventInvitation`; whichever lands
first stays). The clean fix for all of these is CONTEXT's C5.2: move each formatter into `src/lib` and have the
action import it.

P9. Request ids (the actions TOOLS listed as taking none). Done, additive and tested
(`src/app/golf/actions/__tests__/request-id-drill-break-term.test.ts`): `createTeamDrill({ …, requestId })`,
`addTeamBreak({ …, requestId })`, `saveTeamTerm({ …, requestId })` (new term only); the id is the row's primary key and
a repeat answers with the first row, checked against the team. `createRecurringEvent` already took one and
`create_recurring_practice` now passes it (the look is by the series' id). Still on the natural-key look, in order of
worth: `createGolfTravelItinerary`, `createGoal`, `saveTextDocument`, `createGolfQualifier`, `createFocusArea`,
`createTask` and `createEnrichedAnnouncement` (these two already refuse a same-request repeat inside two minutes
themselves). Each needs the same three lines (accept a UUID, insert it as `id`, on 23505 return the first row for
this team) and a test.

P10. For CONTEXT: E-23 is your `send_event_reminder`. The receipt shape is ready (`missed: [{ name, reason }]`,
`notifications[].to`); your commit knows `ids` and `sent` but not which ids were missed, because
`sendEventReminderToPlayers` returns a count. With `data.sentPlayerIds` from the action you can name them.


## 2026-11-11 (ENGINE): a model per surface, and the eval harness on the wire protocol

E20. **Model profiles** (`engine/model.ts`). `MODEL_PROFILES` holds one `ModelProfile` per model (`modelId`, `ledgerId`,
     `effort`, `features`); `SURFACE_MODEL` says which model a surface runs on; `profileFor(surface)` is the one
     lookup the route and the player turn use. Today: `ask`, `quick_chat`, `practice_helper` on Claude Sonnet 5.5
     (`claude-sonnet-5-5`, effort `medium`); `player` on Claude Haiku 5.5 (`claude-haiku-5-5`, effort `high`, exactly as
     before). Switching a surface is one line in `SURFACE_MODEL`. `CHAT_MODEL_OVERRIDE` (null) puts every surface on one
     model when set, for an eval run: set it, run, set it back. A player never gets `programmaticReads`, whichever
     model. Gone: `CHAT_MODEL_ID`, `CHAT_MODEL_LEDGER_ID`, `CHAT_EFFORT`, `CHAT_PRICING`; `CHAT_FEATURES` is the coach
     profile's features and `chatFeatures(surface)` the surface's. `llm/types.ts`: `MODEL_FOR_TASK.coach_chat` is
     `anthropic/claude-sonnet-5-5`, `PLAYER_CHAT_MODEL` is `anthropic/claude-haiku-5-5`.
     **`player_chat` is a constant, not a `ComposeTask`.** The ledger's `task` column has a CHECK that lists the four
     tasks, so a new task key needs a migration; a player's turn is still written `task: 'coach_chat'` with the Haiku
     id as its `model_id`. The same will hold for any other new ledger key (the suggestions call).
     **For PLANS and KNOWLEDGE**: the prompt header says it was written for Haiku at high effort. Nothing in it is wrong
     for Sonnet 5.5; it is simply read by both now, so a rule should not name the model.

E21. **What differs on Sonnet 5.5** (source: the `claude-api` skill's model-migration notes, section "Migrating to
     Claude Sonnet 5.5", and the installed SDK's types):
     - `thinking` is adaptive and never `disabled` (a 400 on this model); `tool_choice` is never forced (a 400); effort
       is `medium` (the model's default is `high`; `medium` is the documented starting point for multistep tool use).
     - `thinking.display: 'updates'` is ON (`progressNotes`, beta `thinking-display-updates-2026-08-18`). The model's
       thinking comes back as short progress updates; the loop sends each as a `note` event (the app's reducer already
       draws it as a progress row) and drops the API's "This part of the response was interrupted before it finished."
       sentinel. Full thinking is still never sent to the browser. Off for Haiku.
     - **Server-side refusal fallback is ON** (`refusalFallback`: `fallbacks: 'default'`, beta
       `server-side-fallback-2026-07-01`). When Sonnet 5.5 declines for one of the categories the API retries, the API
       answers with a substitute model in the same response. What the loop does with that response:
       a `fallback` content block marks the handover; text already streamed stays and the continuation is not started
       as a new paragraph; when the turn is echoed back, everything the declining model left before the LAST `fallback`
       block that the API will not accept again is dropped (`echoable()`: `thinking`, `redacted_thinking`, `tool_use`,
       and a `server_tool_use` without its result), and the tool calls the loop runs are the ones after it; usage is
       read per attempt from `usage.iterations` (the top-level `usage` covers only the last attempt), so a fallback
       attempt is billed at the substitute model's rates; the substitute's id is in the turn's log line
       (`fallbackModel`). If the substitute declines too, `stop_reason` is `refusal` and the turn is the same declined
       turn as before. Not verified against the live API: `fallbacks` together with the code tool
       (`programmaticReads`). If the API rejects the pair it is a 400, and the existing retry sends the call plain.
     - The reject-then-plain retry (`plainFeatures`) also drops `fallbacks` and the notes.

E22. **Cost** (`CHAT_RATES`, `ratesFor`, `callCostUsd`). Each attempt is priced at the rates of the model that ran
     it: Sonnet 5.5 and Sonnet 5 at $2 in / $10 out per million tokens, one rate card; Haiku 5.5 at $0.10 / $0.50 up to
     100K prompt tokens and $0.50 / $2.50 above (`onLongCard`). Cache multipliers are the same for both: read 0.1x
     input, 5-minute write 1.25x, 1-hour write 2x. **That makes a Sonnet 5.5 cache read $0.20 per million, as the
     migration notes give it; the lead's message said $0.10 (0.05x). One number in `CACHE_MULTIPLIERS`/`CHAT_RATES`
     if the price page says otherwise.** The ledger row's `model_id` is the profile's (the model asked for); the
     budget gate reserves 12,000 in and 2,500 out at that model's rates (about $0.049 a turn on Sonnet 5.5 against
     $0.0025 on Haiku 5.5), so a coach's daily budget buys about a twentieth of the turns the gate allowed on Haiku.

E23. **A conversation whose model changes** (a deploy that edits `SURFACE_MODEL`; a coach's three surfaces share one
     model, so moving between them changes nothing). History is still sent back exactly as stored. Sonnet 5.5 reads
     the thinking blocks Haiku 5.5 wrote, so Haiku to Sonnet replays whole. The other way, and for any block a model
     cannot verify, `drop_block` makes the API leave the block out instead of rejecting the request; the count is in
     the turn's log line (`calls[].dropped_thinking`) and nothing is rewritten in the store. Route test: "a
     conversation stored on Haiku continues on Sonnet". A conversation that holds code-tool blocks may not replay on
     the plain retry; that case is unchanged from E16.

E24. **The eval harness** (`scripts/coachhelm/ask-eval.mjs`, pure half `ask-eval-score.mjs`) now speaks the wire
     protocol. One POST per question, a new conversation each: `{ conversation_id: null, client_turn_id, surface:
     'ask', message }` as the coach, `{ client_turn_id, message }` as the player. It folds `ChatEvent`s the way
     `applyChatEvent` does (a `text_discard` drops the words since the last non-text part) and scores the answer with
     the read markers (` [e3]`) taken out. Verdicts are the engine's: `complete`, `card`, `declined` (from
     `data-turn-meta`), `failed`, `stopped`, `incomplete`; there is no "rejected", and the ledger's `verified` is
     reported beside the verdict as "figures matched". It asks the data questions and KNOWLEDGE's golf-sense
     questions (K6): golf sense, reads and writing are three columns, the writing rules are held against every answer,
     `tour_figure_from_memory` is skipped when the turn called `get_reference`, and a read the model's code made counts
     by the read's own name (the evidence part's `tool`). The compile of `golf-sense.json` is a plain-JavaScript copy
     of `knowledge/eval/index.ts` (a `.mjs` script cannot import it); `scripts/coachhelm/__tests__/ask-eval-score.test.ts`
     holds the two to the same questions, patterns, sentence count and everyday-word list, so **KNOWLEDGE: a change to
     `index.ts` fails that test until the copy follows.** The protocol carries no tool input, so a captured fixture's
     `tools[].input` is null. It is a dry run unless `--apply` is passed: the dry run reads staging (free), prints the
     plan and calls no model. `--max-usd` (default 25) stops the run before the ledger total can pass it; a 401 or a
     spent budget stops it at once; the report is written whatever stops it. Gone with the old audit: the citation
     and repair columns and `--server-log`.

## 2026-11-11 (KNOWLEDGE): the golf reference is served in plain words; one export for TOOLS; one gap in the harness

K7. `get_reference` (topic golf) now hands the model text with the shorthand written out and every pointer to the
    research document removed (`knowledge/reference-plain.ts`; the document itself is unchanged). The coverage note
    no longer explains shorthand: it says how to credit a figure (published research, or the publisher the text
    names) and never by chapter or section number. Size by topic, characters / 4, before and after: strokes_gained
    713 and 762, what_moves_score 761 and 825, college_golf 1,093 and 1,128, course_management 684 and 721,
    lies_and_conditions 738 and 784, holes_and_courses 391 and 481, pressure 417 and 427, improvement 392 and 407,
    sources 1,325 and 1,325. This is a read result, so the cached prefix is the same bytes as before.
K8. **TOOLS:** `stripSelfReferences(text)` is exported from `knowledge/reference-plain.ts`. Stored insights carry
    "Per Research doc §4" and "(Research doc §9)" in their bodies (the insight rules write it, for example
    `v3/composite/rules/pressure-decel-chain.ts:100`; the feed strips it at `golf/actions/insight-delivery.ts:1630`).
    A reader that returns an insight's stored text to the model (`get_coachhelm`) should pass the text through it,
    or the model will quote the phrase to a coach. It changes nothing else in the text: it tidies only at a cut.
K9. **ENGINE:** the harness does what K6 asks (the seven writing rules against every answer, the data questions
    included; `style.max_sentences`; writing as its own column and rule counts in the report). One gap: `stored.places`
    is the course names of the staging rounds only (`ask-eval.mjs:494`). Event and qualifier names are not in it, so
    "the fall invitational" for a stored "Fall Invitational" passes. Recommended: add the team's event and qualifier
    names from the same staging read to `places`.

## 2026-11-11 (PLANS): a card the coach can edit, `editable` and `revise` (for ENGINE to build the request path)

P11. The contract addition, built on TOOLS's side and waiting for ENGINE's request path and re-sealing.

On the proposal (`ActionProposal.editable?: EditableField[]`, type in `../card-types.ts`):
```ts
interface EditableField {
  key: string;      // the key an edit is sent under
  label: string;    // the label of the fact this field shows as on the card
  type: 'text' | 'long_text' | 'date' | 'time' | 'datetime' | 'number' | 'choice' | 'toggle' | 'people' | 'list';
  value: string | number | boolean | string[] | null;   // as it stands, in the shape an edit sends back
  required: boolean;                                    // true: it cannot be cleared
  options?: Array<{ value: string; label: string }>;    // choice: the allowed values. people: the roster (value = player id)
  max_length?: number; min_length?: number;             // text, long_text; list: per item
  min?: number; max?: number; step?: number;            // number
  min_items?: number; max_items?: number;               // people, list
}
```
date is `YYYY-MM-DD`, time is `HH:mm` (24 hour, team time), datetime an ISO instant. Types and limits are read from the
task's own zod schema, so a value the field accepts is a value the server accepts. Absent or `[]`: nothing on the card
is editable in place (`set_lineup`, `lock_lineup`; an older stored card).

On the task (every task from `taskTools()` has it; type `RevisableTask<I>` in `../tasks.ts`; please add the optional
member to `TaskTool` in `tool.ts` so CONTEXT's tasks can grow one too):
```ts
revise?: (ctx: ToolContext, proposal: P, edits: Record<string, unknown>) => Promise<P>;
```
- `edits` is `{ [EditableField.key]: value }` for the fields the coach changed only. `null` or `''` clears an optional
  field. A key the card did not offer is refused.
- It merges the edits into the stored input, validates the result with the tool's own schema, and runs the same
  planner as `plan`: the same reads (roster, accounts, thread, tournament, note), the same checks, the same card
  shape. It calls no model and writes nothing.
- It throws an `Error` whose message the coach can read ("Title: Too big…", "The end has to be after the start.",
  "Team cannot be changed on this card. Ask for it in words instead."). On a throw the card stays exactly as it was.
- The proposal it returns has the PLANNER's `idempotency_key` (an edit to a title changes it). ENGINE: keep the card's
  own key (the one `scopedKey` made for that `tool_use`), write the new proposal over the ledger row while it is still
  `proposed`, and seal it again. A card that is held, approved or done is not revisable: refuse before calling `revise`.
- Never editable, by construction: the coach, the team, and the thing a card is about (tournament, round, thread, plan,
  the player a goal, focus area or note belongs to, a goal's stat). `__tests__/registry-tasks.test.ts` holds every
  task to that list.
- What the model is told: nothing at the time of the edit. When the coach confirms, the tool_result already states
  what was committed (the receipt's summary), which is the edited card. If you want the model to know the card
  changed before Confirm, the new proposal's `summary` and `facts` are the words to give it.
- A whole-team task or team update that is edited becomes a card for exactly the people it lists (the `people` field
  holds them), so "everyone" is fixed at the people the coach saw.

## 2026-11-11 (ENGINE): a computed answer shows its work; an earlier card's ending on the next stream

E25. **An answer worked out in code says so** (the catalogue's E-25; all additive).
     - The code's progress row (`tool: 'code_execution'`) is labelled "Working out the figures". When a read the code
       calls shows a second player, the same row (same `id`) is sent once more as `read_started` with the label
       "Working it out across the team". It closes with that label and `detail: "14 reads"` (no detail when the code
       called none).
     - When the run ends, one part: `{ type: 'part', part: { type: 'data-computed', id: 'computed-<row id>', data } }`
       with `data: ChatComputed` (`engine/protocol.ts`, `COMPUTED_PART`):
       `refs: string[]` (the evidence refs of the reads the code called, in the order it asked for them),
       `reads: number`, `players: number` (different players those reads measured), `window: string | null` (the
       reads' own `window_label` when they all share one), `method?: string`. Stored with the turn and replayed on
       reload (`REPLAYABLE`). The reads themselves are the `data-evidence` parts with `via: 'code'`, as before.
     - Against the catalogue's proposed shape: `players`, `reads`, `window` are as written there; `refs` is added;
       `method` is optional; `table` is not sent. The code's printed output is free text the engine does not parse,
       and a table rebuilt from it would be a guess.
     - **`method` and PLANS**: the engine lifts one line and only one: a comment in the model's code that begins
       `# Method:`. It is dropped when it names a tool, holds anything that reads as code (an underscore, a bracket,
       a backtick, `=`), or runs past 240 characters. The model does not write that line today, so `method` is
       absent until the prompt asks for it. A sentence for `instructions.ts`, if you want the "How this was worked
       out" line: "When you calculate in code, begin the code with one comment line `# Method:` followed by one plain
       sentence a coach could read, saying what you did with which figures. No tool or field names in it."

E26. **How an earlier card ended is said on the next answer's stream.** `decision` already carried `message_id`; the
     part events (`evidence`, `visual`, `proposal`, `receipt`, `part`) now take an optional `message_id` too, and the
     engine uses it for `receipt`. At the start of a new message's response, for the assistant message just before
     it, the engine sends each card's recorded `decision` and each `data-action-receipt` as `receipt`, both with
     `message_id` naming that earlier message. That covers a Confirm whose connection dropped (the write went on in
     the request, the browser never heard) and, as before, a card withdrawn because the coach asked something else
     (`reason: 'superseded'`). A browser that already has them folds them again and nothing changes (parts upsert by
     id). The hook routes `decision` and `receipt` events that carry `message_id` to that message and does not treat
     them as the start of the new answer. Nothing is sent when the earlier message holds no card.

E27. **KNOWLEDGE's K9 is in the harness, narrowed.** `stored.places` is now the staging rounds' course names plus the
     names of the team's competitions: `golf_events.title` where `event_type` is tournament, qualifier or match,
     `golf_qualifiers.name` and `golf_tournaments.name`. Practices, meetings and travel are left out on purpose: they
     are titled in everyday words ("Practice"), and the rule would then fail the word "practice" wherever an answer
     used it. The dry run prints the names it will hold answers to.

## 2026-11-11 (PLANS): the studio's one list, for CAPABILITIES and the renderer

P12. `../visuals/studio-kinds.ts` exports `STUDIO_KINDS`: sixteen components (`figure`, `comparison`, `ranking`,
`trend`, `round`, `strokes_gained`, `distance_profile`, `schedule`, `qualifier_board`, `practice_plan`, `document`,
`app_link`, `note`, `action_preview`, `receipt`, `table`), each with what it draws and every schema kind it draws:
`block:<type>` (a resolved `show_visual` block), `scene:<kind>`, `part:<data-type>`, `read:<tool>`.
`studioKindOf('block:ranking')` answers `'ranking'`.
- Schema side, tested (`../visuals/__tests__/studio-kinds.test.ts`): every block `ResolvedBlock` can hold, every scene,
  every `data-…` part written anywhere in the chat library and every registered read is claimed by exactly one
  component, and the list names nothing that does not exist. `SHELL_PARTS` (`data-progress`, `data-turn-meta`,
  `data-turn-incomplete`, `data-allowance`) are the shell's; `CONTAINER_PARTS` (`data-visual-composition`,
  `data-visual-artifact`) only hold blocks and a scene.
- Component side (CAPABILITIES, `src/clubhouse/screens/coachhelm/chat/studio/**`): import `STUDIO_KINDS` and assert the
  registry's keys are exactly `STUDIO_KINDS.map((k) => k.kind)`, each with a full and a compact size. The list is in
  `src/lib`, which Clubhouse may import; `src/lib` never imports the registry.
- The set is CAPABILITIES's to decide. To merge, split or rename a component, change the list (or tell PLANS) and both
  tests move together. To drop a form: say which `block:` has no component worth its place and PLANS takes it out of
  what the model can ask `show_visual` for (the resolved type stays, so stored conversations still draw).
- `table`, the fallback: planned as `{ type: 'table', ref, metricIds? }` in the model's spec and
  `{ type: 'table', measurements: Measurement[] }` resolved (each row a measurement: who, what, the figure, the
  sample). It is in the list (`PLANNED_BLOCKS`) and NOT yet in `ResolvedBlock`, because `CoachComposition.tsx`'s
  switch is exhaustive and would not compile without its case. The renderer already has the parts
  (`FigureBlock` with `measurementTable`); when the case is in, PLANS adds the block to the schema and to
  `show_visual`'s description in one commit.
K10. **ENGINE, nothing to change:** `golf-sense.json` gained an eighth writing rule (`ascii_minus`: "-0.31" where the
    reads give "−0.31"), wider `heading_or_table` (a bold label at the start of a line or list item, as in the first
    live answer), `abbreviation` ("L10") and `sample_notation` (a bare count in brackets), and
    `style.max_sentences: 6` on the 27 questions that end in a yes/no question. The harness reads all of it from the
    file. `index.ts` is unchanged, so the copy test still holds (run: exit 0).
K11. **ENGINE, nothing to change:** a ninth writing rule, `numeric_date`, fails a date written as digits in an answer
    ("2026-05-18", "5/18/26"). It is in `global_forbid`, so the harness holds it against every answer from the file.

C11. (CONTEXT, 10 Nov, late.) Two more CONTEXT tasks, appended last, after `dismiss_signal`:
`log_focus_progress({ focus_area_id, value, note })` wraps `updateFocusAreaProgress` (a null `value` keeps the current
one when only a note is added) and `record_focus_outcome({ focus_area_id, outcome })` wraps `recordFocusAreaOutcome`.

- Neither sends anything. `recipients` is `[]`, `delivery` is null and `visible_note` carries what the player sees.
- **ENGINE: `record_focus_outcome` can return a `partial` receipt.** The app's action writes the focus area first and
  the signal it came from second, and reports the second failing. The receipt then has `status: 'partial'`,
  `partial_failures` with one sentence, and `created[0]` as usual. Confirming the same card again is safe: the look
  finds the signal half missing and runs the action again. Nothing new is asked of the contract.
- Team patterns are not a tool: a team pattern is computed at read time and has no row to act on, and the three
  pattern actions act on the older engine's stored patterns, which no chat read returns (`../tasks/INVENTORY.md`).
- In INVENTORY.md the heading C10 points to as "Asked for and not possible" is now "App gaps: three things a coach
  asks for that the app itself cannot do".
- Prefix after these two (characters / 4): Ask 21,870 with the tournaments flag off and 22,284 with it on; quick chat
  21,353 and 21,767. The stop line is 24,000 with the flag on.


## 2026-11-11 (ENGINE): a card the coach can edit (the request path for PLANS's `editable` and `revise`)

E28. **Editing a waiting card.** All additive; a browser that knows nothing of it behaves as before.
     - **Request**: `{ conversation_id, client_turn_id, decision: { key, edits, revision? } }`. `edits` is
       `{ [EditableField.key]: value }` for the fields the coach changed. A `decision` carries `approved` or `edits`,
       never both (400). At most 40 keys and 20,000 characters. It is not budget-gated: no model is called.
     - **What happens**: the engine reads the ledger row, checks this server's seal, calls the task's
       `revise(ctx, storedProposal, edits)`, gives the result the card's OWN key (`scopedKey`'s, not the planner's),
       sets `revision` (1 for the first edit, then 2, ...), seals it again and writes it over the row with one
       conditional update that only touches a row still `proposed` (`replaceProposal` in `../action-runs.ts`). The
       stored turn's card part is replaced in place and the turn goes on waiting. `proposed_input.input` (what the
       model asked for) is kept as asked. `TaskTool.revise?` is on the contract (`tool.ts`), so CONTEXT's tasks can
       have one.
     - **Response**: `message_start` (`resumed: true`, the message holding the card), the card as it now stands
       (`proposal`, part id `proposal-<key>`, so it replaces the one on screen), then one part
       `{ type: 'data-card-revision', id: 'revision-<key>', data: ChatCardRevision }`, then `done`.
       `ChatCardRevision` (`protocol.ts`): `{ key, accepted: boolean, kind?: 'invalid' | 'changed' | 'decided' |
       'fixed' | 'gone', reason?: string }`. `accepted: false` always comes with the card UNCHANGED and a `reason` the
       coach can read: `invalid` is the task's own sentence ("Title: ..."); `changed` the card was edited somewhere
       else; `decided` it is held, written, cancelled or withdrawn; `fixed` it offers nothing to edit (or the task has
       no `revise`); `gone` there is no such card. `done.status` is `awaiting_decision` unless the card turned out to
       be answered. The notice part is for the live thread only: it is not stored, so a reload shows no stale notice.
     - **`revision` and two tabs.** The card's proposal carries `revision` once edited (absent before). Every Confirm
       and every edit should send the `revision` of the card on screen (the hook does: `approve`, `deny`, `revise`).
       A Confirm or an edit whose `revision` is not the stored one (a missing one counts as 0) changes nothing and is
       answered with the stored card and `kind: 'changed'`. So a card edited in one tab cannot be confirmed from the
       stale copy in another, and an old tab cannot confirm an edited card at all. The same check runs again on the
       row as it was at the instant of the claim (`claimForExecution` now returns `proposed_input`); if an edit slipped
       in between the read and the claim, the claim is handed back (`releaseClaim`) and nothing is written. After the
       claim the plan cannot change: the plan that is committed is the claimed one.
     - **The hook**: `revise(approvalId, edits)` (optional in the result type for the same reason `phase` is:
       `src/clubhouse/preview/PreviewQuickChat.tsx` builds a result by hand).
     - **For the UI**: draw the notice from the `data-card-revision` part of the card's message; clear it when the
       coach edits again or a `decision` for the key arrives. `accepted: true` needs no notice.
     - **What the model is told**: nothing at the time of the edit. On Confirm the tool result states what was
       committed (the receipt's summary), which is the edited card (PLANS P11).

C12. (CONTEXT, 10 Nov, late.) Three CONTEXT cards can be edited before Confirm, on E28 and PLANS's `editable`:
`update_event` (`new_date`, `new_start`, `new_end`, `new_location`, `new_title`), `set_task_reminder` (`date`, `time`)
and `log_focus_progress` (`value`, `note`). Each has `revise` and puts `editable` on its proposal.

- These tools store what the write needs, not the model's input, so the input a card was planned from is kept beside
  it as `proposal.input.asked` and an edit is merged into that (`editing` in `../tasks/kit.ts`; `reviseInput` could
  not be used because these schemas are strict and take null, not an absent key). The merged input is held to the
  tool's own schema and `plan` runs again: the same reads, permission checks and refusals. It throws `EditRefused`
  (`../editable.ts`) with a sentence the coach can read.
- `update_event`'s fields show the event as it will be (the day, both times, the place, the title), not only what the
  model asked to change. A blank is null, which this tool reads as "leave that part as it is".
- Field kinds come from `editableFields`; the two 24-hour times are named `time` by the tool because their pattern is
  stricter than the one `editableFields` recognises. **PLANS: if you want that recognised in `editable.ts` instead,
  the pattern is `^([01]\d|2[0-3]):[0-5]\d$`.**
- The other nine CONTEXT cards offer nothing to edit (no `revise`), so E28 answers `fixed` for them.
- Nothing here is in the cached prefix: the sizes in C11 stand.

## 2026-11-11 (PLANS): the reads with no lines of their own are now read out in words

P13. Before this, only the Stats, Rounds, Round, Qualifiers and Tournaments readers set `model_text`; every other
read reached the model as the envelope's JSON, field names included (`avg_score`, `gir_pct`, `team_n`), which is the
notation the answer rules forbid it to repeat. Now:

- `plain(envelope, against?)` (`reader-kit.ts`) gives a read lines when it wrote none: each measurement as
  "Eli Brandt, strokes gained approach: −0.31 strokes against the Tour benchmark, over 9 rounds | Team average: …",
  then `detail` field by field with the field's name in words (`fieldWords`). A row leads with who or what it is
  about and ends with what a later call must be given exactly, in brackets: `[player <uuid>]`, `[event <uuid>]`,
  `[ref team:<uuid>]`, `[metric gir_pct]`. The app's own codes (`in_progress`, `sg_putting` under a status, kind,
  type, metric or similar field) become words; a band's and a metric's label go through `coachWords`.
- Stored words are not rewritten: a note, a reflection, a title, a description pass through exactly as stored.
- `together` builds its `model_text` from its parts (a part's own lines if it has them, otherwise `plain`), each
  under its label. `failed()` carries a sentence, so a refused or failed read is no longer JSON either.
- Used by: get_shots, get_schedule (coach and player), get_coachhelm (coach and player), get_practice,
  get_tournaments with notes, get_season with the comparison, and get_reference for metric_definitions, standards,
  course, documents and team_settings.
- Still JSON, on purpose: query_team_data and summarise_data (their field names are what the model passes back),
  get_reference data_dictionary (it is the list of those names), get_reference golf (KNOWLEDGE's text), and the
  notices (show_visual, the drafts). **ENGINE: nothing to change; `loop.ts` already prefers `model_text`.**
- **KNOWLEDGE**: the prompt can say that an id in square brackets at the end of a read's line is for the next call
  and is never written in an answer. I have not added that sentence; the size test leaves three tokens.
- Test: `__tests__/reader-words.test.ts` runs these readers over a team with rows in every table they read and fails
  on the same tokens as the hand-written lines, on JSON, and on any field name in the read sources that `fieldWords`
  would leave abbreviated.


## 2026-11-11 (ENGINE): several cards in one turn, and "approve all"

E29. **Several proposals in one turn.** One answer may ask for several tasks. Each is planned on its own, gets its own
     sealed ledger row and its own card (`proposal` then `decision_needed`, in the order the model asked), and is
     decided on its own: `decision: { key, approved }` for any of them, in any order. A decision that leaves another
     card waiting ends `done: awaiting_decision` and calls no model. When the last one is decided the model is asked
     for its closing words once, with every card's result in the order it asked. Nothing new was needed in the engine
     for this; it is now tested (`several cards in one turn`).
     - **"Approve all"**: `{ conversation_id, client_turn_id, approve_all: { cards: [{ key, revision? }] } }` (1 to
       20 cards, each once; not together with `message` or `decision`). The cards named that are still waiting are
       confirmed IN THE ORDER PROPOSED, whatever order the request lists them in. A card not named is not touched.
     - **The hold for a batch is one shared Undo window.** Every card that can be held is held until the same moment
       (the same `run_at` on every row, the same `held_until` on every receipt). Undo is still each card's own (the
       action route's Undo for its key); a screen that offers "Undo all" calls it for each key. When the window
       closes the batch is taken in one update (`takeHeldMany`), then written one card at a time. A card the coach
       undid is skipped and is not a failure (its receipt is `cancelled`). A task that writes on Confirm
       (`immediate`) has no window and is written in its turn.
     - **The first failure stops the batch.** A card that fails (it could not be started, could not be held, or its
       commit returned `failed`) ends the run: the cards after it are NOT run, their rows go back to `proposed`, and
       each is announced with a new event `{ type: 'decision_reopened', key, reason: 'batch_stopped' }`. The reducer
       puts that card back to waiting (`state: 'approval-requested'`, `approval: { id }`) and removes its held
       receipt. The turn then ends `awaiting_decision`, stored that way; the coach confirms or cancels the rest
       knowing what failed, and only then is the model told about all of them. A browser that does not know the
       event shows those cards as held until it reloads; the stored state is right.
     - **Nothing is confirmed over a stale card.** If any named card is not the revision the request says is on
       screen, no row is touched: the response is each such card as it stands with a `data-card-revision` part
       (`kind: 'changed'`) and `done: awaiting_decision`.
     - **Events of a batch**, in order: `message_start` (resumed), then for each card going ahead `decision` (approved)
       and its `receipt` (held), all before the window; after it each card's own `receipt` (completed, failed,
       cancelled) or `decision_reopened`; then the model's words if every card of the turn is now decided.
     - **Hook**: `approveAll(keys?)` (every waiting card in the thread when no keys are given). Card presses made
       while another card's request is still open (a Confirm stays open through its Undo window) are queued and sent
       one at a time in the order pressed; a repeat of the same press is sent once; after a failed request the queue
       is dropped. A press while an answer is streaming is ignored, as before.
     - **Limits, deliberately left**: (1) two decision requests open at the same time on one turn (two tabs) each
       store their own view of what still waits, so neither may ask the model for closing words; the next message
       settles it from the ledger (`settleAbandonedTask`) and tells the model then. Nothing is written twice. (2) At
       the instant the window closes, a card's own ring-end request (`commitHeldNow`) can take that one row before
       the batch does; that card is then written by that request, out of order, and the batch reports its result.
       (3) A batch holds one request open for the window plus every write; the route's limit is 120 seconds.

C13. (CONTEXT.) Three more CONTEXT cards take one edit before Confirm, the same way as C12: the `reason` on
`cancel_event` (the words players are sent are planned again from it), the `reason` on `set_goal_state` when the state
is `abandoned` (a pause or a resume offers nothing, so `editable` is absent there), and the `reasoning` on
`set_qualifier_coach_pick`. Six CONTEXT cards now have `revise`; `send_event_reminder`, `record_attendance`,
`set_focus_area_status`, `mark_signal_handled`, `dismiss_signal` and `record_focus_outcome` do not, and E28 answers
`fixed` for them.

C14. (CONTEXT, last of this tranche.) `send_event_reminder`'s card offers one field, `player_ids` (kind `people`,
label "To", options the active roster, value the players the card names). An edit means those players and nobody
else: `revise` plans again with `recipients: 'named'`, so the roster check, the staff check and the account check all
run on the new list. `recipients` itself is not a field. Its stored input now carries `asked` beside what the send
uses. Seven CONTEXT cards have `revise`.

`dismiss_signal`: the card gained the fact "Bringing it back", and `undo.after` says the same: only the Undo window
brings it back. `reactivateInsight` has one caller, the Undo beside a signal dismissed on the Clubhouse CoachHelm
board during that visit (`src/clubhouse/screens/coachhelm/parts.tsx`, local state); a dismissed signal is hidden from
every reader, so no screen can offer it again. A test reads those two files.

PLANS, for P10: please add `sentPlayerIds: string[]` to what `sendEventReminderToPlayers` returns (additive, beside the
count). With it the receipt's `missed` can name who the send did not reach; today the action returns a count and a
coach's session cannot read players' notification rows.


## 2026-11-11 (ENGINE): asking about a thing that was tapped

E30. **`about` on a new message.** Request: `{ ..., message, about: { evidence_ref, key } }`. `evidence_ref` is the
     `ref` of an evidence part of THIS conversation (`e3`); `key` names one element of that read:
     `metric:<metric_id>`, `metric:<metric_id>@<entity_id>`, `entity:<entity_id>`,
     `point:<metric_id>@<entity_id>#<at>` (the entity may be left out), `row:<id>` (a row of the read's `detail`
     whose `id` or any `*_id` field is `<id>`: a round, a qualifier, a tournament) and `row:hole:<n>`.
     - It is resolved in `engine/about.ts` against the reads the conversation has stored (`collectReads`) and nothing
       else. The model is told in one line of the turn's system message, after the date and the screen line, built
       only from the stored read: its summary and window, and the element's own labels, value and sample (a row: its
       scalar fields). The browser's `key` only chooses among stored elements; none of its text is passed on. Stored
       strings are flattened to one line and cut short.
     - **Ignored, never an error**: a reference that is not that shape, a read this conversation does not hold
       (another conversation's `e3` is not this one's), or an element the read does not have. The message is then
       answered as any other.
     - `message_start.about` is sent only when the request carried one: the reference accepted, or `null` when it was
       ignored. The hook keeps it as `message.metadata.about` and takes it as `send(text, { about })`; a retry of the
       question carries it again.
     - A player's Ask has no stored reads, so a reference there resolves to nothing.
     - **For the reviewer**: the reads this resolves against are stored in a column the coach can write
       (`ui_parts`), as the stored model messages are. So this line can carry text a coach put into their own stored
       read into a system message of their own conversation. It adds nothing to what editing `model_messages`
       already allows, and no check that matters (the Confirm, the seal, row-level security on every read) is the
       model's to waive.
     - **For CAPABILITIES and the UI**: a component that lets a thing be tapped sends the evidence part's `ref` and a
       key in one of the forms above. For anything not reachable that way, tell me what the element is and I add a
       form; do not send words.

## 2026-11-11 (PLANS): request ids on four more actions, and why three need none

P14. `createGolfTravelItinerary`, `createGolfQualifier`, `createGoal` and `saveTextDocument` take an optional
`requestId` (a uuid; it becomes the row's id). The same request sent twice answers with the first row: no second
trip, qualifier, goal or document, no second set of entries, no second notification, no second stored file. A row
with that id that belongs to another team (or another player, for a goal) is never returned: the call fails as a
plain insert failure would. Left out, the insert is what it was. `create_trip`, `create_qualifier`, `create_goal`
and `publish_artifact` pass the card's request id (`flowRequestId`); their content-based `written` look stays as
well, so a card first tried before this change is still found.

The other three were left alone because each already refuses its own repeat inside the action:
`createTask` and `createEnrichedAnnouncement` answer a same-content repeat within two minutes with the first row
("a retry after a lost response"), and `createFocusArea` refuses a second active focus area on the same metric for
the player. A focus area with no metric has no such guard; the card's own look (`written`) is what stops a repeat.

Not done: `npm run build` (not allowed on this laptop). The change adds an optional field to four existing server
actions and exports nothing new. Test: `src/app/golf/actions/__tests__/request-id-trip-qualifier-goal-document.test.ts`.


## 2026-11-11 (ENGINE): a draft shown as it is written

E31. **Drafts.** A tool says its input is a draft with one member on the contract (`ToolBase.draft`, so a read such as
     `show_visual` can have it as well as a task):
     ```ts
     draft?: { fields: readonly string[] };   // top-level input fields to show while the model writes them
     ```
     **PLANS: nothing is a draft until a tool says so.** Mark the tools whose input the coach should watch being
     written (the practice plan's blocks, a message's or an announcement's words) and list the fields. Only top-level
     fields; a field inside an object is shown when its object is complete.
     - **What is shown is always finished** (`engine/draft.ts`, tested at every cut of an input): a complete value is
       shown whole; a list still being written is its finished items, never half an item; words still being written
       stop at the last whole word, never half a word or half an escape; a number or an object appears when it is
       complete. A field is only ever shown growing.
     - **Events**: `{ type: 'draft_delta', id, tool, fields, open? }`. `id` is the tool call's id, the same for the
       whole draft. `fields` holds only the fields that changed since the last event, each with its WHOLE value so far
       (replace, do not append). `open` is the field being written now (null on the last one). At most one every
       150 ms (`DRAFT_INTERVAL_MS`) plus one when the input is complete; input that arrives all at once is shown once.
       Then `{ type: 'draft_done', id, state: 'done' | 'failed' }`, exactly once per draft that was shown.
     - **`done`** is sent just before what the draft became: a task's `proposal` (after the input passed the tool's
       schema and the planner), or a read's result. **`failed`**: the schema did not accept the input, the planner
       refused it, the model was cut off at its length limit mid-input, the call was retried or declined, or a
       fallback dropped it. Nothing shown as a draft has been validated; a card can only come from a complete input
       that passed `input` and `plan`, exactly as before.
     - **Reducer**: a part `{ type: 'data-draft', id: 'draft-<id>', data: ChatDraft }` with
       `ChatDraft = { tool, fields, open, state: 'writing' | 'failed' }`, fields merged across events. On `done` the
       part is removed (the card or the read takes its place in the same flush); on `failed` it stays with
       `state: 'failed'`. It is not replayed on reload.
     - A call made by the model's code is never a draft (the code writes no input the coach could watch).


## 2026-11-11 (ENGINE): the steps of a turn, for the activity island

E32. **Steps.** Built to the shape in `docs/clubhouse/coachhelm-chat-v3/SPEC.md`, Requests 8: the fields are on the
     `data-progress` part, typed as `ChatStep` in `protocol.ts`. Everything is optional and additive; a row stored
     before a field existed still draws, and a browser that knows none of it sees the same two events as before.
     - **Events.** `read_started` and `read_finished` carry the step's facts; a new `step_update { id, label?, ... }`
       carries a running step's news (only the fields that changed; `subjects` whole). The facts:
       `state` (`read_started`: `'active'`, or `'waiting'` for a step really queued; `read_finished`: `done` /
       `failed`), `kind`, `parent_id`, `subjects`, `count`, `covers`, `evidence_ref`, `started_at`, `ended_at`, `seq`,
       and `done_label` on `read_finished`. The reducer keeps what a step said while it ran on its finished row.
     - **`seq`**: the turn's sequence number, on every step event (`read_started`, `step_update`, `read_finished`,
       `note`). It starts at 1 and rises by one per event, in the order sent; a request that continues a turn (a
       decision) counts on from the stored rows. Each state change of a step is sent exactly once: one start, one
       finish. (The code step's rename is now a `step_update`, not a second `read_started`.)
     - **`kind`**: `'read' | 'find' | 'compare' | 'calculate' | 'visual' | 'draft' | 'check'`. The engine sends `read`
       for a read, `draft` for a task being planned and `calculate` for the model's code. **PLANS/CONTEXT: a tool sets
       its own with `ToolBase.step`** (`find_in_app`: `'find'`; `show_visual`: `'visual'`; `summarise_data`:
       `'calculate'` or `'compare'`; a task that checks recipients: `'check'`). It only chooses the mark.
     - **`subjects`**: `[{ kind, id, label }]`, at most 12, in the order they became known. A player is sent only if
       they are on the caller's own roster and is named from that roster, never from what a read called them; the
       team only if it is the caller's; a round (coach only) as the read named it. A signed-in player's roster is
       themselves, so their steps name only them. Known from the tool's input (`player_id`, `player_ids`) when the
       step starts, and from what the read measured when it ends.
     - **`count`** `{ n, unit, more }`: on a finished read, what it counted (its first figure's sample: 38 rounds),
       `more: false`. On the code step while it runs, the reads it has made so far (`unit: 'reads'`, `more: true`),
       re-sent at most every 250 ms (`STEP_UPDATE_INTERVAL_MS`), then the final tally. **`covers`** `{ n, of, unit }`:
       on the code step, how many of the roster's players its reads have measured ("9 of 12 players").
     - **`evidence_ref`** on `read_finished`: the read it produced. Its `evidence` event is always sent BEFORE the
       `read_finished`, so the step can be opened the moment it says done, while the rest of the turn goes on.
       **`parent_id`**: a read the model's code called names the code's step.
     - **`started_at` / `ended_at`**: clock readings (ISO). Nothing is estimated and no percentage exists.
     - **`waiting` is in the type and the reducer and the engine never sends it today.** A message's tool calls are
       run side by side, so nothing queues: a step is known and started in the same instant. It will be sent the day
       something really waits its turn. Nothing is announced that is not already running.
     - **The turn's work**: `done.work = { steps, working_ms }`, and the same two in `data-turn-meta` (`steps`,
       `working_ms`) for a reload. `steps` counts the turn's rows that are work (not notes), over every request that
       worked on the turn. `working_ms` is the time at least one step was running (overlapping steps are not added
       up), so it is less than `duration_ms`, which also holds the model's own time and any wait on the coach.
     - **Stored and reloaded.** The steps are the turn's stored `data-progress` rows: what the browser folds from the
       stream equals what is stored, row for row (tested). `restoreUIMessages(rows, { steps: true })` keeps them on a
       reload; the default still drops them, because a thread that draws rows positionally (Fairway's) would redraw
       old turns' rows. **Clubhouse's loader (`src/clubhouse/data/coachhelm-chat.ts:113`) should pass
       `{ steps: true }`** for "open an earlier turn's steps"; that file is not mine.
     - **A bug this found and fixed**: a request that continued a turn restarted its row ids at `progress-1`, so its
       first step REPLACED the turn's first stored step. A continued turn now numbers its rows on from the stored
       ones (`lastRowNumberOf`).
     - Steps are events beside the text: nothing waits on them and no text passes through them.

## 2026-11-11 (PLANS): the studio's agreed set, dates in words, stored reads without template text, drafts

P15. **The studio set (for CAPABILITIES and UX).** `STUDIO_KINDS` is now the sixteen CAPABILITIES named, in registry
order: figure, comparison, ranking, trend, round, strokes_gained, distance_profile, schedule, qualifier_board,
practice_plan, document, app_link, note, on_record, action, table.
- `action` draws `data-action-proposal`, `data-action-receipt`, `data-handoff` and `data-card-revision` (one object
  from proposed to saved or undone). `document` keeps `data-artifact`. `on_record` draws `get_coachhelm`. `note` keeps
  `block:note` (stored conversations only), `data-coach-note` and `get_reference`. `table` also claims ENGINE's
  `data-computed`.
- Shell parts, no component: `data-progress`, `data-turn-meta`, `data-turn-incomplete`, `data-allowance`, and two I
  placed there without being told, so say if they belong elsewhere: `data-draft` and `data-suggestions`.
- The schema test now also finds parts named as constants (`X_PART = 'data-…'`), which is how ENGINE writes them.
- `show_visual` no longer offers `note` or `headline` (a kpis of one figure is the large single figure). The strict
  schema still resolves both, so stored conversations draw. Nine blocks and `sg_anatomy` remain.
- `table` is still planned only: `ResolvedBlock` gets `{ type: 'table', measurements }` in the same change that gives
  `chat/visual/CoachComposition.tsx` its case (UX's file; asked).

P16. **Edit mode, the two questions CAPABILITIES asked.**
- A `people` field's `options` are always the session's whole active roster, in the order the session holds it; its
  `value` is the ids the card names. Sort by label on your side if you want it alphabetical.
- A field's `label` is the fact's label exactly where the card has a fact for that one field (an event's `Type`,
  `Where`, `Notes`, `Invited`, `Replies`; a trip's `Leaves`, `Back`). Where one fact holds several fields (an event's
  `When` is the day and both times) only the day carries the fact's label and the times are `Starts` and `Ends`, with
  no fact of their own. A field the task gave no label is its own name in words. So the "Edit" list under the subject
  is the right place for anything without a matching fact.
- Fact values still carry days as stamps (`2026-11-12`). I left them so one formatter on the card side decides how a
  card writes a day; the lead is asked to pick one form for cards and answers (cards "Thu, Nov 12", answers "18 May").

P17. **Dates in what the model reads.** Every reader's `model_text` and `summary` say a day as "18 May" (the year only
outside this season, 1 August to 31 July) and an instant as "Thursday 12 November, 3:00 pm" on the team's clock
(`dayWords`, `instantWords`, `datesInWords`, `wordsFor(ctx)` in `reader-kit.ts`). An instant with no clock to read it
on is left as it came. A date inside stored words (a note) is left as written. `detail` and `measurements` keep their
stamps: components and `summarise_data` read those. The prompt has the matching rule, and both sweep tests fail a stamp.

P18. **Stored reads (`get_coachhelm`).** `stored-text.ts`: a stored insight's words are handed over without the
research pointer, the placeholder cause ("… is off its benchmark. Likely cause inferred from the aggregate …", both
stored spellings) and the fallback action ("Target … in the next practice block"). Signals now carry what was
measured: `metric_label`, `value_display`, `comparison_label`, `comparison_value`, `sample_size`, `window_end`.
A cause whose text is only the placeholder has `text: null`. No insight rule and no stored row was changed.

P19. **Drafts (ENGINE E31).** Marked: `write_artifact` (title, body), `draft_message` (content),
`draft_practice_plan` (title, blocks), `publish_artifact` (title, body), `create_team_announcement` (title, body),
and `send_message` (content) for when it is registered.

P20. **For UX and QUICK-CHAT, said again in one place.** A receipt with `error: 'card_out_of_date'` is never
retryable: show its sentence, no "Try again", and offer "Ask again", which sends the coach's original request as a
new turn (the world changed, so the card must be planned again). `error: 'card_not_checked'` with `retryable: true`
may be tried again as it is. A published practice plan's address is `/golf/dashboard/practice/plan/<id>`.

P21. **The qualifier card** now says `visible_to: 'team'`: the read rule lets any coach or player of the team see a
qualifier, though a player's own list shows only the ones they are in. The card's note says both.

P22. **Not added: the `# Method:` line (E25).** It fits (Ask's own tools and rules would be about 12,116 against the
12,150 brake) and waits on the lead's yes.

## 2026-11-11 (PLANS): what three reads hold, for the studio's adapters (CAPABILITIES E-31, E-34)

P23. The shapes below are each read's `detail` as it is today; CAPABILITIES writes the adapter. Days and instants in
`detail` are stamps (`2026-11-12`, `2026-11-12T20:00:00Z`); only `summary` and `model_text` say them in words.

- `get_schedule` (coach): one part gives `detail` directly; with `include`, `detail` is keyed by part and the
  calendar is `detail.events`. The calendar part is
  `{ zone, from, to, events: [{ id, title, event_type, start_time, end_time, location, status, href, replies?, in_class? }] }`.
  `replies` is there only when the event asks for them and they could be read:
  `{ accepted, maybe, declined, pending, checked_in }` (counts). `in_class` is the names of players with a class
  during the event, absent when class times could not be read. Events are not grouped by day: group on `start_time`
  in `zone`. A player's `get_schedule` is `{ timezone, events: [{ event_id, title, event_type, starts_at, ends_at,
  location, requires_rsvp, rsvp_deadline, my_rsvp }] }` with no `href`.
- `get_qualifiers` with one qualifier:
  `{ qualifier_id, href, name, status, selection, rounds_planned, squad, coach_picks, entrants, standings: [{ position,
  player_id, player, rounds, total, to_par, avg_score, fewer_rounds_than_leaders, rounds_not_18_holes, state, selected,
  reason }], no_score_yet: [name] }`. `position` is a string ("T3") or null; the read holds `squad` and `coach_picks`
  but does not say where the board draws its cut, so take that from the board's own rule and not from me; per-round
  scores are not in it (`rounds` is how many were played), so `StudioBoardRow.rounds` cannot be filled
  from this read yet. Say if you want them and I add `round_scores` beside `rounds`. The list form is
  `{ qualifiers: [{ qualifier_id, href, name, status, start_date, end_date, course, rounds_planned, squad, coach_picks,
  entrants, cards_in, leaders }] }`.
- `get_round`: `{ player_id, kind: 'hole_strip', round: { round_id, href?, date, course, type, holes_played, total,
  to_par, front, back, putts, fairways, greens, strokes_gained }, holes: [{ hole_number, par, score, putts,
  penalty_strokes, gir }], tallies, recap, player_note, coach_note }`. `href` is there for a coach only.
  `get_rounds` rows are `{ round_id, href, date, player, player_id, course, type, holes, score, to_par, putts }`.
- Addresses: an event `/golf/dashboard/calendar?event=<id>`, a round `/golf/dashboard/rounds/<id>`, a qualifier
  `/golf/dashboard/qualifiers/<id>`. A player row carries `player_id` and no address: the player page's address is
  yours. `href` is never read out to the model.

E33. **A rejected request, and `strict` as a budget (11 Nov 2026, after the first live run).** Every live request had
been rejected (HTTP 400) and answered only by the plain retry, so no optional feature had ever run. Cause found
without a live call: every tool was sent `strict: true`, and the API limits strict use per REQUEST (structured
outputs, "Schema complexity limits": 20 strict tools, 24 optional parameters, 16 parameters with a union type, summed
over all strict tools). A coach's request held 33 strict tools and 72 unions; a player's 10 and 56.
- `strictToolNames(tools, features)` chooses the strict tools within the three limits: tasks before reads, each in
  the registry's order, a tool that would pass a limit is skipped and the next is tried. `modelToolsFor` builds the
  list; `modelToolFor(tool, features, strict?)` is one tool. Same list and features, same names (the tools are cached
  bytes). Today that is 20 of a coach's 33 direct-only tools and 8 of a player's 10 reads.
- **PLANS / CONTEXT:** the order of the registry is now the order of priority for `strict`. `strict-input.ts` shows
  every optional field as required-and-nullable, which costs a union each (16 a request). An optional field left
  optional costs from the other limit (24). Using both would let about 40 optional fields be strict in one request
  instead of 16; say if you want the engine to count differently. Nothing else changes for a tool: the engine's zod
  check runs on every input, strict or not.
- **The ladder.** `FEATURE_GROUPS`, in the order they are given up: `progress_notes`, `refusal_fallback`,
  `task_budget`, `strict_tools`, `compaction`, `programmatic_reads`, `thinking_binding`. On a 400 the loop drops the
  group the API's message names when it names exactly one the request carries (`groupToDrop`), otherwise the next in
  order, and sends the call again; at most one request per group. A 400 with the API's `error_code` (account,
  billing, key) is not retried. `plainFeatures` is every group off.
- **Where a drop is recorded.** `LoopState.dropped` (group, status, type, code, message); `TurnSummary.featuresDropped`
  and `degraded`; the `usage` event's `features_dropped` (names only: the API's words never go to a browser); the log
  line `v3.chat.stream.degraded`, whose MESSAGE holds the status, type and the API's words, because off production
  the logger prints the message and no `extra`; the turn's log line; the ledger row's `citations.features_dropped`.
- **The eval.** A turn with `features_dropped` is `degraded`, never `complete`, and is never counted right.
  `--require-features` stops the run at the first one (exit 1, after its cost is read); `--server-log <file>` puts the
  API's reason in the question's run note.
- **Not verifiable without a live call, in the order I would suspect them next:** (1) a strict tool in the same
  request as the code tool: the programmatic-calling page says "Tools with `strict: true` are not supported with
  programmatic calling", which I read as per tool (ours are never both) but may be per request; (2)
  `fallbacks: 'default'` on a request that also carries a `role: 'system'` message and `display: 'updates'`, neither
  of which the substitute model (Claude Sonnet 5) accepts as a direct request; (3) `strict` beside
  `eager_input_streaming` on one tool. Each would show as one named drop in the log, and the turn would still answer.
- **The player's ledger row** was never written: the insert named a `grounded` column that does not exist and left
  out `prompt_hash` and `verified` (both NOT NULL). It is now the same row a coach's turn writes
  (`buildChatLlmCallRow` with `coachId: null, playerId`), keyed by the turn's own id; a ledger that refuses it is
  logged once per process.

E34. **After the first live run: the close listeners, the cost of the first turn, the two held migrations (11 Nov 2026).**
- **`MaxListenersExceededWarning: 11 close listeners added to [ServerResponse]`.** Not the chat code. The chat never
  sees the response: the only thing it listens to is the request's abort signal, one listener a request, removed when
  the turn ends (`engine/turn.ts`; pinned by "what a turn hangs on the request" in the route suite: one listener for
  nine model calls, for a rejected-and-retried call, and for a request the browser left). The `close` listeners on a
  dev response are each added once per response: Next 16.3.8's dev stack adds about seven (`router-server.js:262`,
  `:358`, `next-dev-server.js:389`, the route template's `signalFromNodeResponse`, `pipe-readable.js` twice), `after()`
  two (`after-context.js:35`, `:126`, however many times `after()` is called), and Sentry's http integration three or
  four (`@sentry/core` `server-subscription.js:88`, `:240`, `record-request-session.js:17`, `@sentry/node-core`
  `httpServerSpansIntegration.js:106`). That is past Node's default of ten on any streaming route handler that calls
  `after()` under `next dev` with Sentry on. Node prints the warning once per emitter, at the eleventh, so "11" is not a
  count that grows. Nothing to fix here; read from the installed sources, not measured on a running server.
- **The first coach turn's $0.274.** The staging ledger row: 68,373 prompt tokens, 473 output tokens. Output is $0.005.
  The input is billed at $3.95 a million tokens on average, which is the one-hour cache-write rate ($4): nearly every
  prompt token of the turn was a cache WRITE. Two calls of about 33,000 prompt tokens each wrote the prefix twice. That
  only fits one sequence: the FIRST request, with every feature on, was accepted and wrote the prefix (about $0.13);
  the SECOND request (the one that carries the read's result) was rejected; its plain retry has different tool
  definitions, so it could read nothing of the first write and wrote the whole prefix again (about $0.13, plus the read's
  result). A rejected request returns no usage and is not billed. The third turn ($0.033, 71,307 prompt tokens) read
  both prefixes from the cache. So the rejection doubled the first turn's cost, and what the API objects to is
  something only the second request of a turn carries: a `tool_result` holding a `search_result` block with citations on
  (beside strict tools), the echoed assistant turn's thinking blocks, or, on a coach surface, the code tool's container.
  This is an inference from totals (the per-call split is logged only in production); the next run's log line names it.
  The `usage` event now also carries `cache_creation_input_tokens`, and the eval report prints each turn's prompt,
  cache-read, cache-written and output tokens, so a cost can be split without the ledger.
- **`20261110120000` and `20261110130000`.** Neither holds its own `BEGIN`/`COMMIT` any more (`db:apply` runs the file
  and its ledger row in one transaction; `SET lock_timeout`, as `20261107090400` does). `20261110120000` no longer
  counts the table's policies in its VERIFY or its pgTAP (the held `20261101090200` adds four to the same table): both
  assert that `chat_messages_coach_only` is still there, FOR ALL. Not run here (pgTAP runs in CI). The other held Ask
  migrations (`20261101090000`, `20261101090200`) also hold their own `BEGIN`/`COMMIT`; they are not this worker's.

E35. **Steps, reconciled with the coordinator's contract (11 Nov 2026).** The wire stays as built in E32
(`read_started`, `step_update`, `read_finished` folding into one `data-progress` part per step id): the island reads
the part, not the event name, and the part carries every field of the contract's single `step` event (id, parent_id,
kind, state, label, done_label, detail, subjects, count, covers, evidence_ref, started_at, ended_at, tool). What this
adds, to meet the contract's rules:
- **A tool declares its own step** (`ToolBase.step`, `engine/tool.ts`): a kind on its own, or a `StepDescriptor`:
  `{ kind?, doneLabel?(input, result), subjects?(input, ctx) }`. The engine never infers a kind from a name and never
  rewords a label. **PLANS / CONTEXT, yours to fill in:** no registered tool declares anything yet (every step is
  `read` or `draft` and no finished row has its own wording). `doneLabel` is the past-tense row ("Read Eli's last 8
  rounds"); `result` is the read's envelope, or null for a task. `subjects` is for what the engine cannot see: an
  event, a qualifier, a tournament, a plan, a document, each as `{ kind, id, label, avatar_url? }`.
- **`done_label` is sent only when the tool declared one** (and on the engine's own code step: "Worked out the
  figures", "Worked it out across the team"). chat-ux: when it is absent the row has only `label`; `pastOf()` on the
  screen is then your fallback, and it can go once every tool declares its own.
- **Subjects.** The engine still names the players in `player_id` / `player_ids` and the players, team and rounds a
  read's figures are about. A declared subject is checked: a player only if on the caller's roster, named as the
  roster names them; a team only if the caller's; a thing as the tool gives it. On a player's turn only the player
  themself is ever sent, whatever a tool declares. `avatar_url` is passed on only from a tool's declaration and only
  as an https or app address; the engine looks none up (the roster in a chat context holds no face).
- **`subjects_more`**: a step sends at most twelve subjects and, when there are more, how many more. A new optional
  field on the part and on the three events.
- **Not sent, because it would not be true:** `count` while a read is running (no read is incremental; the count
  arrives with `done`), and `waiting` (nothing is queued: tool calls of one response start together).
- **Words.** `engine/__tests__/step-words.test.ts` sweeps every registered tool's running label and declared finished
  label for the writing rules (full words, no notation, no tool or column name, no trailing full stop).

E36. **Suggestions (D4, 11 Nov 2026).**
- **Wire.** `{ type: 'suggestions'; items: Array<{ label; prompt; kind: 'read' | 'compare' | 'action' }> }`. It is the
  one event that may come AFTER `done`, a second or two later, and only on a coach's turn that completed with an
  answer (never `awaiting_decision`, failed, stopped or declined; never a player). An empty list withdraws them.
  Stored and restored as the part `{ type: 'data-suggestions', id: 'suggestions', data: { items } }`, last in the
  message; a retried turn that already has its answer is sent them again from the store. `suggestionsOf(parts)` reads
  them.
- **For chat-ux and the quick chat.** `useCoachHelmChat().suggestions` is the last answer's, and only while it is the
  last thing in the thread and nothing is being asked; it is `[]` otherwise. `status` is already `ready` when they
  arrive, so draw them as something that appears under a finished answer, not as part of the wait. Tapping one is
  `send(suggestion.prompt)` and nothing else. `kind` is for the chip's mark: an `action` suggestion still leads to a
  card the coach confirms. Earlier answers keep their stored part; do not draw it.
- **The checks** (`checkSuggestions`): an `action` must name, in a field the browser never sees, one of the task tools
  in THIS caller's tool list; nothing matching the never-list (from `tasks/INVENTORY.md`, "Left to the app on
  purpose"); no tool or snake_case name in the words; label 3 to 60 characters, prompt 8 to 300; no duplicates; at most
  four; fewer than two is none. A suggestion that fails is dropped, never repaired. **PLANS:** the never-list here is a
  pattern over the words, written from INVENTORY.md; if that list changes, `NEVER` in `engine/suggestions.ts` should.
- **The call.** `suggestionsModel()` is the player profile's model whatever the surface's own; `output_config:
  { effort: 'low', format: json_schema }`, `max_tokens` 2000, no tools, no betas, the question and the answer as data
  in one user message. It is not a feature group: it is its own request, made after the turn is stored, so nothing of
  the turn can fail with it. `SUGGESTIONS_TIMEOUT_MS` 8000. Not verified against the live API.
- **Cost.** `TurnDeps.onSuggested({ usage, kept, failed })`; the route writes a ledger row `task: 'chat_suggestions'`
  (`verified`: at least two were shown) and counts the spend under the same key. `chat/ledger.ts`
  (`writeChatLedgerRow`) tries a row under its own key and, where the CHECK refuses it (23514), remembers that for the
  process and uses the fallback: `coach_chat` for a player's turn, no row for suggestions. Held migration
  `20261111090000_coachhelm_llm_calls_chat_tasks.sql` (rollback, pgTAP and the declarative schema with it; not
  applied, not run).
- **The eval.** A coach question now costs one more small call (about $0.0002) and its response stays open a moment
  longer; the report's time is the turn's own duration and its "figures matched" comes from the answer's row.
- **The hook.** `done` now ends the turn for the coach (status, the in-flight guard, the next queued card) while the
  rest of the response is still read; a new question, Stop, a new chat or leaving the page ends that read. A
  connection lost after `done` is not a failure.

