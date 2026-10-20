import type { TravelerClass } from '@/app/golf/actions/travel';
import type { ChHubTripEvent } from './hub';

/*
 * Team Hub's trip builder, the parts that are plain functions: the dates a trip covers and the warning about a traveler's
 * classes during them. No server code here, so the client sheet and the tests use it as it is (like classes-shape.ts).
 */

export type ChTravelerClass = TravelerClass;

/** The days a trip covers, inclusive, in the team's zone; a time narrows the first or last day. */
export interface ChTripWindow {
  fromDate: string;
  toDate: string;
  fromTime: string | null;
  toTime: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/**
 * What the coach has typed, or else what the trip's calendar event says. The Travelers step comes before Logistics, so at
 * first only the event gives dates (its whole span, for a tournament that runs several days); once the coach types a
 * departure and a return, those rule. A return before the departure is ignored until it is fixed. A departure time narrows
 * the first day (a class that ended before the bus left is not missed), and a return time narrows the last, but only when
 * a return date was typed too: a time alone belongs to no day.
 */
export function tripWindow(
  typed: { departDate: string; departTime: string; returnDate: string; returnTime: string },
  event: Pick<ChHubTripEvent, 'date' | 'endDate'> | null,
): ChTripWindow | null {
  const fromDate = DATE.test(typed.departDate) ? typed.departDate : (event?.date ?? '');
  if (!DATE.test(fromDate)) return null;
  const typedReturn = DATE.test(typed.returnDate) && typed.returnDate >= fromDate ? typed.returnDate : null;
  const toDate = typedReturn ?? (event && DATE.test(event.endDate) && event.endDate >= fromDate ? event.endDate : fromDate);
  return {
    fromDate,
    toDate,
    fromTime: DATE.test(typed.departDate) && TIME.test(typed.departTime) ? typed.departTime : null,
    toTime: typedReturn && TIME.test(typed.returnTime) ? typed.returnTime : null,
  };
}

/** What one check was asked: a new key means the answer on screen is stale. */
export function checkKey(teamId: string, playerIds: string[], w: ChTripWindow): string {
  return [teamId, [...playerIds].sort().join(','), w.fromDate, w.toDate, w.fromTime ?? '', w.toTime ?? ''].join('|');
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export interface ChClashLine {
  playerId: string;
  /** "Eli has CHEM 102 lab" */
  who: string;
  /** "Mon 3:00–4:15 PM", or "Mon, Wed 3:00–4:15 PM" */
  when: string;
  /** Classes beyond the first one named on this line. */
  more: number;
}

export interface ChClashSummary {
  lines: ChClashLine[];
  /** Travelers past the lines shown, who also have a class during the trip. */
  moreTravelers: number;
  /** Every class meeting group found, for the closing sentence. */
  total: number;
}

/** At most this many travelers are named; the rest are counted. */
export const CLASH_LINES = 3;

/**
 * One line per traveler with a class during the trip, in the order the coach's roster lists them: their first class by
 * name, and how many more they have. `names` is the roster (id to full name); a traveler the roster doesn't know is left
 * out, since the line could name no one. First names only, as on the board.
 */
export function clashSummary(classes: ChTravelerClass[], names: ReadonlyMap<string, string>): ChClashSummary {
  const byPlayer = new Map<string, ChTravelerClass[]>();
  for (const c of classes) {
    if (!names.has(c.playerId)) continue;
    byPlayer.set(c.playerId, [...(byPlayer.get(c.playerId) ?? []), c]);
  }
  const order = [...names.keys()].filter((id) => byPlayer.has(id));
  const lines = order.slice(0, CLASH_LINES).map((playerId) => {
    const [first, ...rest] = byPlayer.get(playerId)!;
    return {
      playerId,
      who: `${firstName(names.get(playerId)!)} has ${first!.title}`,
      when: `${first!.days.join(', ')} ${first!.time}`,
      more: rest.length,
    };
  });
  return { lines, moreTravelers: Math.max(0, order.length - CLASH_LINES), total: order.reduce((n, id) => n + byPlayer.get(id)!.length, 0) };
}
