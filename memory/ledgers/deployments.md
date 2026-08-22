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

## How to backfill the `unknown` cells

1. `vercel ls --scope <team>` or the Vercel dashboard's Deployments tab for
   this project, filtered to production, for 2026-08-20/21.
2. Each deployment's detail page records the exact git commit SHA it built
   from — copy that, not a commit inferred from timestamp proximity.
3. Replace `unknown` in the `SHA` column and update this note's "Honesty
   note" paragraph to reflect what's now confirmed vs. still open.
