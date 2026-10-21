# Builder and fixer pipeline

Status: living. Owner decision 2026-10-21: builders build and open PRs, then hand
off to fixers, who get the PR green, keep the docs true, check correctness and
land it. Nobody runs a build or a full gate run more than once per piece of
work. `AGENTS.md` wins where this file disagrees.

## Why this exists

Over 2026-10-06..21 the CI workflow ran 400 times on pull requests: 143 failed,
95 were cancelled by a newer push, 131 passed. A pass takes about 10 minutes
(median 10.5, p90 20) and a failure usually costs a second full run. The
levers are not the fast static checks; the pacer is the Next build (about 10
minutes) plus the runner queue, so the saving is in CI runs not started:
`docs/CI_RUNBOOK.md` has the job-by-job shape, and the measurements behind
these rules are in the project's pipeline folder (`measurements`).

## Roles

| Role | Does | Never does |
| --- | --- | --- |
| Builder | Implements one slice on a task branch. Targeted checks only (`npm run check:changed`, `npm run test:file`). Keeps the PR a draft. Writes the Handoff section when the work is done. | Runs `npm run build`, the full test suite or `gates:review` repeatedly; pushes to chase CI; merges; resolves CI or merge conflicts. |
| Fixer | Takes a handed-off PR, makes it green and correct, updates the docs, lands it. | Rebuilds the feature; widens scope; deploys, `db:apply`, flips a flag (owner only); weakens a test or baseline. |
| Coordinator | Assigns lanes, answers owner questions, watches the queue. | Edits builder code. |

## The PR states

    building -> ready-for-fixer -> fixing -> landed
                      \-> owner-gated (only the gated actions below)

- **building**: a draft PR from the first push. CI is skipped on drafts by
  design (`.github/workflows/ci.yml`; the aggregate fails on purpose), so
  pushing to a draft costs no runner time.
- **ready-for-fixer**: the builder finished the slice, filled the Handoff
  section, stopped touching the branch, unsubscribed from the PR, and set the
  queue entry. The PR stays a draft until the fixer marks it ready.
- **fixing**: a fixer owns the branch. Only the fixer pushes.
- **owner-gated**: label `blocked-owner`, used only when the remaining step is
  one of the gated actions under "Decisions". Everything else keeps moving.
- **landed**: merged through `npm run pr:land -- <n>` (add `--any-branch` for a
  `claude/*` branch).

## Decisions: nobody waits

Agents never sit waiting for an answer. When a call is needed, whoever hits it:

1. Picks the recommended default, continues on it, and records it in the queue
   entry (`decisions`: question, default taken, who to ask).
2. Sends the question to the coordinator in one message (the PR, the options, the
   default). The coordinator approves routine decisions for Nick: merges, design
   defaults, code and scope calls. If the coordinator disagrees it replies with
   the change, and the work is redone from the decision, not restarted.
3. Never routes a decision request to Nick, to another builder, or to the PR.

Production changes follow the owner's rule (2026-10-21: apply them if they do
not affect production in a negative way). The "Production rollout" thread owns
them and applies a migration or deploy only after showing it does no harm.
Builders and fixers never run `db:apply`, apply a held migration or deploy; they
list the change in their queue entry (`gated_for_nick`) for Production rollout.
Flag flips, including the Clubhouse turn-on, stay with the owner and are never
taken on a default. A PR that needs one of these is finished and merged if
green, its entry lists it, and the thread moves on to the next piece of work.

Labels, set by whoever changes the state: `needs-fixer`, `fixer-working`,
`blocked-owner`. GitHub creates a label the first time it is applied.

## Builder contract: what a handed-off PR contains

The PR body keeps the template (`.github/PULL_REQUEST_TEMPLATE.md`) and its
`Handoff` section is filled in, not left as comments:

1. **Spec**: what it does and why, in a few lines, plus the doc or plan it
   implements.
2. **Head SHA** at handoff. The fixer treats any later commit as unreviewed.
3. **Ran**: each command with its exit code, and **Not run** with the reason.
4. **Screenshots** for any UI change (paths or links).
5. **Flags**: each flag touched and its default. **Migrations**: file, and
   whether it is held. Neither is ever turned on or applied by the PR.
6. **Docs**: the feature doc `npm run knowledge:map -- --files <paths>` names,
   and whether the contract changed.
7. **Open risks** and weak spots the builder already knows about.
8. **Decisions**: each call you made on a default, or still need, with the recommended default (the coordinator approves; see "Decisions: nobody waits"). Production changes and flag flips are listed separately.
9. **Do not touch**: files another session owns.

Then, in this order: update the queue entry, unsubscribe from the PR, post one
line to the coordinator. A PR's activity events go to one session at a time, so
the fixer cannot receive them until the builder lets go.

## Fixer contract: what "done" means

1. Read the queue entry and the Handoff section. Do not re-derive the intent.
2. Run `npm run pr:status -- <n>` once for the state. It prints the verdict, the
   failing job and step, whether the retry covers it, and how many CI runs the
   PR has used. `--log` adds the last 40 lines of a failing job. Do not paste
   raw job logs into the conversation.
3. Subscribe to the PR, then work locally, not through CI: reproduce only the
   failing check, fix everything you can see, run `npm run check:changed` and
   `npm run gates:review` once, and only then push.
4. **One push per round.** A push cancels the run in flight, so pushing while
   `pr:status` says `CI_RUNNING` wastes the run. Merge `main` once, only when
   the PR conflicts, and in the same push as the fixes.
5. Docs: update the feature doc if the contract changed; regenerate generated
   blocks with the repo's generator (`npm run docs:regen`), never by hand.
6. Correctness: read the diff against the Spec. Post one `Fixer notes` comment
   listing what you checked and anything you changed or rejected. A finding that
   needs the builder or Nick goes in the queue, not in a silent fix.
7. Mark the PR ready (the one real CI run), wait for the event, land with
   `npm run pr:land -- <n>` when the required contexts are green on the head.
8. Update the queue entry to `landed` and unsubscribe.

A red check that is red on `main` too is not this PR's: port the existing fix or
leave one PR comment saying so. A runner or setup failure (`RED_INFRA`) is
retried once by `.github/workflows/ci-retry-failed.yml`; do not push to re-roll
it and do not re-run by hand.

## Token and CI budget rules (apply to everyone)

- No polling. Wait for the PR event, a scheduled wake, or the next message.
  `pr:status` is for one look per wake, not a loop.
- One local build per finished piece of work, run by the fixer, only when a
  `'use server'` surface changed or a CI build failure needs reproducing. CI's
  `Next build` job is the build of record.
- One CI run per head SHA. Budget per PR: 2 ready-state runs. A third means stop
  and ask the coordinator what is systematically wrong.
- Read less: `pr:status`, `knowledge:map`, the Handoff section, the queue entry.
  Open a log only after `pr:status` says the failure is the change's own work.
- Subagents, workflows and deep research only when the owner asked for them.

## The queue

The shared queue lives in the project's pipeline folder, one JSON file per PR
(`prs/<number>.json`) so two threads never overwrite each other, plus a
`board.mjs` that prints all of them. The schema and the exact commands are in
that folder's README. Each entry carries `state`, the builder and fixer thread,
the handoff head SHA, flags, migrations, docs, risks, decisions taken on a
default, the gated actions waiting on Nick, and a counter of pushes and CI runs so spend per PR is visible.

Per-thread token spend is not visible to the threads; CI runs, pushes and
re-attempts per PR are, and they are the part a builder or fixer controls.
