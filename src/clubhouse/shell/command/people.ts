import { useSyncExternalStore } from 'react';
import type { ChPerson } from './commands';

/**
 * The players the palette can jump to, from two places. The shell hands a coach's names and ids, loaded with the shell
 * data, so People works before Roster has been opened (owner, decision 16: `seedPeople`). A screen that has loaded the
 * team itself (the coach's Roster) hands its fuller rows (`publishPeople`), which take precedence over the seed. Either
 * way it is only what that coach already sees. Held in memory only, and dropped when the team or the signed-in person
 * changes (`setPeopleScope`) and when the frame unmounts, as the idle timeout's sign-out navigates to login
 * (CommandLayer, `clearPeople`): names are never written to storage, which sign-out does not clear.
 */
let scope: string | null = null;
/** The shell's names and ids. */
let base: readonly ChPerson[] = [];
/** A screen's own list; null until one publishes. */
let published: readonly ChPerson[] | null = null;
let people: readonly ChPerson[] = [];
const listeners = new Set<() => void>();

const settle = () => {
  const next = published ?? base;
  if (next === people) return;
  people = next;
  listeners.forEach((l) => l());
};

/**
 * Who and which team the palette is open for. A different one empties both lists: the old team's names (or the last
 * person's) must not carry over.
 */
export function setPeopleScope(next: string | null): void {
  if (scope !== null && next !== scope) {
    base = [];
    published = null;
    settle();
  }
  scope = next;
}

/** The shell's names and ids (decision 16). A screen's published list still wins while there is one. */
export function seedPeople(next: readonly ChPerson[]): void {
  base = next;
  settle();
}

/** A screen's loaded players. Replaces the list, so a removed player leaves with the next publish. */
export function publishPeople(next: readonly ChPerson[]): void {
  published = next;
  settle();
}

export function clearPeople(): void {
  base = [];
  published = null;
  settle();
}

export function usePeople(): readonly ChPerson[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => people,
    () => people,
  );
}
