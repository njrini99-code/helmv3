import { curve } from '../_ui/curve';
import { Pill, type Tone, toneClass } from '../_ui/ui';
import type { PersonRole, PersonSummary, Sport, TeamState } from '@/lib/admin/data/people-space-model';
import { STATE_WORDS, ago } from '@/lib/admin/data/people-space-model';
import './people.css';

/** People space pieces shared by the teams list (B17) and one team (B18). Server components, no state. */

export const STATE_TONE: Readonly<Record<TeamState, Tone>> = { active: 'good', slipping: 'watch', dormant: 'muted', never: 'muted' };

export function StatePill({ state }: { state: TeamState }) {
  return (
    <span className={state === 'never' ? 'bp-pill-never' : undefined} style={{ display: 'inline-flex' }}>
      <Pill tone={STATE_TONE[state]} dot>
        {STATE_WORDS[state]}
      </Pill>
    </span>
  );
}

export function SportChip({ sport }: { sport: Sport }) {
  return <span className="bp-chip-sport">{sport}</span>;
}

export function TestChip() {
  return <span className="bp-chip-test">test / demo</span>;
}

const ROLE_TONE: Readonly<Record<PersonRole, Tone>> = { coach: 'coach', player: 'player' };

/** "12 min ago" over "the coach" / "a player", the role in its own colour. Null reads as no sign-in recorded. */
export function SignedIn({
  at,
  role,
  name,
  now,
  empty = 'no sign-in recorded',
}: {
  at: string | null;
  role: PersonRole | null;
  name?: string | null;
  now: Date;
  empty?: string;
}) {
  if (!at || !role) {
    return (
      <div>
        <div className="bp-big bs-tone-muted">none</div>
        <div className="bp-sub">{empty}</div>
      </div>
    );
  }
  return (
    <div>
      <div className="bp-big">
        <time dateTime={at}>{ago(at, now)}</time>
      </div>
      <div className={`bp-sub ${toneClass(ROLE_TONE[role])}`} style={{ fontWeight: 600 }}>
        {name ? `${name} · ${role}` : role === 'coach' ? 'a coach' : 'a player'}
      </div>
    </div>
  );
}

/** A progress ring: `value` of `max`, empty when `max` is 0. */
export function Ring({ value, max, tone, size = 34, stroke = 4, label }: { value: number; max: number; tone: Tone; size?: number; stroke?: number; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <svg className={`bp-ring ${toneClass(tone)}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle className="bp-ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
      {frac > 0 ? (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(c * frac).toFixed(1)} ${c.toFixed(1)}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      ) : null}
    </svg>
  );
}

/** Three concentric rings: today (inner), this week, 30 days (outer). */
export function ActiveRings({ today, week, month, of }: { today: number; week: number; month: number; of: number }) {
  const size = 168;
  const rings = [
    { n: month, r: 74, tone: 'good' as Tone },
    { n: week, r: 58, tone: 'good' as Tone },
    { n: today, r: 42, tone: 'watch' as Tone },
  ];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${today} of ${of} active today, ${week} this week, ${month} in 30 days`}>
      {rings.map((ring, i) => {
        const c = 2 * Math.PI * ring.r;
        const frac = of > 0 ? Math.min(1, ring.n / of) : 0;
        return (
          <g key={i} className={toneClass(ring.tone)} style={i === 0 ? { opacity: 0.55 } : undefined}>
            <circle className="bp-ring-track" cx={84} cy={84} r={ring.r} fill="none" strokeWidth={11} />
            {frac > 0 ? (
              <circle
                cx={84}
                cy={84}
                r={ring.r}
                fill="none"
                stroke="currentColor"
                strokeWidth={11}
                strokeLinecap="round"
                strokeDasharray={`${(c * frac).toFixed(1)} ${c.toFixed(1)}`}
                transform="rotate(-90 84 84)"
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** The 30-day line from Teams pulse. All zeros draws a flat dashed baseline instead of a curve. */
export function Spark({ values, tone, label }: { values: readonly number[]; tone: Tone; label: string }) {
  const width = 160;
  const height = 34;
  if (!values.some((v) => v > 0)) {
    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label} className="bs-tone-muted" style={{ maxWidth: 220, display: 'block' }}>
        <line x1={0} y1={height - 3} x2={width} y2={height - 3} stroke="currentColor" strokeWidth={1.4} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }
  const { line, area } = curve(values, { width, height, padTop: 3, padBottom: 3 });
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label} className={toneClass(tone)} style={{ maxWidth: 220, display: 'block' }}>
      <path d={area} fill="currentColor" opacity={0.12} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** 30 days, one tick each: green active, amber a round or game, track for nothing. */
export function DayStrip({ days, label }: { days: PersonSummary['days']; label: string }) {
  return (
    <span className="bp-strip" role="img" aria-label={label}>
      {days.map((d, i) => (
        <i key={i} data-d={d} />
      ))}
    </span>
  );
}

export function initials(name: string | null): string {
  if (!name) return '·';
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase() || '·';
}
