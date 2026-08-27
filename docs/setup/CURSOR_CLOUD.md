# Running helmv3 in Cursor Cloud

Moved out of `AGENTS.md` on 2026-08-27. It is 60 lines of environment setup that
applies only inside Cursor Cloud, and `AGENTS.md` loads into every agent session
in every environment — so every local session was paying for it. The content is
unchanged below.

The startup script only runs `npm install`. Everything below is baked into
the VM snapshot (Docker, Supabase CLI, Caddy, a trusted local CA, the
`/etc/hosts` entry, and a gitignored `.env.local`) but the **services are not
running after a fresh boot** — only disk state persists. Start them in order.

## Backend model (important, non-obvious)

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

## Start the local stack (fresh VM)

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

## Auth / using the app

- Signup access-code gate has **no committed default** — `SIGNUP_ACCESS_CODE`
  must be set (locally and in Vercel) or shared-code signup is disabled and
  only a coach's team join_code will get someone through the gate.
- Local auth email confirmation is **disabled**, so signup logs you in
  immediately. The seed does NOT create `auth.users` — sign up via the app
  (coach = 3-step onboarding → `/golf/dashboard`; creates `golf_coaches` +
  `golf_teams` rows).

## Chrome + local HTTPS (only if launching Chrome manually)

Chrome must run with `HOME=/home/ubuntu` (so it reads the trusted CA from
`~/.pki/nssdb`) AND a **non-default** `--user-data-dir` (Chrome refuses
`--remote-debugging-port` on the default profile dir). After adding/refreshing
a CA, Chrome must be restarted to pick it up.

## Tests

`npm run lint` (fast) and `npm test` (unit; ~7 min, 818 files) need no backend.
`npm run test:rls` / `npm run test:integration` require the local Supabase
stack running (steps 1–2 above). See `README.md` / `CLAUDE.md` "Commands" for
the full list.

<!-- HELM_AGENT_CANONICALITY_START -->
