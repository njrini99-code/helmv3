'use client';

/**
 * StrokesWaterfall: "where your strokes go".
 *
 * A horizontal waterfall from the zero line: each strokes-gained category is
 * a step from the running total (green right = gained, amber left = lost),
 * ending on the net bar. Every row is a real <button> (44pt minimum) that
 * opens that category's evidence. Direct labels and signed tabular values
 * sit on the rows; there is no legend. A category the data layer did not
 * measure shows "not measured" and does not move the total.
 *
 * Drawn at first paint: no draw-in, no count-up (motion-haptics §1.4).
 */

import { cn } from '@/lib/utils';
import {
  formatSignedValue,
  toPercentX,
  type SgAreaKey,
  type Waterfall,
} from './fingerprint-model';

export interface StrokesWaterfallProps {
  waterfall: Waterfall;
  onSelect?: (key: SgAreaKey) => void;
}

const ROW_GRID = 'grid grid-cols-[92px_minmax(0,1fr)_52px] items-center gap-x-3 sm:grid-cols-[132px_minmax(0,1fr)_64px]';

function tone(value: number | null) {
  if (value == null || Math.abs(value) < 0.05) return 'neutral' as const;
  return value > 0 ? ('gain' as const) : ('loss' as const);
}

const BAR_CLASS = {
  gain: 'bg-fw-success',
  loss: 'bg-fw-warning',
  neutral: 'bg-border-strong',
} as const;

const INK_CLASS = {
  gain: 'text-fw-success-ink',
  loss: 'text-fw-warning-ink',
  neutral: 'text-text-secondary',
} as const;

export function StrokesWaterfall({ waterfall, onSelect }: StrokesWaterfallProps) {
  const { steps, net, domain } = waterfall;
  const zeroX = toPercentX(0, domain);

  const span = (a: number, b: number) => {
    const l = toPercentX(Math.min(a, b), domain);
    const r = toPercentX(Math.max(a, b), domain);
    return { left: `${l}%`, width: `${Math.max(r - l, 0.6)}%` };
  };

  return (
    <div data-slot="strokes-waterfall" className="relative">
      {/* Zero line + domain ticks share the bar column's geometry. */}
      <div className={cn(ROW_GRID, 'pb-1')} aria-hidden="true">
        <span />
        <span className="relative h-4 font-fw-sans text-caption tabular-nums text-text-tertiary">
          <span className="absolute left-0">{formatSignedValue(domain[0], domain[0] % 1 === 0 ? 0 : 1)}</span>
          <span className="absolute -translate-x-1/2" style={{ left: `${zeroX}%` }}>
            0
          </span>
          <span className="absolute right-0">{formatSignedValue(domain[1], domain[1] % 1 === 0 ? 0 : 1)}</span>
        </span>
        <span />
      </div>

      <ol className="relative">
        {steps.map((step, i) => {
          const t = tone(step.value);
          const prev = i > 0 ? steps[i - 1] : null;
          return (
            <li key={step.key}>
              <button
                type="button"
                onClick={() => onSelect?.(step.key)}
                aria-label={
                  step.value == null
                    ? `${step.label}: not measured. Open evidence.`
                    : `${step.label}: ${formatSignedValue(step.value)} strokes per round. Open evidence.`
                }
                className={cn(
                  ROW_GRID,
                  'group min-h-[48px] w-full rounded-fw-sm text-left outline-none',
                  'transition-colors [transition-duration:150ms] active:bg-surface-sunken',
                  'focus-visible:ring-2 focus-visible:ring-border-focus',
                  '[@media(hover:hover)]:hover:bg-surface-sunken',
                )}
              >
                <span className="font-fw-sans text-body-sm font-medium text-text-primary sm:text-body">
                  {step.label}
                </span>
                <span className="relative block h-[48px]">
                  {/* hairline zero line */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 w-px bg-border-strong"
                    style={{ left: `${zeroX}%` }}
                  />
                  {/* connector from the previous step's end */}
                  {prev && prev.end !== 0 ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-0 h-[14px] w-px border-l border-dashed border-text-tertiary"
                      style={{ left: `${toPercentX(step.start, domain)}%` }}
                    />
                  ) : null}
                  {step.value != null ? (
                    <span
                      aria-hidden="true"
                      className={cn('absolute top-[14px] h-5 rounded-[3px]', BAR_CLASS[t])}
                      style={span(step.start, step.end)}
                    />
                  ) : (
                    <span className="absolute inset-y-0 left-0 flex items-center font-fw-sans text-caption text-text-tertiary">
                      not measured
                    </span>
                  )}
                </span>
                <span className={cn('text-right font-fw-sans text-body font-semibold tabular-nums', INK_CLASS[t])}>
                  {step.value == null ? '—' : formatSignedValue(step.value)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className={cn(ROW_GRID, 'min-h-[56px] border-t border-border-strong')}>
        <span className="font-fw-sans text-body-sm font-semibold text-text-primary sm:text-body">Net</span>
        <span className="relative block h-[56px]">
          <span aria-hidden="true" className="absolute inset-y-0 w-px bg-border-strong" style={{ left: `${zeroX}%` }} />
          {net != null ? (
            <span
              aria-hidden="true"
              className={cn('absolute top-[16px] h-6 rounded-[3px]', BAR_CLASS[tone(net)])}
              style={span(0, net)}
            />
          ) : null}
        </span>
        <span className={cn('text-right font-fw-sans text-h3 font-semibold tabular-nums', INK_CLASS[tone(net)])}>
          {net == null ? '—' : formatSignedValue(net)}
        </span>
      </div>

      {/* Accessible equivalent of the chart. */}
      <table className="sr-only">
        <caption>Strokes gained per round by area</caption>
        <thead>
          <tr>
            <th scope="col">Area</th>
            <th scope="col">Strokes per round</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s) => (
            <tr key={s.key}>
              <th scope="row">{s.label}</th>
              <td>{s.value == null ? 'not measured' : formatSignedValue(s.value)}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">Net</th>
            <td>{net == null ? 'not measured' : formatSignedValue(net)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
