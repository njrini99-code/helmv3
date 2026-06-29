# Architecture Map

## Stack

- Next.js 16 App Router.
- React 19.
- TypeScript strict.
- Supabase Auth, Postgres, RLS, Storage, and Edge Functions.
- Tailwind design system.
- Vitest for unit/integration/RLS lanes.
- Playwright for browser smoke and advisory E2E.

## Runtime Boundaries

| Layer | Paths | Rules |
|---|---|---|
| App routes | `src/app/**` | Server components by default; client files need `'use client'`. |
| Server actions | `src/app/**/actions/**/*.ts` | Check auth before DB calls; revalidate affected paths after mutations. |
| API routes | `src/app/api/**` | Keep auth, validation, and rate-limit posture explicit. |
| Shared UI | `src/components/ui/**` | Platform-agnostic primitives only. |
| Product UI | `src/components/golf/**`, `src/components/baseball/**` | Product-specific behavior and styling. |
| Supabase clients | `src/lib/supabase/**` | Server client is awaited; browser client is not. |
| Generated DB types | `src/lib/types/database.ts` | Guarded by `npm run check:types-drift`. |
| Migrations/RLS | `supabase/migrations/**`, `supabase/tests/rls/**` | DB/security-critical; run lint and RLS checks. |
| Feature routing | `memory/registry.yml` | Update when ownership or path routing changes. |

## Test Lanes

| Lane | Command | Scope |
|---|---|---|
| Unit | `npm run test:run` | Fast default Vitest lane. |
| Integration | `npm run test:integration` | `*.integration.test.{ts,tsx}`. |
| Vitest RLS | `npm run test:rls` | `*.rls.test.{ts,tsx}`. |
| Browser smoke | `npm run verify:e2e:smoke` | Critical route/browser health. |
| Full browser E2E | `npm run test:e2e` | Advisory until stable. |

## Hot Paths

Use `docs/operations/HOT_FILES.md` before changing:

- `src/app/golf/actions/golf.ts`
- `src/app/golf/actions/stats-data.ts`
- `src/lib/coachhelm/v2/**`
- `supabase/migrations/**`
- `memory/registry.yml`
