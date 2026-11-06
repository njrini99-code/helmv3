'use client';

import { useRef } from 'react';
import { avatarTone } from '../../../ui/Avatar';
import { useFlyIn } from './team-motion';
import { formatSigned } from '../../../lib/format';
import { initials as initialsOf } from '../../../lib/names';
import { STATIONS, type ChStation, type ChTeamBoardData, type ChTeamPlayer } from '../../../data/coachhelm-team-shape';
import { HOLE, stationRadius, STATION_NAME, STATION_SHORT } from './hole-geometry';

const TONE_FILL: Record<string, string> = { sand: '#8A5A2B', stone: '#5E6B3A', sage: '#2F6B4F', mist: '#4B5F8A', clay: '#8A4D3A', heather: '#7A4E6E' };
export const coinColor = (id: string): string => TONE_FILL[avatarTone(id)] ?? TONE_FILL.sage!;

/** One SVG: the hole at rest (no motion here; CT7 adds it). A coin stands where its player loses most; the third slot turns into "+N" past three. */
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
  useFlyIn(svg, !bare);
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
                className={'stn' + (station === s ? ' on' : '')}
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
                {v != null && <circle key={station === s ? 'on' : 'off'} className="pulse" cx={t.x} cy={t.y} r={r} />}
                {v != null && <circle className="halo" cx={t.x} cy={t.y} r={r} />}
                {v != null && <circle className="core" cx={t.x} cy={t.y} r={4.5} />}
                <text className="sl" x={t.lx} y={t.ly} textAnchor={t.a}>
                  {/* The phone's hole is narrow: the longest full name runs off the card. */}
                  {orientation === 'v' ? STATION_SHORT[s] : STATION_NAME[s]}
                </text>
                <text className="sv" x={t.lx} y={t.ly + 21} textAnchor={t.a}>
                  {v == null ? 'Not measured' : formatSigned(v)}
                </text>
              </g>
              {shown.map((p, i) => {
                const c = slots[i];
                if (!c) return null;
                return (
                  <g key={p.id} className={'scn' + (p.early ? ' early' : '')} data-early={p.early || undefined} aria-hidden="true">
                    <circle cx={c[0]} cy={c[1]} r={11} fill={coinColor(p.id)} />
                    <text x={c[0]} y={c[1]}>
                      {initialsOf(p.name)}
                    </text>
                  </g>
                );
              })}
              {over && moreAt && (
                <g className="scn is-more" data-ch-team-more={s} aria-hidden="true" onClick={() => onStation(s)}>
                  <circle cx={moreAt[0]} cy={moreAt[1]} r={11} fill="var(--ch-tb-feat)" />
                  <text x={moreAt[0]} y={moreAt[1]}>
                    +{here.length - shown.length}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      <circle className="ball" r={4.2} cx={-20} cy={-20} opacity={0} />
    </svg>
  );
}
