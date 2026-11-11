# Golf-sense eval for CoachHelm chat

`golf-sense.json` holds 60 questions a college coach or player really asks, written to test whether the assistant
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
- Placeholders `{player}`, `{player2}`, `{new_player}`, `{teammate}` are filled from the staging roster.

## To run it later

In `ask-eval.mjs`, after the roster is read: load the JSON, fill the placeholders, turn each `re` into
`new RegExp(re, flags)` and each `forbid.pattern` into the shared pattern, and append to `QUESTIONS`. Two scoring
rules the data questions do not have: the `tour_figure_from_memory` pattern is skipped when the turn called
`get_reference` (the figure was read, not remembered), and `readers` is scored against the turn's tool calls.
Run it against staging only, with the owner's approval of the spend.
