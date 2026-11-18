# CoachHelm analyst, stage 3: the written read, checked by code

The analyst's shape is: code measures, a model judges and writes, code checks the model. The fact sheet and
notability (`../`) are the measuring. This folder is the writing and the checking. A model writes each read's "why"
and "what to do". Code then reads every word, and a draft it cannot match to the counted facts is thrown away. After
a second failure there is no paragraph and the stage 1 card stands. There is never a template stand-in.

Not wired. Nothing here runs in the app yet, nothing calls the API in a test, and nothing reads or writes a database
(the caller hands in the sheet and the notability).

| File | What it is |
| --- | --- |
| `types.ts` | `WrittenRead` (the saved block), `WriterInput`, `WriterDeps`, `WriteResult`, the draft and rejection shapes. |
| `payload.ts` | `payloadFor(sheet, notability, view)`: the one projection that feeds both the prompt and the checker. |
| `numbers.ts` | Finding numbers and dates in a sentence, the precision rule, and the arithmetic evaluator. |
| `checker.ts` | `checkDraft` and every list it uses (`UNSUPPORTED_CAUSES` and the others), and `repairFeedback`. |
| `prompt.ts` | The stable system prompt, the `submit_read` tool and its zod schema. No example paragraph. |
| `write-read.ts` | `writeRead(input, deps)`, the request, and this surface's model settings (`WRITER_PROFILE`). |
| `eval.ts` | The eval's flags, refusals, cost estimate and report. |
| `scripts/coachhelm/writer-eval.ts` | The eval script. Offline by default. |

## Contract

    writeRead(
      { view: 'coach' | 'player', sheet, notability, others? },
      { client, now, signal? },
    ) => Promise<{ written: WrittenRead | null, attempts, rejections, usage, cost_usd }>

- `sheet` is the player's fact sheet and `notability` is `findNotable(sheet)`. With no priority nothing is written and
  no call is made (`attempts: 0`).
- `view: 'player'`: the caller should pass `withoutCoachOnly(sheet)`. The projection strips coach-only parts either
  way, including the notability's: the priority's team shape, the patterns' team medians, whether the lead pattern
  differs from the team, and every reason that compares with teammates. A candidate or a piece of good news left with
  no reason is dropped.
- `others`: texts already written for other players in the run. A draft too close to one of them is rejected.
- `client` is the chat engine's `ModelClient`: `anthropicModelClient()` in production, a fake in tests. `now` stamps
  `checked_at`.
- `written` is exactly the stage 1-4 seam, `ReadPayload.written?`:

      { what, rules_in_out, this_week, watch, model, checked_at }

  `model` is the model that wrote the passing text: the fallback model's id if a refusal fallback answered. No extra
  field was needed. The draft's `this_week_area` and `declared` numbers are checked and then dropped.
- `usage` is the engine's `UsageTotals` (input, output, cache read, cache write, per call, per model). `cost_usd` is the
  same table's price (`turnCostUsd`).
- `writeRead` never throws for a model failure. An API error, a refusal or a cut-off reply returns `written: null`
  with the reason in `rejections`.

## The model call

- Model settings live in one constant, `WRITER_PROFILE`, in `write-read.ts`: Claude Sonnet 5.5 at effort `medium` (the
  same as the coach's Ask), adaptive thinking, `max_tokens` 16,000, and server-side refusal fallback
  (`fallbacks: 'default'`, beta `server-side-fallback-2026-07-01`), sent as the chat sends it. It is not in
  `chat/engine/model.ts`, because that file's profiles are keyed by chat surface and adding one would change the
  chat's types. It reuses that file's `ModelClient`, `ChatModelId`, `addUsage` and price table.
- One tool, `submit_read`, sent with `tool_choice: auto` (a forced tool is a 400 on Sonnet 5.5) and without `strict`
  (helm-claude-sdk rule 8a). The zod schema validates the input, and a malformed one counts as a failed attempt.
- The prompt is stable byte for byte and cached (five minutes, which covers one team's run). The facts travel as JSON
  in the user message. The prompt has no example paragraph, because an example becomes the template.
- Not built: a tool that lets the model ask for specific shots (optional in the plan). The shots would widen the
  number pool and add a loop. A sound version hands the evidence rounds' shots in as data and adds the tool's returns
  to the pool. Deferred.

## The checker

Deterministic, no model and no clock. Every rule has a test that fires it and a near miss that passes.

| Rule | Rejects | Allows |
| --- | --- | --- |
| `number_not_in_facts` | any number not in the projection | a fact at the precision written: "3" for 3.2, "75" for 74.6, "3.2" for -3.24. Signs ignored. Nothing looser. |
| `arithmetic_wrong` | declared arithmetic that does not compute, uses a non-fact operand, or is not `+ - * / ( )` | `{ value: 80, kind: 'arithmetic', expression: '(50 - 10) / 50 * 100' }` |
| `prescription_outside_advice` | a prescribed number (reps, a target) written in `what` or `rules_in_out` | the same number in `this_week` or `watch`, declared |
| `prescription_out_of_range` | a practice distance outside the bands of the advice areas. When the priority names a band, a distance in the priority's area must sit inside that band. Also reps over 200 and a percentage over 100. | "30 balls from 180 to 200 yards" on a 175-and-longer band |
| `date_not_in_facts` | "25 October" when no round or window has that date | evidence round dates, window dates |
| `unsupported_cause` | `UNSUPPORTED_CAUSES`: swing mechanics, grip, tempo, intent and club choice, the head (nerves, pressure, focus lost, mental), conditions (wind, weather, green speed, pins), equipment, fitness | a term a counted fact's label names; a sentence that says the data cannot tell ("cannot tell whether it is the swing"); in `watch`, a recordable cause to note ("note the wind") |
| `teammate_reference` | player view: team, teammates, squad, median, the others | coach view |
| `change_claim_unsupported` | "improved", "getting worse", "lately", "down from 3" | a `changed` reason (rule (a)) in that direction, in a candidate or good news |
| `overstated_certainty` | "clear", "clearly", "definitely", "obviously" on a leaning read | the same words on a clear or likely read |
| `advice_outside_areas` | `this_week_area` or words in `this_week` that put the advice outside the priority's and the candidates' parts of the game ("green" and "fairway" decide nothing) | |
| `advice_not_measurable` | `this_week` with no number | |
| `em_dash`, `jargon`, `too_long` | em and en dashes; SG, GIR, ft, yds, p-values, median, significant and the like; over 70 / 70 / 55 / 45 words | |
| `template_like` | word-trigram overlap above 0.5 with another player's text in the run | |

Numbers: digits, "1,350", and number words from two up ("twenty-one") are read. "One" is idiom more often than a
count, so it is not read. "30-40" is two numbers. Golf terms are words: "three-putt", "par 5s", "18 holes", "hole 1".
The pool is every number in the projection (and the numbers inside its labels, such as "125 to 175 yards"), plus 100
for complements. Because the pool comes from the projection, a teammate's figure is not in it in the player view.

Known limits: matching is lexical, so a cause said in words the lists lack gets through, and a harmless sentence that
uses a listed word is turned down. That is why the eval and the owner's graded set stay the real measure.

## The repair loop

One repair, then null. On a failed check the assistant turn goes back exactly as returned, thinking blocks included,
followed by a `tool_result` for its `submit_read` call with `is_error: true` and the reasons, numbered, one per line
(`repairFeedback`). If the model made no call, the reasons go as plain text. The chat has no `repairFeedback`. The
pattern mirrored is `buildRetryPrompt` in `src/lib/coachhelm/v3/llm/compose.ts`: one retry with the rejected items
named. Not repaired: a refusal, a reply cut off at the length limit (it may end in half a tool call), an API error.

## Cost

- Rates: Claude Sonnet 5.5 at $2 per million input tokens and $10 per million output, a cache read a tenth of input,
  from the claude-api skill's model table (cached 2026-11-03), the same figures as `CHAT_RATES` in `engine/model.ts`.
- The offline eval estimates about $0.03 per player when the first draft passes and about $0.07 with a repair. The
  estimate takes the prompt's characters divided by four (about 2,600 to 2,900 tokens on the synthetic players) and
  assumes 2,500 output tokens per attempt. It is an estimate, not a measurement. Measure on staging.
- The owner sets the monthly cap. One way to enforce it: the caller sums `cost_usd` and stops writing for the month at
  the cap, and the card stands without the paragraph.

## The eval

    node --import tsx/esm --import ./scripts/coachhelm/server-only-hook.mjs scripts/coachhelm/writer-eval.ts [--view player]

Offline by default. It runs `writeRead` over the synthetic players (`__tests__/fixtures.ts`, built with the analyst's
own fixture builder) with a client that answers locally without a read. That proves the wiring and prints the cost
estimate. A live run needs all of these: `--live`, `--max-usd`, `--target staging` with a non-production `--url` and
key (the analyst dry run's refusal), and `ANTHROPIC_API_KEY`. It reads the team with SELECTs only and stops before a
player whose worst case would pass the cap. It reports how many reads were written, the rejection counts, the spend
and the largest pairwise similarity between players' texts. It has not been run live, because the spend needs the
owner's yes.

## Wiring it (for the stage 1-4 work)

In the read builder, after `findNotable(sheet)` and before the read is saved, behind `coachhelm_reads_v1` AND a second
switch for the written text, proposed name `coachhelm_reads_written_v1`, default off:

    const notability = findNotable(sheet);
    const read = buildRead(sheet, notability);            // stage 1
    if (flags.coachhelm_reads_v1 && flags.coachhelm_reads_written_v1) {
      const out = await writeRead({ view: 'coach', sheet, notability, others }, { client: anthropicModelClient(), now: () => new Date() });
      if (out.written) read.written = out.written;          // else the stage 1 card stands
      // log out.attempts, out.rejections (rules only, no text) and out.usage / out.cost_usd to the call ledger
    }
    save(read);

- Pass `others` (the texts already written for the team this run) so no two cards share a paragraph.
- The player's own card is a second call with `view: 'player'` and `withoutCoachOnly(sheet)`. Never reuse the coach's
  text on the player's card.
- The model call runs on the server only (the key). A failed or refused call costs the read nothing.
- Logging: the rejection rules and the usage, never the text, the facts or a name (helm-claude-sdk rule 10).

## Owner decisions (defaults until decided)

1. A model writing coach-facing text: built, not wired, switch proposed default off.
2. The model and effort: Claude Sonnet 5.5, `medium`, the coach's Ask settings.
3. The monthly cost cap: none set. Estimate about $0.03 to $0.07 per player per read.
4. The tone: from samples. The live eval on a staging team produces them, once its spend is approved.
5. The live eval's spend: not run. It needs an explicit `--max-usd`.

## Tests

    npm run test:file -- src/lib/coachhelm/v3/analyst/writer/__tests__/

| File | Covers |
| --- | --- |
| `checker.test.ts` | Each rule firing and its near miss, the precision rule, number words, terms, ranges, dates, the arithmetic evaluator, the cause list, the repair feedback. |
| `write-read.test.ts` | Passing first time, the request shape, repair then pass, two failures to null, malformed and missing submissions, refusal, cut-off and API error without repair, no priority, the fallback model, the player view (nothing coach-only sent, teammate text rejected), templates. |
| `eval.test.ts` | Every refusal of the live run (no cap, not staging, production by URL or key, no API key), the offline run, the budget stop. |
