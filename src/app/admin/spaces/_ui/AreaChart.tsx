import { curve } from './curve';
import type { Tone } from './ui';

/**
 * A smooth area chart (server-rendered SVG). Labels sit in HTML under the chart, never in SVG text, so they stay
 * crisp and readable at any width. `label` is the chart's accessible summary in plain words.
 */
export function AreaChart({
  values,
  label,
  tone = 'good',
  height = 160,
  max,
  ticks,
}: {
  values: readonly number[];
  label: string;
  tone?: Tone;
  height?: number;
  max?: number;
  ticks?: ReadonlyArray<string>;
}) {
  const width = 600;
  const { line, area } = curve(values, { width, height }, max);
  const id = `bs-fill-${tone}`;
  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        className={`bs-tone-${tone}`}
        style={{ width: '100%', height, display: 'block' }}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {area ? <path d={area} fill={`url(#${id})`} /> : null}
        {line ? (
          <path d={line} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ) : null}
      </svg>
      {ticks && ticks.length ? (
        <figcaption style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }} className="bs-panel-note">
          {ticks.map((t, i) => (
            <span key={`${t}-${i}`}>{t}</span>
          ))}
        </figcaption>
      ) : null}
    </figure>
  );
}
