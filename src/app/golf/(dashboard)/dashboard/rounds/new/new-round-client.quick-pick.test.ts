/**
 * RE-F2 (round-entry audit, P1): confirming a course from the recent-courses
 * quick-pick jumped straight to `setStep('tracking')` — no validateBeforeStart
 * (qualifier picked, future date, rating/slope ranges) and no persistRoundStart,
 * so the round had no durable server parent before its first shot.
 *
 * The quick-pick must reach tracking only through the same start path as the
 * setup form. Source-contract test, like the other new-round-client suites:
 * the component is a 3,000-line client whose start path needs the whole
 * server-action surface to render.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./new-round-client.tsx', import.meta.url), 'utf8');

function slice(from: string, to: string): string {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('quick-pick start (RE-F2)', () => {
  it('never enters tracking directly from the quick-pick handler', () => {
    const handler = slice('const handleQuickPickConfirm', 'const handleTeePick');
    expect(handler).not.toContain("setStep('tracking')");
    expect(handler).not.toContain('setHoles(');
    expect(handler).toContain('setPendingQuickStart(');
    expect(handler).toContain('setIsStartingRound(true)');
    // A second tap while a start is running does nothing.
    expect(handler).toMatch(/if \(isStartingRound\) return;/);
  });

  it('runs the pending start through validateBeforeStart and the durable start path', () => {
    const effect = slice('if (!pendingQuickStart) return;', 'const handleSetupSubmit');
    const validateAt = effect.indexOf('validateBeforeStart()');
    const startAt = effect.indexOf('startWithPreloadedConfigs(configs)');
    expect(validateAt).toBeGreaterThanOrEqual(0);
    expect(startAt).toBeGreaterThan(validateAt);
    // A failed gate surfaces the error and releases the start lock.
    const failBranch = effect.slice(validateAt, startAt);
    expect(failBranch).toContain('setError(validationError)');
    expect(failBranch).toContain('setIsStartingRound(false)');
    expect(failBranch).toContain('return;');
  });

  it('startWithPreloadedConfigs persists the round before tracking', () => {
    const start = slice('const startWithPreloadedConfigs', 'const handleSetupSubmit');
    const persistAt = start.indexOf('await persistRoundStart(');
    const trackingAt = start.indexOf("setStep('tracking')");
    expect(persistAt).toBeGreaterThanOrEqual(0);
    expect(trackingAt).toBeGreaterThan(persistAt);
  });
});

describe('stale server-action recovery (RE-X1)', () => {
  it('hands stale-action failures to the shared recovery coordinator, not a raw reload', () => {
    // The only raw reload left is the player's own "Reload" button on the
    // cross-device conflict banner — an explicit tap, not an automatic one.
    const raw = source.match(/window\.location\.reload\(\)/g) ?? [];
    expect(raw).toHaveLength(1);
    expect(source).toContain("onClick={() => window.location.reload()}");
    expect((source.match(/softReloadForStaleServerAction\(err\.message\)/g) ?? []).length).toBe(3);
  });
});
