'use client';

import { Check, FileText, Megaphone, Paperclip, Pencil, Plane, SquareCheck, TriangleAlert, X } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import type { ChHubAnnouncement, ChHubFile, ChTeamHub } from '../../data/hub';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { Switch } from '../../ui/Switch';
import { haptic } from '../../lib/haptics';
import { normalise, useAction } from '../../lib/use-action';
import type { ChHubWrites, ChTripInput } from './writes';

/*
 * Team Hub's forms, each a Modal (a bottom sheet on the phone). A form keeps
 * what was typed when a save fails: it closes only when its save lands.
 * Each form owns its action, and what follows a landed save (clear the form,
 * close the sheet, refresh the page) is inside that action: the error toast's
 * Retry re-runs the action and nothing else, so a Retry that lands finishes
 * the job the same way the first press would have.
 */

function Field({ label, error, errorCode, children, id }: { label: string; error?: string | null; errorCode?: string; children: ReactNode; id: string }) {
  return (
    <div className="ch-field">
      <label className="ch-field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error && (
        <span className="ch-field__help is-error" id={`${id}-err`} data-ch-code={errorCode}>
          {error}
        </span>
      )}
    </div>
  );
}

/** Players to include: the whole team, or chosen players. With none to show it says why: the roster didn't load (CH-10208), or the team has nobody on it yet (CH-10310). */
function PlayerPicks({
  players,
  error,
  onRetry,
  picked,
  onChange,
  label,
}: {
  players: ChTeamHub['players'];
  error: boolean;
  onRetry: () => void;
  picked: string[];
  onChange: (ids: string[]) => void;
  label: string;
}) {
  if (players.length === 0 && error)
    return (
      <div className="ch-hb-roster" data-ch-code="CH-10208">
        <span className="ch-field__help is-error">The roster didn’t load, so players can’t be chosen.</span>
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  if (players.length === 0)
    return (
      <span className="ch-field__help" data-ch-code="CH-10310">
        No players on the roster yet. Add them in Roster, then choose them here.
      </span>
    );
  return (
    <div className="ch-hb-picks" role="group" aria-label={label}>
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
 * Files from the team's Documents to send with the post: the chosen ones as chips that come off with a tap, and a list to
 * choose from. The team's documents came with the page, so the list has nothing to load. With none to show it says why: the
 * read failed (CH-10209), or nothing has been added yet (CH-10311).
 */
function DocumentPicks({ documents, picked, onChange }: { documents: ChTeamHub['documents']; picked: string[]; onChange: (ids: string[]) => void }) {
  const listId = useId();
  const [listing, setListing] = useState(false);
  const files = documents.folders.flatMap((f) => f.files);
  const chosen = picked.map((id) => files.find((f) => f.id === id)).filter((f): f is ChHubFile => !!f);
  const toggle = (id: string) => {
    haptic('select');
    onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  };
  if (documents.error) return <RefreshNotice code="CH-10209" title="Documents didn't load." body="Nothing was lost. Try again to attach files." />;
  if (files.length === 0)
    return (
      <span className="ch-field__help" data-ch-code="CH-10311">
        No documents yet. Add files in the Documents tab, then attach them here.
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
          {documents.folders.map((f) => (
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
  write,
  onDone,
  edit,
}: {
  open: boolean;
  onClose: () => void;
  players: ChTeamHub['players'];
  playersError: boolean;
  documents: ChTeamHub['documents'];
  write: ChHubWrites['postAnnouncement'];
  /** After a post or an edit lands: the page reads again. */
  onDone: () => void;
  /** Edit mode: the post being fixed (null while the sheet is shut) and how it is saved. `players`, `documents` and `write` are then unused. */
  edit?: { announcement: ChHubAnnouncement | null; write: ChHubWrites['editAnnouncement']; onSaved: (id: string, change: ChAnnouncementEdit) => void };
}) {
  const id = useId();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [aud, setAud] = useState<'all' | 'pick'>('all');
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
  const pickErr = tried && aud === 'pick' && picked.length === 0 ? 'Choose at least one player, or send it to the whole team.' : null;
  // A file deleted from Documents while the sheet was open is not sent.
  const attached = docs.filter((d) => documents.folders.some((f) => f.files.some((x) => x.id === d)));
  const create = useAction(
    'hub.postAnnouncement',
    async (i: Parameters<ChHubWrites['postAnnouncement']>[0]) => {
      const res = await write(i);
      if (normalise(res).success) {
        setTitle('');
        setBody('');
        setAud('all');
        setPicked([]);
        setDocs([]);
        setTried(false);
        onClose();
        onDone();
      }
      return res;
    },
    (i) => ({ done: `Posted "${i.title.trim()}"`, failed: 'Couldn’t post the announcement', hint: 'Your text is still here. Try again in a moment.', code: 'CH-10005' }),
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
    (_announcementId, i) => ({ done: `Saved "${i.title.trim()}"`, failed: 'Couldn’t save the announcement', hint: 'Your changes are still here. Try again in a moment.', code: 'CH-10010' }),
  );
  const pending = edit ? save.pending : create.pending;
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setTried(true);
    if (title.trim().length < 3 || (!edit && aud === 'pick' && picked.length === 0)) {
      haptic('warning');
      return;
    }
    if (edit) {
      if (target) void save.run(target.id, { title, body, urgency: target.urgency, requiresAck: ack });
      return;
    }
    void create.run({ title, body, requiresAck: ack, playerIds: aud === 'all' ? null : picked, documentIds: attached });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={edit ? Pencil : Megaphone}
      title={edit ? 'Edit announcement' : 'New announcement'}
      description={edit ? 'Players see the new wording in Team Hub. Who it went to and its attachments stay as posted.' : 'Players see it in Team Hub and the bell.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={pending} feel={null} onClick={() => void submit()}>
            {pending ? edit ? <span data-ch-code="CH-10406">Saving</span> : <span data-ch-code="CH-10402">Posting</span> : edit ? 'Save changes' : 'Post'}
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
        <Field label="Message (optional)" id={`${id}-b`}>
          <textarea id={`${id}-b`} className="ch-textarea" rows={4} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        {!edit && (
          <div className="ch-field">
            <span className="ch-field__label">Send to</span>
            <div className="ch-hb-aud" role="radiogroup" aria-label="Send to">
              {(
                [
                  ['all', playersError ? 'Whole team' : `Whole team · ${players.length}`],
                  ['pick', 'Choose players'],
                ] as const
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
            {aud === 'pick' && <PlayerPicks players={players} error={playersError} onRetry={onDone} picked={picked} onChange={setPicked} label="Players who get it" />}
            {pickErr && players.length > 0 && (
              <span className="ch-field__help is-error" data-ch-code="CH-10102">
                {pickErr}
              </span>
            )}
          </div>
        )}
        {!edit && (
          <div className="ch-field">
            <span className="ch-field__label">Attachments (optional)</span>
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

const TRANSPORTS: Array<[ChTripInput['transport'], string]> = [
  ['bus', 'Bus'],
  ['van', 'Van'],
  ['flight', 'Flight'],
  ['carpool', 'Carpool'],
];

export function TripSheet({
  open,
  onClose,
  teamId,
  write,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  write: ChHubWrites['planTrip'];
  /** After a trip is saved: the page reads again. */
  onDone: () => void;
}) {
  const id = useId();
  const empty: ChTripInput = { teamId, name: '', destination: '', transport: 'bus', departDate: '', departTime: '', from: '', returnDate: '', returnTime: '', hotel: '', notes: '' };
  const [v, setV] = useState<ChTripInput>(empty);
  const [tried, setTried] = useState(false);
  const set = (k: keyof ChTripInput) => (e: { target: { value: string } }) => setV((cur) => ({ ...cur, [k]: e.target.value }));
  const errs = {
    name: tried && v.name.trim().length < 3 ? 'Name the trip, at least three characters.' : null,
    destination: tried && !v.destination.trim() ? 'Where is the team going?' : null,
    departDate: tried && !v.departDate ? 'Pick the day the team leaves.' : null,
    returnDate: tried && v.returnDate && v.departDate && v.returnDate < v.departDate ? 'The return can’t be before the departure.' : null,
  };
  const plan = useAction(
    'hub.planTrip',
    async (i: ChTripInput) => {
      const res = await write(i);
      if (normalise(res).success) {
        setV(empty);
        setTried(false);
        onClose();
        onDone();
      }
      return res;
    },
    (i) => ({ done: `${i.name.trim()} is on Travel`, failed: `Couldn’t save ${i.name.trim() || 'the trip'}`, hint: 'What you entered is still here.', code: 'CH-10006' }),
  );
  const pending = plan.pending;
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setTried(true);
    const bad = v.name.trim().length < 3 || !v.destination.trim() || !v.departDate || (!!v.returnDate && v.returnDate < v.departDate);
    if (bad) {
      haptic('warning');
      return;
    }
    void plan.run({ ...v, teamId });
  };
  const input = (k: keyof ChTripInput, label: string, type = 'text', err?: string | null, code?: string) => (
    <Field label={label} id={`${id}-${k}`} error={err} errorCode={code}>
      <input id={`${id}-${k}`} className="ch-input" type={type} value={v[k]} onChange={set(k)} aria-invalid={!!err} aria-describedby={err ? `${id}-${k}-err` : undefined} />
    </Field>
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Plane}
      title="Plan a trip"
      description="Players see the itinerary in Team Hub."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={pending} feel={null} onClick={() => void submit()}>
            {pending ? <span data-ch-code="CH-10403">Saving</span> : 'Save trip'}
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
        <Field label="Notes for the players (optional)" id={`${id}-notes`}>
          <textarea id={`${id}-notes`} className="ch-textarea" rows={3} value={v.notes} onChange={set('notes')} />
        </Field>
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
      description="Each player checks it off in Team Hub."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={pending} feel={null} onClick={() => void submit()}>
            {pending ? <span data-ch-code="CH-10404">Assigning</span> : 'Assign'}
          </Button>
        </>
      }
    >
      <form className="ch-hb-form" onSubmit={submit} noValidate>
        <Field label="Task" id={`${id}-t`} error={titleErr} errorCode="CH-10107">
          <input id={`${id}-t`} className="ch-input" value={title} maxLength={140} aria-invalid={!!titleErr} aria-describedby={titleErr ? `${id}-t-err` : undefined} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="What it's for (optional)" id={`${id}-d`}>
          <input id={`${id}-d`} className="ch-input" value={detail} maxLength={200} onChange={(e) => setDetail(e.target.value)} />
        </Field>
        <Field label="Due (optional)" id={`${id}-due`}>
          <input id={`${id}-due`} className="ch-input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <div className="ch-field">
          <span className="ch-field__label">
            {players.length > 0 ? (
              <>
                For <span className="ch-num">{picked.length}</span> of <span className="ch-num">{players.length}</span>
              </>
            ) : (
              'For'
            )}
          </span>
          <PlayerPicks players={players} error={playersError} onRetry={onDone} picked={picked} onChange={setPicked} label="Players the task is for" />
          {pickErr && players.length > 0 && (
            <span className="ch-field__help is-error" data-ch-code="CH-10108">
              {pickErr}
            </span>
          )}
        </div>
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
            {pending ? 'Deleting' : 'Delete'}
          </Button>
        </>
      }
    />
  );
}
