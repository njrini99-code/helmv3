import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bridgePseudonym, pseudonymKey, scrubFreeText } from '../pseudonym';

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const KEY = { BRIDGE_PSEUDONYM_KEY: 'k'.repeat(40) };

describe('bridgePseudonym (D7, security review M1)', () => {
  it('is keyed: an unkeyed hash of the id does not reproduce it', () => {
    const p = bridgePseudonym('person', ID, KEY)!;
    expect(p).toMatch(/^u-[0-9a-f]{12}$/);
    expect(p).not.toContain(createHash('sha256').update(`bridge-pack:${ID}`).digest('hex').slice(0, 10));
    expect(bridgePseudonym('person', ID, { BRIDGE_PSEUDONYM_KEY: 'j'.repeat(40) })).not.toBe(p);
  });

  it('is stable per kind and differs across kinds', () => {
    expect(bridgePseudonym('person', ID, KEY)).toBe(bridgePseudonym('person', ID, KEY));
    expect(bridgePseudonym('team', ID, KEY)!.slice(2)).not.toBe(bridgePseudonym('person', ID, KEY)!.slice(2));
    expect(bridgePseudonym('session', 'sess_1', KEY)).toMatch(/^s-/);
  });

  it('falls back to a key derived from the service-role secret, then to withheld', () => {
    expect(pseudonymKey({ SUPABASE_SERVICE_ROLE_KEY: 's'.repeat(40) })).toMatch(/^[0-9a-f]{64}$/);
    expect(pseudonymKey({ BRIDGE_PSEUDONYM_KEY: 'short' })).toBeNull();
    expect(bridgePseudonym('person', ID, {})).toBe('u-withheld');
    expect(bridgePseudonym('team', null, KEY)).toBeNull();
  });
});

describe('scrubFreeText (security review M2)', () => {
  it('drops uuids and PostgREST details and hints', () => {
    expect(scrubFreeText(`Insert failed for ${ID}; details=Key (player_id)=(${ID}) is not present`)).toBe('Insert failed for [id]');
    expect(scrubFreeText('hint=try again')).toBeNull();
    expect(scrubFreeText(null)).toBeNull();
  });
});
