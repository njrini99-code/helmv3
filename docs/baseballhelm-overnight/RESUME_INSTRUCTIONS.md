# RESUME INSTRUCTIONS — read this first

You are picking up an in-flight overnight mission to make BaseballHelm
sellable. This file exists because the run is expected to outlive any single
agent context.

## 60-second orientation

```bash
cd /Users/ricknini/Downloads/helmv3
git branch --show-current            # expect: baseball/overnight-completion
git log --oneline main..HEAD         # what this mission has landed so far
cat docs/baseballhelm-overnight/MISSION_STATE.md
cat docs/baseballhelm-overnight/CURRENT_PRIORITIES.md
cat docs/baseballhelm-overnight/ISSUE_LEDGER.md
```

Then re-establish ground truth — **do not trust the status files over the
machine**:

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"   # expect: 0
npx vitest run --project unit 2>&1 | tail -5                  # expect: 861 files / 8,181 passed
npm run test:integration 2>&1 | tail -4                       # expect: 5 files / 25 passed
npm run test:business 2>&1 | tail -4                          # expect: 7 files / 52 passed
npm run build 2>&1 | tail -5
```

Mission start was 843 files / 7,964 tests; the suite has grown, not shrunk,
and no baseline test was flipped to accommodate a change.

**Run these one at a time.** Several concurrent full-suite runs starve
timing-sensitive tests and produce failures that look exactly like a
regression — that happened during this run and cost a round of A/B
investigation to disprove. If you see a small number of unexplained failures,
check `ps aux | grep -c '[v]itest'` before believing them.

**Database work is verified by CI, not locally.** Push and read
`Supabase lint + RLS tests` on PR #1092 — it applies every migration to a
fresh Postgres and runs the pgTAP suites in `supabase/tests/rls/`. That job has
caught, in this run alone: two RLS recursion cycles, five anon-callable
functions, a miscounted pgTAP plan, and a fixture using the wrong id family.
None was visible to reading.

## The two hazards you must respect

**1. Another session shares this working tree.** It owns
`src/app/golf/admin/crm/**` and `src/components/landing/**` (~107 uncommitted
files). **Never `git add -A` or `git commit -a`.** Stage explicitly by path and
verify with `git diff --cached --name-only` before every commit.

**2. `.env.local` points at PRODUCTION** (`qmnssrrolpinvwjjnufo`). Demo seeding
into a *dedicated demo org* is the sanctioned pattern here. Unscoped
`DELETE`/`TRUNCATE`, or any write touching a row outside the demo org, is not.
Schema changes go through migrations only.

## How to resume

1. Read `MISSION_STATE.md` → "Current phase" and "Next actions".
2. Read `ISSUE_LEDGER.md` → work the highest-priority unfinished item (P0 → P1
   → P2). Do not start P3 while a P0 or P1 is open.
3. Check for in-flight background work before relaunching anything:
   `/workflows`, and the task list. Relaunching a running workflow duplicates
   effort and can produce conflicting writes.
4. Continue implementation. **Auditing is not progress.** If you find yourself
   about to write another analysis document, stop and write code instead —
   unless recon genuinely has not landed yet.
5. Update the status files as you go, not at the end.

## Recovery mechanism — what actually exists

Stated honestly, because the mission brief explicitly forbids pretending a
heartbeat exists that does not.

| Mechanism | Durability | What it does |
|---|---|---|
| **This file + the status files** | ✅ On disk, survives everything | The real recovery contract. Any agent, any session, can resume from here. |
| **Git branch + granular commits** | ✅ On disk | Every landed change is recoverable and attributable via `git log main..HEAD`. |
| **`CronCreate` hourly heartbeat** (job `9234a858`, `11 * * * *`) | ⚠️ **Session-only** | Fires at :11 past every hour — which covers the 03:00 checkpoint the brief asked for, and every other hour too — **only while this Claude session is alive and the REPL is idle**. The tool's own documentation: "nothing is written to disk, and the job is gone when Claude exits." It is a stall-recovery nudge, **not** a durable scheduler. Hourly rather than 03:00-only because a single 3am wakeup wastes an hour if the run stalls at 2am. |

**What is NOT claimed:** there is no OS-level (launchd/cron) job that will
restart Claude if the process exits. If the session dies, the run resumes when
a human or a new agent opens this file. That is a real limitation, stated
plainly rather than papered over.

### The one thing that must never happen

**Do not apply a database migration.** Not `mcp__supabase__apply_migration`,
not `supabase db push`, not `psql`. `.env.local` points at the shared
production database serving live Golf users. The RLS work in this run is
authored as files precisely so a human can review and apply it deliberately.
An agent applying step B of that pair unattended converts a two-month-old
confidentiality bug into an immediate outage for both products.

### If you are the heartbeat firing

Do **not** simply report status. Execute:

1. `git log --oneline main..HEAD` — what landed since the last checkpoint?
2. Compare against `CURRENT_PRIORITIES.md` — did the last claimed action
   actually produce a commit? If a priority is marked in-progress with no
   corresponding commit, it **stalled** — restart it.
3. Re-run typecheck / unit tests. Any regression from baseline is now the top
   priority, ahead of new feature work.
4. Check for dead background workers (`/workflows`); relaunch or replace.
5. Resume the highest-priority unfinished item and **write code**.
