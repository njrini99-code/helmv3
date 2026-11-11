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

E8. Programmatic tool calling is built behind `CHAT_FEATURES.programmaticReads`, OFF. With it on: the
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
