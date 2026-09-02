/**
 * Regression tests for the Golf Tracer's classification blind spots.
 *
 * Each case below is a real action string or featureArea taken from the source
 * or from the production error census — not a hypothetical. A failure here
 * means a genuine shot-tracking failure would go missing from the tracer, which
 * is the specific way this system has failed before.
 */
import { describe, it, expect } from 'vitest';
import {
  isShotTrackingAction,
  isShotTrackingFeatureArea,
  shotTrackingActionCandidates,
  SHOT_TRACKING_ACTION_PREFIXES,
} from '../shot-tracking-classification';

describe('isShotTrackingFeatureArea', () => {
  it("accepts round_tracking — the area 13 wrapped golf actions actually emit", () => {
    // withAdminObserved derives featureArea from `feature` when featureArea is
    // absent; observed-action.test.ts locks that behaviour.
    expect(isShotTrackingFeatureArea('round_tracking')).toBe(true);
  });

  it.each(['shot_tracking', 'round_tracking', 'rounds', 'round_draft'])(
    'accepts %s',
    (area) => {
      expect(isShotTrackingFeatureArea(area)).toBe(true);
    },
  );

  it.each(['crm', 'recruiting', 'calendar', 'insights', 'travel', 'roster'])(
    'rejects unrelated area %s',
    (area) => {
      expect(isShotTrackingFeatureArea(area)).toBe(false);
    },
  );

  it('rejects stats_cache, which stays conditional on round identity at the call site', () => {
    expect(isShotTrackingFeatureArea('stats_cache')).toBe(false);
  });

  it.each([null, undefined, '', '   '])('rejects empty input %s', (value) => {
    expect(isShotTrackingFeatureArea(value)).toBe(false);
  });
});

describe('isShotTrackingAction', () => {
  it('matches the namespaced flagship action that the old startsWith list missed', () => {
    // The emitted string is `golf.submitGolfRoundComprehensive`; the old list
    // held `submitgolfroundcomprehensive` and matched with startsWith, so this
    // returned false for the most important action in the product.
    expect(isShotTrackingAction('golf.submitGolfRoundComprehensive')).toBe(true);
  });

  it.each([
    // Production census families, by real emitted action name.
    'updateShot',
    'deleteShot',
    'updateShot.invalidateStatsCache',
    'deleteShot.invalidateStatsCache',
    'checkRoundStaleness',
    'checkRoundStaleness.catch',
    'savePartialRound',
    'loadRoundDraft',
    'loadRoundDraft.catch',
    'clearRoundDraft',
    'round_drafts.saveRoundDraft',
    'onRoundCompleteAction',
    'markStatsStaleAction',
    'refreshStatsCacheAction',
    'invalidateOnRoundComplete.recalculateRoundStrokesGained',
    'golf.getRoundShotDetails',
    'golf.deleteInProgressRound',
    'getPlayerShotAnalytics',
  ])('classifies %s as shot tracking', (action) => {
    expect(isShotTrackingAction(action)).toBe(true);
  });

  it.each([
    'getCoachHelmOverview',
    'crm.importCoaches',
    'travel.createTrip',
    'announcements.publish',
    'getPlayerAttendanceStats',
  ])('does not classify unrelated action %s', (action) => {
    expect(isShotTrackingAction(action)).toBe(false);
  });

  it.each([null, undefined, ''])('rejects empty action %s', (action) => {
    expect(isShotTrackingAction(action)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isShotTrackingAction('GOLF.UPDATESHOT')).toBe(true);
  });
});

describe('shotTrackingActionCandidates', () => {
  it('yields the raw action and the namespace-stripped action', () => {
    expect(shotTrackingActionCandidates('golf.submitGolfRoundComprehensive')).toEqual([
      'golf.submitgolfroundcomprehensive',
      'submitgolfroundcomprehensive',
    ]);
  });

  it('yields only the raw action when there is no namespace', () => {
    expect(shotTrackingActionCandidates('updateShot')).toEqual(['updateshot']);
  });

  it('does not strip when the action merely ends in a sub-step suffix', () => {
    // `deleteShot.invalidateStatsCache` must still match the `deleteshot`
    // prefix via the FIRST candidate; stripping gives a second chance, never a
    // worse result.
    expect(shotTrackingActionCandidates('deleteShot.invalidateStatsCache')[0]).toBe(
      'deleteshot.invalidatestatscache',
    );
  });
});

describe('SHOT_TRACKING_ACTION_PREFIXES', () => {
  it('is stored lowercase, since matching lowercases the action', () => {
    for (const prefix of SHOT_TRACKING_ACTION_PREFIXES) {
      expect(prefix).toBe(prefix.toLowerCase());
    }
  });

  it('contains no duplicates', () => {
    expect(new Set(SHOT_TRACKING_ACTION_PREFIXES).size).toBe(SHOT_TRACKING_ACTION_PREFIXES.length);
  });
});
