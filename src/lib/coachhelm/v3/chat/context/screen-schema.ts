/**
 * CoachHelm chat: where the chat was opened from, as the browser may say it.
 *
 * Pure data and pure functions: no server import, so the client hook can build the value with
 * `screenContextFromPath(location.pathname, location.search)` and add what the address does not carry (Roster's and
 * Messages' selection lives in the screen's own state).
 *
 * Nothing here is trusted. The server parses it with `parseScreenContext` (a value that does not parse is dropped and
 * the turn runs without it) and then checks every id against the signed-in person's own team in
 * `screen-context.ts` before a word of it reaches the model.
 */
import { z } from 'zod';

/** The screens a chat can be opened from. One id per place in the app map (`app-map.ts`), plus `other`. */
export const SCREEN_IDS = [
  'home',
  'coachhelm',
  'ask',
  'calendar',
  'practice',
  'messages',
  'team_hub',
  'roster',
  'stats',
  'team_stats',
  'rounds',
  'qualifiers',
  'recruiting',
  'tournaments',
  'classes',
  'settings',
  'other',
] as const;
export type ScreenId = (typeof SCREEN_IDS)[number];

/** The Stats range switch (`src/clubhouse/data/stats-filter.ts`, `ChRange`). */
export const SCREEN_WINDOWS = ['last5', 'last10', 'last20', 'season', 'qualifiers'] as const;
export type ScreenWindow = (typeof SCREEN_WINDOWS)[number];

// One unusable field drops that field, not the whole context: an old tab sending a stale id still says which screen it is on.
const Id = z.string().uuid().nullable().optional().catch(null);

export const ScreenContextSchema = z.object({
  screen: z.enum(SCREEN_IDS),
  /** A sub-view of the screen: a Team Hub tab, a Settings section, a CoachHelm view, a Calendar view. Letters only; it is matched against a fixed list, never printed as given. */
  tab: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{0,31}$/)
    .nullable()
    .optional()
    .catch(null),
  player_id: Id,
  round_id: Id,
  event_id: Id,
  qualifier_id: Id,
  plan_id: Id,
  thread_id: Id,
  tournament_id: Id,
  window: z.enum(SCREEN_WINDOWS).nullable().optional().catch(null),
});
export type ScreenContextInput = z.infer<typeof ScreenContextSchema>;

/** What the browser sent, or null when it is absent or unusable. Never throws: a bad context must not cost the coach the turn. */
export function parseScreenContext(raw: unknown): ScreenContextInput | null {
  if (raw === null || raw === undefined) return null;
  const parsed = ScreenContextSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (v: string | null | undefined): string | null => (v && UUID.test(v) ? v.toLowerCase() : null);
const tabOrNull = (v: string | null | undefined): string | null => (v && /^[a-z][a-z0-9_-]{0,31}$/.test(v) ? v : null);

/**
 * The context an address carries. `search` is the query string with or without its `?`. An address outside the
 * dashboard answers null (the chat is not offered there); a dashboard address with no entry answers `other`.
 */
export function screenContextFromPath(pathname: string, search = ''): ScreenContextInput | null {
  const path = pathname.replace(/\/+$/, '');
  if (path !== '/golf/dashboard' && !path.startsWith('/golf/dashboard/')) return null;
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const seg = path.slice('/golf/dashboard'.length).split('/').filter(Boolean);
  const [first, second, third] = seg;
  const base = (screen: ScreenId, extra: Partial<ScreenContextInput> = {}): ScreenContextInput => ({ screen, ...extra });

  switch (first) {
    case undefined:
      return base('home');
    case 'coachhelm': {
      const view = tabOrNull(q.get('view'));
      if (second === 'chat' || view === 'ask') return base('ask');
      return base('coachhelm', { tab: view, player_id: uuidOrNull(q.get('player')) });
    }
    case 'calendar':
      return base('calendar', { tab: tabOrNull(q.get('view')), event_id: uuidOrNull(q.get('event')) });
    case 'practice':
      if (second === 'plan' || second === 'print') return base('practice', { tab: 'plan', plan_id: uuidOrNull(third) });
      return base('practice', { tab: tabOrNull(second), event_id: uuidOrNull(q.get('event')) });
    case 'messages':
      return base('messages');
    case 'team-hub':
      return base('team_hub', { tab: tabOrNull(q.get('tab')) });
    case 'announcements':
      return base('team_hub', { tab: 'ann' });
    case 'tasks':
      return base('team_hub', { tab: 'tasks' });
    case 'travel':
      return base('team_hub', { tab: 'travel' });
    case 'documents':
      return base('team_hub', { tab: 'docs' });
    case 'roster':
      return base('roster', { player_id: uuidOrNull(second) });
    case 'stats':
      if (second === 'team') return base('team_stats', { window: windowOrNull(q.get('window')), tab: tabOrNull(q.get('area')) });
      return base('stats', { player_id: uuidOrNull(q.get('player')), window: windowOrNull(q.get('window')), tab: tabOrNull(q.get('area') ?? q.get('tab')) });
    case 'rounds':
      return base('rounds', { round_id: uuidOrNull(second === 'continue' ? third : second) });
    case 'qualifiers':
    case 'my-qualifiers':
      return base('qualifiers', { qualifier_id: uuidOrNull(second) });
    case 'recruiting':
      return base('recruiting');
    case 'tournaments':
      return base('tournaments', { tournament_id: uuidOrNull(second), tab: tabOrNull(third) });
    case 'classes':
      return base('classes');
    case 'settings':
      return base('settings', { tab: tabOrNull(q.get('section') ?? second) });
    default:
      return base('other');
  }
}

function windowOrNull(v: string | null): ScreenWindow | null {
  return (SCREEN_WINDOWS as readonly string[]).includes(v ?? '') ? (v as ScreenWindow) : null;
}
