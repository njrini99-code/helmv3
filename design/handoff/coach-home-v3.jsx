(() => {
const { Button, Avatar, ScoreMark, Icon, IconButton, Badge } = window.FairwayClubhouseEdition_9c4f4d;
const D = window.HOME_DATA;
const toPar = (v) => (v === 0 ? 'E' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(Number.isInteger(v) ? 0 : 1));
const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);

function monotonePath(pts) {
  const n = pts.length; if (n < 2) return '';
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  let d = 'M' + pts[0][0] + ',' + pts[0][1];
  for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3; d += ` C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`; }
  return d;
}

function FormLine({ data, w = 148, h = 34 }) {
  const lo = Math.min(...data) - 0.6, hi = Math.max(...data) + 0.6, pad = 4;
  const x = (i) => pad + (i * (w - pad * 2)) / (data.length - 1);
  const y = (v) => pad + ((v - lo) / (hi - lo)) * (h - pad * 2);
  const pts = data.map((v, i) => [x(i), y(v)]);
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const change = data[data.length - 1] - data[0];
  const tone = change < -0.5 ? 'var(--chart-gain)' : change > 0.5 ? 'var(--chart-loss)' : 'var(--ink-400)';
  const line = monotonePath(pts);
  const [ex, ey] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="h3-form" aria-hidden="true">
      <line x1={pad} x2={w - pad} y1={y(mean)} y2={y(mean)} stroke="var(--ivory-300)" strokeWidth="1" strokeDasharray="2 3" />
      <path d={line + ` L${ex},${h} L${pad},${h} Z`} fill={tone} opacity="0.06" />
      <path d={line} fill="none" stroke={tone} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ex} cy={ey} r="3" fill="var(--bg-page)" stroke={tone} strokeWidth="1.5" />
    </svg>
  );
}

function Week() {
  const days = [['Mon', 13, 2], ['Tue', 14, 4, 'today'], ['Wed', 15, 2], ['Thu', 16, 0, 'event'], ['Fri', 17, 1], ['Sat', 18, 0], ['Sun', 19, 0]];
  const agenda = [['3:30', 'Short-game block', 'Practice green · 6 players'], ['4:45', '1:1 with Jonah', 'Range bay 4 · 125–150 yd wedges'], ['5:30', 'Putting ladder', 'Green 2 · Priya, Ava'], ['6:00', 'Parent call', 'Natarajan family']];
  return (
    <div className="h3-pane">
      <div className="h3-pane__head"><h3>This week</h3><span>Week 7 of 12</span></div>
      <div className="h3-days">
        {days.map(([d, n, load, k]) => (
          <div key={n} className={'h3-day' + (k ? ' h3-day--' + k : '')}>
            <span className="h3-day__d">{d}</span><span className="h3-day__n fw-num">{n}</span>
            <span className="h3-day__m">{k === 'event' ? <Icon name="flag" size={11} /> : Array.from({ length: load }).map((_, i) => <i key={i}></i>)}</span>
          </div>
        ))}
      </div>
      <div className="h3-agenda">
        <div className="h3-agenda__label">Today</div>
        {agenda.map(([t, a, b], i) => (
          <div key={t} className={'h3-agenda__row' + (i === 0 ? ' is-next' : '')}>
            <span className="fw-num h3-agenda__t">{t}</span>
            <div style={{ minWidth: 0 }}><div className="h3-agenda__a">{a}</div><div className="h3-agenda__b">{b}</div></div>
            {i === 0 && <Badge tone="accent">Next</Badge>}
          </div>
        ))}
        <div className="h3-agenda__row h3-agenda__event">
          <span className="fw-num h3-agenda__t">Thu</span>
          <div style={{ minWidth: 0 }}><div className="h3-agenda__a">Qualifier · Pinehurst No. 2</div><div className="h3-agenda__b">First tee 8:42 · 5 of 6 players ready</div></div>
        </div>
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
  const r = D.rounds[i];
  const score = r.holes.reduce((a, h) => a + h.score, 0), par = r.holes.reduce((a, h) => a + h.par, 0), rel = score - par;
  return (
    <div className="h3-pane">
      <div className="h3-pane__head"><h3>Latest round</h3>
        <div className="h3-pager"><span className="fw-num">{i + 1} of {D.rounds.length}</span>
          <IconButton icon="chevron-left" label="Previous round" size="sm" onClick={() => setI((i + D.rounds.length - 1) % D.rounds.length)} />
          <IconButton icon="chevron-right" label="Next round" size="sm" onClick={() => setI((i + 1) % D.rounds.length)} />
        </div>
      </div>
      <div className="h3-round__top">
        <div className="h3-round__who"><Avatar name={r.player} size={36} /><div><div className="h3-round__name">{r.player}</div><div className="h3-round__meta">{r.meta}</div></div></div>
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

function Figures() {
  const f = [['Team scoring avg', '73.4', '−0.9 vs. previous 10', true], ['Rounds posted', '11', 'of 12 this week'], ['Qualifier ready', '5', 'of 6 · Eli needs two rounds'], ['Greens in regulation', '61%', 'Team · last 10 rounds']];
  return (
    <div className="h3-figs">
      {f.map(([l, v, n, good]) => (
        <div key={l} className="h3-fig"><span className="h3-fig__l">{l}</span><span className="h3-fig__v fw-num">{v}</span><span className={'h3-fig__n' + (good ? ' is-good' : '')}>{n}</span></div>
      ))}
    </div>
  );
}

function Attention({ toast }) {
  const rows = [
    ['Jonah Okafor', 'Sophomore', 'warning', 'Scoring up 2.1', <>Approach from 125–150 yards accounts for most of the rise over his last 7 rounds.</>, 'Plan 1:1', '1:1 with Jonah set for 4:45'],
    ['Eli Brandt', 'Junior', 'warning', 'No rounds in 9 days', <>The qualifier needs two posted rounds this week. He has none yet.</>, 'Send reminder', 'Reminder sent to Eli'],
    ['Priya Natarajan', 'Freshman', 'positive', '4 rounds under average', <>She has beaten her average four times running. Consider her for the fourth spot.</>, 'Review lineup', 'Lineup opened for Thursday'],
  ];
  return (
    <div className="h3-list">
      {rows.map(([name, year, tone, label, why, act, msg]) => (
        <div key={name} className="h3-att">
          <div className="h3-att__who"><Avatar name={name} size={32} /><div><div className="h3-att__name">{name}</div><div className="h3-att__meta">{year}</div></div></div>
          <div className="h3-att__why"><Badge tone={tone} dot>{label}</Badge><p>{why}</p></div>
          <Button size="sm" onClick={() => toast(msg, 'circle-check')}>{act}</Button>
        </div>
      ))}
    </div>
  );
}

function Leaderboard() {
  const rows = [...D.players].sort((a, b) => a.avg - b.avg);
  return (
    <div className="h3-lb" role="table">
      <div className="h3-lb__row h3-lb__head" role="row"><span></span><span>Player</span><span>Last 7 rounds</span><span className="r">Avg</span><span className="r">To par</span><span className="r">SG / rd</span></div>
      {rows.map((p, i) => {
        const rel = Math.round((p.avg - 72) * 10) / 10;
        return (
          <button key={p.id} className="h3-lb__row" role="row">
            <span className="h3-lb__pos fw-num">{i + 1}</span>
            <span className="h3-lb__who"><Avatar name={p.name} size={28} /><span><span className="h3-lb__name">{p.name}</span><span className="h3-lb__meta">{p.year} · {p.statusLabel}</span></span></span>
            <span><FormLine data={p.trend} /></span>
            <span className="r fw-num h3-lb__num">{p.avg.toFixed(1)}</span>
            <span className={'r fw-num h3-lb__num' + (rel < 0 ? ' is-under' : '')}>{toPar(rel)}</span>
            <span className={'r fw-num h3-lb__sg ' + (p.sg >= 0 ? 'is-gain' : 'is-loss')}>{sgn(p.sg)}</span>
          </button>
        );
      })}
    </div>
  );
}

function NowCard() {
  return (
    <div className="h3-now">
      <div className="h3-now__top"><span>Now</span><span>Tue 14 Oct · 68° · wind 6 mph</span></div>
      <div className="h3-now__time fw-num">2:40<small>PM</small></div>
      <div className="h3-now__next">
        <span className="h3-now__at fw-num">3:30</span>
        <div style={{ minWidth: 0 }}><div className="h3-now__a">Short-game block</div><div className="h3-now__b">Practice green · in 50 min</div></div>
        <Icon name="arrow-right" size={15} />
      </div>
    </div>
  );
}

function Sec({ title, meta, action }) {
  return <div className="h3-sec"><div><h2>{title}</h2>{meta && <span>{meta}</span>}</div>{action}</div>;
}

function CoachHomeV3({ toast }) {
  return (
    <main className="h3-main">
      <header className="h3-head">
        <div className="h3-head__copy">
          <span className="h3-head__date">Tuesday, 14 October</span>
          <h1>Good morning, Maya.</h1>
          <p>Two players need a conversation before Thursday's qualifier at Pinehurst. The rest of the team is on track.</p>
          <div className="h3-head__actions"><Button leftIcon="message-square">Message team</Button><Button variant="primary" leftIcon="plus" kbd="N" onClick={() => toast('Session drafted for today', 'circle-check')}>New session</Button></div>
        </div>
      </header>
      <section className="h3-sheet"><Week /><LatestRound /></section>
      <Sec title="Leaderboard" meta="Season scoring average · par 72 · 58 scorecards" action={<Button size="sm" variant="ghost" rightIcon="arrow-right">Full roster</Button>} />
      <Leaderboard />
    </main>
  );
}
window.CoachHomeV3 = CoachHomeV3;
})();
