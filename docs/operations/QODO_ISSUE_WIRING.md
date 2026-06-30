# Qodo + Linear Ticket Wiring

Qodo Review is PR-centered. It uses GitHub Issues and Linear tickets as ticket
context when a pull request description, title, or branch name links the ticket.

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

Qodo also recognizes Linear tickets once Linear is connected in the Qodo portal.
This repo is configured for the Linear workspace:

- Linear base URL: `https://linear.app/helmmmm`
- Team key: `HEL`

Use one of:

- `HEL-123`
- `https://linear.app/helmmmm/issue/HEL-123/slug`
- Branch prefix: `HEL-123-short-description`
- Branch path: `fix/HEL-123/short-description`

The repo PR template now includes a `Linked Tickets For Qodo + Linear` section.
Every issue-fix PR should list the GitHub issue IDs and/or Linear ticket IDs
there so Qodo can fetch ticket context and review the implementation against the
ticket.

## Qodo Config

`.pr_agent.toml` sets:

```toml
[linear]
linear_base_url = "https://linear.app/helmmmm"
```

This enables Qodo to resolve shortened Linear ticket IDs such as `HEL-123`.

## Repo Guardrail

`.github/workflows/qodo-issue-context.yml` runs on pull requests and warns when
a non-Dependabot PR does not reference either a GitHub issue or a Linear ticket.
The check is advisory so it will not block urgent fixes, but it makes missing
Qodo ticket context visible.

## Verify Qodo

After installing the GitHub app:

1. Open or edit a PR that contains a linked GitHub issue or Linear ticket.
2. Confirm Qodo comments or posts a review.
3. Comment `/agentic_describe` on the PR.
4. Comment `/agentic_review` on the PR.
5. Confirm the response uses the linked issue context.

## Verify Linear

After connecting Linear:

1. Create or choose a Linear issue such as `HEL-123`.
2. Create a branch named `fix/HEL-123/short-description`.
3. Open a PR whose body includes `Related to HEL-123`.
4. Confirm the GitHub PR appears in the Linear issue activity.
5. Confirm Qodo references the Linear ticket context in review output.

## Notes

Qodo is not a GitHub issue-enrichment bot like CodeRabbit. It does not enrich
issues directly. The supported path is: ticket -> linked PR description/branch
name -> Qodo pull request review.
