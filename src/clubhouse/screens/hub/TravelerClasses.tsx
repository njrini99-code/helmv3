'use client';

import { TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { checkKey, clashSummary, type ChTravelerClass, type ChTripWindow } from '../../data/hub-shape';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { chReport } from '../../lib/track';
import { isOffline, normalise } from '../../lib/use-action';
import type { ChHubWrites } from './writes';

/*
 * Plan a trip, Travelers step (and the Itinerary summary): which of the chosen travelers have a class during the trip.
 * The check is a read that never blocks a trip: Publish doesn't wait for it, and a read that didn't run says so (CH-10212)
 * rather than looking like "no classes" (CH-10315). Only the chosen travelers' classes that overlap the trip's dates are
 * read, and only the class (its name, weekdays and hours) reaches the page.
 */

export type ChClassCheck =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ready'; classes: ChTravelerClass[]; partial: boolean }
  | { status: 'failed' };

/** How long the chosen travelers settle before the check is asked: a run of taps on player chips is one question. */
const SETTLE_MS = 350;

/**
 * Asks `read` for the chosen travelers' classes inside `span`, again whenever the travelers or the dates change, and
 * ignores an answer that is no longer the question on screen. `null` for `span` or no `travelers` means there is nothing to ask.
 */
export function useClassCheck(read: ChHubWrites['travelerClasses'], teamId: string, travelers: string[], span: ChTripWindow | null) {
  const [state, setState] = useState<{ key: string; result: ChClassCheck } | null>(null);
  const [again, setAgain] = useState(0);
  const latest = useRef({ read, travelers, span });
  // What the timer below asks is what is on screen when it fires, not what was when it was set.
  useEffect(() => {
    latest.current = { read, travelers, span };
  });
  const key = span && travelers.length > 0 ? checkKey(teamId, travelers, span) : null;
  // The question last answered in full (and which Try again it was): the same one is not asked twice, so going on to the next
  // step and back, where nothing changed, shows the answer it already has.
  const answered = useRef<string | null>(null);

  useEffect(() => {
    if (!key) return;
    if (answered.current === `${key}#${again}`) return;
    if (isOffline()) {
      setState({ key, result: { status: 'failed' } });
      return;
    }
    let live = true;
    setState({ key, result: { status: 'checking' } });
    const timer = window.setTimeout(async () => {
      const { read: ask, travelers: ids, span: dates } = latest.current;
      if (!dates) return;
      try {
        const res = normalise(await ask({ teamId, playerIds: ids, ...dates }));
        if (!live) return;
        if (!res.success || !res.data) {
          chReport(new Error(res.success ? 'class check returned no data' : (res.error ?? 'class check failed')), { surface: 'hub.travelerClasses', action: 'hub.travelerClasses', severity: 'low' });
          setState({ key, result: { status: 'failed' } });
          return;
        }
        answered.current = `${key}#${again}`;
        setState({ key, result: { status: 'ready', classes: res.data.classes, partial: res.data.partial } });
      } catch (err) {
        chReport(err, { surface: 'hub.travelerClasses', action: 'hub.travelerClasses' });
        if (live) setState({ key, result: { status: 'failed' } });
      }
    }, SETTLE_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [key, teamId, again]);

  // An answer for another question is not shown as this one's.
  const check: ChClassCheck = key && state && state.key === key ? state.result : key ? { status: 'checking' } : { status: 'idle' };
  return { check, retry: useCallback(() => setAgain((n) => n + 1), []) };
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * The board's clash row ("Eli has CHEM 102 lab Mon 3:00–4:15. They'd miss it to travel."), a line for each traveler with a
 * class (three at most, the rest counted), or what else the check can say: it is running (CH-10407), it did not run
 * (CH-10212), or nobody chosen has a class during the trip (CH-10315). The region stays mounted so a change is announced.
 */
export function ClassClashes({ check, names, onRetry }: { check: ChClassCheck; names: ReadonlyMap<string, string>; onRetry: () => void }) {
  const summary = check.status === 'ready' ? clashSummary(check.classes, names) : null;
  const clashes = summary && summary.lines.length > 0 ? summary : null;
  const partial = check.status === 'ready' && check.partial;
  return (
    <div className="ch-hb-clashes" aria-live="polite">
      {check.status === 'checking' && (
        <p className="ch-field__help" data-ch-code="CH-10407">
          Checking their classes…
        </p>
      )}
      {clashes && (
        <div className="ch-hb-clash" data-ch-code="CH-10110">
          <Icon icon={TriangleAlert} size={15} />
          <div>
            {clashes.lines.map((l) => (
              <p key={l.playerId}>
                <b>{l.who}</b> {l.when}
                {l.more > 0 ? ` and ${l.more} more ${plural(l.more, 'class', 'classes')}` : ''}.
              </p>
            ))}
            {clashes.moreTravelers > 0 && (
              <p>
                {clashes.moreTravelers} more {plural(clashes.moreTravelers, 'traveler also has', 'travelers also have')} a class during the trip.
              </p>
            )}
            <p>{clashes.total === 1 ? 'They’d miss it to travel.' : 'They’d miss these to travel.'}</p>
          </div>
        </div>
      )}
      {(check.status === 'failed' || partial) && (
        <div className="ch-hb-roster" data-ch-code="CH-10212">
          <span className="ch-field__help is-error">
            {check.status === 'failed' ? 'Couldn’t check the travelers’ classes, so one may clash.' : 'Some classes couldn’t be checked, so one more may clash.'} Publishing still works.
          </span>
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
      {check.status === 'ready' && !partial && !clashes && (
        <p className="ch-field__help" data-ch-code="CH-10315">
          No class meets during the trip for the travelers chosen.
        </p>
      )}
    </div>
  );
}
