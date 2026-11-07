'use client';

import { ArrowRight, MessageSquare } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { setIntent } from '@/app/golf/actions/v3/intent';
import { setPlayerAvailabilityCoachNote } from '@/app/golf/actions/team-management';
import { AVAILABILITY_NOTE_MAX } from '../../data/availability';
import { coachPlayerHref } from '../../data/coachhelm-views-shape';
import type { ChAvailability, ChRosterHelm, ChRosterPlayer } from '../../data/roster';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { FormLine } from '../../ui/FormLine';
import { Icon } from '../../ui/Icon';
import { Segmented } from '../../ui/Segmented';
import { useAction, type ActionCopy } from '../../lib/use-action';
import { chTween } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { changeTone, formatFixed, formatHcp, formatSigned, NO_DATA } from '../../lib/format';
import { rebuiltHref } from '../../shell/nav';
import { AVAILABILITY_WORD, relativeAgo, yearKeyOf, yearLineOf, type RosterClock } from './format';
import { usePressPrefetch } from '../../shell/use-prefetch-tabs';
import { plural } from '../../lib/plural';
import { ClassStatusLine } from '../../ui/ClassStatusLine';
import type { RosterClassLine } from './class-line';

/** The player drawer. Esc closes it; the coach's note saves when the field loses focus. */
export function RosterPeek({
  p,
  notesLocked,
  onClose,
  onNoteSaved,
  availability,
  helm,
  classLine,
  clock,
}: {
  clock?: RosterClock;
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
          <PeekBody p={p} notesLocked={notesLocked} onClose={onClose} onNoteSaved={onNoteSaved} availability={availability} helm={helm} classLine={classLine} clock={clock} />
        </m.aside>
      )}
    </AnimatePresence>
  );
}

/** The lane's figure that takes a gain or loss colour (06 7.12). */
const SG_FIGURE = 'SG / round';
/** Under this many rounds there is no line to draw (the rows' bars hold the same floor). */
const PEEK_LINE_FLOOR = 3;

function PeekBody({
  p,
  classLine,
  clock,
}: {
  clock?: RosterClock;
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
    [SG_FIGURE, p.sgPerRound == null ? NO_DATA : formatSigned(p.sgPerRound)],
    ['Rounds', String(p.rounds)],
  ];
  const messageHref = rebuiltHref(`/golf/dashboard/messages?player=${encodeURIComponent(p.id)}`);
  // The board's Schedule 1:1: Calendar's editor with only this player invited (D-52), as the phone's Plan 1:1.
  const planHref = rebuiltHref(`/golf/dashboard/calendar?new=1&with=${p.id}`);
  const profileHref = rebuiltHref(`/golf/dashboard/stats?player=${p.id}`);

  return (
    <>
      
      <div className="ch-rs-peek__hero">
        <span className="ch-rs-peek__av">
          <Avatar name={p.name} id={p.id} size={76} year={yearKeyOf(p.gradYear, clock)} dim={p.status === 'inactive'} />
        </span>
        <h2 className="ch-display">{p.name}</h2>
        <span className="ch-rs-ychip" data-year={yearKeyOf(p.gradYear, clock) ?? undefined}>
            <i aria-hidden="true" />
            {[yearLineOf(p.gradYear, clock), p.availability !== 'available' ? AVAILABILITY_WORD[p.availability] : null].filter(Boolean).join(' · ') || 'Player'}
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
              <Button size="md" variant="primary" leftIcon={MessageSquare} href={messageHref}>
                Message
              </Button>
            )}
            {planHref && (
              <Button size="md" leftIcon={undefined} href={planHref}>
                Schedule 1:1
              </Button>
            )}
          </div>
        )}
      </div>

      

      <dl className="ch-rs-peek__figs">
        {figs.map(([l, v]) => (
          <div key={l}>
            <dt>{l}</dt>
            <dd className={'ch-num' + (l === SG_FIGURE ? ' ' + changeTone(p.sgPerRound, false, 1) : '')}>{v}</dd>
          </div>
        ))}
      </dl>
      {(p.trend.length >= PEEK_LINE_FLOOR ? (
          <FormLine data={p.trend} width={292} height={70} earlyBelow={PEEK_LINE_FLOOR} label={`${p.name}, last rounds: ${p.trend.join(', ')}`} />
        ) : (
          <p className="ch-rs-peek__early">{p.trend.length > 0 ? 'Early read. Form shows at three rounds.' : 'No 18-hole rounds yet this season.'}</p>
        ))}
      {/* The rest lives on the full profile (06 7.12: identity, buttons, four figures, chart, the link). */}
      

      

      

      

      

      

      

      {profileHref && (
        <div className="ch-rs-peek__foot">
          <Button variant="secondary" rightIcon={undefined} href={profileHref}>
            Open full profile
          </Button>
        </div>
      )}
      
    </>
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

/**
 * Saves a text field when it loses focus without ever dropping an edit: a blur while an earlier save is still in flight (the
 * action gate answers `busy` with no toast) keeps the latest text and sends it when that save lands, if it differs from what
 * that save sent.
 */
export function useBlurSave(save: { run: (value: string) => Promise<unknown> }) {
  const sending = useRef(false);
  const waiting = useRef<string | null>(null);
  return useCallback(
    async (next: string, saved: string) => {
      if (sending.current) {
        waiting.current = next;
        return;
      }
      if (next === saved.trim()) return;
      sending.current = true;
      let value = next;
      try {
        for (;;) {
          await save.run(value);
          const queued = waiting.current;
          waiting.current = null;
          if (queued == null || queued === value) return;
          value = queued;
        }
      } finally {
        sending.current = false;
      }
    },
    // `save.run` is stable per render of the owner; the refs carry the state across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [save.run],
  );
}

/** The coach's private note. Shared by the desktop panel and the phone profile (D-56). */
export function CoachNote({ p, locked, onSaved, onDirty }: { p: ChRosterPlayer; locked: boolean; onSaved: NoteSaved; /** Behind the lane's flag: the field holds text not yet saved, so the profile asks before it leaves. */ onDirty?: (dirty: boolean) => void }) {
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
  const blurSave = useBlurSave(save);
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
        // Last on a long scroll: the caret stays above the keyboard (MOB-CRH-1).
        onFocus={(e) => e.currentTarget.scrollIntoView?.({ block: 'nearest' })}
        onChange={(e) => {
          setDraft(e.target.value);
          onDirty?.(e.target.value.trim() !== saved.trim());
        }}
        onBlur={async () => {
          // Leaving the field saves it, so it is no longer unsaved text to ask about.
          onDirty?.(false);
          if (locked) return;
          await blurSave(draft.trim(), saved);
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
  const blurSave = useBlurSave(save);
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
          await blurSave(draft.trim(), saved);
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
