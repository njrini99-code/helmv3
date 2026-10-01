import { describe, expect, it } from 'vitest';
import { editResultUpdates, lockedAfterUnit, nextShotBlocker, plausibilityKey, shotPlausibility, shotResultOptions, togglePuttMissTag, type ShotEntryInput } from '../shot-entry-rules';

const hole = { number: 4, par: 4, yardage: 395, score: null } as unknown as ShotEntryInput['hole'];
const base: ShotEntryInput = {
  hole,
  currentShot: 1,
  shotHistory: [],
  isTeeShot: true,
  isPutting: false,
  isApproachOrAroundGreen: false,
  usedDriver: true,
  result: 'fairway',
  missDirection: null,
  approachMissDirection: null,
  puttMissTags: [],
  distanceToHole: 395,
  distanceUnit: 'yards',
  distanceAfterShot: '150',
  distanceAfterUnit: 'yards',
  distancePref: 'yards',
};
const blocker = (over: Partial<ShotEntryInput>) => nextShotBlocker({ ...base, ...over }, false, null, false);

describe('shot entry rules', () => {
  it('offers the Fairway entry’s result sets, with the rare ones marked', () => {
    const v = (o: ReturnType<typeof shotResultOptions>) => o.map((x) => `${x.value}${x.rare ? '*' : ''}${x.note ? `(${x.note})` : ''}`);
    expect(v(shotResultOptions({ isPutting: false, isTeeShot: true, par: 4, currentShot: 1 }))).toEqual(['fairway', 'rough', 'sand', 'green*', 'hole*(ace)', 'other']);
    expect(v(shotResultOptions({ isPutting: false, isTeeShot: true, par: 3, currentShot: 1 }))).toEqual(['green', 'rough', 'sand', 'hole*(ace)', 'other']);
    expect(v(shotResultOptions({ isPutting: true, isTeeShot: false, par: 4, currentShot: 3 }))).toEqual(['hole', 'green', 'rough*(rolled off)', 'sand*(rolled off)']);
    expect(v(shotResultOptions({ isPutting: false, isTeeShot: false, par: 4, currentShot: 2 }))).toEqual(['fairway', 'rough', 'sand', 'green(not fringe)', 'hole', 'other']);
  });

  it('the distance after a shot is in feet on the green and yards elsewhere', () => {
    expect([lockedAfterUnit(true, 'green'), lockedAfterUnit(false, 'green'), lockedAfterUnit(false, 'rough')]).toEqual(['feet', 'feet', 'yards']);
  });

  it('names the one requirement still missing (isReadyForNextShot’s conditions, in the Fairway entry’s order)', () => {
    expect(blocker({ result: null })).toBe('Select a shot result');
    expect(blocker({ result: null, isPutting: true, isTeeShot: false })).toBe('Select a putt result');
    expect(blocker({ usedDriver: null })).toBe('Choose driver or non-driver');
    expect(blocker({ result: 'rough', missDirection: null })).toBe('Choose a miss direction');
    expect(blocker({ isTeeShot: false, isApproachOrAroundGreen: true, result: 'sand' })).toBe('Choose a miss direction');
    expect(blocker({ distanceAfterShot: '' })).toBe('Enter the distance remaining');
    expect(blocker({ distanceAfterShot: '', isPutting: true, isTeeShot: false, result: 'green' })).toBe('Enter the leave distance');
    expect(blocker({ distanceAfterShot: 'x' })).toBe('Enter a valid distance');
    expect(blocker({ result: 'green', distanceAfterShot: '200', distanceAfterUnit: 'feet' })).toBe('Green proximity must be under 150 ft');
    expect(blocker({ result: 'green', distanceAfterShot: '0', distanceAfterUnit: 'feet' })).toBe('Select Hole if you holed out, or enter the actual distance remaining');
    expect(blocker({ distanceAfterShot: '1200' })).toBe('Distance remaining must be 1000 yards or less');
    expect(blocker({ distanceAfterShot: '0' })).toBe('Select Hole if you holed out, or enter the actual distance remaining');
  });

  it('once ready: a blocking issue says why; a warning asks for a confirm, then clears', () => {
    const warn = { rule: 'x', severity: 'confirm' as const, message: 'A long one?' };
    const block = { rule: 'y', severity: 'block' as const, message: 'Not possible' };
    expect(nextShotBlocker(base, true, null, false)).toBeNull();
    expect(nextShotBlocker(base, true, block as never, true)).toBe('Not possible');
    expect(nextShotBlocker(base, true, warn as never, false)).toBe('Confirm the result above to continue');
    expect(nextShotBlocker(base, true, warn as never, true)).toBeNull();
  });

  it('plausibility runs only once the field gates pass, on the shot as it will be recorded', () => {
    expect(shotPlausibility(base, false)).toBeNull();
    // A shot that ends farther from the hole than it started is not plausible.
    const issue = shotPlausibility({ ...base, isTeeShot: false, currentShot: 2, distanceToHole: 150, distanceAfterShot: '300' }, true);
    expect(issue).toMatchObject({ rule: 'distance_not_decreasing', severity: 'confirm' });
  });

  it('matches the Fairway entry’s own cases: a 420-yard drive onto the green asks, a 540-yard one blocks', () => {
    const drive = { ...base, result: 'green' as const, distanceAfterShot: '20', distanceAfterUnit: 'feet' as const };
    expect(shotPlausibility({ ...drive, hole: { ...hole, yardage: 420 }, distanceToHole: 420 }, true)).toMatchObject({
      severity: 'confirm',
      message: 'A 420-yard drive onto the green? Tap to confirm.',
    });
    const long = shotPlausibility({ ...drive, hole: { ...hole, number: 9, par: 5, yardage: 540 }, distanceToHole: 540 }, true);
    expect(long).toMatchObject({ rule: 'tee_shot_unreachable', severity: 'block' });
    expect(long!.message).toMatch(/540-yard drive onto the green isn't possible/);
    expect(shotPlausibility({ ...base, result: 'fairway', distanceAfterShot: '150' }, true)).toBeNull();
  });

  it('a hole-out also checks the hole’s totals', () => {
    const putt = { ...base, isTeeShot: false, isPutting: true, result: 'hole' as const, distanceToHole: 10, distanceUnit: 'feet' as const };
    expect(shotPlausibility(putt, true)).toMatchObject({ rule: 'putts_exceed_score', severity: 'block' });
  });

  it('meters: the leave and remaining distances convert before they are judged', () => {
    const m = { ...base, distancePref: 'meters' as const };
    expect(nextShotBlocker({ ...m, result: 'green', distanceAfterShot: '50', distanceAfterUnit: 'feet' }, false, null, false)).toBe('Green proximity must be under 46 m');
    expect(nextShotBlocker({ ...m, distanceAfterShot: '950' }, false, null, false)).toBe('Distance remaining must be 1000 yards or less');
    expect(nextShotBlocker({ ...m, distanceAfterShot: '900' }, false, null, false)).toBe('Complete the required fields above');
    // 140 m left from 150 yards is farther than it started (153 yds): meters are converted first; 140 yds is not.
    const approach = { ...m, isTeeShot: false, currentShot: 2, distanceToHole: 150, distanceAfterShot: '140' };
    expect(shotPlausibility(approach, true)).toMatchObject({ rule: 'distance_not_decreasing' });
    expect(shotPlausibility({ ...approach, distancePref: 'yards' }, true)).toBeNull();
  });

  it('a confirmed warning is held under a key that changes with the hole, shot, rule, result or distance', () => {
    const warn = { rule: 'x', severity: 'confirm' as const, message: 'm' };
    const k = plausibilityKey(4, 2, warn as never, 'green', '20');
    expect(k).toBe('4:2:x:green:20');
    expect(new Set([k, plausibilityKey(5, 2, warn as never, 'green', '20'), plausibilityKey(4, 3, warn as never, 'green', '20'), plausibilityKey(4, 2, { ...warn, rule: 'y' } as never, 'green', '20'), plausibilityKey(4, 2, warn as never, 'rough', '20'), plausibilityKey(4, 2, warn as never, 'green', '21')]).size).toBe(6);
    expect(plausibilityKey(4, 2, null, 'green', '20')).toBeNull();
  });

  it('putt miss tags: low and high, short and long exclude each other; tapping a chosen tag clears it', () => {
    expect(togglePuttMissTag([], 'low')).toEqual(['low']);
    expect(togglePuttMissTag(['low', 'short'], 'high')).toEqual(['short', 'high']);
    expect(togglePuttMissTag(['high', 'long'], 'short')).toEqual(['high', 'short']);
    expect(togglePuttMissTag(['low', 'short'], 'low')).toEqual(['short']);
  });

  it('the edit sheet’s result choice fixes the unit and clears or derives the miss data', () => {
    expect(editResultUpdates('green', 'approach')).toEqual({ result: 'green', distanceUnitAfter: 'feet', missDirection: null, approachMissDirection: null, approachMissLieType: undefined, puttMissTags: [] });
    expect(editResultUpdates('hole', 'putting')).toEqual({ result: 'hole', distanceToHoleAfter: '0', distanceUnitAfter: 'feet', missDirection: null, approachMissDirection: null, approachMissLieType: undefined, puttMissTags: [] });
    expect(editResultUpdates('sand', 'around_green')).toEqual({ result: 'sand', distanceUnitAfter: 'yards', approachMissLieType: 'bunker' });
    expect(editResultUpdates('other', 'approach')).toMatchObject({ approachMissLieType: 'rough' });
    expect(editResultUpdates('fairway', 'approach')).toMatchObject({ approachMissLieType: 'fairway' });
    expect(editResultUpdates('rough', 'putting')).toEqual({ result: 'rough', distanceUnitAfter: 'feet' });
    expect(editResultUpdates('rough', 'tee')).toEqual({ result: 'rough', distanceUnitAfter: 'yards' });
  });
});
