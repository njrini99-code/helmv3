-- STATUS: WRITTEN — HOLD — NOT APPLIED
--
-- Two pre-existing policy bugs found by the Clubhouse documents/announcements security review (2026-09-30).
-- Both tables are brought in line with golf_documents, whose policies already use is_golf_team_coach(team_id) and
-- is_golf_team_player(team_id) AND is_public.
--
-- 1. golf_announcement_documents INSERT/DELETE. The subquery reads
--      team_id IN (SELECT golf_announcements.team_id FROM golf_coaches WHERE golf_coaches.user_id = auth.uid())
--    and `golf_announcements.team_id` there is the OUTER row's column, so the test is "the announcement's team equals
--    itself, provided the caller has any coach row anywhere". Any coach in any program could attach or detach files
--    on any team's announcement. Now: a coach staffed on the announcement's team, and (insert only) the document
--    must belong to that same team.
--
-- 2. golf_document_versions. The three coach policies admit every coach in the document's ORGANIZATION
--    (golf_teams.organization_id = golf_coaches.organization_id), not the coaches staffed on the document's team,
--    which is the rule golf_documents itself uses. The player policy reads golf_team_members with no status filter.
--    Now: is_golf_team_coach(d.team_id) for coaches; is_golf_team_player(d.team_id) AND d.is_public for players.
--
-- Live impact (read-only, 2026-09-30): 1 document has versions, and every org coach who can see it today is also
-- staffed on its team (0 coach/team pairs lose access). 1 announcement-document link exists, and 0 links join a
-- document to another team's announcement. No data changes.
--
-- The server actions were tightened at the same time (src/app/golf/actions/documents.ts, announcements.ts), so the
-- app does not rely on these policies for its own checks; this closes the direct-API path.
--
-- Forward-only and idempotent (drop if exists, then create). Not applied by the author. Apply through
-- `npm run db:apply` after review (docs/operations/APPLY_PATH.md).
--
-- ROLLBACK: recreate the previous definitions (captured from pg_policies, 2026-09-30):
--   golf_ann_documents_insert_coaches / golf_ann_documents_delete_coaches:
--     announcement_id IN (SELECT golf_announcements.id FROM golf_announcements
--       WHERE golf_announcements.team_id IN (SELECT golf_announcements.team_id FROM golf_coaches
--         WHERE golf_coaches.user_id = (SELECT auth.uid())))
--   "Coaches can view|insert|delete document versions":
--     EXISTS (SELECT 1 FROM golf_documents d JOIN golf_teams t ON d.team_id = t.id
--       JOIN golf_coaches c ON t.organization_id = c.organization_id
--       WHERE d.id = golf_document_versions.document_id AND c.user_id = (SELECT auth.uid()))
--   "Players can view document versions for visible docs":
--     EXISTS (SELECT 1 FROM golf_documents d JOIN golf_team_members tm ON d.team_id = tm.team_id
--       JOIN golf_players p ON tm.player_id = p.id
--       WHERE d.id = golf_document_versions.document_id AND d.is_public = true AND p.user_id = (SELECT auth.uid()))

begin;

-- 1. golf_announcement_documents -------------------------------------------------------------------------------

drop policy if exists golf_ann_documents_insert_coaches on public.golf_announcement_documents;
create policy golf_ann_documents_insert_coaches on public.golf_announcement_documents
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.golf_announcements a
      join public.golf_documents d on d.id = golf_announcement_documents.document_id
      where a.id = golf_announcement_documents.announcement_id
        and d.team_id = a.team_id
        and public.is_golf_team_coach(a.team_id)
    )
  );

drop policy if exists golf_ann_documents_delete_coaches on public.golf_announcement_documents;
create policy golf_ann_documents_delete_coaches on public.golf_announcement_documents
  for delete to authenticated
  using (
    exists (
      select 1
      from public.golf_announcements a
      where a.id = golf_announcement_documents.announcement_id
        and public.is_golf_team_coach(a.team_id)
    )
  );

-- 2. golf_document_versions ------------------------------------------------------------------------------------

drop policy if exists "Coaches can view document versions" on public.golf_document_versions;
create policy "Coaches can view document versions" on public.golf_document_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.golf_documents d
      where d.id = golf_document_versions.document_id
        and public.is_golf_team_coach(d.team_id)
    )
  );

drop policy if exists "Coaches can insert document versions" on public.golf_document_versions;
create policy "Coaches can insert document versions" on public.golf_document_versions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.golf_documents d
      where d.id = golf_document_versions.document_id
        and public.is_golf_team_coach(d.team_id)
    )
  );

drop policy if exists "Coaches can delete document versions" on public.golf_document_versions;
create policy "Coaches can delete document versions" on public.golf_document_versions
  for delete to authenticated
  using (
    exists (
      select 1 from public.golf_documents d
      where d.id = golf_document_versions.document_id
        and public.is_golf_team_coach(d.team_id)
    )
  );

drop policy if exists "Players can view document versions for visible docs" on public.golf_document_versions;
create policy "Players can view document versions for visible docs" on public.golf_document_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.golf_documents d
      where d.id = golf_document_versions.document_id
        and d.is_public = true
        and public.is_golf_team_player(d.team_id)
    )
  );

commit;
