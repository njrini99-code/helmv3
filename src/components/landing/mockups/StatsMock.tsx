import type { CSSProperties, ReactNode } from 'react';
import { M, monoLabel, num } from './mock-tokens';

/**
 * Handcrafted recreation of the player stats detail page (spine + bento —
 * /golf/dashboard/stats) for the landing showcase band. Intrinsic width
 * 1160 — scale via <ScaledEmbed>. Illustration only (parent adds role="img").
 */

const lab = (color?: string): CSSProperties => ({ ...monoLabel(9.5, color) });

const cell: CSSProperties = {
  position: 'relative',
  background: M.surface,
  border: `1px solid ${M.lineSolid}`,
  borderRadius: 14,
  padding: '15px 16px 26px',
};

const hl: CSSProperties = { fontFamily: M.mono, fontSize: 23, fontWeight: 600, letterSpacing: '-0.02em', color: M.ink };
const sent: CSSProperties = { fontSize: 11, lineHeight: 1.42, color: M.ink2 };
const arw: CSSProperties = { position: 'absolute', right: 13, bottom: 11, color: M.ink3, fontSize: 13 };

function Track({ fill, tick }: { fill: number; tick?: number }) {
  return (
    <span style={{ flex: 1, height: 6, borderRadius: 9999, background: M.sunkenDeep, position: 'relative' }}>
      <span style={{ position: 'absolute', inset: `0 ${100 - fill}% 0 0`, background: M.accent, borderRadius: 9999 }} />
      {tick !== undefined ? (
        <span style={{ position: 'absolute', left: `${tick}%`, top: -2, bottom: -2, width: 2, background: M.ink3 }} />
      ) : null}
    </span>
  );
}

function MiniRow({ label, fill, value, tick, wide }: { label: string; fill: number; value: string; tick?: number; wide?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5 }}>
      <span style={{ width: wide ? 52 : 34, color: M.ink3 }}>{label}</span>
      <Track fill={fill} tick={tick} />
      <span style={{ ...num, width: wide ? 24 : 26, textAlign: 'right', color: M.ink2 }}>{value}</span>
    </div>
  );
}

function TripleStat({ items }: { items: Array<{ value: ReactNode; label: string }> }) {
  return (
    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
      {items.map((item, i) => (
        <div key={item.label} style={{ padding: i === 0 ? '0 10px 0 0' : i === 1 ? '0 10px' : '0 0 0 10px', borderLeft: i > 0 ? `1px solid ${M.lineSolid}` : 'none' }}>
          <div style={{ ...num, fontSize: 24, fontWeight: 600 }}>{item.value}</div>
          <div style={{ ...lab(), marginTop: 4 }}>{item.label}</div>
        </div>
      ))}
    </div>
  );
}

const LAST_10: Array<{ score: string; height: string; color: string }> = [
  { score: '75', height: '52%', color: 'oklch(0.82 0.08 150)' },
  { score: '75', height: '52%', color: 'oklch(0.82 0.08 150)' },
  { score: '75', height: '52%', color: 'oklch(0.82 0.08 150)' },
  { score: '78', height: '66%', color: 'oklch(0.62 0.11 150)' },
  { score: '74', height: '46%', color: 'oklch(0.82 0.08 150)' },
  { score: '69', height: '28%', color: M.accent },
  { score: '78', height: '66%', color: 'oklch(0.62 0.11 150)' },
  { score: '76', height: '56%', color: 'oklch(0.75 0.1 150)' },
  { score: '87', height: '92%', color: M.warn },
  { score: '85', height: '86%', color: M.warn },
];

export function StatsMock() {
  return (
    <div className="landing-mock-stats" style={{ width: 1160, background: M.canvas, padding: '30px 34px 36px', fontFamily: M.sans, color: M.ink, WebkitFontSmoothing: 'antialiased', lineHeight: 1.5 }}>
      <div style={lab(M.accent700)}>Stats</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginTop: 8 }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 640, letterSpacing: '-0.02em' }}>Test Player&apos;s stats</div>
          <p style={{ margin: '7px 0 0', fontSize: 14, color: M.ink2 }}>Where Test Player stands vs PGA Tour and the team — and where the strokes are leaking.</p>
        </div>
        <span style={{ fontSize: 12, color: M.ink3, whiteSpace: 'nowrap' }}>← Team stats</span>
      </div>
      <div style={{ marginTop: 16, borderBottom: `1px solid ${M.lineSolid}` }}>
        <span style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 560, color: M.ink, borderBottom: `2px solid ${M.accent}`, padding: '0 2px 9px', marginBottom: -1 }}>Brief</span>
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 18, alignItems: 'stretch' }}>
        {/* Spine */}
        <div style={{ flex: 'none', width: 290, background: 'linear-gradient(168deg, #1d6440, #123d28)', borderRadius: 18, padding: '22px 20px', color: '#e9f8ee', display: 'flex', flexDirection: 'column' }}>
          <div style={{ ...monoLabel(9.5, '#93d3aa'), letterSpacing: '0.13em' }}>Strokes Gained</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
            <span style={{ ...num, fontSize: 50, fontWeight: 600 }}>−4.44</span>
            <span style={{ fontFamily: M.mono, fontSize: 11.5, color: '#93d3aa' }}>SG / rd</span>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.5, color: '#c2e6cf' }}>−4.44 strokes per round vs the field. Leaking most in putting.</p>
          <div style={{ marginTop: 16, position: 'relative', height: 6, borderRadius: 9999, background: 'rgba(255,255,255,0.15)' }}>
            <span style={{ position: 'absolute', left: '38%', top: -1, width: 2, height: 8, background: 'rgba(255,255,255,0.55)' }} />
            <span style={{ position: 'absolute', left: '6%', top: -3, width: 12, height: 12, borderRadius: '50%', background: '#fff', boxShadow: '0 0 0 3px rgba(255,255,255,0.18)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: M.mono, fontSize: 9, color: '#93d3aa', marginTop: 8 }}>
            <span>TP</span><span>Team</span><span>Tour</span>
          </div>
          <div style={{ ...monoLabel(9.5, '#93d3aa'), letterSpacing: '0.13em', marginTop: 18 }}>Priorities</div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {[
              { n: '01', label: 'SG: Putting', v: '−3.88' },
              { n: '02', label: 'SG: Approach', v: '−1.54' },
              { n: '03', label: 'Three-putts / round', v: '−1.06' },
            ].map((p) => (
              <div key={p.n} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                <span style={{ ...num, color: '#93d3aa' }}>{p.n}</span>
                <span style={{ flex: 1 }}>{p.label}</span>
                <span style={num}>{p.v}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.13)', display: 'flex', flexDirection: 'column', gap: 9, fontSize: 12.5 }}>
            {[
              { label: 'Rounds', v: <>15</> },
              { label: 'Fairways', v: <>61% <span style={{ color: '#7fe0a0' }}>▲</span></> },
              { label: 'Greens', v: <>65% <span style={{ color: '#f0b466' }}>▼</span></> },
              { label: 'Putts / rd', v: <>32.9 <span style={{ color: '#f0b466' }}>▲</span></> },
            ].map((row) => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#c2e6cf' }}>{row.label}</span>
                <span style={num}>{row.v}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 'auto', paddingTop: 18 }}>
            <div style={{ width: '100%', fontSize: 12.5, fontWeight: 600, color: '#123d28', background: '#e9f8ee', padding: 11, borderRadius: 9999, textAlign: 'center' }}>Ask CoachHelm</div>
          </div>
        </div>

        {/* Bento */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <div style={{ ...cell, gridColumn: '1 / 3' }}>
            <div style={lab()}>Core ball striking</div>
            <TripleStat items={[
              { value: <>61<span style={{ fontSize: 13, color: M.ink3 }}>%</span></>, label: 'Fairways' },
              { value: <>65<span style={{ fontSize: 13, color: M.ink3 }}>%</span></>, label: 'GIR' },
              { value: <>34<span style={{ fontSize: 13, color: M.ink3 }}>%</span></>, label: 'Scrambling' },
            ]} />
            <p style={{ ...sent, marginTop: 12 }}>The three conversion rates that shape scoring opportunity.</p>
          </div>
          <div style={{ ...cell, gridColumn: '3 / 5' }}>
            <div style={lab()}>Per 18 holes</div>
            <TripleStat items={[
              { value: '75.3', label: 'Score avg' },
              { value: '32.9', label: 'Putts' },
              { value: '2.6', label: 'Birdies' },
            ]} />
            <p style={{ ...sent, marginTop: 12 }}>Normalized to a full round so every scorecard compares cleanly.</p>
            <span style={arw}>→</span>
          </div>

          <div style={{ ...cell, gridColumn: '1 / 3', gridRow: '2 / 4' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={lab()}>Putting</span>
              <span style={{ fontFamily: M.mono, fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 9999, color: M.warnDeep, background: 'oklch(0.72 0.13 55 / 0.16)' }}>Leak</span>
            </div>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 7 }}>
              <span style={{ ...hl, fontSize: 28 }}>28%</span>
              <span style={{ fontSize: 11.5, color: M.ink3 }}>5–10 ft</span>
            </div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
              {[
                { band: '0–3 ft', pct: 97, tick: undefined },
                { band: '5–10 ft', pct: 28, tick: 60 },
                { band: '15–20 ft', pct: 15, tick: 34 },
              ].map((row) => (
                <div key={row.band}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: M.ink2, marginBottom: 5 }}>
                    <span>{row.band}</span>
                    <span style={num}>{row.pct}%</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 9999, background: M.sunkenDeep, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${row.pct}%`, background: M.accent, borderRadius: 9999 }} />
                    {row.tick !== undefined ? <span style={{ position: 'absolute', left: `${row.tick}%`, top: -2, bottom: -2, width: 2, background: M.ink3 }} /> : null}
                  </div>
                </div>
              ))}
            </div>
            <p style={{ ...sent, marginTop: 16 }}>Make rate by distance band, vs the PGA Tour tick.</p>
            <span style={arw}>→</span>
          </div>

          <div style={{ ...cell, gridColumn: '3' }}>
            <div style={lab()}>Off the tee</div>
            <div style={{ marginTop: 7, display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={hl}>61%</span>
              <span style={{ fontSize: 10.5, color: M.ink3 }}>fairways</span>
            </div>
            <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <MiniRow label="Fairw" fill={61} value="61%" />
              <MiniRow label="Par 4" fill={62} value="62%" />
              <MiniRow label="Par 5" fill={59} value="59%" />
            </div>
            <span style={arw}>→</span>
          </div>
          <div style={{ ...cell, gridColumn: '4' }}>
            <div style={lab()}>Approach</div>
            <div style={{ marginTop: 7, display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={hl}>65%</span>
              <span style={{ fontSize: 10.5, color: M.ink3 }}>GIR</span>
            </div>
            <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <MiniRow label="GIR" fill={65} value="65%" tick={72} />
              <MiniRow label="Par 3" fill={62} value="62%" />
              <MiniRow label="Par 4" fill={61} value="61%" />
            </div>
            <span style={arw}>→</span>
          </div>
          <div style={{ ...cell, gridColumn: '3' }}>
            <div style={lab()}>Short game</div>
            <div style={{ marginTop: 7, display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={hl}>34%</span>
              <span style={{ fontSize: 10.5, color: M.ink3 }}>scrambling</span>
            </div>
            <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <MiniRow label="Scrambling" fill={34} value="34%" wide />
              <MiniRow label="Sand save" fill={5} value="5%" wide />
            </div>
            <p style={{ ...sent, marginTop: 10 }}>Up-and-down and bunker recovery.</p>
            <span style={arw}>→</span>
          </div>
          <div style={{ ...cell, gridColumn: '4' }}>
            <div style={lab()}>Scoring</div>
            <div style={{ marginTop: 7, display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={hl}>+3.50</span>
              <span style={{ fontSize: 10.5, color: M.ink3 }}>/ 18</span>
            </div>
            <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[
                { label: 'Par 3', width: '18%', side: 'right' as const, v: '+0.41', warn: true },
                { label: 'Par 4', width: '10%', side: 'right' as const, v: '+0.22', warn: true },
                { label: 'Par 5', width: '5%', side: 'left' as const, v: '−0.09', warn: false },
              ].map((row) => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5 }}>
                  <span style={{ width: 34, color: M.ink3 }}>{row.label}</span>
                  <span style={{ flex: 1, height: 6, borderRadius: 9999, background: M.sunkenDeep, position: 'relative' }}>
                    <span style={{ position: 'absolute', top: 0, bottom: 0, width: row.width, background: row.warn ? M.warn : M.accent, borderRadius: 9999, ...(row.side === 'right' ? { left: '50%' } : { right: '50%' }) }} />
                  </span>
                  <span style={{ ...num, width: 32, textAlign: 'right', color: row.warn ? M.ink2 : M.accent700 }}>{row.v}</span>
                </div>
              ))}
            </div>
            <span style={arw}>→</span>
          </div>

          <div style={{ ...cell, gridColumn: '1 / 3' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={lab()}>Standing</span>
              <span style={{ fontFamily: M.mono, fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 9999, color: M.accent700, background: M.accent50 }}>Best</span>
            </div>
            <div style={{ ...hl, marginTop: 7, fontSize: 19 }}>SG: Putting</div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ ...num, fontSize: 12, color: M.accent700, fontWeight: 600 }}>−0.42</span>
              <span style={lab()}>SG: Total</span>
            </div>
            <div style={{ marginTop: 6, position: 'relative', height: 7, borderRadius: 9999, background: M.sunkenDeep }}>
              <span style={{ position: 'absolute', left: '50%', top: -1, bottom: -1, width: 1.5, background: M.ink2 }} />
              <span style={{ position: 'absolute', left: '36%', top: -1, bottom: -1, width: 1.5, background: M.ink3 }} />
              <span style={{ position: 'absolute', top: 0, bottom: 0, left: '41%', width: '9%', background: M.warn, borderRadius: 9999 }} />
              <span style={{ position: 'absolute', top: '50%', left: '41%', width: 11, height: 11, transform: 'translate(-50%, -50%)', borderRadius: '50%', background: M.accent, boxShadow: `0 0 0 2px ${M.surface}` }} />
            </div>
            <div style={{ position: 'relative', height: 12, marginTop: 5, fontFamily: M.mono, fontSize: 8.5, color: M.ink3 }}>
              <span style={{ position: 'absolute', left: '41%', transform: 'translateX(-50%)', color: M.accent700, fontWeight: 600 }}>You</span>
              <span style={{ position: 'absolute', left: '36%', transform: 'translateX(-50%)' }}>Team</span>
              <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>Tour</span>
            </div>
            <p style={{ ...sent, marginTop: 10 }}>Strongest in off the tee; leaking most in putting.</p>
            <span style={arw}>→</span>
          </div>
          <div style={{ ...cell, gridColumn: '3 / 5' }}>
            <div style={lab()}>Last 10 rounds</div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ ...num, fontSize: 20, fontWeight: 600 }}>10</span>
              <span style={{ fontSize: 10.5, color: M.ink3 }}>rounds</span>
            </div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-end', gap: 8, height: 70 }}>
              {LAST_10.map((bar, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }}>
                  <span style={{ ...num, fontSize: 8, color: M.ink3 }}>{bar.score}</span>
                  <span style={{ width: '100%', height: bar.height, background: bar.color, borderRadius: '4px 4px 0 0' }} />
                </div>
              ))}
            </div>
            <p style={{ ...sent, marginTop: 9 }}>Score trend across the most recent rounds.</p>
            <span style={arw}>→</span>
          </div>
        </div>
      </div>
    </div>
  );
}
