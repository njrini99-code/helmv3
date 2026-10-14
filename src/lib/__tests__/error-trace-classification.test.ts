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

describe('classifyTraceFeature — the route decides before the message text', () => {
  // Incident 2026-10-13 (d9ed17ef): a POST to /baseball/coach-onboarding was
  // tagged baseball_messages because Next's error text links
  // "nextjs.org/docs/messages/invalid-use-server-value" and the classifier
  // read route + message as one string, first match wins.
  it('tags a coach-onboarding route as baseball_onboarding despite a docs/messages URL in the message', async () => {
    const { classifyTraceFeature } = await import('@/lib/error-trace-classification');
    const result = classifyTraceFeature(
      { route: '/baseball/coach-onboarding', url: null, action: '/baseball/coach-onboarding' },
      'A "use server" file can only export async functions, found object.\nRead more: https://nextjs.org/docs/messages/invalid-use-server-value',
    );
    expect(result).toEqual({ sport: 'baseball', feature: 'baseball_onboarding' });
  });

  it('falls back to the message when the route says nothing', async () => {
    const { classifyTraceFeature } = await import('@/lib/error-trace-classification');
    expect(classifyTraceFeature({ route: null, url: null, action: null }, 'failed on /baseball/messages send')).toEqual({
      sport: 'baseball',
      feature: 'baseball_messages',
    });
  });
});
