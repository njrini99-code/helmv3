'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TriangleAlert, X } from 'lucide-react';
import { storiesOf, type ChStoryRound, type ChTeamPlayer, type ChTeamStory } from '../../../data/coachhelm-team-shape';
import { formatFixed } from '../../../lib/format';
import type { ChCoachBrief } from '../../../data/coachhelm-coach-brief-shape';
import type { ChDiveTheme } from '../../../data/coachhelm-dive-shape';
import { useChSessionState } from '../../../lib/session-state';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { Coin } from './parts';

const STORY_MS = 5200;
const MAX_TILES = 3;

const nameOf = (s: ChTeamStory) => s.who;
const whenOf = (s: ChTeamStory, week: string) => (s.kind === 'theme' ? 'This season' : week);
const shortOf = (s: ChTeamStory) => (s.kind === 'theme' ? `${s.word}: ${s.line}` : s.line);

function TileVisual({ story }: { story: ChTeamStory }) {
  // The only pictures with a source: a focus's before, now and target, and a theme's direction (no invented figures, 03 section 6).
  const p = story.kind === 'working' ? story.progress : null;
  if (p) {
    const top = Math.max(Math.abs(p.from), Math.abs(p.now), Math.abs(p.target)) || 1;
    const w = (v: number) => Math.max(8, (Math.abs(v) / top) * 108);
    return (
      <svg viewBox="0 0 108 40" aria-hidden="true">
        <rect x="0" y="4" width={w(p.from)} height="12" rx="6" fill="var(--track)" />
        <rect x="0" y="24" width={w(p.now)} height="12" rx="6" fill="var(--gain-fill)" />
        <rect x={w(p.target) - 1} y="20" width="2" height="20" fill="var(--ink)" />
      </svg>
    );
  }
  const fill = story.kind === 'theme' && story.word === 'Slipping' ? 'var(--loss-fill)' : 'var(--gain-fill)';
  return (
    <svg viewBox="0 0 108 40" aria-hidden="true">
      <rect x="0" y="4" width="70" height="12" rx="6" fill="var(--track)" />
      <rect x="0" y="24" width="90" height="12" rx="6" fill={fill} />
    </svg>
  );
}

const weekdayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
/** "Thursday at Hilltop", or the story's own line when no round earned it. */
const storyWhen = (s: ChTeamStory, week: string, round: ChStoryRound | null) => (round ? [weekdayOf(round.date), round.course].filter(Boolean).join(' at ') : whenOf(s, week));
const actionOf = (s: ChTeamStory) => (s.kind === 'working' ? 'See Working on' : s.kind === 'read' ? 'Open the read' : 'Open this');
const holeTone = (d: number | null) => (d == null ? '' : d < 0 ? ' is-birdie' : d === 1 ? ' is-bogey' : d >= 2 ? ' is-double' : '');

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
            <b className="ch-num">{formatFixed(p.from)}</b>
            <i style={{ width: `${(Math.abs(p.from) / top) * 100}%` }} />
          </div>
          <div className="sto-bar is-now">
            <span>Now</span>
            <b className="ch-num">{formatFixed(p.now)}</b>
            <i style={{ width: `${(Math.abs(p.now) / top) * 100}%` }} />
          </div>
          <span className="src ch-num">Line: the {formatFixed(p.target)} target</span>
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
  const reduced = useChReducedMotion();
  const box = useRef<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const story = stories[i];
  const next = () => (i < stories.length - 1 ? setI(i + 1) : onClose());
  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('.xb')?.focus({ preventScroll: true });
    return () => opener.current?.focus?.({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (reduced || held) return;
    const t = window.setTimeout(next, STORY_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restarts on the story and the hold alone
  }, [i, held, reduced]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!story) return null;
  const p = coin(story);
  return (
    <div
      ref={box}
      className={'story on' + (held ? ' is-held' : '')}
      role="dialog"
      aria-modal="true"
      aria-label={`Story, ${nameOf(story)}`}
      onPointerDown={() => setHeld(true)}
      onPointerUp={() => setHeld(false)}
      onPointerCancel={() => setHeld(false)}
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
        <button type="button" className="xb" aria-label="Close stories" onClick={onClose}>
          <Icon icon={X} size={16} />
        </button>
      </div>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Next, in the footer, is the keyboard's way */}
      <div className="sto-b" onClick={next}>
        <StoryBody story={story} round={roundOf(story)} />
      </div>
      <div className="sto-f">
        <button type="button" className="btn" onClick={() => onAction(story)}>
          {actionOf(story)}
        </button>
        <button type="button" className="btn gh2" onClick={next}>
          {i < stories.length - 1 ? 'Next' : 'Done'}
        </button>
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
  onDesk: (s: ChTeamStory) => void;
  onAction: (s: ChTeamStory) => void;
}) {
  const names = new Map(players.map((p) => [p.id, p.name]));
  const all = storiesOf(brief, themes, names).slice(0, MAX_TILES);
  const [seen, setSeen] = useChSessionState<string[]>('coachhelm-team-stories', []);
  const [open, setOpen] = useState<number | null>(autoOpen ? 0 : null);
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
        <div className="notice">
          <span className="ni">
            <Icon icon={TriangleAlert} size={18} />
          </span>
          <div>
            <b>Couldn’t load what’s new</b>
            <span>The weekly brief didn’t load. Everything below is current.</span>
            {onRetry && (
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Try again
              </Button>
            )}
          </div>
        </div>
      </section>
    );
  if (!all.length) return null;
  return (
    <section className="card today" data-ch-team-card="today" aria-label="This week">
      <div className="ch">
        <h4>This week</h4>
        {brief?.counts && <span className="meta">{brief.counts}</span>}
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
              <span className="tv">
                <TileVisual story={s} />
              </span>
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
export function StoryDeskPanel({ story, week, round = null, onClose, onAction }: { story: ChTeamStory; week: string; round?: ChStoryRound | null; onClose: () => void; onAction: (s: ChTeamStory) => void }) {
  return (
    <>
      <div className="insh">
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
      <button type="button" className="btn pri" onClick={() => onAction(story)}>
        {actionOf(story)}
      </button>
    </>
  );
}
