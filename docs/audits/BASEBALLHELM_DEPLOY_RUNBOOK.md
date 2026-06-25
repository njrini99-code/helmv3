# BaseballHelm Deploy Runbook

**Status:** READY TO EXECUTE ONCE THE VERIFICATION VERDICT IS CLEAN
**Owner:** runs only after `docs/audits/BASEBALLHELM_VERIFICATION_REPORT.md` reads CLEAN.
**Author:** deploy-prep helper. Doc-only; this file changes nothing on its own.
**Repo:** `/Users/ricknini/Downloads/helmv3`
**Date authored:** 2026-06-24

---

## 0. Hard constraints (read first — these are not optional)

1. **The Supabase project is SHARED with GolfHelm PRODUCTION.** Every migration applied here lands on the live Golf database. Apply ONLY the `*_baseball_*` migrations listed in the apply plan. Never run a non-baseball migration as part of this deploy. Never run a destructive (`DROP`/`TRUNCATE`/`DELETE`) statement.
2. **AT MOST 2 PRODUCTION DEPLOYS.** This is the user's hard cap. A production deploy = a `vercel --prod` or a push/merge to `main` (Vercel git integration auto-promotes `main` — see `vercel.json` `git.deploymentEnabled: true`). Budget: **Deploy #1 = ship. Deploy #2 = reserved hotfix.** If both are spent and prod is still broken, ROLL BACK (§7) rather than burning a third deploy.
3. **Migrations are additive only.** Baseball migrations create new `baseball_*` tables / RPCs / policies. They do not alter Golf objects. This is why a code rollback (§7) needs no down-migration.
4. **Build is the wildcard.** This code was machine-generated at volume. The typecheck/build gate (§3) is the single most likely place to find blockers. Do NOT spend a deploy until §3 is green locally.

---

## 1. PRE-FLIGHT (no writes, no deploys)

Do not proceed past this section until every box is checked.

- [ ] **Verdict is CLEAN.** Open `docs/audits/BASEBALLHELM_VERIFICATION_REPORT.md`. The overall verdict must read CLEAN (or equivalent "ship it"). If it lists any P0/blocker, STOP and route it back — do not deploy over a dirty verdict.
- [ ] **Migration apply plan exists.** Confirm `docs/audits/BASEBALLHELM_MIGRATION_APPLY_PLAN.md` is present. It is the authoritative ordered list of which `*_baseball_*` migrations to apply and in what order. The runbook defers to it for ordering.
- [ ] **Seed script exists.** Confirm `scripts/seed-baseball-demo.ts` is present (it is). Skim its header — it is idempotent (deterministic uuidv5 ids, upsert-only, never delete-then-reinsert) and scoped to the demo org/team only.
- [ ] **Branch + working tree.** `git status` is clean (or only the intended baseball changes are staged). Current working branch at authoring time was `fix/crm-logging-attendance-jersey-2026-06-23`; confirm the branch you intend to ship from actually contains the BaseballHelm code.
- [ ] **Env present.** `.env.local` (or the shell env) has `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — the seed script requires both and throws if missing.
- [ ] **Confirm you are pointed at the right Supabase project.** Because the DB is shared with Golf prod, double-check `NEXT_PUBLIC_SUPABASE_URL` is the production project URL before applying any migration.

> NOTE (authoring observation): At authoring time, `BASEBALLHELM_VERIFICATION_REPORT.md` and `BASEBALLHELM_MIGRATION_APPLY_PLAN.md` did **not yet exist** — companion helpers are producing them. Both MUST exist and the verdict MUST be CLEAN before any step below runs.

---

## 2. APPLY MIGRATIONS

There are **49** `*_baseball_*` migrations in `supabase/migrations/` (range `20260528000000_baseball_recalc_body_guards.sql` … `20260624001900_baseball_events_status_lifecycle.sql`). Apply them via the Supabase MCP `apply_migration` tool in the **exact order given by `docs/audits/BASEBALLHELM_MIGRATION_APPLY_PLAN.md`**. If the apply plan and this section ever disagree, the apply plan wins.

### 2a. Ordering hazard — duplicate timestamp (MUST handle explicitly)

Previously two migrations shared the numeric prefix `20260624001400` — that collision has been resolved:

- `20260624001400_baseball_readiness_select_gate_fix.sql` (unchanged)
- `20260624001401_baseball_public_player_stats_rpc.sql` (renamed from 001400)

Apply them in the order the apply plan specifies (readiness gate first, then public stats RPC).

### 2b. How to apply each one

For each migration in the apply plan order:

1. Read the SQL file from `supabase/migrations/<file>.sql`.
2. Call Supabase MCP `apply_migration` with `name = <file-stem>` and `query = <file contents>`.
3. **Verify it landed before moving to the next** (see 2c). Apply strictly sequentially — do not batch — so that a failure stops the chain at a known point.

### 2c. Verify each migration landed

- **Tables / views:** call Supabase MCP `list_tables` (schema `public`) and confirm the new `baseball_*` table(s) created by that migration are present. Or query `information_schema`:
  ```sql
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name LIKE 'baseball\_%' ORDER BY 1;
  ```
- **RPCs / functions:**
  ```sql
  SELECT routine_name FROM information_schema.routines
  WHERE routine_schema = 'public' AND routine_name LIKE 'baseball\_%' ORDER BY 1;
  ```
- **Columns added to an existing baseball table:**
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = '<baseball_table>' ORDER BY 1;
  ```
- **RLS / policies** (several migrations add policies, e.g. `..._baseball_rls_helpers_and_policies.sql`):
  ```sql
  SELECT tablename, policyname FROM pg_policies
  WHERE schemaname = 'public' AND tablename LIKE 'baseball\_%' ORDER BY 1,2;
  ```
- **Record the count:** after the full run, the `information_schema` `baseball_*` table count should match the apply plan's expected total. Note it for the post-deploy check (§7).

### 2d. If a migration fails

- STOP. Do not continue the chain. The failure message tells you the object/line.
- Because every migration is additive and baseball-scoped, a partial run leaves Golf prod untouched and leaves baseball partially built — safe to pause.
- Fix the migration SQL (or get it fixed), then re-run from the failed file forward. Idempotent guards (`IF NOT EXISTS`, `CREATE OR REPLACE`) mean re-running an already-applied file is usually safe, but re-run only what the apply plan tells you to.
- **Do not** spend a Vercel production deploy to "test" a migration — migrations are DB-side and independent of the web deploy.

### 2e. Guardrail — do NOT touch these

These two non-baseball migrations reference baseball but are **not** part of this deploy and must NOT be re-run: `20260527000000_prod_public_baseline.sql`, `20260602165152_harden_search_path_and_revoke_anon_admin_fns.sql`. Apply only files matching `*_baseball_*` from the apply plan.

---

## 3. BUILD-GATE (the big wildcard — do this before spending any deploy)

Run locally, in order. **Do not deploy until both are green.**

```bash
cd /Users/ricknini/Downloads/helmv3
npm ci                 # match the Vercel installCommand exactly (vercel.json uses `npm ci`)
npm run typecheck      # tsc --noEmit
npm run build          # next build --webpack  (this is the same buildCommand Vercel runs)
```

`npm run build` is the authoritative gate because `vercel.json` sets `buildCommand: "npm run build"` and `installCommand: "npm ci"` — what passes here is what Vercel runs.

### 3a. Triage typecheck/build errors by subsystem

Freshly generated code most commonly fails in these buckets — triage in this order:

1. **Type imports / generated types.** Errors like `Cannot find name 'BaseballX'` or `has no exported member`. Source of truth: `src/lib/types/baseball-*.ts` (the seed imports `baseball-extended` and `baseball-acknowledgements`). If a migration added a column/table, the TS type may be stale — regenerate via Supabase MCP `generate_typescript_types` and reconcile, or fix the hand-written baseball type. Do this AFTER §2 so types match the live schema.
2. **Server/client boundary.** `'use server'` files cannot export `const` arrays/objects (a recurring GolfHelm gotcha — see project memory). Symptom: build error about a server action export. Fix: move the constant to a plain module (e.g. `*-categories.ts`) and import it.
3. **Route component contracts.** Next.js App Router page prop typing — `params`/`searchParams` shape, async page signatures, dynamic `[id]`/`[token]` segments. Baseball has many dynamic routes (`players/[id]`, `packet/[token]`, `camps/[id]`, `videos/[id]/edit`, etc.); a wrong param type fails the build for that route only.
4. **RPC call shape.** A page calling a `baseball_*` RPC with the wrong arg names/types. Cross-check against the migration that defines the RPC (e.g. `..._baseball_public_player_stats_rpc.sql`, `..._baseball_accept_staff_invite_rpc.sql`, `..._baseball_replace_lineup_positions_rpc.sql`).
5. **Lint is NOT a deploy gate here.** `npm run lint` runs with `--max-warnings 6000`; it is informational. Do not block the deploy on lint warnings, but do skim for genuine errors.

Fix locally, re-run `npm run typecheck` then `npm run build`, and only move on when both exit 0. Every fix here is a normal code change in the working tree — it costs nothing until you deploy.

---

## 4. SEED DEMO DATA

Run the idempotent demo seed AFTER migrations are applied (§2) and the build is green (§3). The seed writes to the live shared DB but is strictly scoped to the demo org/team and is upsert-only.

### 4a. Invocation (IMPORTANT — exact flags)

The script is **safe by default: with no flag it does a DRY RUN** (prints the row plan, writes nothing). It writes to the live DB **only when you pass `--confirm` explicitly**. (`--dry-run` is also accepted as an explicit no-write preview.)

```bash
cd /Users/ricknini/Downloads/helmv3

# 1) DRY RUN first — prints the row plan, writes nothing (default, no flag needed):
DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-baseball-demo.ts

# 2) LIVE seed — requires --confirm:
DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-baseball-demo.ts --confirm
```

> Verified against the final script (lines 181-183: `DRY = !process.argv.includes('--confirm')`, with `if (DRY) return` before every write). Default = dry run; `--confirm` = live. An earlier draft of this runbook had this backwards — corrected.

Requires env: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (the script throws if either is missing).

### 4b. Demo logins it creates (verify by logging in)

| Role   | Email                              | Password          |
|--------|------------------------------------|-------------------|
| Coach  | `demo-coach@baseballhelmdemo.com`  | `BaseballDemo2026`|
| Player | `demo-player@baseballhelmdemo.com` | `BaseballDemo2026`|

Demo team: "Demo University Baseball". Auth users are looked up by email and created only if missing — re-runs never reset passwords or delete users.

### 4c. Verify the seed

- Dry run printed a non-trivial set of row counts across the new baseball tables (timeline, acknowledgements, imports, practice, lifting/readiness, coach insights).
- Live run completed with no `upsert <table> failed:` errors.
- Spot-check in SQL (or wait for §5 login):
  ```sql
  SELECT count(*) FROM baseball_player_timeline_events;   -- > 0
  SELECT count(*) FROM organizations WHERE name ILIKE 'Demo University Baseball%';
  ```
- Login smoke (do this here OR as the first step of §5): sign in as the demo coach at `/baseball/login`, then the demo player — both must authenticate and land on their dashboards.

---

## 5. SMOKE TESTS (against the deployed build — see §6 for when)

There is **no bare `/baseball` page** — the public entry point is `/baseball/login`. There are **107 baseball routes** (`page.tsx` + `route.ts`) under `src/app/baseball/**`. You do not need to hit all 107; the list below is the representative coverage set — one URL per surface/route-group, each must return 200 and render without a client error. Run these as the demo coach and demo player (the dynamic-id routes need real seeded ids from §4).

Replace `<BASE>` with `http://localhost:3000` (local pre-deploy) or the production URL (post-deploy). Replace `<id>`/`<token>`/`<code>` with seeded values.

### Public / unauthenticated `(public)` + `(auth)`
- `<BASE>/baseball/login` — login page renders (this is the de-facto public landing)
- `<BASE>/baseball/signup`
- `<BASE>/baseball/forgot-password`
- `<BASE>/baseball/reset-password`
- `<BASE>/baseball/complete-signup`
- `<BASE>/baseball/player/<id>` — public player profile (public group)
- `<BASE>/baseball/team/<id>` — public team page
- `<BASE>/baseball/program/<id>` — public program page
- `<BASE>/baseball/packet/<token>` — public scout packet (share token)
- `<BASE>/baseball/packet/<token>/csv` — packet CSV export route (downloads CSV, not HTML)

### Onboarding `(onboarding)`
- `<BASE>/baseball/coach-onboarding`
- `<BASE>/baseball/coach`
- `<BASE>/baseball/player`

### Coach dashboard `(coach-dashboard)` + `(dashboard)` — sign in as demo COACH
- `<BASE>/baseball/dashboard` — coach dashboard home
- `<BASE>/baseball/dashboard/command-center`
- `<BASE>/baseball/dashboard/roster`
- `<BASE>/baseball/dashboard/players/<id>` — player detail
- `<BASE>/baseball/dashboard/players/<id>/profile`
- `<BASE>/baseball/dashboard/players/<id>/stats`
- `<BASE>/baseball/dashboard/players/<id>/scout-packet`
- `<BASE>/baseball/dashboard/players/<id>/passport`
- `<BASE>/baseball/dashboard/stats` — stats hub
- `<BASE>/baseball/dashboard/stats-center`
- `<BASE>/baseball/dashboard/stats/games`
- `<BASE>/baseball/dashboard/stats/games/new`
- `<BASE>/baseball/dashboard/stats/season`
- `<BASE>/baseball/dashboard/stats/upload`
- `<BASE>/baseball/dashboard/import`
- `<BASE>/baseball/dashboard/practice`
- `<BASE>/baseball/dashboard/practice-effectiveness`
- `<BASE>/baseball/dashboard/postgame`
- `<BASE>/baseball/dashboard/lift`
- `<BASE>/baseball/dashboard/readiness`
- `<BASE>/baseball/dashboard/performance`
- `<BASE>/baseball/dashboard/analytics`
- `<BASE>/baseball/dashboard/signals`
- `<BASE>/baseball/dashboard/pipeline`
- `<BASE>/baseball/dashboard/recruiting` → use `<BASE>/baseball/dashboard/colleges` and `<BASE>/baseball/dashboard/watchlist`
- `<BASE>/baseball/dashboard/calendar`
- `<BASE>/baseball/dashboard/events`
- `<BASE>/baseball/dashboard/tasks`
- `<BASE>/baseball/dashboard/messages`
- `<BASE>/baseball/dashboard/announcements`
- `<BASE>/baseball/dashboard/documents`
- `<BASE>/baseball/dashboard/videos`
- `<BASE>/baseball/dashboard/team`
- `<BASE>/baseball/dashboard/teams`
- `<BASE>/baseball/dashboard/program`
- `<BASE>/baseball/dashboard/organization`
- `<BASE>/baseball/dashboard/profile`
- `<BASE>/baseball/dashboard/scout-packets`
- `<BASE>/baseball/dashboard/dev-plans`
- `<BASE>/baseball/dashboard/decision-room`
- `<BASE>/baseball/dashboard/settings` — settings index
- `<BASE>/baseball/dashboard/settings/program`
- `<BASE>/baseball/dashboard/settings/staff`
- `<BASE>/baseball/dashboard/settings/imports`
- `<BASE>/baseball/dashboard/settings/permissions`
- `<BASE>/baseball/dashboard/settings/ai`
- `<BASE>/baseball/dashboard/settings/privacy`
- (settings has ~24 sub-pages; if the index + the 6 above render, spot-check the rest)
- Coach context variants: `<BASE>/baseball/coach/college`, `/baseball/coach/high-school`, `/baseball/coach/juco`, `/baseball/coach/showcase`

### Player dashboard `(player-dashboard)` — sign in as demo PLAYER
- `<BASE>/baseball/player/today` — player home / today
- `<BASE>/baseball/player/timeline`
- `<BASE>/baseball/player/passport`
- `<BASE>/baseball/dashboard/my-stats` — player's own stats
- Player context variants: `<BASE>/baseball/player/college`, `/baseball/player/high-school`, `/baseball/player/juco`, `/baseball/player/showcase` (these redirect to `/baseball/player/today` by design — a 200 after redirect is correct)

### Join flows
- `<BASE>/baseball/join/<code>` — player team-join by code
- `<BASE>/baseball/staff/join/<code>` — staff invite join by code (unauthenticated → redirects to `/baseball/login?returnTo=…`, which is correct behavior)

**Pass criteria for each URL:** HTTP 200 (or an intentional 3xx redirect as noted), the page renders its real shell (not an error boundary), and the browser console shows no uncaught React error (watch for React #310 / "module factory is not available" hydration crashes seen historically). Authenticated routes hit while logged out should redirect to `/baseball/login` — that is a pass, not a failure.

### Fast smoke option
For a quick unauthenticated pass, curl the public/auth set and assert status:
```bash
for p in /baseball/login /baseball/signup /baseball/forgot-password /baseball/coach-onboarding; do
  echo -n "$p -> "; curl -s -o /dev/null -w "%{http_code}\n" "<BASE>$p"
done
```
Authenticated and dynamic-id routes still need a real logged-in browser session.

---

## 6. DEPLOY (at most 2 production deploys)

Sequence the gates so the FIRST production deploy is also the last one you need:

1. §2 migrations applied + verified on the shared DB.
2. §3 `npm run build` green LOCALLY (this is where freshly-generated code breaks — fix here, free of deploy cost).
3. §4 demo seeded + demo logins verified against the DB.
4. §5 smoke tests pass against a LOCAL `npm run start` build first, so you spend zero deploys finding render bugs.

Only then:

### Deploy #1 — SHIP (one of these two, not both)

**Option A — direct prod deploy (recommended; most controllable):**
```bash
cd /Users/ricknini/Downloads/helmv3
vercel --prod
```

**Option B — git promotion (Vercel auto-deploys `main`):**
Merge the baseball branch into `main`. `vercel.json` has `git.deploymentEnabled: true`, so the merge to `main` triggers exactly one production deploy. Use this only if the team prefers the git-integration path; it still counts as Deploy #1.

> Pick ONE path. Doing both = two prod deploys for one ship and you've spent your entire budget. If using Option B, do NOT also run `vercel --prod`.

### Deploy #2 — RESERVED HOTFIX (do not use unless prod is broken)

Hold this in reserve. If post-deploy verification (§7) finds a prod-only breakage, make the minimal fix, re-run §3 locally to confirm green, then spend Deploy #2:
```bash
vercel --prod
```
After Deploy #2, the budget is exhausted. Any further breakage → ROLL BACK (§7), do not deploy a third time.

---

## 7. POST-DEPLOY VERIFICATION + ROLLBACK

### 7a. Verify prod serves the new build AND Golf still works

The DB is shared, so verify BOTH apps after deploy:

- **BaseballHelm renders:** hit the production smoke set from §5 (at minimum `/baseball/login`, coach `/baseball/dashboard`, player `/baseball/player/today`, one dynamic route like `/baseball/dashboard/players/<id>`). All 200 + render.
- **Demo logins work in prod:** sign in as `demo-coach@baseballhelmdemo.com` and `demo-player@baseballhelmdemo.com` (`BaseballDemo2026`).
- **GolfHelm NOT broken (regression guard):** because migrations were additive and baseball-scoped they should not touch Golf, but verify — hit Golf prod's known-good URLs (e.g. homepage, `/golf/dashboard`, `/golf/demo`) and confirm 200 + render. Confirm the baseball migrations added only `baseball_*` objects:
  ```sql
  SELECT count(*) FROM information_schema.tables
  WHERE table_schema='public' AND table_name LIKE 'baseball\_%';   -- matches §2 expected total
  ```
- **Runtime errors:** check Vercel runtime logs / error tracking for new exceptions on `/baseball/*` AND `/golf/*` for ~10 min post-deploy.
- **Confirm the deployment is the one you intended:** `vercel ls` / Vercel dashboard shows the new deployment as the current production alias.

### 7b. Rollback (safe, no down-migration needed)

**Code rollback (the fast, safe path) — Vercel promote previous:**
- Via dashboard: Deployments → pick the last-known-good production deployment → "Promote to Production".
- Via CLI:
  ```bash
  vercel ls                                  # find the previous good production deployment URL
  vercel promote <previous-deployment-url>   # repoint the prod alias to it
  ```
  A promote/rollback of an existing build is generally **not** counted against the "2 new deploys" budget (it ships no new build) — but confirm with the user if in doubt before acting.

**Why no DB down-migration is required:** every applied migration is **additive and baseball-scoped** — it created new `baseball_*` tables/RPCs/policies and altered nothing in the Golf schema. Rolling the web app back to the previous build simply stops reading the new baseball objects; the unused new tables sit inert and harm nothing. There is therefore no down-migration to run and no risk to GolfHelm from leaving the baseball schema in place. (If, exceptionally, a specific baseball object must be removed, do it as a targeted, reviewed `DROP` of that one `baseball_*` object — never a broad revert.)

**Decision rule:** if prod is broken and Deploy #2 is already spent (or the fix isn't trivially safe), ROLL BACK via promote rather than risk a third deploy. Stabilize, fix locally with the full §3 gate, and plan the next ship as a fresh, separately-budgeted deploy.

---

## Appendix — quick command reference

```bash
# Build gate
cd /Users/ricknini/Downloads/helmv3
npm ci && npm run typecheck && npm run build

# Seed (dry then live) — default is dry; --confirm writes
DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-baseball-demo.ts
DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-baseball-demo.ts --confirm

# Verify baseball schema landed
#   information_schema.tables / routines / pg_policies WHERE name LIKE 'baseball\_%'

# Ship (ONE of these, once)
vercel --prod            # Option A
# or merge to main        # Option B (git integration auto-promotes)

# Rollback (does not consume new-deploy budget)
vercel ls
vercel promote <previous-good-prod-url>
```

**Facts grounded from the repo at authoring time:** 49 `*_baseball_*` migrations; 107 baseball route files; duplicate timestamp `20260624001400` (two files — rename one to `…1401` before apply); seed is dry-run by default and writes only with `--confirm`; demo logins `demo-coach@ / demo-player@baseballhelmdemo.com` / `BaseballDemo2026`; `vercel.json` → `buildCommand npm run build`, `installCommand npm ci`, `git.deploymentEnabled true`; no bare `/baseball` page (entry is `/baseball/login`).
