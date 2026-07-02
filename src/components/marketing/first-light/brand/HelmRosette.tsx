import { getSvgA11yProps } from './svgA11y';

export interface HelmRosetteProps {
  size?: number;
  className?: string;
  title?: string;
}

const CX = 12;
const CY = 12;
const RING_R = 7.4;
const SPOKE_INNER_R = 6.6;
const SPOKE_OUTER_R = 10.4;
// Same wheel geometry as HelmMark — the two components read as one mark at
// different scales.
const SPOKE_ANGLES_DEG = [0, 45, 90, 135, 180, 225, 270, 315];

function pointOnCircle(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
}

/**
 * The Helm wheel reduced to ring + 8 spokes — no ship — for 10–14px section
 * punctuation (Amendment 3 §A.2): the eyebrow hairlines of M2/M5/M7 meet a
 * brass rosette at center instead of bare line ends; M6's "readiness"
 * vignette gets a neutral (sage) rosette per §B.3.
 *
 * Draws with `vector-effect="non-scaling-stroke"` — a fixed screen-pixel
 * stroke regardless of the viewBox→viewport scale. At 10–14px a stroke that
 * scales down with the icon (HelmMark's default behavior, correct at 18px+)
 * would thin into anti-aliasing mush; a rosette this small needs a constant
 * hairline instead, so the base `strokeWidth` here (1.25) is intentionally
 * lower than HelmMark's 1.5 — it's the literal on-screen weight at every size.
 */
export function HelmRosette({ size = 12, className, title }: HelmRosetteProps) {
  const a11y = getSvgA11yProps({ title });
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      {...a11y}
    >
      {title ? <title>{title}</title> : null}
      {SPOKE_ANGLES_DEG.map((angle) => {
        const inner = pointOnCircle(angle, SPOKE_INNER_R);
        const outer = pointOnCircle(angle, SPOKE_OUTER_R);
        return (
          <line
            key={angle}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      <circle cx={CX} cy={CY} r={RING_R} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
