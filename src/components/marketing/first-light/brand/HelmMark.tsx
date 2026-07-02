import { getSvgA11yProps } from './svgA11y';

export interface HelmMarkProps {
  /** Rendered width/height in px. viewBox is a fixed 24×24 unit square, so
   * the 1.5px stroke visually thins as `size` shrinks below 24 — this mark
   * is meant for 18px+ use (GlassNav, M9 watermark); for 10–14px punctuation
   * use `HelmRosette` instead, which holds its stroke weight at small sizes. */
  size?: number;
  className?: string;
  /** Accessible name. Omit for a purely decorative mark (aria-hidden). */
  title?: string;
}

const CX = 12;
const CY = 12;
const RING_R = 7.4;
const SPOKE_INNER_R = 6.6;
const SPOKE_OUTER_R = 10.4;
// 8 spokes, 45° apart, starting at 12 o'clock — matches Helm-Logo-New-Main.png.
const SPOKE_ANGLES_DEG = [0, 45, 90, 135, 180, 225, 270, 315];

function pointOnCircle(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
}

/**
 * The Helm mark — a faithful line-art tracing of the 8-spoke ship's-helm
 * wheel + ship silhouette in `public/Helm-Logo-New-Main.png`. Stroke-based
 * (`fill="none"`, `stroke="currentColor"`) so it recolors per surface
 * (sage-ink on cream, brass as jewelry, cream on sage-ink bands) instead of
 * carrying that PNG's flat kelly fill.
 *
 * Kelly raster (`Helm-Logo-New-Main.png` and the sport-variant PNGs) NEVER
 * renders on landing/auth chrome — this component (plus `HelmRosette` and
 * `SportGlyph`) is the only brand-mark rendering path there. See
 * CONTRACTS.md "Brand components" for the full consumer map.
 *
 * Ship silhouette, top to bottom: mast crossbar (small rect) → deckhouse
 * cabin (wider rect) → hull bow (triangular path, `strokeLinejoin="round"`
 * softens the top corners toward the source PNG's pentagon read) →
 * waterline (a shallow arc wider than the hull).
 */
export function HelmMark({ size = 24, className, title }: HelmMarkProps) {
  const a11y = getSvgA11yProps({ title });
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
    >
      {title ? <title>{title}</title> : null}
      {SPOKE_ANGLES_DEG.map((angle) => {
        const inner = pointOnCircle(angle, SPOKE_INNER_R);
        const outer = pointOnCircle(angle, SPOKE_OUTER_R);
        return <line key={angle} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} />;
      })}
      <circle cx={CX} cy={CY} r={RING_R} />
      {/* mast crossbar */}
      <rect x={10.4} y={7.8} width={3.2} height={1} rx={0.5} />
      {/* deckhouse cabin */}
      <rect x={9.4} y={9.1} width={5.2} height={1.3} rx={0.65} />
      {/* hull (bow silhouette) */}
      <path d="M8.6,10.6 L15.4,10.6 L12,14.2 Z" />
      {/* waterline */}
      <path d="M7.6,14 Q12,15.6 16.4,14" />
    </svg>
  );
}
