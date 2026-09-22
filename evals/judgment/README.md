# Judgment calibration fixtures

Labelled cases for the Helm Judgment Layer (`src/lib/ai/judgment/**`). Every
fixture is **invented from schema shapes** — none is copied from production
rows. Shape:

```json
{
  "fixtureVersion": 1,
  "useCase": "shot_trace",
  "name": "autosave_shot_count_mismatch",
  "input": { "...": "the use case's judge input (trace run + steps [+ shots], or a TriageGroup)" },
  "expected": { "disposition": "escalate", "reasonCodes": ["hard_invariant_failed"], "alsoAccept": ["collect_more_evidence"] },
  "source": "invented-known-shape | invented-healthy | invented-noise | invented-thin | invented-safety-override | invented-contract"
}
```

`expected.disposition` is the primary label; `alsoAccept` lists dispositions
a reviewer would not call wrong (the confusion matrix counts them as
`acceptable`, precision/recall use the primary label only).

Run `npm run judgment:calibrate` (needs `TYPESAFE_API_KEY` in `.env.local`
and the network). It writes `artifacts/judgment/calibration.{json,md}`.
Hard-invariant cases are answered by code before Jev and are reported
separately so the provider's own accuracy is visible.

`evaluator-versions.json` pins a hash of each evaluator's question set; the
unit test `src/lib/ai/judgment/__tests__/calibration.test.ts` fails when a
question set changes without its version bumping, or when a fixture
directory shrinks below its recorded count.
