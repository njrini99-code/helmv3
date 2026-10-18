'use client';

import { useId } from 'react';
import type { ChTeamForm } from '../../data/home';
import { changeTone, formatFixed, formatSigned, NO_DATA } from '../../lib/format';
import { useInViewOnce } from '../../lib/use-in-view';
import { withPointSpan } from '../../ui/point-span';
import { formBasis, partOf } from './HomePhone';

const PAD_X = 2;
const PAD_TOP = 14;
const PAD_BOTTOM = 14;

/**
 * P002: the team's scoring form on the coach's desktop Home, the same Last 10 figures the phone strip and Team stats read: the
 * average with its change, the team's average on each of its last round days as a line (drawn once, left to right, the first time it
 * is seen), and the week's rounds, greens and putts. Nothing here is computed beyond a scale: it is `data.phone.form` as it is.
 */
export function TeamForm({ form }: { form: ChTeamForm }) {
  const id = useId();
  const [ref, seen] = useInViewOnce<HTMLDivElement>(0.2);
  const pts = form.line;
  const tone = changeTone(form.delta, true, 1);
  const drawn = pts.length > 1;
  const best = drawn ? Math.min(...pts) : 0;
  const worst = drawn ? Math.max(...pts) : 0;
  const x = (i: number) => PAD_X + (i * (100 - 2 * PAD_X)) / Math.max(1, pts.length - 1);
  const y = (v: number) => PAD_TOP + ((v - best) / (worst - best || 1)) * (100 - PAD_TOP - PAD_BOTTOM);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const last = pts[pts.length - 1] ?? 0;
  return (
    <section className="ch-h-form" aria-labelledby={`${id}-t`} data-tone={tone || 'flat'}>
      <div className="ch-h-form__lead">
        <h2 id={`${id}-t`}>Team scoring average</h2>
        <b className="ch-h-form__big ch-num">{withPointSpan(formatFixed(form.avg))}</b>
        <span className={'ch-h-form__delta ch-num ' + tone}>
          {form.delta != null ? (
            <>
              {formatSigned(form.delta)} <em>vs previous 10</em>
            </>
          ) : (
            <em>No earlier ten to compare</em>
          )}
        </span>
        <span className="ch-h-form__basis">{formBasis(form.basis)}</span>
      </div>
      {drawn && (
        <div ref={ref} className={'ch-h-form__plot' + (seen ? ' is-in' : '')}>
          <svg className="ch-h-form__svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`The team’s average on each of its last ${pts.length} round days, from ${formatFixed(pts[0]!)} to ${formatFixed(last)}`}>
            <defs>
              <linearGradient id={`${id}-f`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" className="ch-h-form__s0" />
                <stop offset="1" className="ch-h-form__s1" />
              </linearGradient>
            </defs>
            <line className="ch-h-form__grid" x1="0" x2="100" y1={y(best)} y2={y(best)} />
            <line className="ch-h-form__grid" x1="0" x2="100" y1={y(worst)} y2={y(worst)} />
            <path className="ch-h-form__fill" d={`${d} L${x(pts.length - 1)},100 L${x(0)},100 Z`} fill={`url(#${id}-f)`} />
            <path className="ch-h-form__line" d={d} />
          </svg>
          <span className="ch-h-form__tick ch-num" style={{ top: `${y(best)}%` }} aria-hidden="true">{formatFixed(best)}</span>
          {worst !== best && <span className="ch-h-form__tick ch-num" style={{ top: `${y(worst)}%` }} aria-hidden="true">{formatFixed(worst)}</span>}
          <span className="ch-h-form__dot" style={{ left: `${x(pts.length - 1)}%`, top: `${y(last)}%` }} aria-hidden="true" />
        </div>
      )}
      <dl className="ch-h-form__figs">
        <div><dt>Rounds</dt><dd className="ch-num">{form.roundsThisWeek}</dd><dd>this week</dd></div>
        <div>
          <dt>GIR</dt>
          <dd className="ch-num">{form.gir.pct != null ? `${Math.round(form.gir.pct)}%` : NO_DATA}</dd>
          <dd className={'ch-num ' + changeTone(form.gir.delta, false, 0)}>{form.gir.delta != null ? `${formatSigned(form.gir.delta, 0)} pts` : partOf(form.basis.girRounds, form.basis.rounds)}</dd>
        </div>
        <div>
          <dt>Putts</dt>
          <dd className="ch-num">{form.putts.avg != null ? formatFixed(form.putts.avg) : NO_DATA}</dd>
          <dd className={'ch-num ' + changeTone(form.putts.delta, true, 1)}>{form.putts.delta != null ? formatSigned(form.putts.delta) : partOf(form.basis.puttsRounds, form.basis.rounds)}</dd>
        </div>
      </dl>
    </section>
  );
}
