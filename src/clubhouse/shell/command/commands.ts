import { BarChart3, Flag, GraduationCap, Megaphone, MessageSquarePlus, CalendarPlus, Sparkles, Trophy, type LucideIcon } from 'lucide-react';
import { activeNavItem, CH_SETTINGS_ITEM, navFor, rebuiltHref, type ChNavItem, type ChRole } from '../nav';
import { letterFor } from './shortcuts';

export type ChCmdGroup = 'recent' | 'goto' | 'people' | 'actions';

export interface ChCommand {
  /** Stable across renders and unique in the palette ("goto:roster", "action:new-round", "person:<id>"). */
  id: string;
  group: ChCmdGroup;
  label: string;
  /** Where it goes: a rebuilt address for the role, never a route the role has no screen for. */
  href: string;
  icon: LucideIcon;
  /** The shortcut that does the same, each key drawn on its own ("G", "H"). */
  keys?: string[];
  /** What else a search matches (a section's other name, an action's verb). */
  keywords: string[];
  /** A person's row draws their avatar in place of an icon. */
  avatarName?: string;
  /** A short line beside the label: the section a person's class year or an action's screen. */
  detail?: string;
}

/** A player on the coach's team, from a roster the coach's screen has already loaded. */
export interface ChPerson {
  id: string;
  name: string;
  detail?: string;
}

/** A section the person has been in, most recent first. */
export interface ChRecent {
  id: string;
  href: string;
}

const MESSAGES = '/golf/dashboard/messages';

interface ActionSpec {
  id: string;
  label: string;
  icon: LucideIcon;
  roles: readonly ChRole[];
  href: string;
  /** The section the action opens in, named beside it. */
  where: string;
  keywords: string[];
}

/**
 * What the palette can start. Each one only routes to the screen that does it (no write happens here), and it is offered to
 * the roles whose screen takes it: a coach creates events, qualifiers and announcements; a player tracks rounds and adds
 * classes (Calendar opens its editor from `?new=1` for a coach only, `/qualifiers/new` is the coach's form, and Rounds
 * and Classes are the player's screens). Both write messages. A route that is not rebuilt for the role is dropped
 * (`rebuiltHref`), so nothing here can lead to a notice in place of a screen.
 */
const ACTIONS: readonly ActionSpec[] = [
  { id: 'new-round', label: 'New round', icon: Flag, roles: ['player'], href: '/golf/dashboard/rounds/new', where: 'Rounds', keywords: ['start', 'track', 'play', 'score'] },
  { id: 'new-event', label: 'New event', icon: CalendarPlus, roles: ['coach'], href: '/golf/dashboard/calendar?new=1', where: 'Calendar', keywords: ['schedule', 'practice', 'meeting', 'add'] },
  { id: 'new-message', label: 'New message', icon: MessageSquarePlus, roles: ['coach', 'player'], href: MESSAGES, where: 'Messages', keywords: ['write', 'chat', 'send', 'dm'] },
  { id: 'post-announcement', label: 'Post announcement', icon: Megaphone, roles: ['coach'], href: '/golf/dashboard/team-hub?tab=ann', where: 'Team hub', keywords: ['announce', 'tell', 'team', 'new announcement'] },
  { id: 'new-qualifier', label: 'New qualifier', icon: Trophy, roles: ['coach'], href: '/golf/dashboard/qualifiers/new', where: 'Qualifiers', keywords: ['qualifying', 'tournament', 'create'] },
  { id: 'whats-new', label: 'What’s new', icon: Sparkles, roles: ['coach'], href: '/golf/dashboard/whats-new', where: 'CoachHelm', keywords: ['activity', 'updates', 'insights', 'patterns', 'focus areas', 'week', 'recent'] },
  { id: 'add-class', label: 'Add class', icon: GraduationCap, roles: ['player'], href: '/golf/dashboard/classes', where: 'Classes', keywords: ['course', 'schedule', 'timetable', 'school'] },
];

/** The actions a role is offered, in order. */
export function actionsFor(role: ChRole): ChCommand[] {
  return ACTIONS.flatMap((a): ChCommand[] => {
    if (!a.roles.includes(role)) return [];
    const href = rebuiltHref(a.href, role);
    return href ? [{ id: `action:${a.id}`, group: 'actions', label: a.label, href, icon: a.icon, keywords: a.keywords, detail: a.where }] : [];
  });
}

/** The sections a role has: its sidebar and Settings, as the shell lists them. */
export function sectionsFor(role: ChRole): ChNavItem[] {
  return [...navFor(role), CH_SETTINGS_ITEM];
}

function gotoCommand(item: ChNavItem, role: ChRole, group: 'goto' | 'recent'): ChCommand {
  const letter = letterFor(role, item.id);
  return {
    id: `${group}:${item.id}`,
    group,
    label: item.label,
    href: item.href,
    icon: item.icon,
    keys: letter ? ['G', letter.toUpperCase()] : undefined,
    keywords: ['go to', 'open', item.section ?? ''].filter(Boolean),
  };
}

/** A coach's players, each to their stats (the Roster's own face and name go there), for the roles that can open a player. */
export function peopleCommands(role: ChRole, people: readonly ChPerson[]): ChCommand[] {
  // A player's roster is read-only by design (nothing opens), so a teammate has nowhere to go and is not listed.
  if (role !== 'coach') return [];
  return people.flatMap((p): ChCommand[] => {
    const href = rebuiltHref(`/golf/dashboard/stats?player=${encodeURIComponent(p.id)}`, role);
    return href ? [{ id: `person:${p.id}`, group: 'people', label: p.name, href, icon: BarChart3, avatarName: p.name, detail: p.detail ?? 'Stats', keywords: ['player'] }] : [];
  });
}

export interface ChCommandInput {
  role: ChRole;
  pathname: string;
  people: readonly ChPerson[];
  recent: readonly ChRecent[];
}

/**
 * Everything the palette can show, for one person: Recent (the last five sections they were in, not this one), Go to,
 * People (a coach's players) and Actions. Pure, so what each role is offered is tested, not eyeballed.
 */
export function buildCommands({ role, pathname, people, recent }: ChCommandInput): ChCommand[] {
  const sections = sectionsFor(role);
  const here = activeNavItem(pathname.replace(/\/$/, '') || '/', role)?.id ?? (pathname.startsWith(CH_SETTINGS_ITEM.href) ? CH_SETTINGS_ITEM.id : undefined);
  const recents = recent
    .map((r) => sections.find((s) => s.id === r.id))
    .filter((s): s is ChNavItem => !!s && s.id !== here)
    .slice(0, 5)
    .map((s) => gotoCommand(s, role, 'recent'));
  // N starts a new event from Home, and only there (HomeActions): the key is drawn where it works.
  const onHome = (pathname.replace(/\/$/, '') || '/') === '/golf/dashboard';
  const actions = actionsFor(role).map((a) => (onHome && a.id === 'action:new-event' ? { ...a, keys: ['N'] } : a));
  return [...recents, ...sections.map((s) => gotoCommand(s, role, 'goto')), ...peopleCommands(role, people), ...actions];
}

/** The section that reads closest to a search, for "No results" to offer: the best word-start match, else the fewest edits. */
export function nearestSection(query: string, role: ChRole): ChNavItem | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  let best: { item: ChNavItem; score: number } | null = null;
  for (const item of sectionsFor(role)) {
    const label = item.label.toLowerCase();
    const words = label.split(/\s+/);
    // A shared start beats an edit distance: "rost" is Roster, "stat" is Stats.
    const prefix = words.some((w) => w.startsWith(q.slice(0, 2)) && q.length >= 2) ? 0.5 : 0;
    const d = Math.min(...words.map((w) => editDistance(q, w.slice(0, Math.max(q.length, 1)))), editDistance(q, label));
    const score = d - prefix;
    if (!best || score < best.score) best = { item, score };
  }
  // Too far from everything is no suggestion: three edits on a short word is a different word.
  return best && best.score <= Math.max(2, Math.ceil(q.length / 2)) ? best.item : null;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}
