// GolfScene: painted clubhouse hole for sign-in. Seeded, so every render draws the same course.
(function () {
const rng = (s) => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function blob(cx, cy, rx, ry, r, n = 9, j = 0.2) {
  const p = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, k = 1 - j / 2 + r() * j; p.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}
// Sky keyframes by local hour. Everything in the scene reads from the interpolated set.
const KEYS = [
  { h: 0, top: '#070D1C', mid: '#111B33', low: '#1E2B48', glow: '#6F86B8', glowA: .18, sunX: 360, sunY: 150, sunR: 20, sun: '#EEF0E6', sunA: 0, far: '#1E2C33', haze: '#27344E', cloud: '#3A4764', cloudA: .25, amb: '#0C1428', ambA: .62, stars: 1, win: 1, moon: 1 },
  { h: 5.2, top: '#0E1630', mid: '#2A3452', low: '#5E5468', glow: '#C98E86', glowA: .25, sunX: 160, sunY: 640, sunR: 30, sun: '#F2A071', sunA: 0, far: '#34404A', haze: '#6E6070', cloud: '#6E6480', cloudA: .35, amb: '#1C2140', ambA: .5, stars: .7, win: .9, moon: .6 },
  { h: 6.4, top: '#56698C', mid: '#D3A99E', low: '#F4BD86', glow: '#FFC48A', glowA: .8, sunX: 600, sunY: 392, sunR: 34, sun: '#FFD7A0', sunA: .95, far: '#8C9296', haze: '#EDC4A4', cloud: '#F6C8B0', cloudA: .7, amb: '#5A4A70', ambA: .24, stars: 0, win: .35, moon: 0 },
  { h: 8.5, top: '#C7DCE2', mid: '#F1EDDD', low: '#F6DDB2', glow: '#FFEBC4', glowA: .9, sunX: 660, sunY: 300, sunR: 30, sun: '#FFF4DA', sunA: .9, far: '#A7BAA5', haze: '#E7E5D3', cloud: '#FFFDF6', cloudA: .7, amb: '#000000', ambA: 0, stars: 0, win: 0, moon: 0 },
  { h: 12.5, top: '#9EC3DC', mid: '#D8E8EE', low: '#EEF2E6', glow: '#FFFFFF', glowA: .7, sunX: 820, sunY: 90, sunR: 28, sun: '#FFFFFF', sunA: .85, far: '#9DB6A6', haze: '#E2ECE6', cloud: '#FFFFFF', cloudA: .8, amb: '#000000', ambA: 0, stars: 0, win: 0, moon: 0 },
  { h: 16, top: '#B6D2DE', mid: '#ECEBDA', low: '#F4DEB2', glow: '#FFF3D6', glowA: .85, sunX: 1160, sunY: 250, sunR: 30, sun: '#FFF6DE', sunA: .9, far: '#A2B5A0', haze: '#EEE6CC', cloud: '#FFFBEF', cloudA: .7, amb: '#6A4A10', ambA: .03, stars: 0, win: 0, moon: 0 },
  { h: 18.6, top: '#D9C3A6', mid: '#F2B274', low: '#E4834A', glow: '#FFB866', glowA: 1, sunX: 1300, sunY: 455, sunR: 40, sun: '#FFC878', sunA: 1, far: '#8E8A6E', haze: '#F2BE86', cloud: '#F7B98A', cloudA: .75, amb: '#B8641E', ambA: .16, stars: 0, win: .5, moon: 0 },
  { h: 19.8, top: '#2A3558', mid: '#8C667A', low: '#E0845E', glow: '#F09060', glowA: .6, sunX: 1420, sunY: 640, sunR: 40, sun: '#F4885A', sunA: 0, far: '#3E4046', haze: '#A26A6A', cloud: '#9A6A7E', cloudA: .5, amb: '#2C2244', ambA: .4, stars: .35, win: .95, moon: .2 },
  { h: 21, top: '#0A1226', mid: '#16213C', low: '#2A3654', glow: '#6F86B8', glowA: .2, sunX: 1240, sunY: 150, sunR: 20, sun: '#EEF0E6', sunA: 0, far: '#1E2C33', haze: '#27344E', cloud: '#3A4764', cloudA: .25, amb: '#0C1428', ambA: .6, stars: 1, win: 1, moon: 1 },
  { h: 24, top: '#070D1C', mid: '#111B33', low: '#1E2B48', glow: '#6F86B8', glowA: .18, sunX: 360, sunY: 150, sunR: 20, sun: '#EEF0E6', sunA: 0, far: '#1E2C33', haze: '#27344E', cloud: '#3A4764', cloudA: .25, amb: '#0C1428', ambA: .62, stars: 1, win: 1, moon: 1 },
];
const hx = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mixc = (a, b, t) => '#' + hx(a).map((v, i) => Math.round(v + (hx(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
function skyAt(h) {
  h = ((h % 24) + 24) % 24; let i = 0; while (KEYS[i + 1].h < h) i++;
  const a = KEYS[i], b = KEYS[i + 1], t0 = (h - a.h) / (b.h - a.h), t = t0 * t0 * (3 - 2 * t0), o = {};
  for (const k in a) o[k] = typeof a[k] === 'string' ? mixc(a[k], b[k], t) : a[k] + (b[k] - a[k]) * t;
  // moon rides its own arc through the night
  const nh = h < 12 ? h + 24 : h; const mt = Math.min(1, Math.max(0, (nh - 19.5) / 10.5));
  o.moonX = 1450 - mt * 1200; o.moonY = 420 - Math.sin(mt * Math.PI) * 300;
  return o;
}
const VP = [1040, 640];

function pineTree(r, x, base, h, s, lean) {
  const top = base - h, tiers = [], n = 5 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1), y = top + t * h * .5 + (r() - .5) * 6, w = s * (.55 + t * .75) * (.85 + r() * .3), off = (r() - .5) * s * .5 + lean * (1 - t);
    tiers.push({ d: blob(x + off, y, w, s * (.26 + r() * .1), r, 9, .4), lit: blob(x + off + w * .28, y - s * .12, w * .5, s * .12, r, 7, .4) });
  }
  return { x, base, top, lean, tiers, w: 1.6 + r() * 1.4 };
}
function build() {
  const r = rng(11);
  const far = [], back = [], front = [], stripes = [];
  for (let x = -60; x < 1680; x += 22 + r() * 18) far.push(blob(x, 556 - r() * 24, 26 + r() * 20, 20 + r() * 20, r, 8, .3));
  let mass = 'M-60,610 L-60,540', mlit = [];
  for (let x = -60; x <= 1680; x += 26 + r() * 20) { const y = 520 - r() * 38; mass += ` Q${(x + 12).toFixed(0)},${(y - 22).toFixed(0)} ${(x + 26).toFixed(0)},${(y + 4).toFixed(0)}`; if (r() > .4) mlit.push(blob(x + 18, y - 4, 14 + r() * 8, 6 + r() * 4, r, 7, .4)); }
  mass += ' L1680,610 Z';
  for (let x = -30; x < 1660; x += 70 + r() * 50) back.push(pineTree(r, x, 560, 150 + r() * 70, 24 + r() * 10, (r() - .5) * 14));
  for (let x = -10; x < 1660; x += 110 + r() * 90) { if (x > 330 && x < 790) continue; front.push(pineTree(r, x, 600, 200 + r() * 90, 30 + r() * 12, (r() - .5) * 18)); }
  let i = 0;
  for (let bx = -1400; bx < 3600; bx += 170, i++) if (i % 2) stripes.push(`M${VP[0]},${VP[1]} L${bx},1000 L${bx + 170},1000 Z`);
  const oak = (cx, cy, n, sx, sy) => Array.from({ length: n }).map(() => { const x = cx + (r() - .5) * sx, y = cy + (r() - .5) * sy; return { d: blob(x, y, 26 + r() * 22, 18 + r() * 12, r, 9, .35), lit: blob(x + 10, y - 8, 14 + r() * 10, 7 + r() * 4, r, 7, .4) }; });
  const oakL = oak(870, 570, 14, 120, 60), oakR = oak(1300, 552, 20, 230, 90);
  const bloom = [];
  for (let k = 0; k < 90; k++) { const g = k % 2 ? [1230, 612] : [870, 616]; bloom.push([g[0] + (r() - .5) * 200, g[1] + (r() - .5) * 16, 1.2 + r() * 1.8]); }
  const cl = (n, fx, fy, rx, ry) => Array.from({ length: n }).map(() => { const x = fx(), y = fy(); const w = rx[0] + r() * rx[1], hh = ry[0] + r() * ry[1]; return { d: blob(x, y, w, hh, r, 9, .45), lit: blob(x + w * .3, y - hh * .35, w * .55, hh * .35, r, 7, .45), t: r() }; });
  // Foreground pine: every pad sits on a limb that grows from the trunk.
  const trunkX = (y) => 96 + (1000 - y) * 0.018;
  const limb = (x0, y0, len, dir, lift, n, size) => {
    len *= .72; size *= .92;
    const x1 = x0 + dir * len, y1 = y0 - lift, cx = x0 + dir * len * .5, cy = y0 - lift * .2 - 10;
    const pads = [];
    for (let k = 0; k < n; k++) {
      const t = .25 + (k / Math.max(1, n - 1)) * .8, u = 1 - t;
      const px = u * u * x0 + 2 * u * t * cx + t * t * x1, py = u * u * y0 + 2 * u * t * cy + t * t * y1;
      const w = size * (1.15 - t * .45) * (.85 + r() * .3), h = w * (.32 + r() * .08);
      pads.push({ under: blob(px + dir * 4, py + h * .35, w * 1.02, h * .9, r, 9, .3), d: blob(px, py - h * .15, w, h, r, 10, .34), lit: blob(px - dir * w * .05, py - h * .55, w * .72, h * .42, r, 8, .36), t: r() });
    }
    return { d: `M${x0.toFixed(1)},${y0.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`, w: 3 + size * .06, pads };
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
  const pineTop = [0, 1, 2].map((k) => ({ under: blob(trunkX(0) + 6, -6 + k * 8, 70 - k * 10, 20, r, 9, .3), d: blob(trunkX(0), -14 + k * 8, 66 - k * 10, 20, r, 10, .34), lit: blob(trunkX(0) - 6, -22 + k * 8, 44 - k * 6, 10, r, 8, .36), t: r() }));
  // Overhanging limb, top right: grows in from off-canvas.
  const bough = [limb(560, 10, 330, -1, -120, 6, 64), limb(560, 150, 170, -1, -20, 3, 50)];
  return { far, mass, mlit, back, front, stripes, oakL, oakR, bloom, pine, pineTop, bough,
    reeds: Array.from({ length: 26 }).map(() => [r(), r(), r()]),
    stars: Array.from({ length: 110 }).map(() => [r() * 1600, r() * 470, .5 + r() * 1.2, r()]) };
}
let G = null;
const POND = 'M486,716 C530,700 640,693 742,697 C804,700 846,708 856,719 C864,729 838,738 780,741 C716,744 660,738 600,745 C552,750 500,748 480,737 C466,729 470,721 486,716 Z';
const BUNKERS = [
  { id: 'b1', d: 'M906,677 C922,669 962,672 991,684 C1008,692 1001,702 975,703 C944,704 905,698 893,688 C887,682 894,679 906,677 Z', y0: 670, y1: 704, rake: [684, 691, 698] },
  { id: 'b2', d: 'M1152,676 C1174,668 1216,668 1233,676 C1245,683 1233,692 1206,694 C1180,696 1150,692 1142,685 C1138,680 1142,678 1152,676 Z', y0: 668, y1: 695, rake: [680, 687] },
  { id: 'b3', d: 'M396,822 C436,798 520,792 578,805 C624,815 628,838 592,849 C540,864 448,862 404,849 C375,840 376,830 396,822 Z', y0: 796, y1: 862, rake: [814, 826, 838, 850] },
];
function Bunker({ b, id, u, T }) {
  return <g>
    <path d={b.d} transform="translate(0 -3.5)" fill={T("#3F6B3E")} />
    <path d={b.d} transform="translate(0 2)" fill={T("#A9C987")} opacity=".8" />
    <clipPath id={id(b.id)}><path d={b.d} /></clipPath>
    <path d={b.d} fill={u('sand')} />
    <g clipPath={u(b.id)}>
      <path d={b.d} transform="translate(0 -5)" fill="none" stroke={T("#8C7550")} strokeWidth="9" opacity=".32" filter={u('bl3')} />
      {b.rake.map((y, i) => <path key={i} d={`M300,${y} Q800,${y - 5} 1300,${y}`} fill="none" stroke={T("#D9C8A0")} strokeWidth=".9" opacity=".75" />)}
      {b.rake.map((y, i) => <path key={'h' + i} d={`M300,${y + 1.6} Q800,${y - 3.4} 1300,${y + 1.6}`} fill="none" stroke={T("#FFFBEF")} strokeWidth=".7" opacity=".6" />)}
    </g>
    <path d={b.d} fill="none" stroke={T("#35593A")} strokeWidth=".8" opacity=".5" />
  </g>;
}

function Clubhouse({ win, lightsOnly, T = (c) => c }) {
  const W = T('#F5F1E6'), SH = T('#D9D1BC'), ROOF = T('#3E5647'), ROOF2 = T('#56705E'), SHUT = T('#24503A'), GL = T('#3A4943');
  const upX = Array.from({ length: 9 }).map((_, i) => -72 + i * 18);
  const col = Array.from({ length: 13 }).map((_, i) => -84 + i * 14);
  const wingW = [-140, -118, -96], wingE = [96, 118, 140];
  const winRects = [...upX.map((x) => [x - 3.5, -70, 7, 12]), ...[-77, -49, -21, 21, 49, 77].map((x) => [x - 4, -31, 8, 16]), ...wingW.concat(wingE).map((x) => [x - 3.5, -30, 7, 13]), [-3.5, -90, 7, 8], [-40, -97, 5, 5], [35, -97, 5, 5]];
  const lights = <g opacity={win}>
      <g fill="#FFD48A">{winRects.map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} opacity={i % 5 === 2 ? .45 : 1} />)}</g>
      <rect x="-88" y="-38" width="176" height="34" fill="#FFC870" opacity=".22" />
      <g fill="#FFE2A8">{[-63, -35, -7, 7, 35, 63].map((x) => <circle key={x} cx={x} cy="-35" r="1.4" />)}</g>
      <ellipse cx="0" cy="-20" rx="140" ry="36" fill="#FFB855" opacity=".16" filter="url(#gs-glow)" />
    </g>;
  if (lightsOnly) return lights;
  return <g>
    <ellipse cx="0" cy="3" rx="190" ry="8" fill={T("#1F3A28")} opacity=".35" />
    {/* wings */}
    {[-1, 1].map((sd) => <g key={sd} transform={`scale(${sd} 1)`}>
      <rect x="86" y="-40" width="68" height="40" fill={W} /><rect x="86" y="-40" width="68" height="40" fill={SH} opacity=".25" />
      <path d="M82,-40 L96,-54 L150,-54 L158,-40 Z" fill={ROOF} /><path d="M96,-54 L150,-54 L151,-52 L95,-52 Z" fill={ROOF2} />
      <rect x="132" y="-62" width="7" height="12" fill={T("#B8AE98")} />
      <rect x="86" y="-4" width="68" height="4" fill={SH} />
    </g>)}
    {/* main block */}
    <rect x="-92" y="-80" width="184" height="80" fill={W} />
    <rect x="-92" y="-42" width="184" height="3" fill={SH} />
    <rect x="-88" y="-38" width="176" height="34" fill={T("#C9C0A8")} />
    <rect x="-88" y="-38" width="176" height="6" fill={T("#A99F88")} opacity=".6" />
    <path d="M-100,-80 L-72,-110 L72,-110 L100,-80 Z" fill={ROOF} /><path d="M-72,-110 L72,-110 L74,-107 L-74,-107 Z" fill={ROOF2} />
    <path d="M-100,-80 L100,-80 L100,-78 L-100,-78 Z" fill={T("#2E4236")} />
    <rect x="-62" y="-122" width="8" height="16" fill={T("#B8AE98")} /><rect x="54" y="-122" width="8" height="16" fill={T("#B8AE98")} />
    {[-40, 35].map((x) => <g key={x}><path d={`M${x - 7},-94 L${x + 2.5},-104 L${x + 12},-94 Z`} fill={W} /><rect x={x - 5} y="-94" width="15" height="8" fill={W} /></g>)}
    {/* portico gable */}
    <path d="M-30,-80 L0,-100 L30,-80 Z" fill={W} /><path d="M-30,-80 L0,-100 L30,-80" fill="none" stroke={SH} strokeWidth="1.2" />
    {/* cupola + weathervane */}
    <rect x="-10" y="-126" width="20" height="16" fill={W} /><rect x="-10" y="-126" width="20" height="2" fill={SH} />
    <path d="M-13,-126 L0,-140 L13,-126 Z" fill={ROOF} />
    <line x1="0" y1="-140" x2="0" y2="-156" stroke={T("#2E3A32")} strokeWidth="1" /><path d="M-6,-152 L6,-152 L3,-154 M6,-152 L3,-150" stroke={T("#2E3A32")} strokeWidth="1" fill="none" />
    {/* upper windows + shutters */}
    {upX.map((x) => <g key={x}><rect x={x - 7.5} y="-71" width="3.5" height="14" fill={SHUT} /><rect x={x + 4} y="-71" width="3.5" height="14" fill={SHUT} /><rect x={x - 3.5} y="-70" width="7" height="12" fill={GL} /><rect x={x - 3.5} y="-64.5" width="7" height=".8" fill={W} opacity=".7" /></g>)}
    {/* upper balcony rail */}
    <rect x="-92" y="-44" width="184" height="2" fill={W} />{Array.from({ length: 46 }).map((_, i) => <rect key={i} x={-91 + i * 4} y="-52" width="1" height="8" fill={W} opacity=".9" />)}<rect x="-92" y="-53" width="184" height="1.4" fill={W} />
    {/* veranda windows, then columns */}
    {[-77, -49, -21, 21, 49, 77].map((x) => <rect key={x} x={x - 4} y="-31" width="8" height="16" fill={GL} />)}
    <rect x="-7" y="-33" width="14" height="29" fill={T("#2C3A34")} /><path d="M-7,-33 Q0,-40 7,-33 Z" fill={SH} />
    {col.map((x) => <g key={x}><rect x={x - 1.6} y="-38" width="3.2" height="34" fill={W} /><rect x={x + .6} y="-38" width="1" height="34" fill={SH} /></g>)}
    <rect x="-88" y="-16" width="176" height="1.4" fill={W} />{Array.from({ length: 44 }).map((_, i) => <rect key={i} x={-87 + i * 4} y="-15" width=".9" height="11" fill={W} opacity=".85" />)}
    <rect x="-94" y="-4" width="188" height="4" fill={SH} />
    {/* wing windows */}
    {wingW.concat(wingE).map((x) => <g key={x}><rect x={x - 6.5} y="-31" width="3" height="15" fill={SHUT} /><rect x={x + 3.5} y="-31" width="3" height="15" fill={SHUT} /><rect x={x - 3.5} y="-30" width="7" height="13" fill={GL} /></g>)}
    {/* lawn: umbrellas + tables */}
    {[[-150, 14], [-118, 18], [118, 18], [150, 14]].map(([x, y], i) => <g key={x} transform={`translate(${x} ${y})`}>
      <line x1="0" y1="0" x2="0" y2="-14" stroke={T("#E9E4D6")} strokeWidth=".9" />
      <path d="M-11,-12 Q0,-22 11,-12 Z" fill={T("#2F6A45")} /><path d="M-3.6,-12 Q0,-21.6 3.6,-12 Z" fill={T("#F4F0E4")} /><path d="M-11,-12 Q-7,-19 -6,-12 Z M11,-12 Q7,-19 6,-12 Z" fill={T("#F4F0E4")} opacity=".0" />
      <ellipse cx="0" cy="0" rx="6" ry="1.6" fill={T("#EDE8DA")} />
      <ellipse cx="0" cy="2" rx="12" ry="2" fill={T("#1F3A28")} opacity=".25" />
    </g>)}
    {/* flagpole */}
    <line x1="-178" y1="4" x2="-178" y2="-104" stroke={T("#EDE8DA")} strokeWidth="1.4" />
    <circle cx="-178" cy="-105" r="1.6" fill={T("#EDE8DA")} />
    <path fill={T("#1F6B45")}><animate attributeName="d" dur="2.6s" repeatCount="indefinite" values="M-178,-104 C-170,-106 -162,-101 -154,-104 L-154,-91 C-162,-89 -170,-93 -178,-91 Z;M-178,-104 C-170,-101 -162,-106 -155,-101 L-155,-88 C-162,-93 -170,-88 -178,-91 Z;M-178,-104 C-170,-106 -162,-101 -154,-104 L-154,-91 C-162,-89 -170,-93 -178,-91 Z" /></path>
  </g>;
}

const FLAG = ['M0,0 C14,-5 29,6 46,1 L46,29 C29,35 14,23 0,28 Z', 'M0,0 C15,6 30,-5 45,4 L45,32 C30,24 15,34 0,28 Z', 'M0,0 C13,2 27,3 43,-2 L43,26 C27,31 13,30 0,28 Z', 'M0,0 C14,-5 29,6 46,1 L46,29 C29,35 14,23 0,28 Z'].join(';');
const FOLD = ['M0,0 C14,-5 29,6 46,1 L46,6 C29,11 14,1 0,5 Z', 'M0,0 C15,6 30,-5 45,4 L45,9 C30,1 15,11 0,5 Z', 'M0,0 C13,2 27,3 43,-2 L43,3 C27,8 13,7 0,5 Z', 'M0,0 C14,-5 29,6 46,1 L46,6 C29,11 14,1 0,5 Z'].join(';');

function GolfScene({ hour = 9, uid = 'gs', crop = 'wide', play = false }) {
  if (!G) G = build();
  const k = skyAt(hour), id = (n) => uid + '-' + n, u = (n) => `url(#${uid}-${n})`;
  const T = (c) => (k.ambA > .01 ? mixc(c, k.amb, k.ambA) : c);
  const lit = 1 - k.ambA * .9, shadowDx = Math.max(-80, Math.min(80, (1064 - k.sunX) * .1));
  const ref = React.useRef(null);
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  React.useEffect(() => { if (RM) ref.current.querySelectorAll('svg').forEach((v) => v.pauseAnimations && v.pauseAnimations()); }, []);
  const ball = React.useRef(null), shadow = React.useRef(null);
  React.useEffect(() => {
    const b = ball.current, sh = shadow.current; if (!b) return;
    if (!play) { b.style.opacity = 0; sh.style.opacity = 0; return; }
    const P0 = [540, 1010], C = [760, 150], P1 = [1002, 648], END = [1052, 651];
    const put = (x, y, r, gx, gy, so) => { b.setAttribute('cx', x); b.setAttribute('cy', y); b.setAttribute('r', r); sh.setAttribute('cx', gx); sh.setAttribute('cy', gy); sh.setAttribute('rx', r * 1.3); sh.setAttribute('ry', r * .4); sh.style.opacity = so; b.style.opacity = 1; };
    if (RM) { put(END[0], END[1] - 3, 3.2, END[0], END[1], .5); return; }
    let raf, t0 = null; const FL = 1650, HOP = 380, ROLL = 900, DELAY = 350;
    const tick = (now) => {
      if (t0 === null) t0 = now; const t = now - t0 - DELAY;
      if (t < 0) { b.style.opacity = 0; raf = requestAnimationFrame(tick); return; }
      if (t < FL) { const u = t / FL, e = u; const x = (1 - e) ** 2 * P0[0] + 2 * (1 - e) * e * C[0] + e * e * P1[0], y = (1 - e) ** 2 * P0[1] + 2 * (1 - e) * e * C[1] + e * e * P1[1];
        const gx = P0[0] + (P1[0] - P0[0]) * e, gy = P0[1] + (P1[1] - P0[1]) * e; put(x, y, 10 - 6.8 * e, gx, gy + 2, .15 + .35 * e); }
      else if (t < FL + HOP) { const u = (t - FL) / HOP, x = P1[0] + 22 * u, gy = P1[1] + .8 * u; put(x, gy - 3 - Math.sin(u * Math.PI) * 11, 3.2, x, gy + 1, .5); }
      else if (t < FL + HOP + ROLL) { const u = (t - FL - HOP) / ROLL, e = 1 - (1 - u) ** 3, x = P1[0] + 22 + (END[0] - P1[0] - 22) * e, y = P1[1] + .8 + (END[1] - P1[1] - .8) * e; put(x, y - 3, 3.2, x, y + 1, .5); }
      else { put(END[0], END[1] - 3, 3.2, END[0], END[1] + 1, .5); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [play]);
  return (
    <div className="gs" ref={ref} aria-hidden="true">
      <svg className="gs-main" viewBox={crop === 'tall' ? '360 0 760 1000' : '0 0 1600 1000'} preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="600" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor={k.top} /><stop offset=".62" stopColor={k.mid} /><stop offset="1" stopColor={k.low} /></linearGradient>
          <radialGradient id={id('sun')}><stop offset="0" stopColor={k.glow} stopOpacity=".95" /><stop offset=".3" stopColor={k.glow} stopOpacity=".42" /><stop offset="1" stopColor={k.glow} stopOpacity="0" /></radialGradient>
          <radialGradient id={id('moon')}><stop offset="0" stopColor="#DCE4F4" stopOpacity=".5" /><stop offset="1" stopColor="#DCE4F4" stopOpacity="0" /></radialGradient>
          <linearGradient id={id('amb')} x1="0" y1="380" x2="0" y2="560" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor={k.amb} stopOpacity="0" /><stop offset="1" stopColor={k.amb} stopOpacity={k.ambA} /></linearGradient>
          <filter id="gs-glow" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="10" /></filter>
          <linearGradient id={id('haze')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={k.haze} stopOpacity="0" /><stop offset=".6" stopColor={k.haze} stopOpacity=".7" /><stop offset="1" stopColor={k.haze} stopOpacity="0" /></linearGradient>
          <linearGradient id={id('ground')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={T("#7E9F5E")} /><stop offset=".45" stopColor={T("#5E8748")} /><stop offset="1" stopColor={T("#3C6634")} /></linearGradient>
          <linearGradient id={id('fw')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={T("#B7CE89")} /><stop offset="1" stopColor={T("#86AC5F")} /></linearGradient>
          <radialGradient id={id('green')} cx=".42" cy=".38" r=".7"><stop offset="0" stopColor={T("#CBE39A")} /><stop offset=".7" stopColor={T("#A6C979")} /><stop offset="1" stopColor={T("#93BA69")} /></radialGradient>
          <linearGradient id={id('pond')} x1="0" y1="696" x2="0" y2="748" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor={T("#24443A")} /><stop offset=".35" stopColor={T("#3B625B")} /><stop offset=".75" stopColor={T("#5F8B84")} /><stop offset="1" stopColor={T("#4E7770")} /></linearGradient>
          <filter id={id('bl3')} x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="3" /></filter>
          <clipPath id={id('pondc')}><path d={POND} /></clipPath>
          <linearGradient id={id('sand')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={T("#C6B083")} /><stop offset=".4" stopColor={T("#EADFC0")} /><stop offset="1" stopColor={T("#F6EFD9")} /></linearGradient>
          <linearGradient id={id('flag')} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={T("#8E1D17")} /><stop offset=".3" stopColor={T("#C23A2B")} /><stop offset=".62" stopColor={T("#A42A20")} /><stop offset="1" stopColor={T("#C8412F")} />
            <animateTransform attributeName="gradientTransform" type="translate" values="-.25 0;.25 0;-.25 0" dur="1.9s" repeatCount="indefinite" /></linearGradient>
          <clipPath id={id('fwc')}><path d="M-60,1000 C200,870 520,770 820,698 C900,680 980,664 1040,660 C1110,656 1170,664 1196,676 C1260,720 1370,860 1520,1000 Z" /></clipPath>
          <filter id={id('soft')} x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="16" /></filter>
          <filter id={id('sh')} x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="9" /></filter>
        </defs>
        <g className="gs-cam">
        <rect x="-200" y="-200" width="2000" height="1400" fill={u('sky')} />
        {k.stars > .01 && <g opacity={k.stars}>{G.stars.map(([x, y, r0, t], i) => <circle key={i} cx={x} cy={y} r={r0} fill="#F4F1E4" opacity={.35 + t * .65} className={t > .72 ? 'gs-tw' : undefined} style={t > .72 ? { animationDelay: (-t * 4).toFixed(2) + 's' } : undefined} />)}</g>}
        {k.moon > .01 && <g opacity={k.moon}><circle cx={k.moonX} cy={k.moonY} r="110" fill={u('moon')} /><mask id={id('moonm')}><circle cx={k.moonX} cy={k.moonY} r="17" fill="#fff" /><circle cx={k.moonX + 8} cy={k.moonY - 5} r="15" fill="#000" /></mask><circle cx={k.moonX} cy={k.moonY} r="17" fill="#F4F1E4" mask={u('moonm')} /><circle cx={k.moonX} cy={k.moonY} r="17" fill="#F4F1E4" opacity=".06" /></g>}
        <circle cx={k.sunX} cy={k.sunY} r="520" fill={u('sun')} opacity={k.glowA} />
        <circle cx={k.sunX} cy={k.sunY} r={k.sunR} fill={k.sun} opacity={k.sunA} />
        <circle cx={k.sunX} cy={k.sunY} r={k.sunR * 2.2} fill={k.sun} opacity={k.sunA * .18} />
        <g className="gs-clouds" filter={u('soft')} fill={k.cloud} opacity={k.cloudA}>
          <ellipse cx="300" cy="170" rx="260" ry="26" /><ellipse cx="520" cy="200" rx="200" ry="16" opacity=".7" />
          <ellipse cx="1080" cy="120" rx="300" ry="22" opacity=".8" /><ellipse cx="1400" cy="260" rx="220" ry="18" opacity=".65" /><ellipse cx="820" cy="300" rx="160" ry="12" opacity=".55" />
        </g>
        <g className="gs-birds" stroke="#4C5A50" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity={.45 * (1 - k.stars)}>
          <path d="M420 250 q8 -7 16 0 q8 -7 16 0" /><path d="M468 276 q6 -5 12 0 q6 -5 12 0" />
        </g>
        <path d="M-50,548 C160,520 330,536 520,522 C720,508 900,530 1100,516 C1300,504 1460,526 1650,512 L1650,590 L-50,590 Z" fill={T(k.far)} opacity=".55" />
        <g fill={T(k.far)} opacity=".9">{G.far.map((d, i) => <path key={i} d={d} />)}</g>
        <rect x="-50" y="520" width="1700" height="70" fill={u('haze')} />
        <g opacity=".85">{G.back.map((t, i) => <g key={i}>
          <path d={`M${t.x},${t.base} L${t.x + t.lean},${t.top + 10}`} stroke={T("#58675A")} strokeWidth={t.w * .8} />
          {t.tiers.map((q, j) => <g key={j}><path d={q.d} fill={T("#557A60")} /><path d={q.lit} fill={T("#7A9A7C")} opacity=".6" /></g>)}
        </g>)}</g>
        <path d={G.mass} fill={T("#2F5A40")} /><g fill={T("#46714E")} opacity=".8">{G.mlit.map((d, i) => <path key={i} d={d} />)}</g>
        <g className="gs-mid">{G.front.map((t, i) => <g key={i}>
          <path d={`M${t.x},${t.base} L${t.x + t.lean},${t.top + 14}`} stroke={T("#3A3226")} strokeWidth={t.w} />
          {t.tiers.map((q, j) => <g key={j}><path d={q.d} fill={j % 2 ? T('#24472F') : T('#2B5237')} /><path d={q.lit} fill={T("#4F7B52")} opacity=".75" /></g>)}
        </g>)}</g>
        <path d="M-50,586 C200,580 400,592 640,586 C900,580 1200,594 1650,584 L1650,606 L-50,606 Z" fill={T("#2B4F37")} />
        <g transform="translate(560 604) scale(1.36)"><Clubhouse win={0} T={T} /></g>
        <path d="M-50,604 C240,592 520,606 820,598 C1100,590 1380,604 1650,596 L1650,1000 L-50,1000 Z" fill={u('ground')} /><path d="M-50,604 C240,592 520,606 820,598 C1100,590 1380,604 1650,596 L1650,622 C1380,630 1100,616 820,624 C520,632 240,618 -50,630 Z" fill={T("#20402A")} opacity=".25" />
        <path d="M-50,640 C200,620 420,650 640,632 L640,660 C420,680 200,650 -50,672 Z" fill={T("#6E9452")} opacity=".5" />
        <g className="gs-oak gs-oak--l">{G.oakL.map((q, i) => <path key={i} d={q.d} fill={i % 3 ? T('#3F6B46') : T('#355E3E')} />)}{G.oakL.map((q, i) => <path key={i} d={q.lit} fill={T("#7AA064")} opacity=".6" />)}</g>
        <g className="gs-oak gs-oak--r">{G.oakR.map((q, i) => <path key={i} d={q.d} fill={i % 3 ? T('#3B6543') : T('#325A3B')} />)}{G.oakR.map((q, i) => <path key={i} d={q.lit} fill={T("#80A767")} opacity=".6" />)}</g>
        <g fill={T("#F7F1E3")} opacity=".85">{G.bloom.map(([x, y, s], i) => <circle key={i} cx={x} cy={y} r={s} />)}</g>
        <path d="M-60,1000 C200,870 520,770 820,698 C900,680 980,664 1040,660 C1110,656 1170,664 1196,676 C1260,720 1370,860 1520,1000 Z" fill={u('fw')} />
        <g clipPath={u('fwc')} fill={T("#3E6A38")} opacity=".13">{G.stripes.map((d, i) => <path key={i} d={d} />)}</g>
        <path d="M-60,1000 C200,870 520,770 820,698 C900,680 980,664 1040,660 C1110,656 1170,664 1196,676 C1260,720 1370,860 1520,1000" fill="none" stroke={T("#E4EDBF")} strokeWidth="1.4" opacity=".55" />
        <g className="gs-pond">
          <path d={POND} transform="translate(0 5)" fill={T("#9CC074")} opacity=".9" />
          <path d={POND} transform="translate(0 1.4)" fill={T("#4A6440")} />
          <path d={POND} fill={u('pond')} />
          <g clipPath={u('pondc')}>
            <path d="M470,704 C520,712 560,700 600,710 C650,716 690,702 740,710 C790,716 830,704 870,712 L870,690 L470,690 Z" fill={T("#1E3A2A")} opacity=".55" filter={u('bl3')} />
            <g fill={T("#2A4A33")} opacity=".35" filter={u('bl3')}><ellipse cx="560" cy="712" rx="44" ry="6" /><ellipse cx="700" cy="710" rx="60" ry="5" /><ellipse cx="820" cy="714" rx="30" ry="5" /></g>
            <ellipse cx="660" cy="738" rx="170" ry="9" fill={k.mid} opacity=".4" filter={u('bl3')} />
            <g className="gs-shim" stroke={T("#FBF8EE")} strokeLinecap="round"><line x1="560" y1="727" x2="612" y2="727" strokeWidth="1.3" /><line x1="660" y1="733" x2="742" y2="733" strokeWidth="1.5" /><line x1="520" y1="738" x2="548" y2="738" strokeWidth="1.1" /><line x1="770" y1="724" x2="806" y2="724" strokeWidth="1" /></g>
          </g>
          <path d="M486,716 C530,700 640,693 742,697 C804,700 846,708 856,719" fill="none" stroke={T("#28452F")} strokeWidth="1.4" opacity=".7" />
          <g stroke={T("#4E6B3A")} strokeWidth="1.3" strokeLinecap="round" className="gs-reeds">{G.reeds.map(([a, b, c], i) => { const x = 470 + a * 34, h = 10 + b * 16; return <path key={i} d={`M${x.toFixed(1)},${(740 - c * 6).toFixed(1)} q${(b * 4 - 1).toFixed(1)},${(-h / 2).toFixed(1)} ${(b * 6 - 2).toFixed(1)},${(-h).toFixed(1)}`} fill="none" opacity={.6 + c * .4} />; })}</g>
        </g>
        <ellipse cx="1050" cy="668" rx="158" ry="18" fill={T("#28482A")} opacity=".28" />
        <ellipse cx="1040" cy="654" rx="140" ry="27" fill={T("#83AE5E")} />
        <ellipse cx="1040" cy="652" rx="124" ry="21" fill={u('green')} />
        <path d="M932,650 Q1040,640 1150,652 M944,660 Q1040,652 1140,662" stroke={T("#D8EAB0")} strokeWidth="3" fill="none" opacity=".35" />
        {BUNKERS.map((b) => <Bunker key={b.id} b={b} id={id} u={u} T={T} />)}
        <path d="M1500,720 C1300,760 1000,850 780,940 L860,1000 C1080,900 1360,800 1600,760 Z" fill={T("#1F3A22")} opacity=".2" filter={u('sh')} />
        <path d="M1600,860 C1420,880 1260,930 1120,1000 L1600,1000 Z" fill={T("#1F3A22")} opacity=".22" filter={u('sh')} />
        <g transform="translate(1064 650)">
          <line x1="0" y1="0" x2={shadowDx} y2="10" stroke={T("#2A4A2A")} strokeWidth="2" opacity={.32 * (1 - k.ambA)} strokeLinecap="round" />
          <ellipse cx="0" cy="0" rx="6" ry="2.2" fill={T("#1B2A1B")} />
          <line x1="0" y1="0" x2="0" y2="-104" stroke={T("#F4F1E8")} strokeWidth="2.6" strokeLinecap="round" />
          <line x1=".9" y1="-2" x2=".9" y2="-102" stroke={T("#B9B2A1")} strokeWidth=".9" />
          <g transform="translate(1 -104)">
            <path fill={u('flag')}><animate attributeName="d" dur="1.9s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1" values={FLAG} /></path>
            <path fill={T("#FFFFFF")} opacity=".16"><animate attributeName="d" dur="1.9s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1" values={FOLD} /></path>
          </g>
          <circle cx="0" cy="-105" r="2.2" fill={T("#E9E3D2")} />
        </g>
        <g transform="translate(560 604) scale(1.36)"><Clubhouse win={k.win} lightsOnly /></g>
        <ellipse ref={shadow} fill="#1B331D" style={{ opacity: 0 }} />
        <circle ref={ball} fill="#FFFFFF" stroke="#C9C2B0" strokeWidth=".6" style={{ opacity: 0 }} />
        </g>
      </svg>
      <svg className="gs-pine" viewBox="0 0 560 1000" overflow="visible" preserveAspectRatio="xMinYMax meet">
        <path d="M60,1000 C68,720 86,420 104,-40 L118,-40 C108,420 100,720 100,1000 Z" fill={T('#2B231A')} />
        <path d="M112,-30 C104,420 98,720 96,1000" stroke={T('#7A6547')} strokeWidth="2" fill="none" opacity=".45" />
        <g className="gs-sway">
          {G.pine.map((l, i) => <path key={'b' + i} d={l.d} stroke={T('#2B231A')} strokeWidth={l.w} fill="none" strokeLinecap="round" />)}
          {[...G.pine.flatMap((l) => l.pads), ...G.pineTop].map((q, i) => <g key={i}>
            <path d={q.under} fill={T('#12281A')} opacity=".85" />
            <path d={q.d} fill={T(q.t > .5 ? '#1C3A27' : '#21422D')} />
            <path d={q.lit} fill={T('#3E6C47')} opacity={.55 + q.t * .3} />
          </g>)}
        </g>
        <path d="M0,930 C80,900 180,910 260,950 C320,980 360,990 420,1000 L0,1000 Z" fill={T('#2E5530')} />
      </svg>
      <svg className="gs-bough" viewBox="0 0 520 300" overflow="visible" preserveAspectRatio="xMaxYMin meet">
        <g className="gs-sway gs-sway--b">
          {G.bough.map((l, i) => <path key={'b' + i} d={l.d} stroke={T('#2B231A')} strokeWidth={l.w + 1} fill="none" strokeLinecap="round" />)}
          {G.bough.flatMap((l) => l.pads).map((q, i) => <g key={i}>
            <path d={q.under} fill={T('#12281A')} opacity=".85" />
            <path d={q.d} fill={T(q.t > .5 ? '#1C3A27' : '#21422D')} />
            <path d={q.lit} fill={T('#3E6C47')} opacity={.5 + q.t * .3} />
          </g>)}
        </g>
      </svg>
      <svg className="gs-grain" preserveAspectRatio="none"><filter id={id('grain')}><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter><rect width="100%" height="100%" filter={u('grain')} /></svg>
    </div>
  );
}
Object.assign(window, { GolfScene, gsSkyAt: skyAt });
})();
