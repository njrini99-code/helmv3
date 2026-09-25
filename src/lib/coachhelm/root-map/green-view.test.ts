import { describe, expect, it } from 'vitest';
import {
  GREEN_CENTER,
  GREEN_PX_PER_FT,
  buildGreenView,
  greenAriaLabel,
  placePutt,
  type GreenPuttInput,
} from './green-view';

function putts(slope: string, feet: number, made: number, missed: number, tag = slope): GreenPuttInput[] {
  const out: GreenPuttInput[] = [];
  for (let i = 0; i < made + missed; i++) out.push({ id: `${tag}-${feet}-${i}`, feet, slope, made: i < made });
  return out;
}

// Player 49ffe06d… shape (4-6 ft): downhill 11/26, level 8/12, uphill 11/25,
// plus a pile of level putts at 3 ft and closer that must not count.
const SAMPLE: GreenPuttInput[] = [
  ...putts('downhill', 4, 11, 15),
  ...putts('level', 5, 8, 4),
  ...putts('uphill', 4, 11, 14),
  ...putts('level', 1, 187, 3, 'tap'),
  ...putts('level', 3, 63, 6, 'three'),
  ...putts('severe', 4, 2, 5),
  ...putts(null as unknown as string, 4, 1, 1, 'nul'),
];

describe('buildGreenView', () => {
  const view = buildGreenView(SAMPLE, 18)!;

  it('counts 4-6 ft putts by slope; tap-ins, severe and unrecorded slopes do not count', () => {
    expect(view).not.toBeNull();
    expect(view.rounds).toBe(18);
    expect(view.regions.downhill).toMatchObject({ made: 11, n: 26, pct: 42, thin: false });
    expect(view.regions.level).toMatchObject({ made: 8, n: 12, pct: 67, thin: true });
    expect(view.regions.uphill).toMatchObject({ made: 11, n: 25, pct: 44, thin: false });
  });

  it('draws tap-ins faint, and leaves severe/unrecorded slopes off the green', () => {
    expect(view.points.filter((p) => p.faint)).toHaveLength(259);
    expect(view.points).toHaveLength(26 + 12 + 25 + 259);
  });

  it('does not count a 3-ft putt (the band starts at 4 ft)', () => {
    const v = buildGreenView([...putts('downhill', 4, 5, 5), ...putts('level', 4, 5, 5), ...putts('level', 3, 60, 0)], 5)!;
    expect(v.regions.level.n).toBe(10);
  });

  it('is omitted below 10 counted downhill or level putts', () => {
    expect(buildGreenView([...putts('downhill', 4, 5, 4), ...putts('level', 4, 20, 2)], 10)).toBeNull();
    expect(buildGreenView([...putts('downhill', 4, 5, 5), ...putts('level', 4, 5, 4)], 10)).toBeNull();
    // Tap-ins never lift a slope over the gate.
    expect(buildGreenView([...putts('downhill', 4, 5, 5), ...putts('level', 1, 50, 0)], 10)).toBeNull();
    expect(buildGreenView([...putts('downhill', 4, 5, 5), ...putts('level', 4, 5, 5)], 10)).not.toBeNull();
  });

  it('summarises every region in the aria-label and marks thin reads', () => {
    const label = greenAriaLabel(view);
    expect(label).toContain('Above the hole, downhill: 11 of 26 made (42%)');
    expect(label).toContain('Sides, level: 8 of 12 made (67%), thin read');
    expect(label).toContain('Below the hole, uphill: 11 of 25 made (44%)');
    expect(label).not.toMatch(/better|worse|than/);
  });
});

describe('placePutt', () => {
  it('is deterministic in the shot id', () => {
    expect(placePutt('shot-abc', 4, 'downhill')).toEqual(placePutt('shot-abc', 4, 'downhill'));
    expect(placePutt('shot-abc', 4, 'downhill')).not.toEqual(placePutt('shot-abd', 4, 'downhill'));
  });

  it('puts downhill above the hole, uphill below, level to the sides, at the recorded distance', () => {
    for (let i = 0; i < 50; i++) {
      const d = placePutt(`d${i}`, 5, 'downhill');
      const u = placePutt(`u${i}`, 5, 'uphill');
      const l = placePutt(`l${i}`, 5, 'level');
      const dy = GREEN_CENTER - d.y;
      const dx = d.x - GREEN_CENTER;
      expect(dy).toBeGreaterThan(Math.abs(dx)); // inside the top wedge
      expect(u.y - GREEN_CENTER).toBeGreaterThan(Math.abs(u.x - GREEN_CENTER));
      expect(Math.abs(l.x - GREEN_CENTER)).toBeGreaterThan(Math.abs(l.y - GREEN_CENTER));
      expect(Math.hypot(dx, dy)).toBeCloseTo(5 * GREEN_PX_PER_FT, 0);
    }
  });
});
