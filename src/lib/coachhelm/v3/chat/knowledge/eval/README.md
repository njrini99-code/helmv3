# Golf-sense eval for CoachHelm chat

`golf-sense.json` holds 76 questions a college coach or player really asks, written to test whether the assistant
reads golf figures the way a coach's analyst would. They complement the data questions in
`scripts/coachhelm/ask-eval.mjs`, which check that figures are right; these check meaning, direction and caution.

Nothing here calls a model. `index.ts` only loads and compiles the file, and `../__tests__/eval.test.ts` checks it.

## Shape (the harness's own, so `ask-eval.mjs` can run it later)

Each question: `id`, `area`, `viewer` (`coach` or `player`), `ask`, `readers`, `facts`, `forbid`, `note`.

- `facts`: what a correct answer must state. `{ label, kind: "phrase", re, flags }`, the harness's `phrase` kind
  with the pattern as a string. No figure is expected: figures depend on the data and belong to the data questions.
- `forbid`: what it must not state. `{ label, pattern }` names a shared pattern in `patterns` (a swing diagnosis, a
  Tour figure from memory, a label on a player, a promise, a weather guess, a tool or table name).
- `readers`: the reads a correct turn uses, as the harness records them in `toolCalls`. Any one of them counts
  unless the note says both. An empty list means the prompt or the reference answers it and no read of team data
  is required.
- `global_forbid` (top of the file): the writing rules, scored against every answer whatever the question: the
  sample as notation (`n=4`, `N-4`), a heading or a table, an abbreviation a coach would not say aloud (`SG`,
  `GIR`, `avg`, `vs`, and `ft` or `yd` after a number or in a band: a distance is "from 3 to 5 feet", "281 yards"),
  Title Case stat names or a lower-case "tour", a sentence or list line that starts lower-case, a proper noun not as
  it is written (PGA Tour, NCAA, Division I), and a tool or table name.
- Names as stored: `golfSenseQuestions(names, { people, places })` adds the team's own proper names to the
  proper-noun rule, so "eli brandt" or "PINE VALLEY INVITATIONAL" fails when the roster has "Eli Brandt" and the
  event is stored "Pine Valley Invitational". Pass the roster as `people` and the course and event names the turn's
  reads returned as `places`.
- `style.max_sentences` (the `writing` questions): the answer fails when it runs longer. `index.ts` exports the
  `sentenceCount` these limits mean.
- Placeholders `{player}`, `{player2}`, `{new_player}`, `{no_shots_player}`, `{teammate}` are filled from the staging roster.

## To run it later

In `ask-eval.mjs`, after the roster is read: load the JSON, fill the placeholders, turn each `re` into
`new RegExp(re, flags)` and each `forbid.pattern` into the shared pattern, and append to `QUESTIONS`. Two scoring
rules the data questions do not have: the `tour_figure_from_memory` pattern is skipped when the turn called
`get_reference` (the figure was read, not remembered), and `readers` is scored against the turn's tool calls.
Run it against staging only, with the owner's approval of the spend.
