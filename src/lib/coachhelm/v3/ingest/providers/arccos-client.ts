/**
 * Arccos API client — OAuth token refresh + round fetching.
 *
 * Arccos OAuth 2.0 endpoints (developer partnership required):
 *   - Token refresh: POST https://api.arccosgolf.com/oauth/token
 *   - Rounds:        GET  https://api.arccosgolf.com/api/v1/rounds
 *
 * Requires ARCCOS_CLIENT_ID + ARCCOS_CLIENT_SECRET env vars.
 */

import type { IngestConnection } from '../types';

// ---------------------------------------------------------------------------
// Arccos API response types
// ---------------------------------------------------------------------------

export interface ArccosShot {
  id: string;
  club: string;
  distance_yards: number;
  lie: string;
  result: string;
  distance_to_pin_before: number;
  distance_to_pin_after: number;
  shot_number: number;
  is_penalty: boolean;
  penalty_type?: string;
}

export interface ArccosHole {
  hole_number: number;
  par: number;
  yardage: number;
  score: number;
  putts: number;
  fairway_hit: boolean | null;
  gir: boolean;
  shots: ArccosShot[];
}

export interface ArccosRound {
  id: string;
  round_date: string;
  course_name: string;
  course_id: string;
  course_city?: string;
  course_state?: string;
  tees_played?: string;
  total_score: number;
  total_putts: number;
  holes: ArccosHole[];
  weather_conditions?: string;
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

const ARCCOS_TOKEN_URL = 'https://api.arccosgolf.com/oauth/token';
const ARCCOS_API_BASE = 'https://api.arccosgolf.com';

interface TokenRefreshResult {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

/**
 * Refresh an expired Arccos OAuth access token using the stored
 * refresh_token. Returns null on 401 (token fully revoked) so the
 * adapter can flip state to 'revoked'.
 */
export async function refreshAccessToken(
  _connection: IngestConnection,
  decryptedRefreshToken: string,
): Promise<TokenRefreshResult | null> {
  const clientId = process.env.ARCCOS_CLIENT_ID;
  const clientSecret = process.env.ARCCOS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch(ARCCOS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: decryptedRefreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (res.status === 401) return null;

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown');
    throw new Error(`Arccos token refresh failed (${res.status}): ${text}`);
  }

  const body = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const expiresAt = new Date(Date.now() + body.expires_in * 1000).toISOString();

  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: expiresAt,
  };
}

// ---------------------------------------------------------------------------
// Fetch rounds
// ---------------------------------------------------------------------------

/**
 * Fetch rounds from the Arccos API since a given ISO date. Returns an
 * empty array when there's nothing new.
 */
export async function fetchRounds(
  accessToken: string,
  since: string,
): Promise<ArccosRound[]> {
  const url = new URL('/api/v1/rounds', ARCCOS_API_BASE);
  url.searchParams.set('since', since);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown');
    throw new Error(`Arccos fetchRounds failed (${res.status}): ${text}`);
  }

  const body = (await res.json()) as { rounds: ArccosRound[] };
  return body.rounds ?? [];
}
