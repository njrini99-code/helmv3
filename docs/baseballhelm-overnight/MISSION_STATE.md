# BaseballHelm Overnight Completion — MISSION STATE

> **This file is the hub.** It is updated continuously during the run, not just
> at the end. If you are a fresh agent picking this up after a context
> compaction, read `RESUME_INSTRUCTIONS.md` first, then this file.

- **Mission start:** 2026-07-28 23:29 EDT (2026-07-29 03:29 UTC)
- **Branch:** `baseball/overnight-completion` (branched from `main`)
- **Goal:** BaseballHelm demonstrable to a college baseball program by morning,
  without apologising for unfinished screens.

---

## Current phase

**Phase 8 — hardening past the release assessment.** _(Updated 2026-07-29
04:25 EDT. The phase table below was left reading "Phase 1 RECON — running"
until 04:20, five hours after recon finished; a stale in-progress marker is
indistinguishable from a stalled worker, which is the exact failure the
resume protocol looks for. Corrected, and worth not repeating.)_

| Phase | State |
|---|---|
| 0. Hazard containment | ✅ done |
| 1. Recon (10 parallel readers + adversarial verify + plan) | ✅ done — 75 findings, 1 P0 later retracted |
| 2. Serial foundations (flag architecture, identity model, schema) | ✅ done |
| 3. Parallel implementation teams | ✅ done — 12 subagents / 4 workflows, each packet adversarially reviewed |
| 4. Integration | ✅ done |
| 5. Test + verify | ✅ done — see the gate table below |
| 6. Visual / responsive review | 🟡 partial — Settings hub unified, `PlayerProfileClient` improved but not a finished Fairway migration |
| 7. Seed + demo walkthrough | 🟡 partial — seeds hardened and broadened; NOT verified end-to-end against a live DB, because none was reachable |
| 8. Release assessment | ✅ written (`FINAL_REPORT.md`), now iterating on what it exposed |

---

## Gates (measured, not assumed)

| Gate | Mission start | Now (2026-07-29 04:20) |
|---|---|---|
| `npx tsc --noEmit` | 0 errors | **0 errors** |
| `npx eslint` on changed files | clean | **clean** |
| `vitest --project unit` | 843 files / 7,964 passed | **860 files / 8,170 passed, 13 skipped, exit 0** |
| pgTAP (CI, fresh Postgres) | n/a | **34/34** + **9/9** passing; **18** more added, first run in flight |

The suite grew rather than shrank, and no baseline test was flipped to
accommodate a change. **Green stayed green** — which is the point of having
measured it at the start: any red appearing now is ours.

---

## Scale of the surface (measured)

| Thing | Count |
|---|---|
| `src/app/baseball/**` page.tsx | **107** |
| Baseball-related TS/TSX files | **~1,043** |
| Lift Lab files | **~198** |
| Files referencing "recruit" | **~151** |

This is a large product, not a prototype. Any plan that assumes a small surface
is wrong.

---

## Environmental hazards (identified up front)

### H1 — Shared working tree with another live session ⚠️ ACTIVE
Another Claude session is working in the SAME directory on golf CRM + landing
(~107 uncommitted files, last write ~2h before mission start, messaged at
23:12 EDT). Their files are in `src/app/golf/admin/crm/**` and
`src/components/landing/**` — disjoint from baseball, but the git index is
shared.

**Guard:** never `git add -A` / `git commit -a`. Stage explicitly by path,
every time. Verify with `git diff --cached --name-only` before every commit.
A commit that sweeps in their work would corrupt someone else's night.

### H2 — `.env.local` points at PRODUCTION ⚠️ ACTIVE
`NEXT_PUBLIC_SUPABASE_URL=https://qmnssrrolpinvwjjnufo.supabase.co` — the live
Golf+Baseball production project.

**Assessment:** seeding a *dedicated demo organisation* into prod is this
team's established, sanctioned pattern (`seed-baseball-demo.ts` describes its
org as "safe to ignore in production lists"; cf. the Pat Edwards golf demo
clone). That is legitimate.

**Guard:** demo seeds must be org-scoped and idempotent. Never `DELETE`/
`TRUNCATE` unscoped. Never touch a row outside the demo org. Any destructive
statement must be reviewed before execution. Schema changes go through
migrations, never ad-hoc SQL.

### H3 — Heartbeat durability is limited ⚠️ KNOWN
`CronCreate` is explicitly session-only ("nothing is written to disk, and the
job is gone when Claude exits"). A genuinely durable OS-level scheduler was not
assumed. See `RESUME_INSTRUCTIONS.md` for exactly what was created and what it
does and does not guarantee. **This is stated honestly rather than claimed.**

---

## Active workers

None. All 4 workflows and 12 subagents have completed and their output has been
integrated or explicitly rejected. Work is now serial in this session.

---

## Next actions

1. **Human decision, first thing:** review and apply the RLS migration pair.
   Three live cross-tenant exposures, a 3-step sequence; `CURRENT_PRIORITIES.md`
   has the checklist and `DATABASE_STATUS.md` the reasoning.
   `db-migration-reviewer` is mandated by CLAUDE.md for this shared production
   database.
2. Decide whether CI should keep seeding **production** on every PR. It always
   has; the hardened guard now says so out loud instead of hiding it behind a
   constant named "demo". Surfaced deliberately rather than changed unattended.
3. Finish pgTAP coverage on the `baseball_*` tables that still have none
   (messaging, tasks, travel, announcements, dev plans). The invitation-code
   leak is the argument: it sat in plain sight for two months in a table no
   test touched, and was twice noticed and twice deferred.

---

## The through-line of this run

**Reading is not verifying.** Four of the most serious findings were invisible
to inspection — including to two rounds of adversarial line-by-line review —
and surfaced only by executing something:

- Two RLS recursion cycles that would have taken the whole product down on
  apply (found by CI running the SQL).
- Five functions left anon-callable, because `REVOKE ... FROM PUBLIC` does not
  remove Supabase's role-specific grant to `anon` (same).
- Withheld player PII shipping inside the page's HTML while the client hid it
  in JSX (found by asserting the serialized payload, not the DOM).
- A seed "production guard" that **allowlisted** production (found by running
  it).

It cuts both ways: recon reported a P0 that did not exist. It was retracted in
place and pinned by a test rather than quietly deleted.

---

## Standing rules for every worker on this mission

1. **Verify, never assume.** A route existing, a table existing, a button
   rendering, or a doc claiming completion is not evidence a feature works.
2. **No unsupported completion claims.** Every "done" needs command output or a
   file:line citation.
3. **Strict file ownership.** Parallel writers that share files corrupt each
   other. Never edit outside your assigned paths — report instead.
4. **Never weaken RLS** to make something work.
5. **No mock data in a primary workflow.** Hiding an unfinished surface behind
   the capability flag is legitimate; faking it is not.
6. **Green stays green.** Baseline is 0 type errors / 0 lint / 7,964 tests
   passing. Do not regress it.
