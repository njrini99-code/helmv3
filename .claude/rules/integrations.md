---
paths:
  - "src/app/api/**"
  - "src/lib/stripe/**"
  - "src/lib/inngest/**"
  - "src/lib/email/**"
  - "src/lib/notifications/**"
---

## Product integrations

- **Inngest** (durable workflows) — client at `src/lib/inngest/client.ts`,
  functions at `src/lib/inngest/functions.ts`, handler at
  `src/app/api/inngest/route.ts`. Free tier covers our weekly backfills
  (W12/W20/W27/W33/W35) with room to spare. Local dev runs on
  `npx inngest-cli@latest dev`; production needs `INNGEST_EVENT_KEY` +
  `INNGEST_SIGNING_KEY` env vars. See `.env.example`.
- **No Mapbox / no map provider** — there is no `src/lib/mapbox/` and no
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
- **Lighthouse CI** — config at `lighthouserc.cjs`, runs against
  Vercel preview URLs in CircleCI's `lighthouse-preview` job on
  every push. a11y + CLS are hard errors; perf is a warning.
- **Sentry Session Replay** — already wired in
  `src/instrumentation-client.ts`. 100% sample on errors, 10% session
  sample in prod, 0% in dev. `maskAllText` on by default.

---
