'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createTournamentFromCalendar } from '@/app/golf/actions/tournaments-calendar';
import { newRequestId } from '../../data/recruiting-shape';
import { haptic } from '../../lib/haptics';
import { plural } from '../../lib/plural';
import { useAction } from '../../lib/use-action';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Select';
import { Skeleton } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { LIVE_WRITES } from '../qualifiers/writes';
import { TournamentFields } from './fields/TournamentFields';
import { refusalNotice, type TournamentRefusal } from './fields/refusals';
import { initialTourState, receiptSentence, toCreatePayload, validate, type ChTourErrors, type ChTourState } from './fields/rounds-model';
import { TourCrumb, TourFailed, TourHead, TourLoading, TourMain, TourPhoneTop, tourGate, useTourPhone } from './parts';
import { useTourPaths } from './paths';
import { TourPlaceholder } from './TourPlaceholder';
import type { ChTourFormData, EventFormProps } from './types';
import '../../styles/tournament-fields.css';
import '../../styles/tournaments-lineup.css';

const TITLE_ID = 'ch-tour-form-title';
const NO_QUALIFIER = '';

/**
 * New event (plan 4.33, 5.2). The calendar editor's tournament section, on its own page: the same fields
 * (`TournamentFields`) and the same write (`createTournamentFromCalendar`, one calendar entry per round), so a
 * tournament made here and one made from the calendar are the same thing. Coach only; a full page on desktop and on
 * the phone. Editing an event is still the placeholder.
 */
export function EventForm({ data, load, phone: forced }: EventFormProps) {
  const phone = useTourPhone(forced);
  if (data.mode === 'edit') {
    return <TourPlaceholder view="form" eyebrow="Tournaments" title="Edit event" detail={`${data.initial.name || 'An event'} · ${plural(data.initial.rounds.length, 'round')}`} load={load} phone={forced} />;
  }
  return tourGate(load, {
    loading: () => (
      <TourLoading view="form" phone={phone} title="New event" className="ch-tour-lu-form">
        <Skeleton width="100%" height={52} radius={12} />
        <Skeleton width="100%" height={phone ? 420 : 360} radius={16} shape="solid" />
      </TourLoading>
    ),
    failed: () => <TourFailed view="form" phone={phone} id={TITLE_ID} eyebrow="Tournaments" title="New event" className="ch-tour-lu-form" />,
    ready: () => <NewEvent data={data} phone={phone} />,
  });
}

/** This page has no Track switch, so the course message says what to do here. */
const errorsFor = (s: ChTourState): ChTourErrors => {
  const e = validate(s);
  if (e.course) e.course = { code: e.course.code, text: 'Pick the course the team plays, or give each round its own.' };
  return e;
};

const FIELD_IDS: Array<[keyof ChTourErrors, string]> = [
  ['name', 'ch-tour-form-name'],
  ['days', 'ch-tfx-days'],
  ['course', 'ch-tfx-course'],
  ['rounds', 'ch-tfx-days'],
  ['counting', 'ch-tfx-counting'],
  ['resultsUrl', 'ch-tfx-results'],
];

function NewEvent({ data, phone }: { data: ChTourFormData; phone: boolean }) {
  const paths = useTourPaths();
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<ChTourState>(() => initialTourState(data.today, data.today, { name: data.fromCalendar?.title ?? '' }));
  const [qualifierId, setQualifierId] = useState(NO_QUALIFIER);
  const [touched, setTouched] = useState(false);
  const [said, setSaid] = useState('');
  const [note, setNote] = useState<{ code: string; text: string } | null>(null);
  // One request id per distinct payload: a second tap or a Retry after a lost reply replays the same save.
  const attempt = useRef<{ sig: string; id: string } | null>(null);

  const errors = errorsFor(state);
  const qualifier = data.qualifiers.find((q) => q.id === qualifierId) ?? null;

  const requestIdFor = (sig: string) => {
    if (attempt.current?.sig === sig) return attempt.current.id;
    attempt.current = { sig, id: newRequestId() };
    return attempt.current.id;
  };

  const save = useAction<[], unknown>(
    'tournaments.create',
    async () => {
      const payload = toCreatePayload(state, data.timezone, {
        teamId: data.teamId,
        requestId: '',
        requiresRsvp: false,
        attendeeIds: [],
        qualifierId: qualifierId || null,
      });
      const { requestId: _unused, ...signature } = payload;
      const res = await createTournamentFromCalendar({ ...payload, requestId: requestIdFor(JSON.stringify(signature)) });
      if (res.success) {
        setNote(null);
        haptic('success');
        const id = res.data.tournamentId;
        toast({ title: `${state.name.trim()} is set up in Tournaments`, code: 'CH-6040', action: { label: 'Open', run: () => router.push(paths.desk(id)) } });
        router.push(paths.desk(id));
      } else {
        const refusal = (res.code ?? 'failed') as TournamentRefusal;
        const n = refusalNotice(refusal, { save: 'create', name: state.name.trim() });
        haptic('error');
        setNote({ code: n.code, text: n.text });
        requestAnimationFrame(() => document.getElementById('ch-tour-form-error')?.focus());
      }
      return res;
    },
    { done: '', failed: `Couldn’t set up ${state.name.trim() || 'the event'}`, hint: 'Your changes are still on this page. Try again in a moment.', code: 'CH-6001' },
    // The page draws the outcome itself (the toast with Open, or the notice at the top), so the action stays quiet.
    (_result, c) => ({ ...c, quiet: true }),
  );

  const submit = async () => {
    setTouched(true);
    const first = FIELD_IDS.find(([k]) => errors[k]);
    if (first) {
      haptic('warning');
      document.getElementById(first[1])?.focus();
      return;
    }
    await save.run();
  };

  const back = paths.home();
  return (
    <TourMain view="form" phone={phone} labelledBy={TITLE_ID} className="ch-tour-lu-form">
      <TourPhoneTop phone={phone} title="New event" back={{ label: 'Tournaments', href: back }} />
      <TourHead
        id={TITLE_ID}
        phone={phone}
        eyebrow="Tournaments"
        title="New event"
        line="Name it, pick the days and the course. The team’s lineup comes next."
        crumb={phone ? undefined : <TourCrumb href={back} />}
      />
      <form
        className="ch-tour-lu-form__body"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {note && (
          <div className="ch-tfx-note ch-tfx-note--error" role="alert" tabIndex={-1} data-ch-code={note.code} id="ch-tour-form-error">
            <b>Couldn’t set up the tournament. Nothing was saved.</b>
            <span>{note.text}</span>
          </div>
        )}
        <div className="ch-tour-lu-form__name">
          <label htmlFor="ch-tour-form-name" className="ch-tour-lu-form__lbl">
            Name
          </label>
          <input
            id="ch-tour-form-name"
            className="ch-input ch-tour-lu-form__input"
            placeholder="Pinehurst Invitational"
            value={state.name}
            maxLength={120}
            aria-invalid={touched && !!errors.name}
            aria-describedby={touched && errors.name ? 'ch-tour-form-name-err' : undefined}
            onChange={(e) => setState({ ...state, name: e.target.value })}
          />
          {touched && errors.name && (
            <p id="ch-tour-form-name-err" className="ch-field__help is-error" data-ch-code={errors.name.code}>
              {errors.name.text}
            </p>
          )}
        </div>
        <section className="ch-tfx" aria-label="Tournament details">
          <TournamentFields state={state} onChange={setState} errors={errors} showErrors={touched} timezone={data.timezone} courseWrites={LIVE_WRITES} announce={setSaid} />
        </section>
        {data.qualifiers.length > 0 && (
          <div className="ch-tour-lu-form__qual">
            <label htmlFor="ch-tour-form-qual" className="ch-tour-lu-form__lbl">
              Qualifier
            </label>
            <Select
              id="ch-tour-form-qual"
              value={qualifierId}
              onChange={setQualifierId}
              options={[{ value: NO_QUALIFIER, label: 'None' }, ...data.qualifiers.map((q) => ({ value: q.id, label: q.status === 'open' ? `${q.name} (open)` : q.name }))]}
            />
          </div>
        )}
        <p className="ch-tour-lu-form__receipt">
          {receiptSentence({ state, convert: false, rsvp: false, qualifierName: qualifier?.name })}
        </p>
        <p className="ch-sr-only" role="status" aria-live="polite">
          {said}
        </p>
        <div className="ch-tour-lu-form__actions">
          <Button variant="secondary" href={back}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" busy={save.pending}>
            {save.pending ? 'Creating…' : 'Create tournament'}
          </Button>
        </div>
      </form>
    </TourMain>
  );
}
