# HelmV3 Repo Cleanup Review

Use this with `npm run ctx:repo:compressed` or `npm run ctx:changed`.

## Goal

Review the attached HelmV3 Repomix context for dead code, stale routes, unsafe ownership boundaries, generated-file drift, and cleanup opportunities that are safe to act on.

## Rules

- Separate confirmed bugs from source-based risks.
- Do not recommend deleting code unless you can name the active import, route, script, workflow, or test evidence proving it is unused.
- Treat `next-env.d.ts`, service worker output, database types, screenshots, and Repomix packs as generated artifacts unless the context proves otherwise.
- Keep BaseballHelm, GolfHelm, CoachHelm, and Helm Bridge boundaries explicit.
- Prefer small, reversible patches with validation commands.

## Output

1. Overall verdict.
2. Confirmed issues ordered by severity.
3. Safe cleanup candidates with evidence.
4. Items that need runtime, Vercel, Sentry, Supabase, or browser evidence.
5. Exact commands to verify before merge.
