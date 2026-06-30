# Meticulous AI — Setup Guide

Meticulous records real user sessions in preview/staging and replays them on every PR to catch visual and workflow regressions automatically.

## Status

| Item | State |
|---|---|
| GitHub workflow placeholder | `.github/workflows/meticulous-advisory.yml` |
| Repository secrets | **Not configured** — workflow skips |
| Vercel preview integration | **Manual setup required** |

## 1. Create a Meticulous account

1. Sign up at [https://meticulous.ai](https://meticulous.ai)
2. Create a project for **Helm Sports Labs (helmv3)**
3. Copy the **API token** from project settings

## 2. Install the GitHub App

1. Open [Meticulous GitHub App install](https://github.com/apps/meticulous-ai/installations/new)
2. Select the `helmv3` repository
3. Grant read access to code and write access to checks/comments (for PR diff reports)

## 3. Configure repository secrets

In **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `METICULOUS_API_TOKEN` | API token from Meticulous dashboard |
| `METICULOUS_PROJECT_ID` | Project ID (optional; uncomment in workflow) |

Once `METICULOUS_API_TOKEN` is set, `.github/workflows/meticulous-advisory.yml` runs on every PR (advisory — `continue-on-error: true`).

## 4. Vercel preview integration

1. In Meticulous dashboard → **Integrations → Vercel**
2. Connect your Vercel team/project
3. Enable recording on **Preview** deployments only (not production)
4. Add the Meticulous script snippet to your app if prompted — for Next.js this is typically injected via Vercel integration or a small client bootstrap in `src/app/layout.tsx` (follow Meticulous docs for the current snippet)

Recommended: record sessions against `/golf` and `/baseball` dashboard flows with seeded test accounts.

## 5. What Meticulous catches

- Visual regressions on recorded workflows (layout, CSS, component swaps)
- Broken navigation paths that Playwright smoke tests miss
- Client-side errors during multi-step flows (onboarding, round entry)

## 6. Relationship to Playwright visual tests

| Tool | Scope | When it runs |
|---|---|---|
| **Meticulous** | Real recorded user flows | Every PR (when configured) |
| **Playwright visual** (`npm run e2e:visual`) | Fixed public-route screenshots | Local + advisory CI |
| **Chromatic** (optional) | Storybook/component snapshots | Optional upgrade — see `BUG_DISCOVERY_STACK.md` |

Meticulous complements — does not replace — the in-repo Playwright visual baselines under `e2e/visual/__snapshots__/`.
