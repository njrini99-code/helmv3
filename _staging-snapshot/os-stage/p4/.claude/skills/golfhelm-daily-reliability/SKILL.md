---
name: golfhelm-daily-reliability
description: Run the GolfHelm Engineering OS daily reliability routine — observe production signals (Bridge/Sentry/CI), dedupe and classify them, investigate, repair what's safe to repair, and queue verified work for the release train. This routine NEVER deploys, promotes, or rolls back production. Use for scheduled/on-demand daily health runs, "run the daily reliability check", or "what happened in production today".
---

# GolfHelm Daily Reliability

This is the daily observe-and-heal routine from the GolfHelm Self-Healing
Engineering System (`docs/ai-system/GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md`
§24; runtime contract at `memory/system/golfhelm-engineering-os.md`). Read
that compact OS file first if this session has not already loaded it.

**The one rule that overrides all others: this routine observes, investigates,
repairs, tests, and queues. It never deploys.** If a step in this document
ever seems to require a production deploy/promote/rollback/migration/secret
rotation to finish, stop — that step does not belong to this skill. Hand it
to `.claude/skills/golfhelm-release-manager/SKILL.md` instead, which is a
separate, owner-approved routine.

## Hard rules (spec §24, verbatim)

**May:** read telemetry, product memory, git history, code; reproduce bugs;
write regression tests; prepare fixes; run tests; update existing incidents;
create genuinely-unique incidents; prepare/update PRs; merge verified R0/R1
if owner policy permits; update the release queue.

**May not:** deploy production; promote; roll back; apply production
migrations; mutate production data; rotate secrets; change release policy;
bypass the release budget.

**Final output states:** production unchanged SHA; repairs queued; new
actionable incidents; incidents updated; no-action signals; release slots
remaining. (Exact template at the bottom of this file.)

## Procedure

1. **Collect.** `node scripts/operations/daily-health/collect.mjs` (or
   `npm run reliability:collect`). Read-only. Emits normalized JSON: window,
   production identity, per-source status (`bridge`/`sentry`/`vercel`/`ci`,
   each `ok`/`unconfigured`/`error` — never silently healthy), and
   `signals[]` with `feature_id`, `fingerprint`, `source`, `classification`
   (`new`/`recurring`/`resolved-recur`), `first_seen`, `last_seen`, `count`.
   A source reporting `error` or `unconfigured` is missing DATA, not
   evidence of health — say so in the run's own final output, don't drop it
   silently from the count.

2. **Render.** `node scripts/operations/daily-health/report.mjs` (or
   `npm run reliability:report`). Groups collector signals into candidate
   `new_actionable_incidents` (new + resolved-recur) and `incidents_updated`
   (recurring), reads `memory/operations/release-queue.yml` for repairs
   already queued, and reads the release budget
   (`scripts/release/check-release-budget.mjs --json`) for slots remaining.
   **The report's groupings are candidates, not verdicts** — it has no
   feature context. Step 3 is where that context gets applied.

3. **Correlate through the OS contract, not the raw signal.** For every
   candidate signal: resolve `feature_id` through `memory/registry.yml`
   (§5); if `feature_id` is the literal `unmapped`, that itself is a finding
   — the emitting code never tagged a feature, fix the emitter, don't guess
   which feature it probably meant. Load the mapped `memory/features/<id>.md`
   — current-state behavior, invariants, operations contract, test
   contract, incident history — BEFORE forming a hypothesis. Context first,
   code second (spec §30).

4. **Do not create an issue per event — dedupe first (spec §18).**
   - Primary identity is `feature_id` + stable `fingerprint` + root-cause/
     invariant class, not the raw event.
   - A repeat occurrence of a fingerprint you already have an open incident
     for (`classification: recurring`) updates that incident's count/
     last_seen/evidence. It does not open a new GitHub issue, and it does
     not need a new PR.
   - Multiple fingerprints that trace to one proven root cause become ONE
     incident and (when practical) one repair PR — not one PR per
     fingerprint.
   - A monitoring/observability defect (the signal is real but the SIGNAL
     ITSELF is broken — wrong severity, wrong feature tag, a duplicate
     emitter) gets classified `TELEMETRY_DEFECT` and the observability code
     gets repaired. It does not spawn a product incident.
   - Something expected/non-actionable (a known, accepted condition) gets
     its classification recorded and nothing else. This is the
     `no_action_signals` bucket the report script deliberately left for you
     to fill in — record why, in one line, per signal or per group.
   - Only a confirmed, unique product defect gets a new/updated durable
     incident. `memory/incidents/<feature-id>/INC-….md`.

5. **Investigate → reproduce → fix, in that order.** A fix for a failure you
   never reproduced is a guess. Write the regression test that would have
   caught it before writing the fix, per this repo's usual TDD discipline.

6. **Risk-gate every repair before you touch it (spec §28).**
   - **R0** (generated docs, registry index repair, dead doc links, semantic
     backfill) — may be automated after deterministic verification.
   - **R1** (narrow, low-risk product repair) — prepare daily; mergeable if
     owner policy allows; still waits for the release train to actually
     ship. Requires: reproduction, regression test, small blast radius, no
     auth/RLS/migration/destructive behavior, preflight green, verifier
     approval.
   - **R2** (product behavior — calendar/stats/CoachHelm output/workflow/
     notification semantics) — PR + owner approval + release train. Prepare
     and queue; do not merge unilaterally.
   - **R3** (privileged/high-blast-radius — migration, RLS, auth, secrets,
     billing, destructive data, production fixtures, branch/deploy
     permissions) — never autonomous production mutation of any kind.
     Investigate and prepare a proposal; the owner controls the action.
   When in doubt between two tiers, use the higher one.

7. **Verify before calling anything done.** Route the prepared repair through
   `.claude/agents/golfhelm-verifier.md` — root cause, regression test,
   scope, auth/data safety, memory accuracy, release risk, and whether the
   fix hides a signal instead of fixing it (spec §42; see the reject list
   below). The verifier has real authority to reject; do not treat its
   approval as a formality.

8. **Update memory, not just code.** Any behavioral change updates the
   feature's current-state doc, appends to `memory/ledgers/changes/
   <feature-id>.md` and `memory/ledgers/tests/<feature-id>.md`, and — for a
   genuinely new/updated incident — writes or updates the incident file.
   R0-only maintenance runs may skip this if nothing behavioral changed;
   say so explicitly rather than leaving it ambiguous.

9. **Queue, never ship.** A verified repair's final state in this routine is
   `memory/operations/release-queue.yml` entry with `status: verified` or
   `queued_for_release` (spec §17's allowed status list). Merging the PR to
   `main` (when policy allows for R0/R1) is not deploying — production stays
   pinned to its last released SHA until the release train moves it (spec
   §20). Never invoke anything from `.claude/skills/golfhelm-release-manager/`
   from inside this routine.

10. **Emit the final output** in the exact shape below, then stop. Do not
    keep looking for more work once every collected signal has a
    disposition.

## No-churn rule (spec §25)

If the run produces 0 new actionable incidents, 0 regressions, 0 changed
health state, and 0 memory-worthy discoveries: **make no commit, no PR, no
issue, no deploy.** The collector/report JSON is the artifact; it does not
need a Git commit to prove the audit happened. A quiet day is a successful
day — do not manufacture activity to look useful. (spec §38: a healthy day
is collector run, correlation, 0 actionable defects, audit ends. That is
correct behavior, not an incomplete one.)

## Never do these (spec §42 — self-healing must not hide errors)

Reject any "fix" that: turns an error into `[]`; turns `unknown` into
`healthy`; downgrades severity to make a dashboard look cleaner; marks
something resolved without production evidence; raises a lint/test
baseline; disables monitoring; removes a failing test; suppresses an
exception without a verified product reason; loosens RLS/auth; deletes
telemetry. If a candidate repair does any of these, it is not a repair —
escalate it as a finding instead of applying it.

## Required final-output template

```
GolfHelm Daily Reliability — <window.from> to <window.to>

Production: unchanged at <sha or "unresolved: <reason>">
Repairs queued: <n> (release-queue.yml: <status breakdown>)
New actionable incidents: <n> — <feature_id: fingerprint (root cause)>...
Incidents updated: <n> — <feature_id: fingerprint (count/last_seen only)>...
No-action signals: <n> — <one line each: why non-actionable>
Release slots remaining this week: <n> (or "unknown: <reason>")

Degraded sources this run: <none, or source: status: note>
```
