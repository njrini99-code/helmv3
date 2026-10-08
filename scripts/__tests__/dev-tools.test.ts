import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs modules, scripts/ is outside tsconfig.
import { devPort, hashName, nextPort, portForName, PORT_MAX, PORT_MIN } from '../lib/dev-port.mjs';
// @ts-expect-error -- plain .mjs module.
import { isIdle, isNextDev, parseEtime, parsePs } from '../dev-stop-idle.mjs';

describe('dev port', () => {
  it('is stable and inside 3001..3099 for any worktree name', () => {
    for (const name of ['phase-4-5', 'fix-2153', 'main', 'bridge-all-clear', 'a', 'x'.repeat(200)]) {
      const p = portForName(name);
      expect(p).toBeGreaterThanOrEqual(PORT_MIN);
      expect(p).toBeLessThanOrEqual(PORT_MAX);
      expect(portForName(name)).toBe(p);
    }
    expect(hashName('phase-4-5')).toBe(hashName('phase-4-5'));
  });

  it('spreads different names across the range', () => {
    const ports = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(portForName));
    expect(ports.size).toBeGreaterThan(4);
  });

  it('lets PORT win, keeps 3000 for the canonical checkout, hashes a linked worktree', () => {
    expect(devPort({ cwd: '/x/phase-4-5', env: { PORT: '3217' }, canonical: false })).toBe(3217);
    expect(devPort({ cwd: '/x/helmv3', env: {}, canonical: true })).toBe(3000);
    expect(devPort({ cwd: '/x/phase-4-5', env: {}, canonical: false })).toBe(portForName('phase-4-5'));
  });

  it('ignores a nonsense PORT', () => {
    expect(devPort({ cwd: '/x/helmv3', env: { PORT: 'abc' }, canonical: true })).toBe(3000);
    expect(devPort({ cwd: '/x/helmv3', env: { PORT: '99999' }, canonical: true })).toBe(3000);
  });

  it('wraps to the bottom of the range when probing past the top', () => {
    expect(nextPort(PORT_MAX)).toBe(PORT_MIN);
    expect(nextPort(3050)).toBe(3051);
  });
});

describe('dev-stop-idle', () => {
  it('parses ps elapsed times in every shape', () => {
    expect(parseEtime('05:09')).toBe((5 * 60 + 9) * 1000);
    expect(parseEtime('02:05:09')).toBe(((2 * 60 + 5) * 60 + 9) * 1000);
    expect(parseEtime('3-02:05:09')).toBe((((3 * 24 + 2) * 60 + 5) * 60 + 9) * 1000);
    expect(parseEtime('nonsense')).toBeNull();
  });

  it('parses ps rows and recognises next dev processes only', () => {
    const rows = parsePs(' 101  02:00:00 node /repo/node_modules/.bin/next dev --webpack -p 3016\n 102  01:00 /usr/bin/vim next.config.mjs\n');
    expect(rows).toHaveLength(2);
    expect(isNextDev(rows[0].command)).toBe(true);
    expect(isNextDev('next-server (v16.3.8)')).toBe(true);
    expect(isNextDev(rows[1].command)).toBe(false);
    expect(isNextDev('node /repo/node_modules/.bin/next build --webpack')).toBe(false);
  });

  it('is idle only when old enough AND quiet for longer than the threshold', () => {
    const H = 3600 * 1000;
    const now = 100 * H;
    expect(isIdle({ ageMs: 5 * H, lastActiveMs: now - 3 * H, now, thresholdMs: 2 * H })).toBe(true);
    expect(isIdle({ ageMs: 5 * H, lastActiveMs: now - 1 * H, now, thresholdMs: 2 * H })).toBe(false);
    expect(isIdle({ ageMs: 1 * H, lastActiveMs: now - 9 * H, now, thresholdMs: 2 * H })).toBe(false); // started recently
    expect(isIdle({ ageMs: 9 * H, lastActiveMs: null, now, thresholdMs: 2 * H })).toBe(false); // unknown: leave alone
  });
});
