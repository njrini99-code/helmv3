'use client';

import type { CSSProperties } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { LOOK, sg, toPar, tone, type LookFrame } from '../content';
import { BallMark, HoldRing, Island, Question } from '../parts';

/* Direction C, the big board: the answer goes up on the tournament scoreboard. Deep green, ivory type, and every figure
   on its own ivory plate, the way a board is posted by hand. The activity panel is the same board before the plates go
   up, so the work and the answer are one object. */

/** A figure on its plate. `big` sets one plate per character, as a board's number plates hang. */
function Plates({ text }: { text: string }) {
  // The decimal point shares the plate of the digit before it: a board has no plate for a point.
  const cells = text.match(/.\.?/gu) ?? [text];
  return (
    <span className="ch-look-c-plates" role="img" aria-label={text}>
      {cells.map((c, i) => (
        <span key={i} className="ch-num ch-look-plate is-big" aria-hidden="true">
          {c}
        </span>
      ))}
    </span>
  );
}

function Board() {
  const { figure, parts, trend, table, sources, work } = LOOK;
  return (
    <article className="ch-look-board" aria-label={`CoachHelm on ${LOOK.player}`}>
      <header className="ch-look-board__head">
        <BallMark size={22} />
        <h3>{LOOK.player}</h3>
        <button type="button" className="ch-look-board__steps" aria-expanded="false">
          {work.meta}
          <Icon icon={ChevronDown} size={14} />
        </button>
      </header>
      <div className="ch-look-board__cols">
        <div>
          <p className="ch-look-c-lead">{LOOK.lead}</p>
          <div className="ch-look-c-fig">
            <Plates text={sg(figure.value)} />
            <b>{figure.label}</b>
            <span>{figure.note}</span>
          </div>
          <section className="ch-look-c-sec">
            <h4>
              Strokes gained a round<span>{LOOK.window.split(' · ')[0]}</span>
            </h4>
            <ul className="ch-look-c-parts">
              {parts.map((p) => (
                <li key={p.key}>
                  <span>{p.name}</span>
                  <i className={'is-' + tone(p.value)} style={{ '--ch-look-v': Math.abs(p.value) } as CSSProperties} aria-hidden="true" />
                  <b className="ch-num ch-look-plate">{sg(p.value)}</b>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <div>
          <section className="ch-look-c-sec">
            <h4>
              {trend.title}
              <span>Average {toPar(trend.average)}</span>
            </h4>
            {/* The plates hang on the board's rails: one rail a stroke, the highest plate is the best round. */}
            <ol className="ch-look-c-pegs" aria-label={`${trend.title}: ${trend.scores.map(toPar).join(', ')}`}>
              {trend.scores.map((s, i) => (
                <li key={trend.dates[i]} style={{ '--ch-look-s': s - 1 } as CSSProperties}>
                  <b className="ch-num ch-look-plate">{toPar(s)}</b>
                  <span className="ch-num">{i + 1}</span>
                </li>
              ))}
            </ol>
            <p className="ch-look-c-note">{trend.note}</p>
          </section>
          <section className="ch-look-c-sec">
            <h4>
              {table.title}
              <span>A round</span>
            </h4>
            <ol className="ch-look-c-rank">
              {table.rows.map((r, i) => (
                <li key={r.range}>
                  <em>{i + 1}</em>
                  <span>{r.range}</span>
                  <small className="ch-num">{r.shots} shots</small>
                  <b className="ch-num ch-look-plate">{sg(r.value)}</b>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
      <footer className="ch-look-c-src">
        <h4>Posted from</h4>
        <div>
          {sources.map((s) => (
            <button type="button" key={s.n}>
              <b>{s.title}</b>
              <small>{s.meta}</small>
              <Icon icon={ChevronRight} size={14} />
            </button>
          ))}
        </div>
      </footer>
    </article>
  );
}

function PostCard({ holding }: { holding: boolean }) {
  const { task } = LOOK;
  const before = task.fields.slice(0, 4);
  const after = task.fields.slice(4);
  return (
    <article className="ch-look-board ch-look-c-task" aria-label={task.title}>
      <header className="ch-look-board__head">
        <BallMark size={22} />
        <h3>{task.kind}</h3>
        <Badge tone={holding ? 'warning' : 'neutral'}>{holding ? 'Holding' : 'Not saved'}</Badge>
      </header>
      <p className="ch-look-c-task__t">{task.title}</p>
      <dl className="ch-look-c-slats">
        {before.map((f) => (
          <div key={f.key}>
            <dt>{f.key}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
      <dl className="ch-look-c-after">
        {after.map((f) => (
          <div key={f.key}>
            <dt>{f.key}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
      {/* The sill under the board: the one place on it that is ivory, so the real green key and the real Undo sit on paper. */}
      {holding ? (
        <footer className="ch-look-c-sill is-hold">
          <HoldRing left={task.hold.left} total={task.hold.total} />
          <p aria-live="polite">{task.hold.line}</p>
          <Button variant="secondary" size="lg">
            Undo
          </Button>
        </footer>
      ) : (
        <footer className="ch-look-c-sill">
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

export function TurnC({ frame }: { frame: LookFrame }) {
  if (frame === 'work')
    return (
      <>
        <Question text={LOOK.question} />
        <Island slats />
      </>
    );
  if (frame === 'answer')
    return (
      <>
        <Question text={LOOK.question} />
        <Board />
      </>
    );
  return (
    <>
      <Question text={LOOK.task.question} />
      <p className="ch-look-say">{LOOK.task.lead}</p>
      <PostCard holding={frame === 'hold'} />
    </>
  );
}
