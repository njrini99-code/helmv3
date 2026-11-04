'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { storiesOf, type ChTeamPlayer, type ChTeamStory } from '../../../data/coachhelm-team-shape';
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
  // The only pictures with a source: a focus's progress and a theme's direction (no invented figures, 03 section 6).
  const fill = story.kind === 'theme' && story.word === 'Slipping' ? 'var(--loss-fill)' : 'var(--gain-fill)';
  return (
    <svg viewBox="0 0 108 40" aria-hidden="true">
      <rect x="0" y="4" width="70" height="12" rx="6" fill="var(--track)" />
      <rect x="0" y="24" width="90" height="12" rx="6" fill={fill} />
    </svg>
  );
}

/** The phone viewer: 5.2s a story, pausing on hold and on keyboard focus; under Reduce Motion it never advances by itself (AC-STORY-05). */
function StoryViewer({
  stories,
  start,
  week,
  coin,
  onClose,
  onAction,
}: {
  stories: ChTeamStory[];
  start: number;
  week: string;
  coin: (s: ChTeamStory) => ChTeamPlayer | null;
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
          <span>{whenOf(story, week)}</span>
        </span>
        <button type="button" className="xb" aria-label="Close stories" onClick={onClose}>
          <Icon icon={X} size={16} />
        </button>
      </div>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Next, in the footer, is the keyboard's way */}
      <div className="sto-b" onClick={next}>
        <h3>{shortOf(story)}</h3>
      </div>
      <div className="sto-f">
        <button type="button" className="btn" onClick={() => onAction(story)}>
          {story.kind === 'working' ? 'See Working on' : 'Open this'}
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
  onDesk,
  onAction,
}: {
  brief: ChCoachBrief | null;
  themes: Record<string, Record<string, ChDiveTheme>> | null;
  failed: boolean;
  onRetry?: () => void;
  players: readonly ChTeamPlayer[];
  phone: boolean;
  onDesk: (s: ChTeamStory) => void;
  onAction: (s: ChTeamStory) => void;
}) {
  const names = new Map(players.map((p) => [p.id, p.name]));
  const all = storiesOf(brief, themes, names).slice(0, MAX_TILES);
  const [seen, setSeen] = useChSessionState<string[]>('coachhelm-team-stories', []);
  const [open, setOpen] = useState<number | null>(null);
  const byName = new Map(players.map((p) => [p.name, p]));
  const coin = (s: ChTeamStory) => byName.get(s.who) ?? null;
  const week = brief?.week ?? 'This week';
  if (failed)
    return (
      <section className="card today" data-ch-team-card="today">
        <div className="ch">
          <h4>This week</h4>
        </div>
        <div className="notice">
          <div>
            <b>Couldn’t load what’s new</b>
            <span>The weekly brief didn’t load. Everything below is current.</span>
            {onRetry && (
              <Button variant="ghost" size="sm" onClick={onRetry}>
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
      {phone && open != null && (
        <StoryViewer
          stories={all}
          start={open}
          week={week}
          coin={coin}
          onClose={() => setOpen(null)}
          onAction={(s) => {
            setOpen(null);
            onAction(s);
          }}
        />
      )}
    </section>
  );
}

/** The desktop's story, in the inspector: no bars and no auto advance (AC-STORYDESK-01). */
export function StoryDeskPanel({ story, week, onClose, onAction }: { story: ChTeamStory; week: string; onClose: () => void; onAction: (s: ChTeamStory) => void }) {
  return (
    <>
      <div className="insh">
        <span className="c">
          <b>{story.who}</b>
          <span>{whenOf(story, week)}</span>
        </span>
        <button type="button" className="xb" aria-label="Close" onClick={onClose}>
          <Icon icon={X} size={16} />
        </button>
      </div>
      <div className="feat ch-htb-storydesk">
        <h3>{shortOf(story)}</h3>
      </div>
      <button type="button" className="btn pri" onClick={() => onAction(story)}>
        {story.kind === 'working' ? 'See Working on' : 'Open this'}
      </button>
    </>
  );
}
