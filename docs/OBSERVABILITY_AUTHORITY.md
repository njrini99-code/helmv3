# Observability authority — what each surface actually knows

Written 2026-08-30 to answer one question that had no answer: when the Bridge
says **0 errors**, what has it actually established?

It is a contract, not an inventory. The counts below are evidence for the
contract and are not maintained.

---

## The contract

```text
admin_events   what Helm EXPLICITLY logged, graded
               info | warning | error | critical

Sentry         everything Helm logged (unless skipSentry) PLUS unhandled
               framework and platform errors that never reached Helm's
               logging — and with NO severity model of its own

Mission        a synthesis of both. Neither surface alone is production
Control        health, and neither may silently stand in for the other.
```

**Sentry is a strict superset of `admin_events` in practice, and the two
disagree for two entirely different reasons.** Conflating those reasons is what
made the disagreement look like a capture bug.

---

## Why they disagree — measured, 2026-08-30

At the time of writing: `admin_events` reported **0 error-or-worse rows in 48
hours**; Sentry reported **12 unresolved issues**, several receiving events
within hours. Both were correct.

### Reason 1 — classification, not capture

`[v3.llm.budget.platform_default]` was Sentry's largest issue at **64 events**.
It is in `admin_events` too — 25 rows, most recent the same day — at severity
**`info`**, because "a coach has no configured daily budget, so the platform
default applies" is an expected fallback, not a fault.

Sentry has no severity model. A captured trace is an issue.

So the same event is `info` on one surface and an unresolved issue on the other.
Neither is wrong. They are answering different questions.

### Reason 2 — errors that never reached Helm's logging

Probed against `admin_events` over seven days:

| Sentry issue | rows in `admin_events` |
| --- | --- |
| `Error: JWT expired` | **0** |
| `permission denied for function heartbeat` | **0** |
| `TypeError: fetch failed` | **0** |
| `AuthApiError: Invalid login credentials` | **0** |
| `Cannot coerce the result to a single JSON object` | **0** |
| `SecurityError: history.replaceState …` | 1 (severity `error`) |

The zeroes are **by design**, and `src/instrumentation.ts` says so. Helm's
explicit path (`logServerError` / `logServerException`) writes `admin_events`
*and* Sentry, then marks the error `__helmBridgeLogged`. Next.js's
`onRequestError` catches what escapes the boundary; if the error is already
bridge-logged it deliberately does **not** write a duplicate `admin_events` row,
because Sentry already has it.

An error that never went through Helm's logging therefore reaches Sentry and
never reaches `admin_events`. That is the intended architecture, and the
`history.replaceState` row proves the client path does capture what it is
supposed to.

**No capture path violates this contract.** The investigation that produced this
document was looking for a capture defect and did not find one.

---

## What each surface may and may not claim

### `admin_events`

- may claim: no error-or-worse event was explicitly logged
- may NOT claim: production has no errors

### Sentry

- may claim: these runtime exceptions were captured
- may NOT claim: this is the severity Helm assigns

### Mission Control

- may claim: the health of each surface, and whether they are reconciled
- may NOT claim: overall health derived from one surface alone

The rule that follows:

> **A count of zero from one surface is not a statement about
> production. It is a statement about that surface.**

---

## Consequences for the board

The Bridge already models per-source health (`reading` / `partial` / `blind` /
`unknown`) with freshness and a blindness beacon. What it did not have was a
reason to treat "Sentry is reporting and `admin_events` is quiet" as anything
other than good news.

Under this contract that combination is **not** good news and **not** bad news —
it is *unreconciled*, and the honest rendering distinguishes:

```text
APPLICATION EVENTS      healthy      (admin_events, graded, 0 error-or-worse)
RUNTIME ERROR SURFACE   degraded     (Sentry, 12 unresolved)
OVERALL                 partial      — the two are not reconciled
```

rather than one surface's zero standing in for production health.

~~Tracked as `ERROR_SURFACES_DISAGREE` in `config/control-plane-gaps.json`, with
this document as its definition of done.~~

**SHIPPED 2026-08-30.** `src/lib/admin/incidents/reconciliation.ts` is the
verdict; `ErrorSurfaceReconciliation` renders the three rows on
`/admin/errors`. The gap is closed with that evidence.

Two things the implementation had to decide that this contract did not say:

- **The counts are asymmetric.** Application events are counted at
  error-or-worse, because `admin_events` is graded and the grading is its
  value. Sentry incidents are counted ungraded, because the rule below forbids
  silencing an issue on Helm's opinion of a fault Helm never handled.
- **The block renders even when the surfaces agree.** `BlindnessBeacon` returns
  null when nothing is wrong, and that is right for a warning. It is wrong for a
  reconciliation: without a visible row, "the two agree" and "nobody compared
  them" look identical — which is the failure this contract exists to remove.

---

## What this contract deliberately does not require

**Do not make every Sentry event appear in `admin_events`.** That would discard
the severity grading that makes `admin_events` useful, and would write rows for
faults Helm never handled and cannot describe. The two surfaces have different
jobs; the fix is reconciliation, not duplication.

**Do not silence Sentry issues that Helm grades `info`.** The budget-default
trace is genuinely uninteresting to Helm and genuinely a captured trace to
Sentry. Both records are correct.

**Do not weaken a permission to quiet a surface.** The `heartbeat` 401s are
Supabase's client reporting a race the app already recovers from; granting
`anon` EXECUTE on a SECURITY DEFINER function to reduce noise would trade a
reporting annoyance for a real security regression.
