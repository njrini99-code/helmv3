import { useId } from 'react';
import type { TerrainCanopy } from '@/lib/golf/course-geometry/terrain-canopy';

/** Shared annotation layer for GPU view and true SVG export. Surface masks
 * keep illustrative crowns from hiding fairway, green, sand, water or tees. */
export function TerrainCanopyLayer({ canopy, width, height }: { canopy: TerrainCanopy; width: number; height: number }) {
  const id = useId();
  return <g data-annotation="illustrative-canopy" aria-hidden="true">
    <defs>
      <radialGradient id={`${id}-crown`} cx="32%" cy="24%" r="80%">
        <stop stopColor="var(--fw-diagram-tree-light)" /><stop offset="1" stopColor="var(--fw-diagram-tree)" />
      </radialGradient>
      <mask id={`${id}-clear-surfaces`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
        <rect width={width} height={height} fill="white" />
        {canopy.guardPaths.map((d, i) => <path key={i} d={d} fill="black" fillRule="evenodd" />)}
      </mask>
    </defs>
    <g mask={`url(#${id}-clear-surfaces)`}>
      {canopy.crowns.map(c => <ellipse key={c.id} cx={c.x + c.radius * .15} cy={c.y + c.radius * .22}
        rx={c.radius * 1.08} ry={c.radius * (.85 - canopy.tilt * .25)} fill="var(--fw-diagram-tree-shadow)" opacity=".4" />)}
      {canopy.crowns.map(c => <g key={c.id} transform={`translate(${c.x},${c.y - c.radius * canopy.tilt * .65}) scale(${c.radius})`}>
        <ellipse cy=".18" rx=".94" ry=".8" fill="var(--fw-diagram-tree-shadow)" opacity=".65" />
        {Array.from({ length: 6 }, (_, n) => {
          const angle = (n + c.seed % 3 * .3) * Math.PI / 3;
          return <circle key={n} cx={Math.cos(angle) * .48} cy={Math.sin(angle) * .44}
            r={.5 + (n + c.seed) % 4 * .015} fill={`url(#${id}-crown)`} />;
        })}
        <circle cx="-.12" cy="-.16" r=".53" fill="var(--fw-diagram-tree-light)" opacity=".6" />
      </g>)}
    </g>
  </g>;
}
