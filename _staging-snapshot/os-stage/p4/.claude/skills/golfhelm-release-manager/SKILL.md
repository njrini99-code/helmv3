---
name: golfhelm-release-manager
description: Prepare a GolfHelm production release candidate — budget check, candidate report, readiness gate, owner approval, and post-deploy verification. Separate from the daily reliability routine, which never deploys. Use for "prepare a release", "can we ship this week", "release day", or when the daily routine's release queue has verified repairs waiting.
---

# GolfHelm Release Manager

The release routine from the GolfHelm Self-Healing Engineering System
(`docs/ai-system/GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md` §26, §40; policy
at `config/release-policy.yml`). This is a **separate routine** from
`.claude/skills/golfhelm-daily-reliability/SKILL.md` — the daily routine
prepares and queues; this skill is the only place a production deploy is
even discussed, and even here it ends in a request for owner approval, not
an autonomous deploy.

## The rule this whole skill exists to enforce

**Maximum two routine production deploys per calendar week (America/New_York),
and that is a ceiling, not a target.** Zero deploys in a week is a fully
successful outcome. Claude can prepare a candidate, run every check, and
write the report — Claude cannot approve or execute the production deploy
itself. Never invoke `vercel deploy --prod`, `vercel promote`, or any
routine-allowlisted `release:prod`/`deploy:prod` script from inside this
skill; the only sanctioned path is the owner-approved
`.github/workflows/production-release.yml` `workflow_dispatch`.

## Procedure

1. **Read production's current SHA.** Prefer the deployment ledger
   (`memory/ledgers/deployments.md`); cross-check against live Vercel
   (`vercel inspect <domain> --scope <orgId>`, orgId from
   `.vercel/project.json`) when available. If neither resolves, stop here
   and report `production SHA unresolvable` — do not guess a candidate diff
   against an unknown baseline.
2. **Read main's current SHA.** `git rev-parse origin/main` (fetch first).
3. **Read the release queue.** `memory/operations/release-queue.yml` —
   every entry with `status: verified` or `queued_for_release`. A raw
   Sentry/Bridge event is never in this file; if you find one, that is a
   bug in the daily routine, not a release-manager input.
4. **Check the release budget.** `npm run release:budget` (
   `scripts/release/check-release-budget.mjs`) — counts deploys already
   recorded this America/New_York calendar week against the ledger (and
   live Vercel where available) and reports `routine_slots_remaining`. At 0
   slots remaining, the routine release workflow refuses to proceed — see
   the emergency rule below before treating that as blocking.
5. **Build the release candidate.** `npm run release:prepare` (
   `scripts/release/build-release-candidate.mjs`) — diffs current
   production SHA against the candidate main SHA and writes
   `docs/releases/<candidate-sha>.md`: commits, PRs, features affected,
   incidents fixed, R0–R3 breakdown, migrations, RLS changes, auth changes,
   test evidence, CI evidence, unresolved incidents, release-queue items
   included, rollback considerations, post-deploy checks.
6. **Identify risky changes.** Any R3 item (migration, RLS, auth, secrets,
   billing, destructive data, production fixtures, branch/deploy
   permissions) in the candidate diff must be called out explicitly and
   individually in the report — never folded into a generic "misc fixes"
   line.
7. **Run the release readiness gate.** `npm run release:check -- --sha
   <candidate>` (`scripts/release/check-release-candidate.mjs`). Fails
   closed on: budget exhausted; candidate not fully identified; required CI
   not green; `npm run repo:doctor` red; `npm run knowledge:registry-check`
   inconsistent; release report missing; unresolved high-risk migration
   state; required memory updates missing; a known P0 blocker; production
   deploy identity unestablishable. Warnings are fine for acknowledged
   low-risk debt; a FAIL is never waved through.
8. **Present the candidate summary to the owner.** SHA, commit range,
   features/incidents affected, risk breakdown, CI/test evidence, budget
   state, rollback plan. This is the artifact the owner approves or
   declines — do not skip straight to requesting the workflow run.
9. **Request/trigger the owner-approved production workflow.**
   `.github/workflows/production-release.yml`, `workflow_dispatch` only,
   gated by a GitHub `production` environment that requires human approval.
   `gh workflow run production-release.yml -f sha=<candidate-sha>` starts
   the request; the actual deploy waits on the environment's approval gate.
   Claude requests the run — Claude does not approve its own gate. If a
   protected environment isn't wired up yet, the production CLI invocation
   (`scripts/deploy-prod.sh`) stays owner-run, outside this routine
   entirely.
10. **If the candidate is not ready, NO RELEASE is a valid successful
    outcome.** Report exactly what blocked it (failing check, exhausted
    budget, missing evidence) and stop. Do not lower a bar to force a
    green.
11. **After a deploy actually happens, run post-deploy verification** (spec
    §27) — one structured pass per deploy, not per repair:
    - Vercel deployment healthy (READY and the alias actually moved — a
      READY build whose alias never moved serves nobody, see
      `scripts/deploy-prod.sh`'s own verification steps).
    - Sentry release active for the new SHA.
    - No new 5xx / new regressions in the post-deploy window.
    - Bridge feature health unaffected or improved for touched features.
    - Every repair the candidate claimed to fix: expected production
      invariant vs. actual post-deploy evidence, one line each. A merged PR
      is not resolution. A successful Vercel deploy is not resolution.
      Production evidence is resolution.
    - Critical synthetic reads pass; cron/job state healthy.
12. **Close the loop.** Update `memory/ledgers/deployments.md` with the
    deployed SHA/deployment id/timestamp; mark every included release-queue
    entry `released`, and only `verified_in_production` once step 11's
    evidence actually confirms it; leave any incident whose fix did not
    verify OPEN rather than marking it resolved on hope. Update
    `memory/features/<id>.md`'s `last_verified_sha`/`last_verified_at` for
    every feature the candidate touched.

## Commands (spec §33)

```bash
npm run release:status    # production SHA, main SHA, queue snapshot
npm run release:budget    # scripts/release/check-release-budget.mjs
npm run release:prepare   # scripts/release/build-release-candidate.mjs
npm run release:check -- --sha <candidate>   # readiness gate, fail-closed
gh workflow run production-release.yml -f sha=<candidate-sha>
```

`release:prod` / `deploy:prod` are deliberately NOT in the routine
allowlist — production mutation only happens through the workflow above or
`scripts/deploy-prod.sh`, run by the owner.

## How release day should work (spec §40)

Production SHA → main candidate SHA → release queue → budget → all CI/
memory/risk checks → candidate report → owner approval → one deployment →
post-deploy observer → close only proven incidents. Eight verified repair
items can ship in one candidate if they're compatible and fully tested —
the report is what makes the combined blast radius legible to the owner,
not a reason to skip explaining each one.

## Emergency override (spec §16 — owner decides, never automatic)

A true P0 discovered after the week's two routine deploys are already used
does NOT become an automatic third deploy. Claude's job in that situation:
investigate, prepare a rollback/fix/mitigation, and explain the risk of
deploying vs. not deploying. Claude does not deploy. The owner explicitly
decides whether the exceptional situation warrants an override. "It's a
P0" is never itself the authorization.
