// =============================================================================
// src/lib/baseball/daily-contract/ack-visibility.ts
//
// V5 Daily Contract — the COACH-ACK note visibility rule (Gap 2), as ONE pure
// function so the privacy invariant has a single, unit-testable home.
//
// This lives OUTSIDE the 'use server' action file on purpose: a 'use server'
// module may only export async functions, so a synchronous pure helper cannot be
// exported from daily-contract.ts. Extracting it here keeps the action thin and
// makes the rule testable without the DB.
// =============================================================================

import type { DailyContractVisibility } from '@/lib/types/baseball-passport';

/**
 * Resolve the visibility of a coach's recognition note. Privacy is NEVER widened
 * by accident — the ONLY path that yields 'team' is a deliberate coach opt-in
 * (`recognizeToTeam === true`) on a day the PLAYER already chose to share team-
 * wide (`rowVisibility === 'team'`). A staff_only (or player_only) day NEVER
 * becomes team-visible, regardless of the toggle: a team-feed note on a coaches-
 * only day would leak what the player kept between themselves + their staff.
 *
 * So a team-visible recognition never exposes more than the player already exposed.
 */
export function resolveAckNoteVisibility(
  rowVisibility: DailyContractVisibility,
  recognizeToTeam: boolean,
): DailyContractVisibility {
  return rowVisibility === 'team' && recognizeToTeam === true
    ? 'team'
    : 'player_only';
}
