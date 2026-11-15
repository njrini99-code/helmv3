'use client';

/**
 * Which team each quick chat began on, kept in this browser (coach audit, 13 Nov 2026: with Guilford active, ⌘J opened a Demo
 * University thread). The conversations table has no team, so a thread with no team on record here is never picked up again:
 * it opens fresh. Entries older than a day are dropped as new ones are written.
 */
const KEY = 'ch.qc.teams';
const KEEP_MS = 24 * 60 * 60_000;

/** How recently a thread must have been touched to be picked up again; older ones open fresh (Nick to confirm the 30). */
export const QC_RESTORE_MS = 30 * 60_000;

type Entry = { team: string; at: number };

function read(): Record<string, Entry> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Entry>) : {};
  } catch {
    return {};
  }
}

export function rememberQcTeam(conversationId: string, teamId: string, now: number = Date.now()): void {
  try {
    const all = read();
    const kept = Object.fromEntries(Object.entries(all).filter(([, e]) => e && typeof e.at === 'number' && now - e.at < KEEP_MS));
    kept[conversationId] = { team: teamId, at: now };
    window.localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Private mode or storage off: the thread simply won't be picked up again.
  }
}

export function qcTeamOf(conversationId: string): string | null {
  const e = read()[conversationId];
  return e && typeof e.team === 'string' ? e.team : null;
}
