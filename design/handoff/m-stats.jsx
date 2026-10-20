(() => {
const { Icon, Avatar, Badge, Segmented } = window.FairwayClubhouseEdition_9c4f4d;
const R = window.ROSTER;
const act = R.players.filter((p) => p.status === 'active');
const TEAM = [74.8, 74.6, 74.2, 74.4, 73.9, 73.8, 73.1, 73.5, 73.6, 73.4];
const LEGS = [['Off the tee', 0.4], ['Approach', -0.7], ['Around green', 0.1], ['Putting', -0.3]];
const PUTT = [['0–3 ft', 118, 122, 0.96], ['3–6 ft', 64, 92, 0.72], ['6–10 ft', 30, 71, 0.44], ['10–20 ft', 14, 80, 0.2], ['20+ ft', 4, 58, 0.07]];
const hcp = (v) => (v < 0 ? '+' + Math.abs(v).toFixed(1) : v.toFixed(1));

function Trend({ data, bench }) {
  const W = 340, H = 120, p = 14, lo = Math.min(...data, bench) - 0.4, hi = Math.max(...data, bench) + 0.4;
  const x = (i) => p + (i * (W - p * 2)) / (data.length - 1), y = (v) => p + ((v - lo) / (hi - lo)) * (H - p * 2 - 12);
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="m-chart" role="img" aria-label="Team scoring average, last 10 rounds">
      <line x1={p} x2={W - p} y1={y(mean)} y2={y(mean)} stroke="var(--ink-300)" strokeDasharray="3 4" />
      <text x={W - p} y={y(mean) - 5} textAnchor="end" className="m-chart__t">Mean {mean.toFixed(1)}</text>
      <path d={data.map((v, i) => (i ? 'L' : 'M') + x(i) + ',' + y(v)).join(' ')} fill="none" stroke="var(--chart-gain)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === data.length - 1 ? 4 : 2.4} fill={i === data.length - 1 ? 'var(--chart-gain)' : 'var(--bg-surface)'} stroke="var(--chart-gain)" strokeWidth="1.5" />)}
      <text x={p} y={H - 2} className="m-chart__t">Aug 30</text><text x={W - p} y={H - 2} textAnchor="end" className="m-chart__t">Oct 12</text>
    </svg>
  );
}
function Legs({ legs, vs }) {
  const max = 1.4;
  return <div className="m-legs">{legs.map(([l, v]) => <div key={l} className="m-leg"><span>{l}</span><span className="m-leg__bar"><i className="m-leg__z"></i><i className={'m-leg__v ' + (v >= 0 ? 'is-gain' : 'is-loss')} style={{ [v >= 0 ? 'left' : 'right']: '50%', width: (Math.min(Math.abs(v), max) / max) * 50 + '%' }}></i></span><b className={v >= 0 ? 'm-pos' : 'm-neg'}>{mSgn(v)}</b></div>)}<p className="m-note">{vs}</p></div>;
}
function Putting({ rows }) {
  return <div className="m-putt">{rows.map(([b, m, a, bm]) => { const r = m / a, low = r < bm - 0.03; return <div key={b} className="m-putt__r"><span>{b}</span><span className="m-putt__bar"><i style={{ width: r * 100 + '%' }} className={low ? 'is-low' : ''}></i><em style={{ left: bm * 100 + '%' }}></em></span><b className={low ? 'm-neg' : ''}>{Math.round(r * 100)}%</b></div>; })}
    <p className="m-note">Three to six feet is the only band below the D1 benchmark.</p></div>;
}

function Team({ open }) {
  const [scope, setScope] = React.useState('10');
  const [sort, setSort] = React.useState('avg');
  const board = [...act].sort((a, b) => sort === 'sg' ? (b.sg ?? -9) - (a.sg ?? -9) : a.avg - b.avg);
  return <>
    <div className="qm-head"><span>Varsity · {act.length} active · countable rounds</span><h1>Team stats</h1></div>
    <Segmented label="Window" value={scope} onChange={setScope} options={[{ value: '10', label: 'Last 10' }, { value: 'season', label: 'Season' }, { value: 'q', label: 'Qualifiers' }]} />
    <div className="m-figs">{[['Scoring avg', '73.4', '−0.9', true], ['GIR', '61%', '+3', true], ['Putts', '30.4', '+0.3', false], ['Scrambling', '52%', '+4', true]].map(([k, v, d, good]) => <div key={k}><em>{k}</em><b>{v}</b><span className={good ? 'm-pos' : 'm-neg'}>{d}</span></div>)}</div>
    <section className="qm-panel"><div className="qm-panel__h"><b>Scoring trend</b><span className="qm-empty">Team avg · 10 rounds</span></div><Trend data={TEAM} bench={72.1} /><p className="m-note m-note--pad">Down 1.4 strokes since August. The last three rounds held under 73.6.</p></section>
    <section className="qm-panel"><div className="qm-panel__h"><b>Strokes gained vs D1</b><span className="qm-empty">Per round</span></div><Legs legs={LEGS} vs="Approach is the only leg losing strokes, about seven-tenths a round." /></section>
    <section className="qm-panel"><div className="qm-panel__h"><b>Players</b><Segmented size="sm" label="Sort" value={sort} onChange={setSort} options={[{ value: 'avg', label: 'Avg' }, { value: 'sg', label: 'SG' }]} /></div>
      {board.map((p) => <button key={p.id} className="m-row m-row--btn" onClick={() => open(p.id)}><Avatar name={p.name} size={36} /><span className="m-row__b"><b>{p.name}</b><span>{p.rounds} rounds · {hcp(p.hcp)} hcp</span></span><span className="m-row__v"><b>{p.avg.toFixed(1)}</b><span className={p.sg == null ? '' : p.sg >= 0 ? 'm-pos' : 'm-neg'}>{p.sg == null ? 'Early read' : mSgn(p.sg) + ' SG'}</span></span><Icon name="chevron-right" size={16} className="m-chev" /></button>)}</section>
    <section className="qm-panel"><div className="qm-panel__h"><b>Team putting</b><span className="qm-empty">Make rate · 423 putts</span></div><Putting rows={PUTT} /></section>
  </>;
}

const SECTIONS = ['Scoring', 'Off the tee', 'Approach', 'Short game', 'Putting'];
function Player({ p }) {
  const [sec, setSec] = React.useState('Approach');
  const legs = p.id === 'jonah' ? [['Off the tee', 0.3], ['Approach', -1.2], ['Around green', -0.1], ['Putting', 0.2]] : LEGS.map(([l, v]) => [l, +(v + (p.sg || 0) * 0.3).toFixed(1)]);
  return <>
    <div className="m-phead"><Avatar name={p.name} size={48} /><span><h1>{p.name}</h1><p>{p.year} · {p.rounds} rounds · {hcp(p.hcp)} hcp</p></span></div>
    <div className="m-figs">{[['Scoring avg', p.avg.toFixed(1)], ['SG / round', mSgn(p.sg)], ['Trend', p.note.replace('Scoring ', '')]].map(([k, v], i) => <div key={k}><em>{k}</em><b className={i === 1 ? (p.sg >= 0 ? 'm-pos' : 'm-neg') : i === 2 && p.attn === 'warning' ? 'm-neg m-sm' : i === 2 ? 'm-sm' : ''}>{v}</b></div>)}</div>
    <div className="qm-switch m-secs">{SECTIONS.map((s) => <button key={s} className="qm-chip" aria-pressed={sec === s} onClick={() => setSec(s)}>{s}</button>)}</div>
    {sec === 'Approach' && <>
      <section className="qm-panel"><div className="qm-panel__h"><b>Proximity by distance</b><span className="qm-empty">Last 90 days · 64 shots</span></div>
        <div className="m-prox">{[['50–75', 18, 16], ['75–100', 21, 19], ['100–125', 26, 23], ['125–150', 33, 28], ['150–175', 38, 35], ['175+', 47, 44]].map(([b, v, t]) => { const bad = v - t > 3; return <div key={b} className="m-prox__r"><span>{b}</span><span className="m-prox__bar"><i className={bad ? 'is-low' : ''} style={{ width: (v / 50) * 100 + '%' }}></i><em style={{ left: (t / 50) * 100 + '%' }}></em></span><b className={bad ? 'm-neg' : ''}>{v} ft</b></div>; })}</div>
        <p className="m-note m-note--pad">From 125–150 he finishes 33 feet away. The team makes it 28, so this band costs him most.</p></section>
      <section className="qm-panel"><div className="qm-panel__h"><b>Greens from each lie</b></div>
        <div className="m-strip m-strip--pad">{[['Fairway', '58%'], ['Rough', '34%'], ['Sand', '18%']].map(([k, v]) => <div key={k}><em>{k}</em><b>{v}</b></div>)}</div></section>
    </>}
    {sec === 'Putting' && <section className="qm-panel"><div className="qm-panel__h"><b>Make rate</b><span className="qm-empty">Last 10 rounds</span></div><Putting rows={[['0–3 ft', 62, 64, 0.96], ['3–6 ft', 31, 48, 0.72], ['6–10 ft', 16, 36, 0.44], ['10–20 ft', 8, 42, 0.2], ['20+ ft', 2, 30, 0.07]]} /></section>}
    {sec !== 'Approach' && sec !== 'Putting' && <section className="qm-panel"><div className="qm-panel__h"><b>Strokes gained by leg</b><span className="qm-empty">vs D1 · per round</span></div><Legs legs={legs} vs={p.id === 'jonah' ? 'Approach is losing 1.2 a round. Everything else is close to even.' : 'No leg is more than half a stroke from D1.'} /></section>}
    <section className="qm-panel"><div className="qm-panel__h"><b>Scoring trend</b><span className="qm-empty">Last {p.trend.length}</span></div><div className="m-trend"><MSpark data={p.trend} w={330} h={70} /></div></section>
  </>;
}

function StatsM({ initial = {} }) {
  const [id, setId] = React.useState(initial.id || null);
  const p = id && R.players.find((x) => x.id === id);
  return (
    <MApp tab="stats" top={p ? <MTop title="Player stats" back="Team" onBack={() => setId(null)} right={<button className="qm-ib" aria-label="Share"><Icon name="share" size={19} /></button>} /> : <MTop title="Stats" />}>
      {p ? <Player p={p} /> : <Team open={setId} />}
    </MApp>
  );
}
Object.assign(window, { StatsM });
})();
