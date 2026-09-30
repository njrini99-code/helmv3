(() => {
const { Icon, Button } = window.FairwayClubhouseEdition_9c4f4d;
const P = window.PH;
const sum = (a, k) => a.reduce((s, h) => s + h[k], 0);
const BRIEF = 'Your last three rounds average 70.0. Off the tee is gaining you 0.8 strokes a round, the best on the team.';
const QUIET = [['Mon', 27, 0], ['Tue', 28, 0], ['Wed', 29, 0], ['Thu', 30, 0], ['Fri', 31, 0], ['Sat', 1, 0], ['Sun', 2, 0]];
const DAYS = {
  practice: { dow: 'Tuesday', date: '14 October', day: 14, hello: 'Good afternoon, Theo.', brief: BRIEF, week: P.WEEK, wk: 'Week 7 of 12', note: ['Thu', 'Qualifier · Pinehurst No. 2'], agenda: P.AGENDA, when: 'Thu 16 Oct', secs: ((16 - 14) * 24 + 8.7 - 14.67) * 3600 },
  competition: { dow: 'Thursday', date: '16 October', day: 16, hello: 'Good morning, Theo.', brief: 'Qualifier day. Nine of your last ten rounds are 71 or better.', week: P.WEEK, wk: 'Week 7 of 12', note: ['Today', 'Qualifier · Pinehurst No. 2'], agenda: [['6:15', 'Team bus', 'Leaves from campus'], ['8:42', 'Your tee time', 'Pinehurst No. 2 · Hole 1']], when: 'Bus in 7 min', soon: true, secs: (8.7 - 6.08) * 3600 },
  none: { dow: 'Monday', date: '27 October', day: 27, hello: 'Good morning, Theo.', brief: BRIEF, week: QUIET, wk: 'Week 9 of 12', agenda: [], none: true },
};

function Next({ s }) {
  if (s.none) return (
    <div className="mh-next mh-next--empty">
      <div className="mh-next__k"><span className="mh-next__type"><Icon name="calendar" size={13} />Up next</span></div>
      <div className="mh-none"><span className="mh-none__ic"><Icon name="calendar" size={22} /></span><span><h2>No events scheduled</h2><p>Your coach’s practices and events will show here with a countdown.</p></span></div>
    </div>
  );
  return (
    <div className="mh-next mp-next">
      <div className="mh-next__k"><span className="mh-next__type"><Icon name="target" size={13} />Up next · Qualifier</span><span className={'mh-next__when' + (s.soon ? ' is-soon' : '')}>{s.when}</span></div>
      <h2>Pinehurst No. 2</h2>
      <p>Your tee time 8:42 · Bus leaves 6:15</p>
      <P.Countdown secs={s.secs} />
    </div>
  );
}

function Week({ s }) {
  return (
    <section className="mh-sec" data-at="week">
      <div className="mh-sec__h"><h3>This week</h3><span className="mp-meta">{s.wk}</span></div>
      <div className="mh-week">{s.week.map(([d, n, load, k]) => { const major = k === 'event'; return (
        <div key={d} className={'mh-week__d' + (n === s.day ? ' is-today' : '') + (major ? ' is-major' : '')}><em>{d.slice(0, 1)}</em><b>{n}</b><span>{major ? <Icon name="flag" size={11} /> : Array.from({ length: load }, (_, i) => <i key={i}></i>)}</span></div>); })}</div>
      <p className="mh-week__n">{s.note ? <><b>{s.note[0]}</b> {s.note[1]}</> : 'Nothing on the calendar this week.'}</p>
      {s.agenda.length > 0 && <><span className="mp-lab">Today</span>
        <div className="mh-tl mp-tl">{s.agenda.map(([t, a, b], i) => (
          <div key={t} className={'mh-tl__r' + (i === 0 ? ' is-now' : '')}><span className="mh-tl__t">{t}</span><span className="mh-tl__rail"><i></i></span><span className="mh-tl__b"><b>{a}</b><span>{b}</span></span>{i === 0 && <span className="mh-now">Next</span>}</div>))}</div></>}
    </section>
  );
}

function Latest() {
  const R = P.ROUNDS;
  const [i, setI] = React.useState(0);
  const r = R[i], score = sum(r.holes, 'score'), rel = score - sum(r.holes, 'par');
  const [course, ...rest] = r.meta.split(' · ');
  const go = (d) => setI((i + d + R.length) % R.length);
  return (
    <section className="mh-sec" data-at="round">
      <div className="mh-sec__h mp-sec__h"><h3>My latest round</h3>
        <div className="mp-pg"><button aria-label="Previous round" onClick={() => go(-1)}><Icon name="chevron-left" size={18} /></button><span className="fw-num">{i + 1} of {R.length}</span><button aria-label="Next round" onClick={() => go(1)}><Icon name="chevron-right" size={18} /></button></div></div>
      <div className="mp-card">
        <div className="mp-rd"><span className="pv-flag"><Icon name="flag" size={16} /></span><span className="mp-rd__b"><b>{course}</b><span>{rest.join(' · ')}</span></span><span className={'mh-score' + (rel < 0 ? ' is-under' : '')}><b>{score}</b><em>{P.toPar(rel)}</em></span></div>
        <div className="mp-nines"><MNine holes={r.holes.slice(0, 9)} start={1} label="Out" /><MNine holes={r.holes.slice(9)} start={10} label="In" /></div>
        <div className="mh-form__figs">{r.stats.map((x) => <div key={x.label}><em>{x.label}</em><b>{x.value}</b></div>)}</div>
        <Button fullWidth size="lg" rightIcon="arrow-right">Open recap</Button>
      </div>
    </section>
  );
}

function Scoring() {
  const [n, setN] = React.useState(10);
  const data = P.SCORES.slice(-n), lab = P.LABELS.slice(-n);
  const W = 340, H = 196, L = 24, R = 34, T = 24, B = 26;
  const lo = Math.min(...data, 72) - 1, hi = Math.max(...data, 72) + 1;
  const x = (i) => L + (i * (W - L - R)) / (data.length - 1), y = (v) => T + ((v - lo) / (hi - lo)) * (H - T - B);
  const mean = data.reduce((a, v) => a + v, 0) / data.length;
  const pts = data.map((v, i) => [x(i), y(v)]);
  let d = 'M' + pts[0].join(',');
  for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2; d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`; }
  const step = n <= 5 ? 1 : n <= 10 ? 3 : 5, last = data.length - 1;
  const ticks = Array.from({ length: Math.floor(hi) - Math.ceil(lo) + 1 }, (_, i) => Math.ceil(lo) + i);
  const figs = [['Scoring avg', mean.toFixed(1), '−0.8 vs previous ' + n, 'gain'], ['Strokes gained', '+1.8', 'per round vs D1', 'gain'], ['Handicap', '+0.8', 'down from +0.2 in Aug', ''], ['Under par', data.filter((v) => v < 72).length + ' of ' + n, 'rounds in this window', '']];
  return (
    <section className="mh-sec" data-at="stats">
      <div className="mh-sec__h"><h3>Scoring</h3><span className="mp-meta">Gross · par 72 · countable rounds</span></div>
      <div className="mp-card mp-paper">
        <div className="mp-seg" role="group" aria-label="Rounds shown">{[5, 10, 20].map((k) => <button key={k} aria-pressed={n === k} onClick={() => setN(k)}>{'Last ' + k}</button>)}</div>
        <svg viewBox={`0 0 ${W} ${H}`} className="mp-chart" role="img" aria-label={'Scoring over the last ' + n + ' rounds'}>
          <defs>
            <linearGradient id="mpf" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#1E6B45" stopOpacity=".18" /><stop offset="1" stopColor="#1E6B45" stopOpacity="0" /></linearGradient>
            <pattern id="mpg" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0,6 L6,0" stroke="rgb(30 107 69/.08)" strokeWidth="1" /></pattern>
          </defs>
          <rect x={L} y={y(72)} width={W - L - R} height={H - B - y(72)} fill="url(#mpg)" />
          {ticks.map((v) => <text key={v} x={L - 8} y={y(v) + 4} textAnchor="end" className="pv-ax">{v}</text>)}
          <line x1={L} x2={W - R} y1={y(72)} y2={y(72)} stroke="#1C1B18" strokeOpacity=".35" /><text x={W - R + 6} y={y(72) + 4} className="pv-ax">Par</text>
          <line x1={L} x2={W - R} y1={y(mean)} y2={y(mean)} stroke="#1E6B45" strokeOpacity=".55" strokeDasharray="1 5" strokeLinecap="round" strokeWidth="1.6" /><text x={W - R + 6} y={y(mean) + 4} className="pv-ann">Avg</text>
          <path d={d + ` L${x(last)},${H - B} L${x(0)},${H - B} Z`} fill="url(#mpf)" />
          <path d={d} fill="none" stroke="#FDFCF8" strokeWidth="6" strokeLinecap="round" />
          <path d={d} fill="none" stroke="#1E6B45" strokeWidth="2.4" strokeLinecap="round" />
          {pts.map(([px, py], i) => <g key={i}><circle cx={px} cy={py} r={i === last ? 5 : n > 10 ? 2.6 : 3.4} fill={data[i] < 72 ? '#1E6B45' : '#FDFCF8'} stroke="#1E6B45" strokeWidth="1.8" />{n <= 10 && <text x={px} y={py - 10} textAnchor="middle" className={'pv-val' + (data[i] < 72 ? ' is-under' : '')}>{data[i]}</text>}</g>)}
          {lab.map((l, i) => (last - i) % step === 0 && <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} className="pv-ax">{l}</text>)}
        </svg>
        <dl className="mp-figs">{figs.map(([k, v, m, t]) => <div key={k}><dt>{k}</dt><dd className={'mp-figs__v fw-num' + (t ? ' is-' + t : '')}>{v}</dd><dd className="mp-figs__m">{m}</dd></div>)}</dl>
        <p className="pv-ds__note"><Icon name="pen-line" size={14} />Nine of your last ten are 71 or better. Every leg is gaining on D1; putting is the closest to even.</p>
      </div>
    </section>
  );
}

function Legs() {
  return (
    <section className="mh-sec" data-at="legs">
      <div className="mh-sec__h"><h3>By part of the game</h3><span className="mp-meta">Strokes gained vs D1</span></div>
      <div className="mp-legs">{P.LEGS.map((g) => {
        const lo = g.min ?? 40, pos = (v) => ((g.inv ? g.max - v : v - lo) / (g.inv ? g.max - g.min : g.max - lo)) * 100;
        const f = (v) => (g.inv ? v.toFixed(1) : v + '%');
        return (
          <article key={g.k} className="mp-leg">
            <div className="mp-leg__h"><span className="pv-leg__ic"><Icon name={g.icon} size={15} /></span><b>{g.k}</b><span className={'pv-leg__sg ' + (g.sg >= 0 ? 'is-gain' : 'is-loss')}>{P.sgn(g.sg)}</span></div>
            <div className="mp-leg__v"><span className="fw-num">{g.v}</span><em>{g.l}</em><P.Spark data={g.tr} lowGood={!!g.inv} w={84} h={28} /></div>
            <div className="pv-bench"><span className="pv-bench__t"><i style={{ width: pos(g.me) + '%' }}></i><em style={{ left: pos(g.d1) + '%' }}></em></span><span className="pv-bench__k"><span>You {f(g.me)}</span><span>D1 {f(g.d1)}</span></span></div>
            <p className="pv-leg__n">{g.note}</p>
          </article>);
      })}</div>
    </section>
  );
}

function PlayerHomeM({ initial = {} }) {
  const s = DAYS[initial.state || 'practice'];
  const ref = React.useRef(null);
  const [scrolled, setScrolled] = React.useState(!!initial.at);
  const [shift, setShift] = React.useState(0);
  // Scrolled boards start partway down the page: the hero is pulled up so the section sits under the status bar.
  React.useLayoutEffect(() => {
    if (!initial.at) return;
    const run = () => {
      const sc = ref.current, el = sc && sc.querySelector('[data-at="' + initial.at + '"]');
      if (!el) return;
      const k = sc.getBoundingClientRect().height / sc.offsetHeight || 1;
      const diff = (el.getBoundingClientRect().top - sc.getBoundingClientRect().top) / k + sc.scrollTop;
      setShift((p) => Math.max(0, Math.round(p + diff - 62)));
    };
    run();
    const t = setTimeout(run, 800);
    if (document.fonts) document.fonts.ready.then(run);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="qm fairway mh mp">
      <span className={'mp-sb' + (scrolled ? ' is-on' : '')} aria-hidden="true"></span>
      <div className="qm-scroll mh-scroll" ref={ref} onScroll={initial.at ? undefined : (e) => setScrolled(e.currentTarget.scrollTop > 8)}>
        <header className="mh-hero" style={shift ? { marginTop: -shift } : undefined}>
          <div className="mh-hero__bar"><span className="mh-team"><img src="assets/helm-logo-white.png" alt="" /><span>Varsity</span></span><button className="mh-bell" aria-label="Notifications"><Icon name="bell" size={19} /><i></i></button></div>
          <span className="mh-hero__date">{s.dow}, {s.date}</span>
          <h1>{s.hello}</h1>
          <p className="mh-hero__brief"><Icon name="sparkles" size={14} />{s.brief}</p>
          <Next s={s} />
          <div className="mp-acts"><button className="mp-act"><Icon name="message-square" size={16} />Message coach</button><button className="mp-act is-p"><Icon name="plus" size={16} />Post a round</button></div>
        </header>
        <div className="mh-body"><Week s={s} /><Latest /><Scoring /><Legs /></div>
      </div>
      <MTabs on="home" badge={{ hub: 3 }} />
      <MSafari />
    </div>
  );
}
Object.assign(window, { PlayerHomeM });
})();
