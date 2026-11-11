import { useSyncExternalStore } from 'react';
import { CH_EASE, CH_EASE_IO, CH_FADE_MS } from '../../lib/motion';

/**
 * The landing signal (docs/clubhouse/coachhelm-chat-v3/QUICK-CHAT.md, Moment 8): what the chat tells the page about a
 * thing it is making. In memory only, so a mark never comes back on reload. A screen's whole part is two attributes and
 * one element: `data-ch-row="<kind>:<id>"` on each row, `<LandingSlot kind />` where a new row would appear, and
 * optionally `data-ch-row-tag` on the element that may carry the "New" tag. Everything else is done here and in
 * `use-landing-driver.ts`.
 */
export type LandingKind = 'task' | 'event' | 'blocked_time' | 'focus_area' | 'announcement' | 'message' | 'qualifier' | 'trip' | 'recruit' | 'lineup' | 'plan';
/** `held`: not saved yet. `saved`: written, the page has not shown it. `landed`: its row is in the page. `undone` / `failed` / `late`: the slot is leaving. */
export type LandingPhase = 'held' | 'saved' | 'landed' | 'undone' | 'failed' | 'late';

export interface Landing {
  /** The card's idempotency key. */
  key: string;
  kind: LandingKind;
  /** The pathnames the thing lives on (the Team hub answers to several). */
  homes: readonly string[];
  /** The place in the coach's words: "Added to Tasks". */
  place: string;
  /** Its title, as the card shows it. */
  label: string;
  /** The saved row's id, once a receipt carries one (QUICK-CHAT.md request 1). */
  id: string | null;
  /** ISO day, for things that live on a date. */
  day: string | null;
  /** The player it belongs to, for things that live on one player's page (a focus area). */
  subject: string | null;
  phase: LandingPhase;
  heldUntil: string | null;
  /** `data-ch-row` values of this kind in the page when the hold began: the one that is new afterwards is the row. */
  before: readonly string[] | null;
  savedAt: number | null;
}

/**
 * Where each tool's thing lives. A stand-in for a `lands` object on the proposal (QUICK-CHAT.md request 3): the server
 * knows this better than a table of tool names does.
 */
export const LANDING_HOMES: Readonly<Record<string, { kind: LandingKind; homes: readonly string[]; place: string }>> = {
  create_task: { kind: 'task', homes: ['/golf/dashboard/team-hub', '/golf/dashboard/tasks', '/golf/dashboard/team'], place: 'Tasks' },
  create_goal: { kind: 'focus_area', homes: ['/golf/dashboard/stats', '/golf/dashboard/intelligence'], place: 'Focus areas' },
  create_event: { kind: 'event', homes: ['/golf/dashboard/calendar'], place: 'Calendar' },
  create_recurring_practice: { kind: 'event', homes: ['/golf/dashboard/calendar'], place: 'Calendar' },
  create_blocked_time: { kind: 'blocked_time', homes: ['/golf/dashboard/calendar'], place: 'Calendar' },
  create_team_announcement: { kind: 'announcement', homes: ['/golf/dashboard/team-hub', '/golf/dashboard/announcements', '/golf/dashboard/team'], place: 'Announcements' },
  create_announcement: { kind: 'announcement', homes: ['/golf/dashboard/team-hub', '/golf/dashboard/announcements', '/golf/dashboard/team'], place: 'Announcements' },
  send_message: { kind: 'message', homes: ['/golf/dashboard/messages'], place: 'Messages' },
  create_qualifier: { kind: 'qualifier', homes: ['/golf/dashboard/qualifiers'], place: 'Qualifiers' },
  create_trip: { kind: 'trip', homes: ['/golf/dashboard/team-hub', '/golf/dashboard/travel', '/golf/dashboard/team'], place: 'Travel' },
  create_recruit: { kind: 'recruit', homes: ['/golf/dashboard/recruiting'], place: 'Recruiting' },
};

/** How long a saved landing waits to be seen (the panel stayed open, or Open has not been pressed yet) before it is dropped. */
export const LANDING_UNSEEN_MS = 60_000;
/** The page has not shown the row this long after the save: read it once more. Twice this long: the slot leaves. */
export const LANDING_LATE_MS = 6_000;
/** The mark's whole life, the value of `--ch-dur-live` (tokens.css): in over the quick beat, held, gone at the end. */
export const LANDING_MARK_MS = 2_800;
const MARK_HOLD_UNTIL_MS = 1_200;

let landings: readonly Landing[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (next: readonly Landing[]) => {
  landings = next;
  emit();
};
const patch = (key: string, change: Partial<Landing>) => set(landings.map((l) => (l.key === key ? { ...l, ...change } : l)));
const drop = (key: string) => set(landings.filter((l) => l.key !== key));

export const getLandings = (): readonly Landing[] => landings;
export const subscribeLandings = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const NONE: readonly Landing[] = [];
export const useLandings = (): readonly Landing[] => useSyncExternalStore(subscribeLandings, getLandings, () => NONE);

const path = (href: string) => (href.split(/[?#]/)[0] ?? '').replace(/\/$/, '');
export const isLandingHome = (l: Pick<Landing, 'homes'>, pathname: string): boolean => l.homes.includes(path(pathname));

/** The hold began: the page may show where the thing will be. A tool with no home on any screen starts nothing. */
export function holdLanding(a: { key: string; tool: string; label: string; day?: string | null; subject?: string | null; heldUntil: string | null; before?: readonly string[] | null }): Landing | null {
  const home = LANDING_HOMES[a.tool];
  if (!home) return null;
  const landing: Landing = { key: a.key, kind: home.kind, homes: home.homes, place: home.place, label: a.label, id: null, day: a.day ?? null, subject: a.subject ?? null, phase: 'held', heldUntil: a.heldUntil, before: a.before ?? null, savedAt: null };
  set([...landings.filter((l) => l.key !== a.key), landing]);
  return landing;
}

/** The write is in. Also the way in for a receipt that was never held here (Ask's Open): it starts at `saved`. */
export function saveLanding(a: { key: string; tool?: string; label?: string; id?: string | null; day?: string | null; subject?: string | null; at?: number }): Landing | null {
  const at = a.at ?? Date.now();
  const had = landings.find((l) => l.key === a.key);
  if (had) {
    patch(a.key, { phase: 'saved', id: a.id ?? had.id, savedAt: at, heldUntil: null });
    return landings.find((l) => l.key === a.key) ?? null;
  }
  const home = a.tool ? LANDING_HOMES[a.tool] : undefined;
  if (!home) return null;
  const landing: Landing = { key: a.key, kind: home.kind, homes: home.homes, place: home.place, label: a.label ?? '', id: a.id ?? null, day: a.day ?? null, subject: a.subject ?? null, phase: 'saved', heldUntil: null, before: null, savedAt: at };
  set([...landings, landing]);
  return landing;
}
/** For a receipt opened from Ask: the destination marks the row as it would for quick chat. */
export const announceLanding = saveLanding;

/** Its row is in the page: the slot is gone from this instant. The record stays until the mark has played. */
export const landLanding = (key: string): void => patch(key, { phase: 'landed' });

/** Undo, a failed write, or a row that never showed: the slot leaves over the quick beat, then the record goes. */
export function endLanding(key: string, how: 'undone' | 'failed' | 'late'): void {
  if (!landings.some((l) => l.key === key)) return;
  patch(key, { phase: how });
  setTimeout(() => drop(key), CH_FADE_MS);
}
export const forgetLanding = drop;
/** Tests only. */
export const resetLandings = (): void => set([]);

// --- the page's side, done for it -------------------------------------------------------------------------------

const rowSelector = (kind: LandingKind) => `[data-ch-row^="${kind}:"]`;

/** The `data-ch-row` values of one kind in the page now. */
export function rowKeys(root: ParentNode, kind: LandingKind): string[] {
  return [...root.querySelectorAll<HTMLElement>(rowSelector(kind))].map((el) => el.dataset.chRow ?? '');
}

/**
 * The landing's row, or null. By id when the receipt gave one. Otherwise the one row of its kind that was not there
 * when the hold began; with no such snapshot (Open from another page), the one row of its kind whose words include the
 * title. Two candidates is no candidate: a wrong mark is worse than none.
 */
export function findLandedRow(root: ParentNode, l: Pick<Landing, 'kind' | 'id' | 'label' | 'before'>): HTMLElement | null {
  const rows = [...root.querySelectorAll<HTMLElement>(rowSelector(l.kind))];
  if (l.id) return rows.find((el) => el.dataset.chRow === `${l.kind}:${l.id}`) ?? null;
  const fresh = l.before ? rows.filter((el) => !l.before!.includes(el.dataset.chRow ?? '')) : rows;
  if (l.before && fresh.length === 1) return fresh[0]!;
  const label = l.label.trim().toLowerCase();
  if (!label) return null;
  const named = fresh.filter((el) => (el.textContent ?? '').toLowerCase().includes(label));
  return named.length === 1 ? named[0]! : null;
}

/** Whether any part of the row is inside the comfort band: from under the bar to above the dock, 16px in from each. */
export function inComfortBand(rect: { top: number; bottom: number }, band: { top: number; bottom: number }): boolean {
  return rect.bottom > band.top + 16 && rect.top < band.bottom - 16;
}

/** The band of the window a row can be seen in: under the top bar, above the phone's dock. */
export function comfortBand(doc: Document = document): { top: number; bottom: number } {
  const bar = doc.querySelector('.ch-topbar')?.getBoundingClientRect().bottom ?? 0;
  const dock = doc.querySelector<HTMLElement>('.ch-dock:not([hidden])');
  const height = doc.defaultView?.innerHeight ?? 0;
  return { top: Math.max(0, bar), bottom: dock ? Math.min(height, dock.getBoundingClientRect().top) : height };
}

/** MO-8-3: the shortest move that centres the row, once, and only when it is outside the band. */
export function bringIntoView(el: HTMLElement, reduced: boolean): boolean {
  if (inComfortBand(el.getBoundingClientRect(), comfortBand(el.ownerDocument))) return false;
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  return true;
}

const bez = (c: readonly number[]) => `cubic-bezier(${c.join(',')})`;

/**
 * MO-8-2: the mark. A tint layer over the row and, where the row allows one, a "New" tag: opacity only, in over the
 * quick beat, held, gone at `--ch-dur-live`. Both are this file's own nodes, appended to the row and removed when the
 * effect ends, so the row is an ordinary row again. Animations off: the same mark, still, for the same time.
 */
export function markRow(row: HTMLElement, mode: 'full' | 'fade' | 'off' = 'full'): () => void {
  row.querySelectorAll(':scope > .ch-landmark, .ch-landtag').forEach((n) => n.remove());
  const tint = row.ownerDocument.createElement('i');
  tint.className = 'ch-landmark';
  tint.setAttribute('aria-hidden', 'true');
  row.setAttribute('data-ch-landed', getComputedStyle(row).position === 'static' ? 'static' : '');
  row.appendChild(tint);
  const host = row.matches('[data-ch-row-tag]') ? row : row.querySelector<HTMLElement>('[data-ch-row-tag]');
  let tag: HTMLElement | null = null;
  if (host) {
    tag = row.ownerDocument.createElement('span');
    tag.className = 'ch-badge ch-badge--positive ch-landtag';
    tag.setAttribute('aria-hidden', 'true');
    tag.textContent = 'New';
    host.appendChild(tag);
  }
  let done = false;
  const clear = () => {
    if (done) return;
    done = true;
    tint.remove();
    tag?.remove();
    row.removeAttribute('data-ch-landed');
  };
  const frames: Keyframe[] = [
    { opacity: 0, easing: bez(CH_EASE) },
    { opacity: 1, offset: CH_FADE_MS / LANDING_MARK_MS },
    { opacity: 1, offset: MARK_HOLD_UNTIL_MS / LANDING_MARK_MS, easing: bez(CH_EASE_IO) },
    { opacity: 0 },
  ];
  if (mode === 'off' || !tint.animate) {
    tint.style.opacity = '1';
    setTimeout(clear, LANDING_MARK_MS);
    return clear;
  }
  const a = tint.animate(frames, { duration: LANDING_MARK_MS, fill: 'both' });
  tag?.animate(frames, { duration: LANDING_MARK_MS, fill: 'both' });
  a.onfinish = clear;
  a.oncancel = clear;
  return clear;
}
