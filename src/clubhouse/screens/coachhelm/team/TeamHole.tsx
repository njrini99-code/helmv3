'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { avatarTone } from '../../../ui/Avatar';
import { ChartText } from '../../../ui/charts/ChartText';
import { placeLabels } from '../../../lib/chart-geometry';
import { formatSigned } from '../../../lib/format';
import { initials as initialsOf } from '../../../lib/names';
import { STATIONS, type ChStation, type ChTeamBoardData, type ChTeamPlayer } from '../../../data/coachhelm-team-shape';
import { HOLE, stationRadius, STATION_NAME, STATION_SHORT } from './hole-geometry';

const TONE_FILL: Record<string, string> = { sand: '#8A5A2B', stone: '#5E6B3A', sage: '#2F6B4F', mist: '#4B5F8A', clay: '#8A4D3A', heather: '#7A4E6E' };
export const coinColor = (id: string): string => TONE_FILL[avatarTone(id)] ?? TONE_FILL.sage!;

/** The drawing's scale on screen, so its words can hold the 12px floor on the narrowest phone (MOB-TEAM-6). */
function useDrawnScale(svg: React.RefObject<SVGSVGElement | null>, width: number): number {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = svg.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const read = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setScale(w / width);
    };
    read();
    const seen = new ResizeObserver(read);
    seen.observe(el);
    return () => seen.disconnect();
  }, [svg, width]);
  return scale;
}

/** A word's width in the drawing, at about 0.56em: close enough to place it, and placeLabels keeps a margin. */
const wide = (text: string, size: number) => text.length * size * 0.56;

/** One SVG: the hole at rest, with no motion on first paint (owner, TEAM-33). A coin stands where its player loses most; the third slot turns into "+N" past three. */
export function TeamHole({
  stations,
  players,
  station,
  onStation,
  orientation,
  bare = false,
}: {
  stations: ChTeamBoardData['stations'];
  players: readonly ChTeamPlayer[];
  station: ChStation | 'course';
  onStation: (s: ChStation) => void;
  orientation: 'v' | 'h';
  bare?: boolean;
}) {
  const H = HOLE[orientation];
  const svg = useRef<SVGSVGElement | null>(null);
  const scale = useDrawnScale(svg, H.w);
  const up = Math.max(1, 1 / scale);
  const labelSize = 13 * up;
  const valueSize = 19 * up;
  const coinSize = 12 * up;
  // Words go beside their own mark, clear of every mark and of each other, inside the drawing, whatever the figures are (TEAM-2, TEAM-3).
  const placed = new Map(
    placeLabels(
      STATIONS.map((s) => {
        const v = stations[s].team;
        const value = v == null ? 'Not measured' : formatSigned(v);
        const w = Math.max(wide(STATION_SHORT[s], labelSize), wide(value, valueSize)) + 2;
        const t = H.st[s];
        return { id: s, x: t.x, y: t.y, r: stationRadius(v), w, h: labelSize + valueSize + 4, prefer: { x: t.a === 'start' ? t.lx : t.lx - w / 2, y: t.ly - labelSize, anchor: t.a } };
      }),
      { x: 4, y: 4, w: H.w - 8, h: H.h - 8 },
      6,
      [
        ...STATIONS.flatMap((s) => {
          const n = players.filter((p) => p.worst === s).length;
          return H.coins[s].slice(0, n).map(([x, y]) => ({ x: x - 11 * up, y: y - 11 * up, w: 22 * up, h: 22 * up }));
        }),
        { x: H.flag.x - 2, y: H.flag.y - 34, w: 18, h: 34 },
      ],
    ).map((l) => [l.id, l]),
  );
  const label = STATIONS.map((s) => `${STATION_NAME[s].toLowerCase()} ${stations[s].team == null ? 'not measured' : formatSigned(stations[s].team)}`).join(', ');
  return (
    <svg ref={svg} className="holesvg" viewBox={`0 0 ${H.w} ${H.h}`} role="img" aria-label={`A golf hole showing where the team loses strokes to Tour: ${label} a round.`}>
      <path className="fair" d={H.path} strokeWidth={H.fw} />
      <path className="mow" d={H.path} strokeWidth={H.fw * 0.42} />
      <ellipse className="fringe" {...H.fringe} />
      <ellipse className="grn" {...H.green} />
      {H.bunk.map((b) => (
        <ellipse key={`${b.cx}-${b.cy}`} className="bunk" {...b} />
      ))}
      <rect className="teebox" x={H.tee.x} y={H.tee.y} width={H.tee.w} height={H.tee.h} rx={4} />
      <line className="pole" x1={H.flag.x} y1={H.flag.y} x2={H.flag.x} y2={H.flag.y - 34} />
      <path className="flag" d={`M${H.flag.x} ${H.flag.y - 34} l16 5 -16 5z`} />
      <path className="flight" d={H.path} />
      {!bare &&
        STATIONS.map((s) => {
          const t = H.st[s];
          const v = stations[s].team;
          const r = stationRadius(v);
          const spot = placed.get(s)!;
          const textX = spot.anchor === 'start' ? spot.x : spot.anchor === 'end' ? spot.x + spot.w : spot.x + spot.w / 2;
          const tone = v == null || Math.abs(v) < 0.05 ? ' is-even' : v > 0 ? ' is-gain' : '';
          const here = players.filter((p) => p.worst === s);
          const slots = H.coins[s];
          // The drawn slots, then "+N" in the last one (02-PLAN 9.7). A station drawn with fewer slots than three still ends on "+N".
          const room = Math.max(1, slots.length);
          const over = here.length > room;
          const shown = over ? here.slice(0, room - 1) : here;
          const moreAt = slots[room - 1];
          return (
            <g key={s}>
              <g
                className={'stn' + tone + (station === s ? ' on' : '')}
                data-ch-team-station={s}
                role="button"
                tabIndex={0}
                aria-pressed={station === s}
                aria-label={`${STATION_NAME[s]}, ${v == null ? 'not measured' : `${formatSigned(v)} a round`}`}
                onClick={() => onStation(s)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onStation(s);
                  }
                }}
                style={{ transformOrigin: `${t.x}px ${t.y}px` }}
              >
                {/* The 44 a thumb needs, whatever the halo's size (TEAM-12). */}
                <circle className="hit" cx={t.x} cy={t.y} r={22} fill="transparent" />
                {v != null && <circle key={station === s ? 'on' : 'off'} className="pulse" cx={t.x} cy={t.y} r={r} />}
                {v != null && <circle className="halo" cx={t.x} cy={t.y} r={r} />}
                {v != null && <circle className="core" cx={t.x} cy={t.y} r={4.5} />}
                <ChartText className="sl" size={labelSize} weight={station === s ? 600 : 500} x={textX} y={spot.y + labelSize} textAnchor={spot.anchor}>
                  {STATION_SHORT[s]}
                </ChartText>
                <ChartText className="sv" size={valueSize} weight={600} x={textX} y={spot.y + labelSize + valueSize + 2} textAnchor={spot.anchor}>
                  {v == null ? 'Not measured' : formatSigned(v)}
                </ChartText>
              </g>
              {shown.map((p, i) => {
                const c = slots[i];
                if (!c) return null;
                return (
                  <g key={p.id} className={'scn' + (p.early ? ' early' : '')} data-early={p.early || undefined} aria-hidden="true">
                    {/* Hollow: a ring in the player's colour on the hole's own green (TEAM-11). */}
                    <circle cx={c[0]} cy={c[1]} r={11 * up} fill={p.early ? 'var(--ch-tb-feat)' : coinColor(p.id)} style={p.early ? { stroke: coinColor(p.id) } : undefined} />
                    <ChartText size={coinSize} weight={600} x={c[0]} y={c[1]}>
                      {initialsOf(p.name)}
                    </ChartText>
                  </g>
                );
              })}
              {over && moreAt && (
                <g
                  className="scn is-more"
                  data-ch-team-more={s}
                  role="button"
                  tabIndex={0}
                  aria-label={`${here.length - shown.length} more at ${STATION_NAME[s]}`}
                  onClick={() => onStation(s)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onStation(s);
                    }
                  }}
                >
                  <circle className="hit" cx={moreAt[0]} cy={moreAt[1]} r={22} fill="transparent" />
                  <circle cx={moreAt[0]} cy={moreAt[1]} r={11 * up} fill="var(--ch-tb-feat)" />
                  <ChartText size={coinSize} weight={600} x={moreAt[0]} y={moreAt[1]}>
                    +{here.length - shown.length}
                  </ChartText>
                </g>
              )}
            </g>
          );
        })}
      <circle className="ball" r={4.2} cx={-20} cy={-20} opacity={0} />
    </svg>
  );
}
