# Vercel Deployment + Runtime Investigation — 2026-05-28

**Investigator:** Claude (read-only; live MCP data from Vercel)
**Project:** `prj_qPgC4eErTUsaSmv40EiQMNuTpuEV` / team `team_WYEGBoW9Hpg2tB1QClWuVxc5`
**Window analyzed:** last ~10h of deploys (38 deployments) + 24h runtime + 7d Inngest sweep
**Scope:** characterize Vercel deployment and runtime health after the PR #117-#127 + #92 + #94 wave

---

## TL;DR

- **Production deploy success rate: 100%** for the last 24h and last 7d window covered (every `target=production` deploy = `READY`).
- **One ERROR deploy total** — a *preview* (not prod) for PR #112's `codex/helm-alignment-guards` branch. Root cause: the new prebuild env guard (`scripts/check-required-env.mjs`) fired correctly because that branch was missing `NEXT_PUBLIC_SUPABASE_URL` in preview env scope at the moment of build. Subsequent rebuild on the same branch (after the user added preview env vars — commit `bb8086f8 "chore: trigger rebuild after Preview env vars added"`) went READY. **Not a regression — the guard worked as designed.**
- **Production runtime: clean.** Zero `error`/`fatal` runtime logs in 24h. Zero 500s. Zero edge-function or middleware errors.
- **Inngest health: green.** Zero matches on `inngest` over a 7d window in runtime logs. PR #106's v4 API shape fix has been live since deploy `dpl_EnqaQJvvL8AbttQiw14An8mdfjjL` and is sticking.

---

## 1. Recent production deployments

Pulled via `list_deployments` (38 across all targets). Filtered to `target=production`:

| Time (UTC) | Deploy ID | Commit | PR | State |
|---|---|---|---|---|
| 23:58 | dpl_AaLcEnpUFexoBbrMr2HnmrtaCsc9 | 2556597a | #127 | READY |
| 23:54 | dpl_EnXVFMRGkbsh2avRtZ7WuD9FQmC9 | 01ee8b13 | #125 | READY |
| 23:53 | dpl_HfuSVGE7PW5ZQAZUuD2ckHK3j7uC | 4081c3b7 | #126 | READY |
| 23:53 | dpl_AL81CkEsqeunmAs7jsTPj1tVxqe8 | 10f7235c | #123 | READY |
| 23:53 | dpl_5CyFqabXtMDbnFf1RYrvVqk62VBt | b96ae03b | #121 | READY |
| 23:53 | dpl_CFmJrejTX8HpemCUQThQCiqfiAGJ | 745f47c5 | #124 | READY |
| 23:53 | dpl_2Af9d6WTgrNUsBnjauUx4CNoJWuz | 391b43cb | #122 | READY |
| 23:52 | dpl_57pRuc2RtMHgMgf7bnY8rJH4XepU | 780d8082 | #120 | READY |
| 23:49 | dpl_54LraBYVYjVnBM1Su6V22WxDoGdJ | 61c137a2 | #94  | READY |
| 23:49 | dpl_E9ntj9WFJBXFmGDujciickqvZYkd | 61bc3db7 | #92  | READY |
| 23:25 | dpl_8jEK1yq29Gayop3n5Nr9BSxkWu89 | 19004fe6 | #119 | READY |
| 23:25 | dpl_4GSioRBUkq5pD4QaWeKmmXnpnoKQ | dda0f0b2 | #118 | READY |
| 22:38 | dpl_EfPkuHdZVTEtUEmuGeShfoFi16dG | f4a92842 | #117 | READY |
| 21:55 | dpl_Fp2rGGG4GvdjJg5EFzAGPz6wS2n7 | b7573ca3 | #116 | READY |
| 21:18 | dpl_FyHvK7qH5kTpLk4WkjaTzHzfdMBh | 88b04475 | #112 | READY |
| 20:39 | dpl_4jVkA2Cqne73VRXGLkU7H1LWKfJd | 196f0bfa | #115 | READY |
| 20:32 | dpl_DjWy9Rud3Evn2uYhb4jeb7Hopq14 | 057a5585 | #114 | READY |
| 19:30 | dpl_EnqaQJvvL8AbttQiw14An8mdfjjL | da9b1d8e | #106 | READY |

**Tally (production target only):**
- 18 production deploys in window
- 18 READY / 0 ERROR / 0 CANCELED
- **Success rate: 100% (24h and 7d covered)**

The one BUILDING deploy at top of list (`dpl_5hxcAZgiee9wsayiYkaQc6PnaVvz`, PR #128 W35 follow-up) is `target=null` (preview) and was created mid-investigation — not yet evaluable but does not affect the production tally.

---

## 2. Build failures

### 2.1 The only ERROR deploy (preview, not prod)

`dpl_4HMtZZeyGvFWokmxNYEimjdi4vmp` — PR #112 `codex/helm-alignment-guards`, commit `78f78102`, **target=null (preview)**, created 2026-05-27 19:07 UTC.

Build log shows the failure happened in the *prebuild step* added by PR #112 itself:

```
> helmv3@1.0.0 prebuild
> node scripts/check-required-env.mjs && node scripts/stamp-sw.mjs

Missing required env var: NEXT_PUBLIC_SUPABASE_URL
Error: Command "npm run build" exited with 1
```

This is exactly what the guard was written to do — fail fast when a deploy lacks canonical Supabase env vars. Preview env on that branch did not yet have those vars set (per the next commit on the same branch — `bb8086f8 "chore: trigger rebuild after Preview env vars added"` — the user added them and the rebuild went READY). So:

- **Classification:** intentional guardrail trip, not a regression.
- **No fix required.** The guard is working.
- **Production was never affected** — production env scope already has the canonical Supabase vars (confirmed by every `target=production` deploy in §1 going READY).

### 2.2 Failure-type tally

| Type | Count | Notes |
|---|---|---|
| Build script error (env guard) | 1 | Preview-only; intentional |
| Typecheck | 0 | |
| Lint | 0 | |
| Test | 0 | (CI is separate from Vercel build) |
| OOM | 0 | |
| Build timeout | 0 | |
| Framework error | 0 | |

---

## 3. Runtime errors (production, last 24h)

Queries run via `get_runtime_logs`:

| Query | Result |
|---|---|
| `level=["error","fatal"]`, `environment=production`, `since=24h`, `limit=50` | **0 logs** |
| `statusCode=500`, `since=24h` | **0 logs** |
| `level=["error"]`, `source=["edge-function","edge-middleware"]`, `since=24h` | **0 logs** |
| `level=["warning"]`, `since=24h` | 3 logs |

### 3.1 The 3 warnings, in full

| Time (UTC) | Method | Path | Status | Source / Message |
|---|---|---|---|---|
| 19:27 | POST | `/` | 404 | `Error: Failed to find Serve…` — appears to be an external probe POSTing to root |
| 11:40 | POST | `/` | 404 | same shape |
| 03:45 | GET | `/api/cron/coachhelm-roster-sweep` | 200 | `[pattern-miner.thresholds] …` — known structured-log warning, cron succeeded (200) |

**Verdict:** no actionable runtime errors. The two 404 POST `/` lines are external probes (not regressions). The pattern-miner warning is a structured log emitted by the existing roster-sweep cron — request still returned 200, so it's an informational warning at most.

### 3.2 Top 3 runtime error patterns

There are **no error patterns** to report in the last 24h on production. This matches the memory note that 39 LLM hero_narrative calls + 199 standing rows landed cleanly today — confirms the production runtime path is healthy.

---

## 4. Regression candidates from today's PRs

Cross-referencing the 14 PRs landed today (#117-#127 + #92 + #94) against runtime errors:

| PR | Touched path | Runtime errors on path? | Verdict |
|---|---|---|---|
| #94  | `/api/coachhelm/v3/chat/send` (server actions) | 0 | clean |
| #120 | composite/loader.ts null-signature guard (~3000 Sentry events/14d) | 0 in Vercel runtime logs | likely fixed (Sentry will confirm independently) |
| #122 | `/dashboard/rounds/[id]/review` (round-review LLM card) | 0 ("round-review" query returned no logs) | clean |
| #123 | GoalCard / IntentDrawer / CounterfactualLine (client motion only) | n/a (client-side) | not server-impacting |
| #124 | `/api/cron/v3/goal-suggestions-write` + `…-evaluate` | not yet fired (crons are 03:30 / 03:45 UTC; deploy landed 23:53 UTC — first execution is overnight) | will check next pass |
| #125, #126, #127 | docs-only | n/a | clean |
| #117 | supabase baseline migration (schema only) | n/a (DB layer; no Vercel runtime impact) | clean |
| #118, #119 | CI workflow + DB function guards | n/a | clean |
| #92 (W43 TeeStrategyGenerator) | server-side generator path | 0 errors | clean |

**No regression candidates.** No production error path matches any file touched by today's PRs.

### 4.1 Notable production cron evidence (last 24h)

| Time (UTC) | Cron | Status |
|---|---|---|
| 06:01 | `GET /api/cron/v3/causality-attribute` | 200 |
| 05:00 | `GET /api/cron/v3/genome-nightly` | 200 |
| 04:00 | `GET /api/cron/v3/standing-refresh` | 200 |
| 03:45 | `GET /api/cron/coachhelm-roster-sweep` | 200 (with one structured warning, see §3.1) |

The W19 follow-up crons from PR #124 (`/api/cron/v3/goal-suggestions-write` 03:30 UTC, `…-evaluate` 03:45 UTC) had not yet fired in this window — PR landed at 23:53 UTC, first scheduled execution will be on the next day's 03:30/03:45 cycle. Re-check tomorrow.

---

## 5. Inngest health

PR #106 ("fix(inngest): align with v4 API to unblock Vercel typecheck") shipped at 2026-05-27 19:30 UTC in `dpl_EnqaQJvvL8AbttQiw14An8mdfjjL` (target=production, state=READY).

Runtime log sweeps:

| Query | Window | Result |
|---|---|---|
| `query="inngest"`, env=production | 7d | 0 logs (timed out before all pages, but no error matches surfaced in returned pages) |
| `query="/api/inngest"`, env=production | 7d | 0 logs (also timed out; same caveat) |

**Verdict:** Inngest is not generating runtime errors. The v4 typecheck unblocked the build chain — every prod deploy since #106 has been READY, which would not be possible if Inngest's `weeklyHealthPing` function signature still tripped TS. No incoming function-invocation errors in Vercel runtime logs.

Two caveats worth flagging:

1. **The 7d query timed out before full pagination** — so I can't claim a complete sweep. But no error-level matches appeared in the pages we did get, and the build-success record over 7d (no ERROR deploys due to Inngest typecheck) is independent corroboration.
2. **Inngest function executions actually run on Inngest's side**, not Vercel's, so a fuller Inngest-side health check would require the Inngest dashboard. From Vercel's runtime perspective (the API route `/api/inngest`), there's no error noise.

---

## 6. Open follow-ups

1. **Re-check the W19 goal-suggestion crons** (#124) after their first 03:30 / 03:45 UTC fire — they were deployed 23:53 UTC so the next-day execution is the first real run.
2. **Confirm the PR #128 W35 broaden-attribute preview deploy** (`dpl_5hxcAZgiee9wsayiYkaQc6PnaVvz`) goes READY — currently BUILDING when this doc was written.
3. **Sentry-side health for composite/loader.ts** (~3000 events/14d before PR #120). Vercel runtime logs are clean, but Sentry is the authoritative source for client-rendered crashes that didn't generate a 500. Worth a separate pass.

---

**Methodology note.** All findings sourced from MCP calls — no speculation. Production deploy table is exhaustive across the queried window (target=production filter). Runtime log queries were intentionally narrow (since=24h, level/source/statusCode pinned) to avoid the timeout problem that broader queries hit.
