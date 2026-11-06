import type { DrillKind, PlanArea } from './model';

/** What a GolfHelm library drill's category means in the bank's terms, so a rotation colours by what the drill is. */
export const LIBRARY_DRILL_KINDS: Record<string, { area: PlanArea; kind: DrillKind }> = {
  putting: { area: 'putting', kind: 'skill' },
  short_game: { area: 'short_game', kind: 'skill' },
  approach: { area: 'approach', kind: 'skill' },
  tee: { area: 'tee', kind: 'skill' },
  course_management: { area: 'course', kind: 'random' },
  scoring: { area: 'course', kind: 'random' },
  pressure: { area: 'mental', kind: 'pressure' },
};
