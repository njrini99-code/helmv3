'use client';

import { Pencil } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import type { ChHubTrip } from '../../data/hub';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { haptic } from '../../lib/haptics';
import { chReport } from '../../lib/track';
import { normalise, useAction } from '../../lib/use-action';
import { Field, TRANSPORTS } from './sheets';
import type { ChHubWrites, ChTripEdit, ChTripInput } from './writes';

type Draft = {
  name: string;
  destination: string;
  transport: ChTripInput['transport'] | null;
  departDate: string;
  from: string;
  hotel: string;
  notes: string;
  departTime: string;
  returnDate: string;
  returnTime: string;
};

const asTransport = (t: string | null): Draft['transport'] => TRANSPORTS.find(([k]) => k === t)?.[0] ?? null;

/** What the page already knows of the trip; the times come from a read of their own. */
const draftOf = (t: ChHubTrip | null): Draft => ({
  name: t?.name ?? '',
  destination: t?.destination ?? '',
  transport: asTransport(t?.transport ?? null),
  departDate: t?.departDate ?? '',
  from: t?.from ?? '',
  hotel: t?.hotel ?? '',
  notes: t?.notes ?? '',
  departTime: '',
  returnDate: '',
  returnTime: '',
});

/**
 * Edit a trip (the coach's): the same fields as Plan a trip, over the trip as saved. The page carries the departure
 * time, return date and return time only as words, so they are read when the sheet opens (`readTimes`); until they
 * have, they can't be edited, and a read that fails leaves them as they are rather than sending them blank (which would
 * clear them). Who travels comes from the trip's calendar event and is changed in Calendar, not here. A save that
 * fails keeps what was typed; it closes only when the save lands.
 */
export function TripEditSheet({
  trip,
  onClose,
  write,
  readTimes,
  onDone,
}: {
  /** The trip being edited; null while the sheet is closed. */
  trip: ChHubTrip | null;
  onClose: () => void;
  write: NonNullable<ChHubWrites['editTrip']>;
  readTimes: NonNullable<ChHubWrites['tripTimes']>;
  /** After a trip is saved: the page reads again. */
  onDone: () => void;
}) {
  const id = useId();
  const open = trip != null;
  // Keep the last trip while the sheet closes, so it doesn't change shape on the way out.
  const [last, setLast] = useState<ChHubTrip | null>(trip);
  const [v, setV] = useState<Draft>(() => draftOf(trip));
  const [times, setTimes] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [tried, setTried] = useState(false);
  if (trip && trip !== last) {
    setLast(trip);
    setV(draftOf(trip));
    setTimes('loading');
    setTried(false);
  }
  const t = trip ?? last;

  useEffect(() => {
    if (!trip) return;
    let live = true;
    setTimes('loading');
    readTimes(trip.id)
      .then((res) => {
        if (!live) return;
        const read = normalise(res);
        if (read.success && read.data) {
          setV((cur) => ({ ...cur, ...read.data }));
          setTimes('ready');
          return;
        }
        chReport(new Error(('error' in read && read.error) || 'trip times read failed'), { surface: 'hub.editTrip', action: 'readTimes', severity: 'low' });
        setTimes('failed');
      })
      .catch((err) => {
        if (!live) return;
        chReport(err, { surface: 'hub.editTrip', action: 'readTimes' });
        setTimes('failed');
      });
    return () => {
      live = false;
    };
  }, [trip, readTimes, attempt]);

  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setV((cur) => ({ ...cur, [k]: e.target.value }));
  const known = times === 'ready';
  const errs = {
    name: tried && v.name.trim().length < 3 ? 'Name the trip, at least three characters.' : null,
    destination: tried && !v.destination.trim() ? 'Where is the team going?' : null,
    departDate: tried && !v.departDate ? 'Pick the day the team leaves.' : null,
    returnDate: tried && known && v.returnDate && v.departDate && v.returnDate < v.departDate ? 'The return can’t be before the departure.' : null,
  };
  const invalid = v.name.trim().length < 3 || !v.destination.trim() || !v.departDate || (known && !!v.returnDate && v.returnDate < v.departDate);

  // What follows a landed save (the close and the page's re-read) is inside the action, so the toast's Retry does it too.
  const save = useAction(
    'hub.editTrip',
    async (input: ChTripEdit) => {
      const res = await write(input);
      if (normalise(res).success) {
        onClose();
        onDone();
      }
      return res;
    },
    (input) => ({ done: `${input.name} updated`, failed: `Couldn’t update ${input.name || 'the trip'}`, hint: 'What you entered is still here.' }),
  );

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!t) return;
    setTried(true);
    if (invalid) {
      haptic('warning');
      return;
    }
    void save.run({
      id: t.id,
      name: v.name,
      destination: v.destination,
      transport: v.transport,
      departDate: v.departDate,
      from: v.from,
      hotel: v.hotel,
      notes: v.notes,
      // Only what has been read goes back: a blank here would clear the trip's own.
      ...(known ? { departTime: v.departTime, returnDate: v.returnDate, returnTime: v.returnTime } : {}),
    });
  };

  const input = (k: keyof Draft, label: string, type = 'text', err?: string | null, code?: string, disabled?: boolean) => (
    <Field label={label} id={`${id}-${k}`} error={err} errorCode={code}>
      <input id={`${id}-${k}`} className="ch-input" type={type} value={v[k] ?? ''} disabled={disabled} onChange={set(k)} aria-invalid={!!err} aria-describedby={err ? `${id}-${k}-err` : undefined} />
    </Field>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Pencil}
      title="Edit trip"
      description={t ? `${t.name}${t.dates ? ` · ${t.dates}` : ''}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.pending}>
            Cancel
          </Button>
          <Button variant="primary" disabled={save.pending} feel={null} onClick={() => submit()}>
            {save.pending ? 'Saving' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form className="ch-hb-form" onSubmit={submit} noValidate>
        {input('name', 'Trip', 'text', errs.name, 'CH-10103')}
        {input('destination', 'Where', 'text', errs.destination, 'CH-10104')}
        <div className="ch-field">
          <span className="ch-field__label">Getting there</span>
          <div className="ch-hb-aud" role="radiogroup" aria-label="Getting there">
            {TRANSPORTS.map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={v.transport === k}
                onClick={() => {
                  haptic('select');
                  setV((cur) => ({ ...cur, transport: k }));
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="ch-hb-2">
          {input('departDate', 'Leaves', 'date', errs.departDate, 'CH-10105')}
          {input('departTime', 'At', 'time', null, undefined, !known)}
        </div>
        {input('from', 'From')}
        <div className="ch-hb-2">
          {input('returnDate', 'Back', 'date', errs.returnDate, 'CH-10106', !known)}
          {input('returnTime', 'At', 'time', null, undefined, !known)}
        </div>
        {times === 'failed' && (
          <span className="ch-field__help is-error ch-hb-retryline" role="alert">
            The times didn’t load, so they stay as they are. Save changes the rest.
            <Button size="sm" variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </span>
        )}
        {input('hotel', 'Hotel (optional)')}
        <Field label="Itinerary for the players (optional)" id={`${id}-notes`}>
          <textarea id={`${id}-notes`} className="ch-textarea" rows={4} value={v.notes} onChange={set('notes')} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
