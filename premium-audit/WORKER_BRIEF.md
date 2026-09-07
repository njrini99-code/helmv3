# Common worker brief — GolfHelm mobile UI/UX audit (READ-ONLY phase)

You are a lane in the GolfHelm Master Parallel Audit. A00 (the coordinator) dispatched you.

## 1. Where you work

Your working directory is **`/Users/ricknini/worktrees/helmv3/mobile-ui-audit`**. Every path in
your work order is relative to it. **Never read or write anything under
`/Users/ricknini/Downloads/helmv3`** — that is the canonical checkout, another session is live in
it, and writes there are blocked by a hook.

Baseline SHA: **`3c90f9f174ac103af5fafc600aebecd98243decc`**. Do not re-pin it, do not check out
another ref, do not create a branch or a worktree, do not run `git` mutations of any kind.

## 2. What you may write

**AUDIT ONLY. You edit no source file.** Your only permitted writes are:

- `premium-audit/lanes/<YOUR-LANE>/report.md`
- `premium-audit/lanes/<YOUR-LANE>/findings.jsonl`

Eleven lanes share one working tree. Writing anywhere else corrupts another lane's work.
Do not run `npm install`, `npm run build`, `npm run dev`, or any command that writes into the tree.
Read-only commands (`grep`, `rg`, `sed -n`, `cat`, `git show`, `git log`, `git grep`) are fine.

## 3. Required reading before you start

1. `/Users/ricknini/Downloads/GolfHelm_Master_Parallel_Audit_Plan.md` — Sections 1–5 (evidence
   authority, success criteria, protocol, waves, shared contracts C01–C10) and **your own Section 6
   work order**, which is the authoritative statement of your mission. Also skim Sections 7–9
   (screen transformation spec, material standardization, state/interaction truth tables) and
   Section 10 (fault matrix T01–T28) for the invariants your findings should reference.
2. `AGENTS.md` and `CLAUDE.md` in the worktree — repository authority beats the plan's operational
   defaults.
3. `memory/registry.yml` and the `memory/features/*.md` docs that map to the files you inspect.
   `npm run knowledge:map -- --files <paths...>` resolves the mapping (read-only, safe).

## 4. Evidence discipline — this is the part lanes get wrong

You have **no iOS device, no simulator, no release build, no screenshots, no recordings, no
authenticated fixtures, and no running database**. Therefore:

- **`OBSERVED` and `REPRODUCED` are UNAVAILABLE to you this phase.** Do not use them. If you write
  "this causes a visible flash on device," you have fabricated evidence.
- Permitted labels only: **`SOURCE`** (the pinned implementation directly contains this behavior),
  **`RISK`** (source permits this failure sequence; reproduction still required), **`PROPOSAL`** (a
  recommended design/architecture decision, not an existing feature or a platform requirement),
  **`NOT_RUN` / `BLOCKED`** (a required check you could not perform — name the missing dependency
  and the next owner). `NOT_RUN` never means passed.
- Every finding cites **`path/to/file.tsx:LINE`** — real line numbers you actually read at this
  baseline. A finding without a file:line citation is not a finding.
- A code comment, a PR title, a prior audit's claim, or another agent's summary is a **lead**, not
  proof. Reopen the implementation and trace the actual mounts and imports. A component that
  nothing imports is not a live user-facing defect — say so and count it separately.
- Explain the **user consequence and the mechanism**, not a code smell. "This is ugly" is not a
  finding; "the yardage field coerces a cleared value to 0 and the round total updates from that
  transient zero, so a player correcting one hole sees a wrong total" is.

## 5. Scope boundaries

- **Messaging is a separate program.** The Messages tab, inbox, threads, message queries/actions,
  message attachments, and message notifications are owned by another session in another worktree.
  You may read those files to understand shared infrastructure. You may **not** propose a repair
  to them. Anything you notice goes in a `## Messaging referrals` section at the end of your
  report — recorded, not dropped, not fixed.
- **You may read any domain; you own only your work order.** If you find a defect in another
  lane's territory, record it with the owning lane named, and move on. Do not redesign the app.
- Do not propose a framework rewrite, a new state-management or animation library, a second query
  framework, a duplicate primitive, or a new telemetry SDK. Reuse before replacement is a hard rule.
- Do not invent features or data. A mockup containing a button is not proof a feature exists.

## 6. What you return

**Write your full output to your two files, then return a SHORT summary to the coordinator:
your top five findings (one or two lines each, with id, severity, label, and file:line) and a
one-line coverage tally.** Do not paste your whole report into the response.

### `report.md` structure

```
# Lane <ID> — <mission>
## Top 5 actionable findings        (ranked; the ones that most change the user's experience)
## All findings                     (full detail per the finding record below)
## Coverage ledger                  (table; see below)
## Contracts requested              (which of C01–C10 you need, and what field/behavior you need in it)
## Shared changes requested         (exact file + owning lane + what you need, for anything outside your lease)
## Open questions for the owner     (product/design decisions you cannot make)
## Messaging referrals              (anything messaging-related you noticed)
## NOT_RUN ledger                   (every check you could not perform + missing dependency + next owner)
```

### Finding record (one YAML block per finding in `report.md`, one JSON object per line in `findings.jsonl`)

Fields: `id` (e.g. `A02-001`), `related_prior_ids` (the plan's F/UX/G seed ids where they match),
`status`, `severity` (P0/P1/P2/P3 per Section 2.2), `confidence`, `evidence_label`,
`baseline_sha`, `user_consequence`, `mechanism`, `source_files`, `source_ranges` (exact
`file:start-end` you read), `expected`, `actual`, `proposed_fix`, `owner_lane`, `dependencies`
(contract ids), `negative_tests` (T-ids from Section 10), `accessibility_check`,
`performance_check`, `verification` (`{unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}`).

Severity is independent of confidence. A severe RISK is not a reproduced incident. Do not invent a
numeric business-impact score.

### Coverage ledger

Every mounted route, component, and data boundary you were responsible for gets exactly one status
— **no blank rows**: `PASS`, `FINDING:<id>`, `RISK:<id>`, `NOT_RUN:<reason>`, or
`OUT_OF_SCOPE:<owning lane or program>`. List dead/non-mounted paths in a separate sub-table so
they cannot inflate your coverage. A long prose report with no owners, tests, or next actions is
not a completed lane.

## 7. Section 12 seeds

The plan's Section 12 starter register lists seeds (G01–G30) with a lead lane. **Verify each seed
assigned to you at this baseline** — presence, reachability, and whether it is still true after the
commits since the plan was written. State explicitly for each: still present / already fixed (cite
the fix) / never applied / cannot determine without a runtime. Do not mark a seed fixed because a
similar PR title exists.
