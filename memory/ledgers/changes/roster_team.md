# Change ledger — roster_team

## 2026-09-07 — roster membership gains a one-way messaging side effect

- SHA: (this commit).
- Change: doc-only for this feature. `supabase/migrations/20260907160000_golf_team_chat_membership_management.sql`
  adds `public.golf_user_on_conversation_team(uuid, uuid)`, a definer helper that
  reads `golf_team_members` and `golf_team_coach_staff` to gate who may be added to
  or removed from a team chat. Recorded in `memory/features/roster-team.md` under
  Known Risk Areas.
- Why: removing someone from either roster table now also removes the ability to
  add them to a team conversation. Nothing about joining, approval, or roster
  status changed and no roster code was touched — the coupling runs one way,
  roster to messaging — but a reader of this feature would not otherwise learn
  that a roster row is load-bearing for another surface. The migration is WRITTEN,
  NOT APPLIED; applying it is the owner's step.

## 2026-08-27 — standing tier wraps instead of truncating

- SHA: 1a57943e6.
- Change: `FairwayPlayerCard`'s `standing_tier` line drops `truncate` and its
  `title` attribute; it now wraps.
- Why: at 390pt that cell is ~77px of text width while the tier phrases run
  19-25 characters ("Top quartile on your team"), so `truncate` cut inside the
  phrase and left "Top quartile…" — and the `title` tooltip that was the
  fallback does nothing on a touch device (2026-08-26 owner report).

<!-- golf_user_on_conversation_team was declared schema-drift-absent here while 20260907160000 was unapplied; it was APPLIED to production 2026-09-08 and db:types now carries it, so the declaration is gone and the object is checked like any other. -->
<!--
  `golf_user_on_conversation_team` is a real function, created by
  20260907160000 — which is written and NOT applied, so it is correctly absent
  from the production schema snapshot `db:types` generates. Delete this name
  from the declaration above the moment the owner applies the migration and
  re-runs `npm run db:types`; leaving it here would exempt a real object from
  the drift check.
-->

## 2026-09-08 — roster→messaging coupling is live

`20260907160000` was APPLIED to production. The definer helper
`golf_user_on_conversation_team` now really does gate team-chat membership on
`golf_team_members` (status `active`) and `golf_team_coach_staff`, so removing
someone from either roster table removes the ability to add them to a team
conversation. Previously this doc described the coupling as written-but-unapplied.
Nothing about joining, approval, or roster status changed.
