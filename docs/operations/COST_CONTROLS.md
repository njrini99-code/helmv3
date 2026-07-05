# Cost controls — Vercel, GitHub Actions, and preview CI

Helm Sports Labs policies to prevent runaway billing from preview deployments,
AI-agent branches, and expensive browser CI on every pull request.

Last updated: 2026-07-04

---

## Vercel deployment policy

### Automatic builds

| Branch | Vercel build | Deploy target |
|--------|--------------|---------------|
| `main` | **Yes** | Production |
| All other branches | **No** | Skipped |

### How it is enforced (defense in depth)

1. **`vercel.json` → `git.deploymentEnabled`** — only `main` is enabled; `"*": false` disables all other branches.
2. **`vercel.json` → `ignoreCommand`** — runs `scripts/vercel-ignore-build.sh`:
   - exit **1** → build proceeds (`main` only)
   - exit **0** → skip build (every other branch)
3. **Dashboard fallback** — if the project was linked before `ignoreCommand` synced, set **Project → Settings → Git → Ignored Build Step** to:

   ```bash
   bash scripts/vercel-ignore-build.sh
   ```

### Manual previews

Preview deployments for feature branches must be **intentionally triggered** (Vercel dashboard → Deploy, or `vercel deploy` from a trusted shell). Do not re-enable automatic preview builds for `*` in the dashboard.

### Vercel Spend Management (dashboard)

Enable in **Vercel → Settings → Billing → Spend Management**:

| Alert threshold | Purpose |
|-----------------|---------|
| **$50** | Early warning — agent branch flood detected |
| **$100** | Investigate preview/build volume |
| **$200** | Hard review before costs compound |

Also review **Usage** weekly for deployment count spikes from branches like `fix/coderabbit-*`, `chore/coderabbit-*`, `cursor/*`, `test-hardening/*`.

### AI / CodeRabbit / Cursor branches

These branches must **not** trigger automatic Vercel preview builds. With the policy above, pushes to those branches are ignored unless someone manually deploys.

---

## GitHub Actions policy

### Pull requests → `main`

| Workflow | Runs when | What it does |
|----------|-----------|--------------|
| **`CI`** (`.github/workflows/ci.yml`) | Every PR | typecheck, lint, unit tests, build, RLS tests |
| **`PR E2E smoke`** (`.github/workflows/pr-smoke.yml`) | Every PR (a11y path-filtered inside workflow) | Public **accessibility** Playwright only when src/e2e paths change (~12 min max) |
| **`Review Gate`** | Every PR | Static analyzers (fast) |
| **`Playwright E2E`** (`.github/workflows/playwright.yml`) | Every PR + main + manual | **Smoke checks** build on every PR; full Chromium/baseball/screenshots on main or manual only |

**PR a11y path filter** (pr-smoke): docs-only PRs skip the accessibility job; build smoke still runs via `Playwright E2E / Smoke checks`.

### `main` branch pushes

| Workflow | Jobs |
|----------|------|
| **`CI`** | Full fast path (unchanged) |
| **`Playwright E2E`** | Smoke build, full Chromium suite, BaseballHelm mandatory smoke, advisory baseball-stats smoke |

### Manual full browser CI

**Actions → Playwright E2E → Run workflow** with inputs:

| Input | When to use |
|-------|-------------|
| `full_e2e: true` | Full Chromium suite + BaseballHelm seed/smoke |
| `screenshots: true` | Course picker screenshot capture (`course-library.spec.ts`) |
| `baseball_seeded: true` | Advisory `baseball-stats-smoke.spec.ts` only |

Defaults are `false` — no expensive jobs run unless explicitly selected.

### Artifact retention

Playwright workflows retain reports **3 days** (was 14).

### GitHub Actions billing alerts

If the org uses GitHub Actions metered billing, set budget alerts in **Organization → Settings → Billing** (or personal account equivalent). Watch for:

- Playwright browser install + 75-minute jobs on every PR (now disabled)
- Duplicate `npm run build` across workflows (PR smoke avoids a separate build; main Playwright still builds once per job that needs it)

---

## CircleCI (Lighthouse on Vercel preview)

`.circleci/config.yml` includes an advisory **`lighthouse-preview`** job that polls Vercel for a PR preview URL.

With non-main Vercel builds skipped, preview lookup usually **finds no deployment** and Lighthouse **skips gracefully** (see `.circleci/scripts/wait-for-vercel-preview.sh`). No change required for cost safety; do not re-enable Vercel previews for Lighthouse without revisiting this doc.

---

## Quick reference — what runs where

```
PR (paths: src/e2e/…)
  └─ pr-smoke.yml → accessibility.spec.ts only

main push
  └─ ci.yml → typecheck, lint, test, build
  └─ playwright.yml → smoke + full e2e + baseball seeded smoke

manual (workflow_dispatch)
  └─ playwright.yml → pick full_e2e / screenshots / baseball_seeded

Vercel
  └─ main only (production)
  └─ all other branches → ignored
```

---

## Related docs

- `docs/operations/VERCEL_ADMIN_DEPLOYS_RUNBOOK.md` — admin panel + API tokens
- `docs/CI_RUNBOOK.md` — required checks and rerun commands
- `scripts/vercel-ignore-build.sh` — ignored build step script
