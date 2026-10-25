import type { LiveLane, LiveRoundType } from './model';

/** What the live view's query params narrow it to (`?event=`, `?qualifier=`, `?session=`, `?player=`, `?type=`). */
export interface LiveScope {
  eventId?: string;
  qualifierId?: string;
  /** Accepted and ignored until practice sessions exist (3). */
  sessionId?: string;
  playerId?: string;
  type?: LiveRoundType;
  /** Only rounds dated this day (the qualifier's section lists today's round only). */
  day?: string | null;
  /** The event's day and course (resolved by the loader): a lane matches when it is that day, and that course when both are set. */
  date?: string | null;
  courseId?: string | null;
}

export function laneMatchesScope(lane: LiveLane, scope: LiveScope): boolean {
  if (scope.qualifierId && lane.qualifierId !== scope.qualifierId) return false;
  if (scope.playerId && lane.playerId !== scope.playerId) return false;
  if (scope.type && lane.roundType !== scope.type) return false;
  if (scope.day && lane.roundDate !== scope.day) return false;
  if (scope.eventId) {
    if (scope.date && lane.roundDate !== scope.date) return false;
    if (scope.courseId && lane.courseId && lane.courseId !== scope.courseId) return false;
  }
  return true;
}

const TYPES: readonly LiveRoundType[] = ['practice', 'qualifier', 'tournament'];

/** The live view's query params, read defensively: anything that is not a plain string id is dropped. */
export function scopeFromParams(params: Record<string, string | string[] | undefined>): LiveScope {
  const one = (k: string) => {
    const v = params[k];
    const s = Array.isArray(v) ? v[0] : v;
    return typeof s === 'string' && /^[0-9a-zA-Z_-]{1,64}$/.test(s) ? s : undefined;
  };
  const type = one('type');
  return {
    ...(one('event') ? { eventId: one('event') } : {}),
    ...(one('qualifier') ? { qualifierId: one('qualifier') } : {}),
    ...(one('session') ? { sessionId: one('session') } : {}),
    ...(one('player') ? { playerId: one('player') } : {}),
    ...(type && (TYPES as readonly string[]).includes(type) ? { type: type as LiveRoundType } : {}),
  };
}
