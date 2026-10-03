'use client';

import { Pencil } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import type { ChHubTrip } from '../../data/hub';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { haptic } from '../../lib/haptics';
import { normalise, useAction } from '../../lib/use-action';
import { Field, TRANSPORTS } from './sheets';
import type { ChHubWrites, ChTripEdit, ChTripInput } from './writes';

type Draft = Omit<ChTripEdit, 'id'>;

const asTransport = (t: string | null): ChTripInput['transport'] | null => TRANSPORTS.find(([k]) => k === t)?.[0] ?? null;

/** The trip as the page has it. */
const draftOf = (t: ChHubTrip | null): Draft => ({
  name: t?.name ?? '',
  destination: t?.destination ?? '',
  transport: asTransport(t?.transport ?? null),
  departDate: t?.departDate ?? '',
  departTime: t?.departTime ?? '',
  from: t?.from ?? '',
  returnDate: t?.returnDate ?? '',
  returnTime: t?.returnTime ?? '',
  hotel: t?.hotel ?? '',
  notes: t?.notes ?? '',
});

/**
 * Edit a trip (the coach's): the same fields as Plan a trip, over the trip as saved, dates and times included, so a
 * wrong day or hour can be fixed. Who travels comes from the trip's calendar event and is changed in Calendar, not here.
 * A save that fails keeps what was typed; the sheet closes only when the save lands.
 */
export function TripEditSheet({
  trip,
  onClose,
  write,
  onDone,
}: {
  /** The trip being edited; null while the sheet is closed. */
  trip: ChHubTrip | null;
  onClose: () => void;
  write: ChHubWrites['editTrip'];
  /** After a trip is saved: the page reads again. */
  onDone: () => void;
}) {
  const id = useId();
  const open = trip != null;
  // Keep the last trip while the sheet closes, so it doesn't change shape on the way out.
  const [last, setLast] = useState<ChHubTrip | null>(trip);
  const [v, setV] = useState<Draft>(() => draftOf(trip));
  const [tried, setTried] = useState(false);
  if (trip && trip !== last) {
    setLast(trip);
    setV(draftOf(trip));
    setTried(false);
  }
  const t = trip ?? last;

  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setV((cur) => ({ ...cur, [k]: e.target.value }));
  const errs = {
    name: tried && v.name.trim().length < 3 ? 'Name the trip, at least three characters.' : null,
    destination: tried && !v.destination.trim() ? 'Where is the team going?' : null,
    departDate: tried && !v.departDate ? 'Pick the day the team leaves.' : null,
    returnDate: tried && v.returnDate && v.departDate && v.returnDate < v.departDate ? 'The return can’t be before the departure.' : null,
  };
  const invalid = v.name.trim().length < 3 || !v.destination.trim() || !v.departDate || (!!v.returnDate && v.returnDate < v.departDate);

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
    (input) => ({ done: `${input.name} updated`, failed: `Couldn’t update ${input.name || 'the trip'}`, hint: 'What you entered is still here.', code: 'CH-10013' }),
  );

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!t) return;
    setTried(true);
    if (invalid) {
      haptic('warning');
      return;
    }
    void save.run({ id: t.id, ...v });
  };

  const input = (k: 'name' | 'destination' | 'departDate' | 'departTime' | 'from' | 'returnDate' | 'returnTime' | 'hotel', label: string, type = 'text', err?: string | null, code?: string) => (
    <Field label={label} id={`${id}-${k}`} error={err} errorCode={code}>
      <input id={`${id}-${k}`} className="ch-input" type={type} value={v[k]} onChange={set(k)} aria-invalid={!!err} aria-describedby={err ? `${id}-${k}-err` : undefined} />
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
          {input('departTime', 'At', 'time')}
        </div>
        {input('from', 'From')}
        <div className="ch-hb-2">
          {input('returnDate', 'Back', 'date', errs.returnDate, 'CH-10106')}
          {input('returnTime', 'At', 'time')}
        </div>
        {input('hotel', 'Hotel (optional)')}
        <Field label="Itinerary for the players (optional)" id={`${id}-notes`}>
          <textarea id={`${id}-notes`} className="ch-textarea" rows={4} value={v.notes} onChange={set('notes')} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
