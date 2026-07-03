# Current Repo Map


## Static repo audit evidence

The audit used public GitHub connector inspection and the existing repository route inventory. Key evidence:

- `package.json` identifies a Next.js / React / Supabase app with Next 16, React 19, `@supabase/ssr`, `@supabase/supabase-js`, `ai`, `@ai-sdk/anthropic`, Capacitor, Radix UI, TanStack Table, Recharts, Framer Motion, Vitest, and Playwright.
- `src/components/layout/sidebar.tsx` shows current baseball navigation split by coach/player roles and coach type. It includes Dashboard, Roster, Stats, Videos, Dev Plans, Calendar, Messages, Announcements, Tasks, Documents, Travel, Academics for JUCO, and archived recruiting branches.
- `docs/architecture/ROUTE_INVENTORY.md` reports 68 pages, 29 layouts, 3 API routes, 33 loading states, 26 error boundaries, 7 route groups, 8 orphaned pages, 35 missing loading states, and 42 missing error boundaries as of its generated report.
- `src/lib/types/database.ts` is generated from Supabase types and shows a large mixed baseball/golf schema surface.
- `src/lib/queries/baseball-dashboard.ts` still contains older recruiting/watchlist dashboard logic with `baseball_watchlists`, `baseball_player_engagement_events`, `baseball_messages`, and `baseball_conversation_participants`.
- `src/app/baseball/(dashboard)/dashboard/academics/page.tsx` explicitly notes that academic fields like credits, standing, and eligibility status are not in the DB schema yet and are currently defaulted in UI state.


## Framework and stack

- Framework: Next.js App Router app.
- Core frontend: React 19, TypeScript, Tailwind CSS, Radix UI, Framer Motion, Recharts, TanStack Table.
- Backend/data: Supabase SSR/client, generated Supabase Database types, PostgreSQL-compatible schema.
- AI: Vercel AI SDK and Anthropic provider dependencies; CoachHelm scripts exist in package scripts.
- Mobile readiness: Capacitor packages, haptics, keyboard, notifications, network, splash screen.
- Testing: Vitest, Playwright, Testing Library.
- Observability: Sentry, Datadog RUM/logs, PostHog, Vercel Analytics/Speed Insights.

## Main directory surfaces to inspect locally

- `src/app/baseball/` — auth, onboarding, dashboard, public profile, join flows.
- `src/components/baseball/` — BaseballHelm-specific UI components.
- `src/components/layout/` — sidebar/header/team switching app shell.
- `src/lib/supabase/` — client/middleware/server helpers.
- `src/lib/auth/` — session and role helpers.
- `src/lib/types/database.ts` — generated schema contract.
- `src/lib/queries/baseball-dashboard.ts` — older recruiting/dashboard read model.
- `docs/architecture/ROUTE_INVENTORY.md` — route inventory and orphan/missing-state report.

## Product interpretation

The codebase has enough foundation to reuse the app shell, auth primitives, Supabase type generation, some team/calendar/message/travel patterns, and existing UI components. It should not preserve the old recruiting-first split as the primary navigation model. The future architecture should consolidate around team operations and player development first.
