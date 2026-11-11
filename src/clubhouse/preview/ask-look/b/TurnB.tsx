'use client';

import type { CSSProperties } from 'react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { LOOK, sg, toPar, tone, type LookFrame } from '../content';
import { HoldRing, Island, IslandDone, Question } from '../parts';

/* Direction B, the scorecard: the answer is the player's card. One ruled grid whose columns are his eight rounds carries
   the score, the trend and the four parts of the game; the one number that matters is ringed in pencil; and a task is
   not official until the coach signs it. No pictures: the grid is the look. */

const ROUNDS = LOOK.trend.scores.map((_, i) => i + 1);

/** A pencil ring round the figure that answers the question, the way a golfer rings a number on a card. */
function PencilRing() {
  return (
    <svg className="ch-look-b-ring" viewBox="0 0 52 30" preserveAspectRatio="none" aria-hidden="true">
      <path d="M27 2.2C39.5 1.6 49.6 7 49.8 14.6 50 22.6 39.8 27.9 26 27.8 12.4 27.7 2.1 22.4 2.2 14.9 2.3 7.6 11.6 2.6 24.4 2.3 27.6 2.2 30.8 2.6 33.6 3.3" />
    </svg>
  );
}

function Card() {
  const { figure, parts, trend, table, sources } = LOOK;
  const worst = parts.reduce((a, b) => (b.value < a.value ? b : a));
  const last = trend.scores.length - 1;
  return (
    <article className="ch-look-card" aria-label={`CoachHelm on ${LOOK.player}`}>
      <header className="ch-look-card__head">
        <h3>{LOOK.player}</h3>
        <span>{LOOK.window}</span>
      </header>
      <p className="ch-look-b-lead">{LOOK.lead}</p>

      <div className="ch-look-b-total">
        <p>
          <span>Largest loss</span>
          <b>{worst.name}</b>
          <span>{figure.note}</span>
        </p>
        <strong className="ch-num ch-look-b-total__n">{sg(figure.value)}</strong>
      </div>

      <div className="ch-look-b-grid" role="table" aria-label="Score to par and strokes gained, round by round">
        <div className="ch-num ch-look-b-row is-head" role="row">
          <span role="columnheader">Round</span>
          {ROUNDS.map((r) => (
            <span key={r} role="columnheader">
              {r}
            </span>
          ))}
          <span role="columnheader">Avg</span>
        </div>

        {/* Score to par: the numbers in their cells, and the same numbers drawn as one line through those columns. */}
        <div className="ch-num ch-look-b-row is-trend" role="row">
          <span role="rowheader">
            Score to par
            <small>
              {trend.dates[0]} to {trend.dates[last]}
            </small>
          </span>
          <span className="ch-look-b-plot" role="img" aria-label={`Score to par: ${trend.scores.map(toPar).join(', ')}`}>
            <svg viewBox="0 0 8 60" preserveAspectRatio="none" aria-hidden="true">
              <path d={trend.scores.map((s, i) => `${i === 0 ? 'M' : 'L'}${i + 0.5} ${6 + (s - 1) * 12}`).join('')} />
            </svg>
            {trend.scores.map((s, i) => (
              <i key={trend.dates[i]} className={i === last ? 'is-last' : undefined} style={{ '--ch-look-i': i, '--ch-look-s': s - 1 } as CSSProperties} />
            ))}
          </span>
          <span aria-hidden="true" />
        </div>
        <div className="ch-num ch-look-b-row is-score" role="row">
          <span role="rowheader" className="ch-sr-only">
            Score to par
          </span>
          <span aria-hidden="true" />
          {trend.scores.map((s, i) => (
            <span key={trend.dates[i]} role="cell">
              {toPar(s)}
            </span>
          ))}
          <b role="cell" className="ch-num">{toPar(trend.average)}</b>
        </div>

        <div className="ch-num ch-look-b-row is-sub" role="row">
          <span role="columnheader">Strokes gained</span>
          <span role="columnheader">Against the team, each round</span>
        </div>
        {parts.map((p) => (
          <div key={p.key} className={'ch-num ch-look-b-row is-part is-' + tone(p.value) + (p === worst ? ' is-worst' : '')} role="row">
            <span role="rowheader">{p.name}</span>
            {p.rounds.map((v, i) => (
              <span key={i} role="cell" aria-label={sg(v)}>
                <i className={'is-' + tone(v)} style={{ '--ch-look-v': Math.abs(v) } as CSSProperties} />
              </span>
            ))}
            <b role="cell" className="ch-num">
              {p === worst && <PencilRing />}
              {sg(p.value)}
            </b>
          </div>
        ))}

        <div className="ch-num ch-look-b-row is-sub" role="row">
          <span role="columnheader">{table.title}</span>
          <span role="columnheader">A round</span>
        </div>
        {table.rows.map((r, i) => (
          <div key={r.range} className="ch-num ch-look-b-row is-rank" role="row">
            <span role="rowheader">
              <em>{i + 1}</em>
              {r.range}
            </span>
            <span role="cell">{r.shots} shots</span>
            <b role="cell" className="ch-num">{sg(r.value)}</b>
          </div>
        ))}
      </div>

      <footer className="ch-look-b-src">
        {sources.map((s) => (
          <button type="button" key={s.n} className="ch-look-b-src__cell">
            <span>Source {s.n}</span>
            <b>{s.title}</b>
            <small>{s.meta}</small>
            <Icon icon={ChevronRight} size={14} />
          </button>
        ))}
      </footer>
    </article>
  );
}

function SignCard({ holding }: { holding: boolean }) {
  const { task } = LOOK;
  return (
    <article className="ch-look-card ch-look-b-task" aria-label={task.title}>
      <header className="ch-look-card__head">
        <h3>{task.kind}</h3>
        <Badge tone={holding ? 'warning' : 'neutral'}>{holding ? 'Holding' : 'Not saved'}</Badge>
      </header>
      <p className="ch-look-b-task__t">{task.title}</p>
      <dl className="ch-look-b-task__rows">
        {task.fields.map((f) => (
          <div key={f.key}>
            <dt>{f.key}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
      {/* The attest line: a card is not official until it is signed. Confirm signs it; the hold is the ink drying. */}
      <div className={'ch-look-b-sign' + (holding ? ' is-signed' : '')}>
        <span className="ch-look-b-sign__x" aria-hidden="true">
          <svg viewBox="0 0 12 12">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </span>
        <span className="ch-look-b-sign__line">{holding ? LOOK.coach : ' '}</span>
        <small>{holding ? 'Signed by the head coach' : 'Head coach signs to save'}</small>
      </div>
      {holding ? (
        <footer className="ch-look-b-task__foot is-hold">
          <HoldRing left={task.hold.left} total={task.hold.total} />
          <p aria-live="polite">{task.hold.line}</p>
          <Button variant="secondary" size="lg">
            Undo
          </Button>
        </footer>
      ) : (
        <footer className="ch-look-b-task__foot">
          <Button variant="ghost" size="lg">
            Not now
          </Button>
          <Button variant="primary" size="lg">
            Confirm
          </Button>
        </footer>
      )}
    </article>
  );
}

export function TurnB({ frame }: { frame: LookFrame }) {
  if (frame === 'work')
    return (
      <>
        <Question text={LOOK.question} />
        <Island ruled />
      </>
    );
  if (frame === 'answer')
    return (
      <>
        <Question text={LOOK.question} />
        <IslandDone />
        <Card />
      </>
    );
  return (
    <>
      <Question text={LOOK.task.question} />
      <IslandDone summary="Drafted the focus" meta="1 step · 2 s" />
      <p className="ch-look-say">{LOOK.task.lead}</p>
      <SignCard holding={frame === 'hold'} />
    </>
  );
}
