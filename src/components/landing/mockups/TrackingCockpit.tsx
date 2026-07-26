import type { CSSProperties } from 'react';
import { M, monoLabel, num } from './mock-tokens';

/**
 * The Shot Tracking & Stats vertical cockpit — hole diagram with sequenced
 * shot marks, the resolving result chip, and the SG / GIR / putts readout.
 * Fluid width, max ~380px in-section.
 *
 * 2026-07-25 — THE HOLE IS NOW THE PRODUCT'S HOLE. What was here before was a
 * 30px-stroke green lozenge with an ellipse stuck on the end, in a pale mint
 * that appears nowhere in the app, and its geometry contradicted its own
 * labels: three ~140-yard "shots" that ended 40 yards short of the green,
 * under a caption reading "Shot 3 · Approach · 168 yd in" and a result of
 * "Green, 18 ft". Nothing about it was true.
 *
 * Every shape and colour below is lifted from the real renderer,
 * `src/components/golf/coachhelm/v3/HoleShotPath/turf.tsx` + `index.tsx`
 * (the 2026-07-22 flat-schematic redesign):
 *
 *   • field `#12241b → #0e1c15`, fairway `#2c6248 → #245139`, green
 *     `#4fa676 → #3d8a63`, fringe `#2f6b4f`, tee `#6f5a3f`, cream `#f4ecd8`,
 *     cup `#0d1f17`, flag `#e3543b` — byte-identical to `turf.tsx`.
 *   • a straight tapered corridor closed with two Bezier caps, an elliptical
 *     green ringed by a concentric fringe line, an understated tee marker,
 *     and a yardage rail. No mow stripes, no fabricated dogleg, no bunkers
 *     we have no data for — `turf.tsx` rejects all three by name, and a
 *     marketing page that invents them is advertising a product feature that
 *     does not exist.
 *   • shots as quadratic Beziers in ONE warm cream (`#fbf3e0`) over a dark
 *     casing — `index.tsx`'s "cased lines, cream markers" treatment, whose
 *     lateral curve is the shot's real shape in a top-down view (a draw bends
 *     one way, a fade the other), never a side-on flight arc.
 *
 * Proportions are carried across from the app's 100×200 portrait viewBox into
 * this 300×126 flyover one by ratio, not by eye: the corridor is ~1/8.6 as
 * wide as it is long there and here; the green's along-hole extent is 7.1% of
 * the corridor there, 7.2% here.
 *
 * The one thing this diagram cannot do that the app can: show an 18-foot putt.
 * At 412 yards across ~350px, 18 ft is 5px — smaller than the ball marker. The
 * app solves it with a green-detail lens (`GreenInsetScenery`); at this size
 * that lens would be ~40px across and illegible, so the proximity is carried
 * by the readout below, where it is actually readable, and the corridor shows
 * honestly what 18 ft looks like at hole scale: on the pin.
 */

const cardStyle: CSSProperties = { background: M.surface, borderRadius: 20, boxShadow: M.softShadow, padding: 18 };

const RESULT_PILLS = ['Fairway', 'Rough', 'Sand'] as const;

// ── Hole 7 — 412 yd par 4 ───────────────────────────────────────────────────
// Everything below is derived from these five numbers, so the diagram, the
// shot captions, the result chip and the readouts cannot drift apart.

const HOLE_YARDS = 412;
const DRIVE_YARDS = 244;
const APPROACH_YARDS = HOLE_YARDS - DRIVE_YARDS; // 168 — the "168 yd in" caption
const PROXIMITY_FEET = 18;

const VB_W = 300;
const VB_H = 126;

/** Corridor centreline, and the tee/pin anchors it runs between. */
const CENTER_Y = 56;
const X_TEE = 26;
const X_PIN_END = 256;
const SPAN = X_PIN_END - X_TEE;

/** Yards → user units. The rail, the shot endpoints and the ball's proximity
 *  all read through this one function, so the scale is linear by construction
 *  rather than by assertion. */
const xAt = (yards: number) => X_TEE + (yards / HOLE_YARDS) * SPAN;
const unitsPerFoot = SPAN / HOLE_YARDS / 3;
const round = (n: number) => Math.round(n * 100) / 100;

// Corridor: a straight taper, wide at the tee, narrower at the green, closed
// with two smooth caps — turf.tsx's FAIRWAY_PATH_D in landscape.
const HALF_TEE = 17;
const HALF_GREEN = 12;
const X_CORRIDOR_END = 248;
const FAIRWAY_D = [
  `M ${X_TEE} ${CENTER_Y - HALF_TEE}`,
  `L ${X_CORRIDOR_END} ${CENTER_Y - HALF_GREEN}`,
  `Q 251.5 ${CENTER_Y} ${X_CORRIDOR_END} ${CENTER_Y + HALF_GREEN}`,
  `L ${X_TEE} ${CENTER_Y + HALF_TEE}`,
  `Q 22 ${CENTER_Y} ${X_TEE} ${CENTER_Y - HALF_TEE}`,
  'Z',
].join(' ');
/** Just the green-end cap — the ONE crisp highlight hairline, stroke-only. */
const FAIRWAY_EDGE_D = `M ${X_CORRIDOR_END} ${CENTER_Y - HALF_GREEN} Q 251.5 ${CENTER_Y} ${X_CORRIDOR_END} ${CENTER_Y + HALF_GREEN}`;

const GREEN = { cx: X_PIN_END, cy: CENTER_Y, rx: 18, ry: 30 };
const FRINGE = { rx: 19.4, ry: 32.3 };
const PIN = { x: 259, y: 51 };
const PIN_TOP_Y = 22;

/**
 * The two shots, as the app stores them: a start, a control point (the
 * shot's lateral shape seen from above) and an end, each carrying the real
 * on-course distance the draw schedule times it by.
 *
 * Drive 244 yd with a gentle draw → right-centre fairway, leaving 168 in.
 * Approach 168 yd → on the green, 18 ft. Those are the numbers the caption,
 * the chip and the proximity readout print; none of them is decorative.
 */
const DRIVE_END = { x: xAt(DRIVE_YARDS), y: 49 };
/** Short-left of the cup, placed by the SAME yards→units scale as everything
 *  else rather than eyeballed: 18 ft is 3.35 user units here, which is why the
 *  ball marker all but covers the cup. That is what 18 ft looks like on a
 *  412-yard hole, and pretending otherwise would be the lie. */
const PROXIMITY_UNITS = PROXIMITY_FEET * unitsPerFoot;
const BALL_ON_GREEN = {
  x: round(PIN.x - PROXIMITY_UNITS * 0.72),
  y: round(PIN.y + PROXIMITY_UNITS * 0.694),
};

const HOLE_SEGMENTS = [
  {
    id: '1',
    yards: DRIVE_YARDS,
    d: `M ${X_TEE} ${CENTER_Y} Q 100 62 ${round(DRIVE_END.x)} ${DRIVE_END.y}`,
  },
  {
    id: '2',
    yards: APPROACH_YARDS,
    d: `M ${round(DRIVE_END.x)} ${DRIVE_END.y} Q 210 44 ${BALL_ON_GREEN.x} ${BALL_ON_GREEN.y}`,
  },
] as const;

/** Rail marks, in yards FROM THE TEE — the convention the app's own rail was
 *  flipped to on 2026-07-24 ("yards from the tee, not to the pin"). */
const RAIL_Y = 104;
const RAIL_TICKS = [
  { yards: 0, label: 'TEE', anchor: 'start' as const, strong: true },
  { yards: 100, label: '100', anchor: 'middle' as const, strong: false },
  { yards: 200, label: '200', anchor: 'middle' as const, strong: false },
  { yards: 300, label: '300', anchor: 'middle' as const, strong: false },
  { yards: HOLE_YARDS, label: `${HOLE_YARDS}y`, anchor: 'end' as const, strong: true },
];

const CREAM = '#f4ecd8';
const SHOT_LINE = '#fbf3e0';
const railFont: CSSProperties = {
  fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  pointerEvents: 'none',
  userSelect: 'none',
};

const readoutTile: CSSProperties = { borderRadius: 14, padding: 12, overflow: 'hidden' };

export function TrackingCockpit() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: M.sans, color: M.ink, lineHeight: 1.5 }}>
      {/* Hole hero */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 15, fontWeight: 640, color: M.ink }}>Hole 7</span>
            <span style={{ fontFamily: M.mono, fontSize: 10.5, color: M.accent700, background: M.accent50, padding: '2px 8px', borderRadius: 9999 }}>PAR 4</span>
          </div>
          <div style={{ ...num, fontSize: 12, color: M.ink3 }}>{HOLE_YARDS} yd</div>
        </div>
        <div style={{ marginTop: 12, borderRadius: 14, overflow: 'hidden', aspectRatio: `${VB_W} / ${VB_H}`, position: 'relative' }}>
          {/* preserveAspectRatio is uniform ("meet"), NOT "none": the capture
              scene draws these segments with strokeDasharray in viewBox user
              units, and non-uniform scaling would desync the dash length from
              the rendered stroke. */}
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="tc-field" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#12241b" />
                <stop offset="100%" stopColor="#0e1c15" />
              </linearGradient>
              <linearGradient id="tc-fairway" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2c6248" />
                <stop offset="100%" stopColor="#245139" />
              </linearGradient>
              <radialGradient id="tc-green" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#4fa676" />
                <stop offset="100%" stopColor="#3d8a63" />
              </radialGradient>
            </defs>

            {/* 1. Field — the flat out-of-bounds canvas beyond the corridor. */}
            <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#tc-field)" />

            {/* 2. Fairway corridor + its one crisp green-end highlight. */}
            <path d={FAIRWAY_D} fill="url(#tc-fairway)" />
            <path d={FAIRWAY_EDGE_D} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.7" />

            {/* 3. Green — fringe ring drawn first so the green's own edge sits
                crisply on top of it, not the other way around. */}
            <ellipse cx={GREEN.cx} cy={GREEN.cy} rx={FRINGE.rx} ry={FRINGE.ry} fill="none" stroke="#2f6b4f" strokeWidth="1.3" />
            <ellipse cx={GREEN.cx} cy={GREEN.cy} rx={GREEN.rx} ry={GREEN.ry} fill="url(#tc-green)" />

            {/* 4. Tee — a small, understated marker behind the corridor. */}
            <rect x="13" y="44" width="11" height="24" rx="1.8" fill="#6f5a3f" />

            {/* 5. Yardage rail — the accuracy cue. Every mark is placed by
                `xAt`, so the axis really is linear in yards. */}
            <g>
              <line x1={X_TEE} y1={RAIL_Y} x2={X_PIN_END} y2={RAIL_Y} stroke={CREAM} strokeOpacity="0.16" strokeWidth="0.7" />
              <text x={X_TEE} y="96" fontSize="6.6" fontWeight={600} fill={CREAM} fillOpacity="0.5" letterSpacing="0.05em" style={railFont}>
                YDS FROM TEE
              </text>
              {RAIL_TICKS.map((t) => {
                const x = xAt(t.yards);
                return (
                  <g key={t.yards}>
                    <line
                      x1={x}
                      y1={RAIL_Y}
                      x2={x}
                      y2={RAIL_Y - (t.strong ? 5 : 3.4)}
                      stroke={CREAM}
                      strokeOpacity={t.strong ? 0.6 : 0.32}
                      strokeWidth="0.7"
                      strokeLinecap="round"
                    />
                    <text
                      x={x}
                      y="114"
                      fontSize="8"
                      fontWeight={t.strong ? 700 : 500}
                      fill={CREAM}
                      fillOpacity={t.strong ? 0.82 : 0.45}
                      textAnchor={t.anchor}
                      style={railFont}
                    >
                      {t.label}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* 6. Pin — cup, cream mast, the red flag as the one accent. */}
            <circle cx={PIN.x} cy={PIN.y} r="2" fill="#0d1f17" />
            <line x1={PIN.x} y1={PIN.y} x2={PIN.x} y2={PIN_TOP_Y} stroke={CREAM} strokeWidth="0.8" strokeLinecap="round" />
            <path d={`M ${PIN.x} ${PIN_TOP_Y} L ${PIN.x + 11} ${PIN_TOP_Y + 2.6} L ${PIN.x} ${PIN_TOP_Y + 5.2} Z`} fill="#e3543b" />
            <path d={`M ${PIN.x} ${PIN_TOP_Y} L ${PIN.x + 11} ${PIN_TOP_Y + 2.6} L ${PIN.x} ${PIN_TOP_Y + 2.6} Z`} fill="#f8f2dd" opacity="0.18" />

            {/* 7. Shots — one path PER SHOT, not one polyline for the whole
                hole. The scene draws them in sequence on a yardage-scaled
                schedule, the way the real HoleShotPath renderer does; each
                carries its real on-course distance. The dark casing is the
                app's own transit-map treatment, so a bright line separates
                crisply from the fairway underneath it. */}
            {HOLE_SEGMENTS.map((seg) => (
              <path
                key={seg.id}
                data-shot-seg={seg.id}
                data-yards={seg.yards}
                d={seg.d}
                fill="none"
                stroke={SHOT_LINE}
                strokeWidth="2.6"
                strokeLinecap="round"
                style={{ filter: 'drop-shadow(0 0 1.3px rgba(8,20,15,0.95))' }}
              />
            ))}

            {/* The tee shot's own origin — it exists before any shot is hit. */}
            <circle cx={X_TEE} cy={CENTER_Y} r="2.3" fill={CREAM} stroke="#10241c" strokeWidth="0.7" />
            {/* Landing marks. Cream fill with a dark punch-stroke, never turf
                green — the app learned that one the hard way. */}
            <circle data-shot-dot="1" cx={DRIVE_END.x} cy={DRIVE_END.y} r="3.2" fill={SHOT_LINE} stroke="#10241c" strokeWidth="0.7" />
            <circle data-shot-dot="2" cx={BALL_ON_GREEN.x} cy={BALL_ON_GREEN.y} r="2.9" fill={SHOT_LINE} stroke="#10241c" strokeWidth="0.7" />
            {/* The ball riding the head of the segment currently drawing. */}
            <circle data-shot-ball="" cx={X_TEE} cy={CENTER_Y} r="1.8" fill="#fff9ec" opacity="0" />
          </svg>
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, color: M.ink }}>
            <span style={{ fontWeight: 600 }}>Shot 2</span> · Approach
          </div>
          <div style={{ ...num, fontSize: 12.5, color: M.ink2 }}>{APPROACH_YARDS} yd in</div>
        </div>
      </div>

      {/* Result entry */}
      <div style={cardStyle}>
        <div style={{ ...monoLabel(10), letterSpacing: '0.1em' }}>Result of shot</div>
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {RESULT_PILLS.map((p) => (
            <span key={p} style={{ fontSize: 12.5, color: M.ink2, background: M.sunken, padding: '8px 13px', borderRadius: 9999 }}>{p}</span>
          ))}
          <span data-capture="chip-active" style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', background: M.accentDeep, padding: '8px 13px', borderRadius: 9999, boxShadow: '0 2px 6px oklch(0.35 0.08 150 / 0.3)' }}>Green</span>
          <span style={{ fontSize: 12.5, color: M.ink2, background: M.sunken, padding: '8px 13px', borderRadius: 9999 }}>Hole</span>
        </div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: M.sunken, borderRadius: 12, padding: '11px 14px' }}>
          <span style={{ fontSize: 12.5, color: M.ink3 }}>Proximity to hole</span>
          <span data-capture="proximity" style={{ ...num, fontSize: 14, fontWeight: 600, color: M.ink }}>{PROXIMITY_FEET} ft</span>
        </div>
      </div>

      {/* Readout tiles. Each tile is a MASK: its chrome is present from the
          first frame and its content rises into view underneath at full
          opacity. A scrubbed opacity ramp would leave these numerals parked
          at whatever fraction the reader stopped scrolling on — which is
          exactly how the old version read: a permanent 27%-opacity ghost. A
          datum is either legible or absent, never dimmed. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div style={{ ...readoutTile, background: M.accent50 }}>
          <div data-capture="readout-value">
            <div style={{ ...monoLabel(9.5, M.accent700), letterSpacing: '0.06em' }}>SG · App</div>
            <div style={{ ...num, fontSize: 20, fontWeight: 600, color: M.accent700, marginTop: 3 }}>+0.4</div>
          </div>
        </div>
        <div style={{ ...readoutTile, background: M.surface, boxShadow: M.softShadow }}>
          <div data-capture="readout-value">
            <div style={{ ...monoLabel(9.5), letterSpacing: '0.06em' }}>GIR</div>
            <div style={{ ...num, fontSize: 20, fontWeight: 600, color: M.ink, marginTop: 3 }}>
              57<span style={{ fontSize: 12, color: M.ink3 }}>%</span>
            </div>
          </div>
        </div>
        <div style={{ ...readoutTile, background: M.surface, boxShadow: M.softShadow }}>
          <div data-capture="readout-value">
            <div style={{ ...monoLabel(9.5), letterSpacing: '0.06em' }}>Putts</div>
            <div style={{ ...num, fontSize: 20, fontWeight: 600, color: M.ink, marginTop: 3 }}>31.3</div>
          </div>
        </div>
      </div>
    </div>
  );
}
