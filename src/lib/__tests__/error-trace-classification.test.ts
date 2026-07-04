import { describe, expect, it } from 'vitest';
import {
  classifyTraceSurface,
  getTraceAction,
  getTraceRoute,
} from '@/lib/error-trace-classification';

describe('error trace classification', () => {
  it('classifies baseball route boundaries into baseball features', () => {
    expect(classifyTraceSurface('/baseball/dashboard/command-center', 'CommandCenterPage')).toEqual({
      sport: 'baseball',
      feature: 'baseball_command_center',
    });
    expect(classifyTraceSurface('/baseball/dashboard/stats/games/[gameId]', 'GameDetailPage')).toEqual({
      sport: 'baseball',
      feature: 'baseball_stats',
    });
    expect(classifyTraceSurface('/baseball/login', 'BaseballLoginPage')).toEqual({
      sport: 'baseball',
      feature: 'baseball_auth',
    });
  });

  it('keeps golf and CoachHelm errors mapped to golf-side features', () => {
    expect(classifyTraceSurface('/golf/dashboard/coachhelm/chat', 'CoachHelmChatPage')).toEqual({
      sport: 'golf',
      feature: 'coachhelm_ai_engine',
    });
    expect(classifyTraceSurface('/golf/dashboard/rounds/new', 'NewRoundPage')).toEqual({
      sport: 'golf',
      feature: 'round_tracking',
    });
  });

  it('extracts route and action from enriched client contexts', () => {
    const context = {
      component: 'BaseballRosterPage',
      location: {
        href: 'https://helmsportslabs.com/baseball/dashboard/roster?team=demo',
        pathname: '/baseball/dashboard/roster',
      },
    };

    expect(getTraceRoute(context, null)).toBe('/baseball/dashboard/roster');
    expect(getTraceAction(context)).toBe('BaseballRosterPage');
  });
});
