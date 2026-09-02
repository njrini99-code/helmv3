# The 10 unaccounted migrations that needed an individual read

**Read:** 2026-08-19 08:00Z · read-only · **nothing written to the ledger**
**Queries:** `q/ten.sql`, `q/two.sql`, `q/rounds_check.sql` · raw in `raw_ten.json`

These were the `NO_DETECTABLE_OBJECTS` bucket — grants, constraints, data
backfills and column adds that create no uniquely-named object, so static
analysis could not verify them. Each was read, then its *effect* checked against
the live database.

---

## Result: 9 STAMP · 1 OBSOLETE

| # | Migration | Effect present live? | Decision |
|---|---|---|---|
| 01 | `harden_coach_insights_update_grants` | **NO** | **OBSOLETE — neither stamp nor apply** |
| 02 | `relock_crm_admin_rpcs` | yes | STAMP |
| 03 | `reaffirm_golf_rounds_update_grants` | yes | STAMP (see golf note) |
| 04 | `notification_type_event_updated_pattern` | yes | STAMP |
| 05 | `seed_lpga_standards` | yes | STAMP |
| 06 | `retire_stranded_predictions` | yes (moot) | STAMP |
| 07 | `harden_crm_view_and_recruit_doc_functions` | yes | STAMP |
| 08 | `baseball_staff_display_scope_columns` | yes | STAMP |
| 09 | `helm_lifting_backfill_from_baseball` | yes | STAMP |
| 10 | `retype_orphaned_class_events` | yes (moot) | STAMP |

---

## ⚠ 01 · `20260528011000_harden_coach_insights_update_grants` — OBSOLETE

**The one real find in the ten. It must not be stamped — and, as it turns out, must
not be applied either. My first recommendation was APPLY and it was wrong; the
retraction and the correct answer are below.**

What it does — a pure privilege-tightening migration:

```sql
REVOKE ALL    ON TABLE public.golf_coach_insights FROM anon;
REVOKE UPDATE ON TABLE public.golf_coach_insights FROM authenticated;
REVOKE UPDATE (status, dismissed, resolved_at, metadata, lifecycle_state)
              ON TABLE public.golf_coach_insights FROM authenticated;
GRANT  UPDATE (acknowledged_at, dismissed_at)
              ON TABLE public.golf_coach_insights TO authenticated;
```

Live state — **neither revoke happened**:

- **`anon` still holds** `SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER` on
  `golf_coach_insights`, plus column-level `UPDATE` across the full column set
  including `coach_id`, `content` and `status`. The migration's first line exists
  to remove exactly this.
- **`authenticated` still holds column `UPDATE` on** `status`, `dismissed`,
  `resolved_at`, `metadata`, `lifecycle_state` — the five columns the migration
  was written to revoke — alongside the two it intended to keep.

So the intended end-state (`authenticated` may only touch `acknowledged_at` and
`dismissed_at`) is not in force, and `anon` retains table privileges.

**Severity, stated carefully.** This is a *grant* layer finding, not a proven
exposure. RLS is the enforcing layer, and a `GRANT` without a permissive policy
still yields nothing through PostgREST. I did **not** verify the RLS posture of
`golf_coach_insights`, so I am **not** claiming anon can write to it. What I am
claiming is narrower and certain: **a security-hardening migration was written,
never applied, and has sat unapplied for ~12 weeks while the ledger gap hid it.**
Its whole purpose was defence in depth behind RLS, and that layer is absent.

### ⛔ RETRACTION — my "APPLY" recommendation was wrong

I recommended APPLY while explicitly flagging that I had not checked the enforcing
layer. `helmv3-c9` checked it, and it inverts the recommendation. Verified here
independently.

**The `anon` half is not an exposure.** `golf_coach_insights` has RLS on with 6
policies and **every one targets `{authenticated}`; zero target `anon`.** Anon's
grants are inert — no permissive policy, nothing through PostgREST. A
defence-in-depth gap only, which is as far as I had claimed.

**The `authenticated` half is real but bounded.**
`coach_insights_update_player_own` (USING and WITH CHECK both
`player_id IN (select id from golf_players where user_id = auth.uid())`) lets a
player update their own rows, and the un-revoked column grants let them write
`status`, `lifecycle_state`, `metadata`, `resolved_at`. Own rows only; no tenancy
crossing.

**And applying it would break a live coach flow.** `dismissInsight`
(`src/app/golf/actions/intelligence-dashboard.ts:548-556`) runs under the
**user-scoped** client and writes `dismissed`, `dismissed_at`, `status`,
`lifecycle_state` — three of them columns this migration revokes from
`authenticated`. It would fail with **42501**. The `DS-1` comment block directly
above that call documents this exact failure already happening once, for
`updated_at`: *"including it made Postgres reject the whole statement with 42501
before RLS was even evaluated — dismissInsight always failed."*

**Which reframes the twelve weeks.** I read "unapplied for ~12 weeks" as the ledger
gap hiding the migration. It reads better as **someone hitting 42501 and backing
out** — the ledger gap then hid the *decision*, not the migration. A missing record
of a deliberate non-application looks identical to an oversight, which is its own
argument for the ledger work.

### Decision: a fourth category — `OBSOLETE_SUPERSEDED_BY_APP_CHANGE`

Neither stamp (asserts a revoke that never happened) nor apply (breaks a live
flow). **The intent is right and the mechanism cannot express it:** coaches and
players share the `authenticated` role, and a column grant cannot distinguish them.
The migration was written before that was true of this table.

The shape of a real fix — route player-side mutation through a SECURITY DEFINER RPC
writing only permitted columns, then revoke direct UPDATE — is a design decision
with real content, not a reconciliation step. **Not written here.**

## The nine that stamp — evidence for each

**02 `relock_crm_admin_rpcs`** — intended `service_role`-only EXECUTE on
`get_crm_coach_email_events` and `get_crm_email_stats_detailed`. Live ACL on both:
`postgres=X/postgres service_role=X/postgres`. No `anon`, no `authenticated`, no
PUBLIC. Exactly the target state. **STAMP.**

**03 `reaffirm_golf_rounds_update_grants`** — grants column `UPDATE` on
`player_id, team_id, qualifier_id, qualifier_round_number` to `authenticated`.
All four verified present for `authenticated`. **STAMP** — and note the stamp
changes no privilege; it records a file, and the grant is already live.

> **Golf note, as requested — this does not widen anything, and here is the check
> I ran rather than asserting it.** The grant permits reassigning a round's owning
> player or team, so I read the `UPDATE` policies on `golf_rounds`:
> `golf_rounds_update` and `golf_rounds_update_team` both carry a `WITH CHECK`
> binding `player_id` to the caller (or to the coach's team roster).
> `golf_rounds_update_coach` has **no** `WITH CHECK` — which in Postgres means the
> `USING` expression applies to the new row too, so it is **not** an open door.
>
> Residual, and it is not new: that policy resolves through `is_golf_team_coach`,
> the existence-only helper already tracked as the P0. Until that is fixed, an
> assistant coach can reassign a round between players **on their own team**. That
> is a modification, not a deletion, it is bounded by team, and it is **covered by
> the existing P0 fix** rather than being a separate item. Flagging it so the P0
> fix is known to close this too.

**04 `notification_type_event_updated_pattern`** — the live
`golf_calendar_notifications_notification_type_check` constraint contains the
`event_updated:%` LIKE branch the migration adds. **STAMP.**

**05 `seed_lpga_standards`** — `golf_pga_standards.tour` column exists; row counts
by tour are `pga=28 lpga=28`. Both tours seeded symmetrically. **STAMP.**
*(Aside: this closes the open question behind the memory note that the LPGA
standards loader is unwired — the DATA is present; it is the consumer that does
not read it. A data gap and a wiring gap are different problems.)*

**06 `retire_stranded_predictions`** — a data `UPDATE` categorising predictions
whose `due_date <= created_at`. Rows still matching its `WHERE`: **0**. Rows
already carrying `error_category='invalid_horizon'`: **415**. Ran, or is now moot;
either way re-running is a no-op. **STAMP.**

**07 `harden_crm_view_and_recruit_doc_functions`** — both guarded effects present:
`v_crm_coaches_by_school` has `security_invoker=true`, and
`golf_recruit_documents_assert_same_team` has `search_path=public, pg_temp`.
**STAMP.** *(This also resolves half of INFRA-12's "objects no migration creates":
the view's only referencing migration is this one, and it is real.)*

**08 `baseball_staff_display_scope_columns`** — all five columns present on
`baseball_team_coach_staff` (`bio, phone, visible_to_players, scope_player_ids,
scope_group_ids`) and both on `baseball_staff_invitations` (`invitee_name,
message`). **STAMP.**

**09 `helm_lifting_backfill_from_baseball`** — the strongest evidence of the nine.
`helm_lifting_athletes` holds 22 rows, **all** with `sport='baseball'`, **all**
with a non-null `sport_player_id`, and **all 22** matching a real
`baseball_players` row. That linkage exists only if this backfill ran. (22 of 35
source players is expected — the insert is `DISTINCT ON` and filtered.) **STAMP.**

**10 `retype_orphaned_class_events`** — retypes `golf_events` from `'other'` to
`'class'` where the description carries a `[class:` tag. Rows still matching:
**0**. Events now typed `class`: **1,589**. **STAMP.**

---

## Revised path for the 32

| Count | Action |
|---:|---|
| **26** | **STAMP** — 17 from the static pass + 9 from this read |
| 3 | FORWARD-FIX migration, then stamp (`PARTIAL_EQUIVALENT`) |
| **1** | **OBSOLETE** — `harden_coach_insights_update_grants`, needs a redesign decision |
| 2 | permanent holds (`gate_secdef_ownership_and_redemption`, `baseball_legacy_stats_backfill`) |

**32 → 2 known exceptions** is now fully mapped, with one migration that is neither
stampable nor appliable. The `CANNOT-DETERMINE` bucket is **empty** — every one of the ten resolved.

**Nothing here was written to the ledger.** Stamping and applying are both the
Commander's to execute.
