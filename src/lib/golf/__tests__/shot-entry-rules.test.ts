import { describe, expect, it } from 'vitest';
import { lockedAfterUnit, nextShotBlocker, shotPlausibility, shotResultOptions, type ShotEntryInput } from '../shot-entry-rules';

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

  it('names the one requirement still missing, in the order isReadyForNextShot checks', () => {
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
    expect(issue).not.toBeNull();
  });
});
