import type { FeatureKey } from '@/lib/admin/feature-registry';

export type TraceSport = 'golf' | 'baseball' | 'shared';

export interface TraceClassification {
  sport: TraceSport | null;
  feature: FeatureKey | null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readNestedString(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const nested = value as Record<string, unknown>;
  return asString(nested.pathname) ?? asString(nested.href) ?? asString(nested.route);
}

export function getTraceRoute(context: unknown, fallbackUrl?: string | null): string | null {
  if (context && typeof context === 'object' && !Array.isArray(context)) {
    const record = context as Record<string, unknown>;
    return (
      asString(record.route) ??
      readNestedString(record, 'location') ??
      asString(record.url) ??
      fallbackUrl ??
      null
    );
  }
  return fallbackUrl ?? null;
}

export function getTraceAction(context: unknown): string | null {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
  const record = context as Record<string, unknown>;
  return asString(record.action) ?? asString(record.component);
}

export function classifyTraceSurface(routeOrUrl: string | null | undefined, component?: string | null): TraceClassification {
  const text = `${routeOrUrl ?? ''} ${component ?? ''}`.toLowerCase();
  const sport: TraceSport | null =
    text.includes('/baseball') || text.includes('baseball')
      ? 'baseball'
      : text.includes('/golf') || text.includes('golf') || text.includes('coachhelm')
        ? 'golf'
        : null;

  if (!text) return { sport, feature: null };

  if (sport === 'baseball') {
    if (text.includes('command-center')) return { sport, feature: 'baseball_command_center' };
    if (text.includes('decision-room')) return { sport, feature: 'baseball_decision_room' };
    if (text.includes('stats') || text.includes('game')) return { sport, feature: 'baseball_stats' };
    if (text.includes('roster') || text.includes('players/')) return { sport, feature: 'baseball_roster' };
    if (text.includes('team')) return { sport, feature: 'baseball_teams' };
    if (text.includes('watchlist')) return { sport, feature: 'baseball_watchlist' };
    if (text.includes('calendar') || text.includes('events')) return { sport, feature: 'baseball_calendar' };
    if (text.includes('message')) return { sport, feature: 'baseball_messages' };
    if (text.includes('document')) return { sport, feature: 'baseball_documents' };
    if (text.includes('video')) return { sport, feature: 'baseball_video' };
    if (text.includes('practice')) return { sport, feature: 'baseball_practice' };
    if (text.includes('performance') || text.includes('lift')) return { sport, feature: 'baseball_lifting' };
    if (text.includes('recruit') || text.includes('college') || text.includes('pipeline')) return { sport, feature: 'baseball_recruiting' };
    if (text.includes('scout-packet')) return { sport, feature: 'baseball_scout_packet' };
    if (text.includes('settings')) return { sport, feature: 'baseball_settings' };
    if (text.includes('auth') || text.includes('login') || text.includes('signup') || text.includes('password')) return { sport, feature: 'baseball_auth' };
    if (text.includes('onboarding') || text.includes('complete-signup') || text.includes('/join')) return { sport, feature: 'baseball_onboarding' };
    if (text.includes('profile') || text.includes('passport')) return { sport, feature: 'baseball_profile' };
    if (text.includes('signals')) return { sport, feature: 'baseball_signals' };
    if (text.includes('tasks')) return { sport, feature: 'baseball_tasks' };
    if (text.includes('travel')) return { sport, feature: 'baseball_travel' };
    if (text.includes('academics')) return { sport, feature: 'baseball_academics' };
    if (text.includes('announcement')) return { sport, feature: 'baseball_announcements' };
    if (text.includes('camps')) return { sport, feature: 'baseball_camps' };
    if (text.includes('compare') || text.includes('comparison')) return { sport, feature: 'baseball_compare' };
    if (text.includes('dev-plan')) return { sport, feature: 'baseball_dev_plans' };
    if (text.includes('discover')) return { sport, feature: 'baseball_discover' };
    if (text.includes('import')) return { sport, feature: 'baseball_import' };
    if (text.includes('postgame')) return { sport, feature: 'baseball_postgame' };
    return { sport, feature: 'baseball_command_center' };
  }

  if (sport === 'golf') {
    if (text.includes('coachhelm')) return { sport, feature: 'coachhelm_ai_engine' };
    if (text.includes('round')) return { sport, feature: 'round_tracking' };
    if (text.includes('stats') || text.includes('analytics')) return { sport, feature: 'stats_analytics' };
    if (text.includes('qualifier')) return { sport, feature: 'qualifiers' };
    if (text.includes('roster') || text.includes('players/')) return { sport, feature: 'roster_management' };
    if (text.includes('calendar')) return { sport, feature: 'calendar_events' };
    if (text.includes('message')) return { sport, feature: 'messaging' };
    if (text.includes('document')) return { sport, feature: 'documents' };
    if (text.includes('travel')) return { sport, feature: 'travel' };
    if (text.includes('settings')) return { sport, feature: 'settings' };
    if (text.includes('login') || text.includes('signup') || text.includes('password') || text.includes('/join')) return { sport, feature: 'auth_onboarding' };
    return { sport, feature: 'coach_dashboard' };
  }

  return { sport, feature: null };
}
