# Agent operations — working-style standing orders and machine/tool gotchas

Durable facts about how agents should operate in this environment and how
specific tools misbehave here — as opposed to `memory/context/
engineering-methodology.md`, which holds product/codebase verification
lessons. Created 2026-09-05 while folding the machine-local auto-memory
corpus into this repo's Git-backed memory; see `memory/decisions/
2026-09-05-control-plane-reset.md` for the whole operation. Each entry cites
its source auto-memory note by filename and date.

## Standing working-style orders

- **Announce shared-state work proactively, before or while doing it — do
  not wait for a collision to surface.** Owner instruction: "Always
  communicate with the other sessions if something's being worked on."
  Multiple interactive sessions routinely share one checkout — one `HEAD`,
  one index, one set of files — and in one evening that produced a peer
  nearly sweeping a stranger's file into a push, a session writing into
  another session's private scratchpad, and a peer clearing a worktree for
  removal while its own process still held a handle inside it. Announce
  before pushing to `main`, editing shared config
  (`.claude/**`, `.github/workflows/**`, `CLAUDE.md`/`AGENTS.md`), removing
  worktrees or branches, changing repo-wide git config, or fanning out many
  background agents over the tree — say what changed, the commit SHA, and
  what was deliberately left untouched. A peer session can resolve a
  collision question ("is anyone using this?"); a peer can never authorize
  an outward-facing or destructive action on your behalf, and a peer's
  answer to "is this in use" should be checked against the filesystem, not
  taken purely on faith. (STU, source:
  `tell-peer-sessions-before-touching-shared-state.md` dated 2026-08-18.)
- **An overnight or long-running remediation loop does not self-terminate on
  an empty queue — an empty queue means the last audit's aperture was too
  narrow, not that the work is done.** When told to keep looping until
  explicitly stopped, treat that as the governing instruction: re-audit,
  widen scope, and start the next wave rather than reporting "done." The
  re-audit should attack the fixes already made (would each regression test
  actually fail against the old code; can an auth fix be bypassed by a path
  not considered; did a deletion remove something dynamically reachable),
  not merely re-scan the repo for new issues. Subagents doing fan-out
  investigation (finders, skeptics, inventory sweeps) should run on a
  faster/cheaper model where breadth matters more than depth; synthesis,
  adversarial judgment about whether a finding is real, and anything
  touching a protected invariant (see `memory/features/
  golf-round-lifecycle.md`'s player-data constraint) stay with the
  orchestrating session. (STU, source:
  `overnight-loop-and-subagent-model.md` dated 2026-08-19.)
- **A background macOS reboot can wipe an uncommitted worktree entirely, and
  most — not all — of the lost work is recoverable from subagent
  transcripts.** Each subagent's transcript file holds every `Edit`/`Write`/
  `MultiEdit` tool call with its full input and result; replaying them in
  order into a freshly recreated `git worktree add <dir> <branch>` (skipping
  any call whose result was an error) restores that class of change. What
  the replay cannot see is anything done through Bash — `sed -i`, `rm`,
  heredocs — so after a replay, grep the transcripts' Bash commands
  specifically for file-mutating ones and re-apply by hand. After any
  unexplained session death, check `uptime` before assuming anything else
  went wrong. Commit a checkpoint (`git add <explicit paths>`) the moment
  each agent reports, rather than only at the end of a run, precisely
  because a wipe can happen mid-run. (STU, source:
  `private-tmp-worktree-wipe-and-transcript-replay.md`, no date field —
  2026-09-02.)
- **`vercel env pull` and `vercel env ls` cannot tell you whether a sensitive
  variable is actually set.** A pull writes every sensitive/encrypted value
  as an empty string, and `env ls` shows only "Encrypted" — an empty read is
  not evidence of an unset variable. To tell masking from genuinely empty,
  compare the length of several variables from the same pulled file: public
  vars come through populated, every sensitive one reads length 0 regardless
  of its real value, so pull one variable you *know* is set and working (a
  cron secret that demonstrably runs jobs is a good control) — if it also
  reads length 0, the whole pull is masked and carries no signal. Prove a
  variable's real effect by asking the system that consumes it whether it
  worked (a job-log row recording `sent: true`/`skipped: false`, for
  example) rather than by reading the variable's value at all. Delete a
  pulled env file when done — it holds real secrets for every
  non-sensitive variable. (STU, source:
  `vercel-env-pull-masks-sensitive-values.md` dated 2026-07-30.)

## Machine and tool gotchas

- **A repo checked out under `~/Downloads` sits under a macOS TCC-protected
  location, and access can be revoked mid-session, not just at session
  start.** The denial is partial and therefore easy to miss: `stat` and
  creating a brand-new file both keep succeeding while `listdir`, reading a
  pre-existing file, overwriting a pre-existing file, and renaming over a
  pre-existing file all start failing with `EPERM`. Because file creation
  still works, an agent under this condition does not fail loudly — it can
  write its output next to the intended target with a different name and
  report success, leaving a red working tree where new files exist at their
  real paths while the modules they were meant to replace stay stranded.
  This is kernel `EPERM`, not a Claude Code sandbox restriction — it
  reproduces with the sandbox disabled and through other processes equally.
  The signature that distinguishes it from a plain filesystem problem is
  `stat` succeeding while `listdir` fails and creates still work; a plain
  POSIX problem would fail `stat` too. If a long agent run is planned from
  a `~/Downloads`-rooted checkout, verify writes still work end-to-end
  first, and afterward check for stranded files with a filename-pattern
  search for whatever ad hoc suffix an agent might have used to avoid
  overwriting a protected path. (STU, source:
  `downloads-tcc-lock-breaks-writes.md` dated 2026-07-24 — machine-specific
  to this checkout's location; re-check if the checkout has since moved.)
- **A `git push` to this repo's remote that appears to hang in the
  foreground with no output and no error is very likely the Bash tool's own
  network sandbox aborting the HTTPS proxy `CONNECT` tunnel, not a
  credential prompt waiting on a GUI.** The tell that separates this from an
  actual credential problem: `git fetch` succeeds in the same session while
  `push` hangs — fetch traffic is allowed through the sandbox, the push's
  `CONNECT` tunnel is what gets refused. Re-running the identical push with
  the sandbox disabled for that one command succeeds immediately, with no
  credential prompt and no hook involved. Running the push in the
  foreground hides the real error (`fatal: unable to access '...': Proxy
  CONNECT aborted`); running it backgrounded, or capturing stderr, surfaces
  it. Agents in this environment CAN push to the remote — do not conclude
  otherwise and hand the push back to the user as a blocked step. (STU,
  source: `git-push-hangs-are-not-credentials.md` dated 2026-08-15.)
- **A libgit2-linked tool can abort with a dyld error on this machine** if
  the installed `libgit2` binary is linked against an `libllhttp` version
  newer than what's actually installed — effects include `git show
  <ref>:<path>` blob reads crashing (use the `Read` tool or `git --no-pager
  diff <ref> -- <path>` instead; plain `git diff`/`log`/`fetch`/`worktree`/
  `commit`/`push` are unaffected), and `gh pr create` printing the dyld
  error while the underlying API call still succeeds — check the tool's
  returned URL/exit rather than assuming failure from the printed error.
  (STU, source: `helm-review-merge-and-deploy-ops.md` dated 2026-08-16 —
  the rest of that note's deploy-policy history is superseded by
  `.claude/rules/shipping.md`'s current "push does not deploy" / on-demand
  promote / `scripts/deploy-prod.sh` documentation and is not repeated
  here.)
- **The Notion query API used by MCP tools in this environment has a hard,
  workspace-wide, rolling usage cap on `notion-query-data-sources`
  (roughly six queries), shared across every routine and session rather
  than reset per run.** A routine that runs shortly after another one that
  used the API should assume it has zero queries remaining rather than
  spend a call discovering the cap, and fall back to `notion-search` +
  per-row `notion-fetch`, or to `notion-query-database-view` against a
  saved view (a separate quota that can remain available even after the
  data-source query cap is hit, and — unlike search — reports `has_more`,
  so absence of a row is provable). Budget any available data-source
  queries on aggregates (`MAX(...)`, `COUNT(*)`) first, since one aggregate
  per database usually establishes both a sweep boundary and a safe dedup
  floor. A bare date-typed column name is not directly queryable in this
  API; use the expanded `date:<Column Name>:start` form. (STU, source:
  `mission-control-sweep-ops-gotchas.md` dated 2026-07-30, extracted for
  this one durable API-usage fact; the note's extensive dated run-logs are
  operational history for a specific internal routine and are not repeated
  here.)

- **The Vercel REST/CLI deployment-state filter `state=ERROR` also returns
  deployments in the `BLOCKED` state**, and the `vercel ls` CLI renders a
  `BLOCKED` deployment as `UNKNOWN` rather than surfacing the real state
  name. A `BLOCKED` deployment targeting production is not an infrastructure
  error in the usual sense, but it is a production-target build that never
  shipped and is worth a human look — page all recent deployments and tally
  the `state` field yourself rather than trusting a single filter or the
  CLI's rendering to catch it. (STU, source:
  `weekly-metrics-snapshot-routine.md` dated 2026-07-30, extracted for this
  one durable Vercel API/CLI fact; the rest of that note is a specific
  internal metrics routine's per-run history and is not repeated here.)

## Open, unresolved

- **`next dev` logs a server action's full argument list, including
  plaintext, to the dev server's own stdout/log file.** A login action that
  takes a password as a positional argument writes the live credential
  value into the dev log on every sign-in attempt during local development —
  and into any agent transcript that subsequently reads that log. The
  practical mitigation is sending dev-server output to `/dev/null` so the
  credential never lands on disk; the durable product fix (not passing a
  password as a positional server-action argument) had not landed as of the
  source note. If you start a dev server and drive an authenticated login
  through it, treat the credential as exposed for that session and prefer
  redirecting its output. Status unverified since 2026-08-16 — re-check
  whether `loginAction`'s signature has since changed before assuming this
  is still live. (STU, source: `dev-server-logs-the-login-password.md`
  dated 2026-08-16; this is listed as still open rather than fixed.)
