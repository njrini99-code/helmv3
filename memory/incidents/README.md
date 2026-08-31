# memory/incidents/

One durable incident per confirmed unique product defect — never one per
Sentry/Vercel/Bridge event.

## The file contract, checked by `npm run knowledge:ledger-check`

```text
memory/incidents/<feature_id>/INC-YYYY-MM-DD-<slug>.md
```

`<feature_id>` is a `memory/registry.yml` key verbatim, and the file must open
with that same id, backticked, on its own line:

```markdown
- Feature: `golf_round_lifecycle`
- Also affects: `stats_analytics`      # optional, one per extra feature
- Surface: `round_review_ai` recap persist   # optional, a runtime FeatureKey
```

The backticks are not decoration. Four incidents carried prose instead —
`- Feature: Golf Round Lifecycle and Stats Analytics` — which is readable and
unlinkable: nothing could join them to the registry, to the release queue, or to
the feature map, and one of them silently named two features in a field the
model treats as one. Corrected 2026-08-30 and now enforced.

A second feature goes on its own `Also affects` line rather than into the
primary field. Which directory the file lives in stays a judgement — the dedupe
rule below means one root cause is one incident even when it spans features, and
the release queue may reference an incident filed under a different feature.
That cross-reference is reported by the checker and never failed.

Dedupe rule (`memory/system/golfhelm-engineering-os.md` "Incidents"):
identity = `feature_id` + stable fingerprint + root-cause/invariant class. A
repeat occurrence of a known fingerprint updates the existing incident's
count/last_seen/evidence — it does not create a new one. Several
fingerprints tracing to one proven root cause become one incident, not many.

Instrumentation defects get classified `TELEMETRY_DEFECT` and fixed as
observability work, not filed as product incidents. Expected/non-actionable
signals get their classification recorded and nothing else — a thousand raw
events should resolve to a handful of incidents here.
