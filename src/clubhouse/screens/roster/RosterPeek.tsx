'use client';

import { ArrowRight, CalendarPlus, GraduationCap, Hash, MapPin, MessageSquare, School, X } from 'lucide-react';
import { AnimatePresence, m } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { setIntent } from '@/app/golf/actions/v3/intent';
import type { ChRosterPlayer } from '../../data/roster';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { FormLine } from '../../ui/FormLine';
import { Icon } from '../../ui/Icon';
import { useAction } from '../../lib/use-action';
import { chTween } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { formatFixed, formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { rebuiltHref } from '../../shell/nav';
import { formatHcp } from './format';

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
}: {
  p: ChRosterPlayer | undefined;
  notesLocked: boolean;
  onClose: () => void;
  onNoteSaved: NoteSaved;
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
          className="ch-rs-peek"
          aria-label={p.name}
          initial={reduced ? { opacity: 0 } : { opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, x: 12 }}
          transition={chTween('base')}
        >
          <PeekBody p={p} notesLocked={notesLocked} onClose={onClose} onNoteSaved={onNoteSaved} />
        </m.aside>
      )}
    </AnimatePresence>
  );
}

function PeekBody({ p, notesLocked, onClose, onNoteSaved }: { p: ChRosterPlayer; notesLocked: boolean; onClose: () => void; onNoteSaved: NoteSaved }) {
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
  const messageHref = rebuiltHref('/golf/dashboard/messages');
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
          {[p.classYear, p.gradYear ? `Class of ${p.gradYear}` : null].filter(Boolean).join(' · ') || 'Player'}
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
      failed: `Couldn't save your note about ${p.firstName}`,
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
