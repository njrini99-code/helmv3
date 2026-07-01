# Mission Control Next Steps

After merging Phase 1, do this in order.

## 1. GitHub

- Create labels from `GITHUB_LABELS_AND_PROJECT_SETUP.md`.
- Create project `Helm Engineering Control`.
- Add views and custom fields.
- Confirm branch protection on `main`.

## 2. Huly

- Create workspace `Helm Sports Labs`.
- Create spaces from `HULY_WORKSPACE_SETUP.md`.
- Connect GitHub repo if available.
- Create the Mission Control home page.

## 3. n8n on Mac mini

- Start Docker Compose from `N8N_MAC_MINI_SETUP.md`.
- Configure private editor access.
- Configure public webhook URL.
- Add credentials.

## 4. First automation

Build `GitHub → Git Activity Timeline` first.

Minimum test:

```text
Open dummy issue
  → timeline card appears
Open dummy PR
  → timeline card appears
Close dummy PR
  → shipped/closed update appears
```

## 5. Second automation

Build `Partner Request → Issue Court → GitHub Issue`.

Minimum test:

```text
Submit dummy partner bug
  → n8n classifies it
  → GitHub issue created
  → Huly card linked
  → no PR until safe gate is approved
```

## 6. Claude enablement

Only after dummy tests:

- Add `ANTHROPIC_API_KEY` as repo secret.
- Set repo variable `ENABLE_CLAUDE_CODE_ACTION=true`.
- Test on a docs-only issue.
- Then test on a low-risk UI issue.

Do not test first on auth, database, billing, production data, or security-sensitive work.
