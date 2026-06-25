-- =============================================================================
-- Migration: 20260626000030_baseball_notifications_revoke_anon.sql
-- Purpose:   Close an anon-grant hole on public.baseball_notifications.
--
-- Audit (2026-06-25) found baseball_notifications carried a direct
-- GRANT ALL to anon (arwdDxtm) — every other baseball_* / helm_lifting_*
-- table is already anon-clean (revoke waves 20260625000050/060). RLS is
-- enabled with self-or-team-coach policies, but a table-level anon grant is a
-- defense-in-depth violation and a hard CI gate (CodeRabbit/Greptile) failure.
--
-- This REVOKE is additive security hardening: authenticated + service_role
-- keep their grants and RLS continues to gate row access.
-- =============================================================================

REVOKE ALL ON public.baseball_notifications FROM anon;
