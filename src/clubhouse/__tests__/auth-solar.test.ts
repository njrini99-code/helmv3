import { describe, expect, it } from 'vitest';
import { sunAt } from '../lib/sun';
import { ZONE_POINTS } from '../lib/light';
import { greetingWord, isDarkSky, noonAltitude, solarSkyHour } from '../screens/auth/scene-sky';

/** P015-A1: the sign-in sky follows the sun where the viewer is, not the clock. */
const NY = ZONE_POINTS['America/New_York']!;
const alt = (ms: number) => sunAt(ms, NY).altitude;
const sky = (iso: string) => {
  const at = Date.parse(iso);
  return solarSkyHour(at, alt, noonAltitude(at, alt));
};

describe('Auth · solar sky (P015-A1)', () => {
  it('a December 5:30 pm is dusk, while the clock-keyed sky still drew daylight', () => {
    // 17:30 EST on 15 December: the sun set around 4:45.
    const h = sky('2026-12-15T22:30:00Z');
    expect(h).toBeGreaterThan(19);
    expect(isDarkSky(h)).toBe(true);
    expect(isDarkSky(17.5)).toBe(false);
  });

  it('a June 7 pm is still a bright evening, not dusk', () => {
    // 19:00 EDT on 21 June: the sun sets around 8:35.
    const h = sky('2026-06-21T23:00:00Z');
    expect(h).toBeGreaterThan(15);
    expect(h).toBeLessThan(18.6);
    expect(isDarkSky(h)).toBe(false);
  });

  it('sunrise and sunset land on the keyframes drawn for them, and noon on noon', () => {
    const at = Date.parse('2026-03-20T12:00:00Z');
    let rise = at - 6 * 3600_000;
    while (alt(rise) < 0) rise += 60_000;
    let set = at + 6 * 3600_000;
    while (alt(set) > 0) set += 60_000;
    expect(sky(new Date(rise).toISOString())).toBeCloseTo(6.4, 0);
    expect(sky(new Date(set).toISOString())).toBeCloseTo(18.6, 0);
    expect(sky('2026-03-20T17:10:00Z')).toBeGreaterThan(11.5);
  });

  it('the greeting stays on the clock', () => {
    expect(greetingWord(17.5)).toBe('Good evening');
    expect(greetingWord(9)).toBe('Good morning');
  });
});

describe('Auth · paper in the room (P015-A2)', () => {
  it('no wash by day; a warm lamp at night; never more than 6%', async () => {
    const { paperTint } = await import('../screens/auth/scene-sky');
    expect(paperTint(12.5)).toBeNull();
    expect(paperTint(22)).toMatch(/^rgb\(232 180 106 \/ 0\.0[2-6]\d*\)$/);
    for (const h of [5.5, 6.4, 18.6, 19.8, 23]) {
      const t = paperTint(h);
      if (t) expect(Number(t.split('/ ')[1]!.replace(')', ''))).toBeLessThanOrEqual(0.06);
    }
  });
});
