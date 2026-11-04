import type { ChStation } from '../../../data/coachhelm-team-shape';

/** The page's `HOLE.v` and `HOLE.h` tables, as typed constants; the key names move to the app's stations (AC-HOLE-03). */
export interface HoleEllipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}
export interface HoleStationPoint {
  x: number;
  y: number;
  lx: number;
  ly: number;
  a: 'start' | 'middle';
}
export interface HoleGeometry {
  w: number;
  h: number;
  path: string;
  fw: number;
  green: HoleEllipse;
  fringe: HoleEllipse;
  tee: { x: number; y: number; w: number; h: number };
  bunk: HoleEllipse[];
  flag: { x: number; y: number };
  st: Record<ChStation, HoleStationPoint>;
  coins: Record<ChStation, Array<[number, number]>>;
}

export const HOLE: Record<'v' | 'h', HoleGeometry> = {
  v: {
    w: 330,
    h: 400,
    path: 'M150 362 C 128 326 96 290 110 250 C 122 212 192 186 198 134 C 202 110 186 90 170 76',
    fw: 58,
    green: { cx: 172, cy: 70, rx: 66, ry: 38 },
    fringe: { cx: 172, cy: 72, rx: 80, ry: 50 },
    tee: { x: 134, y: 356, w: 32, h: 16 },
    bunk: [
      { cx: 110, cy: 100, rx: 14, ry: 8 },
      { cx: 62, cy: 236, rx: 12, ry: 7 },
    ],
    flag: { x: 170, y: 76 },
    st: {
      tee: { x: 150, y: 354, lx: 178, ly: 350, a: 'start' },
      approach: { x: 110, y: 250, lx: 146, ly: 256, a: 'start' },
      short_game: { x: 198, y: 134, lx: 234, ly: 134, a: 'start' },
      putting: { x: 170, y: 76, lx: 252, ly: 58, a: 'start' },
    },
    coins: {
      approach: [
        [40, 292],
        [64, 292],
        [88, 292],
      ],
      putting: [
        [118, 98],
        [142, 112],
      ],
      tee: [[200, 384]],
      short_game: [[160, 152]],
    },
  },
  h: {
    w: 760,
    h: 268,
    path: 'M70 168 C 150 180 230 198 300 184 C 380 168 470 110 552 102 C 600 98 634 106 664 120',
    fw: 74,
    green: { cx: 664, cy: 116, rx: 76, ry: 52 },
    fringe: { cx: 662, cy: 118, rx: 92, ry: 64 },
    tee: { x: 42, y: 160, w: 30, h: 16 },
    bunk: [
      { cx: 586, cy: 62, rx: 18, ry: 9 },
      { cx: 250, cy: 236, rx: 16, ry: 8 },
    ],
    flag: { x: 664, y: 120 },
    st: {
      tee: { x: 70, y: 168, lx: 70, ly: 214, a: 'middle' },
      approach: { x: 300, y: 184, lx: 300, ly: 232, a: 'middle' },
      short_game: { x: 552, y: 102, lx: 510, ly: 44, a: 'middle' },
      putting: { x: 664, y: 120, lx: 664, ly: 200, a: 'middle' },
    },
    coins: {
      approach: [
        [272, 140],
        [298, 140],
        [324, 140],
      ],
      putting: [
        [604, 152],
        [628, 166],
      ],
      tee: [[70, 128]],
      short_game: [[552, 148]],
    },
  },
};

export const STATION_NAME: Record<ChStation, string> = { tee: 'Off the tee', approach: 'Approach', short_game: 'Around the green', putting: 'Putting' };
export const STATION_SHORT: Record<ChStation, string> = { tee: 'Tee', approach: 'Approach', short_game: 'Around the green', putting: 'Putting' };
