'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { GripVertical } from 'lucide-react';
import { DeltaChip, deltaState } from '../../../ui/DeltaChip';
import { Icon } from '../../../ui/Icon';
import { NO_DATA } from '../format';
import { METRICS, type TourMetricKey } from '../metrics';
import { deltaUnit, figureText, sampleWords, verdict, type SideFigure } from './model';

export type Figures = Record<string, SideFigure>;

/** What the grid needs besides the figures: the two sides' short labels and what opening a figure does. */
export interface GridProps {
  keys: readonly TourMetricKey[];
  a: Figures;
  b: Figures;
  labA: string;
  labB: string;
  onOpen: (side: 'a' | 'b', key: TourMetricKey) => void;
}

/** Dots for every round on one shared scale, the side's own average as a bar, the other side's as a dashed line. */
function Strip({ values, lo, hi, mean, other }: { values: number[]; lo: number; hi: number; mean: number | null; other: number | null }) {
  const x = (v: number) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);
  return (
    <span className="ch-tour-cmp-strip" aria-hidden="true">
      <i className="ch-tour-cmp-strip__axis" />
      {other != null && <i className="ch-tour-cmp-strip__other" style={{ left: `${x(other)}%` }} />}
      {values.map((v, i) => (
        <i key={i} className="ch-tour-cmp-strip__dot" style={{ left: `${x(v)}%` }} />
      ))}
      {mean != null && <i className="ch-tour-cmp-strip__mean" style={{ left: `${x(mean)}%` }} />}
    </span>
  );
}

function scaleOf(a: SideFigure, b: SideFigure) {
  const all = [...a.values, ...b.values];
  return { lo: all.length ? Math.min(...all) : 0, hi: all.length ? Math.max(...all) : 1 };
}

/** One side's value for one metric: a key that opens the rounds behind it. */
function Value({ keyName, side, f, other, lo, hi, onOpen }: { keyName: TourMetricKey; side: 'a' | 'b'; f: SideFigure; other: SideFigure; lo: number; hi: number; onOpen: GridProps['onOpen'] }) {
  const def = METRICS[keyName];
  const empty = f.state === 'none';
  const text = empty ? NO_DATA : figureText(def, f.result.value);
  return (
    <button
      type="button"
      className={'ch-tour-cmp-v' + (empty ? ' is-empty' : '') + (f.state === 'early' ? ' is-early' : '')}
      onClick={() => onOpen(side, keyName)}
      aria-label={`${def.label}, ${side.toUpperCase()}: ${empty ? 'no data' : text}. ${sampleWords(def, f)}. Open the rounds behind it.`}
    >
      <span className="ch-tour-cmp-v__top">
        <span className="ch-tour-cmp-v__n ch-num">{text}</span>
        <span className="ch-tour-cmp-v__d">{sampleWords(def, f)}</span>
      </span>
      {!empty && <Strip values={f.values} lo={lo} hi={hi} mean={f.state !== 'none' ? f.result.value : null} other={other.state !== 'none' ? other.result.value : null} />}
    </button>
  );
}

/** The difference, written with the kit's chip (green only when it is real, amber the other way, Level otherwise). */
function Difference({ keyName, a, b, labA }: { keyName: TourMetricKey; a: SideFigure; b: SideFigure; labA: string }) {
  const def = METRICS[keyName];
  const v = verdict(def, a, b);
  if (v.kind === 'none')
    return (
      <>
        <b className="ch-tour-cmp-dl__none">{NO_DATA}</b>
        <span>{v.why}</span>
      </>
    );
  const state = deltaState(v.diff, v.se, def.better, def.mmd);
  const early = a.state === 'early' || b.state === 'early';
  return (
    <>
      <DeltaChip value={v.diff} se={v.se} better={def.better} unit={deltaUnit(def)} threshold={def.mmd} digits={def.unit === 'sg' ? 2 : undefined} against="than B" />
      <span>
        {state === 'gain' ? `${labA} is better` : state === 'loss' ? `${labA} is worse` : 'No clear gap'}
        {early ? ' · early read' : ''}
      </span>
    </>
  );
}

const clamp = (n: number) => Math.max(0.35, Math.min(0.65, n));

/**
 * The desktop grid (board `cd-body`): metric, A, a draggable divider, B and the difference, on one aligned scale. The
 * divider moves the columns' share (35 to 65 percent): drag it, or use the arrows; Home or Enter puts it back at 50.
 */
export function CompareGrid({ keys, a, b, labA, labB, onOpen, split, onSplit }: GridProps & { split: number; onSplit: (s: number) => void }) {
  const body = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const down = (e: PointerEvent<HTMLElement>) => {
    const box = body.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    setDrag(true);
    const cs = getComputedStyle(body.current as HTMLElement);
    const mc = parseFloat(cs.getPropertyValue('--ch-tour-cmp-mcol')) || 190;
    const dc = parseFloat(cs.getPropertyValue('--ch-tour-cmp-dcol')) || 200;
    const left = box.left + mc;
    const width = box.width - mc - dc - 14;
    const move = (ev: globalThis.PointerEvent) => onSplit(clamp((ev.clientX - left) / width));
    const up = () => {
      setDrag(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') onSplit(clamp(split - 0.02));
    else if (e.key === 'ArrowRight') onSplit(clamp(split + 0.02));
    else if (e.key === 'Home' || e.key === 'Enter') onSplit(0.5);
    else return;
    e.preventDefault();
  };
  const pct = Math.round(split * 100);
  return (
    <div className="ch-tour-cmp-body" ref={body} role="table" aria-label="Comparison" style={{ gridTemplateColumns: `var(--ch-tour-cmp-mcol) minmax(0, ${split}fr) 14px minmax(0, ${1 - split}fr) var(--ch-tour-cmp-dcol)` }}>
      <div className="ch-tour-cmp-hd" role="row">
        <div role="columnheader">Metric</div>
        <div role="columnheader" className="ch-tour-cmp-hd__ab">
          <span className="ch-tour-cmp-tag">A</span>
          <b>{labA}</b>
        </div>
        <div role="presentation" className="ch-tour-cmp-gap" />
        <div role="columnheader" className="ch-tour-cmp-hd__ab">
          <span className="ch-tour-cmp-tag is-b">B</span>
          <b>{labB}</b>
        </div>
        <div role="columnheader">
          <b>Difference</b>
          <span>
            {labA} vs {labB}
          </span>
        </div>
      </div>
      {keys.map((k) => {
        const def = METRICS[k];
        const fa = a[k]!;
        const fb = b[k]!;
        const { lo, hi } = scaleOf(fa, fb);
        return (
          <div key={k} className="ch-tour-cmp-row" role="row">
            <div role="rowheader" className="ch-tour-cmp-m">
              <b>{def.label}</b>
              <span>{def.better === 'lower' ? 'Lower is better' : 'Higher is better'}</span>
            </div>
            <div role="cell">
              <Value keyName={k} side="a" f={fa} other={fb} lo={lo} hi={hi} onOpen={onOpen} />
            </div>
            <div role="presentation" className="ch-tour-cmp-gap" />
            <div role="cell">
              <Value keyName={k} side="b" f={fb} other={fa} lo={lo} hi={hi} onOpen={onOpen} />
            </div>
            <div role="cell" className="ch-tour-cmp-dl">
              <Difference keyName={k} a={fa} b={fb} labA={labA} />
            </div>
          </div>
        );
      })}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- a focusable separator is the ARIA window splitter: the arrows resize it */}
      <div
        className={'ch-tour-cmp-div' + (drag ? ' is-drag' : '')}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize A and B columns"
        aria-valuemin={35}
        aria-valuemax={65}
        aria-valuenow={pct}
        aria-valuetext={`A ${pct} percent, B ${100 - pct} percent`}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the window splitter takes focus so the arrows can resize it
        tabIndex={0}
        onPointerDown={down}
        onDoubleClick={() => onSplit(0.5)}
        onKeyDown={key}
        style={{ left: `calc(var(--ch-tour-cmp-mcol) + (100% - var(--ch-tour-cmp-mcol) - var(--ch-tour-cmp-dcol) - 14px) * ${split} + 7px)` }}
      >
        <span className="ch-tour-cmp-div__grip">
          <Icon icon={GripVertical} size={14} />
        </span>
      </div>
      <div className="ch-tour-cmp-foot">
        <span>Dots are rounds on one shared scale · the bar is the average · the dashed line is the other side’s average. Open any value for the rounds behind it.</span>
        <span className="ch-tour-cmp-split">
          {pct} / {100 - pct}
          {split !== 0.5 && (
            <button type="button" className="ch-tour-cmp-link" onClick={() => onSplit(0.5)}>
              Reset
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

/** The phone's blocks (board `tm-block`): a metric, A and B side by side, the difference under them. */
export function CompareBlocks({ keys, a, b, labA, labB, onOpen }: GridProps) {
  return (
    <div className="ch-tour-cmp-blocks">
      {keys.map((k) => {
        const def = METRICS[k];
        const fa = a[k]!;
        const fb = b[k]!;
        const { lo, hi } = scaleOf(fa, fb);
        return (
          <section key={k} className="ch-tour-cmp-block" aria-label={def.label}>
            <div className="ch-tour-cmp-block__h">
              <b>{def.label}</b>
              <span>{def.better === 'lower' ? 'Lower is better' : 'Higher is better'}</span>
            </div>
            <div className="ch-tour-cmp-block__ab">
              <Value keyName={k} side="a" f={fa} other={fb} lo={lo} hi={hi} onOpen={onOpen} />
              <Value keyName={k} side="b" f={fb} other={fa} lo={lo} hi={hi} onOpen={onOpen} />
            </div>
            <div className="ch-tour-cmp-block__d">
              <Difference keyName={k} a={fa} b={fb} labA={labA} />
            </div>
            <span className="ch-sr-only">
              {labA} against {labB}
            </span>
          </section>
        );
      })}
    </div>
  );
}
