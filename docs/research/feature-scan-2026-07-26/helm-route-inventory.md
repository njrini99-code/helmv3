# Helm Route Inventory

**Research date:** 2026-07-26  
**Counts:** Golf 66 · Baseball 107 · Lifting 23 · Admin (~22) · Marketing/legal/misc · Total `page.tsx` ~229  
**Auth middleware:** Dashboard paths require session (`isProtectedRoute` = `/*/dashboard/**`). Layouts enforce sport roles. Baseball adds capability route map.

Confidence: Confirmed for golf tables below (explore inventory). Baseball/lift summarized from `docs/REPO_MAP.md` + readiness matrix.

---

## A. Marketing / legal / misc (public)

| URL | Auth | Notes | Active |
|-----|------|-------|--------|
| `/` | Public | Landing (GSAP motion) | Yes |
| `/products`, `/about`, `/help`, `/support`, `/splash` | Public | Marketing | Yes |
| `/privacy`, `/terms` | Public | Legal | Yes |
| `/vizlab`, `/fairway-preview`, `/soreness-preview` | Public/dev | Preview surfaces | Yes / internal |
| `helm-website-ui/*` | Separate app | **Not** production `src/app` | Separate |

---

## B. GolfHelm routes

### Auth / onboarding / join

| URL | Auth | Roles | Nav | Status |
|-----|------|-------|-----|--------|
| `/golf` | Soft | Redirect by profile | — | Active entry |
| `/golf/login` | Public | — | — | Active |
| `/golf/signup` | Public | — | — | Active |
| `/golf/forgot-password` | Public | — | — | Active |
| `/golf/reset-password` | Public | — | — | Active |
| `/golf/welcome` | Post-login | — | — | Active |
| `/golf/demo` | Public gate | Shared coach | — | Active |
| `/golf/coach` | Auth | Coach onboarding | — | Active |
| `/golf/player` | Auth | Player onboarding | — | Active |
| `/golf/join` | Public | — | — | Active |
| `/golf/join/[code]` | Mixed | Branches | — | Active |

### Dashboard shared

| URL | Roles | Nav | Notes |
|-----|-------|-----|-------|
| `/golf/dashboard` | Both | Rail Dashboard | Home |
| `/golf/dashboard/hub` | — | Hidden | **Shim** → dashboard |
| `/golf/dashboard/calendar` | Both | Rail | Events |
| `/golf/dashboard/travel` | Both | Calendar hub | |
| `/golf/dashboard/roster` | Both | Team | |
| `/golf/dashboard/roster/[id]` | Coach | Deep | Coach-only redirect |
| `/golf/dashboard/recruiting` | Coach | Team hub | |
| `/golf/dashboard/team` | Player | Team hub | |
| `/golf/dashboard/team-hub` | Player | Team hub | |
| `/golf/dashboard/messages` | Both | Messages | |
| `/golf/dashboard/announcements` | Both | Messages hub | |
| `/golf/dashboard/tasks` | Both | Operations | |
| `/golf/dashboard/documents` | Both | Operations | |
| `/golf/dashboard/courses` | Both | Courses rail | |
| `/golf/dashboard/whats-new` | Coach | CTA | Players FeatureUnavailable |
| `/golf/dashboard/classes` | Player | Not rail | |
| `/golf/dashboard/settings` | Both | Footer | |
| `/golf/dashboard/settings/notifications` | Player | Sub | |
| `/golf/dashboard/settings/coaching-intelligence` | Coach | Sub | |

### Rounds / stats / qualifiers

| URL | Roles | Notes |
|-----|-------|-------|
| `/golf/dashboard/rounds` | Both | |
| `/golf/dashboard/rounds/new` | Player | |
| `/golf/dashboard/rounds/recover` | Player | |
| `/golf/dashboard/rounds/continue/[id]` | Player | |
| `/golf/dashboard/rounds/[id]` | Both | May redirect continue |
| `/golf/dashboard/rounds/[id]/review` | Both | AI review |
| `/golf/dashboard/qualifiers` | Both | |
| `/golf/dashboard/qualifiers/new` | Coach | |
| `/golf/dashboard/qualifiers/[id]` | Both | |
| `/golf/dashboard/qualifiers/[id]/edit` | Coach | |
| `/golf/dashboard/my-qualifiers` | Player | |
| `/golf/dashboard/stats` | Both | Coach bare → team |
| `/golf/dashboard/stats/team` | Coach | |

### CoachHelm cluster

| URL | Roles | Notes |
|-----|-------|-------|
| `/golf/dashboard/intelligence` | Coach | **Canonical Brief** · `?view=` |
| `/golf/dashboard/alerts` | — | Shim → signals&filter=alerts |
| `/golf/dashboard/insights` | — | Shim → insights |
| `/golf/dashboard/patterns` | — | Shim → patterns |
| `/golf/dashboard/development` | — | Shim → players view |
| `/golf/dashboard/analytics/coachhelm` | — | Shim → effectiveness |
| `/golf/dashboard/coachhelm/chat` | Coach | Ask |
| `/golf/dashboard/coachhelm/genome/compare` | Coach | |
| `/golf/dashboard/coachhelm/genome/[playerId]` | — | Shim → players/.../genome |
| `/golf/dashboard/coachhelm/qualifying/[id]` | Coach | |
| `/golf/dashboard/players/[playerId]` | — | Shim → /game |
| `/golf/dashboard/players/[playerId]/game` | Coach | Fingerprint |
| `/golf/dashboard/players/[playerId]/game/print` | Coach | |
| `/golf/dashboard/players/[playerId]/genome` | Coach | |
| `/golf/dashboard/coachhelm` | Player | Player AI hub · `?view=` |
| `/golf/dashboard/my-insights` | — | Shim → coachhelm |
| `/golf/dashboard/my-development` | — | Shim → view=development |
| `/golf/dashboard/my-standing` | — | Shim → view=standing |
| `/golf/dashboard/my-game-profile` | — | Shim → view=profile |

### Golf admin

| URL | Roles | Notes |
|-----|-------|-------|
| `/golf/admin` | `users.role=admin` | |
| `/golf/admin/demo-sessions` | Admin | |
| `/golf/admin/crm` | Admin | |
| `/golf/admin/crm/coach/[id]` | Admin | |

**Nav sources of truth:** `src/lib/golf/nav-registry.ts`, `src/lib/golf/surface-registry.ts`.

**Flags:** Routes without rail path still reachable by URL (classes, whats-new, chat Ask, genome). Ask not always in CoachHelmSubNav strip (collapsed Brief-only) — deep link / composer / palette.

---

## C. BaseballHelm (highlights)

See `docs/REPO_MAP.md` for full leaf list (~80 coach dashboard leaves).

| Bucket | Example URLs | Auth |
|--------|--------------|------|
| Auth | `/baseball/login`, `/signup`, `/demo`, `/complete-signup` | Public/auth |
| Onboarding | `/baseball/coach-onboarding`, `/player` | Auth |
| Coach dash | `/baseball/dashboard`, `command-center`, `roster`, `pipeline`, `stats-center`, `import`, `practice`, `performance/*`, `settings/*`, … | Coach + caps |
| Player dash | `/baseball/player/today`, `practice`, `timeline`, `passport` | Player |
| Public | `/baseball/packet/[token]`, `/player/[id]`, `/program/[id]`, `/team/[id]` | Public token/id |
| Join | `/baseball/join/[code]`, `/staff/join/[code]` | Invite |

**Tests:** baseball-smoke, route-crawler, camps/pipeline/box-score (seeded), mobile-viewports.

---

## D. Lift Lab

| URL pattern | Notes |
|-------------|-------|
| `/lifting/login|signup|forgot|reset` | Auth |
| `/lifting/coach` | Onboarding |
| `/lifting/join/[token]` | Join |
| `/lifting/dashboard` + athletes, today, readiness, programs, groups, import, sessions/live, lift, check-ins, command, exercises, settings | Coach/athlete |

**Gap:** few `error.tsx` vs golf/baseball.

---

## E. Helm Bridge Admin

`/admin`, `/activity`, `/auth`, `/baseball`, `/golf`, `/golf/tracer`, `/health`, `/jobs`, `/errors`, `/users`, `/teams/[id]`, `/deploys`, `/work`, `/ben-leah`, billing page, lifting page — **super-admin only**.

---

## F. API routes (52)

Grouped: golf auth/rounds · coachhelm chat/genome · calendar · push · account delete · inngest · health · admin/crm · webhooks resend/stripe · **18+ cron paths** (Vercel schedules 18) · internal logging · baseball staff context.

---

## G. Route hygiene flags for scan

| Flag | Examples |
|------|----------|
| Shim-only | golf alerts/insights/patterns/my-* |
| Orphan-ish (no rail) | Ask chat, classes, genome, print |
| Public data | baseball packet tokens — authorize carefully |
| Capability-sensitive | baseball settings/roles/imports/stats |
| Placeholder / zero data | travel budgets, many baseball elite-event tables at 0 rows |
| Missing error boundaries | lifting |
| Dual admin trees | `/golf/admin` vs `/admin` |

---

## H. Test coverage by route family

| Family | E2E |
|--------|-----|
| Public a11y | Yes |
| Golf dashboard/round/qualifier | Partial (needs `E2E_GOLF_*`) |
| Baseball smoke/routes | Stronger CI gate |
| CoachHelm Ask Confirm | Unit/integration heavy; limited E2E |
| CRM | a11y only |
| Lift Lab | Weak E2E |
| Admin Bridge | Weak E2E |
