'use client';

import { ChevronRight } from 'lucide-react';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { LOOK, sg, toPar, tone, type LookFrame } from '../content';
import { HoldRing, Island, IslandDone, Question } from '../parts';

/* Direction A, the yardage book: the answer is a leaf from a caddie's book. The hole is drawn in plan, the strokes are
   sounded off it on the same tee-to-green axis, and every source is a pencilled numeral hung in the margin. */

/** A pencilled source mark, hung in the leaf's margin beside what it supports. */
function Mark({ n }: { n: number }) {
  return (
    <button type="button" className="ch-look-a-mark" aria-label={`Source ${n}: ${LOOK.sources[n - 1]?.title}`}>
      {n}
    </button>
  );
}

/* The plan: where on the hole each part of the game is played, in drawing units (318 wide). */
const STATIONS = { tee: { x: 30, y: 92 }, approach: { x: 123, y: 78 }, around: { x: 222, y: 62 }, putting: { x: 280, y: 45 } } as const;
const ZERO = 186;
const PER_STROKE = 54;
const SPINE = 'M30 92C78 104 112 88 142 66S216 30 276 42';
const FAIRWAY = 'M66 97C96 96 120 84 142 66S190 42 218 40';

function HolePlan() {
  return (
    <svg className="ch-look-a-hole" viewBox="-2 0 322 260" role="img" aria-label={'Strokes gained from tee to green: ' + LOOK.parts.map((p) => `${p.name} ${sg(p.value)}`).join(', ')}>
      {/* The hole in plan, as a yardage book draws it: rough, fairway, the green and its fringe, sand, trees, the tee and the pin. */}
      <path className="ch-look-a-hole__rough is-edge" d={SPINE} />
      <path className="ch-look-a-hole__rough" d={SPINE} />
      <path className="ch-look-a-hole__fairway is-edge" d={FAIRWAY} />
      <path className="ch-look-a-hole__fairway" d={FAIRWAY} />
      <ellipse className="ch-look-a-hole__fringe" cx="276" cy="42" rx="37" ry="28" />
      <ellipse className="ch-look-a-hole__green" cx="276" cy="42" rx="30" ry="21.5" />
      <ellipse className="ch-look-a-hole__sand" cx="100" cy="70" rx="9" ry="5" transform="rotate(-20 100 70)" />
      <ellipse className="ch-look-a-hole__sand" cx="234" cy="76" rx="10.5" ry="5.5" transform="rotate(-26 234 76)" />
      <ellipse className="ch-look-a-hole__sand" cx="243" cy="19" rx="8.5" ry="4.5" transform="rotate(20 243 19)" />
      {[
        [78, 54, 6.5],
        [91, 45, 5],
        [66, 46, 4.5],
        [184, 92, 6.5],
        [198, 99, 5],
        [171, 101, 4.5],
      ].map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} className="ch-look-a-hole__tree" cx={cx} cy={cy} r={r} />
      ))}
      <rect className="ch-look-a-hole__tee" x="20" y="86" width="20" height="12" rx="2" transform="rotate(10 30 92)" />
      <path className="ch-look-a-hole__line" d="M30 92C78 104 112 88 142 66S216 30 290 37" />
      <path className="ch-look-a-hole__pole" d="M290 37V15" />
      <path className="ch-look-a-hole__flag" d="M290 15l11.5 4.2-11.5 4.2z" />
      <ellipse className="ch-look-a-hole__cup" cx="290" cy="37" rx="2.2" ry="1.1" />

      {/* The soundings: one stem per part of the game, on the plan's own axis. Above the baseline he gains, below he loses. */}
      <path className="ch-look-a-hole__zero" d={`M0 ${ZERO}H318`} />
      <text className="ch-look-a-hole__base" x="0" y={ZERO + 15}>
        Team baseline
      </text>
      {LOOK.parts.map((p) => {
        const at = STATIONS[p.key];
        const end = ZERO - p.value * PER_STROKE;
        const up = p.value > 0;
        const name = p.key === 'around' ? ['Around', 'the green'] : [p.name];
        const anchor = p.key === 'tee' ? 'start' : 'middle';
        const nameX = p.key === 'tee' ? 8 : at.x;
        return (
          <g key={p.key} className={`ch-look-a-hole__part is-${tone(p.value)}`}>
            <circle className="ch-look-a-hole__station" cx={at.x} cy={at.y} r="3.5" />
            <path className="ch-look-a-hole__lead" d={`M${at.x} ${at.y + 7}V${name.length > 1 ? 121 : 135}`} />
            <text className="ch-look-a-hole__name" x={nameX} y={name.length > 1 ? 134 : 148} textAnchor={anchor}>
              {name.map((line, i) => (
                <tspan key={line} x={nameX} dy={i === 0 ? 0 : 14}>
                  {line}
                </tspan>
              ))}
            </text>
            <path className="ch-look-a-hole__stem" d={`M${at.x} ${ZERO}V${end}`} />
            <circle className="ch-look-a-hole__end" cx={at.x} cy={end} r="4" />
            <text className="ch-num ch-look-a-hole__value" x={at.x} y={up ? end - 9 : end + 19} textAnchor="middle">
              {sg(p.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Trend() {
  const { scores, dates } = LOOK.trend;
  const x = (i: number) => 40 + i * 37;
  const y = (s: number) => 12 + s * 18;
  const last = scores.length - 1;
  return (
    <svg className="ch-look-a-trend" viewBox="0 0 318 142" role="img" aria-label={`${LOOK.trend.title}: ${scores.map(toPar).join(', ')}`}>
      {[0, 1, 2, 3, 4, 5].map((s) => (
        <path key={s} className={'ch-look-a-trend__grid' + (s % 2 ? ' is-minor' : '')} d={`M24 ${y(s)}H318`} />
      ))}
      {[0, 2, 4].map((s) => (
        <text key={s} className="ch-num ch-look-a-trend__axis" x="0" y={y(s) + 4}>
          {toPar(s)}
        </text>
      ))}
      <path className="ch-look-a-trend__path" d={scores.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(s)}`).join('')} />
      {scores.map((s, i) => (
        <circle key={dates[i]} className={'ch-look-a-trend__pt' + (i === last ? ' is-last' : '')} cx={x(i)} cy={y(s)} r={i === last ? 4.5 : 3} />
      ))}
      <text className="ch-num ch-look-a-trend__first" x={x(0)} y={y(scores[0]!) + 18} textAnchor="middle">
        {toPar(scores[0]!)}
      </text>
      <text className="ch-num ch-look-a-trend__last" x={x(last) - 10} y={y(scores[last]!) - 3} textAnchor="end">
        {toPar(scores[last]!)}
      </text>
      <text className="ch-num ch-look-a-trend__axis" x={x(0)} y="138" textAnchor="middle">
        {dates[0]}
      </text>
      <text className="ch-num ch-look-a-trend__axis" x="318" y="138" textAnchor="end">
        {dates[last]}
      </text>
    </svg>
  );
}

function Leaf() {
  const { figure, table, sources } = LOOK;
  return (
    <article className="ch-look-leaf" aria-label={`CoachHelm on ${LOOK.player}`}>
      <header className="ch-look-leaf__head">
        <span>{LOOK.player}</span>
        <span>{LOOK.window}</span>
      </header>
      <div className="ch-look-leaf__pages">
        <div className="ch-look-leaf__page">
          <p className="ch-look-a-lead">
            {LOOK.lead}
            <Mark n={1} />
          </p>
          <div className="ch-look-a-fig">
            <span className="ch-num ch-look-a-fig__n">{sg(figure.value)}</span>
            <b className="ch-look-a-fig__l">{figure.label}</b>
            <span className="ch-look-a-fig__c">{figure.note}</span>
          </div>
          <section className="ch-look-a-sec">
            <h3 className="ch-look-a-sec__h">
              <span>
                Tee to green
                <Mark n={1} />
              </span>
              <span>Strokes gained a round</span>
            </h3>
            <HolePlan />
          </section>
        </div>
        <div className="ch-look-leaf__page">
          <section className="ch-look-a-sec">
            <h3 className="ch-look-a-sec__h">
              <span>
                {LOOK.trend.title}
                <Mark n={2} />
              </span>
              <span>Average {toPar(LOOK.trend.average)}</span>
            </h3>
            <Trend />
            <p className="ch-look-a-note">{LOOK.trend.note}</p>
          </section>
          <section className="ch-look-a-sec">
            <h3 className="ch-look-a-sec__h">
              <span>
                {table.title}
                <Mark n={3} />
              </span>
              <span>A round</span>
            </h3>
            <ol className="ch-look-a-rank">
              {table.rows.map((r, i) => (
                <li key={r.range}>
                  <span className="ch-num ch-look-a-rank__n">{i + 1}</span>
                  <span className="ch-look-a-rank__t">{r.range}</span>
                  <span className="ch-num ch-look-a-rank__m">{r.shots} shots</span>
                  <b className="ch-num ch-look-a-rank__v">{sg(r.value)}</b>
                </li>
              ))}
            </ol>
          </section>
          <footer className="ch-look-a-src">
            <h3 className="ch-look-a-src__h">Sources</h3>
            {sources.map((s) => (
              <button type="button" key={s.n} className="ch-look-a-src__row">
                <span className="ch-num ch-look-a-src__n">{s.n}</span>
                <span className="ch-look-a-src__t">{s.title}</span>
                <span className="ch-look-a-src__m">{s.meta}</span>
                <Icon icon={ChevronRight} size={14} />
              </button>
            ))}
          </footer>
        </div>
      </div>
    </article>
  );
}

/** The putt the focus is about, as a pin sheet draws a green: the cup, the fall line, and the 4 to 6 foot band above it. */
function PinDrawing() {
  return (
    <svg className="ch-look-a-pin" viewBox="0 0 76 76" aria-hidden="true">
      <circle className="ch-look-a-pin__green" cx="38" cy="38" r="34" />
      <path className="ch-look-a-pin__band" d="M23.3 31.9A26 26 0 0 1 52.7 31.9L47.6 39.2A17 17 0 0 0 28.4 39.2Z" />
      <path className="ch-look-a-pin__fall" d="M38 8V24" />
      <path className="ch-look-a-pin__arrow" d="M34.5 13.5 38 17l3.5-3.5M34.5 19.5 38 23l3.5-3.5" />
      <path className="ch-look-a-pin__putt" d="M38 35.5V50" />
      <path className="ch-look-a-pin__pole" d="M38 53 45.5 38.5" />
      <path className="ch-look-a-pin__flag" d="M45.5 38.5l8.6 4.4-10.2 2.2z" />
      <ellipse className="ch-look-a-pin__cup" cx="38" cy="53" rx="3" ry="1.5" />
      <circle className="ch-look-a-pin__ball" cx="38" cy="31.5" r="2.6" />
    </svg>
  );
}

function PinSheet({ holding }: { holding: boolean }) {
  const { task } = LOOK;
  const before = task.fields.slice(0, 4);
  const after = task.fields.slice(4);
  return (
    <article className="ch-look-leaf ch-look-a-task" aria-label={task.title}>
      <header className="ch-look-leaf__head">
        <span>{task.kind}</span>
        <Badge tone={holding ? 'warning' : 'neutral'}>{holding ? 'Holding' : 'Not saved'}</Badge>
      </header>
      <div className="ch-look-a-task__top">
        <h3 className="ch-look-a-task__t">{task.title}</h3>
        <PinDrawing />
      </div>
      <dl className="ch-look-a-task__rows">
        {before.map((f) => (
          <div key={f.key}>
            <dt>{f.key}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
      <dl className="ch-look-a-task__rows is-after">
        {after.map((f) => (
          <div key={f.key}>
            <dt>{f.key}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
      {holding ? (
        <footer className="ch-look-a-task__foot is-hold">
          <HoldRing left={task.hold.left} total={task.hold.total} />
          <p aria-live="polite">{task.hold.line}</p>
          <Button variant="secondary" size="lg">
            Undo
          </Button>
        </footer>
      ) : (
        <footer className="ch-look-a-task__foot">
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

export function TurnA({ frame }: { frame: LookFrame }) {
  if (frame === 'work')
    return (
      <>
        <Question text={LOOK.question} />
        <Island />
      </>
    );
  if (frame === 'answer')
    return (
      <>
        <Question text={LOOK.question} />
        <IslandDone />
        <Leaf />
      </>
    );
  return (
    <>
      <Question text={LOOK.task.question} />
      <IslandDone summary="Drafted the focus" meta="1 step · 2 s" />
      <p className="ch-look-say">{LOOK.task.lead}</p>
      <PinSheet holding={frame === 'hold'} />
    </>
  );
}
