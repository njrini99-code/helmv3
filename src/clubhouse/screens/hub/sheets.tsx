'use client';

import { ArrowRight, Check, FileText, Megaphone, Paperclip, Pencil, Plane, SquareCheck, TriangleAlert, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { ChHubAnnouncement, ChHubFile, ChTeamHub } from '../../data/hub';
import { tripWindow } from '../../data/hub-shape';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/Toast';
import { haptic } from '../../lib/haptics';
import { useChPhone } from '../../lib/use-phone';
import { normalise, useAction } from '../../lib/use-action';
import { ClassClashes, useClassCheck } from './TravelerClasses';
import type { ChHubWrites, ChTripInput } from './writes';
import { radioKeys, rovingRadios } from './radio';

/*
 * Team Hub's forms, each a Modal (a bottom sheet on the phone). A form keeps
 * what was typed when a save fails: it closes only when its save lands.
 * Each form owns its action, and what follows a landed save (clear the form,
 * close the sheet, refresh the page) is inside that action: the error toast's
 * Retry re-runs the action and nothing else, so a Retry that lands finishes
 * the job the same way the first press would have.
 */

/** A labelled field. `optional` adds the shared Optional tag (controls.css); a refused save's message is read out at once. */
export function Field({
  label,
  error,
  errorCode,
  children,
  id,
  optional = false,
}: {
  label: string;
  error?: string | null;
  errorCode?: string;
  children: ReactNode;
  id: string;
  optional?: boolean;
}) {
  return (
    <div className="ch-field">
      <label className="ch-field__label" htmlFor={id}>
        {label}
        {optional && (
          <>
            {' '}
            <span className="ch-field__opt">Optional</span>
          </>
        )}
      </label>
      {children}
      {error && (
        <span className="ch-field__help is-error" id={`${id}-err`} role="alert" data-ch-code={errorCode}>
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * Players to include: the whole team, or chosen players. With none to show it says why: the roster didn't load
 * (CH-10208: the page's refresh notice, with Try again re-reading the page; never an empty picker), or the team has
 * nobody on it yet (CH-10310).
 */
function PlayerPicks({
  players,
  error,
  picked,
  onChange,
  label,
  id,
}: {
  players: ChTeamHub['players'];
  error: boolean;
  picked: string[];
  onChange: (ids: string[]) => void;
  label: string;
  /** The group's id: a refused save moves focus to its first player. */
  id?: string;
}) {
  if (players.length === 0 && error) return <RefreshNotice code="CH-10208" title="The team list didn’t load." body="Players can’t be chosen until it does. Try again; the error has been reported." />;
  if (players.length === 0)
    return (
      <span className="ch-field__help" data-ch-code="CH-10310">
        No players on the roster yet. Add them in Roster, then choose them here.
      </span>
    );
  return (
    <div className="ch-hb-picks" role="group" aria-label={label} id={id}>
      {players.map((p) => {
        const on = picked.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            onClick={() => {
              haptic('select');
              onChange(on ? picked.filter((x) => x !== p.id) : [...picked, p.id]);
            }}
          >
            <Avatar name={p.name} size={26} />
            <span>{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Clear all / Select all for a list that starts with everyone chosen (Assign a task, an event's travelers). A chosen id
 * not on the list (an invitee who has left the roster) can't be seen or toggled, so neither press changes it.
 */
function PickAll({ players, picked, onChange }: { players: ChTeamHub['players']; picked: string[]; onChange: (ids: string[]) => void }) {
  if (players.length < 2) return null;
  const listed = new Set(players.map((p) => p.id));
  const all = players.every((p) => picked.includes(p.id));
  const kept = picked.filter((x) => !listed.has(x));
  return (
    <button
      type="button"
      className="ch-hb-pickall"
      onClick={() => {
        haptic('select');
        onChange(all ? kept : [...kept, ...players.map((p) => p.id)]);
      }}
    >
      {all ? 'Clear all' : 'Select all'}
    </button>
  );
}

/** Today on this device (YYYY-MM-DD), the earliest a due date can be picked. */
const localToday = () => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Focus moved to a field after the render that shows it (a refused Publish goes back to Logistics first). */
function useFocusAfter() {
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    if (!target) return;
    document.getElementById(target)?.focus();
    setTarget(null);
  }, [target]);
  return setTarget;
}

/**
 * Files from the team's Documents to send with the post: the chosen ones as chips that come off with a tap, and a list to
 * choose from. The team's documents came with the page, so the list has nothing to load. Only files players can open are
 * offered (Q-83): the post goes to players, and a coach-only file would arrive as an attachment they can't open, so a line says
 * how many were left out (CH-10314). With none to show it says why: the read failed (CH-10209), nothing has been added yet
 * (CH-10311), or every file is coach-only (CH-10314).
 */
function DocumentPicks({ documents, picked, onChange }: { documents: ChTeamHub['documents']; picked: string[]; onChange: (ids: string[]) => void }) {
  const listId = useId();
  const [listing, setListing] = useState(false);
  const all = documents.folders.flatMap((f) => f.files);
  const folders = documents.folders.map((f) => ({ ...f, files: f.files.filter((x) => x.isPublic) })).filter((f) => f.files.length > 0);
  const files = folders.flatMap((f) => f.files);
  const hidden = all.length - files.length;
  const chosen = picked.map((id) => files.find((f) => f.id === id)).filter((f): f is ChHubFile => !!f);
  const toggle = (id: string) => {
    haptic('select');
    onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  };
  if (documents.error) return <RefreshNotice code="CH-10209" title="Documents didn’t load." body="Nothing was lost. Try again to attach files." />;
  if (all.length === 0)
    return (
      <span className="ch-field__help" data-ch-code="CH-10311">
        No documents yet. Add files in the Documents tab, then attach them here.
      </span>
    );
  if (files.length === 0)
    return (
      <span className="ch-field__help" data-ch-code="CH-10314">
        {hidden === 1 ? 'Your file is' : 'Your files are'} coach-only, so none can be attached: players couldn’t open {hidden === 1 ? 'it' : 'them'}.
      </span>
    );
  return (
    <div className="ch-hb-attach">
      {chosen.length > 0 && (
        <ul className="ch-hb-chips" aria-label="Attached documents">
          {chosen.map((f) => (
            <li key={f.id}>
              <button type="button" className="ch-hb-chip" aria-label={`Remove ${f.title}`} onClick={() => toggle(f.id)}>
                <Icon icon={FileText} size={13} />
                <span>{f.title}</span>
                <Icon icon={X} size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="ch-btn ch-btn--secondary ch-btn--sm" aria-expanded={listing} aria-controls={listId} onClick={() => setListing((v) => !v)}>
        <Icon icon={Paperclip} size={14} />
        <span>Attach from Documents</span>
      </button>
      {listing && (
        <div className="ch-hb-dp" id={listId}>
          {folders.map((f) => (
            <div key={f.name} role="group" aria-label={f.name}>
              <span className="ch-hb-dp__f">{f.name}</span>
              {f.files.map((d) => (
                <button key={d.id} type="button" className="ch-hb-dp__row" aria-pressed={picked.includes(d.id)} aria-label={`${d.title}, ${d.type}`} onClick={() => toggle(d.id)}>
                  <span className="ch-hb-dp__b">
                    <b>{d.title}</b>
                    <span className="ch-num">{[d.type, d.size, d.date].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="ch-hb-dp__ck" aria-hidden="true">
                    {picked.includes(d.id) && <Icon icon={Check} size={13} />}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {hidden > 0 && (
        <span className="ch-field__help" data-ch-code="CH-10314">
          {hidden} coach-only {hidden === 1 ? 'file isn’t' : 'files aren’t'} offered: players couldn’t open {hidden === 1 ? 'it' : 'them'}.
        </span>
      )}
    </div>
  );
}

/** What an edit changes on the card: the page shows it at once, and the read that follows agrees with it. */
export type ChAnnouncementEdit = Pick<ChHubAnnouncement, 'title' | 'body' | 'needAck'>;

/**
 * New announcement, and the same sheet to fix one already posted (`edit`). Editing changes the headline, the message and the
 * acknowledgement only: updateAnnouncement takes no audience and no attachments, so those two fields are left out rather than
 * offered and ignored. The form starts from the post once per opening, so a failed save or a page read that lands while it is
 * open never puts the words back. Edit and New are two instances, so a draft of a new post survives an edit.
 */
export function ComposeSheet({
  open,
  onClose,
  players,
  playersError,
  documents,
  travel,
  write,
  onDone,
  edit,
}: {
  open: boolean;
  onClose: () => void;
  players: ChTeamHub['players'];
  playersError: boolean;
  documents: ChTeamHub['documents'];
  /** The next trip's travelers, as the board's "Pinehurst travelers" audience; absent when it has none known. */
  travel?: { label: string; ids: string[] };
  write: ChHubWrites['postAnnouncement'];
  /** After a post or an edit lands: the page reads again. */
  onDone: () => void;
  /** Edit mode: the post being fixed (null while the sheet is shut) and how it is saved. `players`, `documents` and `write` are then unused. */
  edit?: { announcement: ChHubAnnouncement | null; write: ChHubWrites['editAnnouncement']; onSaved: (id: string, change: ChAnnouncementEdit) => void };
}) {
  const id = useId();
  const phone = useChPhone();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [aud, setAud] = useState<'all' | 'pick' | 'travel'>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [docs, setDocs] = useState<string[]>([]);
  const [ack, setAck] = useState(true);
  const [tried, setTried] = useState(false);
  const target = edit?.announcement ?? null;
  const [seeded, setSeeded] = useState<ChHubAnnouncement | null>(null);
  if (edit && seeded !== target) {
    setSeeded(target);
    if (target) {
      setTitle(target.title);
      setBody(target.body);
      setAck(target.needAck);
      setTried(false);
    }
  }
  const titleErr = tried && title.trim().length < 3 ? 'Give it a headline, at least three characters.' : null;
  // The server refuses an announcement without a message (announcements.ts, body.min(1)), so it is required here too.
  const bodyErr = tried && !body.trim() ? 'Add a message.' : null;
  const pickErr = tried && aud === 'pick' && picked.length === 0 ? 'Choose at least one player, or send it to the whole team.' : null;
  // A file deleted from Documents while the sheet was open is not sent, nor one that has become coach-only.
  const attached = docs.filter((d) => documents.folders.some((f) => f.files.some((x) => x.id === d && x.isPublic)));
  const toast = useToast();
  const create = useAction(
    'hub.postAnnouncement',
    async (i: Parameters<ChHubWrites['postAnnouncement']>[0]) => {
      const res = await write(i);
      const landed = normalise(res);
      if (landed.success) {
        setTitle('');
        setBody('');
        setAud('all');
        setPicked([]);
        setDocs([]);
        setTried(false);
        onClose();
        onDone();
        // The post exists, so nothing here can be retried (a replay would post it twice): it is said once, and the files are
        // where players can still open them.
        if (landed.data?.attachmentsError) {
          haptic('error');
          toast({
            tone: 'error',
            title: `Posted “${i.title.trim()}” without its files`,
            body: 'The files didn’t attach, so players see the post with no files. They can still open them in Documents.',
            code: 'CH-10012',
          });
        }
      }
      return res;
    },
    (i) => ({ done: `Posted “${i.title.trim()}”`, failed: 'Couldn’t post the announcement', hint: 'Your text is still here. Try again in a moment.', code: 'CH-10005' }),
    // The toast above is this outcome's: the usual "Posted" would say the files went too.
    (result, c) => (result.success && result.data?.attachmentsError ? { ...c, quiet: true } : c),
  );
  const save = useAction(
    'hub.editAnnouncement',
    async (announcementId: string, i: Parameters<ChHubWrites['editAnnouncement']>[1]) => {
      // Only the edit sheet runs this, so `edit` is there.
      const res = await edit!.write(announcementId, i);
      if (normalise(res).success) {
        edit!.onSaved(announcementId, { title: i.title.trim(), body: i.body.trim(), needAck: i.requiresAck });
        onClose();
        onDone();
      }
      return res;
    },
    (_announcementId, i) => ({ done: `Saved “${i.title.trim()}”`, failed: 'Couldn’t save the announcement', hint: 'Your changes are still here. Try again in a moment.', code: 'CH-10010' }),
  );
  const pending = edit ? save.pending : create.pending;
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setTried(true);
    if (title.trim().length < 3 || !body.trim() || (!edit && aud === 'pick' && picked.length === 0)) {
      haptic('warning');
      // A refused save says why beside the field (role=alert) and moves focus to the first one, as Add a class does.
      if (title.trim().length < 3) document.getElementById(`${id}-t`)?.focus();
      else if (!body.trim()) document.getElementById(`${id}-b`)?.focus();
      else document.getElementById(`${id}-picks`)?.querySelector('button')?.focus();
      return;
    }
    if (edit) {
      if (target) void save.run(target.id, { title, body, urgency: target.urgency, requiresAck: ack });
      return;
    }
    void create.run({ title, body, requiresAck: ack, playerIds: aud === 'all' ? null : aud === 'travel' && travel ? travel.ids : picked, documentIds: attached });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={edit ? Pencil : Megaphone}
      title={edit ? 'Edit announcement' : 'New announcement'}
      // A new post starts on its headline on desktop; an edit, and the phone (whose keyboard would rise over the sheet), keep the heading first.
      initialFocus={!edit && !phone ? `[id="${id}-t"]` : undefined}
      description={edit ? 'Players see the new wording in Team Hub. Who it went to and its attachments stay as posted.' : 'Players see it in Team Hub and the bell.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={pending} feel={null} onClick={() => void submit()}>
            {pending ? edit ? <span data-ch-code="CH-10406">Saving…</span> : <span data-ch-code="CH-10402">Posting…</span> : edit ? 'Save changes' : 'Post'}
          </Button>
        </>
      }
    >
      <form className="ch-hb-form" onSubmit={submit} noValidate>
        <Field label="Headline" id={`${id}-t`} error={titleErr} errorCode="CH-10101">
          <input
            id={`${id}-t`}
            className="ch-input"
            value={title}
            maxLength={140}
            aria-invalid={!!titleErr}
            aria-describedby={titleErr ? `${id}-t-err` : undefined}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Message" id={`${id}-b`} error={bodyErr} errorCode="CH-10109">
          <textarea
            id={`${id}-b`}
            className="ch-textarea"
            rows={4}
            maxLength={4000}
            value={body}
            aria-invalid={!!bodyErr}
            aria-describedby={bodyErr ? `${id}-b-err` : undefined}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        {!edit && (
          <div className="ch-field">
            <span className="ch-field__label">Send to</span>
            <div className="ch-hb-aud" role="radiogroup" tabIndex={-1} ref={rovingRadios} onKeyDown={radioKeys()} aria-label="Send to">
              {(
                [
                  ['all', playersError ? 'Whole team' : `Whole team · ${players.length}`],
                  ...(travel ? ([['travel', `${travel.label} · ${travel.ids.length}`]] as const) : []),
                  ['pick', 'Choose players'],
                ] as ReadonlyArray<readonly ['all' | 'pick' | 'travel', string]>
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={aud === k}
                  onClick={() => {
                    haptic('select');
                    setAud(k);
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
            {aud === 'pick' && <PlayerPicks players={players} error={playersError} picked={picked} onChange={setPicked} label="Players who get it" id={`${id}-picks`} />}
            {pickErr && players.length > 0 && (
              <span className="ch-field__help is-error" role="alert" data-ch-code="CH-10102">
                {pickErr}
              </span>
            )}
          </div>
        )}
        {!edit && (
          <div className="ch-field">
            <span className="ch-field__label">
              Attachments <span className="ch-field__opt">Optional</span>
            </span>
            <DocumentPicks documents={documents} picked={attached} onChange={setDocs} />
          </div>
        )}
        <div className="ch-hb-opts">
          <Switch checked={ack} onChange={setAck} label="Ask players to acknowledge" />
        </div>
      </form>
    </Modal>
  );
}

export const TRANSPORTS: Array<[ChTripInput['transport'], string]> = [
  ['bus', 'Bus'],
  ['van', 'Van'],
  ['flight', 'Flight'],
  ['carpool', 'Carpool'],
];

const TRIP_STEPS = ['Event', 'Travelers', 'Logistics', 'Itinerary'] as const;

/**
 * Plan a trip, in the board's four steps: the calendar event it's for (optional), who travels (that event's invitees),
 * logistics, then the itinerary notes. Back and Next move between steps; a trip with no event skips Travelers, which has
 * nothing to choose then. Enter is Next until the last step. Publish saves the trip, then the travelers.
 * The trip is saved once: a travelers write that fails is retried on its own (the saved trip's id is kept), so a
 * Retry never makes a second trip.
 */
export function TripSheet({
  open,
  onClose,
  teamId,
  events,
  players,
  playersError,
  write,
  writeTravelers,
  readClasses,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  events: ChTeamHub['tripEvents'];
  players: ChTeamHub['players'];
  playersError: boolean;
  write: ChHubWrites['planTrip'];
  writeTravelers: ChHubWrites['setTravelers'];
  /** Which chosen travelers have a class during the trip (Q-84); a read that never stops a trip. */
  readClasses: ChHubWrites['travelerClasses'];
  /** After a trip is saved: the page reads again. */
  onDone: () => void;
}) {
  const id = useId();
  const phone = useChPhone();
  const focusAfter = useFocusAfter();
  const empty: ChTripInput = { teamId, eventId: null, name: '', destination: '', transport: 'bus', departDate: '', departTime: '', from: '', returnDate: '', returnTime: '', hotel: '', notes: '' };
  const [v, setV] = useState<ChTripInput>(empty);
  const [step, setStep] = useState(0);
  const [travelers, setTravelers] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  // The trip this sheet already saved, when only its travelers are left to write.
  const [savedId, setSavedId] = useState<string | null>(null);
  // The same, read by the action: a toast's Retry runs the action as it was first made, so state would still say none.
  const savedRef = useRef<string | null>(null);
  const set = (k: keyof ChTripInput) => (e: { target: { value: string } }) => setV((cur) => ({ ...cur, [k]: e.target.value }));
  const event = events.rows.find((e) => e.id === v.eventId) ?? null;
  // The travelers' classes are asked for where the coach chooses them, and again on the last step, where the dates typed in
  // Logistics are known. Only a trip for an event has travelers to ask about.
  const span = open && (step === 1 || step === 3) && event && event.invited !== null ? tripWindow(v, event) : null;
  const names = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);
  // An invitee who has left the roster can't be asked about: the server answers only for the team's active players.
  const onRoster = useMemo(() => travelers.filter((id) => names.has(id)), [travelers, names]);
  const classCheck = useClassCheck(readClasses, teamId, onRoster, span);
  const errs = {
    name: tried && v.name.trim().length < 3 ? 'Name the trip, at least three characters.' : null,
    destination: tried && !v.destination.trim() ? 'Where is the team going?' : null,
    departDate: tried && !v.departDate ? 'Pick the day the team leaves.' : null,
    returnDate: tried && v.returnDate && v.departDate && v.returnDate < v.departDate ? 'The return can’t be before the departure.' : null,
  };
  const reset = () => {
    setV(empty);
    setStep(0);
    setTravelers([]);
    setTried(false);
    setSavedId(null);
    savedRef.current = null;
  };
  const pickEvent = (eventId: string | null) => {
    haptic('select');
    const e = events.rows.find((x) => x.id === eventId) ?? null;
    // The event fills what it knows; anything typed already stays.
    setV((cur) => ({
      ...cur,
      eventId,
      name: cur.name || (e?.title ?? ''),
      destination: cur.destination || (e?.location ?? ''),
      departDate: cur.departDate || (e?.date ?? ''),
    }));
    setTravelers(e?.invited ?? []);
  };
  const plan = useAction(
    'hub.planTrip',
    async (i: { trip: ChTripInput; travelers: string[] }) => {
      let tripId = savedRef.current;
      if (!tripId) {
        const res = await write(i.trip);
        const landed = normalise(res);
        if (!landed.success) return res;
        tripId = landed.data?.id ?? 'saved';
        savedRef.current = tripId;
        setSavedId(tripId);
      }
      const ev = events.rows.find((e) => e.id === i.trip.eventId);
      if (ev && ev.invited) {
        const add = i.travelers.filter((p) => !ev.invited!.includes(p));
        const remove = ev.invited.filter((p) => !i.travelers.includes(p));
        if (add.length || remove.length) {
          const res = normalise(await writeTravelers(ev.id, { add, remove }));
          if (!res.success) return { success: false, error: `The trip is saved; its travelers didn’t update.${'error' in res && res.error ? ` ${res.error}` : ''}` };
        }
      }
      reset();
      onClose();
      onDone();
      return { success: true };
    },
    (i) => ({ done: `${i.trip.name.trim()} is on Travel`, failed: `Couldn’t save ${i.trip.name.trim() || 'the trip'}`, hint: 'What you entered is still here.', code: 'CH-10006' }),
  );
  const pending = plan.pending;
  const logisticsBad = v.name.trim().length < 3 || !v.destination.trim() || !v.departDate || (!!v.returnDate && v.returnDate < v.departDate);
  // The first Logistics field a save refuses, in the order they are shown.
  const firstBad = () =>
    v.name.trim().length < 3 ? 'name' : !v.destination.trim() ? 'destination' : !v.departDate ? 'departDate' : v.returnDate && v.returnDate < v.departDate ? 'returnDate' : null;
  // Without an event there is no one to choose: Travelers is skipped both ways.
  const skipTravelers = !event;
  const after = (n: number) => (n === 0 && skipTravelers ? 2 : Math.min(TRIP_STEPS.length - 1, n + 1));
  const next = () => {
    // Logistics holds the required fields; they are checked leaving it, and again on Publish.
    if (step === 2 && logisticsBad) {
      setTried(true);
      haptic('warning');
      focusAfter(`${id}-${firstBad()}`);
      return;
    }
    haptic('select');
    setStep(after(step));
  };
  const back = () => {
    haptic('select');
    setStep((n) => (n === 2 && skipTravelers ? 0 : Math.max(0, n - 1)));
  };
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    // Enter in a field is Next until the last step; only Publish saves.
    if (step < TRIP_STEPS.length - 1) {
      next();
      return;
    }
    setTried(true);
    if (logisticsBad) {
      haptic('warning');
      setStep(2);
      focusAfter(`${id}-${firstBad()}`);
      return;
    }
    void plan.run({ trip: { ...v, teamId }, travelers });
  };
  const input = (k: keyof ChTripInput, label: string, type = 'text', err?: string | null, code?: string, extra?: { optional?: boolean; min?: string }) => (
    <Field label={label} id={`${id}-${k}`} error={err} errorCode={code} optional={extra?.optional}>
      <input
        id={`${id}-${k}`}
        className="ch-input"
        type={type}
        value={v[k] ?? ''}
        min={extra?.min || undefined}
        onChange={set(k)}
        aria-invalid={!!err}
        aria-describedby={err ? `${id}-${k}-err` : undefined}
      />
    </Field>
  );
  const last = step === TRIP_STEPS.length - 1;
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Plane}
      title="Plan a trip"
      // The phone hides the step strip, so its description says where the coach is.
      description={phone ? `Step ${step + 1} of ${TRIP_STEPS.length} · ${TRIP_STEPS[step]}` : event ? `${event.title} · ${event.label}` : 'Players see the itinerary in Team Hub.'}
      footer={
        <>
          {step > 0 ? (
            <Button variant="ghost" onClick={back} disabled={pending}>
              Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}
          {last ? (
            <Button variant="primary" disabled={pending} feel={null} onClick={() => void submit()}>
              {pending ? <span data-ch-code="CH-10403">Saving…</span> : savedId ? 'Update travelers' : 'Publish'}
            </Button>
          ) : (
            <Button variant="primary" rightIcon={ArrowRight} onClick={next}>
              Next: {TRIP_STEPS[after(step)]}
            </Button>
          )}
        </>
      }
    >
      <form className="ch-hb-form" onSubmit={submit} noValidate>
        <ol className="ch-hb-steps" aria-label="Steps">
          {TRIP_STEPS.map((l, i) => {
            const skipped = i === 1 && skipTravelers;
            return (
              <li key={l} className={skipped ? 'is-skip' : i < step ? 'is-done' : i === step ? 'is-on' : undefined} aria-current={i === step ? 'step' : undefined}>
                {l}
                {skipped && <span className="ch-sr-only">, skipped: no calendar event</span>}
              </li>
            );
          })}
        </ol>
        {step === 0 && (
          <div className="ch-field">
            <span className="ch-field__label">What the trip is for</span>
            {events.error ? (
              <span className="ch-field__help is-error" data-ch-code="CH-10210">
                Upcoming events didn’t load. You can still plan the trip without one, or close and try again.
              </span>
            ) : null}
            <div className="ch-hb-evpick" role="radiogroup" tabIndex={-1} ref={rovingRadios} onKeyDown={radioKeys()} aria-label="Event">
              {events.rows.map((e) => (
                <button key={e.id} type="button" role="radio" aria-checked={v.eventId === e.id} onClick={() => pickEvent(e.id)}>
                  <b>{e.title}</b>
                  <span>{[e.label, e.location].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
              <button type="button" role="radio" aria-checked={v.eventId === null} onClick={() => pickEvent(null)}>
                <b>No calendar event</b>
                <span>A trip on its own; the whole team sees it</span>
              </button>
            </div>
            {!events.error && events.total != null && events.total > events.rows.length && (
              // C-20: the list is capped at the soonest; later events are still in Calendar.
              <span className="ch-field__help">
                Showing the next {events.rows.length} of {events.total} events in the next four months.
              </span>
            )}
            {!events.error && events.rows.length === 0 && (
              <span className="ch-field__help" data-ch-code="CH-10312">
                No upcoming events in the next four months. Add the tournament in Calendar to choose its travelers here.
              </span>
            )}
          </div>
        )}
        {step === 1 &&
          (event ? (
            event.invited === null ? (
              <span className="ch-field__help is-error" data-ch-code="CH-10211">
                Who is invited to {event.title} didn’t load, so travelers can’t be chosen now. Publish keeps the event’s invitees as they are.
              </span>
            ) : (
              <div className="ch-field">
                <div className="ch-hb-fhead">
                  <span className="ch-field__label">
                    {players.length > 0 ? `Who’s traveling · ${travelers.length} of ${players.length}` : 'Who’s traveling'}
                  </span>
                  <PickAll players={players} picked={travelers} onChange={setTravelers} />
                </div>
                <PlayerPicks players={players} error={playersError} picked={travelers} onChange={setTravelers} label="Who’s traveling" />
                <span className="ch-field__help">They are invited to {event.title} in Calendar, and are this trip’s travelers.</span>
                <ClassClashes check={classCheck.check} names={names} onRetry={classCheck.retry} />
              </div>
            )
          ) : (
            <span className="ch-field__help" data-ch-code="CH-10313">
              Travelers come from the trip’s calendar event. Without one, the whole team sees the trip. Go Back to choose an event.
            </span>
          ))}
        {step === 2 && (
          <>
            {input('name', 'Trip', 'text', errs.name, 'CH-10103')}
            {input('destination', 'Where', 'text', errs.destination, 'CH-10104')}
            <div className="ch-field">
              <span className="ch-field__label">Getting there</span>
              <div className="ch-hb-aud" role="radiogroup" tabIndex={-1} ref={rovingRadios} onKeyDown={radioKeys()} aria-label="Getting there">
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
              {input('departDate', 'Departs', 'date', errs.departDate, 'CH-10105')}
              {input('departTime', 'Departure time', 'time')}
            </div>
            {input('from', 'From', 'text', null, undefined, { optional: true })}
            <div className="ch-hb-2">
              {input('returnDate', 'Returns', 'date', errs.returnDate, 'CH-10106', { min: v.departDate })}
              {input('returnTime', 'Return time', 'time')}
            </div>
            {input('hotel', 'Hotel', 'text', null, undefined, { optional: true })}
          </>
        )}
        {step === 3 && (
          <>
            <Field label="Itinerary for the players" id={`${id}-notes`} optional>
              <textarea id={`${id}-notes`} className="ch-textarea" rows={5} value={v.notes} onChange={set('notes')} />
            </Field>
            <dl className="ch-hb-tripsum">
              <div>
                <dt>Trip</dt>
                <dd>{[v.name.trim(), v.destination.trim()].filter(Boolean).join(' · ') || '—'}</dd>
              </div>
              <div>
                <dt>Departs</dt>
                <dd>{[v.departDate, v.departTime, v.from.trim()].filter(Boolean).join(' · ') || '—'}</dd>
              </div>
              <div>
                <dt>Travelers</dt>
                <dd>{event ? (event.invited === null ? 'As invited in Calendar' : `${travelers.length} from ${event.title}`) : 'The whole team sees it'}</dd>
              </div>
            </dl>
            {span && <ClassClashes check={classCheck.check} names={names} onRetry={classCheck.retry} />}
          </>
        )}
        {/* Enter in a field submits, which is Next until the last step (a form with several fields needs a submit button for it). */}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function AssignSheet({
  open,
  onClose,
  teamId,
  players,
  playersError,
  write,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  players: ChTeamHub['players'];
  playersError: boolean;
  write: ChHubWrites['assignTask'];
  /** After a task is assigned: the page reads again. */
  onDone: () => void;
}) {
  const id = useId();
  const phone = useChPhone();
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [due, setDue] = useState('');
  const [picked, setPicked] = useState<string[]>(() => players.map((p) => p.id));
  // A roster that arrives later (Try again on CH-10208) starts fully chosen, like the first one.
  const rosterKey = players.map((p) => p.id).join(',');
  const [seenRoster, setSeenRoster] = useState(rosterKey);
  if (seenRoster !== rosterKey) {
    setSeenRoster(rosterKey);
    setPicked(players.map((p) => p.id));
  }
  const [tried, setTried] = useState(false);
  const titleErr = tried && title.trim().length < 3 ? 'Name the task, at least three characters.' : null;
  const pickErr = tried && picked.length === 0 ? 'Choose at least one player.' : null;
  const give = useAction(
    'hub.assignTask',
    async (i: Parameters<ChHubWrites['assignTask']>[0]) => {
      const res = await write(i);
      if (normalise(res).success) {
        setTitle('');
        setDetail('');
        setDue('');
        setPicked(players.map((p) => p.id));
        setTried(false);
        onClose();
        onDone();
      }
      return res;
    },
    (i) => ({
      done: `${i.title.trim()} assigned to ${i.playerIds.length === players.length ? 'the team' : i.playerIds.length === 1 ? '1 player' : `${i.playerIds.length} players`}`,
      failed: `Couldn’t assign ${i.title.trim() || 'the task'}`,
      hint: 'What you entered is still here.',
      code: 'CH-10007',
    }),
  );
  const pending = give.pending;
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setTried(true);
    if (title.trim().length < 3 || picked.length === 0) {
      haptic('warning');
      if (title.trim().length < 3) document.getElementById(`${id}-t`)?.focus();
      else document.getElementById(`${id}-picks`)?.querySelector('button')?.focus();
      return;
    }
    void give.run({ teamId, title, detail, dueDate: due || null, playerIds: picked });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={SquareCheck}
      title="Assign a task"
      initialFocus={phone ? undefined : `[id="${id}-t"]`}
      description="Each player checks it off in Team Hub."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={pending} feel={null} onClick={() => void submit()}>
            {pending ? <span data-ch-code="CH-10404">Assigning…</span> : 'Assign'}
          </Button>
        </>
      }
    >
      <form className="ch-hb-form" onSubmit={submit} noValidate>
        <Field label="Task" id={`${id}-t`} error={titleErr} errorCode="CH-10107">
          <input id={`${id}-t`} className="ch-input" value={title} maxLength={140} aria-invalid={!!titleErr} aria-describedby={titleErr ? `${id}-t-err` : undefined} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="What it’s for" id={`${id}-d`} optional>
          <input id={`${id}-d`} className="ch-input" value={detail} maxLength={200} onChange={(e) => setDetail(e.target.value)} />
        </Field>
        <Field label="Due" id={`${id}-due`} optional>
          {/* The picker starts at today: a task isn't due in the past. */}
          <input id={`${id}-due`} className="ch-input" type="date" value={due} min={localToday()} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <div className="ch-field">
          <div className="ch-hb-fhead">
            <span className="ch-field__label">
              {players.length > 0 ? (
                <>
                  For <span className="ch-num">{picked.length}</span> of <span className="ch-num">{players.length}</span>
                </>
              ) : (
                'For'
              )}
            </span>
            <PickAll players={players} picked={picked} onChange={setPicked} />
          </div>
          <PlayerPicks players={players} error={playersError} picked={picked} onChange={setPicked} label="Players the task is for" id={`${id}-picks`} />
          {pickErr && players.length > 0 && (
            <span className="ch-field__help is-error" role="alert" data-ch-code="CH-10108">
              {pickErr}
            </span>
          )}
        </div>
        {/* Enter in Task or What it's for assigns, as the button does. */}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** Deleting asks first (warning haptic on open), and says what goes with it. */
export function ConfirmDelete({
  open,
  what,
  body,
  code,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  what: string;
  body: string;
  code: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      icon={TriangleAlert}
      title={`Delete ${what}?`}
      code={code}
      description={body}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Keep it
          </Button>
          <Button variant="danger" disabled={pending} feel={null} onClick={onConfirm}>
            {pending ? 'Deleting…' : 'Delete'}
          </Button>
        </>
      }
    />
  );
}
