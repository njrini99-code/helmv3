// =============================================================================
// Unit tests for the V7 Player Profile Snapshot read model's PURE logic:
//   - inferRole(): the role-conditional heart of the feature ("show batting/
//     pitching/defense by the player's ACTUAL role rather than assuming a
//     hitter"). Data presence must dominate a stale position label.
//   - collapseBand(): readiness band normalization (orange_lower/upper -> orange).
//   - roleLabel(): stable, baseball-only labels (no golf terms).
//
// The DB-bound getPlayerSnapshotCards is exercised via RLS/integration, not here.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { inferRole, collapseBand, roleLabel } from '../player-snapshot-cards';

describe('inferRole — role drives which performance cards show', () => {
  it('a position player with only hitting data is a hitter (never an empty Pitching card)', () => {
    expect(
      inferRole({ primaryPosition: 'SS', secondaryPosition: '2B', hasHitting: true, hasPitching: false, isCatcher: false }),
    ).toBe('hitter');
  });

  it('a pitcher with only pitching data is a pitcher (never an empty Hitting card)', () => {
    expect(
      inferRole({ primaryPosition: 'RHP', secondaryPosition: null, hasHitting: false, hasPitching: true, isCatcher: false }),
    ).toBe('pitcher');
  });

  it('a "P" with BOTH hitting and pitching data is two-way (data presence wins)', () => {
    expect(
      inferRole({ primaryPosition: 'P', secondaryPosition: '1B', hasHitting: true, hasPitching: true, isCatcher: false }),
    ).toBe('two_way');
  });

  it('a position player who also pitched (has both) is two-way', () => {
    expect(
      inferRole({ primaryPosition: 'OF', secondaryPosition: null, hasHitting: true, hasPitching: true, isCatcher: false }),
    ).toBe('two_way');
  });

  it('a catcher is a catcher even with hitting data (catching card takes the defensive slot)', () => {
    expect(
      inferRole({ primaryPosition: 'C', secondaryPosition: null, hasHitting: true, hasPitching: false, isCatcher: true }),
    ).toBe('catcher');
  });

  it('catcher events alone flag a catcher even without a "C" position label', () => {
    expect(
      inferRole({ primaryPosition: 'INF', secondaryPosition: null, hasHitting: false, hasPitching: false, isCatcher: true }),
    ).toBe('catcher');
  });

  it('a pitcher position label with no data still resolves to pitcher (honest role, empty cards)', () => {
    expect(
      inferRole({ primaryPosition: 'LHP', secondaryPosition: null, hasHitting: false, hasPitching: false, isCatcher: false }),
    ).toBe('pitcher');
  });

  it('no positions and no data falls back to utility (never fabricates a hitter)', () => {
    expect(
      inferRole({ primaryPosition: null, secondaryPosition: null, hasHitting: false, hasPitching: false, isCatcher: false }),
    ).toBe('utility');
  });
});

describe('collapseBand — readiness band normalization', () => {
  it('collapses both orange variants to a single orange', () => {
    expect(collapseBand('orange_lower')).toBe('orange');
    expect(collapseBand('orange_upper')).toBe('orange');
  });

  it('passes through the simple bands unchanged', () => {
    expect(collapseBand('green')).toBe('green');
    expect(collapseBand('yellow')).toBe('yellow');
    expect(collapseBand('red')).toBe('red');
    expect(collapseBand('blue')).toBe('blue');
  });

  it('returns null for missing or unknown bands (honest absence, not a fake green)', () => {
    expect(collapseBand(null)).toBeNull();
    expect(collapseBand('nonsense')).toBeNull();
  });
});

describe('roleLabel — baseball-only, no golf terms', () => {
  it('maps every role to a human label', () => {
    expect(roleLabel('hitter')).toBe('Position Player');
    expect(roleLabel('pitcher')).toBe('Pitcher');
    expect(roleLabel('two_way')).toBe('Two-Way Player');
    expect(roleLabel('catcher')).toBe('Catcher');
    expect(roleLabel('utility')).toBe('Utility');
  });
});
