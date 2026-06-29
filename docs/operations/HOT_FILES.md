# Hot Files

These paths deserve extra care because small changes can affect broad product behavior, security, or agent routing.

## `src/app/golf/actions/golf.ts`

Status: high-risk / broad action surface

Rules:
- No mixed feature work.
- Prefer extracting new focused action files for new behavior.
- Require feature-specific tests.

## `src/app/golf/actions/stats-data.ts`

Status: stats-critical

Rules:
- Never hide database errors as empty states.
- Add explicit data-honesty checks for changed stats behavior.
- Run stats regression tests.

## `src/lib/coachhelm/v2/**`

Status: AI correctness-critical

Rules:
- Invariant tests are required for behavior changes.
- Do not change prompt or output behavior without eval notes.
- Do not ship unverified LLM prose.

## `supabase/migrations/**`

Status: DB/security-critical

Rules:
- Add RLS in the same migration for new tables.
- Do not add `SECURITY DEFINER` functions without an explicit `search_path`.
- Run migration lint and RLS tests.

## `memory/registry.yml`

Status: agent-routing-critical

Rules:
- Update when feature ownership changes.
- Keep paths precise.
- Avoid broad globs unless intentional.
