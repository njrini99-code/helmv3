# helmv3 CircleCI setup

CircleCI owns the things GitHub Actions does poorly:

- **Weekly heavy jobs**: Knip dead-code, Stryker mutation tests on
  CoachHelm V2, full-repo sqlfluff, npm audit, Squawk migration safety.
- **iOS Capacitor compile**: builds on M-series macOS runners (~2×
  faster, ~⅓ the cost of GitHub Actions' `macos-13`). Catches
  Xcode/Capacitor breakage before TestFlight.

GitHub Actions still owns: typecheck, lint, vitest, next build,
Supabase RLS tests, the Review Gate (ast-grep / semgrep / gitleaks /
etc.). Don't move those here — duplicate cost, slower PRs.

## One-time project setup

Org is already installed at https://app.circleci.com/organization/github/njrini99-code. Per-project setup:

1. **Add the helmv3 project** — go to Projects → "Set Up Project" on
   `helmv3` → pick "Fastest" option → confirm config is at
   `.circleci/config.yml`.

2. **Project settings → Advanced**:
   - Enable **"Only build pull requests"** if you want to avoid
     paying for every branch push. Leave OFF if you want push-to-main
     builds (recommended for the iOS smoke-build).
   - Set **GitHub status updates** = ON so PR checks show up.

3. **Project settings → Triggers** (Scheduled Pipelines):
   Add a new trigger:
   - Name: `weekly`
   - Schedule: `0 6 * * 1` (06:00 UTC = 02:00 ET, every Monday)
   - Branch: `main`
   - **Pipeline parameters**: set `run-weekly` = `true` (JSON:
     `{"run-weekly": true}`)
   This is what activates the `weekly` workflow's `when:` clause.
   Docs: https://circleci.com/docs/scheduled-pipelines/

4. **Project settings → Environment Variables**:
   - **For Lighthouse CI** (lighthouse-preview job):
     - `VERCEL_TOKEN` — from https://vercel.com/account/tokens
     - `VERCEL_PROJECT_ID` — from `.vercel/project.json` or Vercel dashboard
     - `VERCEL_TEAM_ID` — only if the project lives under a team scope
   - **For Promptfoo evals** (weekly job):
     - `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` — the job no-ops
       cleanly if neither is set.
   When you add Fastlane/TestFlight (see "Future" below), you'll
   additionally need:
   - `APP_STORE_CONNECT_API_KEY_ID`
   - `APP_STORE_CONNECT_API_KEY_ISSUER_ID`
   - `APP_STORE_CONNECT_API_KEY_CONTENT` (base64 .p8 file)
   - `MATCH_PASSWORD`
   - `MATCH_GIT_BASIC_AUTHORIZATION` (base64 `user:pat`)

## What runs when

| Workflow      | Trigger                                  | Jobs                                                 | Cost          |
| ------------- | ---------------------------------------- | ---------------------------------------------------- | ------------- |
| `weekly`      | Scheduled (Mondays 06:00 UTC, `run-weekly=true`) | knip, sqlfluff-full, squawk, npm-audit, stryker, promptfoo-evals | ~$2-3/week    |
| `ios`         | Push to `main` / `release/*` / `ios/*` / `capacitor/*` | ios-compile (M-series macOS)                         | ~$0.15-0.30/run |
| `lighthouse`  | Every push (except docs/* and noop branches) | lighthouse-preview (polls Vercel, runs lhci against landing + auth routes) | ~$0.02/run |

To run iOS on a feature branch, name it `ios/<thing>` or
`capacitor/<thing>`. Or add the `circleci/path-filtering` orb later
for automatic detection based on changed files.

## Validating the config locally

```bash
brew install circleci
circleci config validate .circleci/config.yml
# To dry-run a job locally (needs Docker):
circleci local execute --job knip
```

## Future upgrades

- **iOS TestFlight publish**: replace the compile-only step with
  Fastlane Match + `pilot upload`. Needs the 5 env vars above. ~30
  min of setup once you have a paid Apple Developer account configured.
  Wrap the publish with **CircleCI Releases** for deploy-event tracking
  (the `circleci run release plan` / `release update` snippet) — gives
  you a Releases tab showing which build shipped to TestFlight when,
  correlatable with Sentry. Don't bother for the compile-only job —
  there's no deploy event to track yet.
- **Parallel Playwright**: when E2E lands per `v3-testing-standards`
  Plan 02 Task 9, add a `playwright` job that uses
  `circleci tests split` to run 4-8 shards in parallel. Reports flake
  via CircleCI Test Insights.
- **Lighthouse on Vercel previews**: add a job that polls the Vercel
  API for the PR's preview URL, then runs `lhci autorun`. Needs
  `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` env vars.
- **LLM evals (Braintrust/LangFuse)**: when LLM observability is
  wired up, add a weekly job that runs scored evals against the
  CoachHelm composer outputs.
- **Path filtering**: add the `circleci/path-filtering` orb so the
  iOS job runs based on changed files instead of branch naming.

## Why CircleCI + GitHub Actions, not one or the other

| Concern                | GHA                | CircleCI            | Winner    |
| ---------------------- | ------------------ | ------------------- | --------- |
| Speed for small jobs   | Fast cold-start    | Slower cold-start   | GHA       |
| Build minutes price    | $0.008/min Linux   | $0.006/min Linux    | CircleCI  |
| macOS price            | $0.08/min          | $0.03/min M-series  | CircleCI  |
| Test splitting         | Manual matrix      | Native `tests split` | CircleCI |
| Native to GitHub PRs   | First-class        | Status-check        | GHA       |
| Resource class choice  | Limited            | Wide (small → 2xlarge) | CircleCI |
| Approval / hold jobs   | Environments       | Native `type: approval` | CircleCI |

This split plays to both platforms' strengths.
