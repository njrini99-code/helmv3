/**
 * New Round hardening — mirrors fixes already shipped for Continue Round.
 *
 * B2/B9 (two devices on one round; beacon self-heal): New Round's own
 * `handleRoundSyncConflict` unconditionally adopted the server's
 * `updated_at` on ANY conflict, and `useRoundStatusSync` (shared hook,
 * already fixed) had no `onRoundStale` wired here — so a genuine
 * multi-device collision on a round New Round is tracking (it gets a real
 * server id after its first successful save, same as Continue Round) was
 * never actually blocked, just silently re-synced.
 *
 * B5: `persistCompletedHole` and `handleAutoSave` had no `hole_invalid`
 * branch — see the sibling `continue-round-client.hole-invalid-checkpoint
 * .test.ts` for the full defect description; identical fix here.
 *
 * B4: the recovery dialog rendered only after the tracking-step return, so
 * it could never appear on the setup screen (before a server round exists);
 * `handleDiscardRecovery` cleared a hard-coded `_new_<playerId>` key instead
 * of the snapshot's own `roundId` (which can be a real round id once a
 * round has survived past its first auto-save); and every `setError` call
 * during tracking had no visible surface at all outside an active submit
 * attempt.
 *
 * B7: the round-date input had no upper bound, and `validateBeforeStart`
 * (the one gate both round-start entry points share) never rejected a
 * future date — only the terminal submit path did, by which point a whole
 * round had already been tracked under the wrong day.
 *
 * Source-inspection, matching the sibling continue-round-client tests: the
 * component is a live React tree with heavy dependencies, and these are
 * wiring contracts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./new-round-client.tsx', import.meta.url), 'utf8');

function slice(fromMarker: string, toMarker: string): string {
  const from = source.indexOf(fromMarker);
  const to = source.indexOf(toMarker, from + 1);
  expect(from, `marker not found: ${fromMarker}`).toBeGreaterThanOrEqual(0);
  expect(to, `marker not found after ${fromMarker}: ${toMarker}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('New Round — multi-device conflict blocks further writes (B2/B9)', () => {
  it('wires onRoundStale into useRoundStatusSync', () => {
    const hookCall = slice('useRoundStatusSync({', '});');
    expect(hookCall).toContain('onRoundStale');
  });

  it('never adopts the server updated_at from handleRoundSyncConflict outside the unreadable-write self-heal window', () => {
    const handler = slice(
      'const handleRoundSyncConflict = useCallback(',
      '\n  const savePartialRoundTracked = useCallback(',
    );
    const pendingGuardIdx = handler.indexOf('if (pendingUnreadableWriteRef.current)');
    const blockCallIdx = handler.lastIndexOf('blockRoundForConflict(');
    const adoptionIdx = handler.indexOf(
      'lastServerUpdatedAtRef.current = stalenessResult.data.currentUpdatedAt',
    );
    expect(pendingGuardIdx, 'expected a pendingUnreadableWriteRef guard (B9)').toBeGreaterThanOrEqual(0);
    expect(blockCallIdx, 'expected the real-conflict path to still block').toBeGreaterThan(pendingGuardIdx);
    expect(adoptionIdx).toBeGreaterThan(pendingGuardIdx);
    expect(adoptionIdx).toBeLessThan(blockCallIdx);
  });

  it('marks the unreadable-write window when a background save is actually queued, without the lock token', () => {
    const pageHide = slice('const handlePageHide = () => {', 'const handleVisibilityChange = () => {');
    expect(pageHide).toContain('beaconPartialSave(saveData, savedRoundIdRef.current ?? undefined)');
    expect(pageHide).toContain('pendingUnreadableWriteRef.current = true');
    // Two beacons for one backgrounding (iOS fires visibilitychange-hidden
    // AND pagehide) would bump updated_at twice for one self-heal.
    expect(pageHide).toContain('if (beaconSentWhileHiddenRef.current) return;');
    // A device PROVEN behind must not beacon — the beacon holds no lock token.
    expect(pageHide).toContain('if (roundConflictBlockedRef.current) return;');
    // Durability: a beacon has no reader, so it must NOT carry the lock
    // token — a rejection would silently drop the last shots before a phone
    // lock (incident 2026-06-10). Pin the payload shape the route forwards.
    const payload = pageHide.slice(pageHide.indexOf('const saveData'), pageHide.indexOf('beaconPartialSave('));
    expect(payload).not.toMatch(/^\s*expectedUpdatedAt\s*:/m);
  });

  it('records a killed foreground save as an unreadable write, on every foreground save path (Hampden-Sydney 2026-09-15)', () => {
    const tracked = slice('const savePartialRoundTracked = useCallback(', '\n  // Check for the freshest emergency save on mount.');
    expect(tracked).toContain('isUnreadableWriteFailure(err)');
    expect(tracked).toContain('pendingUnreadableWriteRef.current = true');
    // No foreground save against an EXISTING round may bypass the wrapper.
    // A CREATE (no round id) holds no lock token, so the two create paths —
    // persistRoundStart and the auto-save round_missing re-create — and the
    // wrapper's own delegating call are the only raw calls allowed.
    const afterWrapper = source.slice(source.indexOf('const savePartialRoundTracked = useCallback(') + 1);
    const raw = [...afterWrapper.matchAll(/(?:await|void) savePartialRound\(/g)]
      // Skip the prose mention inside the beacon comment.
      .filter((m) => !afterWrapper.slice(afterWrapper.lastIndexOf('\n', m.index), m.index).includes('//'))
      .map((m) => afterWrapper.slice(m.index + m[0].length, m.index + 160));
    expect(raw.length).toBeGreaterThan(0);
    for (const args of raw) {
      // R8: persistRoundStart's create call now passes a 3rd `startIntent`
      // options argument (`initialData, undefined, { ... }`) — still a
      // CREATE (no round id, no lock token), so it belongs in this same
      // allowlist of raw calls.
      expect(args).toMatch(/^(data, targetRoundId\)|initialData\)|initialData,\s*undefined,\s*\{|\s*buildPartialRoundData\([^)]*\),\s*undefined,)/);
    }
  });

  it('retries the checkpoint under the adopted token after a self-healed conflict instead of failing the hole', () => {
    const checkpoint = slice('const persistCompletedHole = useCallback(async (', 'const handleHoleComplete = async (');
    expect(checkpoint).toContain("if (await handleRoundSyncConflict('This round was updated on another device. Please reload.')) continue;");
    expect(checkpoint).toContain('expectedUpdatedAt: lastServerUpdatedAtRef.current');
  });

  it('refuses to write once blocked, across every write entry point', () => {
    const autoSave = slice('const handleAutoSave = useCallback(async (shots: ShotRecord[], holeIndex: number) => {', 'const handleRoundSubmit = async (');
    const checkpoint = slice('const persistCompletedHole = useCallback(async (', 'const handleHoleComplete = async (');
    const saveForLater = slice('const handleSaveForLater = async () => {', 'const handleDeleteRound = async (');
    const submit = slice('const handleRoundSubmit = async (', 'const handleSaveForLater = async () => {');

    for (const [name, s] of [
      ['handleAutoSave', autoSave],
      ['persistCompletedHole', checkpoint],
      ['handleSaveForLater', saveForLater],
      ['handleRoundSubmit', submit],
    ] as const) {
      expect(s, `${name} must check the conflict-block flag`).toMatch(/roundConflictBlockedRef\.current/);
    }
  });
});

describe('New Round — hole_invalid on the checkpoint and autosave paths (B5)', () => {
  it('persistCompletedHole surfaces the specific message and stops immediately', () => {
    const checkpoint = slice('const persistCompletedHole = useCallback(async (', 'const handleHoleComplete = async (');
    expect(checkpoint).toContain("result.error === 'hole_invalid'");
    const holeInvalidIdx = checkpoint.indexOf("result.error === 'hole_invalid'");
    const genericBreakIdx = checkpoint.indexOf("result.error !== 'busy' && result.error !== 'retry'");
    expect(holeInvalidIdx).toBeLessThan(genericBreakIdx);
    expect(checkpoint.slice(holeInvalidIdx, genericBreakIdx)).toMatch(/return false/);
  });

  it('handleAutoSave surfaces the specific message instead of throwing into the circuit breaker', () => {
    const autoSave = slice('const handleAutoSave = useCallback(async (shots: ShotRecord[], holeIndex: number) => {', 'const handleRoundSubmit = async (');
    expect(autoSave).toContain("result.error === 'hole_invalid'");
    const holeInvalidIdx = autoSave.indexOf("result.error === 'hole_invalid'");
    const genericThrowIdx = autoSave.indexOf('Auto-save server error');
    expect(holeInvalidIdx).toBeLessThan(genericThrowIdx);
  });
});

describe('New Round — recovery dialog, Discard key, and visible tracking-step errors (B4)', () => {
  it('renders the recovery dialog in the setup/holes step, before a server round exists', () => {
    const setupReturn = slice("if (step === 'setup' || step === 'holes') {", 'Submitting overlay stats');
    expect(setupReturn).toContain('{recoveryDialog}');
  });

  it('Discard clears the snapshot\'s OWN key, not a hard-coded new-round key', () => {
    const discard = slice('const handleDiscardRecovery = () => {', 'const handleRestoreRecovery = async () => {');
    expect(discard).not.toMatch(/clearEmergencySave\(null,\s*playerId\)/);
    expect(discard).toMatch(/newRoundRecoveryData(\?\.roundId| &&)/);
  });

  it('the tracking step renders a visible, dismissible error notice', () => {
    const trackingReturn = slice('return (\n    <>\n      {/* Submit banner', '{/* Submit Overlay');
    expect(trackingReturn).toMatch(/role="alert"/);
  });
});

describe('New Round — future round dates (B7)', () => {
  it('caps the date input at today (local day)', () => {
    expect(source).toContain('maxRoundDate');
  });

  it('validateBeforeStart rejects a future round date before persistRoundStart runs', () => {
    const validate = slice('const validateBeforeStart = useCallback((): string | null => {', 'const persistRoundStart = useCallback(async (');
    expect(validate).toMatch(/future/i);
  });
});

describe('New Round — one helper for round-write failures (B6)', () => {
  it('persistRoundStart never shows a bare signal key (busy/retry) verbatim', () => {
    // Sliced to persistRoundStart itself, not the wider region up to
    // handleSetupSubmit — the 36-hole-day conflict handlers now sit in that
    // region and legitimately reuse deleteInProgressRound's own
    // `result.error || '<message>'` pattern (same as the pre-existing
    // handleDeleteRound), which is a plain delete-action message, not one of
    // savePartialRound's bare busy/retry signal keys this rule guards against.
    const handler = slice('const persistRoundStart = useCallback(async (', 'const handleConflictResume = () => {');
    expect(handler).not.toMatch(/setError\(result\.error \|\|/);
    expect(handler).toMatch(/describeRoundWriteFailure\(result\.error\)/);
  });
});

describe('New Round — completion surfaces provide cold-chunk feedback (B10)', () => {
  it('uses a fixed non-blocking loading status for cold chunks', () => {
    const submitDynamic = slice('const FairwayRoundSubmitOverlay = dynamic(', 'const FairwayRoundSummarySheet = dynamic(');
    const summaryDynamic = slice('const FairwayRoundSummarySheet = dynamic(', 'type Hole = RoundHole;');
    expect(submitDynamic).toContain('loading: () => <RoundCompletionChunkLoading />');
    expect(summaryDynamic).toContain('loading: () => <RoundCompletionChunkLoading />');
    expect(source).toMatch(/role="status"[\s\S]*pointer-events-none fixed[\s\S]*Preparing your round/);
  });

  it('keeps the summary mounted while pending stats exist so close animations can finish', () => {
    const summaryRender = slice('{pendingFinalStats && (', '{/* Submit Overlay');
    expect(summaryRender).toContain('<FairwayRoundSummarySheet');
    expect(summaryRender).toContain('open={showFinishConfirm}');
    expect(summaryRender).toContain('if (!pendingFinalStats) return;');

    const submitRender = source.slice(source.indexOf("{step === 'submitting' && ("));
    expect(submitRender).toContain('<SubmitOverlay');
    expect(submitRender).toContain('isVisible');
  });
});

describe('New Round — start-intent dedupe against a stranded/duplicate round (R8)', () => {
  const persistRoundStartSource = () =>
    slice('const persistRoundStart = useCallback(async (', 'const handleSetupSubmit = async (');

  it('sends startIntent (never allowReuse) so the server can dedupe a plain "begin a new round" call', () => {
    const handler = persistRoundStartSource();
    expect(handler).toContain('startIntent: true');
    expect(handler).not.toContain('allowReuse');
  });

  it('surfaces in_progress_exists as a conflict prompt instead of creating a sibling or auto-navigating', () => {
    const handler = persistRoundStartSource();
    const branch = handler.slice(
      handler.indexOf("result.error === 'in_progress_exists'"),
      handler.indexOf("result.error === 'duplicate_completed_round'"),
    );
    // 36-hole-day follow-up: the player, not the server, decides whether
    // this is the same abandoned round or a genuinely separate one — so
    // persistRoundStart itself must not navigate away.
    expect(branch).toContain('setInProgressConflict({');
    expect(branch).toContain('roundId: result.roundId');
    expect(branch).not.toContain('router.push');
    // No round was created for this outcome — nothing here should look like
    // starting a fresh round.
    expect(branch).not.toContain('savedRoundIdRef.current = result.data');
  });

  it('arms the duplicate-course confirmation ref on the warning, so the SAME "Start round" tap proceeds next time', () => {
    const handler = persistRoundStartSource();
    const branch = handler.slice(
      handler.indexOf("result.error === 'duplicate_completed_round'"),
      handler.indexOf('// B6: this call always sends'),
    );
    expect(branch).toContain('duplicateCourseConfirmedRef.current = true');
  });

  it('forwards the confirmation ref back to the server on the next call', () => {
    const handler = persistRoundStartSource();
    expect(handler).toContain('confirmDuplicateCourse: duplicateCourseConfirmedRef.current');
  });
});

describe('New Round — 36-hole-day conflict prompt gives Resume/Discard/Start-new choices (R8 follow-up)', () => {
  const persistRoundStartSource = () =>
    slice('const persistRoundStart = useCallback(async (', 'const handleConflictResume = () => {');

  it('carries scoredHoles/updatedAt from the server into the conflict prompt state (for the Discard confirm)', () => {
    const handler = persistRoundStartSource();
    const branch = handler.slice(
      handler.indexOf("result.error === 'in_progress_exists'"),
      handler.indexOf("result.error === 'duplicate_completed_round'"),
    );
    expect(branch).toContain('scoredHoles: result.scoredHoles');
    expect(branch).toContain('updatedAt: result.updatedAt');
  });

  it('forwards the separate-round bypass ref back to the server on every call', () => {
    const handler = persistRoundStartSource();
    expect(handler).toContain('confirmSeparateRound: confirmSeparateRoundRef.current');
  });

  it('clears the conflict state, the discard-confirm state, and the bypass ref once a round genuinely starts', () => {
    const handler = persistRoundStartSource();
    const successTail = handler.slice(handler.indexOf('duplicateCourseConfirmedRef.current = false;'));
    expect(successTail).toContain('confirmSeparateRoundRef.current = false;');
    expect(successTail).toContain('setInProgressConflict(null);');
    expect(successTail).toContain('setDiscardConfirming(false);');
  });

  it('Resume navigates to Continue Round for the conflicting round, and only Resume does', () => {
    const resume = slice('const handleConflictResume = () => {', 'const handleConflictConfirmDiscard = async () => {');
    expect(resume).toContain('router.push(`/golf/dashboard/rounds/continue/${inProgressConflict.roundId}`)');
  });

  it('the destructive delete never runs unless discardConfirming is already true (guards the two-step confirm)', () => {
    const discard = slice('const handleConflictConfirmDiscard = async () => {', 'const handleConflictStartNewRound = async () => {');
    const guardIdx = discard.indexOf('!discardConfirming');
    const deleteIdx = discard.indexOf('deleteInProgressRound(inProgressConflict.roundId)');
    expect(guardIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeGreaterThan(guardIdx);
  });

  it('confirmed discard calls the existing non-destructive delete action, never a raw insert/reuse, then retries the SAME flow that includes the save-course step', () => {
    const discard = slice('const handleConflictConfirmDiscard = async () => {', 'const handleConflictStartNewRound = async () => {');
    expect(discard).toContain('deleteInProgressRound(inProgressConflict.roundId)');
    expect(discard).toContain('clearEmergencySave(inProgressConflict.roundId, playerId)');
    // Retries via the retry-thunk (re-runs handleHolesSave/startWithPreloadedConfigs
    // in full, including the save-course step), not a bare persistRoundStart call.
    expect(discard).toContain('lastStartRetryRef.current()');
    expect(discard).not.toContain('persistRoundStart(');
    // Must not silently keep the conflict (or its confirm state) open on the happy path.
    expect(discard).toContain('setInProgressConflict(null)');
    expect(discard).toContain('setDiscardConfirming(false)');
  });

  it('Start a new round arms the server bypass, retries the same full flow, and does NOT touch the existing round at all', () => {
    const startNew = slice(
      'const handleConflictStartNewRound = async () => {',
      'const startWithPreloadedConfigs = useCallback(async (',
    );
    expect(startNew).toContain('confirmSeparateRoundRef.current = true');
    expect(startNew).not.toContain('deleteInProgressRound');
    expect(startNew).toContain('lastStartRetryRef.current()');
    expect(startNew).not.toContain('persistRoundStart(');
  });

  it('handleHolesSave and startWithPreloadedConfigs each record themselves as the retry target, so Discard/Start-new never skip the save-course step', () => {
    expect(source).toContain('lastStartRetryRef.current = () => handleHolesSave(configuredHoles);');
    expect(source).toContain('lastStartRetryRef.current = () => startWithPreloadedConfigs(configs);');
    // Both retry targets must still reach the save-course / cloud-catalog step.
    const holesSave = slice('const handleHolesSave = async (configuredHoles: HoleConfig[]) => {', 'const buildPartialRoundData = useCallback(');
    expect(holesSave).toContain('savePlayerCourse(');
    const preloaded = slice('const startWithPreloadedConfigs = useCallback(async (', 'const handleSetupSubmit = async (');
    expect(preloaded).toContain('contributeCourseFromRound(');
  });

  it('the conflict dialog offers exactly the three named actions before any confirm, reusing the shared Button component', () => {
    const dialog = slice('const inProgressConflictDialog = (', 'ENTRY SCREENS (setup + holes)');
    const confirmStart = dialog.indexOf('discardConfirming && inProgressConflict');
    const defaultView = dialog.slice(dialog.indexOf(') : ('), dialog.lastIndexOf(')}'));
    expect(confirmStart).toBeGreaterThanOrEqual(0);
    expect(confirmStart).toBeLessThan(dialog.indexOf(') : ('));
    expect(defaultView).toContain('onClick={handleConflictResume}');
    expect(defaultView).toContain('onClick={handleConflictStartNewRound}');
    // The first-tap "Discard" only arms the confirm state — it must NOT be
    // wired to the actual delete handler directly.
    expect(defaultView).toContain('onClick={() => setDiscardConfirming(true)}');
    expect(defaultView).not.toContain('handleConflictConfirmDiscard');
    expect(defaultView).toMatch(/<FwButton[^]*?Resume/);
    expect(defaultView).toMatch(/<FwButton[^]*?Start a new round/);
    expect(defaultView).toMatch(/<FwButton[^]*?>\s*Discard\s*<\/FwButton>/);
  });

  it('the discard-confirm view shows what will be deleted and only THEN wires the actual delete', () => {
    const dialog = slice('const inProgressConflictDialog = (', 'ENTRY SCREENS (setup + holes)');
    const confirmView = dialog.slice(
      dialog.indexOf('discardConfirming && inProgressConflict'),
      dialog.indexOf(') : ('),
    );
    expect(confirmView).toContain('inProgressConflict.scoredHoles');
    expect(confirmView).toContain('formatConflictUpdatedAt(inProgressConflict.updatedAt)');
    expect(confirmView).toContain('onClick={handleConflictConfirmDiscard}');
    expect(confirmView).toContain('Cancel');
    expect(confirmView).toMatch(/Confirm discard/);
  });

  it('the setup/holes step renders the conflict dialog', () => {
    const setupReturn = slice("if (step === 'setup' || step === 'holes') {", 'Submitting overlay stats');
    expect(setupReturn).toContain('{inProgressConflictDialog}');
  });
});
