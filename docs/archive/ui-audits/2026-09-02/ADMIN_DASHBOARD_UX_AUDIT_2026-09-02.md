# Admin Dashboard Visual UX Audit — BLOCKED (2026-09-02)

**Status:** Not started — blocked before any page could be viewed. This is not a
findings report; it documents why the audit couldn't proceed, so the next
attempt doesn't repeat the same dead ends.

## Scope (intended)

Visual/interaction-quality audit of the `/admin` control dashboard at 390×844
and 1440×900 — overflow, empty/error states, IA, polish vs. the rest of the app.
Explicitly *not* a repeat of the 2026-09-01 backend/data-integrity admin
investigation (see `MASTER_BUG_REPORT_2026-09-02.md` Part 1 and
`memory/2026-09-01.md`), which covered incident forensics, not UI quality.

## Blocker 1 — No admin credentials exist in any discoverable non-secret location

A dedicated research pass (read-only, excluding real `.env*` files) confirmed:

- `/admin` ("the Bridge") has no separate login form. `src/app/admin/layout.tsx`
  redirects unauthenticated visitors to the normal `/golf/login`, then gates
  access via `checkSuperAdminAccess()` (`src/lib/admin/require-super-admin.ts`)
  — a Postgres RPC (`is_super_admin()`) checked against an `admin_allowlist`
  table keyed by Supabase user ID. Admin is a **role flag on a normal account**,
  not a distinct credential pair.
- The one script that provisions an admin user (`scripts/setup-admin.ts`) reads
  `HELM_ADMIN_SETUP_EMAIL` / `HELM_ADMIN_SETUP_PASSWORD` from the real
  `.env.local` — blank/commented in `.env.example`, no fixture value anywhere
  else.
- Demo/coach account passwords were deliberately rotated to CSPRNG values by
  `scripts/rotate-demo-passwords.mjs` after a security review flagged the old
  ones as weak; new passwords are printed to console at rotation time only,
  never persisted to a file. None of those accounts are admin-role anyway.
- E2E fixtures (`e2e/helpers/auth.ts`, `e2e/fixtures/golf-auth.ts`) are
  coach/player only (and baseball, not golf, in the hardcoded case) — no admin
  fixture exists.
- The 2026-09-01 admin investigation's own memory record explicitly states
  credentials were used live in-browser and **not retained**, by design.

**Conclusion:** there is no admin login to "pull from the existing audit/session
trail" — none was ever persisted, intentionally.

## Blocker 2 — Isolated browser profile could not be created

Per the task's instruction to avoid the session collisions from sibling agents
sharing one profile earlier today, this audit was to run in a new isolated
profile named `golf-audit-admin`.

- `browser` tool `action=open`/`action=start` with `profile="golf-audit-admin"`
  returned `Profile "golf-audit-admin" not found. Available profiles: imported,
  openclaw, user, chrome` — profiles aren't auto-created on open.
- CLI `openclaw browser create-profile --name golf-audit-admin` failed:
  `GatewayClientRequestError: browser.request cannot mutate persistent browser
  profiles over a node proxy`. Profile creation is blocked from this execution
  context entirely.
- `action=importprofile` (to copy cookies from a system Chrome profile named
  "helmsportslabs.com" — Profile 8/9 in `action=profiles` output — into a fresh
  managed profile) timed out, consistent with it waiting on a macOS
  Keychain/Touch ID consent prompt that requires physical presence at the
  machine, which isn't available to this agent.
- Checked the one other already-existing non-default profile (`imported`) as a
  fallback rather than touching the shared `user`/default profile (to honor the
  collision warning): it has no live session — navigating to `/admin` redirected
  straight to `/golf/login?returnTo=%2Fadmin`.

## What's needed to unblock

One of:

1. The user provides a working admin-role login (email/password) directly, to be
   used live and not retained, as the 09-01 audit did.
2. The user runs `scripts/setup-admin.ts` themselves (it needs the real
   `.env.local`) and shares only the resulting admin email for this agent to be
   handed a password out-of-band, or performs the Keychain consent step for
   `importprofile` while present at the machine so an existing authenticated
   `helmsportslabs.com` Chrome profile's cookies can be copied into an isolated
   profile.
3. Profile creation is enabled for this execution context (currently blocked at
   the gateway/node-proxy level, not a permissions choice made by this agent).

No pages, tables, or states were viewed. No screenshots exist for this pass.
