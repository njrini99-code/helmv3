'use client';

import { ArrowRight, CalendarPlus, GraduationCap, Hash, MapPin, MessageSquare, School, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { setIntent } from '@/app/golf/actions/v3/intent';
import { setPlayerAvailability } from '@/app/golf/actions/team-management';
import type { ChAvailability, ChRosterPlayer } from '../../data/roster';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { FormLine } from '../../ui/FormLine';
import { Icon } from '../../ui/Icon';
import { Segmented } from '../../ui/Segmented';
import { useAction, type ActionCopy } from '../../lib/use-action';
import { chTween } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { formatFixed, formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { rebuiltHref } from '../../shell/nav';
import { AVAILABILITY_WORD, formatHcp, relativeAgo } from './format';

const FORM_NOTE: Record<ChRosterPlayer['form'], string> = {
  improving: 'Scoring is coming down.',
  steady: 'Holding steady.',
  slipping: 'Scoring is creeping up.',
  early: 'Early read. Form appears after three rounds.',
};

/** The player drawer. Esc closes it; the coach's note saves when the field loses focus. */
export function RosterPeek({
  p,
  notesLocked,
  onClose,
  onNoteSaved,
  availability,
}: {
  p: ChRosterPlayer | undefined;
  notesLocked: boolean;
  onClose: () => void;
  onNoteSaved: NoteSaved;
  /** Roster's availability write, shared with the row menu so one change at a time is in flight. */
  availability: AvailabilityControl;
}) {
  const reduced = useChReducedMotion();
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!p) return;
    const onKey = (e: KeyboardEvent) => {
      // CH-3803: Esc closes the panel, but not while typing a note. Esc inside an open dialog (Remove, Invite) closes that
      // dialog and leaves the panel alone.
      if (e.key === 'Escape' && !(e.target instanceof HTMLTextAreaElement) && !document.querySelector('dialog[open]')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p, onClose]);

  return (
    // CH-3601: the panel slides in on open and crossfades between players.
    <AnimatePresence mode="popLayout" initial={false}>
      {p && (
        <m.aside
          key={p.id}
          ref={panel}
          id="ch-rs-peek"
          className="ch-rs-peek"
          aria-label={p.name}
          initial={reduced ? { opacity: 0 } : { opacity: 0, transform: 'translateX(16px)' }}
          animate={{ opacity: 1, transform: 'translateX(0px)' }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, transform: 'translateX(12px)' }}
          transition={chTween('base', reduced)}
        >
          <PeekBody p={p} notesLocked={notesLocked} onClose={onClose} onNoteSaved={onNoteSaved} availability={availability} />
        </m.aside>
      )}
    </AnimatePresence>
  );
}

function PeekBody({
  p,
  notesLocked,
  onClose,
  onNoteSaved,
  availability,
}: {
  p: ChRosterPlayer;
  notesLocked: boolean;
  onClose: () => void;
  onNoteSaved: NoteSaved;
  availability: AvailabilityControl;
}) {
  const figs: Array<[string, string]> = [
    ['Scoring avg', formatFixed(p.avg)],
    ['Handicap', formatHcp(p.handicap)],
    ['SG / round', p.sgPerRound == null ? NO_DATA : formatSigned(p.sgPerRound)],
    ['Rounds', String(p.rounds)],
  ];
  const facts = [
    { icon: MapPin, label: 'Hometown', value: p.hometown },
    { icon: School, label: 'High school', value: p.highSchool },
    { icon: GraduationCap, label: 'Class of', value: p.gradYear ? String(p.gradYear) : null },
    { icon: Hash, label: 'Jersey', value: p.jersey },
  ].filter((f) => f.value);
  const messageHref = rebuiltHref(`/golf/dashboard/messages?player=${encodeURIComponent(p.id)}`);
  // The board's Schedule 1:1: Calendar's editor with only this player invited (D-52), as the phone's Plan 1:1.
  const planHref = rebuiltHref(`/golf/dashboard/calendar?new=1&with=${p.id}`);
  const profileHref = rebuiltHref(`/golf/dashboard/stats?player=${p.id}`);

  return (
    <>
      <div className="ch-rs-peek__top">
        <span className={`ch-rs-status is-${p.status}`}>
          <i aria-hidden="true" />
          {p.status === 'active' ? 'Active' : 'Inactive'}
        </span>
        <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
      </div>
      <div className="ch-rs-peek__hero">
        <span className="ch-rs-peek__av">
          <Avatar name={p.name} size={96} />
        </span>
        <h2 className="ch-display">{p.name}</h2>
        <span className="ch-rs-peek__sub">
          {[p.classYear, p.gradYear ? `Class of ${p.gradYear}` : null, p.availability !== 'available' ? AVAILABILITY_WORD[p.availability] : null].filter(Boolean).join(' · ') ||
            'Player'}
        </span>
        {(messageHref || planHref) && (
          <div className="ch-rs-peek__quick">
            {messageHref && (
              <Button size="sm" leftIcon={MessageSquare} href={messageHref}>
                Message
              </Button>
            )}
            {planHref && (
              <Button size="sm" leftIcon={CalendarPlus} href={planHref}>
                Schedule 1:1
              </Button>
            )}
          </div>
        )}
      </div>

      {facts.length > 0 && (
        <dl className="ch-rs-peek__facts">
          {facts.map((f) => (
            <div key={f.label}>
              <dt>
                <Icon icon={f.icon} size={13} />
                {f.label}
              </dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <dl className="ch-rs-peek__figs">
        {figs.map(([l, v]) => (
          <div key={l}>
            <dt>{l}</dt>
            <dd className="ch-num">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="ch-rs-peek__sec">
        <div className="ch-rs-peek__l">
          <b>Form</b>
          <span>
            {p.trend.length ? `Last ${p.trend.length} rounds · dashed line is the average` : 'No 18-hole rounds this season'}
          </span>
        </div>
        <FormLine data={p.trend} width={292} height={64} earlyBelow={3} label={`${p.name}, last rounds: ${p.trend.join(', ') || 'none'}`} />
        <p className="ch-rs-peek__note" data-ch-code={p.trend.length ? undefined : 'CH-3305'}>
          {p.trend.length ? FORM_NOTE[p.form] : 'Form appears once rounds are posted.'}
        </p>
      </div>

      {p.recent.length > 0 && (
        <div className="ch-rs-peek__sec">
          <div className="ch-rs-peek__l">
            <b>Recent rounds</b>
            <span>Countable 18-hole rounds</span>
          </div>
          {p.recent.map((r) => (
            <div key={r.id} className="ch-rs-peek__rd">
              <span>
                <b>{r.course}</b>
                <span>{r.date}</span>
              </span>
              <span className="ch-num">{r.score}</span>
              <span className={'ch-num ch-rs-topar' + (r.toPar != null && r.toPar < 0 ? ' is-under' : '')}>{formatToPar(r.toPar)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="ch-rs-peek__sec">
        <div className="ch-rs-peek__l">
          <b>Development</b>
        </div>
        {/* A count that didn't load shows as a dash, never 0 (CH-3208). */}
        <div className="ch-rs-peek__dev" data-ch-code={p.focusAreas == null || p.goals == null ? 'CH-3208' : undefined}>
          <span>
            <b className="ch-num">{p.focusAreas ?? NO_DATA}</b> focus {p.focusAreas === 1 ? 'area' : 'areas'}
          </span>
          <span>
            <b className="ch-num">{p.goals ?? NO_DATA}</b> {p.goals === 1 ? 'goal' : 'goals'}
          </span>
        </div>
      </div>

      <AvailabilityPanel key={`avail-${p.id}`} p={p} control={availability} />

      <CoachNote key={p.id} p={p} locked={notesLocked} onSaved={onNoteSaved} />

      {profileHref && (
        <div className="ch-rs-peek__foot">
          <Button variant="primary" rightIcon={ArrowRight} href={profileHref}>
            Open full profile
          </Button>
        </div>
      )}
      {p.joined && <span className="ch-rs-peek__since">{p.joined}</span>}
    </>
  );
}

export const NOTE_MAX = 2000;
/** The counter appears when this many characters are left. */
const NOTE_WARN = 200;

/** Tells the list that a note is now stored, so the player reads back with it (31203). */
export type NoteSaved = (playerId: string, note: string | null) => void;

/** The coach's private note. Shared by the desktop panel and the phone profile (D-56). */
export function CoachNote({ p, locked, onSaved }: { p: ChRosterPlayer; locked: boolean; onSaved: NoteSaved }) {
  const [saved, setSaved] = useState(p.coachNote ?? '');
  const [draft, setDraft] = useState(p.coachNote ?? '');
  const save = useAction(
    'roster.coachNote',
    async (notes: string) => {
      const res = await setIntent({ player_id: p.id, notes: notes || null });
      // Inside the action, so the toast's Retry marks the note saved as well (31403).
      if (res.ok) {
        setSaved(notes);
        onSaved(p.id, notes || null);
      }
      return res;
    },
    {
      done: `Note saved for ${p.firstName}`,
      failed: `Couldn’t save your note about ${p.firstName}`,
      hint: 'Your text is still in the field. Try again in a moment.',
      code: 'CH-3004',
    },
  );
  const left = NOTE_MAX - draft.length;
  const helpId = `note-help-${p.id}`;
  return (
    <div className="ch-rs-peek__sec">
      <label className="ch-rs-peek__l" htmlFor={`note-${p.id}`}>
        <b>Coach&rsquo;s note</b>
        <span>Only you see this</span>
      </label>
      <textarea
        id={`note-${p.id}`}
        className="ch-textarea ch-rs-peek__memo"
        rows={2}
        value={draft}
        maxLength={NOTE_MAX}
        // Notes that didn't load can't be edited: a blank field would save over the real note.
        readOnly={locked}
        placeholder={locked ? undefined : `Something to remember about ${p.firstName}`}
        aria-describedby={locked || left <= NOTE_WARN ? helpId : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={async () => {
          if (locked) return;
          const next = draft.trim();
          if (next === saved.trim()) return;
          await save.run(next);
        }}
        aria-busy={save.pending}
      />
      {/* CH-3804: the counter is read politely; a locked note says why. */}
      {locked ? (
        <span id={helpId} className="ch-field__help" data-ch-code="CH-3209">
          Your notes didn&rsquo;t load, so this one can&rsquo;t be edited right now. Refresh the page to try again.
        </span>
      ) : (
        left <= NOTE_WARN && (
          <span id={helpId} className="ch-field__help ch-num" data-ch-code="CH-3101" aria-live="polite">
            {left === 0 ? 'That’s the limit: 2,000 characters.' : `${left} ${left === 1 ? 'character' : 'characters'} left`}
          </span>
        )
      )}
    </div>
  );
}

/** golf_team_members.availability_note is CHECKed to this length (setPlayerAvailability refuses more). */
export const AVAILABILITY_NOTE_MAX = 280;
/** The note's counter appears when this many characters are left (CH-3102). */
const AVAILABILITY_NOTE_WARN = 40;

/** What Roster hands the panel: its availability write, whether one is in flight, and the player whose note to focus. */
export interface AvailabilityControl {
  set: (p: ChRosterPlayer, to: ChAvailability) => void;
  pending: boolean;
  /** Tells the list that a note is stored, so the player reads back with it. */
  onNoteSaved: (playerId: string, note: string | null) => void;
  /** The toast's "Add a note" opened the panel for this player: their note takes focus once. */
  focusNote?: string | null;
  onNoteFocused?: () => void;
}

/** What `useAction('roster.setAvailability')` says (CH-3009 on failure). From the row menu the toast offers "Add a note". */
export function availabilityCopy(name: string, to: ChAvailability, addNote?: () => void): ActionCopy {
  const word = AVAILABILITY_WORD[to].toLowerCase();
  return {
    done: `${name} marked ${word}`,
    failed: `Couldn’t mark ${name} ${word}`,
    hint: 'Nothing changed on the roster. Try again, or refresh if it keeps failing.',
    code: 'CH-3009',
    ...(addNote && to !== 'available' ? { doneAction: { label: 'Add a note', run: addNote } } : {}),
  };
}

const AVAILABILITY_OPTIONS: ReadonlyArray<{ value: ChAvailability; label: string }> = [
  { value: 'available', label: 'Available' },
  { value: 'injured', label: 'Injured' },
  { value: 'away', label: 'Away' },
];

/**
 * Can they play: Available, Injured or Away, and for the last two a short note. Display only, on the coach's roster; it
 * never changes team access, which Mark inactive does (the caption says so where the control is). Shared by the desktop
 * panel and the phone profile. The choice is written at once (optimistic, Roster's `roster.setAvailability`); the note
 * saves when the field loses focus, like the coach's note.
 */
export function AvailabilityPanel({ p, control, block = false }: { p: ChRosterPlayer; control: AvailabilityControl; block?: boolean }) {
  const [saved, setSaved] = useState(p.availabilityNote ?? '');
  const [draft, setDraft] = useState(p.availabilityNote ?? '');
  // A note the list changed under the panel (Mark available cleared it, a refresh brought another) replaces the field.
  const [seen, setSeen] = useState(p.availabilityNote);
  if (p.availabilityNote !== seen) {
    setSeen(p.availabilityNote);
    setSaved(p.availabilityNote ?? '');
    setDraft(p.availabilityNote ?? '');
  }
  const { onNoteSaved } = control;
  const save = useAction(
    'roster.availabilityNote',
    async (note: string) => {
      const res = await setPlayerAvailability({ playerId: p.id, availability: p.availability, note: note || null });
      // Inside the action, so the toast's Retry marks the note saved as well (31403).
      if (res.success) {
        setSaved(note);
        setSeen(note || null);
        onNoteSaved(p.id, note || null);
      }
      return res;
    },
    {
      done: `Availability note saved for ${p.firstName}`,
      failed: `Couldn’t save the availability note for ${p.firstName}`,
      hint: 'Your text is still in the field. Try again in a moment.',
      code: 'CH-3010',
    },
  );
  const field = useRef<HTMLTextAreaElement>(null);
  const { focusNote, onNoteFocused } = control;
  const out = p.availability !== 'available';
  useEffect(() => {
    if (!out || focusNote !== p.id) return;
    field.current?.focus();
    onNoteFocused?.();
  }, [out, focusNote, p.id, onNoteFocused]);
  const left = AVAILABILITY_NOTE_MAX - draft.length;
  const id = `avail-${p.id}`;
  const [now] = useState(() => new Date());
  return (
    <div className="ch-rs-peek__sec ch-rs-avail">
      <div className="ch-rs-peek__l">
        <b id={`${id}-l`}>Availability</b>
        {p.availabilityUpdated && <span>Updated {relativeAgo(p.availabilityUpdated, now)}</span>}
      </div>
      {/* CH-3405: while a change is in flight the control says so and refuses another for this player. */}
      <div className="ch-rs-avail__seg" aria-busy={control.pending || undefined} data-ch-code={control.pending ? 'CH-3405' : undefined}>
        <Segmented<ChAvailability>
          size="sm"
          block={block}
          label={`Availability for ${p.name}`}
          value={p.availability}
          options={AVAILABILITY_OPTIONS}
          onChange={(to) => {
            if (control.pending) return;
            control.set(p, to);
          }}
        />
      </div>
      {out && (
        <div className="ch-field ch-rs-avail__note">
          <label className="ch-field__label" htmlFor={id}>
            Note
          </label>
          <textarea
            ref={field}
            id={id}
            className="ch-textarea ch-rs-peek__memo"
            rows={2}
            value={draft}
            maxLength={AVAILABILITY_NOTE_MAX}
            placeholder="What, and until when"
            aria-describedby={`${id}-h`}
            aria-busy={save.pending || undefined}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={async () => {
              const next = draft.trim();
              if (next === saved.trim()) return;
              await save.run(next);
            }}
          />
          <span id={`${id}-h`} className="ch-field__help">
            Only coaches see this.
            {/* CH-3102: the counter is read politely, within the last 40 characters. */}
            {left <= AVAILABILITY_NOTE_WARN && (
              <span className="ch-num" data-ch-code="CH-3102" aria-live="polite">
                {' '}
                {left === 0 ? 'That’s the limit: 280 characters.' : `${left} ${left === 1 ? 'character' : 'characters'} left`}
              </span>
            )}
          </span>
        </div>
      )}
      <p className="ch-rs-avail__cap">Shows on your roster only. It never changes their team access; Mark inactive does.</p>
    </div>
  );
}
