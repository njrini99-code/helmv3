/**
 * BreakPlot — the pitch-movement instrument of "The Break Room" (spec §6 P1 #4).
 *
 * A Statcast-style break plot dropped onto the ONE dark surface: a home-plate /
 * strike-zone axis drawn in chalk on a {@link ClayCanvas}, with each pitch type
 * a `<Trace>` stroke BREAKING from a common release point down to its plate
 * location (hbreak/vbreak, in inches). Velocity drives glow intensity, and an
 * optional `compareTo` older arsenal GHOSTS behind in chalk so *added break* is
 * legible as the distance between the old and new strokes.
 *
 * Colour law (spec §4.2 / §6): green = the working arsenal, `--sodium` marks the
 * single highlighted (hardest) pitch, chalk = the prior/compare shape.
 *
 * ┌─ COORDINATE CONTRACT ─────────────────────────────────────────────────────┐
 * │ `hbreak` / `vbreak` are BREAK IN INCHES, catcher's view:                    │
 * │   • +hbreak → arm-side / to the plot's RIGHT, −hbreak → glove-side / LEFT.  │
 * │   • +vbreak → "rise" / UP (less drop), −vbreak → DOWN (more drop).          │
 * │ Zero break is dead-center. Break is clamped to ±22" so a wild value can't   │
 * │ escape the frame; a real feed can rescale by pre-normalising to that range. │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Composition only — no hooks. `<Trace>` carries its own client boundary and the
 * reduced-motion contract (strokes render fully-drawn + static when reduced).
 * Empty `pitches` → an honest {@link EditorsLetter}, never a fabricated chart.
 */
import { cn } from '@/lib/utils';
import { ClayCanvas } from '../ClayCanvas';
import { EditorsLetter } from '../EditorsLetter';
import { Trace } from '../Trace';

export interface BreakPlotPitch {
  /** Pitch label, e.g. `FF`, `SL`, `CH`. */
  type: string;
  /** Horizontal break in inches (catcher's view: +right / −left). */
  hbreak: number;
  /** Vertical break in inches (+rise / −drop). */
  vbreak: number;
  /** Release velocity (mph). Drives glow intensity + the sodium highlight. */
  velo?: number;
  /** Sample size behind this shape (shown in the label). */
  count?: number;
}

export interface BreakPlotProps {
  /** The working arsenal. Empty → honest empty state. */
  pitches: BreakPlotPitch[];
  /** An older arsenal to ghost behind in chalk (added-break comparison). */
  compareTo?: BreakPlotPitch[];
  /** Chalk dateline shown in the canvas corner. */
  title?: string;
  className?: string;
}

// ── Frame geometry (SVG user units; the caller owns the viewBox) ──────────────
const VB = 320;
const CENTER = VB / 2;
const RELEASE = { x: CENTER, y: 26 };
const MAX_BREAK_IN = 22;
const PLATE_RADIUS = 128;
const SCALE = PLATE_RADIUS / MAX_BREAK_IN; // px per inch

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Map break inches → a plate point in the frame's coordinate space. */
function platePoint(hbreak: number, vbreak: number): { px: number; py: number } {
  const px = CENTER + clamp(hbreak, -MAX_BREAK_IN, MAX_BREAK_IN) * SCALE;
  const py = CENTER - clamp(vbreak, -MAX_BREAK_IN, MAX_BREAK_IN) * SCALE;
  return { px, py };
}

/** A late-breaking curve from the shared release point to a plate point. */
function breakPath(px: number, py: number): string {
  const cx = RELEASE.x + (px - RELEASE.x) * 0.22;
  const cy = (RELEASE.y + py) / 2 + 8;
  return `M ${RELEASE.x} ${RELEASE.y} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${px.toFixed(2)} ${py.toFixed(2)}`;
}

/** A round-cap dot (a near-zero-length subpath renders as a filled circle). */
function dotPath(px: number, py: number): string {
  return `M ${px.toFixed(2)} ${py.toFixed(2)} l 0.01 0`;
}

function LegendSwatch({ className, children }: { className: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn('h-2 w-2 rounded-full', className)} />
      {children}
    </span>
  );
}

export function BreakPlot({ pitches, compareTo, title, className }: BreakPlotProps) {
  if (!pitches.length) {
    return (
      <EditorsLetter
        className={className}
        live
        title="No pitch shapes charted yet"
        body="The Break Room lights up the moment a bullpen or a game feed lands — every arsenal draws itself release-to-plate on the strike zone."
        signoff="— The Break Room"
      />
    );
  }

  // Velo drives glow + the single sodium highlight (the hardest pitch stands out).
  const velos = pitches
    .map((p) => p.velo)
    .filter((v): v is number => typeof v === 'number');
  const maxVelo = velos.length ? Math.max(...velos) : null;
  const highlightIdx =
    maxVelo === null ? -1 : pitches.findIndex((p) => p.velo === maxVelo);
  const isHot = (velo: number | undefined): boolean =>
    maxVelo !== null && typeof velo === 'number' && velo >= maxVelo - 2;

  return (
    <ClayCanvas label={title} className={cn('p-4', className)}>
      <div className="relative aspect-square w-full">
        <svg viewBox={`0 0 ${VB} ${VB}`} className="absolute inset-0 h-full w-full" aria-hidden>
          {/* Chalk reference graticule — zero-break cross + strike zone. */}
          <g style={{ stroke: 'var(--chalk)' }} fill="none">
            <line x1={40} y1={CENTER} x2={280} y2={CENTER} strokeWidth={1} opacity={0.16} />
            <line x1={CENTER} y1={40} x2={CENTER} y2={280} strokeWidth={1} opacity={0.16} />
            <rect x={112} y={96} width={96} height={128} rx={4} strokeWidth={1.25} opacity={0.34} />
            {/* Home plate at the base of the frame. */}
            <path d="M148 292 H172 L178 300 L160 310 L142 300 Z" strokeWidth={1.25} opacity={0.4} />
          </g>

          {/* Prior arsenal — chalk ghost, drawn first (static, behind). */}
          {compareTo?.map((p, i) => {
            const { px, py } = platePoint(p.hbreak, p.vbreak);
            return (
              <Trace
                key={`ghost-${p.type}-${i}`}
                d={breakPath(px, py)}
                ink="chalk"
                weight={1.75}
                animate={false}
                className="opacity-35"
              />
            );
          })}

          {/* The working arsenal — one breaking Trace + endpoint dot per pitch. */}
          {pitches.map((p, i) => {
            const { px, py } = platePoint(p.hbreak, p.vbreak);
            const ink = i === highlightIdx ? 'sodium' : 'team';
            const hot = isHot(p.velo);
            return (
              <g key={`pitch-${p.type}-${i}`}>
                <Trace d={breakPath(px, py)} ink={ink} weight={hot ? 2.8 : 2.2} glow={hot} />
                <Trace d={dotPath(px, py)} ink={ink} weight={hot ? 7 : 5.5} glow={hot} animate={false} />
              </g>
            );
          })}
        </svg>

        {/* Pitch labels — HTML overlay so numerals stay crisp + tabular. */}
        {pitches.map((p, i) => {
          const { px, py } = platePoint(p.hbreak, p.vbreak);
          const highlight = i === highlightIdx;
          return (
            <span
              key={`label-${p.type}-${i}`}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap font-annual"
              style={{ left: `${(px / VB) * 100}%`, top: `${(py / VB) * 100}%` }}
            >
              <span
                className="text-microbadge font-semibold uppercase tracking-[0.14em]"
                style={{ color: highlight ? 'var(--sodium)' : 'var(--chalk)' }}
              >
                {p.type}
                {typeof p.velo === 'number' ? (
                  <span className="ml-1 tabular-nums opacity-80">{Math.round(p.velo)}</span>
                ) : null}
              </span>
            </span>
          );
        })}
      </div>

      {/* Legend — mono/small-caps colorway caption. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-microbadge font-semibold uppercase tracking-[0.14em] text-chalk/70">
        <LegendSwatch className="bg-grade-plus">Arsenal</LegendSwatch>
        {highlightIdx >= 0 ? <LegendSwatch className="bg-sodium">Top velo</LegendSwatch> : null}
        {compareTo?.length ? <LegendSwatch className="bg-chalk">Prior</LegendSwatch> : null}
      </div>
    </ClayCanvas>
  );
}
