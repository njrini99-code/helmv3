/**
 * The painted course's shapes. Seeded, so every render, server or client,
 * draws the same hole; built once per page load and shared by both scenes
 * (desktop and phone crop). Pure.
 * Source: design/handoff/auth/src/scene.jsx (rng, blob, pineTree, build).
 * The order of every `r()` call matters: it is the course.
 */

type Rng = () => number;

export const seededRng =
  (seed: number): Rng =>
  () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

/** A soft closed blob as a cubic path, `n` points around an ellipse, each pushed in or out by up to `j`. */
export function blob(cx: number, cy: number, rx: number, ry: number, r: Rng, n = 9, j = 0.2): string {
  const p: [number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 - j / 2 + r() * j;
    p.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  let d = `M${p[0]![0].toFixed(1)},${p[0]![1].toFixed(1)}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = p[(i - 1 + n) % n]!;
    const p1 = p[i]!;
    const p2 = p[(i + 1) % n]!;
    const p3 = p[(i + 2) % n]!;
    d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return `${d}Z`;
}

/** The vanishing point the mown stripes run to. */
const VANISH: readonly [number, number] = [1040, 640];

export interface Tier {
  d: string;
  lit: string;
}
export interface Pine {
  x: number;
  base: number;
  top: number;
  lean: number;
  tiers: Tier[];
  w: number;
}
export interface Pad {
  under: string;
  d: string;
  lit: string;
  t: number;
}
export interface Limb {
  d: string;
  w: number;
  pads: Pad[];
}
export interface Clump {
  d: string;
  lit: string;
}

export interface SceneGeometry {
  far: string[];
  mass: string;
  mlit: string[];
  back: Pine[];
  front: Pine[];
  stripes: string[];
  oakL: Clump[];
  oakR: Clump[];
  bloom: [number, number, number][];
  pine: Limb[];
  pineTop: Pad[];
  bough: Limb[];
  reeds: [number, number, number][];
  stars: [number, number, number, number][];
}

function pineTree(r: Rng, x: number, base: number, h: number, s: number, lean: number): Pine {
  const top = base - h;
  const tiers: Tier[] = [];
  const n = 5 + Math.floor(r() * 3);
  for (let k = 0; k < n; k += 1) {
    const t = k / (n - 1);
    const y = top + t * h * 0.5 + (r() - 0.5) * 6;
    const w = s * (0.55 + t * 0.75) * (0.85 + r() * 0.3);
    const off = (r() - 0.5) * s * 0.5 + lean * (1 - t);
    tiers.push({ d: blob(x + off, y, w, s * (0.26 + r() * 0.1), r, 9, 0.4), lit: blob(x + off + w * 0.28, y - s * 0.12, w * 0.5, s * 0.12, r, 7, 0.4) });
  }
  return { x, base, top, lean, tiers, w: 1.6 + r() * 1.4 };
}

function build(): SceneGeometry {
  const r = seededRng(11);
  const far: string[] = [];
  const back: Pine[] = [];
  const front: Pine[] = [];
  const stripes: string[] = [];
  for (let x = -60; x < 1680; x += 22 + r() * 18) far.push(blob(x, 556 - r() * 24, 26 + r() * 20, 20 + r() * 20, r, 8, 0.3));
  let mass = 'M-60,610 L-60,540';
  const mlit: string[] = [];
  for (let x = -60; x <= 1680; x += 26 + r() * 20) {
    const y = 520 - r() * 38;
    mass += ` Q${(x + 12).toFixed(0)},${(y - 22).toFixed(0)} ${(x + 26).toFixed(0)},${(y + 4).toFixed(0)}`;
    if (r() > 0.4) mlit.push(blob(x + 18, y - 4, 14 + r() * 8, 6 + r() * 4, r, 7, 0.4));
  }
  mass += ' L1680,610 Z';
  for (let x = -30; x < 1660; x += 70 + r() * 50) back.push(pineTree(r, x, 560, 150 + r() * 70, 24 + r() * 10, (r() - 0.5) * 14));
  for (let x = -10; x < 1660; x += 110 + r() * 90) {
    if (x > 330 && x < 790) continue;
    front.push(pineTree(r, x, 600, 200 + r() * 90, 30 + r() * 12, (r() - 0.5) * 18));
  }
  let i = 0;
  for (let bx = -1400; bx < 3600; bx += 170, i += 1) if (i % 2) stripes.push(`M${VANISH[0]},${VANISH[1]} L${bx},1000 L${bx + 170},1000 Z`);
  const oak = (cx: number, cy: number, n: number, sx: number, sy: number): Clump[] =>
    Array.from({ length: n }).map(() => {
      const x = cx + (r() - 0.5) * sx;
      const y = cy + (r() - 0.5) * sy;
      return { d: blob(x, y, 26 + r() * 22, 18 + r() * 12, r, 9, 0.35), lit: blob(x + 10, y - 8, 14 + r() * 10, 7 + r() * 4, r, 7, 0.4) };
    });
  const oakL = oak(870, 570, 14, 120, 60);
  const oakR = oak(1300, 552, 20, 230, 90);
  const bloom: [number, number, number][] = [];
  for (let k = 0; k < 90; k += 1) {
    const g = k % 2 ? [1230, 612] : [870, 616];
    bloom.push([g[0]! + (r() - 0.5) * 200, g[1]! + (r() - 0.5) * 16, 1.2 + r() * 1.8]);
  }
  // Foreground pine: every pad sits on a limb that grows from the trunk.
  const trunkX = (y: number) => 96 + (1000 - y) * 0.018;
  const limb = (x0: number, y0: number, lenIn: number, dir: number, lift: number, n: number, sizeIn: number): Limb => {
    const len = lenIn * 0.72;
    const size = sizeIn * 0.92;
    const x1 = x0 + dir * len;
    const y1 = y0 - lift;
    const cx = x0 + dir * len * 0.5;
    const cy = y0 - lift * 0.2 - 10;
    const pads: Pad[] = [];
    for (let k = 0; k < n; k += 1) {
      const t = 0.25 + (k / Math.max(1, n - 1)) * 0.8;
      const u = 1 - t;
      const px = u * u * x0 + 2 * u * t * cx + t * t * x1;
      const py = u * u * y0 + 2 * u * t * cy + t * t * y1;
      const w = size * (1.15 - t * 0.45) * (0.85 + r() * 0.3);
      const h = w * (0.32 + r() * 0.08);
      pads.push({
        under: blob(px + dir * 4, py + h * 0.35, w * 1.02, h * 0.9, r, 9, 0.3),
        d: blob(px, py - h * 0.15, w, h, r, 10, 0.34),
        lit: blob(px - dir * w * 0.05, py - h * 0.55, w * 0.72, h * 0.42, r, 8, 0.36),
        t: r(),
      });
    }
    return { d: `M${x0.toFixed(1)},${y0.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`, w: 3 + size * 0.06, pads };
  };
  const pine = [
    limb(trunkX(470), 470, 170, 1, 60, 3, 60),
    limb(trunkX(430), 430, 90, -1, 20, 2, 50),
    limb(trunkX(350), 350, 300, 1, 90, 5, 70),
    limb(trunkX(290), 290, 110, -1, 30, 2, 54),
    limb(trunkX(220), 220, 260, 1, 60, 4, 68),
    limb(trunkX(150), 150, 150, -1, 40, 3, 58),
    limb(trunkX(110), 110, 220, 1, 30, 4, 64),
    limb(trunkX(40), 40, 120, 1, 20, 3, 56),
  ];
  const pineTop: Pad[] = [0, 1, 2].map((k) => ({
    under: blob(trunkX(0) + 6, -6 + k * 8, 70 - k * 10, 20, r, 9, 0.3),
    d: blob(trunkX(0), -14 + k * 8, 66 - k * 10, 20, r, 10, 0.34),
    lit: blob(trunkX(0) - 6, -22 + k * 8, 44 - k * 6, 10, r, 8, 0.36),
    t: r(),
  }));
  // Overhanging limb, top right: grows in from off-canvas.
  const bough = [limb(560, 10, 330, -1, -120, 6, 64), limb(560, 150, 170, -1, -20, 3, 50)];
  return {
    far,
    mass,
    mlit,
    back,
    front,
    stripes,
    oakL,
    oakR,
    bloom,
    pine,
    pineTop,
    bough,
    reeds: Array.from({ length: 26 }).map((): [number, number, number] => [r(), r(), r()]),
    stars: Array.from({ length: 110 }).map((): [number, number, number, number] => [r() * 1600, r() * 470, 0.5 + r() * 1.2, r()]),
  };
}

let geometry: SceneGeometry | null = null;

/** The course, built on first use and kept: the shapes never change. */
export function sceneGeometry(): SceneGeometry {
  geometry ??= build();
  return geometry;
}

export const POND = 'M486,716 C530,700 640,693 742,697 C804,700 846,708 856,719 C864,729 838,738 780,741 C716,744 660,738 600,745 C552,750 500,748 480,737 C466,729 470,721 486,716 Z';

export interface Bunker {
  id: string;
  d: string;
  rake: number[];
}
export const BUNKERS: readonly Bunker[] = [
  { id: 'b1', d: 'M906,677 C922,669 962,672 991,684 C1008,692 1001,702 975,703 C944,704 905,698 893,688 C887,682 894,679 906,677 Z', rake: [684, 691, 698] },
  { id: 'b2', d: 'M1152,676 C1174,668 1216,668 1233,676 C1245,683 1233,692 1206,694 C1180,696 1150,692 1142,685 C1138,680 1142,678 1152,676 Z', rake: [680, 687] },
  { id: 'b3', d: 'M396,822 C436,798 520,792 578,805 C624,815 628,838 592,849 C540,864 448,862 404,849 C375,840 376,830 396,822 Z', rake: [814, 826, 838, 850] },
];

export const FAIRWAY = 'M-60,1000 C200,870 520,770 820,698 C900,680 980,664 1040,660 C1110,656 1170,664 1196,676 C1260,720 1370,860 1520,1000 Z';

/** The pin, the cup and the flag's two wave cycles (desktop and phone draw the same flag). */
export const PIN = { x: 1064, y: 650 } as const;
export const FLAG_WAVE = [
  'M0,0 C14,-5 29,6 46,1 L46,29 C29,35 14,23 0,28 Z',
  'M0,0 C15,6 30,-5 45,4 L45,32 C30,24 15,34 0,28 Z',
  'M0,0 C13,2 27,3 43,-2 L43,26 C27,31 13,30 0,28 Z',
  'M0,0 C14,-5 29,6 46,1 L46,29 C29,35 14,23 0,28 Z',
].join(';');
export const FLAG_FOLD = [
  'M0,0 C14,-5 29,6 46,1 L46,6 C29,11 14,1 0,5 Z',
  'M0,0 C15,6 30,-5 45,4 L45,9 C30,1 15,11 0,5 Z',
  'M0,0 C13,2 27,3 43,-2 L43,3 C27,8 13,7 0,5 Z',
  'M0,0 C14,-5 29,6 46,1 L46,6 C29,11 14,1 0,5 Z',
].join(';');

/** The clubhouse flagpole's flag, in the clubhouse's own coordinates. */
export const CLUBHOUSE_FLAG = [
  'M-178,-104 C-170,-106 -162,-101 -154,-104 L-154,-91 C-162,-89 -170,-93 -178,-91 Z',
  'M-178,-104 C-170,-101 -162,-106 -155,-101 L-155,-88 C-162,-93 -170,-88 -178,-91 Z',
  'M-178,-104 C-170,-106 -162,-101 -154,-104 L-154,-91 C-162,-89 -170,-93 -178,-91 Z',
].join(';');
