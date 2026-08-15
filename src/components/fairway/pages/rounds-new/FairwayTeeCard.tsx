'use client';

/**
 * ============================================================================
 * Fairway · FairwayTeeCard — choosing which tees to play
 * ----------------------------------------------------------------------------
 * The screen right after you pick a course. It used to be a settings-style list
 * row: a generic flag glyph in a circle, the tee name, and "Par 72 · 6,800 yds"
 * in tertiary grey. Three fields the row already had in hand went unused —
 * `tee_color`, `course_rating`, `slope_rating` — which is why it read as
 * furniture rather than as a decision.
 *
 * IT IS A DECISION. A golfer standing on the first tee is asking one question:
 * which set should I play today? That question is answered by LENGTH and
 * DIFFICULTY, so those are what this card leads with.
 *
 *   · The TEE. Tees are identified on a course by colour — black, blue, white,
 *     gold, red. That is the sport's own naming system (`tee_color`, and
 *     failing that the tee's own name), so the card draws an actual tee peg in
 *     that paint instead of a generic pin icon or an abstract colour chip. It
 *     is an identifier, not decoration: it is the thing on the ground.
 *
 *   · The YARDAGE is the loud graphite numeral — the single number that
 *     separates one tee from the next.
 *
 *   · The LENGTH BAR puts that number in context. "6,800 yards" means nothing
 *     in isolation; "6,800, and the longest here is 7,100" is a decision. The
 *     bar is drawn against the longest tee at THIS course, so it only ever
 *     compares like with like.
 *
 *   · RATING / SLOPE carry the difficulty, and were previously invisible.
 *
 * Responsive: one full-width card per tee on a phone (a course has 3–6 tee
 * sets — a list this short should never need a horizontal rail), two up from
 * `sm`. The whole card is the target.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { IconChevronRight } from '@/components/icons';
import type { GolfCourseTee } from '@/lib/types/golf-course';

const CATEGORY_LABEL: Record<string, string> = {
  mens: "Men's",
  womens: "Women's",
  tournament: 'Tournament',
  mixed: 'Mixed',
  senior: 'Senior',
  junior: 'Junior',
  custom: 'Custom',
};

/**
 * Physical tee-marker colours.
 *
 * These are DOMAIN values — the paint on a marker post — not theme tokens, so
 * they are literal and live here rather than in the Fairway palette. Applied as
 * inline `background`, which also keeps them clear of the golf-surface ban on
 * raw `red-*`/`amber-*`/`rose-*` Tailwind classes: that rule exists to stop
 * semantic UI colour drifting outside the token system, and a black tee marker
 * is neither semantic nor UI.
 *
 * Values are nudged off pure hues so they sit on a warm cream canvas without
 * screaming — a real marker is painted, not neon.
 */
const TEE_SWATCH: Record<string, string> = {
  black: '#26262b',
  blue: '#2f5fa8',
  white: '#f7f5ef',
  gold: '#c8952b',
  yellow: '#dcb43a',
  red: '#b3453f',
  green: '#3f7a4d',
  silver: '#b9bcc0',
  grey: '#8d9096',
  gray: '#8d9096',
  bronze: '#a2703f',
  copper: '#a2703f',
  purple: '#6b4f96',
  orange: '#c9743a',
  pink: '#c980a0',
  championship: '#26262b',
  tips: '#26262b',
};

/** The one swatch that needs its own rim to exist on a cream card. */
const NEEDS_RIM = new Set(['white', 'silver', 'yellow', 'gold']);

/**
 * A golf tee, drawn as the object itself.
 *
 * A colour chip is an abstraction — it says "this row is associated with blue".
 * The thing a player is actually choosing is a peg in the ground, so the card
 * draws a peg: shallow cup, funnel shoulder, tapered shaft, point. Same
 * silhouette every time, only the paint changes, which is exactly how tees work
 * on a real course.
 *
 * Flat fill with one darker facet inside the cup — matte, no gloss, in keeping
 * with the house style. The outline exists so a WHITE tee still has a shape on
 * a cream card; darker tees get a much fainter version of the same edge so the
 * whole set reads as one family.
 */
function TeeMarkerIcon({ hex, needsRim }: { hex: string | null; needsRim: boolean }) {
  // Proportions matter: a wide head over a stubby shaft reads as an anvil, not
  // a tee. Head ≈ 5× the shaft, and the shoulder sweeps down in a long concave
  // funnel — that curve is what makes the shape unmistakable at 32px.
  //
  // The rim tips are a short vertical FACE, not a wedge, and the funnel's first
  // control point stays inside the rim. Get either wrong and the silhouette
  // bulges out below the rim into a pair of horns.
  const SILHOUETTE =
    'M5.4 4.2 Q12 6.9 18.6 4.2 L18.4 6.3 C17.2 8.4 14.1 9.9 13.3 14 ' +
    'L12.9 27 L12 33.5 L11.1 27 L10.7 14 C9.9 9.9 6.8 8.4 5.6 6.3 Z';
  const CUP = 'M5.4 4.2 Q12 6.9 18.6 4.2 L18.4 6.3 Q12 9.3 5.6 6.3 Z';

  return (
    <svg
      aria-hidden
      viewBox="0 0 24 34"
      className="h-11 w-8 shrink-0"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d={SILHOUETTE}
        fill={hex ?? 'var(--fw-color-surface-sunken)'}
        stroke={
          hex ? (needsRim ? 'rgba(0,0,0,0.26)' : 'rgba(0,0,0,0.14)') : 'var(--fw-color-border-strong)'
        }
        strokeWidth={0.9}
        strokeLinejoin="round"
      />
      {/* The cup you set the ball in — a flat darker facet, not a highlight.
          Kept light: push it further and a white tee starts reading silver. */}
      <path d={CUP} fill="rgba(0,0,0,0.12)" />
    </svg>
  );
}

/**
 * Resolve a marker colour from the tee.
 *
 * `tee_color` first (the field that exists for exactly this), then the tee's
 * NAME — because in practice tees ARE named by their colour ("Blue", "Back
 * Tees / White"). Returns null when neither says anything, and the card then
 * shows a neutral marker rather than inventing a colour.
 */
export function resolveTeeSwatch(tee: Pick<GolfCourseTee, 'tee_color' | 'tee_name'>): {
  hex: string | null;
  key: string | null;
} {
  const candidates = [tee.tee_color, tee.tee_name];
  for (const raw of candidates) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    // Word-boundary scan, not substring: "Silverado" must not match "silver",
    // and "Greenbrier" must not match "green".
    for (const key of Object.keys(TEE_SWATCH)) {
      if (new RegExp(`\\b${key}\\b`).test(lower)) {
        return { hex: TEE_SWATCH[key]!, key };
      }
    }
    // A tee_color column may hold a literal hex — honour it.
    if (/^#[0-9a-f]{3,8}$/i.test(raw.trim())) return { hex: raw.trim(), key: null };
  }
  return { hex: null, key: null };
}

export interface FairwayTeeCardProps {
  tee: GolfCourseTee;
  /**
   * Longest tee at THIS course, for the relative-length bar. Omit (or pass a
   * value <= this tee's yardage) and the bar renders full — never misleading,
   * just uninformative.
   */
  longestYards?: number | null;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}

export function FairwayTeeCard({
  tee,
  longestYards,
  disabled,
  onClick,
  className,
}: FairwayTeeCardProps) {
  const category = tee.category ? CATEGORY_LABEL[tee.category] ?? tee.category : null;
  const swatch = resolveTeeSwatch(tee);
  const yards = typeof tee.total_yards === 'number' ? tee.total_yards : null;

  // Floor the bar at 25% so the shortest tee still reads as a bar rather than a
  // sliver, and clamp at 100% so a bad `longestYards` can't overflow the track.
  const lengthPct =
    yards && longestYards && longestYards > 0
      ? Math.max(25, Math.min(100, Math.round((yards / longestYards) * 100)))
      : null;

  // How much shorter than the longest tee here. 0 marks the tips themselves.
  const shortfall =
    yards && longestYards && longestYards > yards ? longestYards - yards : 0;

  const rating = typeof tee.course_rating === 'number' ? tee.course_rating.toFixed(1) : null;
  const slope = typeof tee.slope_rating === 'number' ? String(tee.slope_rating) : null;

  return (
    // eslint-disable-next-line helm/no-raw-button -- whole-card selectable target
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Play the ${tee.tee_name} tees${yards ? `, ${yards.toLocaleString('en-US')} yards` : ''}`}
      className={cn(
        'group flex w-full flex-col gap-3 rounded-card border border-border-subtle bg-surface p-4 text-left',
        'transition-[border-color,background-color,transform] [transition-duration:var(--fw-dur-fast)]',
        'hover:border-accent-300 hover:bg-surface-sunken active:scale-[0.995] motion-reduce:active:scale-100',
        'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        'disabled:pointer-events-none disabled:opacity-60',
        className,
      )}
    >
      {/* ── Identity + the number ── */}
      <div className="flex items-start gap-3.5">
        {/* THE TEE ITSELF, in its own colour. Not a swatch, not a chip — the
            object you are choosing, painted the way you'd find it on the box. */}
        <TeeMarkerIcon
          hex={swatch.hex}
          needsRim={!!swatch.key && NEEDS_RIM.has(swatch.key)}
        />

        <span className="min-w-0 flex-1">
          <span className="block truncate font-fw-sans text-body font-semibold text-text-primary">
            {tee.tee_name}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {category && (
              <span className="rounded-full bg-surface-sunken px-2 py-0.5 font-fw-sans text-caption font-medium text-text-secondary">
                {category}
              </span>
            )}
            {tee.holes_count ? (
              <span className="font-fw-sans text-caption text-text-tertiary">
                {tee.holes_count} holes
              </span>
            ) : null}
            {tee.is_draft && (
              <span className="rounded-full bg-surface-sunken px-2 py-0.5 font-fw-sans text-caption font-medium text-text-secondary">
                Draft
              </span>
            )}
          </span>
        </span>

        {/* The differentiator, loud. */}
        <span className="flex shrink-0 items-baseline gap-1 text-right">
          {yards !== null ? (
            <>
              <span className="font-fw-mono text-h3 font-semibold tabular-nums leading-none text-text-primary">
                {yards.toLocaleString('en-US')}
              </span>
              <span className="font-fw-sans text-caption text-text-tertiary">yds</span>
            </>
          ) : (
            <span className="font-fw-sans text-caption text-text-tertiary">Length not set</span>
          )}
        </span>
      </div>

      {/* ── Length against the longest tee here ──
            The bar carries the proportion; the caption names the gap in the
            unit the player actually thinks in. "6,180" alone is a fact;
            "425 shorter than the tips" is the decision. */}
      {lengthPct !== null && (
        <div className="flex items-center gap-3">
          <span aria-hidden className="block h-1 flex-1 overflow-hidden rounded-full bg-surface-sunken">
            <span
              className="block h-full rounded-full bg-accent-600 transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${lengthPct}%` }}
            />
          </span>
          <span className="shrink-0 font-fw-sans text-caption text-text-tertiary">
            {shortfall === 0 ? 'Longest' : `−${shortfall.toLocaleString('en-US')} yds`}
          </span>
        </div>
      )}

      {/* ── The difficulty line, previously not shown at all ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {typeof tee.total_par === 'number' && (
            <TeeFact label="Par" value={String(tee.total_par)} />
          )}
          {rating && <TeeFact label="Rating" value={rating} />}
          {slope && <TeeFact label="Slope" value={slope} />}
          {!rating && !slope && (
            <span className="font-fw-sans text-caption text-text-tertiary">
              No rating on file
            </span>
          )}
        </div>
        <IconChevronRight
          size={16}
          aria-hidden
          className="shrink-0 text-text-tertiary transition-transform [transition-duration:var(--fw-dur-fast)] group-hover:translate-x-0.5 motion-reduce:transition-none"
        />
      </div>
    </button>
  );
}

function TeeFact({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="font-fw-sans text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
        {label}
      </span>
      <span className="font-fw-mono text-body-sm font-medium tabular-nums text-text-secondary">
        {value}
      </span>
    </span>
  );
}
