# Helm System Overview

**Research date:** 2026-07-26  
**Repository:** `njrini99-code/helmv3` (confirmed via `git remote`)  
**Default / researched branch:** `main` @ `88721852` (Merge PR #1072 notification-delivery)  
**Supabase project:** `Helm-Production` / ref `qmnssrrolpinvwjjnufo` / region `us-east-1` / Postgres 17.6  
**Confidence:** Confirmed unless labeled otherwise.

---

## 1. Executive summary

Helm Sports Labs is a **single Next.js 16 App Router monorepo app** (not a multi-package monorepo) that hosts multiple sport products behind path prefixes:

| Product | Path prefix | Status |
|---------|-------------|--------|
| **GolfHelm** | `/golf/**` | Primary mature product: team ops + round tracking + CoachHelm AI |
| **BaseballHelm** | `/baseball/**` | Large product mid-rebuild: recruiting + ops + stats + lifting bridge |
| **Lift Lab** | `/lifting/**` | Org-scoped strength portal on `helm_lifting_*` tables; also embedded in baseball Performance |
| **CoachHelm** | Golf-native AI layer (`/golf/dashboard/intelligence`, `/coachhelm/chat`, crons) | Live V3 read surfaces + chat tools; V2 still writes some dark insights |
| **Golf Admin / CRM** | `/golf/admin/**` | Product admin + coach outreach CRM |
| **Helm Bridge Admin** | `/admin/**` | Super-admin cross-product ops console |
| **Marketing** | `/`, `/products`, `/about`, … | Public marketing; separate `helm-website-ui/` exists but is not the production `src/app` tree |

Products share: Supabase Auth, `users` / `organizations`, Fairway design system (golf), Sonner toasts, Sentry, Inngest, Resend, Capacitor iOS shell.

They do **not** share a unified capability engine: Baseball has `withBaseballAction` + capability columns; Golf uses coach/player profile checks + head-coach staff role; Lifting uses `withLiftingAction`.

---

## 2. Architecture diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Browser / Capacitor iOS                                         │
│  Fairway UI (golf) · Living Annual (baseball) · Lift UI         │
└───────────────┬─────────────────────────────────────────────────┘
                │ HTTPS
┌───────────────▼─────────────────────────────────────────────────┐
│ Vercel (iad1) — Next.js 16 App Router · Node ≥22                │
│  src/proxy.ts → middleware session refresh + route gates        │
│  Server Components · Server Actions · Route Handlers            │
│  Vercel Cron → /api/cron/* · Inngest → /api/inngest             │
└───────┬───────────────────────────┬─────────────────────────────┘
        │ user JWT / cookies        │ service role (server-only)
┌───────▼──────────────┐   ┌────────▼─────────────────────────────┐
│ Supabase Auth + RLS  │   │ createAdminClient() — bypasses RLS   │
│ Postgres 17 public.* │   │ crons, LLM budget, insight generators│
│ Storage buckets      │   │ seed scripts, webhooks (selected)    │
│ Edge Functions (4)   │   └──────────────────────────────────────┘
└──────────────────────┘
        │
┌───────▼─────────────────────────────────────────────────────────┐
│ Externals: Anthropic / AI Gateway · Resend · Gmail API (CRM)    │
│ Sentry · Datadog RUM · PostHog · Stripe (admin scaffold) · APNs │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Major technologies (Confirmed)

| Layer | Choice | Evidence |
|-------|--------|----------|
| Framework | Next.js `^16.2.11` App Router | `package.json` |
| React | `^19.2.7` | `package.json` |
| Language | TypeScript strict | `tsconfig`, `npm run typecheck` |
| Package manager | npm (`npm ci` in Vercel) | `vercel.json`, lockfile |
| Structure | Single app under `src/` | No workspace packages for products |
| DB | Supabase Postgres 17 | MCP `list_projects` |
| Clients | `@/lib/supabase/server` (await), `client`, `admin` | CLAUDE.md |
| UI | Fairway (`src/components/fairway`), Tailwind, design tokens `--fw-*` | CLAUDE.md, `design-tokens.css` |
| State | Server Components default; Zustand `auth-store`; Realtime hooks | hooks under `src/hooks/` |
| Forms/validation | Mixed (Zod appears in actions; Base UI / custom forms) | Strongly inferred from patterns |
| Auth | Supabase Auth (email/password primary) | `actions/auth.ts`, middleware |
| AI | `ai` v7 + `@ai-sdk/anthropic` + `@ai-sdk/react` | CoachHelm map |
| Background | Inngest + Vercel Cron + 1 `pg_cron` retention job | `vercel.json`, MCP cron.job |
| Monitoring | Sentry (+ Session Replay), Datadog RUM, Helm Bridge `admin_events` | `.env.example` |
| Email | Resend (transactional + CRM); optional Gmail API send | `.env.example` |
| Payments | Stripe admin invoicing scaffold only | `admin/actions/billing.ts` |
| Maps | **None** (HoleShotPath SVG, not Mapbox) | CLAUDE.md, `.env.example` |
| Deploy | Vercel region `iad1`; git deploy toggles in `vercel.json` | `vercel.json` |
| CI | GHA `ci.yml` + `review-gate.yml`; CircleCI weekly/iOS | CLAUDE.md |

---

## 4. Deployment model

- **Production app directory:** `/workspace` root Next app (`src/app`), not `landing/` or `helm-website-ui/`.
- **Branch:** `main` is the source of truth; open feature PRs were **0** at research time. Active remote branches include `fix/coachhelm-approval-delivery`, `fix/ui-stability-audit-0722`, `feat/products-page-redesign`, plus many `archive/*`.
- **Environments:** Preview vs production differ primarily by Vercel env vars (`NEXT_PUBLIC_VERCEL_ENV`). Single Supabase project observed via MCP (`Helm-Production` only). Local Supabase optional (`127.0.0.1:54321` in `.env.example`).
- **Product selection:** Path-based (`/golf`, `/baseball`, `/lifting`), not feature-flag tenants. GrowthBook env vars exist but **GrowthBook is not installed/wired** (Confirmed: no package/import).
- **Fairway redesign:** `isRedesignEnabled()` hardcoded `true` (`src/lib/redesign/flag.ts`).

---

## 5. Authentication model

1. Supabase Auth session cookies refreshed in `src/proxy.ts` → `src/lib/supabase/middleware.ts` via resilient `getUser`.
2. Unauthenticated access to `/*/dashboard/**` redirects to sport login with `returnTo`.
3. Sport identity is **profile-based**:
   - Golf: `golf_coaches` / `golf_players` (+ `users.role` for dual/admin). Coach preferred if both profiles exist (`src/lib/auth/session.ts`).
   - Baseball: `baseball_coaches` / `baseball_players` + staff capabilities on `baseball_team_coach_staff`.
   - Lifting: `helm_lifting_coaches` / athletes + org viewers.
4. Platform `users.role` enum includes `coach` | `player` | `admin` (golf admin layout).
5. Super-admin Helm Bridge gated by `SUPER_ADMIN_USER_IDS` / `checkSuperAdminAccess()` (`src/app/admin/layout.tsx`).
6. Demo modes: `/golf/demo`, `/baseball/demo` — shared demo coach sessions (`golf_demo_sessions`, `baseball_demo_sessions`).

**Not confirmed as first-class app roles:** Parent as login role (Baseball has **guardian access settings** on program — Tentative as incomplete UX). Guest beyond public packet tokens.

---

## 6. Tenancy model

```
organizations
  ├── golf_teams → golf_team_coach_staff / golf_team_members → golf_players
  ├── baseball_teams → baseball_team_coach_staff / baseball_team_members → baseball_players
  └── helm_lifting_* (org-scoped athletes/programs/sessions)
```

- Team selection (golf head coach): cookie via `team-switcher.ts` (`ACTIVE_TEAM` style cookie constants).
- Multi-team: supported for head coaches; assistants cannot switch teams (golf — Confirmed via explore agent / migrations).
- Isolation: RLS helpers `is_golf_team_coach`, `is_golf_team_player`, `is_baseball_team_*` (live DB functions).
- Cross-product: shared `users`, `organizations`, `notifications`, admin/CRM tables.

---

## 7. Data flow (typical mutation)

```
UI control → Server Action ('use server')
  → supabase.auth.getUser()
  → role/membership/capability check
  → typed or fromUntyped query (user client) OR createAdminClient (privileged)
  → optional revalidatePath / router.refresh
  → toast / redirect
  → optional Inngest event / notification / email
```

Post-round golf additionally: stats cache invalidation → CoachHelm analyze → round review LLM → qualifier update (async).

---

## 8. AI architecture (summary)

See `helm-coachhelm-ai-map.md`. Short version:

- **Golf CoachHelm V3** is the live coach/player insight visibility gate + Brief/Ask/Confirm chat.
- Chat tools: 12+ read tools (immediate) + 4 write tools (Confirm + idempotency ledger `golf_coachhelm_action_runs`).
- Models: Claude Sonnet for coach chat; Haiku for round review/hero narrative via AI Gateway / Anthropic key.
- Baseball has separate signal/insight tables (`baseball_signals`, `baseball_coach_insights`) — partial readiness.

---

## 9. External integrations

| Integration | Active? | Notes |
|-------------|---------|-------|
| Anthropic / Vercel AI Gateway | Yes | CoachHelm |
| Resend | Yes | Email + webhooks |
| Gmail API | Optional | CRM cold outreach / reply ingest |
| Sentry | Yes | Errors + Replay |
| Datadog RUM | Optional | Client |
| PostHog | Optional | Analytics |
| Inngest | Yes | Durable workflows |
| Stripe | Scaffold | Admin invoices; no product entitlements |
| Web Push VAPID / APNs edge | Partial | Tables exist; push_subscriptions rows=0 in prod snapshot |
| GameChanger/Presto/Sidearm | File parsers only | No live API env |
| Mapbox / Uploadthing / Tambo / GrowthBook | Absent or reserved | `.env.example` comments |

---

## 10. Primary risks (preview)

1. Cross-team / dual-role golf session ambiguity  
2. CoachHelm visibility filter is app-layer only (not RLS)  
3. Service-role breadth (~159 import sites)  
4. Golf vs baseball permission model asymmetry  
5. Stats/insight number coherence across surfaces (open issues #914, #917, #920)  
6. Recurring events / RSVP / attendance complexity  
7. E2E chromium suite flake/timeout history (#953) + incomplete golf seed automation  
8. Production DB is shared demo/prod mix — not a clean deterministic test DB  

Full register: `helm-bug-risk-register.md`.

---

## 11. Research limitations

- No runtime browser exploration of authenticated flows (read-only; no side-effect logins to production).
- No production PII inspected; table row counts only.
- Security advisor dump is large; sampled RLS-enabled-no-policy on CRM backup table + SECURITY DEFINER views flagged at ERROR level — full remediation not audited line-by-line.
- `docs/architecture/USER_ROLE_DATA_OWNERSHIP.md` is explicitly **STALE** (2026-01); not used as ground truth.
- Open issue backlog is large; not every issue traced to code.
- Baseball/Lift features rely heavily on readiness matrix docs — runtime completeness not re-verified end-to-end.

---

## Evidence index

- Repo remote, `package.json`, `vercel.json`, `CLAUDE.md`, `docs/REPO_MAP.md`
- Supabase MCP: `list_projects`, `list_tables`, `list_edge_functions`, `list_extensions`, `get_advisors`, read-only SQL
- Memory: `golfhelm-features.md`, `coachhelm-ai.md`, `glossary.md`, baseball features/readiness
- Explore agents: golf routes/roles, baseball/lift, CoachHelm tools, tests/integrations
