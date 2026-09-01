/**
 * Continue Round against a round row that no longer exists.
 *
 * Review of 6a7577c71 (production at fb425aa2b), findings P1/P2/P5:
 *
 *  - P1: a `round_missing` from SUBMIT was thrown, matched neither recovery
 *    pattern list, and rendered the raw key "round_missing" in the submit
 *    overlay. Nothing re-submitted.
 *  - P2: the mid-hole auto-save (`executeServerSave`) had no `round_missing`
 *    branch, so every shot-level save against a vanished row incremented the
 *    failure counter and showed "Auto-save is having trouble" after two, while
 *    nothing re-created until a hole completed. The queued-from-
 *    `handleHoleComplete` follow-up lacked both `round_missing` and the `busy`
 *    silent skip.
 *  - P5: the re-create path cleared the device snapshot through the NEW id
 *    while the snapshot had been written under the OLD one; keys never expire,
 *    so the dead-id copy resurfaced later as "recoverable" and restore targeted
 *    the dead id again.
 *
 * Source-inspection, matching the sibling `offline-consolidation` test: the
 * component is a live React tree, and these are wiring contracts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./continue-round-client.tsx', import.meta.url),
  'utf8',
);

function slice(fromMarker: string, toMarker: string): string {
  const from = source.indexOf(fromMarker);
  const to = source.indexOf(toMarker, from + 1);
  expect(from, `marker not found: ${fromMarker}`).toBeGreaterThanOrEqual(0);
  expect(to, `marker not found after ${fromMarker}: ${toMarker}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('Continue Round — round_missing recovery', () => {
  it('re-creates through ONE shared path that migrates the device snapshot to the new id (P5)', () => {
    const recreate = slice('const recreateMissingRound', 'const persistCompletedHole');
    expect(recreate).toContain('savePartialRound(saveData, undefined)');
    expect(recreate).toContain('migrateEmergencySave(');
    // The expected-updated-at belongs to the row that is gone; sending it
    // against the fresh row would come back as a spurious conflict.
    expect(recreate).toContain('lastServerUpdatedAtRef.current = recreated.data.updatedAt');
    expect(recreate).toContain('router.replace(`/golf/dashboard/rounds/continue/${recreated.data.roundId}`)');
  });

  it('the completed-hole checkpoint uses the shared re-create path instead of its own copy', () => {
    const checkpoint = slice('const persistCompletedHole', 'const handleHoleComplete');
    expect(checkpoint).toContain("result.error === 'round_missing'");
    expect(checkpoint).toContain('recreateMissingRound(');
    expect(checkpoint).not.toContain('savePartialRound(saveData, undefined)');
  });

  it('the mid-hole auto-save re-creates on round_missing instead of counting a failure (P2)', () => {
    const autoSave = slice('const executeServerSave', 'const pending = pendingServerSaveRef.current');
    expect(autoSave).toContain("result.error === 'round_missing'");
    expect(autoSave).toContain('recreateMissingRound(');
  });

  it('the queued follow-up save treats busy as a silent skip and round_missing as a re-create (P2)', () => {
    const queued = slice('// Queued from handleHoleComplete', 'void executeServerSave(');
    expect(queued).toContain("r.error === 'busy'");
    expect(queued).toContain("r.error === 'round_missing'");
    expect(queued).toContain('recreateMissingRound(');
  });

  it('saves that race the route change target the re-created row, not the dead one', () => {
    // Between the re-create and router.replace landing, the route param still
    // names the dead id. Every save in that window must go to the row that
    // now exists, or each one re-creates again and the player ends up with
    // duplicate in-progress rounds.
    expect(source).toContain('recreatedRoundIdRef');
    expect(source).toContain('const roundId = recreatedRoundIdRef.current ?? routeRoundId');
  });

  it('submit re-creates from the same terminal payload and never shows the raw key (P1)', () => {
    const submit = slice('const handleRoundSubmit', 'const requestRoundSubmission');
    expect(submit).toContain('writeRoundRecreatingIfMissing(');
    expect(submit).toContain('submitGolfRoundComprehensive,');
    expect(submit).not.toContain('await submitGolfRoundComprehensive(roundData, roundId)');
  });
});
