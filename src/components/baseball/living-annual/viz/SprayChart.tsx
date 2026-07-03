/**
 * SprayChart — the batted-ball half of "The Break Room" (spec §6 P1 #4).
 *
 * A baseball field wedge — foul lines + outfield arc + a hint of infield — drawn
 * in chalk on the ONE dark {@link ClayCanvas}, or as a light `paper` variant
 * (clay-ink field lines on cream). Batted balls arrive as small round `<Trace>`
 * marks coloured by outcome per the colour law (spec §4.2 / §6):
 *   • green   = a hit (strength)
 *   • clay    = an out (weak contact)
 *   • sodium  = a home run (the single highlighted outcome)
 *   • neutral = anything else
 *
 * ┌─ COORDINATE CONTRACT ─────────────────────────────────────────────────────┐
 * │ `x` / `y` are NORMALISED field space in [0, 1], home plate at bottom-centre:│
 * │   • x: 0 = left-field foul line, 1 = right-field foul line, 0.5 = dead      │
 * │        centre. Values are clamped into fair territory.                      │
 * │   • y: 0 = deep outfield fence, 1 = home plate. (depth from home = 1 − y).  │
 * │ A real feed maps landing coordinates into this square before handing rows   │
 * │ in; anything out of [0,1] is clamped so a stray point can't leave the wedge.│
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Composition only — no hooks. `<Trace>` owns its client boundary + the
 * reduced-motion contract. Empty `battedBalls` → an honest {@link EditorsLetter}.
 */
import { cn } from '@/lib/utils';
import { ClayCanvas } from '../ClayCanvas';
import { EditorsLetter } from '../EditorsLetter';
import { Eyebrow } from '../Eyebrow';
import { PaperCard } from '../PaperCard';
import { Trace } from '../Trace';

export type SprayOutcome = 'hit' | 'out' | 'hr' | 'other';

export interface SprayBall {
  /** Normalised lateral position [0,1] — 0 left line, 1 right line. */
  x: number;
  /** Normalised depth [0,1] — 0 fence, 1 home plate. */
  y: number;
  /** Batted-ball result; drives the mark ink. */
  outcome?: SprayOutcome;
}

export interface SprayChartProps {
  /** Charted batted balls. Empty → honest empty state. */
  battedBalls: SprayBall[];
  /** `clay` (default) = the dark viz surface; `paper` = a light cream variant. */
  surface?: 'clay' | 'paper';
  /** Dateline / eyebrow shown above the field. */
  title?: string;
  className?: string;
}

type Ink = 'team' | 'sodium' | 'chalk' | 'pursuit';

// ── Frame geometry (SVG user units; the caller owns the viewBox) ──────────────
const VBW = 320;
const VBH = 300;
const HOME = { x: 160, y: 264 };
const LEFT_CORNER = { x: 42, y: 60 };
const RIGHT_CORNER = { x: 278, y: 60 };

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Map a normalised (x,y) field point into the fair wedge in frame space. */
function fieldPoint(x: number, y: number): { px: number; py: number } {
  const depth = 1 - clamp01(y); // 0 at home, 1 at the fence
  const leftX = lerp(HOME.x, LEFT_CORNER.x, depth);
  const rightX = lerp(HOME.x, RIGHT_CORNER.x, depth);
  const rowY = lerp(HOME.y, (LEFT_CORNER.y + RIGHT_CORNER.y) / 2, depth);
  return { px: lerp(leftX, rightX, clamp01(x)), py: rowY };
}

/** A round-cap dot (a near-zero-length subpath renders as a filled circle). */
function dotPath(px: number, py: number): string {
  return `M ${px.toFixed(2)} ${py.toFixed(2)} l 0.01 0`;
}

/** Ink per outcome; the neutral case stays visible on either surface. */
function ballInk(outcome: SprayOutcome | undefined, surface: 'clay' | 'paper'): Ink {
  switch (outcome) {
    case 'hr':
      return 'sodium';
    case 'hit':
      return 'team';
    case 'out':
      return 'pursuit';
    default:
      return surface === 'clay' ? 'chalk' : 'pursuit';
  }
}

const OUTCOME_ORDER: SprayOutcome[] = ['hit', 'out', 'hr'];
const OUTCOME_SWATCH: Record<SprayOutcome, string> = {
  hit: 'bg-grade-plus',
  out: 'bg-pursuit',
  hr: 'bg-sodium',
  other: 'bg-chalk',
};
const OUTCOME_LABEL: Record<SprayOutcome, string> = {
  hit: 'Hit',
  out: 'Out',
  hr: 'HR',
  other: 'Other',
};

export function SprayChart({ battedBalls, surface = 'clay', title, className }: SprayChartProps) {
  if (!battedBalls.length) {
    return (
      <EditorsLetter
        className={className}
        live
        title="No batted balls charted yet"
        body="Every ball put in play lands here — hits in green, outs in clay, a home run flagged in sodium — the moment a game or a session is logged."
        signoff="— The Break Room"
      />
    );
  }

  const isClay = surface === 'clay';
  const lineInk: Ink = isClay ? 'chalk' : 'pursuit';
  const lineOpacity = isClay ? 'opacity-40' : 'opacity-30';

  // Colorway legend counts (mono/small-caps caption).
  const counts = OUTCOME_ORDER.map((o) => ({
    outcome: o,
    n: battedBalls.filter((b) => (b.outcome ?? 'other') === o).length,
  })).filter((c) => c.n > 0);

  const captionInk = isClay ? 'text-chalk/70' : 'text-text-tertiary';

  const field = (
    <div className="relative aspect-[320/300] w-full">
      <svg viewBox={`0 0 ${VBW} ${VBH}`} className="absolute inset-0 h-full w-full" aria-hidden>
        {/* Field lines — foul lines, outfield arc, infield diamond. */}
        <g className={lineOpacity}>
          <Trace
            d={`M ${HOME.x} ${HOME.y} L ${LEFT_CORNER.x} ${LEFT_CORNER.y}`}
            ink={lineInk}
            weight={1.5}
          />
          <Trace
            d={`M ${HOME.x} ${HOME.y} L ${RIGHT_CORNER.x} ${RIGHT_CORNER.y}`}
            ink={lineInk}
            weight={1.5}
          />
          <Trace
            d={`M ${LEFT_CORNER.x} ${LEFT_CORNER.y} Q ${HOME.x} 6 ${RIGHT_CORNER.x} ${RIGHT_CORNER.y}`}
            ink={lineInk}
            weight={1.5}
          />
          {/* Infield diamond — home → 1B → 2B → 3B → home. */}
          <Trace
            d={`M ${HOME.x} ${HOME.y} L 206 200 L ${HOME.x} 158 L 114 200 Z`}
            ink={lineInk}
            weight={1.25}
            animate={false}
          />
        </g>

        {/* Batted balls — small round marks, one Trace dot each. */}
        {battedBalls.map((b, i) => {
          const { px, py } = fieldPoint(b.x, b.y);
          const outcome = b.outcome ?? 'other';
          return (
            <Trace
              key={`ball-${i}`}
              d={dotPath(px, py)}
              ink={ballInk(b.outcome, surface)}
              weight={outcome === 'hr' ? 7 : 5.5}
              glow={outcome === 'hr'}
              className={outcome === 'other' ? 'opacity-45' : undefined}
            />
          );
        })}
      </svg>
    </div>
  );

  const legend = (
    <div
      className={cn(
        'mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-microbadge font-semibold uppercase tracking-[0.14em]',
        captionInk,
      )}
    >
      {counts.map(({ outcome, n }) => (
        <span key={outcome} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn('h-2 w-2 rounded-full', OUTCOME_SWATCH[outcome])} />
          {OUTCOME_LABEL[outcome]}
          <span className="tabular-nums opacity-80">{n}</span>
        </span>
      ))}
    </div>
  );

  if (isClay) {
    return (
      <ClayCanvas label={title} className={cn('p-4', className)}>
        {field}
        {legend}
      </ClayCanvas>
    );
  }

  return (
    <PaperCard className={cn('p-4', className)}>
      {title ? <Eyebrow className="mb-2">{title}</Eyebrow> : null}
      {field}
      {legend}
    </PaperCard>
  );
}
