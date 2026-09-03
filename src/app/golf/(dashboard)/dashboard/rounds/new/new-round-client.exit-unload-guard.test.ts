/**
 * MASTER_BUG_REPORT_2026-09-02.md Part 1: "Save for later" (and Discard)
 * still trigger the browser's native unload warning.
 *
 * `handleSaveForLater`/`handleDeleteRound` navigate away with `router.push` —
 * a client-side transition that does not itself fire `beforeunload`. But
 * neither `handleBeforeUnload` nor `handlePageHide` ever checked whether the
 * round had just been saved/discarded: `handleBeforeUnload` warns purely off
 * `step !== 'setup'`, which stays true long after a successful exit, and
 * `handlePageHide` would fire a redundant (Save for later) or actively
 * harmful — resurrecting the round (Discard) — beacon write if a real unload
 * event ever did coincide with that navigation.
 *
 * Fix: `roundExitedSafelyRef`, set synchronously right before `router.push`
 * in both handlers, checked as the FIRST thing both `handleBeforeUnload` and
 * `handlePageHide` do.
 *
 * Source-inspection, matching the sibling `discard-race`/`round-missing`
 * tests: the component is a live React tree with an enormous dependency
 * surface (offline storage, router, qualifiers, course search); these are
 * wiring contracts, not behavioral renders.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./new-round-client.tsx', import.meta.url),
  'utf8',
);

function slice(fromMarker: string, toMarker: string): string {
  const from = source.indexOf(fromMarker);
  const to = source.indexOf(toMarker, from + 1);
  expect(from, `marker not found: ${fromMarker}`).toBeGreaterThanOrEqual(0);
  expect(to, `marker not found after ${fromMarker}: ${toMarker}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('New Round — Save for later / Discard must not trigger the unload warning', () => {
  it('declares roundExitedSafelyRef', () => {
    expect(source).toContain('const roundExitedSafelyRef = useRef(false);');
  });

  it('handleBeforeUnload bails on roundExitedSafelyRef before its warn check', () => {
    const handler = slice('const handleBeforeUnload = (e: BeforeUnloadEvent) => {', 'const buildEmergencyPayload = () => {');
    const guardIndex = handler.indexOf('if (roundExitedSafelyRef.current) return;');
    const warnIndex = handler.indexOf("stepRef.current !== 'setup'");
    expect(guardIndex, 'roundExitedSafelyRef guard not found').toBeGreaterThanOrEqual(0);
    expect(warnIndex, 'the step/courseName warn condition not found').toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeLessThan(warnIndex);
  });

  it('handlePageHide bails on roundExitedSafelyRef before writing anything', () => {
    const handler = slice('const handlePageHide = () => {', 'const handleVisibilityChange = () => {');
    const guardIndex = handler.indexOf('if (roundExitedSafelyRef.current) return;');
    const emergencySaveIndex = handler.indexOf('emergencySave({');
    expect(guardIndex, 'roundExitedSafelyRef guard not found').toBeGreaterThanOrEqual(0);
    expect(emergencySaveIndex, 'emergencySave call not found').toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeLessThan(emergencySaveIndex);
  });

  it('handleSaveForLater sets roundExitedSafelyRef before navigating away', () => {
    const handler = slice('const handleSaveForLater = async () => {', 'const handleDeleteRound = async () => {');
    const setIndex = handler.indexOf('roundExitedSafelyRef.current = true;');
    const pushIndex = handler.indexOf("router.push('/golf/dashboard/rounds');");
    expect(setIndex, 'roundExitedSafelyRef.current = true not found').toBeGreaterThanOrEqual(0);
    expect(pushIndex, "router.push('/golf/dashboard/rounds') not found").toBeGreaterThanOrEqual(0);
    expect(setIndex).toBeLessThan(pushIndex);
  });

  it('handleDeleteRound sets roundExitedSafelyRef before navigating away, only on the success path', () => {
    const handler = slice('const handleDeleteRound = async () => {', 'const selectedCourse =');
    const setIndex = handler.indexOf('roundExitedSafelyRef.current = true;');
    const pushIndex = handler.indexOf("router.push('/golf/dashboard/rounds');");
    expect(setIndex, 'roundExitedSafelyRef.current = true not found').toBeGreaterThanOrEqual(0);
    expect(pushIndex, "router.push('/golf/dashboard/rounds') not found").toBeGreaterThanOrEqual(0);
    expect(setIndex).toBeLessThan(pushIndex);
    // Must not be set in the failure branch, which returns before reaching
    // the success tail — the failure branch text is textually EARLIER in the
    // function than our marker (it precedes the success tail's `return`).
    const failureBranch = handler.slice(
      handler.indexOf('if (!result.success) {'),
      handler.indexOf('return;', handler.indexOf('if (!result.success) {')) + 'return;'.length,
    );
    expect(failureBranch).not.toContain('roundExitedSafelyRef.current = true');
  });
});
