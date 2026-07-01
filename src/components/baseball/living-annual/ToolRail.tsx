'use client';

/**
 * ToolRail — the 20-80 scale as a horizontal record-book rail (spec §7).
 *
 * Ticks at 20…80 on a hairline baseline rule that DRAWS on mount; 50 is marked
 * `MLB AVG`. A filled pip marks the present grade, a hollow pip the future /
 * ceiling grade, and an ink connector spans the two — so you read the gap
 * before the digits. `compare` stacks a second athlete on the same rule
 * (Decision Room overlay); each athlete keeps its own ink.
 *
 * Reduced motion → rule drawn, pips set, no fade.
 */
import { m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { rulesDraw, EASE_GLIDE } from './motion';

export interface ToolRailAthlete {
  /** Present grade (filled pip). */
  value: number;
  /** Projected / ceiling grade (hollow pip + connector). */
  future?: number;
  /** Lane ink for this athlete's pips + connector. */
  ink?: 'team' | 'pursuit';
}

export interface ToolRailProps extends ToolRailAthlete {
  /** Tool name, hung left (e.g. `POWER`). */
  label?: string;
  /** A second athlete stacked on the same scale (compare mode). */
  compare?: ToolRailAthlete;
  className?: string;
}

const TICKS = [20, 30, 40, 50, 60, 70, 80] as const;
const INK_VAR: Record<'team' | 'pursuit', string> = {
  team: 'var(--grade-plus)',
  pursuit: 'var(--pursuit-ink)',
};

/** Map a 20-80 grade to a 0–100% position on the rail. */
function pct(value: number): number {
  return Math.min(100, Math.max(0, ((value - 20) / 60) * 100));
}

function PipRow({ athlete, reduced, shiftY }: { athlete: ToolRailAthlete; reduced: boolean; shiftY: number }) {
  const color = INK_VAR[athlete.ink ?? 'team'];
  const from = pct(athlete.value);
  const to = athlete.future != null ? pct(athlete.future) : null;
  const enter = reduced ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4, ease: EASE_GLIDE } };

  return (
    <div className="pointer-events-none absolute inset-x-0" style={{ height: 0, top: `calc(50% + ${shiftY}px)` }}>
      {/* Connector from present → future */}
      {to != null ? (
        <m.span
          aria-hidden
          {...enter}
          className="absolute top-1/2 h-[2px] -translate-y-1/2 rounded-full"
          style={{
            left: `${Math.min(from, to)}%`,
            width: `${Math.abs(to - from)}%`,
            background: color,
            opacity: 0.5,
          }}
        />
      ) : null}
      {/* Hollow future pip */}
      {to != null ? (
        <m.span
          aria-hidden
          {...enter}
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-[var(--paper)]"
          style={{ left: `${to}%`, borderColor: color }}
        />
      ) : null}
      {/* Filled present pip */}
      <m.span
        aria-hidden
        {...enter}
        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${from}%`, background: color }}
      />
    </div>
  );
}

export function ToolRail({ value, future, ink = 'team', label, compare, className }: ToolRailProps) {
  const reduced = useReducedMotion() ?? false;
  const rule = rulesDraw(reduced);

  return (
    <div className={cn('w-full', className)}>
      {label ? (
        <span className="mb-2 block text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">{label}</span>
      ) : null}

      <div className="relative h-10">
        {/* Ticks */}
        {TICKS.map((t) => {
          const isAvg = t === 50;
          return (
            <span key={t} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${pct(t)}%` }}>
              <span
                className={cn('block w-px', isAvg ? 'h-4 bg-[color:var(--hairline)]' : 'h-2.5 bg-[color:var(--hairline)]/70')}
              />
            </span>
          );
        })}

        {/* Baseline rule (draws on mount) */}
        <m.div
          aria-hidden
          initial="hidden"
          animate="visible"
          variants={rule}
          className="absolute top-1/2 left-0 right-0 h-px origin-left -translate-y-1/2 bg-[color:var(--hairline)]"
        />

        {/* Pip rows — a lone athlete sits ON the rule; in compare mode the two
            stack just above / below it so both read at once. */}
        <PipRow athlete={{ value, future, ink }} reduced={reduced} shiftY={compare ? -6 : 0} />
        {compare ? <PipRow athlete={compare} reduced={reduced} shiftY={6} /> : null}
      </div>

      {/* End + average labels */}
      <div className="relative mt-1 h-4">
        <span className="absolute left-0 -translate-x-0 font-fw-mono text-eyebrow tabular-nums text-text-tertiary">20</span>
        <span
          className="absolute left-1/2 -translate-x-1/2 text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary"
        >
          MLB AVG
        </span>
        <span className="absolute right-0 font-fw-mono text-eyebrow tabular-nums text-text-tertiary">80</span>
      </div>
    </div>
  );
}
