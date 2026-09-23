/**
 * The tee a player just picked for a new round, kept outside React state.
 *
 * Before a round is persisted (`persistRoundStart`) nothing about the setup
 * screen exists anywhere but component state and refs. A document reload at
 * that moment — WKWebView reloads the page after a content-process kill,
 * the boot recovery script replaces the document for a stale asset — remounts
 * `NewRoundClient` with an empty form and, because nothing is chosen, the
 * course picker auto-opens again. To the player that is "I picked the course
 * and the tee, it loaded, then it reset to the course screen", with no error
 * anywhere (UNCW, Oviinbyrd GC, 2026-09-17).
 *
 * This keeps the `TeeRoundDefaults` the picker handed over, per player, in
 * localStorage (sessionStorage does not survive an app relaunch). It is a
 * setup-stage convenience only: the emergency-save / recovery machinery still
 * owns anything with shots in it, and this record is dropped the moment a
 * round is persisted or the player clears the course.
 */

import type { TeeRoundDefaults } from '@/app/golf/actions/course-library';

const KEY_PREFIX = 'golf-new-round-pick:';
const VERSION = 1;
/** A pick older than this is stale — the player has plainly moved on. */
export const PENDING_PICK_TTL_MS = 12 * 60 * 60 * 1000;

export interface PendingTeePick {
  v: number;
  ts: number;
  defaults: TeeRoundDefaults;
}

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

const keyFor = (playerId: string) => `${KEY_PREFIX}${playerId}`;

export function savePendingTeePick(playerId: string, defaults: TeeRoundDefaults): void {
  const store = storage();
  if (!store) return;
  try {
    const record: PendingTeePick = { v: VERSION, ts: Date.now(), defaults };
    store.setItem(keyFor(playerId), JSON.stringify(record));
  } catch {
    // Quota / private mode — the pick simply will not survive a reload.
  }
}

export function loadPendingTeePick(playerId: string, now: number = Date.now()): TeeRoundDefaults | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(keyFor(playerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingTeePick> | null;
    if (
      !parsed ||
      parsed.v !== VERSION ||
      typeof parsed.ts !== 'number' ||
      now - parsed.ts > PENDING_PICK_TTL_MS ||
      !parsed.defaults ||
      typeof parsed.defaults.teeId !== 'string' ||
      typeof parsed.defaults.courseId !== 'string' ||
      typeof parsed.defaults.courseName !== 'string' ||
      !Array.isArray(parsed.defaults.holes)
    ) {
      store.removeItem(keyFor(playerId));
      return null;
    }
    return parsed.defaults;
  } catch {
    return null;
  }
}

export function clearPendingTeePick(playerId: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(keyFor(playerId));
  } catch {
    // nothing to do
  }
}
