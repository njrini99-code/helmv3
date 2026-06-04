-- device_tokens: allow authenticated users to claim a token row that
-- previously belonged to another user (same physical device, new login).
--
-- Background (Sentry JAVASCRIPT-NEXTJS-54 / NEXTJS-56, ~3 events / 24h):
-- registerDeviceToken() upserts into device_tokens ON CONFLICT (token).
-- When user A logs out of an iPhone and user B logs in on the same device,
-- the iOS bridge fires registerDeviceToken with the same APNs token. The
-- existing UPDATE policy was `USING (auth.uid() = user_id)` with no
-- WITH CHECK — Postgres applies USING to the EXISTING row, sees user_id=A,
-- and rejects B with "new row violates row-level security policy
-- (USING expression) for table device_tokens".
--
-- Fix: any authenticated user can update any device_tokens row (USING true)
-- as long as the resulting row claims them as the owner (WITH CHECK
-- auth.uid() = user_id). The token is a per-device opaque secret only the
-- physical device holder can know, so claim-via-knowledge is the right
-- ownership semantics. SELECT/DELETE policies stay strictly own-only.
--
-- Idempotent: DROP POLICY IF EXISTS so the migration is safe to re-apply
-- (this repo's pipeline can re-apply by filename).

DROP POLICY IF EXISTS "Users can update own tokens" ON public.device_tokens;

CREATE POLICY "Users can claim or update tokens" ON public.device_tokens
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (auth.uid() = user_id);
