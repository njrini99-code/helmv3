# Production Deployment Ledger

spec: `docs/ai-system/GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md` §16, §32

One row per production promote — a Vercel `--prod` deploy that moved the
`helmsportslabs.com` alias. This is the source of truth
`scripts/release/check-release-budget.mjs` counts against for the
`routine_max_deploys_per_calendar_week` cap (spec §16), cross-checked
against live Vercel where readable. Parsed by `parseDeploymentLedger()` in
`scripts/release/lib/release-common.mjs` — the table header row below
(`date_utc | sha | ...`) is what the parser looks for; do not rename those
columns without updating that function.

Append a row after every real production promote. `.github/workflows/production-release.yml`'s
deploy job does this automatically for releases that go through the
workflow. A manual `scripts/deploy-prod.sh` promote must be recorded by hand
until that path is retired.

Columns: `date_utc` (ISO 8601 UTC, when the alias moved) · `sha` (`unknown`
if not captured at promote time — never guessed) · `short_sha` ·
`vercel_deployment_id` · `type` (`routine` \| `emergency`) · `initiated_by`
(`unknown` if not captured) · `notes`.

| date_utc | sha | short_sha | vercel_deployment_id | type | initiated_by | notes |
|---|---|---|---|---|---|---|
| 2026-08-21T13:17:00Z | unknown | unknown | helmv3-bnlc2wvx5 | routine | unknown | Backfilled at OS adoption (2026-08-21). This deploy predates the ledger and this release tooling; the commit SHA and initiator were not captured at promote time and are recorded as `unknown` rather than guessed. Source: campaign notes (deployment id + timestamp only) — not `vercel inspect`, which was not run at the time. |
| 2026-08-21T18:10:00Z | unknown | unknown | helmv3-4ildzo7g3 | routine | unknown | Backfilled at OS adoption (2026-08-21), same caveat as above. This is the 2nd deploy of its calendar week (Mon 2026-08-17 – Sun 2026-08-23, America/New_York) — with both rows present, `release:budget` correctly reports 0 routine slots remaining for that week instead of undercounting on the day this ledger first ships. |

<!--
Budget counting starts at adoption (spec §16 intent; campaign note
2026-08-21 16:09 ET). The two rows above exist so a `release:budget` run on
adoption day does not wrongly report slots that were already used. If a
`sha`/`initiated_by` value here can later be confirmed (e.g. by matching a
Vercel deployment's git metadata, if any was recorded, or by asking the
person who ran the CLI promote), replace `unknown` with the confirmed value
— do not backfill a guess in its place.
-->
