# CodeRabbit Review Workflow — Clearing Stale Review State

> Closes #389. Use this runbook whenever a PR shows a lingering
> `CHANGES_REQUESTED` from CodeRabbit after the flagged findings have already
> been fixed (e.g. after a force-push, or several follow-up commits).

## Command reference

| Command | When to use it |
|---|---|
| `@coderabbitai review` | Incremental re-review of the latest commits. Fast, but can miss context if the diff has drifted a lot from the last review. |
| `@coderabbitai full review` | Forces a clean, from-scratch review of the entire PR against `main`. **Preferred after a force-push** or when several commits have landed since the last review, since incremental review can otherwise compare against a stale base. |
| `@coderabbitai resolve` | Marks CodeRabbit's own open comment threads as resolved. Use after confirming (via a fresh review) that the flagged items are actually fixed — this does **not** re-review, it only clears the thread state. |
| `@coderabbitai approve` | Resolve + approve in one step. Use when you also want CodeRabbit's review decision itself flipped to approved. |

There is **no dedicated "dismiss stale review" command**. CodeRabbit's
`CHANGES_REQUESTED` decision only updates when it posts a new review (via
`review` or `full review`); merely fixing the code without re-triggering a
review leaves the stale decision in place.

## Recommended flow

1. **Confirm the fix** — re-read each previously flagged finding against the
   latest pushed commits. Note which are genuinely fixed vs. still open.
2. **`@coderabbitai full review`** — trigger a fresh, full-PR review so
   CodeRabbit's decision reflects the current diff, not a stale one.
3. **`@coderabbitai resolve`** — once the fresh review confirms no actionable
   items remain, resolve the outdated comment threads.

## If `CHANGES_REQUESTED` still blocks merge

- Branch protection has **"Dismiss stale pull request approvals when new
  commits are pushed"** enabled (see `.github/branch-protection.md`) — this
  clears stale *human* approvals on new commits automatically, but does not
  by itself flip a bot's `CHANGES_REQUESTED` review decision.
- If CodeRabbit's review decision itself is stale after step 2–3 above, a
  maintainer can manually dismiss the stale review from the PR's **Files
  changed → Reviewers** panel.

## Acceptance checklist

- [ ] Confirmed every previously flagged finding is fixed in the latest commits
- [ ] Posted `@coderabbitai full review`
- [ ] Fresh review shows no actionable items
- [ ] Posted `@coderabbitai resolve`
- [ ] `CodeRabbit` status check is green / decision is no longer blocking

See also: [`docs/CI_RUNBOOK.md`](../CI_RUNBOOK.md) for triaging other red/pending
PR checks, and [`.github/branch-protection.md`](../../.github/branch-protection.md)
for the enforcement policy this workflow operates under.
