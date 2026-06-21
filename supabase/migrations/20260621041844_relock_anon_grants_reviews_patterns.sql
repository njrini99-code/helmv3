-- Wave A · A6 — revoke over-broad anon GRANT ALL
-- Audit findings: F086, F113 — anon holds full table privileges
-- (DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE) on
-- golf_round_reviews and golf_patterns_v2 (a residue of table recreation, which
-- auto-grants to anon). RLS is enabled on both (the backstop), but the grant is
-- an unnecessary risk surface.
--
-- Fix: revoke ALL from anon (and PUBLIC, harmless if none). authenticated +
-- service_role retain their grants. Mirrors the prior relock (20260528011000).
-- DO NOT re-grant anon.
REVOKE ALL ON TABLE public.golf_round_reviews FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.golf_patterns_v2  FROM anon, PUBLIC;
