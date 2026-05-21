-- ============================================================================
-- Migration 049: Add missing enum values used by later migrations
-- ============================================================================
-- Postgres rejects ALTER TYPE ADD VALUE in the same transaction the value is
-- referenced (error 55P04 "unsafe use of new value"). Add them in a standalone
-- migration so 050+ can reference them in CHECK clauses and partial indexes.
--
-- Production already has these values; this is for clean CI DBs.
-- ============================================================================

ALTER TYPE golf_event_status ADD VALUE IF NOT EXISTS 'scheduled';
ALTER TYPE golf_qualifier_status ADD VALUE IF NOT EXISTS 'scheduled';
