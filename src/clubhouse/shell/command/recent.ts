import { phoneSectionFor, type ChRole } from '../nav';
import type { ChRecent } from './commands';

const KEY = 'ch.cmd.recent.v1';
/** Kept a step past the five the palette shows, so leaving out the section you are in still leaves five. */
const KEEP = 6;

/**
 * The sections a person has been in this tab, most recent first (sessionStorage, per person: the tab forgets them when it
 * closes, and they are section names, nothing about the team). A read or write that storage refuses (a private window)
 * just leaves the list as it was in memory for the page's life.
 */
let memory = new Map<string, ChRecent[]>();

function read(userId: string): ChRecent[] {
  const held = memory.get(userId);
  if (held) return held;
  try {
    const raw = window.sessionStorage.getItem(`${KEY}.${userId}`);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed)
      ? parsed.filter((r): r is ChRecent => !!r && typeof r.id === 'string' && typeof r.href === 'string').slice(0, KEEP)
      : [];
    memory.set(userId, list);
    return list;
  } catch {
    return [];
  }
}

export function readRecent(userId: string): ChRecent[] {
  return read(userId);
}

/** Notes the section an address belongs to as the person's latest; an address outside every section (a round, a qualifier form) is not a destination. */
export function noteVisit(userId: string, role: ChRole, pathname: string): ChRecent[] {
  const section = phoneSectionFor(pathname.replace(/\/$/, '') || '/', role);
  const current = read(userId);
  if (!section || current[0]?.id === section.id) return current;
  const next = [{ id: section.id, href: section.href }, ...current.filter((r) => r.id !== section.id)].slice(0, KEEP);
  memory.set(userId, next);
  try {
    window.sessionStorage.setItem(`${KEY}.${userId}`, JSON.stringify(next));
  } catch {
    /* kept in memory */
  }
  return next;
}

/** For tests: forget what the module holds. */
export function resetRecent(): void {
  memory = new Map();
}
