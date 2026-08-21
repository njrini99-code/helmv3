import { describe, it, expect } from 'vitest';
import { buildFeedItems } from '../RecentActivityFeed';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function makeActivity(
  overrides: Partial<AdminDashboardData['activity']> = {}
): AdminDashboardData['activity'] {
  return {
    recentSignups: [],
    recentRounds: [],
    recentInsights: [],
    recentAdminEvents: [],
    recentAuditEvents: [],
    ...overrides,
  };
}

describe('buildFeedItems — round labeling', () => {
  it('labels a round with a recorded score by its score, not "in progress"', () => {
    const activity = makeActivity({
      recentRounds: [
        {
          id: 'r1',
          player_name: 'Jamie Lee',
          course_name: 'Pebble Beach',
          total_score: 72,
          total_to_par: 0,
          round_type: 'practice',
          created_at: new Date(Date.now() - HOUR).toISOString(),
        },
      ],
    });
    const [item] = buildFeedItems(activity);
    expect(item?.text).toContain('shot 72');
    expect(item?.text).not.toContain('in progress');
  });

  it('never labels a null-score round "in progress" — uses a neutral label instead', () => {
    const activity = makeActivity({
      recentRounds: [
        {
          id: 'r2',
          player_name: 'Sam Rivera',
          course_name: 'Torrey Pines',
          total_score: null,
          total_to_par: null,
          round_type: 'tournament',
          created_at: new Date(Date.now() - HOUR).toISOString(),
        },
      ],
    });
    const items = buildFeedItems(activity);
    expect(items).toHaveLength(1);
    expect(items[0]?.text).not.toContain('in progress');
    expect(items[0]?.text).toContain('no score yet');
  });

  it('drops a null-score round older than 48h from the feed entirely', () => {
    const activity = makeActivity({
      recentRounds: [
        {
          id: 'r3',
          player_name: 'Old Abandoned Round',
          course_name: null,
          total_score: null,
          total_to_par: null,
          round_type: null,
          // 3 weeks old — the reported "so many in progress rounds" scenario
          created_at: new Date(Date.now() - 21 * DAY).toISOString(),
        },
      ],
    });
    const items = buildFeedItems(activity);
    expect(items.find((i) => i.id === 'round-r3')).toBeUndefined();
    expect(items).toHaveLength(0);
  });

  it('keeps a null-score round just under the 48h cutoff', () => {
    const activity = makeActivity({
      recentRounds: [
        {
          id: 'r4',
          player_name: 'Recent No-Score',
          course_name: null,
          total_score: null,
          total_to_par: null,
          round_type: null,
          created_at: new Date(Date.now() - 47 * HOUR).toISOString(),
        },
      ],
    });
    const items = buildFeedItems(activity);
    expect(items.find((i) => i.id === 'round-r4')).toBeDefined();
  });

  it('keeps a scored round regardless of age', () => {
    const activity = makeActivity({
      recentRounds: [
        {
          id: 'r5',
          player_name: 'Old Completed Round',
          course_name: 'Augusta',
          total_score: 68,
          total_to_par: -4,
          round_type: 'tournament',
          created_at: new Date(Date.now() - 21 * DAY).toISOString(),
        },
      ],
    });
    const items = buildFeedItems(activity);
    expect(items.find((i) => i.id === 'round-r5')).toBeDefined();
  });
});
