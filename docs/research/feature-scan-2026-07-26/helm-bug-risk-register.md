# Helm Bug Risk Register

**Research date:** 2026-07-26  
**Scoring:** Likelihood/Impact H/M/L · Priority P0–P3 · Confidence C/SI/T

These are **risk hotspots**, not confirmed production outages.

---

## RISK-001 Cross-tenant data access (golf/baseball)
- **Area:** AuthZ / RLS / actions  
- **Description:** User-supplied team_id/player_id or cookie tampering could leak data if server checks incomplete.  
- **Evidence:** Dual permission models; golf middleware lacks capability map; service-role generators; public baseball packets.  
- **Likelihood:** M · **Impact:** H · **Priority:** P0 · **Conf:** SI  
- **Tests:** Isolation personas OrgA/OrgB; forged IDs on actions; packet enumeration  
- **Observability:** Sentry + admin_events on RLS denials  

## RISK-002 Golf head vs assistant privilege blur
- **Area:** Roster/settings/team switch  
- **Evidence:** assistant role string; team switcher head-only; many pages only `if (!coach)`  
- **Likelihood:** M · **Impact:** H · **Priority:** P0 · **Conf:** SI  
- **Tests:** Assistant persona attempting switch, remove player, philosophy edit, Ask writes  

## RISK-003 CoachHelm write tools wrong player/team
- **Area:** Ask Confirm  
- **Evidence:** requireRosterPlayer; action_runs idempotency; recent Confirm fixes #1063/#1069  
- **Likelihood:** M · **Impact:** H · **Priority:** P0 · **Conf:** C (mitigations exist; still critical to scan)  
- **Tests:** Off-roster player_id; double Confirm; cancel; refresh  

## RISK-004 Insight visibility app-layer only
- **Area:** CoachHelm reads  
- **Evidence:** applyInsightVisibility; RLS ignores lifecycle/engine_version; v2 dark writes  
- **Likelihood:** M · **Impact:** M · **Priority:** P1 · **Conf:** C  
- **Tests:** Seed archived/tentative/v2 rows; assert absent from UI/tools  

## RISK-005 Stats / CoachHelm number incoherence
- **Area:** Stats + Brief  
- **Evidence:** Issues #914, #917, #920, #979, #980, #981, #944  
- **Likelihood:** H · **Impact:** M · **Priority:** P1 · **Conf:** C (issue evidence)  
- **Tests:** Same metric on stats vs Brief vs Ask vs player card within tolerance  

## RISK-006 Round review stale after edit
- **Area:** Round review  
- **Evidence:** Issue #978 P1  
- **Likelihood:** M · **Impact:** M · **Priority:** P1 · **Conf:** C  
- **Tests:** Edit score → review regenerates or shows stale warning  

## RISK-007 Recurring event edit semantics
- **Area:** Calendar  
- **Evidence:** recurring-events.ts complexity; AI create_recurring_practice  
- **Likelihood:** M · **Impact:** H · **Priority:** P0 · **Conf:** SI  
- **Tests:** Edit one vs series; timezone boundaries; attendance fan-out  

## RISK-008 RSVP / attendance / reminders duplication
- **Area:** Calendar notif  
- **Evidence:** attendance 453 rows; attendance_summary 0; hourly reminder crons  
- **Likelihood:** M · **Impact:** M · **Priority:** P1 · **Conf:** T  
- **Tests:** RSVP change; reminder idempotency; coach check-in races  

## RISK-009 Messaging silent failure regression
- **Area:** Messages  
- **Evidence:** PR #1072 fix for fan-out sending nothing  
- **Likelihood:** M · **Impact:** H · **Priority:** P0 · **Conf:** C  
- **Tests:** Coach→player DM; broadcast; assert DB + recipient UI  

## RISK-010 Task completion dual-table
- **Area:** Tasks  
- **Evidence:** glossary dual-table bug note assignments vs completions  
- **Likelihood:** M · **Impact:** M · **Priority:** P1 · **Conf:** SI  
- **Tests:** Complete task → both hub and list agree; DB which table  

## RISK-011 Course library template clone
- **Area:** Courses  
- **Evidence:** Issue #913 shared tee/hole template  
- **Likelihood:** H · **Impact:** M · **Priority:** P1 · **Conf:** C  
- **Tests:** Distinct courses have distinct hole yards  

## RISK-012 Service-role breadth / accidental exposure
- **Area:** Security  
- **Evidence:** ~159 admin client sites; past progress-driver server action footgun; Review Gate rules  
- **Likelihood:** L · **Impact:** H · **Priority:** P0 · **Conf:** SI  
- **Tests:** Bundle scan; attempt call privileged bridges; cron auth  

## RISK-013 create-admin-user edge function JWT off
- **Area:** Edge  
- **Evidence:** list_edge_functions verify_jwt=false  
- **Likelihood:** L · **Impact:** H · **Priority:** P0 · **Conf:** C  
- **Tests:** External call without auth must fail (if still deployed)  

## RISK-014 E2E infrastructure / golf seed gap
- **Area:** QA  
- **Evidence:** #953 timeouts; baseball seeded; golf env-only  
- **Likelihood:** H · **Impact:** M · **Priority:** P1 · **Conf:** C  
- **Tests:** Meta — seed script + CI gate  

## RISK-015 Baseball capability bypass on legacy actions
- **Area:** Baseball server actions  
- **Evidence:** withBaseballAction canonical; legacy may omit  
- **Likelihood:** M · **Impact:** H · **Priority:** P0 · **Conf:** SI  
- **Tests:** Staff without can_manage_imports calling import action  

## RISK-016 Public packet / passport overshare
- **Area:** Baseball public  
- **Evidence:** partial readiness; guardian/player-access module  
- **Likelihood:** M · **Impact:** H · **Priority:** P0 · **Conf:** SI  
- **Tests:** Field visibility; revoked tokens  

## RISK-017 Hydration / reduced-motion bugs
- **Area:** UI  
- **Evidence:** Issue #906; motion guard docs; ThemeScript #1044  
- **Likelihood:** M · **Impact:** M · **Priority:** P2 · **Conf:** C  
- **Tests:** reduced-motion; soft nav; console hydration  

## RISK-018 CRM accidental outbound in tests
- **Area:** Admin CRM  
- **Evidence:** sequences cron */30 Gmail ingest; 2401 crm_coaches  
- **Likelihood:** L · **Impact:** H · **Priority:** P0 (process) · **Conf:** C  
- **Tests:** Scan must mock Resend/Gmail; never enable sequence cron on shared DB  

## RISK-019 Billing scaffold mistaken for entitlements
- **Area:** Billing  
- **Evidence:** Stripe admin scaffold; business docs no paywall  
- **Likelihood:** L · **Impact:** M · **Priority:** P2 · **Conf:** C  

## RISK-020 Travel budgets scaffolded
- **Area:** Travel  
- **Evidence:** 0 budget/expense rows; features doc ⚠️  
- **Likelihood:** H (broken UX) · **Impact:** L · **Priority:** P2 · **Conf:** C  

## RISK-021 Notification delivery gaps
- **Area:** Notifs / push  
- **Evidence:** push_subscriptions 0; recent notification fixes; presence heartbeat issue #1016  
- **Likelihood:** M · **Impact:** M · **Priority:** P1 · **Conf:** SI  

## RISK-022 Dual-role session preference
- **Area:** Auth  
- **Evidence:** session prefers coach if both profiles  
- **Likelihood:** M · **Impact:** M · **Priority:** P1 · **Conf:** C  
- **Tests:** P-G-MULTI persona  

## RISK-023 Inngest / async post-round races
- **Area:** Rounds → AI  
- **Evidence:** async invalidate + insights + review; safety-net cron  
- **Likelihood:** M · **Impact:** M · **Priority:** P1 · **Conf:** SI  
- **Tests:** Eventual consistency waits; safety-net recovery  

## RISK-024 SECURITY DEFINER views
- **Area:** DB  
- **Evidence:** Supabase advisor ERROR level (dump)  
- **Likelihood:** U · **Impact:** H · **Priority:** P1 · **Conf:** T  
- **Tests:** Advisor triage + privilege checks  

---

### Testing depth guide

| Priority | Depth |
|----------|-------|
| P0 | Happy + authz negative + persistence reload + DB assert + network |
| P1 | Happy + validation + persistence + one failure mode |
| P2 | Smoke + visual/a11y sample |
