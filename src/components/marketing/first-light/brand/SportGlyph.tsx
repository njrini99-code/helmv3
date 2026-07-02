import { getSvgA11yProps } from './svgA11y';

export type SportGlyphSport = 'golf' | 'baseball' | 'lift';

export interface SportGlyphProps {
  sport: SportGlyphSport;
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Tiny per-sport line glyphs, 16–20px by default (Amendment 3 §B). Same
 * stroke contract as HelmMark/HelmRosette: `fill="none"`,
 * `stroke="currentColor"`, shared 24×24 viewBox so all three brand
 * components compose at consistent relative scale.
 *
 * - **golf** — flag-on-horizon: flagstick + pennant + ground line, plus a
 *   small ringed dot at the base standing in for the golf-ball motif on
 *   `public/helm-golf-logo-transparent.png`'s wheel center. Echoes M4's
 *   "horizon + flag + green-contour arcs" background motif language (§B.1)
 *   at icon scale — that larger background motif is a separate asset the
 *   `landing-portals+cta` lane builds; this glyph is the small icon variant
 *   for portal cards / vignette headers (§B.2, §B.3), NOT that background.
 * - **baseball** — the chalk foul-line V + base-path arc, the
 *   "groundskeeper's blueprint" geometry described in
 *   `docs/baseball/ENTRY_SCENES_DESIGN.md`. That doc's literal
 *   `EntryField.tsx` scene component doesn't exist in this branch yet (it
 *   belongs to the not-yet-built `entry-scenes` lane) — this geometry is
 *   derived from the design doc's description (two foul lines converging at
 *   home plate + a shallow infield arc), not read from that file. If
 *   `EntryField.tsx` lands with different exact angles, reconcile the two.
 * - **lift** — barbell: bar + two concentric plate circles per sport, echoing
 *   an `IronRoomField` scene component that also doesn't exist yet in this
 *   branch; built from Amendment 3 §B's literal recipe instead.
 *
 * Consumers may also render this at much larger sizes (via `size`) at low
 * opacity for a decorative background motif rather than an icon — the paths
 * stay proportionate at any scale since everything is defined in the shared
 * 24-unit viewBox.
 */
export function SportGlyph({ sport, size = 18, className, title }: SportGlyphProps) {
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
      {sport === 'golf' && (
        <>
          <path d="M4,17 H20" />
          <path d="M9,17 V6" />
          <path d="M9,6 L15,8.2 L9,10.4 Z" />
          <circle cx={6.3} cy={17} r={1.1} />
        </>
      )}
      {sport === 'baseball' && (
        <>
          <path d="M12,19 L4,5" />
          <path d="M12,19 L20,5" />
          <path d="M8.4,12.7 Q12,10.9 15.6,12.7" />
        </>
      )}
      {sport === 'lift' && (
        <>
          <path d="M2,12 H22" />
          <circle cx={6} cy={12} r={3.4} />
          <circle cx={6} cy={12} r={1.6} />
          <circle cx={18} cy={12} r={3.4} />
          <circle cx={18} cy={12} r={1.6} />
        </>
      )}
    </svg>
  );
}
