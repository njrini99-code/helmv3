(() => {
const { Icon, Avatar, Segmented } = window.FairwayClubhouseEdition_9c4f4d;
const R = window.ROSTER;
const act = R.players.filter((p) => p.status === 'active');
const LEGS = ['Off the tee', 'Approach', 'Around green', 'Putting'];
const WEEKS = ['Aug 30', 'Sep 6', 'Sep 13', 'Sep 20', 'Sep 27', 'Oct 4', 'Oct 12'];
const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
// team SG per leg over time (per round vs D1)
const TEAM = {
  'Off the tee': [0.1, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4],
  'Approach': [-1.2, -1.1, -1.0, -0.9, -0.9, -0.8, -0.8],
  'Around green': [0.0, -0.1, 0.1, 0.0, 0.1, 0.1, 0.1],
  'Putting': [0.1, 0.2, 0.1, 0.3, 0.2, 0.3, 0.3],
};
const seed = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296); };
function playerLegs(p) {
  if (p.id === 'jonah') return [0.3, -1.2, -0.1, 0.2];
  const r = seed(p.id + 'legs'); const s = p.sg ?? 0;
  return [s * 0.3 + (r() - 0.5) * 0.6, s * 0.35 + (r() - 0.6) * 0.8, s * 0.15 + (r() - 0.5) * 0.4, s * 0.2 + (r() - 0.5) * 0.6].map((v) => +v.toFixed(1));
}
function playerSgTrend(p) {
  const r = seed(p.id + 'sgt'); const end = p.sg ?? 0; const start = p.id === 'jonah' ? 0.8 : p.id === 'priya' ? -2.9 : end - (r() - 0.4) * 1.4;
  return WEEKS.map((_, i) => +(start + (end - start) * (i / (WEEKS.length - 1)) + (r() - 0.5) * 0.5).toFixed(1));
}

function mono(pts) {
  const n = pts.length; if (n < 2) return '';
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  let d = 'M' + pts[0][0] + ',' + pts[0][1];
  for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3; d += ` C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`; }
  return d;
}

// Small-multiple: one leg's SG trend vs a zero (D1) baseline, colored by sign of latest.
function LegTrend({ leg, data, selected, onSelect }) {
  const w = 260, h = 92, pad = 10, lo = -1.5, hi = 1;
  const x = (i) => pad + (i * (w - pad * 2)) / (data.length - 1), y = (v) => pad + ((hi - v) / (hi - lo)) * (h - pad * 2);
  const pts = data.map((v, i) => [x(i), y(v)]);
  const last = data[data.length - 1], first = data[0], ch = last - first;
  const tone = last >= 0 ? 'var(--chart-gain)' : 'var(--chart-loss)';
  const d = mono(pts);
  return (
    <button className={'sgm' + (selected ? ' is-sel' : '')} onClick={onSelect} aria-pressed={selected}>
      <span className="sgm__top"><span className="sgm__l">{leg}</span><span className={'sgm__v fw-num ' + (last >= 0 ? 'is-gain' : 'is-loss')}>{sgn(last)}</span></span>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="sgm__svg" aria-hidden="true">
        <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} stroke="var(--champagne-500)" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={d + ` L${x(data.length - 1)},${y(0)} L${pad},${y(0)} Z`} fill={tone} opacity=".08" />
        <path d={d} fill="none" stroke={tone} strokeWidth="1.75" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.5" fill="var(--ivory-25)" stroke={tone} strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="sgm__n">{Math.abs(ch) < 0.15 ? 'Flat since August' : (ch > 0 ? 'Up ' : 'Down ') + Math.abs(ch).toFixed(1) + ' since August'}</span>
    </button>
  );
}

// Merged trend: one card, two lenses (strokes gained / scoring). Team bold, players faint, focus highlighted.
function SgTotalTrend({ focus, setFocus }) {
  const [lens, setLens] = React.useState('sg');
  const isSg = lens === 'sg';
  const w = 760, h = 260, padL = 38, padR = 16, padT = 16, padB = 28;
  const [lo, hi] = isSg ? [-3.2, 2.6] : [77.5, 69.5];
  const x = (i) => padL + (i * (w - padL - padR)) / (WEEKS.length - 1), y = (v) => padT + ((hi - v) / (hi - lo)) * (h - padT - padB);
  const team = isSg ? WEEKS.map((_, i) => +(LEGS.reduce((a, l) => a + TEAM[l][i], 0)).toFixed(2)) : [74.8, 74.4, 74.2, 73.9, 73.1, 73.5, 73.4];
  const lines = isSg ? act.filter((p) => p.sg != null).map((p) => ({ p, data: playerSgTrend(p) })) : act.filter((p) => p.trend.length === 7).map((p) => ({ p, data: p.trend }));
  const path = (data) => mono(data.map((v, i) => [x(i), y(v)]));
  const ticks = isSg ? [-3, -2, -1, 0, 1, 2] : [70, 72, 74, 76];
  const ref = isSg ? 0 : 72;
  const tickLbl = (t) => isSg ? (t > 0 ? '+' + t : t === 0 ? '0' : '−' + Math.abs(t)) : String(t);
  const good = (v) => isSg ? v >= 0 : v <= 72;
  const endLbl = (v) => isSg ? sgn(v) : v.toFixed(0);
  const sel = lines.find((l) => l.p.id === focus);
  const first = (d) => d[0], last = (d) => d[d.length - 1];
  const note = sel
    ? (isSg ? sel.p.name.split(' ')[0] + (last(sel.data) > first(sel.data) ? ' has gained ' : ' has lost ') + Math.abs(last(sel.data) - first(sel.data)).toFixed(1) + ' strokes a round since August.'
            : sel.p.name.split(' ')[0] + ' is ' + (last(sel.data) < first(sel.data) ? 'down ' : 'up ') + Math.abs(last(sel.data) - first(sel.data)).toFixed(0) + ' strokes from late August, now ' + last(sel.data) + '.')
    : (isSg ? 'The team has gained about 0.9 a round since August, almost all of it from approach and off the tee.' : 'Down nine-tenths since August to 73.4, mostly from Theo and Priya. Season best was 73.1 on Sep 27.');
  const sorted = [...lines].sort((a, b) => isSg ? last(b.data) - last(a.data) : last(a.data) - last(b.data));
  return (
    <section className="sgt">
      <div className="sgt__head">
        <div><h2>{isSg ? 'Strokes gained · total' : 'Scoring average'}</h2><span>{isSg ? 'Per round vs. D1 · rolling 3-round average · dashed line is D1' : 'Team and players · par 72 · 58 rounds · dashed line is par'}</span></div>
        <div className="sgt__tools">
          <div className="sgt__legend"><span><i className="is-team"></i>Team</span>{sel && <span><i className="is-sel"></i>{sel.p.name.split(' ')[0]}</span>}<span><i className="is-other"></i>Players</span></div>
          <Segmented size="sm" label="Measure" value={lens} onChange={setLens} options={[{ value: 'sg', label: 'Strokes gained' }, { value: 'score', label: 'Scoring' }]} />
        </div>
      </div>
      <div className="sgt__plot">
        <svg viewBox={`0 0 ${w} ${h}`} className="sgt__svg" role="img" aria-label={(isSg ? 'Strokes gained total' : 'Scoring average') + ' by week'}>
          {ticks.map((t) => <g key={t}><line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={t === ref ? 'var(--champagne-500)' : 'var(--ivory-200)'} strokeDasharray={t === ref ? '4 4' : undefined} /><text x={padL - 8} y={y(t) + 4} textAnchor="end" className="sgt__tick">{tickLbl(t)}</text></g>)}
          {WEEKS.map((wk, i) => <text key={wk} x={x(i)} y={h - 8} textAnchor="middle" className="sgt__tick">{wk}</text>)}
          {lines.map(({ p, data }) => <path key={p.id} d={path(data)} fill="none" stroke={p.id === focus ? 'var(--green-600)' : 'var(--ink-300)'} strokeOpacity={p.id === focus ? 1 : 0.45} strokeWidth={p.id === focus ? 2.25 : 1.25} strokeLinecap="round" style={{ cursor: 'pointer' }} onClick={() => setFocus(p.id === focus ? null : p.id)} />)}
          <path d={path(team)} fill="none" stroke="var(--green-800)" strokeWidth="3" strokeLinecap="round" />
          {!isSg && <g><line x1={x(4)} x2={x(4)} y1={y(team[4]) - 8} y2={padT + 4} stroke="var(--green-700)" strokeWidth="1" /><text x={x(4)} y={padT + 2} textAnchor="middle" className="sgt__evt">Season best · 73.1</text></g>}
          <circle cx={x(WEEKS.length - 1)} cy={y(last(team))} r="4.5" fill="var(--ivory-25)" stroke="var(--green-800)" strokeWidth="2.5" />
          {sel && <circle cx={x(WEEKS.length - 1)} cy={y(last(sel.data))} r="4" fill="var(--ivory-25)" stroke="var(--green-600)" strokeWidth="2" />}
        </svg>
        <div className="sgt__ends">
          <div className="sgt__team"><span>Team</span><b className="fw-num">{isSg ? sgn(last(team)) : last(team).toFixed(1)}</b></div>
          {sorted.map(({ p, data }) => (
            <button key={p.id} className={'sgt__end' + (p.id === focus ? ' is-sel' : '')} onClick={() => setFocus(p.id === focus ? null : p.id)}>
              <Avatar name={p.name} size={22} /><span>{p.name.split(' ')[0]}</span><b className={'fw-num ' + (good(last(data)) ? 'is-gain' : 'is-loss')}>{endLbl(last(data))}</b>
            </button>
          ))}
        </div>
      </div>
      <p className="sgt__note">{note}</p>
    </section>
  );
}

// Heat grid: players × legs, cell = SG per round. Calm diverging fill.
function LegGrid({ focus, setFocus, openPlayer, leg }) {
  const rows = act.filter((p) => p.sg != null).map((p) => ({ p, legs: playerLegs(p) })).sort((a, b) => b.legs[LEGS.indexOf(leg)] - a.legs[LEGS.indexOf(leg)]);
  const fill = (v) => { const a = Math.min(1, Math.abs(v) / 1.2); return v >= 0 ? `rgb(21 90 57 / ${0.06 + a * 0.3})` : `rgb(154 101 18 / ${0.06 + a * 0.3})`; };
  return (
    <section className="lg">
      <div className="sgt__head"><div><h2>Where each player gains and loses</h2><span>Strokes gained per round by leg · last 10 rounds · sorted by {leg.toLowerCase()}</span></div></div>
      <div className="lg__tbl">
        <div className="lg__r lg__r--h"><span>Player</span>{LEGS.map((l) => <span key={l} className={'c' + (l === leg ? ' is-col' : '')}>{l}</span>)}<span className="r">Total</span><span className="r">Trend</span></div>
        {rows.map(({ p, legs }) => { const tr = playerSgTrend(p); const ch = tr[6] - tr[0]; return (
          <div key={p.id} className={'lg__r' + (p.id === focus ? ' is-sel' : '')} onMouseEnter={() => setFocus(p.id)} onClick={() => openPlayer(p.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openPlayer(p.id)}>
            <span className="st-who"><Avatar name={p.name} size={30} /><span><b>{p.name}</b><span className="st-who__m">{p.rounds} rounds</span></span></span>
            {legs.map((v, i) => <span key={i} className={'lg__cell fw-num' + (LEGS[i] === leg ? ' is-col' : '')} style={{ background: fill(v) }}><span className={v >= 0 ? 'is-gain' : 'is-loss'}>{sgn(v)}</span></span>)}
            <span className={'r fw-num lg__tot ' + (p.sg >= 0 ? 'is-gain' : 'is-loss')}>{sgn(p.sg)}</span>
            <span className={'r fw-num lg__ch ' + (ch >= 0 ? 'is-gain' : 'is-loss')}><Icon name={ch >= 0 ? 'trending-up' : 'trending-down'} size={14} />{sgn(ch)}</span>
          </div>); })}
      </div>
    </section>
  );
}

function SgFocus({ openPlayer }) {
  const [leg, setLeg] = React.useState('Approach');
  const [focus, setFocus] = React.useState(null);
  return (
    <>
      <SgTotalTrend focus={focus} setFocus={setFocus} />
      <section className="sgm-row">
        {LEGS.map((l) => <LegTrend key={l} leg={l} data={TEAM[l]} selected={leg === l} onSelect={() => setLeg(l)} />)}
      </section>
      <LegGrid focus={focus} setFocus={setFocus} openPlayer={openPlayer} leg={leg} />
    </>
  );
}
window.SgFocus = SgFocus;
})();
