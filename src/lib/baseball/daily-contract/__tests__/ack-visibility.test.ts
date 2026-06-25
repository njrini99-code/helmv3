// @vitest-environment node
// =============================================================================
// src/lib/baseball/daily-contract/__tests__/ack-visibility.test.ts
//
// Pins the COACH-ACK note visibility rule (Gap 2): a coach can NEVER post a team-
// visible recognition note on a non-team-shared day. The ONLY widen path is a
// deliberate coach opt-in on a day the player already shared team-wide.
// =============================================================================

import { describe, it, expect } from 'vitest';

import { resolveAckNoteVisibility } from '@/lib/baseball/daily-contract/ack-visibility';

describe('resolveAckNoteVisibility', () => {
  it("staff_only + recognizeToTeam=true => 'player_only' (never leaks a coaches-only day)", () => {
    expect(resolveAckNoteVisibility('staff_only', true)).toBe('player_only');
  });

  it("player_only + recognizeToTeam=true => 'player_only' (a private day never widens)", () => {
    expect(resolveAckNoteVisibility('player_only', true)).toBe('player_only');
  });

  it("team + recognizeToTeam=true => 'team' (the only widening path)", () => {
    expect(resolveAckNoteVisibility('team', true)).toBe('team');
  });

  it("team + recognizeToTeam=false => 'player_only' (default stays private)", () => {
    expect(resolveAckNoteVisibility('team', false)).toBe('player_only');
  });

  it("staff_only + recognizeToTeam=false => 'player_only'", () => {
    expect(resolveAckNoteVisibility('staff_only', false)).toBe('player_only');
  });
});
