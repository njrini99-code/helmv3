/**
 * The browser client applied ONE abort budget to every request it made.
 *
 * 10s is correct for PostgREST and auth — statement_timeout is 8s, so the
 * database answers first and the abort is only a backstop. Applied to Storage
 * it is a bug: an upload is bounded by the user's uplink, not by a query
 * planner, and a phone photo just under the 2MB cap is ~16 Mbit. On LTE that
 * is routinely past 10s, so the client aborted healthy uploads and WebKit
 * surfaced `AbortError: Fetch is aborted`.
 *
 * Two Shenandoah players lost avatar uploads mid player-onboarding on
 * 2026-08-06. The first was diagnosed as an auth failure and fixed in
 * AvatarUpload (#1294); the second failed 2h22m AFTER that fix went live,
 * because the abort was never in the component.
 */
import { describe, it, expect } from 'vitest';
import { timeoutForRequest } from '@/lib/supabase/client';

const PROJECT = 'https://abc123.supabase.co';
const DB_BUDGET = 10_000;

describe('timeoutForRequest', () => {
  it('gives a Storage upload far more than the database budget', () => {
    const storage = timeoutForRequest(`${PROJECT}/storage/v1/object/avatars/u1/me.png`);
    expect(storage).toBeGreaterThan(DB_BUDGET);
    // Enough for a 2MB photo on a slow uplink, with room to spare.
    expect(storage).toBeGreaterThanOrEqual(60_000);
  });

  it('leaves PostgREST and auth on the 10s backstop', () => {
    expect(timeoutForRequest(`${PROJECT}/rest/v1/golf_players?select=*`)).toBe(DB_BUDGET);
    expect(timeoutForRequest(`${PROJECT}/auth/v1/user`)).toBe(DB_BUDGET);
    expect(timeoutForRequest(`${PROJECT}/realtime/v1/websocket`)).toBe(DB_BUDGET);
  });

  it('reads the URL out of every shape fetch accepts', () => {
    const href = `${PROJECT}/storage/v1/object/avatars/u1/me.png`;
    const asString = timeoutForRequest(href);
    expect(timeoutForRequest(new URL(href))).toBe(asString);
    expect(timeoutForRequest(new Request(href))).toBe(asString);
  });

  it('does not mistake a table or column merely named "storage" for Storage', () => {
    // The discriminator is the `/storage/v1/` route prefix, not the substring.
    expect(timeoutForRequest(`${PROJECT}/rest/v1/storage_locations?select=*`)).toBe(DB_BUDGET);
  });
});
