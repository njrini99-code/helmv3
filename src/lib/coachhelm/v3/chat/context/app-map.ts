/**
 * CoachHelm chat: the app map.
 *
 * Every place a coach or a player can open in the app, with one line on what it is for and its address. Two readers:
 * `find_in_app` (find-in-app.ts) answers "where do I …" from it and attaches a link the coach can press, and the
 * screen context (screen-context.ts) takes a screen's name from it, so the chat and the app call a place the same
 * thing. It is never printed into the prompt.
 *
 * Hand-maintained, like `src/lib/golf/surface-registry.ts`, and held to the app by a test
 * (`__tests__/app-map.test.ts`): every address must be a page under `src/app/golf/(dashboard)/dashboard` and a
 * rebuilt route for the role it is offered to (`src/clubhouse/shell/nav.ts`), and every tab must be one the screen
 * reads. Names follow the navigation (`CH_NAV_COACH`, `CH_NAV_PLAYER`), Team Hub's tabs and Settings' sections.
 *
 * Role is decided here, never by the model: `placesFor('player')` cannot return a coach's place.
 */
import type { ScreenId } from './screen-schema';

export type AppRole = 'coach' | 'player';

export interface AppPlace {
  /** Stable. */
  id: string;
  /** The screen-context id this place belongs to, with `tab` for a sub-view of it. */
  screen: ScreenId;
  tab?: string;
  /** What the app calls it. */
  name: string;
  /** One line: what it is for, in a coach's words. */
  purpose: string;
  /** The address. A place opened for one player has `{player}` where that player's id goes (coach only). */
  href: string;
  role: AppRole | 'both';
  /** Words a person might use for it that are not in its name. */
  keywords: readonly string[];
  /** Behind a release flag of its own: offered only when the flag is on. */
  flag?: 'golf_tournaments_v1';
}

const D = '/golf/dashboard';

export const APP_PLACES: readonly AppPlace[] = [
  // --- Both roles -------------------------------------------------------------------------------------------------
  { id: 'home', screen: 'home', name: 'Home', purpose: 'Today at a glance: what is next on the schedule and what needs attention.', href: D, role: 'both', keywords: ['today', 'dashboard', 'start', 'overview'] },
  { id: 'calendar', screen: 'calendar', name: 'Calendar', purpose: 'Practices, tournaments, qualifiers, travel and blocked time, by month, week or day, with who has replied.', href: `${D}/calendar`, role: 'both', keywords: ['schedule', 'events', 'practice times', 'rsvp', 'replies', 'week', 'month', 'when'] },
  { id: 'practice', screen: 'practice', name: 'Practice', purpose: 'Practice plans: the plan for each practice, drafts and what has been published to players.', href: `${D}/practice`, role: 'both', keywords: ['practice plan', 'plans', 'session', 'blocks', 'workout'] },
  { id: 'messages', screen: 'messages', name: 'Messages', purpose: 'Team chat, group threads and direct messages, with polls and attachments.', href: `${D}/messages`, role: 'both', keywords: ['chat', 'text', 'dm', 'thread', 'inbox', 'conversation', 'poll'] },
  { id: 'team_hub', screen: 'team_hub', tab: 'home', name: 'Team Hub', purpose: 'The team notice board: announcements, travel, documents and tasks in one place.', href: `${D}/team-hub`, role: 'both', keywords: ['hub', 'notice board', 'team page'] },
  { id: 'team_hub_announcements', screen: 'team_hub', tab: 'ann', name: 'Team Hub, Announcements', purpose: 'Team updates the coach has sent, and who has acknowledged each one.', href: `${D}/team-hub?tab=ann`, role: 'both', keywords: ['announcement', 'update', 'news', 'acknowledged', 'notice'] },
  { id: 'team_hub_travel', screen: 'team_hub', tab: 'travel', name: 'Team Hub, Travel', purpose: 'Trips: departure, hotel, what to bring and room lists.', href: `${D}/team-hub?tab=travel`, role: 'both', keywords: ['trip', 'itinerary', 'hotel', 'bus', 'flight', 'packing', 'rooms'] },
  { id: 'team_hub_documents', screen: 'team_hub', tab: 'docs', name: 'Team Hub, Documents', purpose: 'Team documents and files: handbooks, forms, saved reports and published practice plans.', href: `${D}/team-hub?tab=docs`, role: 'both', keywords: ['document', 'file', 'folder', 'handbook', 'form', 'pdf', 'report'] },
  { id: 'team_hub_tasks', screen: 'team_hub', tab: 'tasks', name: 'Team Hub, Tasks', purpose: 'Tasks assigned to players, with due dates and who has finished.', href: `${D}/team-hub?tab=tasks`, role: 'both', keywords: ['task', 'todo', 'to-do list', 'assignment', 'due', 'checklist', 'overdue'] },
  { id: 'qualifiers', screen: 'qualifiers', name: 'Qualifiers', purpose: 'Qualifying events: who is entered, the standings round by round and who made the lineup.', href: `${D}/qualifiers`, role: 'both', keywords: ['qualifying', 'qualifier', 'standings', 'leaderboard', 'travel squad', 'lineup spots'] },
  { id: 'rounds', screen: 'rounds', name: 'Rounds', purpose: 'Posted rounds with their scorecards and shot detail.', href: `${D}/rounds`, role: 'both', keywords: ['round', 'scorecard', 'score', 'posted', 'history', 'card'] },
  { id: 'tournaments', screen: 'tournaments', name: 'Tournaments', purpose: 'Tournaments: the field, the lineup, live scoring and results.', href: `${D}/tournaments`, role: 'both', keywords: ['tournament', 'event', 'lineup', 'results', 'field', 'live scoring'], flag: 'golf_tournaments_v1' },
  { id: 'settings_account', screen: 'settings', tab: 'account', name: 'Settings, Account', purpose: 'Your profile, email and password.', href: `${D}/settings?section=account`, role: 'both', keywords: ['settings', 'profile', 'email', 'password', 'account', 'sign in', 'photo'] },
  { id: 'settings_notifications', screen: 'settings', tab: 'notifications', name: 'Settings, Notifications', purpose: 'Which emails and push notifications you get.', href: `${D}/settings?section=notifications`, role: 'both', keywords: ['notifications', 'push', 'alerts', 'emails', 'mute', 'reminders'] },
  { id: 'settings_preferences', screen: 'settings', tab: 'preferences', name: 'Settings, Preferences', purpose: 'Motion, haptics and units.', href: `${D}/settings?section=preferences`, role: 'both', keywords: ['preferences', 'motion', 'haptics', 'units', 'yards', 'metres', 'appearance'] },

  // --- Coach ------------------------------------------------------------------------------------------------------
  { id: 'coachhelm_board', screen: 'coachhelm', name: 'CoachHelm', purpose: 'CoachHelm’s board: what changed in each player’s game, the signals worth acting on and what to work on.', href: `${D}/coachhelm`, role: 'coach', keywords: ['insights', 'signals', 'board', 'brief', 'what changed', 'alerts', 'focus', 'dashboard', 'team dashboard', 'trends', 'team trends'] },
  { id: 'ask', screen: 'ask', name: 'CoachHelm, Ask', purpose: 'This chat on a full page, with earlier conversations.', href: `${D}/coachhelm?view=ask`, role: 'coach', keywords: ['ask', 'chat history', 'conversations', 'assistant'] },
  { id: 'coachhelm_player_deep_dive', screen: 'coachhelm', tab: 'deep-dive', name: 'CoachHelm, a player’s Deep dive', purpose: 'One player’s signals in full, with the evidence behind each.', href: `${D}/coachhelm?view=deep-dive&player={player}`, role: 'coach', keywords: ['deep dive', 'player insights', 'signals for', 'evidence'] },
  { id: 'coachhelm_player_standing', screen: 'coachhelm', tab: 'standing', name: 'CoachHelm, a player’s Standing', purpose: 'Where one player stands against their level and the team, and how they play.', href: `${D}/coachhelm?view=standing&player={player}`, role: 'coach', keywords: ['standing', 'level', 'game profile', 'how they play', 'compare to level'] },
  { id: 'calendar_new_event', screen: 'calendar', tab: 'new', name: 'Calendar, new event', purpose: 'The form for a new practice, tournament, meeting or other event.', href: `${D}/calendar?new=1`, role: 'coach', keywords: ['add event', 'new event', 'create event', 'schedule a practice', 'add practice'] },
  { id: 'practice_drills', screen: 'practice', tab: 'drills', name: 'Practice, Drills', purpose: 'The team’s drill bank: every drill with its setup and scoring.', href: `${D}/practice/drills`, role: 'coach', keywords: ['drill', 'drill bank', 'drill library', 'games'] },
  { id: 'practice_format', screen: 'practice', tab: 'format', name: 'Practice, Plan format', purpose: 'How this team’s practice plans are laid out.', href: `${D}/practice/format`, role: 'coach', keywords: ['plan format', 'layout', 'template format'] },
  { id: 'practice_groups', screen: 'practice', tab: 'groups', name: 'Practice, Groups', purpose: 'Saved practice groups of players.', href: `${D}/practice/groups`, role: 'coach', keywords: ['groups', 'pairings', 'stations', 'squads'] },
  { id: 'practice_templates', screen: 'practice', tab: 'templates', name: 'Practice, Templates', purpose: 'Saved plans to start a new practice from.', href: `${D}/practice/templates`, role: 'coach', keywords: ['template', 'saved plan', 'reuse a plan'] },
  { id: 'roster', screen: 'roster', name: 'Roster', purpose: 'The team: every player with class year and scoring, plus invites and requests to join.', href: `${D}/roster`, role: 'coach', keywords: ['players', 'team list', 'invite', 'join request', 'requests', 'access code', 'add a player', 'class year'] },
  { id: 'stats_player', screen: 'stats', name: 'Stats', purpose: 'One player’s stats: scoring, strokes gained, putting by distance, approach and rounds, for a chosen window.', href: `${D}/stats?player={player}`, role: 'coach', keywords: ['player stats', 'strokes gained', 'putting', 'approach', 'scoring average', 'numbers', 'trend'] },
  { id: 'team_stats', screen: 'team_stats', name: 'Team Stats', purpose: 'The whole team side by side: scoring, strokes gained by area and who leads each measure.', href: `${D}/stats/team`, role: 'coach', keywords: ['team stats', 'team average', 'ranking', 'compare players', 'leaderboard', 'who leads'] },
  { id: 'live', screen: 'rounds', tab: 'live', name: 'Live', purpose: 'Players who are out on the course right now, hole by hole.', href: `${D}/live`, role: 'coach', keywords: ['live', 'right now', 'on the course', 'playing now', 'live scoring'] },
  { id: 'qualifier_new', screen: 'qualifiers', tab: 'new', name: 'Qualifiers, new qualifier', purpose: 'The form to set up a qualifier: rounds, dates, spots and who is in.', href: `${D}/qualifiers/new`, role: 'coach', keywords: ['new qualifier', 'set up qualifying', 'create qualifier'] },
  { id: 'recruiting', screen: 'recruiting', name: 'Recruiting', purpose: 'The recruiting board: prospects by stage, with notes and documents.', href: `${D}/recruiting`, role: 'coach', keywords: ['recruit', 'prospect', 'pipeline', 'commit', 'offer', 'visit'] },
  { id: 'tournament_new', screen: 'tournaments', tab: 'new', name: 'Tournaments, new tournament', purpose: 'The form to add a tournament.', href: `${D}/tournaments/new`, role: 'coach', keywords: ['new tournament', 'add tournament'], flag: 'golf_tournaments_v1' },
  { id: 'settings_team', screen: 'settings', tab: 'team', name: 'Settings, Team', purpose: 'Team settings: scoring format, tees, timezone, reminders and invites.', href: `${D}/settings?section=team`, role: 'coach', keywords: ['team settings', 'timezone', 'tees', 'scoring format', 'reminders', 'season'] },
  { id: 'settings_coachhelm', screen: 'settings', tab: 'coachhelm', name: 'Settings, CoachHelm', purpose: 'What CoachHelm prioritises and which alerts it raises.', href: `${D}/settings?section=coachhelm`, role: 'coach', keywords: ['coachhelm settings', 'priorities', 'alert settings', 'coaching philosophy'] },
  { id: 'whats_new', screen: 'other', tab: 'whats-new', name: 'What’s new', purpose: 'Recent changes to the app.', href: `${D}/whats-new`, role: 'coach', keywords: ['whats new', 'release notes', 'changes', 'updates to the app'] },

  // --- Player -----------------------------------------------------------------------------------------------------
  { id: 'my_coachhelm', screen: 'coachhelm', name: 'CoachHelm', purpose: 'Your board: what CoachHelm sees in your game and what to work on next.', href: `${D}/coachhelm`, role: 'player', keywords: ['insights', 'my game', 'board', 'what to work on', 'focus'] },
  { id: 'my_standing', screen: 'coachhelm', tab: 'standing', name: 'CoachHelm, Standing', purpose: 'Where your game stands against your level, and how you play.', href: `${D}/coachhelm?view=standing`, role: 'player', keywords: ['standing', 'level', 'game profile', 'how i play'] },
  { id: 'my_deep_dive', screen: 'coachhelm', tab: 'deep-dive', name: 'CoachHelm, Deep dive', purpose: 'Your signals in full, with the evidence behind each.', href: `${D}/coachhelm?view=deep-dive`, role: 'player', keywords: ['deep dive', 'signals', 'evidence', 'details'] },
  { id: 'team_roster', screen: 'roster', name: 'Roster', purpose: 'Your teammates and coaches.', href: `${D}/roster`, role: 'player', keywords: ['teammates', 'team list', 'players', 'coaches'] },
  { id: 'my_stats', screen: 'stats', name: 'My stats', purpose: 'Your stats: scoring, strokes gained, putting by distance, approach and rounds, for a chosen window.', href: `${D}/stats`, role: 'player', keywords: ['stats', 'strokes gained', 'putting', 'approach', 'scoring average', 'numbers', 'trend'] },
  { id: 'round_new', screen: 'rounds', tab: 'new', name: 'Rounds, new round', purpose: 'Start or post a round.', href: `${D}/rounds/new`, role: 'player', keywords: ['post a round', 'new round', 'enter a score', 'start a round', 'add round'] },
  { id: 'classes', screen: 'classes', name: 'Classes', purpose: 'Your class schedule, so practices and travel can be planned around it.', href: `${D}/classes`, role: 'player', keywords: ['class', 'classes', 'school', 'schedule', 'semester', 'timetable'] },
  { id: 'settings_golf', screen: 'settings', tab: 'golf', name: 'Settings, Golf profile', purpose: 'Your handicap, graduation year and team.', href: `${D}/settings?section=golf`, role: 'player', keywords: ['handicap', 'golf profile', 'graduation year', 'hometown'] },
];

export interface PlaceOptions {
  /** `golf_tournaments_v1`. A place behind a flag that is off is not offered: the chat must not point at an unreleased page. */
  tournaments?: boolean;
}

/** The places one role can open. A player's list holds no coach place, whatever is asked. */
export function placesFor(role: AppRole, opts: PlaceOptions = {}): AppPlace[] {
  return APP_PLACES.filter((p) => (p.role === 'both' || p.role === role) && (!p.flag || (p.flag === 'golf_tournaments_v1' && opts.tournaments === true)));
}

/** The place a screen context names, for the role: the tab's own place when there is one, else the screen's first. */
export function placeForScreen(role: AppRole, screen: ScreenId, tab: string | null | undefined, opts: PlaceOptions = {}): AppPlace | null {
  const of = placesFor(role, opts).filter((p) => p.screen === screen);
  const byTab = tab ? of.find((p) => p.tab === tab) : undefined;
  // `other` is every address with no screen of its own: only a named tab says which place it is.
  if (screen === 'other') return byTab ?? null;
  return byTab ?? of.find((p) => !p.tab || p.tab === 'home') ?? of[0] ?? null;
}

/** The address of a place, with the player's id put in where the place is opened for one player. Null when it needs a player and none was given. */
export function hrefOf(place: AppPlace, playerId: string | null): string | null {
  if (!place.href.includes('{player}')) return place.href;
  return playerId ? place.href.replace('{player}', encodeURIComponent(playerId)) : null;
}

const STOP = new Set(['a', 'an', 'and', 'are', 'at', 'can', 'do', 'does', 'find', 'for', 'go', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'open', 'see', 'show', 'take', 'the', 'their', 'to', 'up', 'view', 'what', 'where', 'who', 'you', 'your']);
const words = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
/** "tasks" and "task", "qualifying" and "qualifier" meet on a stem; nothing cleverer is needed for forty places. */
const stem = (w: string): string => w.replace(/(ies)$/, 'y').replace(/(ing|ers|er|es|s)$/, '');

export interface PlaceMatch {
  place: AppPlace;
  score: number;
}

/** The places that match what was asked, best first. Name words weigh most, then the place's own keywords, then its purpose. */
export function searchPlaces(role: AppRole, query: string, opts: PlaceOptions = {}): PlaceMatch[] {
  const asked = [...new Set(words(query).map(stem))].filter(Boolean);
  if (asked.length === 0) return [];
  const phrase = words(query).join(' ');
  const out: PlaceMatch[] = [];
  for (const place of placesFor(role, opts)) {
    const name = new Set(words(place.name).map(stem));
    const keys = new Set(place.keywords.flatMap((k) => words(k).map(stem)));
    const purpose = new Set(words(place.purpose).map(stem));
    let score = 0;
    for (const w of asked) score += name.has(w) ? 4 : keys.has(w) ? 3 : purpose.has(w) ? 1 : 0;
    // A keyword said whole ("join request", "drill bank") is a stronger sign than its words apart.
    if (place.keywords.some((k) => k.includes(' ') && words(k).length > 1 && phrase.includes(words(k).join(' ')))) score += 3;
    if (score > 0) out.push({ place, score });
  }
  return out.sort((a, b) => b.score - a.score || a.place.name.length - b.place.name.length);
}
