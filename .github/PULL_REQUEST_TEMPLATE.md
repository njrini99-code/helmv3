<!--
  Keep this short and honest. The required checks (CodeRabbit, CodeQL, all,
  Smoke checks) gate merge automatically — this template is the human layer.
-->

## Summary

<!-- What changes and why. Link issues with "Closes #123". -->

## Partner-readable summary

<!-- Plain English for Helm partners. What was broken or missing? What changed? Why does it matter for demos, coaches, revenue, or product confidence? -->

## Type of change

- [ ] Bug fix
- [ ] Feature / new behavior
- [ ] Security / RLS / auth
- [ ] Database migration
- [ ] CI / tooling / chore
- [ ] Docs only

## Area

<!-- golf · baseball · coachhelm · dashboard · mobile · stats · import · ci · mission-control -->

## Risk level

- [ ] Low — docs, copy, isolated UI, or small safe fix
- [ ] Medium — product behavior or shared component changed
- [ ] High — auth, RLS, migrations, cron, secrets, payments, destructive data flow, or broad architecture

## Git Activity Timeline note

<!-- One sentence n8n can reuse in the partner timeline, e.g. "This improves demo reliability by fixing calendar events that appeared on the wrong day after a timezone change." -->

## Checklist

- [ ] `npm run lint` and `npm run typecheck` pass locally (no new ratchet regressions)
- [ ] Unit/contract tests pass (`npm test`) and I added/updated tests for this change
- [ ] **Migrations** are additive + idempotent (`IF NOT EXISTS` / `DROP POLICY IF EXISTS`), and were reviewed for shared golf-prod safety — no destructive `DELETE`/`DROP TABLE`/data rewrites
- [ ] **RLS:** any new/changed table has RLS enabled with one policy per command, anon is revoked where appropriate, and the pgTAP suite (`supabase/tests/rls/`) covers it
- [ ] **No secrets** in the diff (keys, tokens, service-role creds, `.env` values) — push protection is on, don't bypass it
- [ ] UI changes use design-system primitives (no raw `<button>`/`<input>`/arbitrary `px`/`bg-white`) and include before/after screenshots
- [ ] If this should appear in Helm Mission Control, the PR includes a clear partner-readable summary and timeline note

## Screenshots / notes

<!-- UI diffs, migration plan, rollout/deploy notes, anything a reviewer needs. -->
