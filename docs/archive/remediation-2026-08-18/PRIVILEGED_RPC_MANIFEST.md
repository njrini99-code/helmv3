# Privileged RPC manifest — Wave J, first pass

**Project:** `qmnssrrolpinvwjjnufo` (production) · **Measured:** 2026-08-19 ~04:05Z
**Scope:** all 162 definer-rights functions in `public`.
**Method:** read-only. Full `pg_proc` dump to file, static triage, then the
flagged bodies read individually. **Proposes no changes** — per the owner's
directive, anything removable is a documented candidate, not an action item.

Machine-readable: `PRIVILEGED_RPC_MANIFEST.csv` (162 rows) · triage script
`rpc_triage.py` · raw dump `raw_rpc.json`.

---

## Two whole risk classes are already closed

| Check | Result |
|---|---|
| `search_path` pinned on every definer function | **162 / 162** — none unpinned |
| Functions executable by `PUBLIC` (i.e. `anon`) | **0** — no function carries a default ACL |

The classic Supabase definer-rights failures — an unpinned `search_path`
allowing hijack, and Postgres's default `GRANT EXECUTE TO PUBLIC` exposing a
definer function to `anon` — do not exist here. That is a genuinely good result
and worth stating plainly.

26 further functions have no EXECUTE for `anon`/`authenticated`/`PUBLIC` at all
(`service_role`/`postgres` only), so they are unreachable from a client session.

## Triage of the remaining 136

| Risk | Count | Meaning |
|---|---:|---|
| LOW | 100 | no caller-supplied identity param, or body binds via `auth.uid()` |
| NOT_REACHABLE | 26 | no client-role EXECUTE |
| REVIEW | 18 | touches tenant tables with no `auth.uid()` and no recognised helper — **not yet read individually** |
| MEDIUM | 12 | caller-supplied id, binding delegated to a helper — helper not yet verified |
| HIGH (heuristic) | 6 | caller-supplied id, no `auth.uid()`, no recognised helper |

### The 6 HIGH were read. Three were my own false positives.

The heuristic looked for auth helpers matching `is_*`/`can_*`/`owns_*`/`current_*`
and therefore missed two real gating prefixes:

- **`find_baseball_player_by_email_for_roster`** — CLEARED. Gated by
  `has_baseball_staff_capability(p_team_id, 'can_manage_roster')`, and that helper
  binds to `auth.uid()` (verified by reading it). Returns nothing to a
  non-roster-manager.
- **`helm_lifting_mark_athlete_onboarded`** — CLEARED. Gated by
  `helm_lifting_is_my_athlete(p_athlete_id)`, which is
  `WHERE a.id = p_athlete AND a.user_id = auth.uid()`. Verified.
- **`get_baseball_team_join_context(p_team_id)`** — returns team id, name,
  `team_type`, `invite_policy`, `require_coach_approval` for any team id, to any
  authenticated user, with no auth check. Assessed **by design**: this is a
  first-contact join flow, which necessarily reads the resource *before* the
  membership that would authorize it. Disclosure is limited to a team's name and
  join policy. Documented, not flagged.

### The 3 that remain: authorization oracles, low severity

`verify_coach_owns_team(p_team_id, p_user_id)` ·
`verify_coach_owns_player(p_player_id, p_user_id)` ·
`coach_id_for_team(p_team_id, p_user_id)`

Each accepts an **arbitrary** `p_user_id` and is executable by `authenticated`.
They return a boolean or a coach id — never row data.

**Why they take `p_user_id` at all, and why that is defensible.** Their caller is
`src/app/api/calendar/coach/[token]/route.ts:64`, a **token-authenticated feed
route with no session**, where `auth.uid()` is unavailable. It passes
`feed.user_id` — resolved server-side from the secret `feed_token` — not a value
the caller controls. The other caller,
`src/lib/auth/verify-player-access.ts:144,175`, passes the session-derived
`userId`. **Both callers pass server-derived ids.** No caller-supplied-id bypass
was found.

**Residual, stated honestly.** Because EXECUTE is granted to `authenticated`, any
logged-in user can call these directly through PostgREST — bypassing the app — and
probe the coach↔team and coach↔player relationship graph for *other* users. That
discloses relationship facts, not rows.

> **Candidate for review (NOT an action item):** restricting EXECUTE on these three
> to `service_role` would close the oracle, since both real callers are
> server-side. **What breaks if this is wrong:** the coach calendar feed route and
> `verify-player-access` both stop authorizing, which would break coach calendar
> subscriptions and coach access to player data. This needs the owner's review in
> the morning. Not proposed, not actioned.

---

## Correction carried from the Commander

The assignment named `get_baseball_conversations_with_details` as a HIGH
cross-tenant leak filed 2026-07-29 and still open. `helmv3-24` checked live
`pg_proc` and found **it is fixed in production** — it ignores `p_user_id` and
uses `auth.uid()`; `anon` has no EXECUTE. The stale claim came from a stored note
that was propagated without measuring. I did not spend time on it.

This is the third instance tonight of a stored claim outliving the state it
described. It is the same failure mode as the `.claude/rules/` file whose own
frontmatter now reads `verified: unverified`.

## What this pass did NOT cover

Stated so the gap is not mistaken for a clean bill.

- The **18 REVIEW** and **12 MEDIUM** functions have not been read individually.
  MEDIUM delegates to helpers that were not each verified the way
  `has_baseball_staff_capability` and `helm_lifting_is_my_athlete` were.
- The **82 overlapping authenticated policy groups** (priority 2 of the
  assignment) are not started.
- No dynamic testing: nothing was called as a real `authenticated` user. Every
  claim here is from reading definitions and grants.

## The pattern to hunt next

From `helmv3-24`'s live P0, and worth stating as a general shape:
`baseball_participants_insert_by_creator` lets a conversation's creator add **any**
user at **any later time**, exposing the full prior message history — the policy
has no temporal scope binding it to the create transaction.

**The shape: a predicate that is correct at bootstrap and wrong forever after.**
That is what the policy-overlap pass should look for, not just missing tenant
constraints.
