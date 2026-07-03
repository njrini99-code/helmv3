# P0 Runbook — 2026-07-03: Service-role key still live in tracked source (#516 follow-up)

These are operational steps a maintainer with Supabase/Vercel/GitHub dashboard
access must perform. They are **not** automatable by an agent working only
inside the repo — no MCP tool available to this session can rotate a
Supabase JWT secret or edit Vercel/CI secret stores. Check off each as you
complete it.

## Background

Issue #516 ("P0: production service_role key hardcoded in 9 tracked
scripts") is marked **closed**, and claims the key was rotated, the 9
scripts were refactored to env vars, and gitleaks was used to verify. A
2026-07-03 stabilization pass re-verified this from scratch and found the
closure was **incomplete**:

- All 9 scripts named in #516 (`check-policies.ts`, `check-rls.ts`,
  `db-health-check.ts`, `debug-player-insert.mjs`, `diagnose-rls.ts`,
  `fix-auth.mjs`, `import-via-api.mjs`, `list-orphan-players.ts`,
  `run-sql.mjs`) **still had the literal production `service_role` JWT**
  (and, in two of them, the `anon` JWT + a real plaintext account password)
  hardcoded in tracked source on `main`, as of this pass.
- One additional script not named in #516, `scripts/run-migration.mjs`,
  had the same hardcoded prod URL/pattern.
- The JWT's `iat` claim decodes to 2026-01-13 and the files were last
  touched 2026-02-14 — i.e. the key looks like it was reissued around
  2026-01-13 and then immediately re-embedded in these scripts afterward,
  so it is very likely still the **live, current** production
  `service_role` key.
- The regression guard meant to catch this
  (`scripts/__tests__/scripts-no-committed-secrets.test.mjs`) only scanned
  files matching `seed-baseball-*.{mjs,ts}` (added for a different issue,
  #391) — none of the 10 offending files matched that glob, so the guard
  gave false confidence.
- Separately, that guard test was never actually executed by anything:
  it used `node:test` imports but nothing in `package.json` or
  `.github/workflows/**` ever ran `node --test` against it, and vitest's
  config only globs `src/**`. It has never run, in CI or locally, since it
  was added.
- CI's `gitleaks` job (`.github/workflows/review-gate.yml`) also did not
  catch this, because `gitleaks/gitleaks-action` scans new commits in the
  current push/PR by default, not the full existing tree — a rule added
  after a secret is already committed does not retroactively flag it.

The 2026-07-03 pass (PR: `fix/p0-rotate-hardcoded-service-role-secrets`)
fixed the code-side half of this: all 10 scripts now read
`NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` from env vars and fail fast if missing, the
plaintext password was replaced with `RLS_DIAGNOSTIC_TEST_EMAIL` /
`RLS_DIAGNOSTIC_TEST_PASSWORD`, `seed-rini-baseball-demo.ts`'s hardcoded
demo passwords now require `RINI_DEMO_*_PASSWORD` env vars, and the
regression guard now scans **every** file under `scripts/` and is wired
into `npm test` via vitest (previously it ran nowhere). None of that
removes the key from git history, and none of it rotates the actual live
credential — that part requires the steps below.

## 1. Rotate the production `service_role` (and `anon`) JWT — URGENT

- [ ] Sign in to the Supabase dashboard for project `qmnssrrolpinvwjjnufo`.
- [ ] Project Settings → API → **Regenerate JWT secret** (this mints new
      `anon` + `service_role` keys and immediately invalidates the old
      ones for every client, everywhere).
- [ ] Immediately update the new `service_role` / `anon` values in:
      - [ ] Vercel → Project → Settings → Environment Variables, for
            **Production**, **Preview**, and **Development** scopes
            (`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
      - [ ] Any CI secret store that references these (GitHub Actions
            repo/environment secrets, CircleCI project env vars) — check
            `.github/workflows/**` and `.circleci/config.yml` for which
            jobs consume them.
      - [ ] Local `.env.local` for every developer machine that runs
            Supabase-touching scripts.
      - [ ] The Supabase MCP server config if it embeds a key directly
            (`.mcp.json` here only has the project ref, not a key, but
            double check any personal/global MCP config outside this
            repo).
- [ ] Redeploy production (`vercel --prod` or trigger via dashboard) after
      the env vars are updated, so the running app picks up the new key.
- [ ] Smoke test: sign in as a real coach/player account in production
      immediately after redeploy to confirm auth + RLS-protected reads
      still work with the new `anon` key.

Rotating the JWT secret is a **blast-radius-wide** action — every deployed
client (web, Capacitor iOS, any script, any other integration) using the
old keys breaks the instant you regenerate. Coordinate timing; do not do
this silently.

## 2. Rotate the exposed demo account password

`scripts/check-rls.ts` and `scripts/diagnose-rls.ts` hardcoded a real
plaintext password for the developer's own demo coach/player accounts
(`njrini99@gmail.com` / `rinin376@gmail.com`, shared between BaseballHelm
and GolfHelm logins per `scripts/seed-rini-baseball-demo.ts`'s own header
comment). This is not a customer's credential, but it has been sitting in
git history since 2026-02-14 and is trivially recoverable by anyone who
ever cloned the repo.

- [ ] Change the password for both accounts (via the app's password-reset
      flow or Supabase Auth dashboard → Users → reset password).
- [ ] Set the new values in `.env.local` as `RINI_DEMO_COACH_PASSWORD` /
      `RINI_DEMO_PLAYER_PASSWORD` / `RINI_DEMO_FILLER_PASSWORD` (and
      `RLS_DIAGNOSTIC_TEST_EMAIL` / `RLS_DIAGNOSTIC_TEST_PASSWORD` if you
      still use `check-rls.ts` / `diagnose-rls.ts` for RLS debugging)
      before running `seed-rini-baseball-demo.ts` again.

## 3. Decide whether to scrub git history

The old key/password remain permanently visible in git history (multiple
commits, going back to 2026-02-14) even after step 1/2 rotate the live
credentials and this PR removes them from the current tree. Once the key
is rotated, the historical copies are inert (they authenticate against a
Supabase project that no longer accepts them), so this is a lower-urgency
cleanup than rotation itself — but the plaintext password and email are
still exposed to anyone who clones the repo.

- [ ] Decide: is history-rewriting (`git filter-repo` or GitHub's secret
      redaction tooling) worth the coordination cost (force-push, every
      collaborator must re-clone or hard-reset)? Precedent from
      `docs/operations/2026-05-17-p0-runbook.md` §1 was to leave history
      alone once the underlying project/credential was confirmed dead —
      the same logic applies here once step 1 is done.
- [ ] If yes, schedule it as its own change, coordinated with every
      active local clone and any outstanding branches/forks.

## 4. Close the detection gaps that let this go undetected

Already fixed in `fix/p0-rotate-hardcoded-service-role-secrets`:

- [x] Broadened `scripts/__tests__/scripts-no-committed-secrets.test.mjs`
      to scan every file in `scripts/`, not just `seed-baseball-*`.
- [x] Wired that test into vitest's `unit` project (`vitest.config.ts`) so
      `npm test` / `npm run test:run` / CI's `Unit tests` job actually run
      it. Previously nothing executed it.

Still open, out of scope for this PR (tracked separately — see the
stabilization master report):

- [ ] `scripts/__tests__/` has ~47 other `*.test.mjs` files written for
      `node --test` that are **also** not wired into any CI job or npm
      script. Each documents a real invariant (design tokens, route
      hygiene, a11y, baseball data safety, etc.) that is currently
      unenforced. This needs its own audit + wiring pass; do not bulk-glob
      them all into vitest without checking each one runs cleanly under
      it first (two sampled files failed immediately with "No test suite
      found" when tried).
- [ ] Consider whether CI's `gitleaks` job should also run a periodic
      full-history scan (not just diff-of-push) so a newly added rule
      retroactively catches pre-existing committed secrets, instead of
      only catching secrets introduced after the rule exists.
