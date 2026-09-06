# Idle / to-remove GitHub Apps — 2026-09-06

Report only — no app was uninstalled by this change. Uninstalling a GitHub
App is an owner-only action at
**https://github.com/settings/installations**; this document exists so the
owner can do it in one pass.

## What could not be enumerated

`gh api repos/{owner}/{repo}/installation` and `gh api /user/installations`
both require an app-installation-scoped credential, not the PAT this
session authenticates with:

```
$ gh api repos/njrini99-code/helmv3/installation
{"message":"A JSON web token could not be decoded", "status":"401"}
$ gh api /user/installations
{"message":"You must authenticate with an access token authorized to a
GitHub App...", "status":"403"}
```

There is no `gh api` endpoint reachable from this session that lists every
GitHub App installed on the repo directly (confirmed by
`exec/reads/github.md`'s own §"What I could not verify" from the same
2026-09-06 audit this task is acting on — it hit the identical wall). A
brief-referenced "seven idle apps" list was searched for in
`exec/reads/github.md` §7 and its neighboring "What to remove" section and
was not found there; nothing in this session's file set contains that
specific enumeration. What follows is every app this session could confirm
as idle or slated for removal from the repo's own current documentation
(`.github/branch-protection.md`, `docs/CI_RUNBOOK.md`,
`.claude/rules/code-review-tooling.md`, `exec/reads/github.md`'s
check-run `app.slug` sample from PR #1862 / `cf37ea702`), each with its
source cited. If the owner's browser session at
`github.com/settings/installations` shows more than these, add them here
before uninstalling — this list is not asserted complete.

## Confirmed idle or slated for removal

| App | Status | Reason | Uninstall location |
|---|---|---|---|
| CodeRabbit | Reported uninstalled 2026-09-05 (owner's browser agent, per `exec/reads/github.md` parent-session note) | Dropped as a PR gate 2026-07-20 by founder decision (`.claude/rules/code-review-tooling.md`); absent from PR #1862's check-runs, which is consistent with actually being gone rather than merely silent — but this session has no API path to confirm the installation record itself is deleted, only that it stopped posting. | https://github.com/settings/installations |
| Qodo | Reported uninstalled 2026-09-05 (same source as CodeRabbit) | Same reasoning as CodeRabbit — dropped 2026-07-20, absent from #1862's checks, installation-record removal not independently confirmable from this session. | https://github.com/settings/installations |
| "the external review bot" (repo's own redacted name for the second AI reviewer dropped alongside CodeRabbit) | Deleted 2026-07-20 per `.github/branch-protection.md:158` ("DELETED 2026-07-20; the retired rules directory is gone") | Same founder decision as CodeRabbit/Qodo; the Review Gate + CodeQL cover the same hard rules deterministically (`.claude/rules/code-review-tooling.md`). | https://github.com/settings/installations |
| `semgrep-code-njrini99-code` (Semgrep Cloud Platform App) | Still installed and posting a **non-required** check as of PR #1862 (1m50s–10m46s per run across the two most recent audits) | Owner decision to cancel/remove (2026-09-06, per this task's own brief and `review-gate.yml`'s updated comment at lines 402-408). Redundant with the repo's own `.coderabbit/semgrep/helmv3.yml` custom-rules step in `review-gate.yml`'s `semgrep` job, which is the actual enforcement `AGENTS.md` names — the Cloud Platform scan added a bare community ruleset on top with no repo-specific tuning. | https://github.com/settings/installations |

## Active, not idle — listed for contrast, do not remove

From the same PR #1862 check-run `app.slug` sample
(`exec/reads/github.md` §4): `github-actions` (this repo's own workflows —
CI aggregate, Review Gate aggregate, etc.), `github-advanced-security`
(CodeQL's Analyze legs and Security tab summary — three required contexts
depend on this), `supabase` (Preview Branches integration). None of these
are candidates for removal.
