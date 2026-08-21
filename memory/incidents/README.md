# memory/incidents/

One durable incident per confirmed unique product defect — never one per
Sentry/Vercel/Bridge event. Layout: `<feature-id>/INC-<id>.md`.

Dedupe rule (`memory/system/golfhelm-engineering-os.md` "Incidents"):
identity = `feature_id` + stable fingerprint + root-cause/invariant class. A
repeat occurrence of a known fingerprint updates the existing incident's
count/last_seen/evidence — it does not create a new one. Several
fingerprints tracing to one proven root cause become one incident, not many.

Instrumentation defects get classified `TELEMETRY_DEFECT` and fixed as
observability work, not filed as product incidents. Expected/non-actionable
signals get their classification recorded and nothing else — a thousand raw
events should resolve to a handful of incidents here.
