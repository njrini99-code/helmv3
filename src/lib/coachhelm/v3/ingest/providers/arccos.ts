/**
 * Arccos ingest adapter.
 *
 * Arccos uses OAuth 2.0 — requires env vars:
 *   - ARCCOS_CLIENT_ID
 *   - ARCCOS_CLIENT_SECRET
 *   - INGEST_ENCRYPTION_KEY (32-byte hex key for AES-256-GCM token decryption)
 *
 * The adapter activates only when ARCCOS_CLIENT_ID and
 * ARCCOS_CLIENT_SECRET are set. The cron skips it gracefully when
 * `isConfigured()` returns false.
 *
 * Token encryption: access/refresh tokens are stored AES-256-GCM
 * encrypted in golf_ingest_connections. Format is `iv:tag:ciphertext`
 * (base64-encoded segments). INGEST_ENCRYPTION_KEY must be a 64-char
 * hex string (32 bytes). If the key is missing, sync returns an error.
 *
 * Dedup: Because golf_rounds does not yet have a dedicated
 * `external_id` column, the Arccos round ID is stored in `notes` as
 * `arccos:<id>`. A future migration should add `external_id` to
 * golf_rounds for a cleaner dedup path.
 */

import crypto from 'node:crypto';
import type { IngestAdapter, IngestConnection, SyncResult } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';
import { refreshAccessToken, fetchRounds } from './arccos-client';
import { mapArccosRound, arccosExternalId } from './arccos-mapper';

// ---------------------------------------------------------------------------
// Token encryption helpers
// ---------------------------------------------------------------------------

function getEncryptionKey(): Buffer | null {
  const hex = process.env.INGEST_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) return null;
  return Buffer.from(hex, 'hex');
}

export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey();
  if (!key) throw new Error('INGEST_ENCRYPTION_KEY is missing or invalid');

  const [ivB64, tagB64, cipherB64] = encrypted.split(':');
  if (!ivB64 || !tagB64 || !cipherB64) {
    throw new Error('Malformed encrypted token — expected iv:tag:ciphertext');
  }

  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(cipherB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) throw new Error('INGEST_ENCRYPTION_KEY is missing or invalid');

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

const arccos: IngestAdapter = {
  provider: 'arccos',

  isConfigured() {
    return Boolean(process.env.ARCCOS_CLIENT_ID && process.env.ARCCOS_CLIENT_SECRET);
  },

  async sync(connection: IngestConnection): Promise<SyncResult> {
    // ---- 1. Decrypt tokens ------------------------------------------------
    let accessToken: string;
    let refreshToken: string | null;
    try {
      accessToken = decryptToken(connection.access_token_encrypted);
      refreshToken = connection.refresh_token_encrypted
        ? decryptToken(connection.refresh_token_encrypted)
        : null;
    } catch (err) {
      return {
        shots_inserted: 0,
        rounds_inserted: 0,
        errors_count: 1,
        error_detail: `Token decryption failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // ---- 2. Check expiry + refresh ----------------------------------------
    const now = new Date();
    const expired = connection.expires_at ? new Date(connection.expires_at) <= now : false;

    if (expired) {
      if (!refreshToken) {
        return {
          shots_inserted: 0,
          rounds_inserted: 0,
          errors_count: 0,
          next_state: 'revoked',
          error_detail: 'Access token expired and no refresh token available',
        };
      }

      const refreshed = await refreshAccessToken(connection, refreshToken);
      if (!refreshed) {
        return {
          shots_inserted: 0,
          rounds_inserted: 0,
          errors_count: 0,
          next_state: 'revoked',
          error_detail: 'Refresh token rejected by Arccos (401)',
        };
      }

      // Persist new tokens
      accessToken = refreshed.access_token;
      const sb = createAdminClient();
      await sb
        .from('golf_ingest_connections')
        .update({
          access_token_encrypted: encryptToken(refreshed.access_token),
          refresh_token_encrypted: encryptToken(refreshed.refresh_token),
          expires_at: refreshed.expires_at,
        })
        .eq('player_id', connection.player_id)
        .eq('provider', 'arccos');
    }

    // ---- 3. Fetch rounds from Arccos API ----------------------------------
    const since = connection.last_synced_at ?? '2020-01-01T00:00:00Z';
    const arccosRounds = await fetchRounds(accessToken, since);

    if (arccosRounds.length === 0) {
      return { shots_inserted: 0, rounds_inserted: 0, errors_count: 0 };
    }

    // ---- 4. Dedup against existing rounds ---------------------------------
    const sb = createAdminClient();
    const externalIds = arccosRounds.map((r) => arccosExternalId(r.id));

    const { data: existingRounds } = await sb
      .from('golf_rounds')
      .select('notes')
      .eq('player_id', connection.player_id)
      .in('notes', externalIds);

    const existingNotes = new Set((existingRounds ?? []).map((r) => r.notes));
    const newRounds = arccosRounds.filter(
      (r) => !existingNotes.has(arccosExternalId(r.id)),
    );

    if (newRounds.length === 0) {
      return { shots_inserted: 0, rounds_inserted: 0, errors_count: 0 };
    }

    // ---- 5. Map + insert new rounds, holes, shots -------------------------
    let roundsInserted = 0;
    let shotsInserted = 0;
    let errorsCount = 0;
    const errorMessages: string[] = [];

    for (const arccosRound of newRounds) {
      try {
        const mapped = mapArccosRound(arccosRound, connection.player_id);

        // Insert round
        const { data: insertedRound, error: roundErr } = await sb
          .from('golf_rounds')
          .insert(mapped.round)
          .select('id')
          .single();

        if (roundErr || !insertedRound) {
          errorsCount += 1;
          errorMessages.push(`Round ${arccosRound.id}: ${roundErr?.message ?? 'insert returned null'}`);
          continue;
        }

        const roundId = insertedRound.id;

        // Insert holes with real round_id, collect hole IDs
        const holesWithRoundId = mapped.holes.map((h) => ({
          ...h,
          round_id: roundId,
        }));

        const { data: insertedHoles, error: holesErr } = await sb
          .from('golf_holes')
          .insert(holesWithRoundId)
          .select('id, hole_number');

        if (holesErr) {
          errorsCount += 1;
          errorMessages.push(`Holes for round ${arccosRound.id}: ${holesErr.message}`);
          continue;
        }

        // Build hole_number → hole_id lookup
        const holeIdMap = new Map(
          (insertedHoles ?? []).map((h) => [h.hole_number, h.id]),
        );

        // Insert shots with real round_id + hole_id FK
        const shotsWithIds = mapped.shots.map((s) => ({
          ...s,
          round_id: roundId,
          hole_id: holeIdMap.get(s.hole_number) ?? null,
        }));

        if (shotsWithIds.length > 0) {
          const { error: shotsErr } = await sb
            .from('golf_shots')
            .insert(shotsWithIds);

          if (shotsErr) {
            errorsCount += 1;
            errorMessages.push(`Shots for round ${arccosRound.id}: ${shotsErr.message}`);
            continue;
          }

          shotsInserted += shotsWithIds.length;
        }

        roundsInserted += 1;
      } catch (err) {
        errorsCount += 1;
        errorMessages.push(
          `Round ${arccosRound.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // ---- 6. Return SyncResult ---------------------------------------------
    return {
      shots_inserted: shotsInserted,
      rounds_inserted: roundsInserted,
      errors_count: errorsCount,
      error_detail: errorMessages.length > 0 ? errorMessages.join('; ') : undefined,
    };
  },
};

export default arccos;
