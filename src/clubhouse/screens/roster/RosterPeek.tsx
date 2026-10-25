'use client';

import { ArrowRight, CalendarPlus, GraduationCap, Hash, MapPin, MessageSquare, School, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { setIntent } from '@/app/golf/actions/v3/intent';
import { setPlayerAvailabilityCoachNote } from '@/app/golf/actions/team-management';
import { AVAILABILITY_NOTE_MAX } from '../../data/availability';
import { coachPlayerHref } from '../../data/coachhelm-views-shape';
import type { ChAvailability, ChRosterHelm, ChRosterPlayer } from '../../data/roster';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { FormLine } from '../../ui/FormLine';
import { Icon } from '../../ui/Icon';
import { Segmented } from '../../ui/Segmented';
import { useAction, type ActionCopy } from '../../lib/use-action';
import { chTween } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { formatFixed, formatHcp, formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { NoData } from '../../ui/NoData';
import { rebuiltHref } from '../../shell/nav';
import { AVAILABILITY_WORD, legsCaption, relativeAgo } from './format';
import { usePressPrefetch } from '../../shell/use-prefetch-tabs';
import { plural, pluralWord } from '../../lib/plural';
import { ClassStatusLine } from '../../ui/ClassStatusLine';
import type { RosterClassLine } from './class-line';

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
  helm,
  classLine,
}: {
  p: ChRosterPlayer | undefined;
  notesLocked: boolean;
  onClose: () => void;
  onNoteSaved: NoteSaved;
  /** Roster's availability write, shared with the row menu so one change at a time is in flight. */
  availability: AvailabilityControl;
  /** What CoachHelm reads in each player's rounds (loadRoster); off draws no block. */
  helm: ChRosterHelm;
  /** P-10: the class line for the open player, or null/absent. */
  classLine?: RosterClassLine | null;
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
          <PeekBody p={p} notesLocked={notesLocked} onClose={onClose} onNoteSaved={onNoteSaved} availability={availability} helm={helm} classLine={classLine} />
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
  helm,
  classLine,
}: {
  p: ChRosterPlayer;
  notesLocked: boolean;
  onClose: () => void;
  onNoteSaved: NoteSaved;
  availability: AvailabilityControl;
  helm: ChRosterHelm;
  /** P-10: the class line for this player (a trip, or a class when nothing outranks it), with its source. */
  classLine?: RosterClassLine | null;
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
  // The Development counts open the player's Development tab.
  const devHref = rebuiltHref(`/golf/dashboard/stats?player=${encodeURIComponent(p.id)}&tab=dev`);
  const devCode = p.focusAreas == null || p.goals == null ? 'CH-3208' : undefined;
  const devCounts = (
    <>
      <span>
        <b className="ch-num">{p.focusAreas ?? <NoData />}</b> focus {pluralWord(p.focusAreas ?? 0, 'area')}
      </span>
      <span>
        <b className="ch-num">{p.goals ?? <NoData />}</b> {pluralWord(p.goals ?? 0, 'goal')}
      </span>
    </>
  );

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
          <Avatar name={p.name} id={p.id} size={96} />
        </span>
        <h2 className="ch-display">{p.name}</h2>
        <span className="ch-rs-peek__sub">
          {[p.classYear, p.gradYear ? `Class of ${p.gradYear}` : null, p.availability !== 'available' ? AVAILABILITY_WORD[p.availability] : null].filter(Boolean).join(' · ') ||
            'Player'}
        </span>
        {classLine && (
          <span className="ch-rs-peek__class">
            <ClassStatusLine kind={classLine.kind} text={classLine.text} />
            {classLine.source && <small>{classLine.source}</small>}
          </span>
        )}
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
      <LegsCaption p={p} />

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
        {devHref ? (
          <Link className="ch-rs-peek__dev" href={devHref} data-ch-code={devCode}>
            {devCounts}
          </Link>
        ) : (
          <div className="ch-rs-peek__dev" data-ch-code={devCode}>
            {devCounts}
          </div>
        )}
      </div>

      <HelmBlock p={p} helm={helm} />

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

/** The roster's strokes-by-leg caption under the figures (spec D build B); nothing without a season's strokes gained. */
export function LegsCaption({ p }: { p: ChRosterPlayer }) {
  const c = legsCaption(p);
  if (!c) return null;
  return (
    <p className="ch-rs-peek__legs">
      {c.lead}
      <span className={`ch-num is-${c.tone}`}>{c.figure}</span>
      {c.tail}
    </p>
  );
}

/** "3 costing strokes · 1 working", "No reads yet", or dashes when the counts did not load (CH-3212). */
function HelmCounts({ p, helm }: { p: ChRosterPlayer; helm: Exclude<ChRosterHelm, { status: 'off' }> }) {
  const c = helm.status === 'on' ? helm.byPlayer[p.id] : null;
  if (helm.status === 'on' && !c) return <span>No reads yet</span>;
  return (
    <span>
      <b className="ch-num">{c ? c.costing : NO_DATA}</b> costing strokes · <b className="ch-num">{c ? c.working : NO_DATA}</b> working
    </span>
  );
}

/** Where View insights goes: the coach's Deep dive of this player, once that view is rebuilt. */
const insightsHref = (p: ChRosterPlayer) => rebuiltHref(coachPlayerHref('deep-dive', p.id), 'coach');

/**
 * CoachHelm in the player panel (spec D build B): how many of the player's current reads are costing strokes and how many are
 * working, counted as the Board counts them, and View insights. Off for the coach: not drawn.
 */
function HelmBlock({ p, helm }: { p: ChRosterPlayer; helm: ChRosterHelm }) {
  const press = usePressPrefetch();
  if (helm.status === 'off') return null;
  const href = insightsHref(p);
  return (
    <div className="ch-rs-peek__sec">
      <div className="ch-rs-peek__l">
        <b>CoachHelm</b>
        <span>What it reads in {p.firstName}&rsquo;s rounds</span>
      </div>
      <div className="ch-rs-peek__dev" data-ch-code={helm.status === 'failed' ? 'CH-3212' : undefined}>
        <HelmCounts p={p} helm={helm} />
        {href && (
          <Link className="ch-rs-peek__go" href={href} {...press(href)}>
            View insights <Icon icon={ArrowRight} size={14} />
          </Link>
        )}
      </div>
      {helm.status === 'failed' && <p className="ch-rs-peek__cap">Didn&rsquo;t load. Refresh to try again.</p>}
    </div>
  );
}

/** The same counts as a panel on the phone profile, after Recent rounds; View insights is the panel's 44px link. */
export function HelmPanel({ p, helm }: { p: ChRosterPlayer; helm: ChRosterHelm }) {
  const press = usePressPrefetch();
  if (helm.status === 'off') return null;
  const href = insightsHref(p);
  return (
    <section className="ch-rsm-panel ch-rsm-helm" aria-labelledby={`helm-${p.id}`}>
      <div className="ch-rsm-panel__h">
        <b id={`helm-${p.id}`}>CoachHelm</b>
        {href && (
          <Link href={href} className="ch-rsm-panel__link" {...press(href)}>
            View insights <Icon icon={ArrowRight} size={14} />
          </Link>
        )}
      </div>
      <div className="ch-rs-peek__dev" data-ch-code={helm.status === 'failed' ? 'CH-3212' : undefined}>
        <HelmCounts p={p} helm={helm} />
      </div>
      {helm.status === 'failed' && <p className="ch-rs-peek__cap">Didn&rsquo;t load. Refresh to try again.</p>}
    </section>
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
            {left === 0 ? 'That’s the limit: 2,000 characters.' : `${plural(left, 'character')} left`}
          </span>
        )
      )}
    </div>
  );
}

/** What Roster hands the panel: its availability write, and whether one is in flight. */
export interface AvailabilityControl {
  set: (p: ChRosterPlayer, to: ChAvailability) => void;
  pending: boolean;
  /**
   * The coach-only reason beside Injured or Away. Present only when its table answered (`ChRoster.availabilityCoachNotes`);
   * absent, the panel draws the word only. `onSaved` tells the list the note is stored.
   */
  note?: { onSaved: (id: string, note: string | null) => void };
}

/** What `useAction('roster.setAvailability')` says (CH-3009 on failure). */
export function availabilityCopy(name: string, to: ChAvailability): ActionCopy {
  const word = AVAILABILITY_WORD[to].toLowerCase();
  return {
    done: `${name} marked ${word}`,
    failed: `Couldn’t mark ${name} ${word}`,
    hint: 'Nothing changed on the roster. Try again, or refresh if it keeps failing.',
    code: 'CH-3009',
  };
}

const AVAILABILITY_OPTIONS: ReadonlyArray<{ value: ChAvailability; label: string }> = [
  { value: 'available', label: 'Available' },
  { value: 'injured', label: 'Injured' },
  { value: 'away', label: 'Away' },
];

/**
 * Can they play: Available, Injured or Away, the word only. Display only, on the coach's roster; it never changes team
 * access, which Mark inactive does (the caption says so where the control is). Shared by the desktop panel and the
 * phone profile. The choice is written at once (optimistic, Roster's `roster.setAvailability`). There is no note:
 * teammates can read every column of their team's rows, so a reason has nowhere coach-only to live yet
 * (docs/clubhouse/held/data/roster-availability.md).
 */
export function AvailabilityPanel({ p, control, block = false }: { p: ChRosterPlayer; control: AvailabilityControl; block?: boolean }) {
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
      {control.note && p.availability !== 'available' && <AvailabilityNote key={`avail-note-${p.id}`} p={p} onSaved={control.note.onSaved} />}
      <p className="ch-rs-avail__cap">Shows on your roster only. It never changes their team access; Mark inactive does.</p>
    </div>
  );
}

/**
 * Why they are out, for the coaches of the team only (CH-3011 when it does not save). Kept in its own table because teammates
 * can read every column of golf_team_members; the field is drawn only when that table answered, so it can never save over a note
 * that could not be read. Saved when the field loses focus, like the Coach's note.
 */
function AvailabilityNote({ p, onSaved }: { p: ChRosterPlayer; onSaved: (id: string, note: string | null) => void }) {
  const [saved, setSaved] = useState(p.availabilityCoachNote ?? '');
  const [draft, setDraft] = useState(p.availabilityCoachNote ?? '');
  const save = useAction(
    'roster.availabilityReason',
    async (note: string) => {
      const res = await setPlayerAvailabilityCoachNote({ playerId: p.id, note: note || null });
      // Inside the action, so the toast's Retry marks the note saved as well.
      if (res.success) {
        setSaved(note);
        onSaved(p.id, note || null);
      }
      return res;
    },
    {
      done: `Note saved for ${p.firstName}`,
      failed: `Couldn’t save the note about ${p.firstName}`,
      hint: 'Your text is still in the field. Try again in a moment.',
      code: 'CH-3011',
    },
  );
  const left = AVAILABILITY_NOTE_MAX - draft.length;
  const helpId = `avail-note-help-${p.id}`;
  return (
    <div className="ch-rs-avail__note">
      <label className="ch-rs-peek__l" htmlFor={`avail-note-${p.id}`}>
        <b>Why</b>
        <span>Only coaches on this team see this</span>
      </label>
      <textarea
        id={`avail-note-${p.id}`}
        className="ch-textarea ch-rs-peek__memo"
        rows={2}
        value={draft}
        maxLength={AVAILABILITY_NOTE_MAX}
        placeholder="Optional. Kept off every player’s screen."
        aria-describedby={left <= NOTE_WARN ? helpId : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={async () => {
          const next = draft.trim();
          if (next === saved.trim()) return;
          await save.run(next);
        }}
        aria-busy={save.pending}
      />
      {left <= NOTE_WARN && (
        <span id={helpId} className="ch-field__help ch-num" aria-live="polite">
          {left === 0 ? `That’s the limit: ${AVAILABILITY_NOTE_MAX} characters.` : `${plural(left, 'character')} left`}
        </span>
      )}
    </div>
  );
}
