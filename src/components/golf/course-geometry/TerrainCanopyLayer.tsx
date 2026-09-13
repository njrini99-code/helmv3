import { useId } from 'react';
import { crownOutline } from '@/lib/golf/course-geometry/canopy';
import type { TerrainCanopy } from '@/lib/golf/course-geometry/terrain-canopy';
import type { PointM } from '@/lib/golf/course-geometry/types';

/** Shared artwork for top-down SVG, projected terrain and SVG exports. */
export function CrownPaint({ id, light }: { id: string; light: PointM }) {
  const length = Math.hypot(...light) || 1;
  return <>{[0, 1, 2].map(tone => <radialGradient key={tone} id={`${id}-crown-${tone}`}
    cx={`${50 + light[0] / length * 28}%`} cy={`${50 + light[1] / length * 28}%`} r="82%">
    <stop stopColor={tone === 0 ? 'var(--fw-diagram-tree-highlight)' : 'var(--fw-diagram-tree-light)'} />
    <stop offset={tone === 2 ? '.32' : '.48'} stopColor="var(--fw-diagram-tree-light)" />
    <stop offset="1" stopColor="var(--fw-diagram-tree)" />
  </radialGradient>)}</>;
}

/** Crown silhouettes and layer lift are decorative, not surveyed tree volumes. */
export function CrownGlyph({ seed, id, light, detail = true }: { seed: number; id: string; light: PointM; detail?: boolean }) {
  const d = crownOutline(seed), length = Math.hypot(...light) || 1;
  const lx = light[0] / length, ly = light[1] / length;
  return <>
    <path d={d} transform={`translate(${-lx * .1},${-ly * .1})`} fill="var(--fw-diagram-tree-shadow)" opacity=".7" />
    <path d={d} fill={`url(#${id}-crown-${seed % 3})`} />
    {detail && <path d={d} transform={`translate(${lx * .18},${ly * .18}) scale(.64)`}
      fill="var(--fw-diagram-tree-highlight)" opacity={seed % 3 === 0 ? .26 : .16} />}
  </>;
}

/** Surface masks keep illustrative crowns from hiding fairway, green, sand,
 * water or tees. Their bases, lifted centres and shadow direction are projected
 * through the same world camera as the terrain, then drawn as legible glyphs. */
export function TerrainCanopyLayer({ canopy, width, height }: { canopy: TerrainCanopy; width: number; height: number }) {
  const id = useId(), light: PointM = canopy.crowns[0]?.lightScreen ?? [-.4, -.45];
  return <g data-annotation="illustrative-canopy" aria-hidden="true">
    <defs>
      <CrownPaint id={id} light={light} />
      <mask id={`${id}-clear-surfaces`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
        <rect width={width} height={height} fill="white" />
        {canopy.guardPaths.map((d, i) => <path key={i} d={d} fill="black" fillRule="evenodd" />)}
      </mask>
    </defs>
    <g mask={`url(#${id}-clear-surfaces)`}>
      <g data-annotation="illustrative-canopy-shadows" fill="var(--fw-diagram-tree-shadow)">
        {canopy.crowns.map(c => c.shadow && c.shadowBasis && <path key={c.id} d={crownOutline(c.seed)} opacity=".36"
          transform={`matrix(${c.shadowBasis.right[0]} ${c.shadowBasis.right[1]} ${c.shadowBasis.up[0]} ${c.shadowBasis.up[1]} ${c.shadow[0]} ${c.shadow[1]})`} />)}
      </g>
      {canopy.crowns.map(c => <g key={c.id} data-canopy-id={c.id}>
        {canopy.tilt > .25 && c.heightPx > 2 && <line x1={c.base[0]} y1={c.base[1]} x2={c.centre[0]} y2={c.centre[1]}
          stroke="var(--fw-diagram-tree-shadow)" strokeWidth={Math.max(.7, c.radius * .16)} strokeLinecap="round" opacity=".6" />}
        <g transform={`translate(${c.centre[0]},${c.centre[1]}) scale(${c.radius})`}>
          <CrownGlyph id={id} seed={c.seed} light={c.lightScreen} detail={c.radius >= 4} />
        </g>
      </g>)}
    </g>
  </g>;
}
