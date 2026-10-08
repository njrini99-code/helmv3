# Scripts

`scripts/` holds 100+ files: gates and ratchets CI runs, docs and knowledge
generators, database tooling, demo seeders, and one-off CRM, Resend and Stripe
operations. Most have an npm script in `package.json`; those that do not are
run by path.

## Before you run one

Run it with `--help` first. Never run a script with no arguments to find out
what it does: some of the older ones act the moment they start.

    node scripts/<name>.mjs --help
    npx tsx scripts/<name>.ts --help
    bash scripts/<name>.sh --help

Every script that reads a credential (service-role key, Resend, Stripe,
Supabase access token, cron secret) prints its purpose, arguments and the
variables it reads, and exits 0, before it reads an env file or opens a
connection. The shared guard is `scripts/lib/cli-guard.mjs`
(`scripts/lib/__tests__/cli-guard.test.ts`).

## Writers are a dry run until you say `--apply`

A script that writes to a database, sends mail or calls a paid API defaults to a
dry run: it reads what it needs, prints what it would write (`[dry-run] would
insert 12 rows into crm_coaches`), and writes nothing. Pass `--apply` to do it.

    node scripts/send-coach-batch.mjs 10            # who would be emailed
    node scripts/send-coach-batch.mjs 10 --apply    # send

`--apply` together with `--dry-run` is an error. Scripts that already had their
own guard keep it, unchanged, and only gained `--help`: the BaseballHelm and
demo seeders (`--confirm`, `--allow-prod`), `stripe-golfhelm-invoices.mjs`
(`--commit`, `--live`), and the backfills with their own `--dry-run`. CI depends
on some of those, for example `npm run seed:baseball:ci`.

Production database changes are not made with a script from here. Use a
forward-only migration and `npm run db:apply -- <file>`
(`docs/operations/APPLY_PATH.md`).

## Entry points

Three commands cover most days.

| Command | Use it for |
| --- | --- |
| `npm run doctor` | Is this checkout healthy: dependencies, env, tooling |
| `npm run check:changed` | The inner loop: lint, `tsgo` and tests for what you changed |
| `npm run gates:review` | Preview the Review Gate before you push |

`check:changed` diffs against `origin/main` plus uncommitted work and runs one
process at a time (`--list` prints the plan). Type-aware lint, the ratchets, the
build and the full suite stay CI-only. `/gates` in a Claude session picks the
rest.

## CI internals

These exist for GitHub Actions and the control plane. They are safe to run, but
they are not part of a normal day and their output is written for CI logs.

| Script | What it is |
| --- | --- |
| `npm run repo:doctor` | Read-only control-plane integrity check against `config/repo/manifest.yml` |
| `npm run helm-os:check` | `docs:check` plus `knowledge:check` |
| `npm run knowledge:check` | Feature registry and knowledge-base consistency |
| `npm run control-plane:verify` | Verifies the enforcement inventory against live config |
| `npm run guards` | The repo-wide static guards, interpreted one by one |
| `npm run preflight` | A local subset of the static gates; **not** the CI set |

## Other tools worth knowing

| Command | What it does |
| --- | --- |
| `npm run worktrees` | Report on worktrees and branches. Prints 20 rows by default; `--all` prints every row. `npm run worktrees:json` is machine-readable. Progress goes to stderr |
| `npm run dev` | `next dev` on a port derived from the worktree name (3001-3099); the canonical checkout keeps 3000 |
| `npm run dev:stop-idle` | Lists `next dev` servers idle for 2 hours; `-- --apply` stops them. No cron |
| `npm run release:status` | What production serves versus `main`. `--strict` (alias `--check`) exits 1 on drift |
| `npm run knowledge:context` | Builds a context pack for a task and prints the path of its per-run file |

Heavy gates (`typecheck`, `test`, `build`) go through `scripts/serialize.mjs`,
which allows two at a time machine-wide. A gate that cannot get a slot within 8
minutes exits 75 and prints `queued, retry with: <cmd>`; see
`docs/operations/GATES.md`.

## Database types

`npm run db:types` regenerates `src/lib/types/database.ts` from production into
a temp file and moves it into place only after the CLI succeeds. The pre-commit
hook reminds you when a migration is staged.

    npm run db:types          # regenerate (writes the file)
    npm run db:types:check    # compare only; never writes the file

`db:types:check` runs `scripts/check-types-drift.sh`. Without
`SUPABASE_ACCESS_TOKEN` it cannot reproduce the production schema and passes
with a warning.

`./scripts/apply-migration.sh <file> --yes` regenerates types after a migration
has been applied some other way. It does not apply anything and never waits for
a keypress; without `--yes` it prints what to do and exits.

The project id comes from `SUPABASE_PROJECT_ID`, else `.env.local`, else the
host of `NEXT_PUBLIC_SUPABASE_URL`.

## Deleted on 2026-10-07

Nineteen scripts with no reference in `package.json`, a workflow, a hook, a doc,
a test or another script, last touched more than 30 days earlier, were removed:
one-off Stripe invoice runs, CRM migration helpers, two screenshot tools, and
similar. They are in git history. Unreferenced scripts touched more recently
were kept.
