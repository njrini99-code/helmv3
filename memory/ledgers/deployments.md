# Production deployment ledger

Layer: `memory/ledgers/` (semantic history — see `memory/ledgers/README.md`).
Schema and rationale: `docs/ai-system/GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md`
§7 and §32 (release SHA is the causal join key across GitHub/Vercel/Sentry/
Bridge). Runtime contract: `memory/system/golfhelm-engineering-os.md`
("Release" section).

One row per production promote (`vercel deploy --prod` / `vercel promote`,
whichever the owner actually ran — this repo's release mechanism is an
on-demand CLI promote, not an auto-deploy; see CLAUDE.md §0). The release
routine (once `release:*` scripts land) appends here automatically after
every release-workflow deploy; until then, entries are added by hand when a
promote happens.

**Budget note:** `config/release-policy.yml`'s ≤2-routine-deploys-per-
calendar-week ceiling is adopted starting **2026-08-21** (the date this
ledger and the policy file were installed). The entries below predate or
coincide with that adoption date and are a historical backfill for
provenance — they do not retroactively count against, or already exceed, a
budget that did not exist yet when they happened. `release:budget` (once
built) should start counting from the adoption date forward.

**Honesty note on the backfill below:** deployment IDs and timestamps came
from operator-reported context during this install; git SHAs were
cross-checked against `git log` where the deployment ID or an explicit SHA
was given, and left `unknown` everywhere a promote's exact SHA could not be
independently confirmed. A promote is a manual action that does not
necessarily target the most recent commit on `main` at that moment, so
guessing "nearest commit by timestamp" would be a plausible-looking but
unverified fabrication — exactly what `.claude/rules/shipping.md` calls out
as worse than an admitted gap. Backfilling the `unknown` rows with real SHAs
(via `vercel ls` / the Vercel dashboard's deployment detail page, which
records the exact deployed commit) is open follow-up work, not done here.

| Date (ET) | Deployment ID | SHA | Type | Verified in prod | Notes |
|---|---|---|---|---|---|
| 2026-08-20 ~13:12 | unknown | unknown | routine (backfill) | not recorded | Reported by operator context; not independently confirmed this pass. |
| 2026-08-20 ~22:01 | unknown | unknown | routine (backfill) | not recorded | Same. |
| 2026-08-20 ~22:32 | unknown | unknown | routine (backfill) | not recorded | Same. |
| 2026-08-21 09:17 (13:17 UTC) | `helmv3-bnlc2wvx5` | unknown | routine (backfill) | not recorded | Deployment ID given directly; nearest `main` commit by timestamp is `4336062bf` (12:58:34 UTC, ~19 min before promote) but that is a timing correlation, not a confirmed deployed SHA — not recorded as `sha` for that reason. |
| 2026-08-21 14:10 (18:10 UTC) | `helmv3-4ildzo7g3` | `a4e68d37a` | routine (backfill) | not recorded | SHA given directly by operator context; confirmed to exist in `git log` as `docs: regen inventory blocks (#1577)`, committed 2026-08-21T17:05:27Z — about 65 min before the reported promote time, consistent with a promote of a just-merged commit. |
| 2026-08-22 15:32 (19:32 UTC) | `dpl_3cEBhP4RZ72qXbY2W8UWW19Svnkp` | `5eececafc930c1d10718371bd2954c9ec32e758c` | routine | immediate smoke passed; 24h Sentry observation pending | PR #1601 / issue #1598 stale active-round deletion recovery. Built from a pristine checkout pinned to this SHA; homepage 200, protected continuation route redirected to login, and no error-level runtime logs were present after smoke requests. |
| 2026-08-22 21:53 (01:53 UTC) | `dpl_Dyi1PUxGBTjoQvoZAza25wwRhZP4` | `b63bc1c292a04bd4015ff7e61e516f4872812d96` | hotfix | health check passed | Confirmed-snapshot recovery prompt repair. Vercel remote build passed; `https://helmsportslabs.com` is aliased to this deployment. `/api/health` returned HTTP 200 with `status: healthy`, `database: ok`, and this deployment ID. |
| 2026-08-22 22:24 (02:24 UTC) | `dpl_Cb4MZWPLPfZ5EDAMJcG3Pgg1zggQ` | `82aaa3bf7c26fe7b956f6310e9f7f18ac6029323` | owner-directed emergency hotfix | health check passed | Qualifier lifecycle now permits only `upcoming` → `in_progress` after a submitted round. Scheduled dates and player progress cannot complete a qualifier; only a coach's explicit action can. Vercel build, remote TypeScript, and production health/database checks passed. |
| 2026-08-23 20:56 (00:56 UTC) | `dpl_BMemdtccwZX5F3w24NyWLkWWRkoE` | `e84b9eac777360593103f2637b70aa2ab6ad1872` | owner-directed emergency hotfix | health check and targeted Bridge scan passed | PR #1610 applied the scoped completed-round derived-stats and CoachHelm-terminal-state safeguards. Production alias, public homepage, and target database invariants were verified. |
| 2026-08-23 21:05 (01:05 UTC) | `dpl_4p7QHBj7FRFeKEVPZNV5UvrSNaUw` | `e84b9eac777360593103f2637b70aa2ab6ad1872` | owner-directed emergency configuration rollout | health check and targeted Bridge/runtime scans passed | Same validated application SHA redeployed after replacing the stale Vercel `INNGEST_SIGNING_KEY` with the current Inngest Production signing key. `helmsportslabs.com` aliases this deployment. |
| 2026-08-24 21:37 | `dpl_6FqjhTCq3UnSjT7Ch4pMJRwLegtJ` | `f6a4c0da2` | promote (backfill 2026-08-25) | not recorded at the time | Promote of a preview built from branch `observability/sentry-supabase-tracing` (round-submit/autosave spans, outcome taxonomy, trace_id correlation). Initiator recorded by Vercel as `claude-code_2-1-241_agent`. Backfilled from the Vercel deployments API (the canonical deployment record); ID and SHA are Vercel's own, not inferred. |
| 2026-08-25 09:10 | `dpl_GuZkC9VZU9wQGTe7VpyY5jcQHj9g` | `c652a9e35` | emergency (backfill 2026-08-25) | not recorded at the time | `fix(golf): harden round lifecycle reliability (#1614)` from `main`. Initiator recorded by Vercel as `codex`. Backfilled from the Vercel deployments API. |
| 2026-08-25 10:11 | `dpl_9EfiJZog8gXWjGQdXotKm2ubUnyk` | `c652a9e35` | emergency (backfill 2026-08-25) | not recorded at the time | Same SHA re-deployed. Initiator `codex`. Backfilled from the Vercel deployments API. |
| 2026-08-25 10:27 | `dpl_61SdCkv4v4Ffc22AHyDrbY3HUDza` | `c652a9e35` | emergency (backfill 2026-08-25) | not recorded at the time | Same SHA re-deployed. Initiator `codex`. Backfilled from the Vercel deployments API. |
| 2026-08-25 12:20 | `dpl_5hg86XihiF3FVuS1hcgd38e2ovJ8` | `92de87184` | emergency (backfill 2026-08-25) | serving production as of 2026-08-25 evening | `fix(golf): preserve qualifier round progression` — `main`'s tip at deploy time. Initiator `codex`. Backfilled from the Vercel deployments API. |
| 2026-08-27 15:06 | `dpl_ASf9gwg2kioaL5DKcDFYMQ1eqSUg` | `2d024e035` | routine — owner-approved, over the weekly ceiling (see budget note) | YES — verified 2026-08-27, Vercel deployments API reports state READY, target production, gitCommitSha 2d024e03584ceed4eb66e2d79f1aede04c87d475 | Five merged PRs in one promote: #1634 resolution lifecycle, #1635 Supabase error codes + the team-chat empty-inbox bug, #1636 `integrations` registered, #1637 Inngest fingerprint collapse, #1640 errors-tab/overview redesign. Promoted from a worktree pinned at the exact merged SHA (`/private/tmp/helmv3-release`, detached at 2d024e035, zero dirty files) — NOT from the canonical checkout, whose local `main` was 6 ahead / 5 behind origin with another session's unpushed commits; a CLI deploy uploads the local tree, so promoting from there would have shipped six commits that never went through CI. Owner ran the CLI: the agent-facing guard (`guard-bash.sh` rule 12) blocks `vercel … --prod` and was NOT modified. Recorded within the hour, not backfilled. |

**Canonical-source note (2026-08-25):** the Vercel deployments API is the
canonical record of what deployed, when, from which SHA, and by which
initiator — every backfilled row above was copied from it, not inferred.
This ledger is the curated mirror that adds what Vercel cannot know:
approval source, verification outcome, and release context. Until the
`release:*` scripts automate the append, any promote that reaches this
file late must be backfilled from the Vercel record within a day. The five
rows above were recorded 12 hours to 4 days late — that gap, not any single
deploy, is the control-plane defect (tracked as the open
deployment-provenance item). Budget note: the four 2026-08-25 deploys were
owner-attended emergency work during the round-lifecycle incident; the
≤2/week routine ceiling stands, and the owner's explicit record of this
exception is this sentence.

## How to backfill the `unknown` cells

1. `vercel ls --scope <team>` or the Vercel dashboard's Deployments tab for
   this project, filtered to production, for 2026-08-20/21.
2. Each deployment's detail page records the exact git commit SHA it built
   from — copy that, not a commit inferred from timestamp proximity.
3. Replace `unknown` in the `SHA` column and update this note's "Honesty
   note" paragraph to reflect what's now confirmed vs. still open.
