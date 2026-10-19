# Threat model for the OSS Scanner

HelmV3 is a commercial multi-tenant SaaS (GolfHelm, CoachHelm, BaseballHelm,
Lift Lab) built on Next.js App Router, TypeScript, and one shared Supabase
Postgres project. It holds coach and player data, including minors' PII. The
repo is a web app and a Capacitor iOS shell, not a library.

## What to test

Findings that let one tenant read or change another tenant's data, or let an
unauthenticated caller act as a user, matter most.

- **Authorization and tenancy.** Roles include coach, player, and admin, plus
  the separate Clubhouse surface in `src/clubhouse/`. Check that server
  actions and route handlers verify the caller's role and team or org
  membership before reading or writing, and do not trust IDs, roles, or team
  IDs from the request body or query string.
- **Row-Level Security.** Policies and grants live in `supabase/migrations/`
  and are tested by pgTAP suites in `supabase/tests/rls/`. Look for tables
  readable or writable by `anon` or by users outside the owning team, policies
  that miss a command (`UPDATE` without `WITH CHECK`), `SECURITY DEFINER`
  functions without a pinned `search_path` or caller check, and views that
  bypass RLS.
- **Service-role use.** `src/lib/supabase/admin.ts` holds the service-role
  client. Check that it is never reachable from client code, and that code
  using it re-checks authorization itself because RLS does not apply.
- **API routes** under `src/app/api/`:
  - `webhooks/` (Stripe, Resend, Resend inbound) must verify signatures before
    acting.
  - `cron/`, `jobs/`, and `internal/` must reject callers without the shared
    secret.
  - Other routes must authenticate and authorize per request.
- **Injection.** SQL built by string concatenation, unsanitized values in
  PostgREST `.or()` / `.ilike()` filter strings, SSRF in any server-side fetch
  of a user-supplied URL, path traversal or content-type abuse in storage
  upload and download, and HTML injection in emails or rendered user content.
- **Data exposure.** Server components and actions returning more fields than
  the caller may see (for example other players' contact data, or minors' data
  to a non-guardian), and error or log output that leaks PII or secrets.
- **Auth flows.** Sign-up, invites, password reset, and session handling in
  `src/proxy.ts` and `src/lib/supabase/`. Check open redirects, invite or
  token reuse, and account takeover through email change.
- **CoachHelm AI.** Prompt injection from user-authored text (notes, messages)
  into model calls whose output is stored or shown to other users, and model
  output that is trusted as code, SQL, or a URL.

## Adversarial inputs

Treat all of these as attacker-controlled: request bodies, query strings,
headers, uploaded files and their names, webhook payloads before signature
verification, user-authored text (names, notes, messages, imported CSVs), and
the identity of any signed-in user acting outside their own team.

## Out of scope

- Denial of service, rate limiting, and brute-force findings without a logic
  flaw.
- Anything requiring a compromised end-user device or stolen credentials.
- Missing security headers or hardening with no demonstrable impact.
- `e2e/`, `scripts/`, `docs/`, `memory/`, `audit/`, and test fixtures, unless
  a CI workflow in `.github/workflows/` exposes a secret or runs
  attacker-controlled input with privileges.
- Vulnerabilities in third-party dependencies with no reachable path from this
  code.
- The `.env.example` file. It holds placeholders only.

## Severity

- **Critical:** unauthenticated access to any tenant's data, cross-tenant read
  or write, minors' PII exposed, or the service-role key reachable by a user.
- **High:** authenticated privilege escalation (player to coach, coach to
  admin), webhook or cron forgery with a side effect, stored XSS.
- **Medium:** exposure limited to non-sensitive fields, or exploitable only
  with a precondition such as a known record ID.
- **Low:** defense-in-depth gaps with no demonstrated path.

## Reports

Give the file and line, the route or action, the role the attacker needs, and
a minimal reproduction. For RLS findings, include the failing policy and a SQL
example. Propose a patch against the existing helpers (for example
`observed-action` for actions and `logServerError` for logging). Do not
include real secrets or PII in the report.
