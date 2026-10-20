# ADR 2026-10-07 — Full agent autonomy

Status: accepted (owner decision, 2026-10-07).

**Decision.** Agents decide and act without asking permission: implement, merge
PRs (`npm run pr:land` once required checks are green), apply migrations
(risky ones rehearsed on the local Docker stack first, verified after), deploy
to Vercel directly (`./node_modules/.bin/vercel deploy --prod` from the linked
checkout, or the Vercel connector), flip feature flags, and clean up their own
worktrees. They ask the user only when blocked on information nothing else
supplies; subagents cannot ask, so they return the open question with a
recommended default.

**What stays, as facts rather than permissions.** Vercel Git deployments are
disabled in `vercel.json` (merging does not deploy); deploy from the linked
checkout because an unlinked deploy creates a stray project; do not touch other
sessions' dirty files; never print secrets; fix red checks instead of bypassing
them; a red `CI aggregate` on a draft PR is expected; production has no staging,
so verify after a migration or deploy.

**Supersedes** the owner-gated parts of: `ADR-2026-09-03-control-plane-owner-decisions`
(owner decides deploys, migrations, flags), `ADR-2026-09-05-control-plane-reset`
(constitution wording on authority), and the "owner runs the deploy script;
agents do not run `vercel --prod`" policy in earlier `shipping.md`, `AGENTS.md`,
`memory/system/golfhelm-engineering-os.md` and the P0 runbooks.
`scripts/deploy-prod.sh` was removed along with its weekly-budget guard. Old
ADRs are left as written; where they disagree, `AGENTS.md` wins.

**Consequences.** `supabase/migrations/HELD.md` rows are guidance (read the
reason, update the row when you apply). Reviewer agents are optional and
risk-based. Docs that told agents to wait for the owner are reworded or marked
superseded; design docs that teach the retired glass/cream language carry a
RETIRED banner (Fairway is the live UI; Clubhouse is off in production).
