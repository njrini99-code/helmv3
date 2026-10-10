---
paths:
  - "src/app/api/**"
  - "src/lib/stripe/**"
  - "src/lib/email/**"
  - "src/lib/notifications/**"
---

## Product integrations

- **No Inngest** — it is not used here. Durable background work is the pgmq queue (`src/lib/jobs/enqueue.ts`,
  `/api/jobs/consume`, `docs/operations/JOBS_QUEUE.md`) plus Vercel crons
  (`vercel.json`). Don't reintroduce `INNGEST_*` env vars or `/api/inngest`.
- **No Mapbox / no map provider** — there is no src/lib/mapbox/ and no
  `CourseMap` component in the repo. Round Review (#23) hole visuals are a
  synthetic SVG shot-path reconstruction built from `golf_shots` data
  (`HoleShotPath`, `src/components/golf/coachhelm/v3/HoleShotPath/`), not a
  map. If a map provider is added later, document it here — don't assume
  one exists.
- **Sonner** (toasts), **cmdk** (command palette), **Number Flow**
  (animated stats) — already wired. Toaster lives in `src/app/layout.tsx`;
  command palettes at `src/components/CommandPalette.tsx` and
  `src/components/golf/CommandPalette.tsx`; animated stat numbers via
  `src/components/ui/animated-number.tsx` (with mount-roll stagger).
- **fast-check** (property-based testing) — example suite at
  `src/lib/coachhelm/v2/shot-analysis/__tests__/shot-level-sg.property.test.ts`.
  Pattern: generate 100s of inputs per invariant, shrink failures to
  minimal repro. Best fit for SG calculations, qualifier scoring, state
  machine transitions.
- **@axe-core/playwright** (a11y in E2E) — `e2e/accessibility.spec.ts`
  audits the public routes (landing, login, signup) against WCAG 2.1
  AA + WCAG 2.2 AA. Extend per-route as we add seeded auth fixtures.
- **Promptfoo** (LLM evals) — config at `evals/round-review.yaml`.
  Run via `npm run evals` locally; runs weekly in CircleCI's
  `promptfoo-evals` job. Catches silent prompt drift between deploys.
- **Lighthouse CI** — config at `lighthouserc.cjs`, run manually via
  `npm run lighthouse` (`lhci autorun`). No CI job runs it: `.circleci/config.yml`
  has never defined a `lighthouse-preview` job (`.circleci/README.md` already
  corrects the same stale claim), and there is no Vercel preview URL for it
  to target anyway — non-main branches don't build (`vercel.json`'s
  `deploymentEnabled: {"*": false}`). a11y + CLS are configured as hard
  errors; perf as a warning — for whoever runs it locally.
- **Sentry Session Replay** — already wired in
  `src/instrumentation-client.ts`. 100% sample on errors, 10% session
  sample in prod, 0% in dev. `maskAllText` on by default.

---
