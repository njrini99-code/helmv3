# Baseball Stats Seed Script — Key Rotation (2026-06-30, #380)

## Status: ROTATION REQUIRED — human action, not automatable from a PR

`scripts/seed-baseball-stats.mjs` previously (commit `ef1dc926`, fixed in
`6418559a` / #417) had the following committed in plaintext, in tracked
source, for the production Supabase project `qmnssrrolpinvwjjnufo`:

- The production `NEXT_PUBLIC_SUPABASE_URL`
  (`https://qmnssrrolpinvwjjnufo.supabase.co`).
- A long-lived `service_role` JWT (full database read/write, bypasses RLS).
- The production `TEAM_ID` and `COACH_ID` UUIDs the script seeded against.

`#417` removed the hardcoded values from the working tree and replaced them
with env-var loading (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SEED_TEAM_ID` / `SEED_COACH_ID` or `--team` / `--coach`), a `--confirm`
dry-run guard, and a `KNOWN_PROD_PROJECT_REF` write-block (see
`scripts/__tests__/seed-baseball-stats.safety.test.mjs`). `#380` additionally
adds gitleaks rules (`.gitleaks.toml`: `supabase-hs256-jwt`,
`supabase-key-env-assignment`) so the `gitleaks` review-gate job fails CI if
a Supabase JWT or key-env assignment is committed again.

**Neither fix rotates or invalidates the key.** The JWT is still fully valid
and still readable by anyone with read access to the repository's git
history (it is present in commit `ef1dc926` and any commit between it and
`6418559a`). Removing it from the current working tree does not revoke it.

## Required follow-up (cannot be done from this sandbox)

- [ ] Sign in to the Supabase dashboard for project `qmnssrrolpinvwjjnufo`.
- [ ] Rotate (regenerate) the `service_role` key under
      Project Settings → API.
- [ ] Update `SUPABASE_SERVICE_ROLE_KEY` everywhere it is configured:
      - Local `.env.local` for every developer who uses this script.
      - Vercel Production and Preview environment variables.
      - Any CI/CD secret store that references it.
- [ ] After rotation, run `scripts/check-required-env.mjs` (or the
      equivalent deploy-time env check) to confirm the new value is present
      everywhere before the next deploy.
- [ ] Record the rotation date/outcome as a follow-up entry in this file (do
      **not** paste the new or old key value here — this file is allowlisted
      in `.gitleaks.toml` precisely because it is expected to discuss the
      *fact* of a leaked credential, not reproduce it).
- [ ] Optional / only if mandated separately: history-scrub commit
      `ef1dc926` (and any commit carrying the secret forward) via
      `git filter-repo`, coordinating with everyone holding a local clone —
      out of scope for this fix, since rotation alone makes the old token
      inert.

## Why this matters

A `service_role` key bypasses Row Level Security entirely. Anyone who has
ever cloned this repository (or who finds it via a public mirror/fork) can
read it out of git history regardless of whether the current `main` branch
still contains it. Until the key above is rotated in the Supabase dashboard,
it must be treated as an active, exploitable credential.
