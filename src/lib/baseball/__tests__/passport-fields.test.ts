// =============================================================================
// Unit tests for the Player Passport field catalog + the honesty floor.
//
// THE RULE these guard: a per-field visibility override may only NARROW a
// staff_only base — it can NEVER widen a staff-private field to public/scout.
// The catalog (passport-fields.ts) is the SINGLE source of truth shared by the
// read model (resolveFieldVisibility) and the write action (sanitize +
// clampOverrideToBase). If the two ever drift, exposure would silently leak a
// field the player meant to keep private, or a no-op override would pollute the
// stored map. These lock the contract on the pure module both halves import.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  PASSPORT_FIELD_DEFS,
  PASSPORT_FIELD_KEYS,
  PASSPORT_FIELD_BASE,
  clampOverrideToBase,
  isPassportFieldVisibility,
} from '@/lib/baseball/passport-fields';

describe('passport field catalog', () => {
  it('has the keys the read model resolves (identity + measurable + academic)', () => {
    // These are exactly the keys the read model pushes/resolves. A drift here is
    // a silent break: a saved override for a key not in the read model is dead.
    const expected = [
      'name',
      'preferred_name',
      'grad_year',
      'positions',
      'bats_throws',
      'height_weight',
      'hometown',
      'high_school',
      'measurable',
      'academic',
    ];
    for (const key of expected) {
      expect(PASSPORT_FIELD_KEYS.has(key)).toBe(true);
    }
  });

  it('every def has a base visibility present in the base map', () => {
    for (const def of PASSPORT_FIELD_DEFS) {
      expect(PASSPORT_FIELD_BASE[def.key]).toBe(def.base);
    }
  });
});

describe('isPassportFieldVisibility', () => {
  it('accepts the four valid levels and rejects anything else', () => {
    expect(isPassportFieldVisibility('staff_only')).toBe(true);
    expect(isPassportFieldVisibility('player_visible')).toBe(true);
    expect(isPassportFieldVisibility('public')).toBe(true);
    expect(isPassportFieldVisibility('scout')).toBe(true);
    expect(isPassportFieldVisibility('guardian_visible')).toBe(false);
    expect(isPassportFieldVisibility('')).toBe(false);
    expect(isPassportFieldVisibility(null)).toBe(false);
    expect(isPassportFieldVisibility(2)).toBe(false);
  });
});

describe('clampOverrideToBase — the honesty floor', () => {
  it('drops a no-op override that equals the base', () => {
    // measurable base is player_visible → setting player_visible is a no-op.
    expect(clampOverrideToBase('measurable', 'player_visible')).toBeNull();
  });

  it('allows a player_visible field to be exposed up to public / scout', () => {
    // A player electing to publish their own number is allowed (not a staff-
    // private record).
    expect(clampOverrideToBase('measurable', 'public')).toBe('public');
    expect(clampOverrideToBase('measurable', 'scout')).toBe('scout');
  });

  it('allows narrowing a player_visible field down to staff_only', () => {
    expect(clampOverrideToBase('academic', 'staff_only')).toBe('staff_only');
  });

  it('does not treat a player_visible base as a floor — public is allowed (floor is dormant by design)', () => {
    // The floor only bites a staff_only base. No shipped field has a staff_only
    // base today (every catalog base is player_visible), so the floor is dormant:
    // a player CAN elect to publish their own player_visible fields. This test
    // documents that current state — if a future field ships a staff_only base,
    // the read model's defensive re-clamp + this module's floor both kick in.
    expect(clampOverrideToBase('name', 'public')).toBe('public');
    expect(PASSPORT_FIELD_DEFS.every((d) => d.base !== 'staff_only')).toBe(true);
  });

  it('drops an override for an unknown key gracefully (treated as player_visible base)', () => {
    // sanitize() rejects unknown keys before this is called, but the function
    // itself must not throw — defaults a missing base to player_visible.
    expect(clampOverrideToBase('not_a_field', 'player_visible')).toBeNull();
    expect(clampOverrideToBase('not_a_field', 'public')).toBe('public');
  });
});
