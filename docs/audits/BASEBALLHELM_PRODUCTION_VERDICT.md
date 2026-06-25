# BaseballHelm — Overnight Finish: Production Verdict

**Date:** 2026-06-25 (overnight autonomous run)
**Scope:** BaseballHelm only (golf/CoachHelm untouched, protected).
**Bottom line:** Code is **DONE, green, polished, committed**. Production go-live is **BLOCKED on your approval** for shared-prod DB writes (a safety gate fired — details below). Unblocking is ~2 minutes of approvals.

---

## ✅ What got done autonomously (safe work)
- **Canonical spec** synthesized from the full V1–V12 revolution plan → `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md` (107 features, 131 DB objects).
- **Lifting Lab + Staff Room finished/reworked** (WF1) — file-disjoint build to blueprint.
- **Conformance + 7/8 P0 bugs fixed + premium polish** (WF2): announcements 500, dev-plan filter, 28 orphaned nav routes, `useTeamRouteProtection` wiring, video-upload path, etc.
- **Migration timestamp collisions resolved** (`000082→000083`, `001400→001401`).
- **Build is GREEN** — `npx tsc --noEmit` clean, `npm run build` succeeds (177 pages). Committed at `e12f790b` on `feat/baseballhelm-ui-pass`.

## 🛑 Why production stopped (read this first)
1. **Prod was already mutated out-of-band.** The orphaned 25h+ workflow from the archived session **applied ~51 of the baseball/helm_lifting migrations directly to the shared golf-production DB** (apply-time version keys, a few applied twice). Prod now has **118 baseball + 26 helm_lifting tables**. This was NOT done by this session.
2. **🔴 SECURITY — 55 of 118 baseball tables are readable by the `anon` role on prod right now.** The `anon_revoke` migrations that close this are among the unapplied ones. **Fix this first.**
3. **Your chosen safety gate is unavailable.** You chose "branch-validate then prod," but Supabase branching errors on this project (`list_branches`: "project reference missing"). With no branch to validate on, applying to shared prod would skip the gate you required — so the harness correctly **blocked** the automated apply, and I did not work around it.
4. **Golf is intact** — coaches 15 / players 60 / teams 13 / rounds 281, `handle_new_user` present. The orphan's applies did not damage golf data.

## 🔧 Remaining steps (need your go — all baseball/helm_lifting only, additive/idempotent)
**A. Apply the ~7 genuinely-unapplied migrations (do anon-revokes FIRST — security):**
```
20260625000050_baseball_anon_revoke_wave1.sql      ← SECURITY (closes anon read)
20260625000060_baseball_anon_revoke_wave2.sql      ← SECURITY
20260624001200_baseball_import_source_external_id.sql
20260624000082_baseball_staff_display_and_invite_columns.sql   (verify not already applied)
20260625000040_baseball_staff_display_scope_columns.sql
20260625000070_baseball_performance_indexes.sql
20260625000080_helm_lifting_backfill_from_baseball.sql
```
(`20260624000083_stat_visual_views` and `20260624001401_public_player_stats_rpc` already applied under old keys — re-apply only if their objects are missing; idempotent.)

**Verify after A:**
```sql
-- anon exposure should drop to ~0 (only intentionally-public tables):
select count(*) filter (where has_table_privilege('anon',format('%I.%I','public',tablename),'SELECT')) anon_readable,
       count(*) total from pg_tables where schemaname='public' and tablename like 'baseball_%';
-- golf canary must stay 15/60/13/281:
select (select count(*) from golf_coaches), (select count(*) from golf_players),
       (select count(*) from golf_teams), (select count(*) from golf_rounds);
```

**B. Regen types:** `mcp generate_typescript_types` → `src/lib/types/database.ts`; re-run `npx tsc --noEmit` (should stay green).

**C. Seed demo:** run `scripts/seed-baseball-demo.ts` (coach + player + lifting-coach) against prod.

**D. Deploy:** advance `main` to the `feat/baseballhelm-ui-pass` tip + push (Vercel auto-deploys), or `vercel --prod`. Post-deploy smoke: baseball/lift/staff routes + 3 demo logins + golf homepage/login/dashboard all 200.

## How to unblock me
Say **"approved — apply the reconciliation migrations and deploy"** (or run A–D yourself). I'll execute A→D in order with the verify gates and a golf regression smoke, and stop instantly if the golf canary moves.

---
*No prod DB writes and no deploy were performed by this run. All changes above are local, committed, and reversible until you approve A–D.*
