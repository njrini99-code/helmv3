'use client';

import { ArrowUp, ChevronDown, ChevronUp, Plus, Square } from 'lucide-react';
import { Button, IconButton } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { LOOK } from './content';

/* The pieces of the look preview: the golf ball mark, the activity panel's rows, the sent question, the hold ring and
   the composer. Static: each state is drawn at rest, the motion is written in docs/clubhouse/coachhelm-chat-v3/LOOK.md. */

const ring = (count: number, radius: number, offset = 0) =>
  Array.from({ length: count }, (_, i) => {
    const a = ((offset + (360 / count) * i) * Math.PI) / 180;
    // Rounded, so the server and the browser print the same attribute (their trigonometry differs in the last digit).
    return { x: Math.round((12 + radius * Math.cos(a)) * 100) / 100, y: Math.round((12 + radius * Math.sin(a)) * 100) / 100 };
  });

const BALL_INNER = ring(6, 3.9, 30);
const BALL_OUTER = ring(12, 7.1, 15);
const BALL_SPRAY = ring(12, 10.6, 0);

/**
 * The chat's mark: a golf ball. At rest it is a whole ball. Thinking, the shell thins and the dimples drift out past its
 * edge, ring by ring (the dissolve), while the whole mark breathes (the pulse). This draws the two ends of that loop.
 */
export function BallMark({ state = 'rest', size = 20 }: { state?: 'rest' | 'thinking'; size?: number }) {
  const thinking = state === 'thinking';
  const outer = thinking ? ring(12, 8.3, 15) : BALL_OUTER;
  return (
    <svg className={'ch-look-ball' + (thinking ? ' is-thinking' : '')} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle className="ch-look-ball__shell" cx="12" cy="12" r={thinking ? 7.6 : 9.6} />
      <circle className="ch-look-ball__dot" cx="12" cy="12" r="0.8" />
      {BALL_INNER.map((p, i) => (
        <circle key={`i${i}`} className="ch-look-ball__dot" cx={p.x} cy={p.y} r="0.8" />
      ))}
      {outer.map((p, i) => (
        <circle key={`o${i}`} className="ch-look-ball__dot is-outer" cx={p.x} cy={p.y} r={thinking ? 0.75 : 0.8} />
      ))}
      {thinking && BALL_SPRAY.map((p, i) => <circle key={`s${i}`} className="ch-look-ball__dot is-spray" cx={p.x} cy={p.y} r="0.6" />)}
    </svg>
  );
}

/** A step's state, as the owner's picture draws it: a ringed tick (done), a ring that turns (active), a solid dim disc (waiting). */
export function StepGlyph({ state }: { state: 'done' | 'active' | 'waiting' }) {
  return (
    <svg className={`ch-look-step ch-look-step--${state}`} width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      {state === 'done' && (
        <>
          <circle className="ch-look-step__ring" cx="9" cy="9" r="7.25" />
          <path className="ch-look-step__tick" d="M5.7 9.3 8 11.6l4.4-4.9" />
        </>
      )}
      {state === 'active' && (
        <>
          <circle className="ch-look-step__track" cx="9" cy="9" r="7.25" />
          <circle className="ch-look-step__arc" cx="9" cy="9" r="7.25" pathLength="100" />
        </>
      )}
      {state === 'waiting' && <circle className="ch-look-step__disc" cx="9" cy="9" r="7.25" />}
    </svg>
  );
}

/** The activity panel mid-work: one step done, one turning, one waiting. */
export function Island() {
  const { work } = LOOK;
  return (
    <section className="ch-look-isl" aria-label="What CoachHelm is doing">
      <button type="button" className="ch-look-isl__head" aria-expanded="true">
        <BallMark state="thinking" size={24} />
        <span className="ch-look-isl__title">{work.title}</span>
        <Icon icon={ChevronUp} size={16} className="ch-look-isl__chev" />
      </button>
      <ol className="ch-look-isl__rows">
        {work.steps.map((s) => (
          <li key={s.label} className={`ch-look-isl__row is-${s.state}`}>
            <StepGlyph state={s.state} />
            <span>{s.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The same panel after the work: one line, a ball at rest on the green. Tapping it opens the steps again. */
export function IslandDone({ summary = LOOK.work.summary, meta = LOOK.work.meta }: { summary?: string; meta?: string }) {
  return (
    <button type="button" className="ch-look-isl is-done" aria-expanded="false">
      <BallMark size={20} />
      <span className="ch-look-isl__title">{summary}</span>
      <span className="ch-num ch-look-isl__meta">{meta}</span>
      <Icon icon={ChevronDown} size={14} className="ch-look-isl__chev" />
    </button>
  );
}

export function Question({ text }: { text: string }) {
  return (
    <p className="ch-look-q">
      <span className="ch-sr-only">You asked: </span>
      {text}
    </p>
  );
}

/** The eight-second hold: the ring empties as the seconds go, the numeral is what is left. */
export function HoldRing({ left, total }: { left: number; total: number }) {
  return (
    <span className="ch-look-hold" role="img" aria-label={`${left} seconds left`}>
      <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
        <circle className="ch-look-hold__track" cx="18" cy="18" r="15" />
        <circle className="ch-look-hold__arc" cx="18" cy="18" r="15" pathLength="100" strokeDasharray={`${(left / total) * 100} 100`} />
      </svg>
      <b className="ch-num">{left}</b>
    </span>
  );
}

/** The composer: at rest it sends, while the model works the same key stops it. */
export function Composer({ working, phone }: { working: boolean; phone: boolean }) {
  return (
    <div className="ch-look-dock">
      <form className={'ch-look-cmp' + (working ? ' is-working' : '')} onSubmit={(e) => e.preventDefault()}>
        <IconButton icon={Plus} label="Add a player, a round or a file" />
        <textarea rows={1} readOnly aria-label="Message CoachHelm" placeholder={working ? 'Add to this while it works' : 'Ask a follow-up'} />
        {/* A filled key: IconButton is ghost or secondary only, so this is Button with the icon key's class and its name. */}
        {working ? (
          <Button variant="ink" className="ch-iconbtn ch-look-cmp__go" aria={{ label: 'Stop' }}>
            <Icon icon={Square} size={16} />
          </Button>
        ) : (
          <Button variant="primary" className="ch-iconbtn ch-look-cmp__go" aria={{ label: 'Send' }}>
            <Icon icon={ArrowUp} size={16} />
          </Button>
        )}
      </form>
      {!phone && <p className="ch-look-foot">{LOOK.foot}</p>}
    </div>
  );
}
