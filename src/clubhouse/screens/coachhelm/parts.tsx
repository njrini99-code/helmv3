'use client';

import { useId, useState, type ReactNode } from 'react';
import { CalendarX, ChevronDown, ChevronRight, ChevronUp, ClipboardList, Flag, ListChecks, MailQuestionMark, Target, TrendingDown, TrendingUp, Users, type LucideIcon } from 'lucide-react';
import { stanceOf, type ChHelmAssigned, type ChHelmEvidence, type ChHelmGauge, type ChInsight, type ChPulseIcon, type ChPulseRow } from '../../data/coachhelm-shape';
import { haptic } from '../../lib/haptics';
import { Icon } from '../../ui/Icon';

/**
 * The stance pill: amber for a Priority, and a word, so priority never rests on colour alone (CH-13806). A strength reads Working,
 * a card that states no finding reads Note, a read older than the newest round reads Out of date, and a finding already assigned
 * or acknowledged reads so (`stanceOf`), never as a fresh Priority. `assigned`: the focus area made from it, over what the page loaded.
 */
export function PriPill({ ins, assigned }: { ins: ChInsight; assigned?: ChHelmAssigned | null }) {
  const stance = stanceOf(ins, assigned);
  return <span className={'ch-hl-pri is-' + stance.cls}>{stance.word}</span>;
}

/** The confidence read: three bars and the word for the level. The bars are decoration; the word says it. */
export function ReadMeter({ read }: { read: NonNullable<ChHelmEvidence['read']> }) {
  return (
    <span className="ch-hl-conf">
      <span className="ch-hl-conf__d" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <i key={n} className={read.level >= n ? 'is-on' : undefined} />
        ))}
      </span>
      {read.word}
    </span>
  );
}

/**
 * You against the comparison (and the Tour, when the generator carries one).
 * CH-13802: the track is decoration; the legend says every number in words,
 * and the priority pill beside the title says whether it is a finding or a
 * strength, so colour never carries either.
 */
function Gauge({ g, who }: { g: ChHelmGauge; who?: string }) {
  return (
    <div className={'ch-hl-g' + (g.good ? ' is-good' : '') + (g.fromZero ? ' is-fromzero' : '')}>
      <div className="ch-hl-g__t" aria-hidden="true">
        <span className="ch-hl-g__f" style={{ width: `${g.youPct}%` }} />
        <i className="ch-hl-g__cmp" style={{ left: `${g.cmpPct}%` }} />
        {g.secPct != null && <i className="ch-hl-g__sec" style={{ left: `${g.secPct}%` }} />}
        <i className="ch-hl-g__you" style={{ left: `${g.youPct}%` }} />
      </div>
      <div className="ch-hl-g__lg">
        <span>
          <i className="is-you" aria-hidden="true" />
          {who ?? 'You'} · <b className="ch-num">{g.you}</b>
        </span>
        <span>
          <i className="is-cmp" aria-hidden="true" />
          {g.cmp}
        </span>
        {g.sec && (
          <span>
            <i className="is-sec" aria-hidden="true" />
            {g.sec}
          </span>
        )}
      </div>
    </div>
  );
}

/** `who`: the first name the gauge's own number is labelled with on a coach's board; the player's own board says You. */
export function Evidence({ ev, who }: { ev: ChHelmEvidence; who?: string }) {
  // A note draws none of the number behind it, so there is nothing to put in a box.
  if (!ev.label && !ev.bars && !ev.gauge && !ev.sample && !ev.window && !ev.read && !ev.asOf) return null;
  return (
    <div className="ch-hl-ev">
      {ev.label && <span className="ch-hl-ev__l">{ev.label}</span>}
      {ev.bars ? (
        <ul className="ch-hl-bars">
          {ev.bars.map((b) => (
            <li key={b.label}>
              <span>{b.label}</span>
              <span className="ch-hl-bars__t" aria-hidden="true">
                <i className={b.weak ? 'is-weak' : undefined} style={{ width: `${b.pct}%` }} />
              </span>
              <b className="ch-num">{Math.round(b.pct)}%</b>
            </li>
          ))}
        </ul>
      ) : (
        ev.gauge && <Gauge g={ev.gauge} who={who} />
      )}
      {(ev.sample || ev.window || ev.read || ev.asOf) && (
        <div className="ch-hl-ev__f">
          {ev.sample && <span className="ch-num">{ev.sample}</span>}
          {ev.window && <span>{ev.window}</span>}
          {ev.read && <ReadMeter read={ev.read} />}
          {ev.asOf && <span data-ch-code="CH-13905">{ev.asOf}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * The one insight the page is about (helm3.jsx `Focus`): category and priority,
 * the claim, its first sentence, the evidence, "This week" and "Why we think
 * this". Re-mounted per insight (key), so each opens with its reasoning closed.
 * CH-13804: the reasoning is a disclosure button that names what it controls.
 */
export function FocusCard({ ins, who, assigned, defaultOpen = false }: { ins: ChInsight; who?: string; assigned?: ChHelmAssigned | null; defaultOpen?: boolean }) {
  const [why, setWhy] = useState(defaultOpen);
  const id = useId();
  return (
    <article className="ch-hl-focus" aria-labelledby={`${id}-t`}>
      <div className="ch-hl-focus__k">
        <span>{who ? `${who} · ${ins.category}` : ins.category}</span>
        <PriPill ins={ins} assigned={assigned} />
      </div>
      <h2 id={`${id}-t`}>{ins.title}</h2>
      {ins.lede && <p className="ch-hl-lede">{ins.lede}</p>}
      {/* CH-13903: a read from before the newest round is never drawn as current. */}
      {ins.stale && (
        <p className="ch-hl-stale" role="note" data-ch-code="CH-13903">
          A round played {ins.stale.newestRound} isn’t in this read yet, so it may not match the rounds posted since.
        </p>
      )}
      <Evidence ev={ins.evidence} who={who} />
      {ins.week && (
        <div className="ch-hl-drill">
          <span className="ch-hl-drill__k">
            <Icon icon={Target} size={14} />
            This week
          </span>
          {ins.week.title && (
            <p className="ch-hl-drill__t">
              <b>{ins.week.title}</b>
              {ins.week.meta && <em> · {ins.week.meta}</em>}
            </p>
          )}
          {ins.week.text && <p>{ins.week.text}</p>}
        </div>
      )}
      {ins.why && (
        <>
          <button type="button" className="ch-hl-why" onClick={() => setWhy((v) => !v)} aria-expanded={why} aria-controls={`${id}-why`}>
            <span>Why we think this</span>
            <Icon icon={why ? ChevronUp : ChevronDown} size={15} />
          </button>
          <p id={`${id}-why`} className="ch-hl-why__b" hidden={!why}>
            {ins.why}
          </p>
        </>
      )}
    </article>
  );
}

/**
 * One row of "Also worth knowing" or "Working" (helm3.jsx `Row`). Choosing it
 * puts it in the focus card (CH-13701: a selection tap). CH-13803: one button
 * named for its category, title, value and priority.
 */
export function InsightRow({ ins, onPick }: { ins: ChInsight; onPick: () => void }) {
  const stance = stanceOf(ins);
  return (
    <button
      type="button"
      className="ch-hl-row"
      onClick={() => {
        haptic('select');
        onPick();
      }}
    >
      <span className={'ch-hl-row__d is-' + stance.cls} aria-hidden="true" />
      <span className="ch-hl-row__b">
        <em>{ins.category}</em>
        <b>{ins.title}</b>
        <span className="ch-sr-only">{stance.word}</span>
      </span>
      <span className="ch-hl-row__v ch-num">{ins.value}</span>
      <Icon icon={ChevronRight} size={15} />
    </button>
  );
}

const PULSE_GLYPH: Record<ChPulseIcon, LucideIcon> = {
  'calendar-x': CalendarX,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  rsvp: MailQuestionMark,
  practice: ClipboardList,
  focus: Target,
  tasks: ListChecks,
  roster: Users,
  flag: Flag,
};

/** The program pulse's rows: each getProgramPulse's own headline and evidence line. */
export function PulseList({ rows }: { rows: ChPulseRow[] }) {
  return (
    <ol>
      {rows.map((r) => (
        <li key={r.id} className={'is-' + r.tone}>
          <span className="ch-hl-pulse__ic" aria-hidden="true">
            <Icon icon={PULSE_GLYPH[r.icon]} size={15} />
          </span>
          <b>{r.headline}</b>
          <span>{r.evidence}</span>
        </li>
      ))}
    </ol>
  );
}

/** The page's title block: the role chip, CoachHelm, one line. CH-13801: the h1 labels the page's main landmark (aria-labelledby), and each section below is a labelled region. */
export function Head({ who, children }: { who: 'Player' | 'Coach'; children: ReactNode }) {
  return (
    <header className="ch-hl-h">
      <span className="ch-hl-role">{who}</span>
      <h1 id="ch-hl-title">CoachHelm</h1>
      <p>{children}</p>
    </header>
  );
}
