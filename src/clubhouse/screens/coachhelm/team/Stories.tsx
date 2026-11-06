'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { storiesOf, type ChStoryRound, type ChTeamPlayer, type ChTeamStory } from '../../../data/coachhelm-team-shape';
import { formatWith } from '../../../lib/dates';
import { formatFixed } from '../../../lib/format';
import type { ChCoachBrief } from '../../../data/coachhelm-coach-brief-shape';
import type { ChDiveTheme } from '../../../data/coachhelm-dive-shape';
import { useChSessionState } from '../../../lib/session-state';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { CH_DUR } from '../../../lib/motion';
import { useOverlayScrollLock } from '../../../lib/overlay-scroll';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { Coin, Notice } from './parts';

/** A true minus on a negative, and no plus: these are measures, not changes (TEAM-23). */
const signed = (v: number) => formatFixed(v).replace('-', '\u2212');

const STORY_MS = 5200;
/** How far a finger moves before it's a swipe and not a hold, and how far it closes the viewer. */
const DRAG_SLOP = 8;
const DRAG_CLOSE = 120;
const MAX_TILES = 3;

const nameOf = (s: ChTeamStory) => s.who;
const whenOf = (s: ChTeamStory, week: string) => (s.kind === 'theme' ? 'This season' : week);
const shortOf = (s: ChTeamStory) => (s.kind === 'theme' ? `${s.word}: ${s.line}` : s.line);

const holeTone = (d: number | null) => (d == null ? '' : d < 0 ? ' is-birdie' : d === 1 ? ' is-bogey' : d >= 2 ? ' is-double' : '');

function TileVisual({ story, round }: { story: ChTeamStory; round: ChStoryRound | null }) {
  // The only pictures with a source: a focus's before, now and target, and a theme's direction (no invented figures, 03 section 6).
  const p = story.kind === 'working' ? story.progress : null;
  if (p) {
    const top = Math.max(Math.abs(p.from), Math.abs(p.now), Math.abs(p.target)) || 1;
    const w = (v: number) => Math.max(8, (Math.abs(v) / top) * 108);
    return (
      <svg viewBox="0 0 108 40" aria-hidden="true">
        <rect x="0" y="4" width={w(p.from)} height="12" rx="6" fill="var(--ch-tb-track)" />
        <rect x="0" y="24" width={w(p.now)} height="12" rx="6" fill="var(--ch-tb-gain-fill)" />
        <rect x={w(p.target) - 1} y="20" width="2" height="20" fill="var(--ch-tb-ink)" />
      </svg>
    );
  }
  // A read's picture is its own round, hole by hole; without one, and for a theme, there's nothing true to draw (03 section 6).
  if (story.kind === 'read' && round) {
    return (
      <span className="tv-holes">
        {round.holes.map((h) => (
          <i key={h.n} className={holeTone(h.toPar)} />
        ))}
      </span>
    );
  }
  return null;
}

export const weekdayOf = (iso: string) => formatWith(new Date(`${iso}T12:00:00Z`), { weekday: 'long', timeZone: 'UTC' });
/** "Thursday at Hilltop", or the story's own line when no round earned it. */
const storyWhen = (s: ChTeamStory, week: string, round: ChStoryRound | null) => (round ? [weekdayOf(round.date), round.course].filter(Boolean).join(' at ') : whenOf(s, week));
const actionOf = (s: ChTeamStory) => (s.kind === 'working' ? 'See Working on' : s.kind === 'read' ? 'Open the read' : 'Open this');

/** A story's picture and words (AC-STORY-03): the round's holes, or before and now against the target; nothing invented. */
function StoryBody({ story, round }: { story: ChTeamStory; round: ChStoryRound | null }) {
  const p = story.kind === 'working' ? story.progress : null;
  const top = p ? Math.max(Math.abs(p.from), Math.abs(p.now), Math.abs(p.target)) || 1 : 1;
  return (
    <>
      <h3>{shortOf(story)}</h3>
      {story.kind === 'read' && round && (
        <div className="sto-holes" role="img" aria-label={`Scores by hole, ${round.holes.length} holes`}>
          {round.holes.map((h) => (
            <span key={h.n} className={'sto-hole' + holeTone(h.toPar)}>
              {h.n}
            </span>
          ))}
        </div>
      )}
      {p && (
        <div className="sto-bars">
          <div className="sto-bar">
            <span>Before the focus</span>
            <b className="ch-num">{signed(p.from)}</b>
            <i style={{ width: `${(Math.abs(p.from) / top) * 100}%` }} />
          </div>
          <div className="sto-bar is-now">
            <span>Now</span>
            <b className="ch-num">{signed(p.now)}</b>
            <i style={{ width: `${(Math.abs(p.now) / top) * 100}%` }} />
          </div>
          <span className="src ch-num">Line: the {signed(p.target)} target</span>
        </div>
      )}
      {story.kind === 'read' && story.body && <p>{story.body}</p>}
      {story.kind === 'read' && round && (
        <span className="src ch-num">
          {weekdayOf(round.date)}’s round · {round.tracked} of {round.holes.length} holes with shots tracked
        </span>
      )}
    </>
  );
}

/** The phone viewer: 5.2s a story, pausing on hold and on keyboard focus; under Reduce Motion it never advances by itself (AC-STORY-05). */
function StoryViewer({
  stories,
  start,
  week,
  coin,
  roundOf,
  onClose,
  onAction,
}: {
  stories: ChTeamStory[];
  start: number;
  week: string;
  coin: (s: ChTeamStory) => ChTeamPlayer | null;
  roundOf: (s: ChTeamStory) => ChStoryRound | null;
  onClose: () => void;
  onAction: (s: ChTeamStory) => void;
}) {
  const [i, setI] = useState(start);
  const [held, setHeld] = useState(false);
  // A body too tall for the screen (320 wide, or the largest Text Size) scrolls, and stays until the reader moves on (MOB-TEAM-3).
  const body = useRef<HTMLDivElement | null>(null);
  const [tall, setTall] = useState(false);
  const reduced = useChReducedMotion();
  // The page behind never moves while a story is up (MOB-TEAM-2).
  useOverlayScrollLock();
  // Swipe down closes it: the sheet follows the finger, and under Reduce Motion it waits for the lift, then fades.
  const drag = useRef<{ y: number; dy: number; at: number } | null>(null);
  const dragged = useRef(false);
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    if (drag.current.dy > DRAG_SLOP) dragged.current = true;
    if (!reduced && box.current && dragged.current) {
      box.current.style.transition = 'none';
      box.current.style.transform = `translateY(${drag.current.dy}px)`;
    }
  };
  const onPointerEnd = () => {
    const d = drag.current;
    drag.current = null;
    setHeld(false);
    if (!d || !box.current) return;
    box.current.style.transition = '';
    box.current.style.transform = '';
    const speed = d.dy / Math.max(1, performance.now() - d.at);
    if (d.dy > DRAG_CLOSE || (d.dy > DRAG_SLOP && speed > 0.6)) leave();
  };
  const box = useRef<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const story = stories[i];
  // Slides down and out, then unmounts; under Reduce Motion the floor makes that transition land at once, so the fallback closes it.
  const [leaving, setLeaving] = useState(false);
  const leave = () => {
    setLeaving(true);
    window.setTimeout(onClose, CH_DUR.release * 1000 + 40);
  };
  const next = () => (i < stories.length - 1 ? setI(i + 1) : leave());
  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('.xb')?.focus({ preventScroll: true });
    return () => opener.current?.focus?.({ preventScroll: true });
  }, []);
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const read = () => setTall(el.scrollHeight > el.clientHeight + 1);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const seen = new ResizeObserver(read);
    seen.observe(el);
    return () => seen.disconnect();
  }, [i]);
  // What's left of this story, so a hold resumes where the bar stopped instead of starting the full time over (MOT-11).
  const left = useRef({ story: -1, ms: STORY_MS });
  useEffect(() => {
    if (left.current.story !== i) left.current = { story: i, ms: STORY_MS };
    if (reduced || held || tall) return;
    const from = performance.now();
    const t = window.setTimeout(next, left.current.ms);
    return () => {
      window.clearTimeout(t);
      left.current.ms = Math.max(0, left.current.ms - (performance.now() - from));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restarts on the story and the hold alone
  }, [i, held, reduced, tall]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') leave();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!story) return null;
  const p = coin(story);
  return (
    <div
      ref={box}
      className={'story' + (leaving ? '' : ' on') + (held ? ' is-held' : '')}
      onTransitionEnd={(e) => {
        if (leaving && e.target === box.current) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Story, ${nameOf(story)}`}
      onPointerDown={(e) => {
        setHeld(true);
        dragged.current = false;
        // Not from a button: its press is its own, and a drag off it would close the viewer. A tall body's drag scrolls it.
        drag.current = (e.target as Element).closest?.(tall ? 'button, a, .sto-b' : 'button, a') ? null : { y: e.clientY, dy: 0, at: performance.now() };
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      // A keyboard reader gets the same pause as a held finger (FID-TEAM-6), and Tab stays inside the viewer.
      onFocusCapture={(e) => {
        if ((e.target as HTMLElement).matches(':focus-visible')) setHeld(true);
      }}
      onBlurCapture={() => setHeld(false)}
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return;
        const keys = Array.from(box.current?.querySelectorAll<HTMLElement>('button, a[href]') ?? []);
        const first = keys[0], last = keys[keys.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
    >
      <div className="prog">
        {stories.map((s, j) => (
          <i key={s.id} className={j < i ? 'done' : j === i ? 'now' : ''}>
            <b />
          </i>
        ))}
      </div>
      <div className="sto-h">
        {p && <Coin player={p} />}
        <span className="c">
          <b>{nameOf(story).split(' ')[0]}</b>
          <span>{storyWhen(story, week, story.kind === 'read' ? roundOf(story) : null)}</span>
        </span>
        <button type="button" className="xb" aria-label="Close stories" onClick={leave}>
          <Icon icon={X} size={16} />
        </button>
      </div>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Next, in the footer, is the keyboard's way */}
      <div
        ref={body}
        className={'sto-b' + (tall ? ' is-tall' : '')}
        onClick={() => {
          // The lift of a swipe still clicks.
          if (!dragged.current) next();
        }}
      >
        <StoryBody story={story} round={roundOf(story)} />
      </div>
      <div className="sto-f">
        <Button variant="secondary" size="lg" onClick={() => onAction(story)}>
          {actionOf(story)}
        </Button>
        <Button variant="ghost" size="lg" className="ch-btn--on-green" onClick={next}>
          {i < stories.length - 1 ? 'Next' : 'Done'}
        </Button>
      </div>
    </div>
  );
}

/** "This week": tiles from the brief's reads, focus progress and moving themes only; no "No clear change" (AC-TODAY). */
export function StoriesCard({
  brief,
  themes,
  failed,
  onRetry,
  players,
  phone,
  rounds,
  autoOpen,
  request = null,
  onDesk,
  onAction,
}: {
  brief: ChCoachBrief | null;
  themes: Record<string, Record<string, ChDiveTheme>> | null;
  failed: boolean;
  onRetry?: () => void;
  players: readonly ChTeamPlayer[];
  phone: boolean;
  rounds: Record<string, ChStoryRound> | null;
  /** A link or the preview's `open=story` starts the phone viewer on the first story. */
  autoOpen?: boolean;
  /** The course sheet's "Read the story": this story, in the phone viewer. */
  request?: string | null;
  onDesk: (s: ChTeamStory) => void;
  onAction: (s: ChTeamStory) => void;
}) {
  const names = new Map(players.map((p) => [p.id, p.name]));
  const all = storiesOf(brief, themes, names).slice(0, MAX_TILES);
  const [seen, setSeen] = useChSessionState<string[]>('coachhelm-team-stories', []);
  const [open, setOpen] = useState<number | null>(autoOpen ? 0 : null);
  useEffect(() => {
    if (!request) return;
    const at = all.findIndex((s) => s.id === request);
    if (at >= 0) setOpen(at);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- answers the request alone
  }, [request]);
  const byName = new Map(players.map((p) => [p.name, p]));
  const coin = (s: ChTeamStory) => byName.get(s.who) ?? null;
  const roundOf = (s: ChTeamStory) => rounds?.[s.who] ?? null;
  const week = brief?.week ?? 'This week';
  if (failed)
    return (
      <section className="card today" data-ch-team-card="today">
        <div className="ch">
          <h4>This week</h4>
        </div>
        <Notice title="Couldn’t load what’s new" body="The weekly brief didn’t load. Everything below is current." onRetry={onRetry} />
      </section>
    );
  if (!all.length) return null;
  return (
    <section className="card today" data-ch-team-card="today" aria-label="This week">
      <div className="ch">
        <h4>This week</h4>
        {/* Four zeros in a row say nothing (QA-8). */}
        {brief?.counts && /[1-9]/.test(brief.counts) && <span className="meta">{brief.counts}</span>}
      </div>
      <div className="tiles">
        {all.map((s, i) => {
          const p = coin(s);
          const text = (
            <>
              <b>{shortOf(s)}</b>
              <span className="tm">
                {p && <Coin player={p} small />}
                {s.who.split(' ')[0]} · {whenOf(s, week)}
              </span>
            </>
          );
          return (
            <button
              key={s.id}
              type="button"
              className={'tile tapp' + (seen.includes(s.id) ? '' : ' new')}
              data-ch-press-scale=".97"
              onClick={() => {
                setSeen((cur) => (cur.includes(s.id) ? cur : [...cur, s.id]));
                if (phone) setOpen(i);
                else onDesk(s);
              }}
            >
              {(s.kind === 'read' ? roundOf(s) : s.kind === 'working' ? s.progress : null) && (
                <span className="tv">
                  <TileVisual story={s} round={roundOf(s)} />
                </span>
              )}
              {phone ? text : <span className="tt">{text}</span>}
            </button>
          );
        })}
      </div>
      {phone && open != null && typeof document !== 'undefined' &&
        // Out of the card: its surface would otherwise hold the full-screen viewer inside it.
        createPortal(
          <StoryViewer
            stories={all}
            start={open}
            week={week}
            coin={coin}
            roundOf={roundOf}
            onClose={() => setOpen(null)}
            onAction={(s) => {
              setOpen(null);
              onAction(s);
            }}
          />,
          document.querySelector('.ch-htb') ?? document.body,
        )}
    </section>
  );
}

/** The desktop's story, in the inspector: no bars and no auto advance (AC-STORYDESK-01). */
export function StoryDeskPanel({ story, week, round = null, player = null, onClose, onAction }: { story: ChTeamStory; week: string; round?: ChStoryRound | null; player?: ChTeamPlayer | null; onClose: () => void; onAction: (s: ChTeamStory) => void }) {
  return (
    <>
      <div className="insh">
        {player && <Coin player={player} />}
        <span className="c">
          <b>{story.who}</b>
          <span>{storyWhen(story, week, story.kind === 'read' ? round : null)}</span>
        </span>
        <button type="button" className="xb" aria-label="Close" onClick={onClose}>
          <Icon icon={X} size={16} />
        </button>
      </div>
      <div className="feat ch-htb-storydesk sto-b">
        <StoryBody story={story} round={round} />
      </div>
      <Button variant="primary" size="lg" onClick={() => onAction(story)}>
        {actionOf(story)}
      </Button>
    </>
  );
}
