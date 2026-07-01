<!--
  Keep this short and honest. The required checks (CodeRabbit, CodeQL, all,
  Smoke checks) gate merge automatically — this template is the human layer.
-->

## Summary

<!-- What changes and why. Link issues with "Closes #123". -->

## Type of change

- [ ] Bug fix
- [ ] Feature / new behavior
- [ ] Security / RLS / auth
- [ ] Database migration
- [ ] CI / tooling / chore
- [ ] Docs only

## Area

<!-- golf · baseball · coachhelm · dashboard · mobile · stats · import · ci -->

## Checklist

- [ ] `npm run lint` and `npm run typecheck` pass locally (no new ratchet regressions)
- [ ] Unit/contract tests pass (`npm test`) and I added/updated tests for this change
- [ ] **Migrations** are additive + idempotent (`IF NOT EXISTS` / `DROP POLICY IF EXISTS`), and were reviewed for shared golf-prod safety — no destructive `DELETE`/`DROP TABLE`/data rewrites
- [ ] **RLS:** any new/changed table has RLS enabled with one policy per command, anon is revoked where appropriate, and the pgTAP suite (`supabase/tests/rls/`) covers it
- [ ] **No secrets** in the diff (keys, tokens, service-role creds, `.env` values) — push protection is on, don't bypass it
- [ ] UI changes use design-system primitives (no raw `<button>`/`<input>`/arbitrary `px`/`bg-white`) and include before/after screenshots

## Screenshots / notes

<!-- UI diffs, migration plan, rollout/deploy notes, anything a reviewer needs. -->
