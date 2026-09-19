import { describe, expect, it } from 'vitest';
import { presentLie, LIE_PRESENTATION } from '../presentation-lie';
import type { LiePosteriorEntry } from '../lie-classifier';

const entries = (...pairs: [LiePosteriorEntry['lieClass'], number][]): LiePosteriorEntry[] => pairs.map(([lieClass, p]) => ({ featureId: lieClass === 'UNKNOWN' ? null : lieClass, lieClass, p }));
const mid = { completedShots: 2, primaryReviewed: true };

describe('presentation lie copy (§45–48)', () => {
  it('reads clean at ≥ .90, "Likely" from .70, and both classes under .70 (§45)', () => {
    expect(presentLie(entries(['green', .93], ['fringe', .07]), 'green', mid)).toMatchObject({ label: 'Green', rule: 'clean', secondary: null, display: 'clean', pMax: .93 });
    expect(presentLie(entries(['green', .75], ['fringe', .25]), 'green', mid)).toMatchObject({ label: 'Likely green', rule: 'likely', display: 'cue' });
    expect(presentLie(entries(['green', .63], ['fringe', .31], ['primary_rough', .06]), 'green', mid)).toMatchObject({ label: 'Green / fringe', rule: 'dual', secondary: 'fringe', display: 'boundary' });
    // A scattered remainder is not a second dominant class.
    expect(presentLie(entries(['fairway', .6], ['primary_rough', .14], ['bunker', .13], ['woods', .13]), 'fairway', mid)).toMatchObject({ label: 'Likely fairway', rule: 'likely' });
    expect(presentLie(entries(['secondary_rough', .55], ['woods', .45]), 'secondary_rough', mid).label).toBe('Deep rough / trees');
  });
  it('reads "Near tee edge" for a tee/rough split at hole start only (§46)', () => {
    const split = entries(['primary_rough', .52], ['tee', .48]);
    expect(presentLie(split, 'primary_rough', { completedShots: 0, primaryReviewed: true })).toMatchObject({ label: 'Near tee edge', rule: 'tee_edge', primary: 'primary_rough', secondary: 'tee' });
    expect(presentLie(entries(['tee', .6], ['fairway', .4]), 'tee', { completedShots: 0, primaryReviewed: null }).label).toBe('Near tee edge');
    // The same split after a shot is an ordinary boundary call; a clean tee is just Tee.
    expect(presentLie(split, 'primary_rough', mid).label).toBe('Rough / tee');
    expect(presentLie(entries(['tee', .95], ['primary_rough', .05]), 'tee', { completedShots: 0, primaryReviewed: true }).label).toBe('Tee');
    // Tee against a bunker keeps the hazard in the copy.
    expect(presentLie(entries(['tee', .55], ['bunker', .45]), 'tee', { completedShots: 0, primaryReviewed: true }).label).toBe('Tee / bunker');
  });
  it('never declares Water from the phone: "Near water" and the penalty workflow (§47)', () => {
    expect(presentLie(entries(['water', .8], ['primary_rough', .2]), 'water', mid)).toMatchObject({ label: 'Near water', rule: 'near_water', needsPenaltyWorkflow: true, secondary: 'primary_rough' });
    expect(presentLie(entries(['fairway', .7], ['water', LIE_PRESENTATION.waterOverlapP]), 'fairway', mid)).toMatchObject({ label: 'Near water', needsPenaltyWorkflow: true, primary: 'fairway' });
    expect(presentLie(entries(['fairway', .9], ['water', .1]), 'fairway', mid)).toMatchObject({ label: 'Fairway', needsPenaltyWorkflow: false });
  });
  it('says "Surface uncertain" for a boundary call on an unreviewed feature, and Unmapped outside the model (§48)', () => {
    expect(presentLie(entries(['green', .6], ['fringe', .4]), 'green', { completedShots: 1, primaryReviewed: false })).toMatchObject({ label: 'Surface uncertain', rule: 'weak_source', secondary: 'fringe' });
    expect(presentLie(entries(['green', .8], ['fringe', .2]), 'green', { completedShots: 1, primaryReviewed: false }).label).toBe('Likely green');
    expect(presentLie(entries(['UNKNOWN', 1]), 'UNKNOWN', mid)).toMatchObject({ label: 'Unmapped', rule: 'unmapped', secondary: null });
  });
  it('never mutates the posterior it reads', () => {
    const posterior = Object.freeze(entries(['fringe', .5], ['green', .5]).map(e => Object.freeze(e)));
    const before = JSON.stringify(posterior);
    presentLie(posterior, 'fringe', mid);
    presentLie(posterior, 'fringe', { completedShots: 0, primaryReviewed: false });
    expect(JSON.stringify(posterior)).toBe(before);
    expect(posterior[0]!.lieClass).toBe('fringe');
  });
});
