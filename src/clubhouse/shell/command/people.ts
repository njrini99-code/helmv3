import { useSyncExternalStore } from 'react';
import type { ChPerson } from './commands';

/**
 * The players the palette can jump to. It asks nobody: a screen that has already loaded the team (the coach's Roster) hands
 * its players here, so the palette lists exactly what that coach already sees and no more. Held in memory only, and
 * dropped when the team changes: names are not written to storage, which sign-out does not clear.
 */
let scope: string | null = null;
let people: readonly ChPerson[] = [];
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

/** The team the palette is open for. A different team empties the list: the old team's names must not carry over. */
export function setPeopleScope(next: string | null): void {
  if (scope !== null && next !== scope && people.length) {
    people = [];
    emit();
  }
  scope = next;
}

/** A screen's loaded players. Replaces the list, so a removed player leaves with the next publish. */
export function publishPeople(next: readonly ChPerson[]): void {
  people = next;
  emit();
}

export function clearPeople(): void {
  people = [];
  emit();
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
