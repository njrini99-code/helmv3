(() => {
const { Icon, Button, IconButton, Avatar, Badge, ScoreMark } = window.FairwayClubhouseEdition_9c4f4d;
const D = window.HOME_DATA;
const PAR = [4,4,3,4,4,3,4,5,4,4,4,3,5,4,4,3,4,5];
const card = (seed, toPar) => { let s = seed; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280; const d = PAR.map(() => 0); let left = toPar, g = 0; while (left !== 0 && g++ < 400) { const i = Math.floor(rnd() * 18), st = left > 0 ? 1 : -1; if (Math.abs(d[i] + st) <= 1) { d[i] += st; left -= st; } } for (let k = 0; k < 4; k++) { const a = Math.floor(rnd() * 18), b = Math.floor(rnd() * 18); if (a !== b && d[a] < 1 && d[b] > -1) { d[a]++; d[b]--; } } return PAR.map((p, i) => ({ n: i + 1, par: p, score: p + d[i] })); };
const toPar = (v) => (v === 0 ? 'E' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(Number.isInteger(v) ? 0 : 1));
const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
const ROUNDS = [
  { meta: 'Oakmont CC · Sun 12 Oct · Member tees', holes: D.rounds[0].holes, stats: D.rounds[0].stats },
  { meta: 'Pine Needles · Sat 11 Oct · Back tees', holes: card(11, -3), stats: [{ label: 'GIR', value: '13/18' }, { label: 'Putts', value: '27' }, { label: 'SG', value: '+3.1' }] },
  { meta: 'Finley GC · Sat 4 Oct · Blue', holes: card(7, -1), stats: [{ label: 'GIR', value: '12/18' }, { label: 'Putts', value: '29' }, { label: 'SG', value: '+1.2' }] },
];
const WEEK = [['Mon', 13, 2], ['Tue', 14, 2, 'today'], ['Wed', 15, 3], ['Thu', 16, 0, 'event'], ['Fri', 17, 1], ['Sat', 18, 0], ['Sun', 19, 0]];
const AGENDA = [['3:30', 'Short-game block', 'Practice green'], ['5:30', 'Team dinner', 'Carolina Inn']];
const SCORES = [73, 72, 72, 71, 73, 72, 71, 72, 71, 73, 71, 70, 70, 71, 70, 69, 70, 71, 69, 70];
const LABELS = ['Aug 2', 'Aug 5', 'Aug 9', 'Aug 12', 'Aug 16', 'Aug 19', 'Aug 23', 'Aug 26', 'Aug 30', 'Sep 6', 'Sep 9', 'Sep 13', 'Sep 20', 'Sep 23', 'Sep 29', 'Oct 4', 'Oct 8', 'Oct 11', 'Oct 11', 'Oct 12'];
const LEGS = [
  { k: 'Off the tee', icon: 'move-up-right', v: '71%', l: 'Fairways hit', sg: 0.8, d1: 64, me: 71, max: 85, tr: [62, 64, 66, 65, 68, 70, 71], note: 'Driver carry 286 · 12 of 14 wide misses right' },
  { k: 'Approach', icon: 'crosshair', v: '74%', l: 'Greens in regulation', sg: 0.6, d1: 67, me: 74, max: 85, tr: [64, 66, 65, 70, 72, 71, 74], note: 'Avg proximity 24 ft · best from 100–125' },
  { k: 'Short game', icon: 'flag-triangle-right', v: '62%', l: 'Scrambling', sg: 0.3, d1: 58, me: 62, max: 80, tr: [54, 58, 55, 60, 57, 61, 62], note: 'Sand saves 48% · up and down 7 of 11' },
  { k: 'Putting', icon: 'circle-dot', v: '29.0', l: 'Putts per round', sg: 0.1, d1: 29.1, me: 29.0, max: 32, min: 27, inv: true, tr: [29.4, 29.8, 29.1, 29.6, 28.9, 29.3, 29.0], note: 'Makes 74% from 3–6 ft · 1 three-putt a round' },
];

function Spark({ data, lowGood = true, w = 148, h = 34 }) {
  const lo = Math.min(...data) - 0.4, hi = Math.max(...data) + 0.4, p = 4;
  const x = (i) => p + (i * (w - p * 2)) / (data.length - 1), y = (v) => p + ((lowGood ? v - lo : hi - v) / (hi - lo)) * (h - p * 2);
  const ch = data[data.length - 1] - data[0], good = lowGood ? ch < -0.2 : ch > 0.2, bad = lowGood ? ch > 0.2 : ch < -0.2;
  const c = good ? 'var(--chart-gain)' : bad ? 'var(--chart-loss)' : 'var(--ink-400)';
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="h3-form" aria-hidden="true"><line x1={p} x2={w - p} y1={y(mean)} y2={y(mean)} stroke="var(--ivory-300)" strokeDasharray="2 3" /><path d={data.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ')} fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r="2.6" fill={c} /></svg>;
}

function Countdown({ secs }) {
  const [t0] = React.useState(() => Date.now());
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const left = Math.max(0, secs - (now - t0) / 1000);
  const d = Math.floor(left / 86400), h = Math.floor((left % 86400) / 3600), m = Math.floor((left % 3600) / 60), s = Math.floor(left % 60);
  return <div className="pv-cd" role="timer">{[[d, 'd'], [h, 'h'], [m, 'm'], [s, 's']].map(([v, l]) => <span key={l}><b className="fw-num">{String(v).padStart(2, '0')}</b><em>{l}</em></span>)}</div>;
}

function Week() {
  const days = WEEK, agenda = AGENDA;
  return (
    <div className="h3-pane">
      <div className="h3-pane__head"><h3>This week</h3><span>Week 7 of 12</span></div>
      <div className="h3-days">{days.map(([d, n, load, k]) => (
        <div key={n} className={'h3-day' + (k ? ' h3-day--' + k : '')}><span className="h3-day__d">{d}</span><span className="h3-day__n fw-num">{n}</span><span className="h3-day__m">{k === 'event' ? <Icon name="flag" size={11} /> : Array.from({ length: load }).map((_, i) => <i key={i}></i>)}</span></div>))}</div>
      <div className="pv-next">
        <div className="pv-next__k"><span>Up next · Qualifier</span><span>Thu 16 Oct</span></div>
        <div className="pv-next__t">Pinehurst No. 2</div>
        <div className="pv-next__m">Your tee time 8:42 · Bus leaves 6:15</div>
        <Countdown secs={((16 - 14) * 24 + 8.7 - 14.67) * 3600} />
      </div>
      <div className="h3-agenda">
        <div className="h3-agenda__label">Today</div>
        {agenda.map(([t, a, b], i) => (
          <div key={t} className={'h3-agenda__row' + (i === 0 ? ' is-next' : '')}><span className="fw-num h3-agenda__t">{t}</span><div style={{ minWidth: 0 }}><div className="h3-agenda__a">{a}</div><div className="h3-agenda__b">{b}</div></div>{i === 0 && <Badge tone="accent">Next</Badge>}</div>))}
      </div>
    </div>
  );
}

function Nine({ label, holes }) {
  const par = holes.reduce((a, h) => a + h.par, 0), tot = holes.reduce((a, h) => a + h.score, 0);
  return (
    <div className="h3-nine">
      <div className="h3-nine__row h3-nine__holes"><span>{label}</span>{holes.map((h) => <span key={h.n}>{h.n}</span>)}<span>Tot</span></div>
      <div className="h3-nine__row h3-nine__par"><span>Par</span>{holes.map((h) => <span key={h.n}>{h.par}</span>)}<span>{par}</span></div>
      <div className="h3-nine__row"><span></span>{holes.map((h) => <span key={h.n}><ScoreMark score={h.score} par={h.par} size="sm" /></span>)}<span className="h3-nine__tot">{tot}</span></div>
    </div>
  );
}

function LatestRound() {
  const [i, setI] = React.useState(0);
  const r = ROUNDS[i];
  const score = r.holes.reduce((a, h) => a + h.score, 0), par = r.holes.reduce((a, h) => a + h.par, 0), rel = score - par;
  const [course, ...rest] = r.meta.split(' · ');
  return (
    <div className="h3-pane">
      <div className="h3-pane__head"><h3>My latest round</h3>
        <div className="h3-pager"><span className="fw-num">{i + 1} of {ROUNDS.length}</span>
          <IconButton icon="chevron-left" label="Previous round" size="sm" onClick={() => setI((i + ROUNDS.length - 1) % ROUNDS.length)} />
          <IconButton icon="chevron-right" label="Next round" size="sm" onClick={() => setI((i + 1) % ROUNDS.length)} /></div></div>
      <div className="h3-round__top">
        <div className="h3-round__who"><span className="pv-flag"><Icon name="flag" size={16} /></span><div><div className="h3-round__name">{course}</div><div className="h3-round__meta">{rest.join(' · ')}</div></div></div>
        <div className="h3-round__score"><span className="fw-num">{score}</span><span className={'h3-topar fw-num' + (rel < 0 ? ' is-under' : '')}>{toPar(rel)}</span></div>
      </div>
      <div className="h3-card"><Nine label="Out" holes={r.holes.slice(0, 9)} /><Nine label="In" holes={r.holes.slice(9)} /></div>
      <div className="h3-round__foot">
        <div className="h3-round__stats">{r.stats.map((s) => <span key={s.label}><em>{s.label}</em>{s.value}</span>)}</div>
        <Button size="sm" variant="ghost" rightIcon="arrow-right">Open recap</Button>
      </div>
    </div>
  );
}

function MyStats() {
  const rows = [
    ['Scoring average', [72, 71, 71, 70, 70, 71, 70], true, 70.9, 72.8, 70.9, (v) => v.toFixed(1)],
    ['Strokes gained / rd', [1.1, 1.3, 1.2, 1.6, 1.9, 1.7, 1.8], false, 1.8, 0.0, 0.0, sgn],
    ['Fairways hit', [62, 64, 66, 65, 68, 70, 71], false, 71, 62, 64, (v) => v + '%'],
    ['Greens in regulation', [64, 66, 65, 70, 72, 71, 74], false, 74, 61, 67, (v) => v + '%'],
    ['Putts per round', [29.4, 29.8, 29.1, 29.6, 28.9, 29.3, 29.0], true, 29.0, 30.4, 29.1, (v) => v.toFixed(1)],
    ['Scrambling', [54, 58, 55, 60, 57, 61, 62], false, 62, 52, 58, (v) => v + '%'],
  ];
  return (
    <div className="h3-lb pv-lb" role="table">
      <div className="h3-lb__row h3-lb__head" role="row"><span></span><span>Stat</span><span>Last 7 rounds</span><span className="r">Me</span><span className="r">Team</span><span className="r">D1</span></div>
      {rows.map(([l, tr, lowGood, me, team, d1, f], i) => { const better = lowGood ? me <= d1 : me >= d1; return (
        <div key={l} className="h3-lb__row" role="row">
          <span className="h3-lb__pos fw-num">{i + 1}</span>
          <span className="h3-lb__who"><span><span className="h3-lb__name">{l}</span><span className="h3-lb__meta">{better ? 'At or better than D1' : 'Below D1 benchmark'}</span></span></span>
          <span><Spark data={tr} lowGood={lowGood} /></span>
          <span className={'r fw-num h3-lb__num pv-me ' + (better ? 'is-gain' : 'is-loss')}>{f(me)}</span>
          <span className="r fw-num h3-lb__num">{f(team)}</span>
          <span className="r fw-num h3-lb__num pv-d1">{f(d1)}</span>
        </div>); })}
    </div>
  );
}

function Pin({ x, y, label }) {
  return <g transform={`translate(${x},${y})`} className="pv-pin"><line y1="-6" y2="-34" stroke="#1C1B18" strokeWidth="1.2" /><path d="M0,-34 L16,-29 L0,-24 Z" fill="#B3261E" /><text x="20" y="-26" className="pv-ann">{label}</text></g>;
}

function DetailedStats() {
  const [n, setN] = React.useState(10);
  const all = SCORES, labels = LABELS;
  const data = all.slice(-n), lab = labels.slice(-n);
  const W = 760, H = 250, L = 34, R = 20, T = 44, B = 30;
  const lo = Math.min(...data, 72) - 1, hi = Math.max(...data, 72) + 1;
  const x = (i) => L + (i * (W - L - R)) / (data.length - 1), y = (v) => T + ((v - lo) / (hi - lo)) * (H - T - B);
  const mean = data.reduce((s, v) => s + v, 0) / data.length;
  const pts = data.map((v, i) => [x(i), y(v)]);
  let d = 'M' + pts[0].join(',');
  for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2; d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`; }
  const best = Math.min(...data), bi = data.indexOf(best);
  const legs = LEGS;
  return (
    <section className="pv-ds">
      <div className="pv-ds__top">
        <div className="pv-ds__chart">
          <div className="pv-ds__h"><div><h3>Scoring</h3><span>Gross, par 72 · countable rounds</span></div>
            <div className="pv-seg">{[5, 10, 20].map((k) => <button key={k} aria-pressed={n === k} onClick={() => setN(k)}>Last {k}</button>)}</div></div>
          <svg viewBox={`0 0 ${W} ${H}`} className="pv-chart" role="img" aria-label={'Scoring over the last ' + n + ' rounds'}>
            <defs>
              <linearGradient id="pvf" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#1E6B45" stopOpacity=".18" /><stop offset="1" stopColor="#1E6B45" stopOpacity="0" /></linearGradient>
              <pattern id="pvg" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0,6 L6,0" stroke="rgb(30 107 69/.08)" strokeWidth="1" /></pattern>
            </defs>
            <rect x={L} y={y(72)} width={W - L - R} height={H - B - y(72)} fill="url(#pvg)" />
            {Array.from({ length: Math.floor(hi) - Math.ceil(lo) + 1 }, (_, i) => Math.ceil(lo) + i).map((v) => <text key={v} x={L - 10} y={y(v) + 4} textAnchor="end" className="pv-ax">{v}</text>)}
            <line x1={L} x2={W - R} y1={y(72)} y2={y(72)} stroke="#1C1B18" strokeOpacity=".35" /><text x={W - R} y={y(72) + 14} textAnchor="end" className="pv-ax">Par 72</text>
            <line x1={L} x2={W - R} y1={y(mean)} y2={y(mean)} stroke="#1E6B45" strokeOpacity=".55" strokeDasharray="1 5" strokeLinecap="round" strokeWidth="1.6" />
            <text x={L + 6} y={y(mean) + 16} className="pv-ann">your mean {mean.toFixed(1)}</text>
            <path d={d + ` L${x(data.length - 1)},${H - B} L${x(0)},${H - B} Z`} fill="url(#pvf)" />
            <path d={d} fill="none" stroke="#FDFCF8" strokeWidth="6" strokeLinecap="round" />
            <path d={d} fill="none" stroke="#1E6B45" strokeWidth="2.4" strokeLinecap="round" />
            {pts.map(([px, py], i) => <g key={i}><circle cx={px} cy={py} r={i === data.length - 1 ? 5.5 : 3.4} fill={data[i] < 72 ? '#1E6B45' : '#FDFCF8'} stroke="#1E6B45" strokeWidth="1.8" />{(n <= 10) && <text x={px} y={py - 11} textAnchor="middle" className={'pv-val' + (data[i] < 72 ? ' is-under' : '')}>{data[i]}</text>}</g>)}
            <Pin x={x(bi)} y={y(best) - (n <= 10 ? 14 : 4)} label={'season low · ' + best} />
            {lab.map((l, i) => (n <= 10 || i % 2 === 0) && <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="pv-ax">{l}</text>)}
          </svg>
        </div>
        <dl className="pv-ds__figs">{[['Scoring avg', mean.toFixed(1), '−0.8 vs previous ' + n, 'gain'], ['Strokes gained', '+1.8', 'per round vs D1', 'gain'], ['Handicap', '+0.8', 'down from +0.2 in Aug', ''], ['Under par', data.filter((v) => v < 72).length + ' of ' + n, 'rounds in this window', '']].map(([k, v, m, t]) => <div key={k}><dt>{k}</dt><dd className={'fw-num is-' + t}>{v}</dd><span>{m}</span></div>)}</dl>
      </div>
      <p className="pv-ds__note"><Icon name="pen-line" size={14} />Nine of your last ten are 71 or better. Every leg is gaining on D1; putting is the closest to even.</p>
      <div className="pv-legs">{legs.map((g) => {
        const lo2 = g.min ?? 40, pos = (v) => ((g.inv ? g.max - v : v - lo2) / (g.inv ? g.max - g.min : g.max - lo2)) * 100;
        return (
          <article key={g.k} className="pv-leg">
            <div className="pv-leg__h"><span className="pv-leg__ic"><Icon name={g.icon} size={15} /></span><b>{g.k}</b><span className={'pv-leg__sg ' + (g.sg >= 0 ? 'is-gain' : 'is-loss')}>{sgn(g.sg)}</span></div>
            <div className="pv-leg__v"><span className="fw-num">{g.v}</span><Spark data={g.tr} lowGood={!!g.inv} w={92} h={30} /></div>
            <span className="pv-leg__l">{g.l}</span>
            <div className="pv-bench"><span className="pv-bench__t"><i style={{ width: pos(g.me) + '%' }}></i><em style={{ left: pos(g.d1) + '%' }}></em></span><span className="pv-bench__k"><span>You {g.inv ? g.me.toFixed(1) : g.me + '%'}</span><span>D1 {g.inv ? g.d1.toFixed(1) : g.d1 + '%'}</span></span></div>
            <p className="pv-leg__n">{g.note}</p>
          </article>);
      })}</div>
    </section>
  );
}

function Sec({ title, meta, action }) {
  return <div className="h3-sec"><div><h2>{title}</h2>{meta && <span>{meta}</span>}</div>{action}</div>;
}

function PlayerHome() {
  return (
    <main className="h3-main">
      <header className="h3-head">
        <div className="h3-head__copy">
          <span className="h3-head__date">Tuesday, 14 October</span>
          <h1>Good afternoon, Theo.</h1>
          <p>Your last three rounds average 70.0. Off the tee is gaining you 0.8 strokes a round, the best on the team.</p>
          <div className="h3-head__actions"><Button leftIcon="message-square">Message coach</Button><Button variant="primary" leftIcon="plus" kbd="N">Post a round</Button></div>
        </div>
      </header>
      <section className="h3-sheet"><Week /><LatestRound /></section>
      <DetailedStats />
    </main>
  );
}
window.PlayerHome = PlayerHome;
window.PH = { ROUNDS, WEEK, AGENDA, SCORES, LABELS, LEGS, toPar, sgn, Spark, Countdown };
})();
