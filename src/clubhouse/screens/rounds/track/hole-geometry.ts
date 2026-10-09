import type { RoundHole, ShotRecord } from '@/lib/types/golf';

/**
 * The drawn hole (Q-72c: there is no hole geometry in the data, so the shape is the par's, not the course's). One
 * centre line from the tee to the pin, as a cubic curve, drawn in two frames: `wide` for the shot screen's hero (tee
 * low in the middle, green top right, the left side kept clear for the hole's words) and `tall` for the course view
 * and the desktop side map (tee at the bottom, green at the top). Every mark on the hole is placed along that line by
 * how far it is from the pin as a share of the hole's yardage, so the shots, the rings and the green all agree.
 */

export type ChHoleFrame = 'wide' | 'tall';
export interface ChPt {
  x: number;
  y: number;
}
export interface ChHoleShape {
  frame: ChHoleFrame;
  w: number;
  h: number;
  tee: ChPt;
  c1: ChPt;
  c2: ChPt;
  pin: ChPt;
  /** The fairway's drawn width, in the frame's units. */
  fairway: number;
  /** The green's radii. */
  green: { rx: number; ry: number };
}

const SHAPES: Record<ChHoleFrame, Record<3 | 4 | 5, Omit<ChHoleShape, 'frame' | 'w' | 'h' | 'fairway' | 'green'>>> = {
  wide: {
    3: {
      tee: { x: 226, y: 238 },
      c1: { x: 228, y: 180 },
      c2: { x: 282, y: 110 },
      pin: { x: 316, y: 62 },
    },
    4: {
      tee: { x: 204, y: 240 },
      c1: { x: 214, y: 186 },
      c2: { x: 262, y: 124 },
      pin: { x: 318, y: 52 },
    },
    5: {
      tee: { x: 206, y: 240 },
      c1: { x: 196, y: 140 },
      c2: { x: 344, y: 168 },
      pin: { x: 322, y: 50 },
    },
  },
  tall: {
    3: {
      tee: { x: 192, y: 540 },
      c1: { x: 186, y: 440 },
      c2: { x: 210, y: 310 },
      pin: { x: 206, y: 226 },
    },
    4: {
      tee: { x: 175, y: 566 },
      c1: { x: 160, y: 440 },
      c2: { x: 218, y: 250 },
      pin: { x: 215, y: 150 },
    },
    5: {
      tee: { x: 168, y: 572 },
      c1: { x: 112, y: 420 },
      c2: { x: 286, y: 330 },
      pin: { x: 222, y: 142 },
    },
  },
};

export function holeShape(par: number, frame: ChHoleFrame): ChHoleShape {
  const p = par <= 3 ? 3 : par >= 5 ? 5 : 4;
  return frame === 'wide'
    ? {
        frame,
        w: 390,
        h: 252,
        fairway: 54,
        green: { rx: 28, ry: 20 },
        ...SHAPES.wide[p],
      }
    : {
        frame,
        w: 390,
        h: 640,
        fairway: 84,
        green: { rx: 42, ry: 30 },
        ...SHAPES.tall[p],
      };
}

function bez(s: ChHoleShape, t: number): ChPt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * s.tee.x + b * s.c1.x + c * s.c2.x + d * s.pin.x,
    y: a * s.tee.y + b * s.c1.y + c * s.c2.y + d * s.pin.y,
  };
}

const STEPS = 64;
function table(s: ChHoleShape): { pts: ChPt[]; len: number[] } {
  const pts: ChPt[] = [];
  const len: number[] = [];
  let acc = 0;
  for (let i = 0; i <= STEPS; i++) {
    const p = bez(s, i / STEPS);
    if (i > 0) acc += Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y);
    pts.push(p);
    len.push(acc);
  }
  return { pts, len };
}

/** The centre line's length in the frame's units. */
export function lineLength(s: ChHoleShape): number {
  return table(s).len[STEPS]!;
}

/** The centre line, as an SVG path. */
export function centerLine(s: ChHoleShape): string {
  return `M${s.tee.x} ${s.tee.y} C ${s.c1.x} ${s.c1.y}, ${s.c2.x} ${s.c2.y}, ${s.pin.x} ${s.pin.y}`;
}

/** The point `share` of the way along the line (0 the tee, 1 the pin), and the unit normal there (to the player's right). */
export function pointAlong(s: ChHoleShape, share: number): ChPt & { nx: number; ny: number } {
  const { pts, len } = table(s);
  const target = Math.max(0, Math.min(1, share)) * len[STEPS]!;
  let i = 1;
  while (i < STEPS && len[i]! < target) i++;
  const a = pts[i - 1]!;
  const b = pts[i]!;
  const seg = len[i]! - len[i - 1]! || 1;
  const k = (target - len[i - 1]!) / seg;
  const dx = (b.x - a.x) / seg;
  const dy = (b.y - a.y) / seg;
  // Walking from the tee towards the pin, the player's right is the direction turned clockwise on screen.
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    nx: -dy,
    ny: dx,
  };
}

/** Yards to the pin after a shot (feet on the green become yards). */
export function yardsLeft(shot: ShotRecord): number {
  if (shot.result === 'hole') return 0;
  return shot.distanceUnitAfter === 'feet' ? shot.distanceToHoleAfter / 3 : shot.distanceToHoleAfter;
}

export interface ChPlottedShot {
  /** The stroke number on the card (penalties take one too, but are not drawn). */
  n: number;
  shot: ShotRecord;
  from: ChPt;
  to: ChPt;
}

/**
 * Each played shot as a segment from where it was hit to where it finished: placed along the line by the yards left,
 * pushed to the side it missed (less as it nears the green), a ball on the green set just off the cup. Penalty strokes
 * are on the card but not on the map.
 */
export function plotShots(s: ChHoleShape, hole: Pick<RoundHole, 'yardage'>, shots: ShotRecord[]): { plotted: ChPlottedShot[]; ball: ChPt } {
  const total = Math.max(1, hole.yardage || 1);
  let at: ChPt = s.tee;
  const plotted: ChPlottedShot[] = [];
  shots.forEach((shot, i) => {
    if (shot.isPenalty) return;
    const left = Math.max(0, Math.min(1, yardsLeft(shot) / total));
    const p = pointAlong(s, 1 - left);
    const dir = `${shot.approachMissDirection ?? ''} ${shot.missDirection ?? ''}`;
    const side = dir.includes('left') ? -1 : dir.includes('right') ? 1 : 0;
    const off = shot.result === 'hole' ? 0 : shot.result === 'green' ? (i % 2 ? 0.12 : -0.12) * s.fairway : side * 0.62 * s.fairway * Math.min(1, left * 3);
    const to = shot.result === 'hole' ? { ...s.pin } : { x: p.x + p.nx * off, y: p.y + p.ny * off };
    plotted.push({ n: i + 1, shot, from: at, to });
    at = to;
  });
  return { plotted, ball: at };
}

/** A yardage ring's radius around the pin: `yards` as a share of the hole, along the line. Null when it would reach past the tee. */
export function ringRadius(s: ChHoleShape, yards: number, holeYards: number): number | null {
  if (!holeYards || yards >= holeYards) return null;
  return (yards / holeYards) * lineLength(s);
}
