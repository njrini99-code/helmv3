# Team F — Phase 1 Done Marker

**Date:** 2026-04-21
**Branch:** main (direct)
**Status:** F1–F8 complete. **F9 (flip `ignoreBuildErrors: false`) deferred until Teams B and C land their type-safe code.**

## Tasks completed

| Task | Summary | Commit(s) |
|---|---|---|
| F1 | logServerError test pinning Sentry contract | `61d76de5` |
| F2 | 331+ console.error calls migrated to logServerError across golf/baseball actions, src/app/actions, src/app/api | `8e7af1b6`, `8f7e4b56`, `32e21439`, `912c40e7`, `cdc68f2d`, `da469264`, `dd612e39`, `891bf6ab`, `b1fd78f2`, `f1433447` |
| F3 | Upstash-backed rate limiter (with in-memory fallback); @upstash/ratelimit dep added | `c9a632df` |
| F4 | DataDog postgres placeholder removed; README documents RUM-only use | `af2d707a` |
| F5 | CI workflow + pre-deploy-check.sh now block on typecheck + lint + test + build | `512ce0b7` |
| F6 | Observability convention doc: where errors go and how to send them | `c6d3d184` |
| F7 | getPreviewUrl returns signed URL for latest version (fallback branch was broken after LIVE-29) | `2d79da81` |
| F8 | Target auth config documented; leaked-password protection pending manual toggle | `9edd9592` |

## Action required from user

1. **Provision Upstash Redis** (blocking F3's production benefit):
   ```
   vercel env add UPSTASH_REDIS_REST_URL production
   vercel env add UPSTASH_REDIS_REST_TOKEN production
   vercel env add UPSTASH_REDIS_REST_URL preview
   vercel env add UPSTASH_REDIS_REST_TOKEN preview
   ```
   Or install the Vercel Marketplace → Upstash Redis integration, which
   auto-populates these vars.

2. **Enable HaveIBeenPwned leaked-password protection** (F8):
   Supabase Dashboard → project `qmnssrrolpinvwjjnufo` → Authentication →
   Providers → Email → Advanced → "Check passwords against
   HaveIBeenPwned" → toggle ON.

3. **File_url → signed URL client refactor** (F7 gap):
   The upload actions in `src/app/golf/actions/documents.ts` and
   `src/app/baseball/actions/documents.ts` still store public URLs. With
   the `documents` bucket now private (Team A's LIVE-29 fix), any
   client `<a href={file_url}>` in `documents-client.tsx`,
   `DocumentCard.tsx`, and announcement views will 404. Worth its own
   follow-up task — needs a server action that returns fresh signed
   URLs per request, plus client switchover. **Not** in Team F's strict
   Owns.

## Metrics

- **console.error in server code** (`src/app/golf/actions/`, `src/app/baseball/actions/`, `src/app/actions/`, `src/app/api/`): 331 → **0**
- **console.error in client code** (`*.tsx` components / error.tsx boundaries): still 52 (intentional — `logServerError` is `server-only`)
- **Typecheck errors**: net-zero Team-F-introduced errors. Baseline (314 → 333 over the 2 days of cross-team work) is unchanged by F's commits.
- **Team F test files**: 3 (15 passing tests)
  - `src/test/lib/server-error-logger.test.ts`
  - `src/test/lib/auth/rate-limit.test.ts`
  - (`verify-player-access.test.ts` is Team C's)

## Deferred (for the follow-up agent)

- **F9 — `ignoreBuildErrors: false` in `next.config.mjs`**.
  Blocker: Teams A/B/C/D still have ~320 type errors that will surface
  once the flag flips. Do this AFTER Team B's engine rewrite and Team
  C's action-layer schema-drift fixes are merged. The plan for F9 is
  documented in `06-team-f-build-observability.md` §Task F9.

## Handshakes

- Coordinated with Team A via `af2d707a` (datadog README) — no conflict.
- Did **not** touch files outside Team F's strict Owns + F7's ambiguous
  `documents.ts` (scoped to the one broken read path; flagged the rest).
- Team A's 2026-04-21 `docs(memory): re-snapshot golfhelm-database.md`
  commit accidentally reverted ~30 of my earlier action-file migrations.
  Re-applied in `b1fd78f2`.
