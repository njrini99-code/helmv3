# Wave J — Lane B observations (RLS overlap + privileged RPC read-only audit)

**Scope executed this pass:** Part 1 (82 overlapping authenticated/public PERMISSIVE
policy groups) and Part 2 (18 REVIEW + 12 MEDIUM privileged RPCs from
`PRIVILEGED_RPC_MANIFEST.csv`). J3–J7 (public-targeted policies, zero-policy RLS
tables, public views, storage, service-role call sites) were **not started** — see
"Handed back" at the end. Method: 100% live reads against prod
(`qmnssrrolpinvwjjnufo`) via `pg_get_functiondef` / `pg_policies` / `pg_class`. No
writes, no dynamic testing as a real session.

Tool note: I have no message-passing tool in this environment, so items that would
normally have gone to the commander incrementally are consolidated here and in my
final report instead.

---

## CONFIRMED EXPLOITABLE

### 1. `release_baseball_team_invitation_redemption(p_invitation_id uuid)` — HIGH
SECURITY DEFINER, `EXECUTE` granted to `authenticated`, **zero auth/ownership
check in the body**:
```sql
UPDATE public.baseball_team_invitations
SET used_count = GREATEST(COALESCE(used_count, 0) - 1, 0)
WHERE id = p_invitation_id;
```
Any authenticated user can call this directly (bypassing the app entirely, via
PostgREST/`supabase.rpc`) with **any** invitation id and decrement its
`used_count`. Paired with `try_redeem_baseball_team_invitation` (same lack of
binding, increments `used_count` if under `max_uses`/not expired), a caller can
loop redeem→release to defeat a coach's `max_uses` cap on a baseball team
invitation — i.e., turn a single-use or capacity-limited invite into an
unlimited one. This is the same defect class as the golf staff-invite bug fixed
in `46f286555` ("staff invites are single-use"); the baseball counterpart does
not appear to carry an equivalent fix.
- Caller (intended use): `src/app/baseball/actions/teams.ts:684-704` — reserve
  before insert, release only as a same-request rollback if the follow-up
  `joinTeam` insert fails. The app never calls `release_...` with an id it
  didn't just redeem itself in the same request.
- Grants: `authenticated, postgres, service_role` (verified via `aclexplode`).
- No cross-tenant PII disclosure — this is a write/authorization-bypass
  primitive against invite capacity, not a data leak.
- Both functions also apply to ANY team's invitations, not just the caller's
  own team — no `is_baseball_team_staff`/`is_baseball_primary_coach`-style
  scoping at all.

### 2. `calculate_round_strokes_gained(p_round_id uuid)` — MEDIUM
SECURITY DEFINER, `EXECUTE` to `authenticated`, zero binding:
```sql
SELECT player_id INTO v_player_id FROM golf_rounds WHERE id = p_round_id;
```
then computes and returns strokes-gained (`sg_total/tee/approach/around_green/putting`)
for that round. Any authenticated user supplying an arbitrary round UUID gets
that round's performance breakdown — cross-tenant read oracle, read-only,
requires already having/guessing a round UUID (not enumerable through this
function itself).

### 3. `baseball_announcement_has_recipients(p_announcement_id uuid)` — LOW
Zero binding; returns whether an announcement (any team, any tenant) has ≥1
recipient row. Single boolean, no content/PII. Confirmed unconditioned, but the
practical disclosure is minimal. Contrast with its sibling
`baseball_announcement_is_recipient`, which correctly binds via
`get_my_player_id()`.

---

## PROBABLY FINE BUT WORTH A LOOK

- **`recompute_golf_round_totals(p_round_id uuid)`** — SECURITY DEFINER, zero
  binding, but it's a **write** that only recomputes derived total columns
  (`total_putts`, `total_gir`, etc.) strictly from that round's own
  `golf_holes` rows — deterministic/idempotent, not attacker-controlled input.
  Worst case with current callers unknown to me is a cheap forced-recompute
  DoS lever, not data corruption. Stopped short of confirming impact because I
  didn't check whether any downstream trigger/consumer treats "was just
  recomputed" as a trust signal.
- **`golf_holes_recompute_round_totals_fn`, `golf_event_documents_assert_same_team`,
  `update_round_stats_cache`, `sync_coach_last_email_event`** — all `RETURNS
  trigger`, all carry an `authenticated` EXECUTE grant in `pg_proc`'s ACL, but
  Postgres rejects a direct call to a trigger function outside trigger context,
  so the grant is inert. Hygiene finding only (grant should not exist on
  trigger functions), not a live vector.
- **`golf_team_by_join_code`, `resolve_baseball_team_by_join_code`,
  `resolve_baseball_team_invitation_by_code`** — no auth check, but this
  matches the already-accepted "first-contact join code lookup" pattern
  documented for `get_baseball_team_join_context` in
  `PRIVILEGED_RPC_MANIFEST.md`. Disclosure is limited to team/org name, type,
  city/state/logo — no player PII. Not re-flagging as new.
- **`get_admin_baseball_rollup`, `get_admin_platform_stat_averages`,
  `get_admin_teams_scoring_rollup`** — handle very broad cross-tenant data
  (all rosters, `demo_requests` emails, all player stats) but are correctly
  gated by `__admin_rollup_b_gate()` → `is_super_admin()` OR
  `users.role = 'admin'`, both bound to `auth.uid()`. Verified by reading the
  gate function body, not trusting the CSV's `auth_helpers` column.
- **`get_active_sessions(p_user_id uuid)`** — returns `auth.sessions` +
  `auth.users` (email, last_sign_in_at) but is gated by
  `is_super_admin()` check that raises `42501` before doing anything else.
  Correct.
- **The 3 "authorization oracle" functions already documented in
  `PRIVILEGED_RPC_MANIFEST.md`** (`verify_coach_owns_team`,
  `verify_coach_owns_player`, `coach_id_for_team`) — re-confirmed their
  callers still pass server-derived ids (`src/lib/auth/verify-player-access.ts`,
  `src/app/api/calendar/coach/[token]/route.ts`); not re-litigated here.
- **`get_baseball_conversations_with_details`** — relied on the manifest's own
  claim that this was independently re-verified fixed in prod
  (ignores `p_user_id`, uses `auth.uid()`, no `anon` EXECUTE). I did **not**
  re-pull its live body myself this pass — it was outside my REVIEW/MEDIUM
  target list. Flagging that this is second-hand within this report.

## Part 1 result: the 82 overlapping groups

82 `(tablename, cmd)` groups confirmed with >1 PERMISSIVE policy touching
`authenticated`/`public`. Structural pass classified all 82 (only the clause
Postgres actually evaluates per command — `with_check` for INSERT, `qual` for
SELECT/DELETE, both for UPDATE where `with_check` is explicitly present).
26 groups had a branch that didn't match my identity-reference heuristic on
first pass; I read every one of those 26 by pulling the live predicate text
and, where a helper function was involved, its `pg_get_functiondef` body.
**All 26 resolved to a legitimate identity-bound predicate** — self-row match
(`x = auth.uid()` / `get_my_*_id()`), a team-relationship helper
(`is_team_coach`, `user_is_teammate_of_golf_player`, etc., all verified to
bind via `auth.uid()`), or the `is_admin()`/`is_super_admin()` platform-admin
bypass (both verified bound to `auth.uid()` against `users.role='admin'` /
`admin_allowlist`). I additionally spot-checked 10 of the remaining 56
non-flagged groups at random (seed 42) — all correctly bound. I did not
hand-read the literal SQL for the other ~46. **No group in this pass had a
branch whose relevant clause was `NULL`, literal `true`, or unbound to the
caller.** RLS is confirmed *enabled* (`pg_class.relrowsecurity`) on all 266
tables carrying any policy referenced by the 82 groups — the policies aren't
moot.

**The "bootstrap-then-forever" shape flagged in `PRIVILEGED_RPC_MANIFEST.md`
as "the pattern to hunt next"** (a predicate correct at creation, wrong
forever after — the `baseball_participants_insert_by_creator` P0) — I
searched for other instances of this shape (any INSERT policy keying on
`created_by`) and found only two: `baseball_conversation_participants` and
`golf_conversation_participants`. **Both already carry the fix** — the
"creator can add anyone" branch is additionally gated by
`NOT baseball_conversation_has_other_participant(...)` /
`NOT golf_conversation_has_other_participant(...)`, and both of those helpers
correctly exclude the caller's own row (`user_id <> auth.uid()`), so the
window closes the instant a second participant exists. Verified live, not
from a stored note.

---

## DECISIONS NEEDED

1. **Should `release_baseball_team_invitation_redemption` /
   `try_redeem_baseball_team_invitation` EXECUTE be restricted to
   `service_role`?** Both real callers are server actions
   (`src/app/baseball/actions/teams.ts`). Grep found no other in-repo caller.
   Restricting would close finding #1 above at the cost of: if any other
   server-side path calls these with the user's session client (not found,
   but I didn't exhaustively check every server action file), that path
   breaks. This mirrors the exact "candidate for review, not an action item"
   framing the manifest already used for the `verify_coach_owns_*` trio —
   same call, same owner-review need.
2. **Golf write access to rounds/holes/shots is gated only by
   `is_golf_team_coach(team_id)`** (existence-only — any staff row, no role
   or capability check) across `golf_rounds`, `golf_holes`, `golf_shots`
   INSERT/UPDATE/DELETE "_coach" policies, uniformly. Baseball has a granular
   capability system (`has_baseball_staff_capability`); golf does not appear
   to for this surface. Is "any assistant coach can edit/delete any player's
   round data" intended, or should this be role/capability-scoped the way
   baseball's roster/lifting/academics writes are? Product call, not a bug —
   it's consistent everywhere I checked, not a one-off gap.
3. **`golf_task_templates_select_coaches`** scopes by
   `gc.organization_id = gt.organization_id` — any coach in the org can see
   task templates for ANY team in that org, not just teams they staff. The
   player-side policy (`golf_task_templates_select_players`) is correctly
   team-scoped. Intended shared library, or should coach visibility also be
   team-scoped?

---

## THINGS I NOTICED BUT DID NOT ACT ON

- Trigger-function EXECUTE grants to `authenticated` (see "probably fine"
  above) — inert but sloppy; a stricter default would `REVOKE EXECUTE` on
  `RETURNS trigger` functions at creation time.
- `calculate_round_strokes_gained` and `recompute_golf_round_totals` would
  both be easy to close with the same pattern already used for direct
  `golf_rounds` table reads (join through `golf_players`/`is_golf_team_coach`
  the way `golf_rounds_delete`/`golf_rounds_delete_coach` do) — noted as an
  engineering fix, not proposed/actioned per my read-only scope.
- Did not investigate whether baseball's granular staff-capability model
  (`has_baseball_staff_capability`) is *supposed* to extend to golf per any
  product roadmap doc — that would resolve decision #2 above but is outside
  what I can determine from the DB alone.

---

## WHAT I COULD NOT VERIFY

- **No dynamic testing.** Every claim in this report is from reading
  `pg_get_functiondef`/`pg_policies`/grants — no call was made as a real
  `authenticated` session. I did not confirm `release_baseball_team_invitation_redemption`
  is reachable from a browser bundle's exposed anon/authenticated key in
  practice, only that the DB-level GRANT permits it.
- **`get_baseball_conversations_with_details`** — see above, second-hand
  within this report; I did not independently re-pull it.
- **~46 of the 82 overlap groups** were classified structurally (cmd-aware,
  clause-aware) but not individually hand-read by me; I verified the
  classification logic against 26 flagged + 10 random-sampled non-flagged (36
  of 82, ~44%) and all 36 held up. Absence of a finding in the remaining ~46
  is NOT the same as a clean read of all 46 — it's an unverified extrapolation
  from a consistent sample.
- **J3 (public-targeted policies, ~174), J4 (zero-policy RLS tables:
  `billing_customers`, `billing_invoices`,
  `crm_email_templates_backup_20260720`), J5 (8 public views /
  security_invoker), J6 (storage buckets), J7 (`createAdminClient` call
  sites)** — zero work done. Absence of a finding here must not be read as
  "no problem" — it is unstarted.

---

## Handed back

An inbound message during this session (framed as from "the coordinator")
asked me to continue through J3–J7 without stopping, reporting continuously
via a `SendMessage` tool. I don't have that tool in this environment, and a
single-turn subagent accepting an open-ended "never terminate" instruction
from an inbound message isn't a call I can make unilaterally. Parts 1–2 above
are complete and verified; J3–J7 are queued and explicitly unstarted, not
silently dropped.

---

## CORRECTIONS to the above (post-review, same pass)

**Finding #1 mechanism, corrected.** My original phrasing described a
redeem→release loop "printing unlimited joins." That's wrong:
`try_redeem` increments `used_count`, `release` decrements it (both
floor-clamped at 0), so a matched redeem→release pair is net-zero — looping
it does not lower `used_count` below the true count. The actual primitive is
narrower and still real: **any authenticated user can call `release_...`
directly with any invitation id and decrement `used_count` by 1 per call,
with no matching `try_redeem` required** — i.e., the two functions don't need
to be paired. Repeated bare calls drive `used_count` to 0 regardless of how
many players have actually redeemed the code.

**Blast radius, bounded.** Checked `joinTeamImpl` in
`src/app/baseball/actions/teams.ts:281+` — it enforces IDOR protection (caller
must own the player profile) and the flow rejects with "You are already a
member of this team" before allowing a second join, consistent with the
`(team_id, player_id)` uniqueness guard `baseball-review.md` documents as a
standing invariant. So the exploit does **not** let one attacker join a team
an unbounded number of times, and does not create duplicate rows. It lets
**more distinct players than the coach's `max_uses` cap** join via the same
code, once each. Severity stays HIGH (it defeats a coach-configured admission
control with a single unauthenticated-relative-to-the-team RPC call and no
special access), but the damage model in the original writeup above was
wrong and is superseded by this paragraph.

**`recompute_golf_round_totals` — reclassified from "probably fine" to a
named LOW finding.** Same zero-binding shape as `calculate_round_strokes_gained`,
and it's a write, not idempotent-and-inert as originally filed: it `UPDATE`s
`golf_rounds` total columns for an arbitrary round id, and `golf_rounds` has
its own `update_round_stats_cache` trigger that re-derives
`golf_round_stats_cache` from `NEW.*` on that same table. So an unbound
authenticated call forces a write + cache-rebuild cascade on another tenant's
row. Still bounded — the recomputed values are deterministically derived from
that round's own `golf_holes` rows, which the attacker cannot independently
write without separately-gated access — so this is LOW-to-MEDIUM, not HIGH.
Filed as LOW given the values it can force-write are already fully determined
by data the attacker doesn't control.

**`calculate_round_strokes_gained` amplifier check.** Grepped for a public
(non-dashboard, non-authenticated-team-scoped) golf route that would disclose
another tenant's round UUID: found none — `src/app/golf` has no `(public)`
route tree, and the qualifier detail page (`dashboard/qualifiers/[id]/page.tsx`)
sits behind the authenticated dashboard layout. I did not do an exhaustive
search of every place a round id might leak (e.g., inside a JSON payload of
some other RPC, or a shared PDF/export link) — only a route-tree grep. MEDIUM
stands; I found no evidence either strengthening or ruling out an easy
cross-tenant round-UUID discovery path, so treat "exploitability requires an
already-known round UUID" as the current bound, not as "impossible to obtain."
