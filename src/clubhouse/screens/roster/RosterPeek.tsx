'use client';

import { ArrowRight, GraduationCap, Hash, MapPin, MessageSquare, School, X } from 'lucide-react';
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
export function RosterPeek({ p, onClose }: { p: ChRosterPlayer | undefined; onClose: () => void }) {
  const reduced = useChReducedMotion();
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!p) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLTextAreaElement)) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p, onClose]);

  return (
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
          <PeekBody p={p} onClose={onClose} />
        </m.aside>
      )}
    </AnimatePresence>
  );
}

function PeekBody({ p, onClose }: { p: ChRosterPlayer; onClose: () => void }) {
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
        {messageHref && (
          <div className="ch-rs-peek__quick">
            <Button size="sm" leftIcon={MessageSquare} href={messageHref}>
              Message
            </Button>
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
        <p className="ch-rs-peek__note">{p.trend.length ? FORM_NOTE[p.form] : 'Form appears once rounds are posted.'}</p>
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
        <div className="ch-rs-peek__dev">
          <span>
            <b className="ch-num">{p.focusAreas ?? NO_DATA}</b> focus {p.focusAreas === 1 ? 'area' : 'areas'}
          </span>
          <span>
            <b className="ch-num">{p.goals ?? NO_DATA}</b> {p.goals === 1 ? 'goal' : 'goals'}
          </span>
        </div>
      </div>

      <CoachNote key={p.id} p={p} />

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

function CoachNote({ p }: { p: ChRosterPlayer }) {
  const [saved, setSaved] = useState(p.coachNote ?? '');
  const [draft, setDraft] = useState(p.coachNote ?? '');
  const save = useAction('roster.coachNote', (notes: string) => setIntent({ player_id: p.id, notes: notes || null }), {
    done: `Note saved for ${p.firstName}`,
    failed: `Couldn't save your note about ${p.firstName}`,
    hint: 'Your text is still in the field. Try again in a moment.',
  });
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
        maxLength={2000}
        placeholder={`Something to remember about ${p.firstName}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={async () => {
          const next = draft.trim();
          if (next === saved.trim()) return;
          const res = await save.run(next);
          if (res.success) setSaved(next);
        }}
        aria-busy={save.pending}
      />
    </div>
  );
}
