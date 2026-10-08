'use client';

import { CalendarClock, ChevronDown, Mail, NotebookPen, Phone, UserRound, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { CH_DIVISIONS } from '../../data/recruiting-calendar';
import { dateLabel, isNextStepDue, mailHref, nextStepLine, stageMeta, telHref, whenLabel, type ChProspect, type ChStage } from '../../data/recruiting-shape';
import { initials } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { Icon } from '../../ui/Icon';
import { Menu } from '../../ui/Menu';
import type { RecCtx } from './ctx';

/** The stage as a chip: Watched grey, Recruiting green, Offered deeper green, Committed the darkest. */
export function StageChip({ stage, size = 'md' }: { stage: ChStage; size?: 'md' | 'lg' }) {
  return <span className={`ch-rec-chip is-${stage}` + (size === 'lg' ? ' is-lg' : '')}>{stageMeta(stage).label}</span>;
}

/** A monogram coin. The panel's and the detail's coin is the dark green once an offer is out, and takes a gilt rim once committed (B1). */
export function ProspectAvatar({ name, size, strong = false, gilt = false }: { name: string; size: number; strong?: boolean; gilt?: boolean }) {
  return (
    <span className={'ch-rec-av' + (strong ? ' is-strong' : '') + (gilt ? ' is-gilt' : '')} style={{ ['--ch-rec-av' as string]: `${size}px` } as CSSProperties} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export const isStrong = (stage: ChStage) => stage === 'offered' || stage === 'committed';

/**
 * B1, "Committed is a moment, once": under a committed prospect's stage, a 1px gilt rule. On the successful move to
 * Committed it draws left to right over the reveal duration and `haptic('success')` lands as it ends (animationend),
 * never on the tap; `held` keeps it waiting while something covers it (the phone's stage sheet). Reduced motion or
 * Animations off: the rule is simply there and the haptic fires at once. The beat is consumed, so it never replays.
 */
export function CommitRule({ p, beat, held = false, onEnd }: { p: ChProspect; beat: { id: string; n: number } | null; held?: boolean; onEnd: (n: number) => void }) {
  const reduced = useChReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const mine = beat && beat.id === p.id && p.stage === 'committed' ? beat : null;
  const play = !!mine && !held;
  const drawing = play && !reduced;
  // Reduced motion or Animations off: nothing draws, so the beat lands at once.
  useEffect(() => {
    if (!play || !reduced || !mine) return;
    haptic('success');
    onEnd(mine.n);
  }, [play, reduced, mine, onEnd]);
  // The haptic waits for the rule to finish drawing (a native listener on the rule's own animationend).
  useEffect(() => {
    const el = ref.current;
    if (!el || !drawing || !mine) return;
    const done = (e: AnimationEvent) => {
      if (e.target !== el) return;
      haptic('success');
      onEnd(mine.n);
    };
    el.addEventListener('animationend', done);
    return () => el.removeEventListener('animationend', done);
  }, [drawing, mine, onEnd]);
  if (p.stage !== 'committed') return null;
  return <span ref={ref} className={'ch-rec-commit' + (mine ? (drawing ? ' is-drawing' : ' is-waiting') : '')} aria-hidden="true" data-ch-code="CH-14806" />;
}

/** C1: the next step as a small dated plate, for a row whose step is due (today, past, or within two weeks). */
export function NextStepPlate({ p, now, tz }: { p: ChProspect; now: Date; tz?: string }) {
  const line = nextStepLine(p, now, tz);
  if (!line || !isNextStepDue(p, now, tz)) return null;
  return (
    <span className="ch-rec-plate ch-num">
      <span className="ch-sr-only">Next step: </span>
      {line}
    </span>
  );
}

/** C1: the panel's and the detail's next-step field, with the way to set it (`onEdit`), or read-only without one. */
export function NextStepSection({ p, now, tz, onEdit }: { p: ChProspect; now: Date; tz?: string; onEdit?: () => void }) {
  const line = nextStepLine(p, now, tz);
  if (!onEdit) {
    if (!line) return null;
    return (
      <section className="ch-rec-sec" aria-label="Next step">
        <h3>Next step</h3>
        <div className="ch-rec-rows">
          <p className="ch-rec-next is-static">
            <Icon icon={CalendarClock} size={17} />
            <span className="ch-rec-row__v ch-num">{line}</span>
          </p>
        </div>
      </section>
    );
  }
  return (
    <section className="ch-rec-sec" aria-label="Next step">
      <h3>Next step</h3>
      {line ? (
        <div className="ch-rec-rows">
          <button type="button" className="ch-rec-row ch-rec-next" onClick={onEdit}>
            <Icon icon={CalendarClock} size={17} />
            <span className="ch-rec-row__v ch-num">{line}</span>
            <span className="ch-rec-row__a">Change</span>
          </button>
        </div>
      ) : (
        <EmptyRow code="CH-14307" icon={CalendarClock} title="No next step yet" body="A visit, a call or a decision, with the day it’s due." actionLabel="Add" onAction={onEdit} />
      )}
    </section>
  );
}

/** A part of a prospect with nothing in it yet: an icon, what is missing, a line on what it is for, and the one way to add it. */
export function EmptyRow({
  code,
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  code: string;
  icon: LucideIcon;
  title: string;
  body: ReactNode;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="ch-rec-empty" data-ch-code={code}>
      <span className="ch-rec-empty__ic" aria-hidden="true">
        <Icon icon={icon} size={18} />
      </span>
      <span className="ch-rec-empty__t">
        <b>{title}</b>
        <span>{body}</span>
      </span>
      <button type="button" className="ch-rec-empty__a" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}

/** Email and Call are links only (mailto: and tel:): nothing is sent from GolfHelm. Real links, named by what they do (CH-14805). */
export function ContactRows({ p, hint }: { p: ChProspect; hint?: string | null }) {
  return (
    <>
      <div className="ch-rec-rows">
        {p.email && (
          <a className="ch-rec-row" href={mailHref(p.email)}>
            <Icon icon={Mail} size={17} />
            <span className="ch-rec-row__v">{p.email}</span>
            <span className="ch-rec-row__a">Email</span>
          </a>
        )}
        {p.phone && (
          <a className="ch-rec-row" href={telHref(p.phone)}>
            <Icon icon={Phone} size={17} />
            <span className="ch-rec-row__v">{p.phone}</span>
            <span className="ch-rec-row__a">Call</span>
          </a>
        )}
      </div>
      <ContactHint hint={hint} />
    </>
  );
}

/** C2: a quiet, non-blocking note under Email and Call when a sourced rule restricts that contact. The coach decides. */
export function ContactHint({ hint }: { hint?: string | null }) {
  if (!hint) return null;
  return (
    <p className="ch-rec-hint" data-ch-code="CH-14807">
      {hint}
    </p>
  );
}

export function ContactSection({ p, onAdd, hint }: { p: ChProspect; onAdd: () => void; hint?: string | null }) {
  return (
    <section className="ch-rec-sec" aria-label="Contact">
      <h3>Contact</h3>
      {p.email || p.phone ? (
        <ContactRows p={p} hint={hint} />
      ) : (
        <EmptyRow code="CH-14303" icon={UserRound} title="No contact details yet" body={`Add an email or phone number to reach ${p.firstName} or their family from here.`} actionLabel="Add" onAction={onAdd} />
      )}
    </section>
  );
}

export function NotesSection({ p, onAdd }: { p: ChProspect; onAdd: () => void }) {
  return (
    <section className="ch-rec-sec" aria-label="Notes">
      <h3>Notes</h3>
      {p.notes ? (
        <p className="ch-rec-notes">{p.notes}</p>
      ) : (
        <EmptyRow code="CH-14304" icon={NotebookPen} title="No notes yet" body="Where you saw them, what stood out, and what happens next." actionLabel="Add a note" onAction={onAdd} />
      )}
    </section>
  );
}

/** "Added Aug 12 · Updated 2 days ago". A prospect never changed since it was added says only when it was added. */
export function MetaLine({ p, now, tz }: { p: ChProspect; now: Date; tz?: string }) {
  const changed = Math.abs(new Date(p.updatedAt).getTime() - new Date(p.createdAt).getTime()) > 60_000;
  return (
    <span className="ch-rec-meta">
      Added {dateLabel(p.createdAt, now, tz)}
      {changed && <> · Updated {whenLabel(p.updatedAt, now, tz).replace(/^Today$/, 'today').replace(/^Yesterday$/, 'yesterday')}</>}
    </span>
  );
}

/**
 * C2: the recruiting calendar's quiet line ("Contact period · in-person contact allowed through Nov 8"), from the governing
 * bodies' own 2026-27 rule books (data/recruiting-calendar.ts). The division comes from the team's organization; when it
 * doesn't say, the coach picks one here and it is kept on this device. Nothing sourced to say: no line.
 */
export function CalendarLine({ c, phone = false }: { c: RecCtx; phone?: boolean }) {
  const { line, division, fromTeam, setDivision } = c.calendar;
  const short = CH_DIVISIONS.find((d) => d.value === division)?.short;
  if (!line && fromTeam) return null;
  return (
    <div className={'ch-rec-cal' + (phone ? ' is-phone' : '') + (line ? ` is-${line.kind}` : '')} data-ch-code="CH-14808">
      <span className="ch-rec-cal__t">
        {line ? `${short && fromTeam ? `${short} · ` : ''}${line.text}` : division ? 'No recruiting period to show today' : 'Recruiting calendar'}
      </span>
      {!fromTeam && (
        <Menu
          label="Recruiting calendar division"
          align={phone ? 'start' : 'end'}
          items={CH_DIVISIONS.map((d) => ({ label: d.label, checked: d.value === division, onSelect: () => setDivision(d.value) }))}
          trigger={(t) => (
            <button type="button" className="ch-rec-cal__pick" {...t}>
              {division ? short : 'Choose your division'}
              <Icon icon={ChevronDown} size={14} />
            </button>
          )}
        />
      )}
    </div>
  );
}
