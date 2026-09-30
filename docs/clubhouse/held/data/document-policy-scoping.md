# HELD DATA PLAN — Document and announcement-file policy scoping

```text
Plan ID: HD-document-policy-scoping
Status: HELD
Pages: Team hub (P010): documents and an announcement's attached files
Feature: team_communications (memory/registry.yml)
Migration: supabase/migrations/20260930150000_golf_document_policy_scoping.sql
Date: 2026-09-30
```

## Requirement

The Clubhouse security review of documents and announcements (2026-09-30) found two pre-existing policy bugs. The
server actions were tightened in the same change (`src/app/golf/actions/documents.ts`, `announcements.ts`); this
closes the direct-API path so the database agrees with them.

## Current schema

Read from `pg_policies` on production (2026-09-30):

- `golf_announcement_documents` insert and delete: `announcement_id IN (SELECT golf_announcements.id FROM
  golf_announcements WHERE golf_announcements.team_id IN (SELECT golf_announcements.team_id FROM golf_coaches WHERE
  golf_coaches.user_id = auth.uid()))`. The inner `golf_announcements.team_id` is the outer row's column, so the test
  is true for every announcement whenever the caller has any coach row. Select is correct
  (`is_golf_team_coach` or `is_golf_team_player` on the announcement's team).
- `golf_document_versions`: three coach policies (select, insert, delete) admit every coach in the document's
  organization; the player select policy reads `golf_team_members` with no status filter.
- `golf_documents` itself: `is_golf_team_coach(team_id)` for writes, and `is_golf_team_coach(team_id) OR
  (is_golf_team_player(team_id) AND is_public)` for reads.

## Proposed schema

Policies only, same names:

- `golf_ann_documents_insert_coaches`: a coach staffed on the announcement's team, and the document belongs to that
  same team.
- `golf_ann_documents_delete_coaches`: a coach staffed on the announcement's team.
- The three coach policies on `golf_document_versions`: `is_golf_team_coach(d.team_id)`.
- The player policy on `golf_document_versions`: `d.is_public AND is_golf_team_player(d.team_id)`.

## Tables / columns

None.

## Relationships

Unchanged.

## RLS / permissions

The whole change. Both tables match `golf_documents`.

## Indexes

None.

## Backfill

None. Live aggregates (2026-09-30): 1 document has versions, and every organization coach who can see it today is
staffed on its team, so 0 lose access. 1 announcement-document link exists; 0 join a document to another team's
announcement.

## Compatibility

The app already enforces the same rules in the server actions, so apply order does not matter.

## Privacy / sensitive data

Documents can hold player PII (waivers, medical forms). This narrows who can read versions of them.

## Rollback concept

The file's header records the previous definitions verbatim.

## UI behavior while held

None visible. The server actions refuse the same cases with a stated reason.

## SQL preparation status

WRITTEN — HOLD — NOT APPLIED. pgTAP not written or run: local Supabase was stopped to save memory.

## HELD.md registration

Row `20260930150000_golf_document_policy_scoping.sql`, **HOLD**.

## Activation checklist

- [ ] Review the SQL (db-migration-reviewer).
- [ ] pgTAP: a coach on another team cannot link or unlink; a player cannot read a coach-only document's versions.
- [ ] Apply through `npm run db:apply` (owner).
- [ ] Re-read `pg_policies` for both tables.
