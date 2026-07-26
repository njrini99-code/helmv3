# AGENTS.md

## Repo map

- `docs/REPO_MAP.md` is the structural map of this repo for agents: the
  resolved route atlas for BaseballHelm/GolfHelm/Lift Lab/Admin (route
  groups resolved, per-role rails), the canonical idioms table (action
  wrappers, toast, data access, design tokens per product, nav
  registries, error-boundary pattern — each with a file:line anchor),
  the known traps list, and a before-you-write-code checklist.
- Read it before adding a new route, a new action wrapper/toast/data-access
  call, or a new design-token consumer — it exists so you don't have to
  re-derive these conventions by grepping from scratch.
- It maps *shape and convention*, not feature behavior — for feature
  behavior, use the Feature awareness routing below.

## Feature awareness

- Treat `memory/registry.yml` as the feature routing table for AI work.
- Before changing or reviewing mapped feature code, identify impacted files, map them through `memory/registry.yml`, and read the mapped `memory/features/*.md` current-state docs first.
- Use `npm run knowledge:map -- --files <paths...>` to find impacted features.
- Use `npm run knowledge:context -- --files <paths...> --task "<task>"` to build `/tmp/helmv3-context-pack.md` for larger changes or PR reviews.
- If a feature is missing from `memory/registry.yml`, say so and either add the mapping or explicitly mark the feature-awareness gap.
- Do not silently change business behavior without updating the relevant `memory/features/*` current-state doc or explaining why no doc update is needed.

## Mobile UI rules

- Use the `mobile-app-consistency-system` skill for mobile web screens, responsive app UI, navigation, headers, cards, tabs, filters, buttons, chips, empty states, and layout refactors.
- All mobile screens must use the shared app shell with consistent safe-area handling, page padding, section spacing, and bottom-nav clearance.
- All mobile headers must use either a Standard header or an Action header pattern.
- Standard header: leading nav control, title, optional subtitle or meta, and at most one visible trailing action.
- Action header: leading nav control, title, and one primary CTA on the right.
- Do not stack multiple utility rows in the header unless there is no viable alternative.
- Bottom nav is reserved for primary everyday destinations only.
- Side drawer is reserved for secondary, team, admin, or account destinations.
- Avoid duplicating major destinations across bottom nav and drawer.
- Reuse shared button, chip, tab, card, metric, and empty-state components whenever possible.
- Do not introduce one-off spacing, radius, icon sizes, or control heights.
- Each screen should expose one clear primary action, a small number of secondary actions, and move lower-priority actions into overflow or a bottom sheet.
- Prefer calmer, denser, more scannable mobile layouts over decorative or oversized sections.
- Reduce top-of-screen chrome so users reach content earlier.
- Empty states should stay compact: icon, short title, one sentence, one CTA.
- Every changed mobile screen should feel visually and behaviorally consistent with the rest of the app.

## Automated review

PRs are reviewed by **two AI reviewers in parallel** on every push:

- **CodeRabbit** — line-level static analysis. Config at
  `.coderabbit.yaml` plus `.coderabbit/ast-grep/` and
  `.coderabbit/semgrep/helmv3.yml`. Path-specific instructions cover
  `src/app/**`, `src/components/**`, `src/lib/supabase/**`,
  `supabase/migrations/**`, `supabase/functions/**`, `ios/App/**`,
  `tools/**`, `.github/workflows/**`, and `e2e/**`.
- **Greptile** — whole-codebase view, catches drift from architecture
  docs and duplicated logic. Config at `.greptile/rules.md`
  (natural-language rules) and `.greptile/config.json` (ignores,
  additional-context docs). Installed via GitHub App at
  https://app.greptile.com.

CI runs across two platforms:

- **GitHub Actions** (`.github/workflows/ci.yml`, `review-gate.yml`)
  — every-PR fast path (typecheck, lint, vitest, build, RLS tests,
  Review Gate static analyzers).
- **CircleCI** (`.circleci/config.yml`, see `.circleci/README.md`)
  — weekly heavy jobs (Knip, Stryker, sqlfluff, npm audit, Squawk)
  scheduled Mondays 06:00 UTC, plus iOS Capacitor compile on
  M-series macOS runners (push to `main`, `release/*`, `ios/*`,
  `capacitor/*`).

Pre-merge gate blocks (must be `error`-clean before merge):
- Service-role key in a client bundle
- New table without RLS + policy in the same migration
- Server action without `supabase.auth.getUser()` before any DB call
- Bare table names without `golf_` / `baseball_` prefix
- DELETE-then-INSERT in any save/submit/sync write path

Static analyzers enabled: ESLint, Biome, oxc, ast-grep, ruff, pylint,
swiftlint, shellcheck, yamllint, actionlint, markdownlint, languagetool,
hadolint, checkov, gitleaks, semgrep, sqlfluff.

## Cursor Cloud specific instructions

The startup script only runs `npm install`. Everything below is baked into
the VM snapshot (Docker, Supabase CLI, Caddy, a trusted local CA, the
`/etc/hosts` entry, and a gitignored `.env.local`) but the **services are not
running after a fresh boot** — only disk state persists. Start them in order.

### Backend model (important, non-obvious)

The app needs Supabase. The CSP in `next.config.mjs` (`connect-src`) only
allows `https://*.supabase.co` — the browser therefore **cannot** talk to a
plain `http://127.0.0.1:54321` local stack. To run fully local without editing
app code, a **Caddy TLS reverse proxy** fronts the local `supabase start` stack
under the hostname `https://helmlocaldev.supabase.co` (mapped to `127.0.0.1` in
`/etc/hosts`; Caddy's internal CA is already trusted in the system store and in
Chrome's NSS DB at `~/.pki/nssdb`). `.env.local` points
`NEXT_PUBLIC_SUPABASE_URL` at that proxied hostname.
Alternative: point `.env.local` at a real remote Supabase project
(`https://*.supabase.co`), which satisfies the CSP natively — then Docker/Caddy
are unnecessary.

### Start the local stack (fresh VM)

1. Docker daemon (systemd is not running here):
   `sudo dockerd &` — wait until `docker info` succeeds. The daemon is
   configured for `fuse-overlayfs` + iptables-legacy (required in this VM).
2. Local Supabase (from repo root): `npx supabase start` — applies all
   `supabase/migrations/` + `supabase/seed/v3-seed.sql`. Exposes API 54321,
   DB 54322, Studio 54323, Mailpit 54324. Reset with `npx supabase db reset`.
3. Caddy TLS proxy: `caddy run --config /home/ubuntu/dev-proxy/Caddyfile &`
   (proxies `https://helmlocaldev.supabase.co` → `127.0.0.1:54321`).
4. Dev server, with the CA so server-side/middleware Supabase calls are trusted:
   `NODE_EXTRA_CA_CERTS=/home/ubuntu/.local/share/caddy/pki/authorities/local/root.crt npm run dev`
   → http://localhost:3000

### Auth / using the app

- Signup access-code gate default is `1881` (`SIGNUP_ACCESS_CODE`).
- Local auth email confirmation is **disabled**, so signup logs you in
  immediately. The seed does NOT create `auth.users` — sign up via the app
  (coach = 3-step onboarding → `/golf/dashboard`; creates `golf_coaches` +
  `golf_teams` rows).

### Chrome + local HTTPS (only if launching Chrome manually)

Chrome must run with `HOME=/home/ubuntu` (so it reads the trusted CA from
`~/.pki/nssdb`) AND a **non-default** `--user-data-dir` (Chrome refuses
`--remote-debugging-port` on the default profile dir). After adding/refreshing
a CA, Chrome must be restarted to pick it up.

### Tests

`npm run lint` (fast) and `npm test` (unit; ~7 min, 818 files) need no backend.
`npm run test:rls` / `npm run test:integration` require the local Supabase
stack running (steps 1–2 above). See `README.md` / `CLAUDE.md` "Commands" for
the full list.
