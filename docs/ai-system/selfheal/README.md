# The self-healing loop

An error in production is supposed to travel a closed circuit:

```text
  CAPTURE          DIAGNOSE           REPAIR          CLOSE
  admin_events  →  rca_analysis  →  a verified PR  →  admin_error_resolutions
  (the app)        (cloud)          (local agent)     (log-retention cron)
                       │                  │                    │
                       └──────────────────┴────────────────────┘
                       heartbeats → background_job_logs → /admin/jobs
```

Three runners, in three different places:

**Diagnose** — heartbeat `selfheal-triage`. An Anthropic-hosted cloud
routine, daily 09:17 UTC. Follows [`triage-contract.md`](triage-contract.md).
Reads **three** sources, not one: `admin_events`, plus the Sentry / Supabase /
Vercel signals the reliability collector already correlates into
`background_job_logs.reliability-snapshot`. `admin_events` contains only what
this app chose to log about itself — a cron dying on a permission grant never
writes a row there.

**Repair** — heartbeat `selfheal-repair`. A launchd agent on the owner's Mac
(`~/Library/LaunchAgents/com.helm.bridge-rca-repair.plist`), daily 06:40
local, installed from the repo-tracked `config/launchd/com.helm.bridge-rca-repair.plist`
via `npm run selfheal:repair:install` and checked with
`npm run selfheal:repair:doctor`. Follows [`repair-contract.md`](repair-contract.md).

**Close** — heartbeat `log-retention`. A Vercel cron:
`src/app/api/cron/log-retention/route.ts` → `src/lib/admin/auto-resolve.ts`.

## Why the contracts are in this repo and not in the routines

They used to be in the routines. Both halves were configuration stored outside
git: nothing diffed them, no gate checked them, and neither half could read the
other's copy. The only thing joining them was the *category* of a finding — the
string `suggestedFix` opens with, which decides whether an incident becomes a
repair or an archive.

Measured 2026-08-27, one day after the loop was wired: of the 15 analyses in
production, **10 opened with free prose** rather than one of the four agreed
strings. The repair half filtered `suggestedFix ilike 'FIX HERE%'` in SQL, so
two thirds of everything the diagnosis half produced — including the single
most actionable finding on the board — was invisible to it. Neither side
errored. The board simply looked like there was nothing to repair.

So:

- **The vocabulary is code.** `RCA_CANONICAL_PREFIX` and `deriveRcaCategory()`
  in `src/lib/admin/rca.ts` are authoritative. These documents restate the four
  strings for readability; if they ever disagree with that file, **that file
  wins and these documents are the ones to fix.**
- **Both routines read their contract from a fresh checkout at run time**, so
  a change to these files reaches both halves on their next run with no
  configuration edit anywhere.
- **The live routine prompt is a pointer, not a copy.** Keep it that way. A
  second copy is a second thing to drift.

## Why the loop reports itself

Two of the three runners are outside this deployment. Nothing in the app
invokes them, nothing in CI tests them, and neither raises an error anywhere
the Bridge can see when it stops. A disabled cloud routine and a launchd plist
that was installed but never `launchctl load`ed fail identically: **silently,
by producing nothing** — and producing nothing is indistinguishable from having
nothing to do.

That is not hypothetical. The repair half's plist sat installed and unloaded
for hours on 2026-08-27 while every artifact around it said the loop was
running. *Recorded* is not *applied*.

So every stage writes a heartbeat row into `background_job_logs` at the end of
each run, and `src/lib/admin/selfheal-registry.ts` is the expected half of
expected-vs-actual. A stage that stops running goes **overdue** on
`/admin/jobs`, which an operator already reads. The loop's status is its
**worst** stage, because a circuit with one dead link is open however healthy
the rest looks.

## The four categories

`suggestedFix` opens with one of four exact strings, and the category is read
back off it by `deriveRcaCategory()`:

- **`FIX HERE`** → `fix-here`. A real defect with a named file and change.
  **Repair** takes it.
- **`ALREADY FIXED`** → `already-fixed`. A commit that shipped after the last
  occurrence. **Close** resolves it.
- **`NOT A DEFECT`** → `not-a-defect`. Expected control flow, third-party
  noise, a bot. **Close** resolves it.
- **`NEEDS MORE EVIDENCE`** → `needs-more-evidence`. Names the missing evidence
  and what would produce it. Nobody acts yet.
- anything else → `uncategorized`. The writer drifted off contract. **Repair**
  reads it and judges.

`uncategorized` is deliberately visible rather than dropped, and deliberately
**not** auto-resolvable. It reaches the repair half — that half is a session
with judgement, not a regex, and silently skipping it is how ten findings sat
unread — but no automatic path closes an incident on text nobody could
classify. See `isRepairCandidate` / `isAutoResolvable` in `rca.ts`.

## Hard wall

Everything here inherits `memory/system/golfhelm-engineering-os.md`: **daily
reliability never deploys, promotes, or rolls back production.** The repair
half opens PRs and stops. Merging and releasing are the owner's, capped by
`config/release-policy.yml`.
