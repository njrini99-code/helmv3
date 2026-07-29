# DECISION LOG

Decisions taken autonomously during the run, with the reasoning, so they can be
audited or reversed later.

---

## D1 — Recon before code (2026-07-28 23:33 EDT)
**Decision:** Spend the first block on a 10-worker read-only reconnaissance
pass instead of starting implementation immediately.

**Why:** the surface is ~1,043 baseball files / 107 routes / ~151 recruiting
references. Writing code against an assumed structure would mean rewriting it
once the truth was known. Recon is read-only, so it cannot conflict with the
other live session or with itself, and it runs 10-wide in parallel — the cost
is wall-clock minutes, not hours.

**Guard against the obvious failure mode:** the brief explicitly forbids
stopping at analysis. Recon output feeds directly into implementation teams;
it is not a deliverable in itself.

---

## D2 — Branch, not worktree (2026-07-28 23:32 EDT)
**Decision:** work on `baseball/overnight-completion` in the shared tree rather
than creating a git worktree.

**Why:** `EnterWorktree` is gated to explicit user/CLAUDE.md request, which was
not given. The other session's files are disjoint (golf CRM + landing). The
real risk is the shared git index, which is controlled by disciplined
path-scoped staging — a technique already proven earlier tonight on the Helm
Bridge branch (22 files staged precisely while 107 foreign files sat
uncommitted alongside).

**Reversal trigger:** if a worker reports touching a golf/landing file, escalate
to a worktree immediately.

---

## D3 — Demo seeding into the production project is legitimate; unscoped writes are not (2026-07-28 23:31 EDT)
**Decision:** allow demo seeding against the production Supabase project,
strictly scoped to a dedicated demo organisation.

**Why:** `.env.local` points at prod, and at first glance that reads as a
hazard to refuse. But the existing seed scripts are dry-run-by-default,
require `--confirm`, and describe their org as "safe to ignore in production
lists" — and the team has an established precedent (the Pat Edwards golf demo
clone). This is the sanctioned pattern, not an accident.

**Guard:** org-scoped and idempotent only. No unscoped `DELETE`/`TRUNCATE`, no
write touching a row outside the demo org, schema changes via migration only.

---

## D4 — Heartbeat limitation stated rather than papered over (2026-07-28 23:35 EDT)
**Decision:** create the 03:00 heartbeat with `CronCreate` and document
explicitly that it is session-only.

**Why:** the tool documents "nothing is written to disk, and the job is gone
when Claude exits". The brief says: *"Do not pretend a heartbeat exists if the
environment cannot create one."* The durable recovery mechanism is therefore
the on-disk state files plus granular git commits; the cron is a stall-recovery
nudge layered on top. Claiming OS-level durability would have been false.
