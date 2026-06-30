# Qodo Issue Wiring

Qodo Review is PR-centered. It uses GitHub Issues as ticket context when a pull
request description links the issue.

## Install Qodo

Use the hosted GitHub app install flow:

- Current Qodo GitHub Cloud install docs: <https://docs.qodo.ai/install-and-configure/install/github/qodo-multi-tenant>
- Qodo portal: <https://app.qodo.ai/signin>
- Free open-source GitHub app: <https://github.com/apps/qodo-merge-pro-for-open-source>

For a private repository, install from the Qodo portal using the GitHub Cloud
multi-tenant wizard and select `njrini99-code/helmv3`.

## Issue Linking Contract

Qodo recognizes GitHub issue references in PR descriptions. Use one of:

- `Closes #123`
- `Fixes #123`
- `Related to #123`
- `https://github.com/njrini99-code/helmv3/issues/123`
- `njrini99-code/helmv3#123`

The repo PR template now includes a `Linked Issues For Qodo` section. Every
issue-fix PR should list the issue IDs there so Qodo can fetch the issue body
and review the implementation against the ticket.

## Repo Guardrail

`.github/workflows/qodo-issue-context.yml` runs on pull requests and warns when
a non-Dependabot PR does not reference a GitHub issue. The check is advisory so
it will not block urgent fixes, but it makes missing Qodo ticket context visible.

## Verify Qodo

After installing the GitHub app:

1. Open or edit a PR that contains a linked issue reference.
2. Confirm Qodo comments or posts a review.
3. Comment `/agentic_describe` on the PR.
4. Comment `/agentic_review` on the PR.
5. Confirm the response uses the linked issue context.

## Notes

Qodo is not a GitHub issue-enrichment bot like CodeRabbit. It does not enrich
issues directly. The supported path is: issue -> linked PR description -> Qodo
pull request review.
