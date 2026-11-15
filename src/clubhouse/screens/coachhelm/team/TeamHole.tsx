'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { ChartText } from '../../../ui/charts/ChartText';
import { placeLabels } from '../../../lib/chart-geometry';
import { formatSigned, changeTone } from '../../../lib/format';
import { initials as initialsOf } from '../../../lib/names';
import { STATIONS, type ChStation, type ChTeamBoardData, type ChTeamPlayer } from '../../../data/coachhelm-team-shape';
import { coinSlots, HOLE, stationRadius, STATION_NAME, STATION_SHORT } from './hole-geometry';
import { HoleMotion } from './HoleMotion';

/** A coin drawn on a chart wears its class year (`--ch-yr-*`), as the roster's class bars do; a year the app can't place is the neutral mark. */
export function coinYear(classYear: string | null | undefined): 'sr' | 'jr' | 'so' | 'fr' | null {
  const y = (classYear ?? '').trim().toLowerCase();
  if (/^(senior|sr)\b/.test(y)) return 'sr';
  if (/^(junior|jr)\b/.test(y)) return 'jr';
  if (/^(sophomore|so)\b/.test(y)) return 'so';
  if (/^(freshman|fr)\b/.test(y)) return 'fr';
  return null;
}

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

/**
 * The hole, complete and readable in its first frame: every station, figure and coin is drawn at rest. Over it, once a session, a ball
 * flies tee to green and each station answers as it passes (`HoleMotion`, the owner's signature moment); it adds to the drawing and
 * hides none of it. A coin stands where its player loses most; the third slot turns into "+N" past three.
 */
export function TeamHole({
  stations,
  players,
  station,
  onStation,
  orientation,
  bare = false,
  arrive = false,
  picks = 0,
}: {
  stations: ChTeamBoardData['stations'];
  players: readonly ChTeamPlayer[];
  station: ChStation | 'course';
  onStation: (s: ChStation) => void;
  orientation: 'v' | 'h';
  bare?: boolean;
  /** The arrival may play here (the live hole, not the empty one or a picture of it). */
  arrive?: boolean;
  /** How many times the coach has chosen a station (the pulse answers a choice, never a first paint). */
  picks?: number;
}) {
  const H = HOLE[orientation];
  const svg = useRef<SVGSVGElement | null>(null);
  const scale = useDrawnScale(svg, H.w);
  const up = Math.max(1, 1 / scale);
  const labelSize = 13 * up;
  const valueSize = 19 * up;
  const coinSize = 12 * up;
  // A coin is 22px on screen, so it grows in the drawing as the hole draws smaller; its slots fan out with it (W9).
  const coinR = 11 * up;
  const coinsAt = (s: ChStation) => coinSlots(H, s, coinR, Math.min(players.filter((p) => p.worst === s).length, H.coins[s].length));
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
        ...STATIONS.flatMap((s) => coinsAt(s).map(([x, y]) => ({ x: x - coinR, y: y - coinR, w: 2 * coinR, h: 2 * coinR }))),
        { x: H.flag.x - 2, y: H.flag.y - 34, w: 18, h: 34 },
      ],
    ).map((l) => [l.id, l]),
  );
  const label = STATIONS.map((s) => `${STATION_NAME[s].toLowerCase()} ${stations[s].team == null ? 'not measured' : formatSigned(stations[s].team)}`).join(', ');
  // The live hole holds its stations' buttons, so it is a named group: an image's children are hidden from a screen reader (F-0007).
  // The empty hole has nothing to press and stays one image that says what it shows.
  const named = bare
    ? { role: 'img', 'aria-label': `A golf hole showing where the team loses strokes to Tour: ${label} a round.` }
    : { role: 'group', 'aria-label': 'Where the team loses strokes to Tour, by part of the hole' };
  return (
    <div className="holebox">
    <svg ref={svg} className="holesvg" viewBox={`0 0 ${H.w} ${H.h}`} {...named}>
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
          const signed = changeTone(v, false);
          const tone = !signed ? ' is-even' : signed === 'is-gain' ? ' is-gain' : '';
          const here = players.filter((p) => p.worst === s);
          const slots = coinsAt(s);
          // The drawn slots, then "+N" in the last one (02-PLAN 9.7). A station drawn with fewer slots than three still ends on "+N".
          const room = Math.max(1, H.coins[s].length);
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
                // Starts with the words drawn on it, the short name and the figure, so a voice user can say what they see (label in name).
                aria-label={`${STATION_SHORT[s]}, ${v == null ? 'Not measured' : `${formatSigned(v)} a round`}${STATION_SHORT[s] === STATION_NAME[s] ? '' : `, ${STATION_NAME[s].toLowerCase()}`}`}
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
                <circle className="hit" cx={t.x} cy={t.y} r={23 * up} fill="transparent" />
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
                  <g key={p.id} className={'scn' + (p.early ? ' early' : '')} data-early={p.early || undefined} data-year={coinYear(p.classYear) ?? undefined} aria-hidden="true">
                    {/* Solid in the class year's colour; hollow, a dashed ring on the hole's own green, under 5 rounds (TEAM-11). */}
                    <circle cx={c[0]} cy={c[1]} r={coinR} />
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
                  aria-label={`+${here.length - shown.length} more at ${STATION_SHORT[s]}`}
                  onClick={() => onStation(s)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onStation(s);
                    }
                  }}
                >
                  <circle className="hit" cx={moreAt[0]} cy={moreAt[1]} r={23 * up} fill="transparent" />
                  <circle cx={moreAt[0]} cy={moreAt[1]} r={coinR} />
                  <ChartText size={coinSize} weight={600} x={moreAt[0]} y={moreAt[1]}>
                    +{here.length - shown.length}
                  </ChartText>
                </g>
              )}
            </g>
          );
        })}
    </svg>
    {!bare && <HoleMotion hole={H} stations={stations} station={station} arrive={arrive} picks={picks} />}
    </div>
  );
}
